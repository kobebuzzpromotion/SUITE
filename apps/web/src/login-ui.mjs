/** Invite credentials stay in the password input/one request only; never in URL, logs or browser storage. */
export function mountLogin(api,{sitesMode=false,signInURL='/signin-with-chatgpt?return_to=/',forbidden=false,endedReason=null}={}) {
  const root=document.querySelector('#app');if(!root)throw Error('LOGIN_ROOT_MISSING');
  const lifetime=new AbortController();let pending=false;let disposed=false;
  const loopback=['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)&&['http:','https:'].includes(location.protocol);
  root.innerHTML=`<header class="app-header"><a class="wordmark" href="/">SUITE<span class="wordmark-dot">.</span></a><span class="header-context">INVITED LOCAL TRIAL</span><span class="environment-tag">招待試用 · ローカル限定</span></header><main class="login-workspace"><section class="login-card"><p class="eyebrow">A PRIVATE SPACE FOR YOUR PHOTOGRAPHS</p><h1>招待されたワークスペースへ。</h1><p class="login-intro">招待コードを貼り付けてログインしてください。コードはURLでは受け取らず、localhostの試用サーバーだけへ送信します。</p><form id="invite-login-form"><label for="invite-token">招待コード<input id="invite-token" name="inviteToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="2048" placeholder="招待コードを貼り付け"></label><button class="button primary full" id="invite-login-submit" type="submit" disabled>招待コードでログイン</button></form><p id="invite-login-status" class="control-help" role="status" aria-live="polite"></p><div class="login-boundary"><span class="small-status">INVITED LOCAL TRIAL / NOT PUBLIC</span><p>本番公開・遠隔招待先からの接続・Cloud・課金は、このローカル試用とは別です。人物解析はSDKの通信・同意確認待ちのため停止中です。</p></div></section></main>`;
  const input=root.querySelector('#invite-token'),button=root.querySelector('#invite-login-submit'),status=root.querySelector('#invite-login-status');
  let ended=['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'].includes(endedReason);
  const available=!sitesMode&&!forbidden&&!ended&&loopback&&typeof api?.login==='function'&&typeof api?.getSession==='function';
  if(sitesMode||forbidden){
    root.querySelector('#invite-login-form').hidden=true;
    root.querySelector('.header-context').textContent='INVITED SITES TRIAL';
    root.querySelector('.environment-tag').textContent='招待限定 · ChatGPT サインイン';
    root.querySelector('.login-intro').textContent=forbidden?'403 — サインイン済みですが、この試用への招待権限がありません。招待管理者へ確認してください。':'ChatGPT でサインインし、サーバーで招待権限を確認します。招待コードはこのページへ入力・送信しません。';
    root.querySelector('.login-boundary p').textContent='招待限定の試用です。一般公開・本番 Cloud / 課金・Apple / iPad 実機合格とは別です。人物解析は通信・同意確認待ちで停止中です。';
    if(!forbidden){
      let url;try{url=new URL(signInURL||'/signin-with-chatgpt?return_to=/',location.href);}catch{/* Fail closed on an invalid server route. */}
      if(url?.origin===location.origin&&url.pathname==='/signin-with-chatgpt'){
        const link=document.createElement('a');link.className='button primary full sign-in-link';link.href=url.href;link.target='_self';link.textContent='ChatGPT でサインイン';root.querySelector('#invite-login-form').after(link);
      }else status.textContent='NOT_CONNECTED — サインイン先を安全に確認できません。';
    }
  }
  function update(){button.disabled=pending||ended||!available||!input.value.trim();input.disabled=pending;button.textContent=pending?'ログインを確認中…':'招待コードでログイン';}
  if(!sitesMode&&!forbidden)status.textContent=available?'招待コードは保存・ログ出力しません。':'NOT_CONNECTED — localhostの招待ログインAPIに接続できていません。';
  else if(forbidden)status.textContent='INVITATION_REQUIRED / 403 — Editor と作者操作は開始されていません。';
  if(ended){root.querySelector('#invite-login-form').hidden=true;root.querySelector('.sign-in-link')?.remove();root.querySelector('.login-card h1').textContent=endedReason==='TRIAL_REVOKED'?'試用の招待は取り消されています。':endedReason==='TRIAL_END_NOT_CONFIGURED'?'試用の編集期限が未設定です。':'試用の編集期限を過ぎています。';root.querySelector('.login-intro').textContent='追加編集・書出し・作者操作は停止しています。原本、保存済みRecipe、下書き・提出は削除しません。期限・招待権限について管理者へ確認してください。';status.textContent=`${endedReason} — 試用操作は開始されていません。`;}
  input.addEventListener('input',update,{signal:lifetime.signal});
  root.querySelector('#invite-login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(pending||ended||!available||!input.value.trim())return;
    const inviteToken=input.value.trim();input.value='';pending=true;status.textContent='ログイン応答とサーバーの本人情報を確認しています。';update();
    try {
      await api.login(inviteToken);
      const result=await api.getSession();
      if(result?.mode!=='INVITED_LOCAL_TRIAL'||!result.principal?.id||!result.principal?.authorName)throw Error('TRIAL_SESSION_NOT_ESTABLISHED');
      if(!disposed){status.textContent='サーバーの招待ログインを確認しました。ワークスペースを開きます。';location.assign('/');}
    } catch(error) {
      if(!disposed){if(['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'].includes(error.message)){ended=true;root.querySelector('#invite-login-form').hidden=true;root.querySelector('.login-card h1').textContent='試用は終了・取消、または編集期限が未設定です。';root.querySelector('.login-intro').textContent='追加編集・書出し・作者操作は停止します。原本・保存済みRecipe・提出は削除しません。管理者へ確認してください。';status.textContent=error.message;}else status.textContent='ログインを確認できませんでした。招待コードの有効期限・利用条件を確認して再入力してください。';}
    } finally {pending=false;if(!disposed)update();}
  },{signal:lifetime.signal});
  return()=>{disposed=true;input.value='';lifetime.abort();};
}
