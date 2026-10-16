// Show sign-out only for a server-verified session. Anonymous browser editing
// has no account session to revoke and must not display a dummy action.
export function bindLandingAccount({root,context,trial,navigate,validateSignOutURL}) {
  const logout=root?.querySelector?.('#landing-logout');
  const status=root?.querySelector?.('#landing-account-status');
  const invalidSession=context?.mode==='SITES'&&context?.endedReason==='SESSION_INVALID';
  if((!context?.principal&&!invalidSession)||!logout||!status)return false;
  logout.hidden=false;
  logout.addEventListener('click',async()=>{
    logout.disabled=true;status.hidden=true;
    try{
      if(invalidSession){navigate(validateSignOutURL('/auth/logout?return_to=/'));return;}
      const result=await trial.logout();
      if(context.mode==='SITES')navigate(validateSignOutURL(result?.signOutURL));
      else{
        const check=await trial.getSession();
        if(check?.principal)throw Error('LOGOUT_NOT_CONFIRMED');
        navigate('/login');
      }
    }catch{
      status.textContent='ログアウトできませんでした。編集画面から再試行してください。';
      status.hidden=false;logout.disabled=false;
    }
  });
  return true;
}
