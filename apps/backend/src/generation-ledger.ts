import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {GenerationPricing,generationCanonical,generationToken,generationUnits,generationSHA,GENERATION_MAX_UNITS} from './generation-pricing.js';
import type {GenerationQuote,GenerationRequest} from './generation-pricing.js';

export interface GenerationConsent {
  confirmationID:string; disclosureVersion:string; explicitlyApproved:true;
  maximumCreditUnits:number; confirmedAt:number;
}
export interface GenerationReservation {
  accountID:string; id:string; quoteID:string; requestSHA256:string; consent:GenerationConsent;
}
export type GenerationState='reserved'|'submitting'|'unknown'|'succeeded'|'failed'|'cancelled';
export interface GenerationJob {
  reservation:GenerationReservation; quote:GenerationQuote; state:GenerationState;
  providerJobID:string|null; settlement:GenerationSettlement|null;
}
/** Trusted server worker observation, NEVER accept directly from an HTTP client.
 * Failed means definitive non-delivery; timeout/connection loss must use unknown.
 * Provider cost is independent from fixed user credit charge and can be nonzero
 * for failed requests. Actual over-ceiling provider costs are recorded honestly. */
export interface GenerationSettlement {
  /** Host's stable dispatch ID; does not imply the provider returned a job ID. */
  evidenceID:string; provider:string; model:string; providerJobID:string;
  providerRequestID:string|null;
  requestSHA256:string; outcome:'succeeded'|'failed'; providerCostUnits:number|null;
}
export interface GenerationProviderCost {
  evidenceID:string; provider:string; providerJobID:string;
  currency:string; decimalPlaces:number; units:number;
}
/** Only the local administrative reconciliation service supplies this envelope.
 * It is never decoded from an ordinary user's settlement request. */
export interface GenerationReconciliation {
  auditID:string; auditBody:string;
  output: {png:Uint8Array;sha256:string;providerRequestID:string|null}|null;
}
export function initializeGenerationLedger(db:DatabaseSync):void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_credit_accounts(account_id TEXT PRIMARY KEY,balance INTEGER NOT NULL CHECK(balance>=0),held INTEGER NOT NULL CHECK(held>=0 AND held<=balance));
    CREATE TABLE IF NOT EXISTS generation_credit_grants(account_id TEXT NOT NULL,id TEXT NOT NULL,units INTEGER NOT NULL,PRIMARY KEY(account_id,id));
    CREATE TABLE IF NOT EXISTS generation_quotes(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS generation_jobs(account_id TEXT NOT NULL,id TEXT NOT NULL,quote_id TEXT NOT NULL UNIQUE,body TEXT NOT NULL,state TEXT NOT NULL,provider_job_id TEXT,settlement TEXT,PRIMARY KEY(account_id,id));
    CREATE TABLE IF NOT EXISTS generation_provider_jobs(provider TEXT NOT NULL,job_id TEXT NOT NULL,account_id TEXT NOT NULL,reservation_id TEXT NOT NULL,PRIMARY KEY(provider,job_id));
    CREATE TABLE IF NOT EXISTS generation_provider_requests(provider TEXT NOT NULL,request_id TEXT NOT NULL,account_id TEXT NOT NULL,reservation_id TEXT NOT NULL,PRIMARY KEY(provider,request_id));
    CREATE TABLE IF NOT EXISTS generation_provider_costs(account_id TEXT NOT NULL,reservation_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(account_id,reservation_id));
    CREATE TABLE IF NOT EXISTS generation_reconciliation_audit(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,reservation_id TEXT NOT NULL,body TEXT NOT NULL);
  `);
}
/** Single SQLite transaction per method; no network await inside a transaction.
 * Use a dedicated connection (no surrounding transactions), durable synchronous
 * settings and authenticated account IDs supplied by the server. Storage quota
 * tables are intentionally not reused. No method submits or charges a provider. */
export class GenerationLedger {
  constructor(private readonly db:DatabaseSync,private readonly pricing:GenerationPricing,private readonly now:()=>number=Date.now) {}
  private transaction<T>(run:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value=run(); this.db.exec('COMMIT'); return value; }
    catch(error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  /** Administrative funding only. Route must never expose arbitrary user grants. */
  grant(accountID:string,id:string,units:number):void {
    generationToken(accountID); generationToken(id); generationUnits(units);
    this.transaction(()=>{
      const old=this.db.prepare('SELECT units FROM generation_credit_grants WHERE account_id=? AND id=?').get(accountID,id);
      if(old) { if(old.units!==units) throw new Error('generation-grant-conflict'); return; }
      this.db.prepare('INSERT OR IGNORE INTO generation_credit_accounts VALUES(?,0,0)').run(accountID);
      const changed=this.db.prepare('UPDATE generation_credit_accounts SET balance=balance+? WHERE account_id=? AND balance<=?').run(units,accountID,GENERATION_MAX_UNITS-units);
      if(changed.changes!==1) throw new Error('generation-balance-overflow');
      this.db.prepare('INSERT INTO generation_credit_grants VALUES(?,?,?)').run(accountID,id,units);
    });
  }
  issueQuote(accountID:string,request:GenerationRequest):GenerationQuote {
    const quote=this.pricing.quote(accountID,request,this.now());
    return this.transaction(()=>{this.db.prepare('INSERT INTO generation_quotes VALUES(?,?,?)').run(quote.id,accountID,generationCanonical(quote)); return quote;});
  }
  reserve(value:GenerationReservation):GenerationJob {
    [value.accountID,value.id,value.quoteID,value.consent.confirmationID,value.consent.disclosureVersion].forEach(generationToken);
    generationSHA(value.requestSHA256);
    generationUnits(value.consent.maximumCreditUnits);
    if(value.consent.explicitlyApproved!==true||!Number.isSafeInteger(value.consent.confirmedAt)||value.consent.confirmedAt<0) throw new Error('generation-consent-required');
    const body=generationCanonical(value);
    return this.transaction(()=>{
      const old=this.read(value.accountID,value.id);
      if(old) {if(generationCanonical(old.reservation)!==body) throw new Error('generation-idempotency-conflict'); return old;}
      const quote=this.quote(value.accountID,value.quoteID),now=this.now();
      if(!Number.isSafeInteger(now)||now<quote.issuedAt||now>=quote.expiresAt||value.consent.confirmedAt<quote.issuedAt||value.consent.confirmedAt>now||quote.requestSHA256!==value.requestSHA256||value.consent.maximumCreditUnits<quote.userCreditUnits) throw new Error('generation-quote-or-consent-mismatch');
      const held=this.db.prepare('UPDATE generation_credit_accounts SET held=held+? WHERE account_id=? AND balance-held>=?').run(quote.userCreditUnits,value.accountID,quote.userCreditUnits);
      if(held.changes!==1) throw new Error('generation-insufficient-credit');
      this.db.prepare("INSERT INTO generation_jobs VALUES(?,?,?,?,'reserved',NULL,NULL)").run(value.accountID,value.id,value.quoteID,body);
      return this.required(value.accountID,value.id);
    });
  }
  get(accountID:string,id:string):GenerationJob|null {generationToken(accountID);generationToken(id);return this.transaction(()=>this.read(accountID,id));}
  balance(accountID:string):{balance:number;held:number;available:number} {
    generationToken(accountID); return this.transaction(()=>{const row=this.db.prepare('SELECT balance,held FROM generation_credit_accounts WHERE account_id=?').get(accountID);
      const balance=Number(row?.balance??0),held=Number(row?.held??0); return {balance,held,available:balance-held};});
  }
  /** MUST persist before sending. Only returned true authorizes a first send.
   * false on repeat forbids blind resend; query provider by stable job key. */
  markSubmitting(accountID:string,id:string):boolean {
    return this.transaction(()=>{const job=this.required(accountID,id);
      if(job.state==='submitting'||job.state==='unknown') return false;
      if(job.state!=='reserved') throw new Error('generation-terminal-job');
      this.db.prepare("UPDATE generation_jobs SET state='submitting' WHERE account_id=? AND id=?").run(accountID,id);return true;});
  }
  markUnknown(accountID:string,id:string):void {
    this.transaction(()=>{const job=this.required(accountID,id);
      if(job.state==='unknown') return;
      if(job.state!=='submitting') throw new Error('generation-invalid-transition');
      this.db.prepare("UPDATE generation_jobs SET state='unknown' WHERE account_id=? AND id=?").run(accountID,id);});
  }
  cancelUnsubmitted(accountID:string,id:string):void {
    this.transaction(()=>{const job=this.required(accountID,id);if(job.state==='cancelled') return;
      if(job.state!=='reserved') throw new Error('generation-outcome-not-known');
      this.release(job,false); this.db.prepare("UPDATE generation_jobs SET state='cancelled' WHERE account_id=? AND id=?").run(accountID,id);});
  }
  settle(accountID:string,id:string,result:GenerationSettlement,reconciliation?:GenerationReconciliation):GenerationJob {
    [result.evidenceID,result.provider,result.model,result.providerJobID].forEach(generationToken);
    generationSHA(result.requestSHA256);
    if(result.providerCostUnits!==null) generationUnits(result.providerCostUnits);
    if(result.providerRequestID!==null) generationToken(result.providerRequestID);
    if(result.outcome!=='succeeded'&&result.outcome!=='failed') throw new Error('generation-invalid-outcome');
    const body=generationCanonical(result);
    return this.transaction(()=>{const job=this.required(accountID,id);
      if(reconciliation) {
        generationToken(reconciliation.auditID);
        if(typeof reconciliation.auditBody!=='string'||Buffer.byteLength(reconciliation.auditBody)>2*1024*1024) throw new Error('generation-audit-size');
        const priorAudit=this.db.prepare('SELECT * FROM generation_reconciliation_audit WHERE id=?').get(reconciliation.auditID);
        if(priorAudit&&(priorAudit.account_id!==accountID||priorAudit.reservation_id!==id||priorAudit.body!==reconciliation.auditBody)) throw new Error('generation-audit-conflict');
        const output=reconciliation.output;
        if(result.outcome==='succeeded') {
          if(!output||output.png.byteLength<33||output.png.byteLength>32*1024*1024||
             createHash('sha256').update(output.png).digest('hex')!==output.sha256||result.evidenceID!=='output-'+output.sha256||
             result.providerRequestID!==output.providerRequestID) throw new Error('generation-audit-output-mismatch');
          const previous=this.db.prepare('SELECT png,sha,provider_request_id FROM generation_outputs WHERE account_id=? AND job_id=?').get(accountID,id);
          if(previous) {
            if(!(previous.png instanceof Uint8Array)||!Buffer.from(previous.png).equals(Buffer.from(output.png))||previous.sha!==output.sha256||previous.provider_request_id!==output.providerRequestID) throw new Error('generation-output-conflict');
          } else this.db.prepare('INSERT INTO generation_outputs VALUES(?,?,?,?,?)').run(accountID,id,output.png,output.sha256,output.providerRequestID);
        } else {
          if(output||this.db.prepare('SELECT 1 FROM generation_outputs WHERE account_id=? AND job_id=?').get(accountID,id)) throw new Error('generation-failure-has-output');
        }
        if(!priorAudit)this.db.prepare('INSERT INTO generation_reconciliation_audit VALUES(?,?,?,?)').run(reconciliation.auditID,accountID,id,reconciliation.auditBody);
      }
      if(job.settlement) {if(generationCanonical(job.settlement)!==body) throw new Error('generation-settlement-conflict'); return job;}
      if(!['submitting','unknown'].includes(job.state)||job.quote.provider!==result.provider||job.quote.model!==result.model||job.quote.requestSHA256!==result.requestSHA256) throw new Error('generation-response-mismatch');
      const prior=this.db.prepare('SELECT account_id,reservation_id FROM generation_provider_jobs WHERE provider=? AND job_id=?').get(result.provider,result.providerJobID);
      if(prior&&(prior.account_id!==accountID||prior.reservation_id!==id)) throw new Error('generation-provider-job-conflict');
      this.db.prepare('INSERT OR IGNORE INTO generation_provider_jobs VALUES(?,?,?,?)').run(result.provider,result.providerJobID,accountID,id);
      if(result.providerRequestID!==null) {
        const request=this.db.prepare('SELECT account_id,reservation_id FROM generation_provider_requests WHERE provider=? AND request_id=?').get(result.provider,result.providerRequestID);
        if(request&&(request.account_id!==accountID||request.reservation_id!==id)) throw new Error('generation-provider-request-conflict');
        this.db.prepare('INSERT OR IGNORE INTO generation_provider_requests VALUES(?,?,?,?)').run(result.provider,result.providerRequestID,accountID,id);
      }
      this.release(job,result.outcome==='succeeded');
      this.db.prepare('UPDATE generation_jobs SET state=?,provider_job_id=?,settlement=? WHERE account_id=? AND id=?').run(result.outcome,result.providerJobID,body,accountID,id);
      return this.required(accountID,id);
    });
  }
  /** Trusted billing reconciliation only. No exchange rate, provider-cost
   * estimate, extra user debit or release of an unknown reservation. One final
   * actual-cost observation per job; discrepant corrections need separate review. */
  recordProviderCost(accountID:string,id:string,cost:GenerationProviderCost):void {
    [cost.evidenceID,cost.provider,cost.providerJobID].forEach(generationToken);generationUnits(cost.units);
    const body=generationCanonical(cost);
    this.transaction(()=>{
      const job=this.required(accountID,id);
      if(!job.settlement||job.settlement.provider!==cost.provider||job.settlement.providerJobID!==cost.providerJobID||
        cost.currency!==job.quote.providerCurrency||cost.decimalPlaces!==job.quote.providerDecimalPlaces||
        (job.settlement.providerCostUnits!==null&&job.settlement.providerCostUnits!==cost.units)) throw new Error('generation-cost-evidence-mismatch');
      const prior=this.db.prepare('SELECT body FROM generation_provider_costs WHERE account_id=? AND reservation_id=?').get(accountID,id);
      if(prior) {if(prior.body!==body) throw new Error('generation-cost-conflict');return;}
      this.db.prepare('INSERT INTO generation_provider_costs VALUES(?,?,?)').run(accountID,id,body);
    });
  }
  providerCost(accountID:string,id:string):GenerationProviderCost|null {
    return this.transaction(()=>{this.required(accountID,id);const row=this.db.prepare('SELECT body FROM generation_provider_costs WHERE account_id=? AND reservation_id=?').get(accountID,id);return row?JSON.parse(String(row.body)) as GenerationProviderCost:null;});
  }
  private release(job:GenerationJob,charge:boolean):void {
    const units=job.quote.userCreditUnits;
    const result=this.db.prepare('UPDATE generation_credit_accounts SET held=held-?,balance=balance-? WHERE account_id=? AND held>=? AND balance>=?').run(units,charge?units:0,job.reservation.accountID,units,units);
    if(result.changes!==1) throw new Error('generation-ledger-inconsistent');
  }
  private quote(accountID:string,id:string):GenerationQuote {
    const row=this.db.prepare('SELECT body FROM generation_quotes WHERE id=? AND account_id=?').get(id,accountID);
    if(!row) throw new Error('generation-quote-not-found');return JSON.parse(String(row.body)) as GenerationQuote;
  }
  private read(accountID:string,id:string):GenerationJob|null {
    const row=this.db.prepare('SELECT * FROM generation_jobs WHERE account_id=? AND id=?').get(accountID,id);if(!row)return null;
    return {reservation:JSON.parse(String(row.body)),quote:this.quote(accountID,String(row.quote_id)),state:row.state as GenerationState,
      providerJobID:row.provider_job_id===null?null:String(row.provider_job_id),settlement:row.settlement===null?null:JSON.parse(String(row.settlement))};
  }
  private required(accountID:string,id:string):GenerationJob {generationToken(accountID);generationToken(id);const job=this.read(accountID,id);if(!job)throw new Error('generation-job-not-found');return job;}
}
