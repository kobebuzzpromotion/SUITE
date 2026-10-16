import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {GenerationLedger} from './generation-ledger.js';
import type {GenerationJob} from './generation-ledger.js';
import {generationCanonical,generationSHA,generationToken} from './generation-pricing.js';

export interface GenerationReview {
  schemaVersion:1; auditID:string; operatorID:string; reviewedAt:number;
  accountID:string; jobID:string; provider:string; model:string;
  pricingVersion:string; requestSHA256:string; inputSHA256:string; payloadSHA256:string;
  sourceReference:string; sourceSHA256:string; providerRequestID:string|null;
  outcome:'succeeded'|'failed'; outputSHA256:string|null;
  /** Human attestation after reviewing real provider records. It is not a
   * provider signature and must never be accepted through a public user route. */
  providerEvidenceReviewed:true;
  definitiveOutcomeConfirmed:true;
  explanation:string;
}
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const fields=['schemaVersion','auditID','operatorID','reviewedAt','accountID','jobID','provider','model','pricingVersion',
  'requestSHA256','inputSHA256','payloadSHA256','sourceReference','sourceSHA256','providerRequestID',
  'outcome','outputSHA256','providerEvidenceReviewed','definitiveOutcomeConfirmed','explanation'];

/** Local DB-administrator service. Host authentication is possession of the
 * restricted ledger database plus operator identity supplied by the trusted CLI.
 * No provider request, timeout inference, funding or Original/Recipe mutation. */
export class GenerationReconciliationService {
  constructor(db:DatabaseSync,private readonly ledger:GenerationLedger) {
    // Same immutable output table used by GenerationHTTP, not a second output store.
    db.exec('CREATE TABLE IF NOT EXISTS generation_outputs(account_id TEXT NOT NULL,job_id TEXT NOT NULL,png BLOB NOT NULL,sha TEXT NOT NULL,provider_request_id TEXT,PRIMARY KEY(account_id,job_id));');
  }
  reconcile(raw:unknown,proof:Uint8Array,png:Uint8Array|null,operatorID:string,now:number):GenerationJob {
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==[...fields].sort().join(',')) throw new Error('generation-review-fields');
    const r=raw as GenerationReview;
    [r.auditID,r.operatorID,r.jobID,r.provider,r.model,r.pricingVersion,r.sourceReference,operatorID].forEach(generationToken);
    [r.accountID,r.requestSHA256,r.inputSHA256,r.payloadSHA256,r.sourceSHA256].forEach(generationSHA);
    if(r.schemaVersion!==1||r.operatorID!==operatorID||r.providerEvidenceReviewed!==true||r.definitiveOutcomeConfirmed!==true||
       !Number.isSafeInteger(now)||!Number.isSafeInteger(r.reviewedAt)||r.reviewedAt<0||r.reviewedAt>now||
       typeof r.explanation!=='string'||!r.explanation.trim()||r.explanation.length>4096||
       !proof.byteLength||proof.byteLength>1024*1024||hash(proof)!==r.sourceSHA256) throw new Error('generation-review-not-confirmed');
    if(r.providerRequestID!==null)generationToken(r.providerRequestID);
    const job=this.ledger.get(r.accountID,r.jobID);
    if(!job||r.reviewedAt<job.quote.issuedAt||job.quote.provider!==r.provider||job.quote.model!==r.model||job.quote.pricingVersion!==r.pricingVersion||
       job.quote.requestSHA256!==r.requestSHA256||job.quote.inputSHA256!==r.inputSHA256||job.quote.payloadSHA256!==r.payloadSHA256||
       !['submitting','unknown','succeeded','failed'].includes(job.state)) throw new Error('generation-review-binding');
    let output:null|{png:Uint8Array;sha256:string;providerRequestID:string|null}=null;
    if(r.outcome==='succeeded') {
      if(!png||png.byteLength<45||png.byteLength>32*1024*1024||r.outputSHA256===null)throw new Error('generation-review-output-required');
      generationSHA(r.outputSHA256);
      const bytes=Buffer.from(png);
      if(hash(bytes)!==r.outputSHA256||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
         bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)<1||bytes.readUInt32BE(20)<1||
         bytes.readUInt32BE(16)>8_000_000/bytes.readUInt32BE(20))throw new Error('generation-review-output-invalid');
      output={png:bytes,sha256:r.outputSHA256,providerRequestID:r.providerRequestID};
    } else if(r.outcome!=='failed'||png!==null||r.outputSHA256!==null) throw new Error('generation-review-not-definitive');
    // Atomic audit + output + settlement. Review and proof remain immutable; a
    // different body under the same audit/job cannot silently reverse a decision.
    const auditBody=generationCanonical({review:r,proofBase64:Buffer.from(proof).toString('base64'),kind:'operator-reviewed-provider-evidence'});
    return this.ledger.settle(r.accountID,r.jobID,{
      evidenceID:output?'output-'+output.sha256:'review-'+r.auditID,
      provider:r.provider,model:r.model,providerJobID:'suite-'+hash(JSON.stringify([r.accountID,r.jobID])),
      providerRequestID:r.providerRequestID,requestSHA256:r.requestSHA256,outcome:r.outcome,providerCostUnits:null
    },{auditID:r.auditID,auditBody,output});
  }
}
