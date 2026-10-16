import type {IncomingMessage, ServerResponse} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import type {Principal} from './auth.js';
import type {AssetRepository} from './repository.js';
import {GenerationPricing, type GenerationPrice} from './generation-pricing.js';
import {GenerationLedger, initializeGenerationLedger, type GenerationConsent, type GenerationJob} from './generation-ledger.js';
import {prepareGenerationEdit, validateGenerationPayload, type GenerationProviderPolicy} from './generation-provider.js';

export interface GenerationServerConfiguration {
  prices: GenerationPrice[]; policies: GenerationProviderPolicy[];
  disclosureVersion: string; quoteLifetimeMilliseconds: number;
}
interface Binding {assetID: string; originalSHA256: string; recipeRevision: number}
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
function reply(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(value));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_GENERATION_BODY');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).sort().join(',') !== fields.sort().join(',')) throw new Error('INVALID_GENERATION_FIELDS');
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {size += chunk.length; if (size > 26*1024*1024) throw new Error('INVALID_GENERATION_SIZE'); chunks.push(Buffer.from(chunk));}
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
function base64(value: unknown, maximum: number): Buffer {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(maximum/3)*4 ||
      value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) throw new Error('INVALID_GENERATION_BASE64');
  const bytes = Buffer.from(value,'base64'); if (bytes.length > maximum || bytes.toString('base64') !== value) throw new Error('INVALID_GENERATION_SIZE'); return bytes;
}

/** Optional personal-account route. Managed workspaces must be refused by the
 * enclosing server until workspace roles/credit ownership are explicitly wired.
 * No funding/admin/settlement endpoints are exposed to clients. */
export class GenerationHTTP {
  private readonly db: DatabaseSync;
  private readonly ledger: GenerationLedger;
  private readonly configuration: GenerationServerConfiguration;
  constructor(path: string, private readonly repo: AssetRepository,
    configuration: GenerationServerConfiguration, private readonly apiKey: string | undefined) {
    this.configuration = structuredClone(configuration);
    if (!configuration.disclosureVersion || configuration.disclosureVersion.length > 256 ||
        !Array.isArray(configuration.policies) || configuration.policies.length > 256) throw new Error('INVALID_GENERATION_CONFIG');
    const seen = new Set<string>();
    for (const policy of configuration.policies) {
      if (!policy.model || seen.has(policy.model) || !Array.isArray(policy.sizes) || !policy.sizes.length ||
          !Array.isArray(policy.qualities) || !policy.qualities.length ||
          [...policy.sizes,...policy.qualities].some(v => typeof v !== 'string' || !v || v.length > 128)) throw new Error('INVALID_GENERATION_CONFIG');
      seen.add(policy.model);
    }
    const pricing = new GenerationPricing(configuration.prices,configuration.quoteLifetimeMilliseconds);
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    initializeGenerationLedger(this.db);
    this.db.exec(`CREATE TABLE IF NOT EXISTS generation_photo_bindings(quote_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_outputs(account_id TEXT NOT NULL,job_id TEXT NOT NULL,png BLOB NOT NULL,sha TEXT NOT NULL,provider_request_id TEXT,PRIMARY KEY(account_id,job_id));`);
    this.ledger = new GenerationLedger(this.db,pricing);
  }
  close() {this.db.close();}
  private account(p: Principal) {return sha(JSON.stringify([p.tenantId,p.subject]));}
  private validateBinding(p: Principal, value: unknown): Binding {
    const b = object(value); exact(b,['assetID','originalSHA256','recipeRevision']);
    if (typeof b.assetID !== 'string' || typeof b.originalSHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(b.originalSHA256) ||
        !Number.isSafeInteger(b.recipeRevision) || (b.recipeRevision as number) < 0) throw new Error('INVALID_GENERATION_BINDING');
    const asset = this.repo.get(p.tenantId,b.assetID), recipe = this.repo.latestRecipe(p.tenantId,b.assetID);
    if (asset.sha256 !== b.originalSHA256 || (recipe?.revision ?? 0) !== b.recipeRevision) throw new Error('REVISION_CONFLICT');
    return {assetID:b.assetID,originalSHA256:b.originalSHA256,recipeRevision:b.recipeRevision as number};
  }
  private binding(account: string, quoteID: string): Binding {
    const row = this.db.prepare('SELECT body FROM generation_photo_bindings WHERE quote_id=? AND account_id=?').get(quoteID,account);
    if (!row) throw new Error('NOT_FOUND'); return JSON.parse(String(row.body)) as Binding;
  }
  private policy(model: unknown) {
    const policy = this.configuration.policies.find(p => p.model === model);
    if (!policy) throw new Error('GENERATION_UNCONFIGURED'); return policy;
  }
  private settleSaved(account: string, id: string, job: GenerationJob): GenerationJob {
    const saved = this.db.prepare('SELECT png,sha,provider_request_id FROM generation_outputs WHERE account_id=? AND job_id=?').get(account,id);
    if (!saved) return job;
    if (!(saved.png instanceof Uint8Array) || sha(saved.png) !== saved.sha) throw new Error('GENERATION_OUTPUT_INTEGRITY');
    return this.ledger.settle(account,id,{evidenceID:`output-${saved.sha}`,provider:job.quote.provider,model:job.quote.model,
      providerJobID:`suite-${sha(JSON.stringify([account,id]))}`,providerRequestID:saved.provider_request_id===null?null:String(saved.provider_request_id),
      requestSHA256:job.quote.requestSHA256,outcome:'succeeded',providerCostUnits:null});
  }
  async handle(req: IncomingMessage,res: ServerResponse,url: URL,p: Principal): Promise<boolean> {
    if (!url.pathname.startsWith('/v1/generation/')) return false;
    const account = this.account(p);
    try {
      if (url.pathname === '/v1/generation/quote' && req.method === 'POST') {
        const b=await body(req); exact(b,['binding','inputSHA256','payloadBase64']);
        const binding=this.validateBinding(p,b.binding), payload=base64(b.payloadBase64,4*1024*1024);
        const parsed=object(JSON.parse(payload.toString('utf8'))); validateGenerationPayload(parsed,this.policy(parsed.model));
        if (typeof b.inputSHA256!=='string') throw new Error('INVALID_GENERATION_HASH');
        const quote=this.ledger.issueQuote(account,{provider:'openai',model:parsed.model as string,inputSHA256:b.inputSHA256,payloadSHA256:sha(payload)});
        this.db.prepare('INSERT INTO generation_photo_bindings VALUES(?,?,?)').run(quote.id,account,JSON.stringify(binding));
        reply(res,201,{quote,disclosureVersion:this.configuration.disclosureVersion,kind:'server-configured-flat-tariff'}); return true;
      }
      if (url.pathname === '/v1/generation/reserve' && req.method === 'POST') {
        const b=await body(req); exact(b,['id','quoteID','requestSHA256','consent']);
        if (typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(b.id)||typeof b.quoteID!=='string'||typeof b.requestSHA256!=='string') throw new Error('INVALID_GENERATION_RESERVATION');
        const consent=object(b.consent); exact(consent,['confirmationID','disclosureVersion','explicitlyApproved','maximumCreditUnits','confirmedAt']);
        if (consent.disclosureVersion!==this.configuration.disclosureVersion) throw new Error('INVALID_GENERATION_DISCLOSURE');
        this.validateBinding(p,this.binding(account,b.quoteID));
        reply(res,200,this.ledger.reserve({accountID:account,id:b.id,quoteID:b.quoteID,requestSHA256:b.requestSHA256,consent:consent as unknown as GenerationConsent})); return true;
      }
      const match=/^\/v1\/generation\/jobs\/([a-zA-Z0-9_-]{1,128})(?:\/(submit|output|cancel))?$/.exec(url.pathname);
      if (!match) {reply(res,404,{error:'NOT_FOUND'}); return true;}
      const id=match[1]!,action=match[2],job=this.ledger.get(account,id);
      if (!job) throw new Error('NOT_FOUND');
      const binding=this.binding(account,job.quote.id);
      // A saved candidate can be retrieved after further editing, but never silently adopted.
      this.repo.get(p.tenantId,binding.assetID);
      // Status is the only safe recovery operation after an uncertain submission.
      // Reconcile a durable output here too: clients must not POST submit again
      // merely to settle a candidate saved immediately before a server restart.
      if (!action && req.method==='GET') {reply(res,200,{job:this.settleSaved(account,id,job),binding}); return true;}
      if (action==='cancel' && req.method==='POST') {this.ledger.cancelUnsubmitted(account,id);reply(res,200,{job:this.ledger.get(account,id)});return true;}
      if (action==='output' && req.method==='GET') {
        const row=this.db.prepare('SELECT png,sha FROM generation_outputs WHERE account_id=? AND job_id=?').get(account,id);
        if (!row || !(row.png instanceof Uint8Array) || sha(row.png)!==row.sha) throw new Error('NOT_FOUND');
        res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':row.png.byteLength});res.end(row.png);return true;
      }
      if (action==='submit' && req.method==='POST') {
        // Recover an output persisted before a process interruption; never re-send it.
        if (job.state!=='reserved') {reply(res,200,{job:this.settleSaved(account,id,job),binding});return true;}
        this.validateBinding(p,binding);
        const b=await body(req);exact(b,['inputBase64','payloadBase64']);
        const input=base64(b.inputBase64,14*1024*1024),payload=base64(b.payloadBase64,4*1024*1024);
        const prepared=prepareGenerationEdit(input,payload,job.quote,this.policy(job.quote.model),this.apiKey);
        this.validateBinding(p,binding);
        if (!this.ledger.markSubmitting(account,id)) {reply(res,202,{job:this.ledger.get(account,id)});return true;}
        try {
          const result=await prepared.send();
          // Candidate-only durable save. Never overwrite Original or current Recipe.
          this.db.prepare('INSERT INTO generation_outputs VALUES(?,?,?,?,?)').run(account,id,result.png,result.sha256,result.providerRequestID);
          const completed=this.settleSaved(account,id,job);
          reply(res,200,{job:completed,binding,outputSHA256:result.sha256,adopted:false});
        } catch {
          const latest=this.ledger.get(account,id);
          if (latest?.state==='submitting') this.ledger.markUnknown(account,id);
          reply(res,202,{job:this.ledger.get(account,id),message:'結果未確定。再送・予約解放は行いません。'});
        }
        return true;
      }
      reply(res,405,{error:'METHOD_NOT_ALLOWED'});return true;
    } catch(error) {
      if (res.headersSent) {res.destroy();return true;}
      const message=error instanceof Error?error.message:'';
      const status=message==='NOT_FOUND'?404:message==='REVISION_CONFLICT'?409:/^(INVALID|generation-)/.test(message)||error instanceof SyntaxError?400:503;
      reply(res,status,{error:status===503?'GENERATION_UNAVAILABLE':message});return true;
    }
  }
}
