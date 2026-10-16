import {openSync,closeSync,fstatSync,readFileSync,realpathSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {GenerationPricing,generationToken} from './generation-pricing.js';
import {GenerationLedger,initializeGenerationLedger} from './generation-ledger.js';
import {GenerationReconciliationService} from './generation-reconciliation.js';

function localFile(path:string,maximum:number):Buffer {
  const absolute=resolve(path);
  if(realpathSync(absolute)!==absolute)throw new Error('generation-review-symlink');
  const fd=openSync(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {const s=fstatSync(fd);if(!s.isFile()||s.size<1||s.size>maximum)throw new Error('generation-review-file-size');
    const bytes=readFileSync(fd);if(bytes.length!==s.size||bytes.length>maximum)throw new Error('generation-review-file-changed');return bytes;
  } finally {closeSync(fd);}
}
/** OS-restricted administrative command. Never run this from a user HTTP route.
 * Usage: .../generation-reconcile-cli.js DB OPERATOR REVIEW.json PROOF [OUTPUT.png]
 * Keep DB and evidence access restricted; OPERATOR is audit attribution, not an
 * authentication credential. Only a real reviewed provider outcome is admissible.
 * No success/failure is inferred from elapsed time or absent provider records. */
export function runGenerationReconciliation(args:string[]):void {
  if(args.length<4||args.length>5)throw new Error('usage: DB OPERATOR REVIEW.json PROOF [OUTPUT.png]');
  const [path,operator,reviewPath,proofPath,outputPath]=args;
  generationToken(operator!);
  const database=resolve(path!);
  if(realpathSync(database)!==database)throw new Error('generation-review-database-path');
  const fd=openSync(database,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {if(!fstatSync(fd).isFile())throw new Error('generation-review-database-file');} finally {closeSync(fd);}
  const raw=JSON.parse(localFile(reviewPath!,64*1024).toString('utf8')) as unknown;
  const proof=localFile(proofPath!,1024*1024),png=outputPath?localFile(outputPath,32*1024*1024):null;
  const db=new DatabaseSync(database);
  try {
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generation_jobs'").get())throw new Error('generation-review-not-ledger-database');
    db.exec('PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');initializeGenerationLedger(db);
    // No tariff or model is invented. Reconciliation uses only existing quotes.
    const ledger=new GenerationLedger(db,new GenerationPricing([],1));
    const job=new GenerationReconciliationService(db,ledger).reconcile(raw,proof,png,operator!,Date.now());
    process.stdout.write(JSON.stringify({id:job.reservation.id,state:job.state,providerCost:'unobserved'})+'\n');
  } finally {db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {runGenerationReconciliation(process.argv.slice(2));}
  catch(error) {process.stderr.write((error instanceof Error?error.message:'generation-review-failed')+'\n');process.exitCode=1;}
}
