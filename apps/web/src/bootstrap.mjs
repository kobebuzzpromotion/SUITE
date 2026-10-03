import {EditorSession} from './session.mjs';
import {APIClient,BrowserDraftStore} from './api-client.mjs';
import {createProcessing} from './processing/index.mjs';
import {mountEditor} from './editor-ui.mjs';
import {mountLogin} from './login-ui.mjs';
import {TrialClient} from './trial-client.mjs';
import {SitesClient} from './sites-client.mjs';
import {BrowserLocalAPI} from './browser-local-api.mjs';
import {mountAdminLogin} from './admin-login-ui.mjs';
const trial=new TrialClient();let context;
try{context=await trial.getSession();}catch(e){
  // A failed cloud session must not turn anonymous, browser-only editing into a fake cloud login.
  context={mode:'PUBLIC_BROWSER_LOCAL',principal:null,cloudAccessReason:e.message};
}
if(context?.mode==='LOCAL_QA')context=undefined;
const anonymousLocal=context?.mode==='PUBLIC_BROWSER_LOCAL'||context?.mode==='SITES'&&!context.principal;
const adminView=new URLSearchParams(location.search).get('view')==='admin';
if(adminView&&context?.mode==='SITES'&&(!context.principal||context.principal.role!=='admin'||context.adminPasswordAuthenticated!==true)){
  mountAdminLogin(trial,{principal:context.principal,adminCandidate:context.adminCandidate,signInURL:context.signInURL});
}else if(context&&!context.principal&&!anonymousLocal){mountLogin(trial,{sitesMode:context.mode==='SITES',signInURL:context.signInURL,endedReason:context.endedReason});}
else{
  const api=anonymousLocal?new BrowserLocalAPI():context?.mode==='SITES'?new SitesClient():context?trial:new APIClient();
  const session=new EditorSession({api,processing:createProcessing(),storage:new BrowserDraftStore(anonymousLocal?'public-browser-local':context?.principal?.id||'local-qa')});
  mountEditor(session,anonymousLocal?{trialSession:{mode:'PUBLIC_BROWSER_LOCAL',principal:null,endedReason:context?.endedReason,...(context?.mode==='SITES'?{signInURL:context.signInURL}:{})},authorAPI:null}:context?{trialSession:context,authorAPI:api}:{});
  session.initialize().catch(()=>{});
  window.addEventListener('beforeunload',event=>{if(session.state.dirty){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>session.cancelExport());
}
