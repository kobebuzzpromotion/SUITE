/** Admin password exists only in this form and one HTTPS request; it is never persisted. */
export function mountAdminLogin(client,{principal=null,adminCandidate=false,signInURL='/signin-with-chatgpt?return_to=/'}={}){
  const root=document.querySelector('#app');if(!root)throw Error('ADMIN_LOGIN_ROOT_MISSING');
  root.replaceChildren();const main=document.createElement('main');main.className='login-workspace';
  const card=document.createElement('section');card.className='login-card';
  const title=document.createElement('h1');title.textContent='SUITE 管理者';card.append(title);
  const help=document.createElement('p');help.className='login-intro';card.append(help);
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');card.append(status);
  if(!principal&&!adminCandidate){
    help.textContent='管理者本人として認証してください。一般の写真編集はログイン不要で、トップページから使えます。';
    const link=document.createElement('a');link.className='button primary full';link.textContent='管理者本人確認へ';
    const url=new URL(signInURL,location.href);if(url.origin!==location.origin||!['/signin-with-chatgpt','/auth/complete'].includes(url.pathname)||url.searchParams.get('return_to')!=='/'||[...url.searchParams.keys()].length!==1)throw Error('ADMIN_SIGNIN_ROUTE_INVALID');
    link.href=url.href;card.append(link);
  }else if(principal&&principal.role!=='admin'){
    help.textContent='このアカウントに管理者権限はありません。';status.textContent='FORBIDDEN';
  }else{
    help.textContent='管理者の追加パスワードを入力してください。写真・提出データへの権限はサーバー側で確認します。';
    const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');
    label.textContent='管理者パスワード';input.type='password';input.required=true;input.autocomplete='current-password';input.maxLength=1024;button.type='submit';button.className='button primary full';button.textContent='管理者として続行';label.append(input);form.append(label,button);card.append(form);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(button.disabled)return;button.disabled=true;const password=input.value;input.value='';status.textContent='サーバーで確認中…';
      try{await client.request('/trial/admin/login',{method:'POST',body:{password}});const session=await client.getSession();if(session?.adminPasswordAuthenticated!==true)throw Error('ADMIN_SESSION_NOT_ESTABLISHED');location.assign('/?view=admin');}
      catch(error){status.textContent=error.message==='ADMIN_PASSWORD_INVALID'?'パスワードを確認できませんでした。':'管理者認証は利用できません: '+String(error.message||error);}
      finally{button.disabled=false;}
    });
  }
  main.append(card);root.append(main);
}
