import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const port=Number(process.argv[2]??8879);
const allowed=['/apps/web/src/','/apps/web/tests/fixtures/','/apps/web/preset-policy.mjs','/dist/apps/backend/src/'];
const types={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if(!allowed.some(prefix=>pathname.startsWith(prefix))||!Object.hasOwn(types,pathname.slice(pathname.lastIndexOf('.')))){
    console.warn('FIXTURE_ROUTE_BLOCKED',pathname);response.writeHead(404);response.end();return;
  }
  const target=resolve(root,`.${decodeURIComponent(pathname)}`);
  if(!target.startsWith(`${root}${sep}`)){response.writeHead(404);response.end();return;}
  try{const data=await readFile(target);response.writeHead(200,{'content-type':types[pathname.slice(pathname.lastIndexOf('.'))],'cache-control':'no-store'});response.end(data);}
  catch{console.warn('FIXTURE_FILE_MISSING',pathname);response.writeHead(404);response.end();}
}).listen(port,'127.0.0.1',()=>console.log(`READY http://127.0.0.1:${port}/apps/web/tests/fixtures/local-levels-browser.html`));
