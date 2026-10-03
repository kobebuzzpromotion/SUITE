import {InviteAuth} from './invite-auth.mjs';
import {mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
// Local operator console only. It never sends email or provisions a Cloud account.
const [command,...args]=process.argv.slice(2);
if(!command||command==='help'){
  console.log('Local invited trial operator:\ncreate <authorName> <author|admin> <explicit ISO trial end>\ninvite <authorID> <explicit ISO trial end>\nend <invitationID> <explicit ISO trial end>\nrevoke <invitationID>\nlist\nSUITE_TRIAL_DATA_DIR optionally selects the local data directory.\ncreate/invite prints a single-use secret to the operator console; do not put it in Evidence, source control or screenshots.');
}else{
  const dir=resolve(process.env.SUITE_TRIAL_DATA_DIR||'.runtime/web-trial');mkdirSync(dir,{recursive:true});const auth=new InviteAuth(join(dir,'auth.sqlite'));
  try{
    let result;
    if(command==='create'&&args.length===3){const author=auth.createAuthor({authorName:args[0],role:args[1],trialEndsAt:args[2]});result={author,invitation:auth.issueInvite(author.id,{trialEndsAt:args[2]})};}
    else if(command==='invite'&&args.length===2)result=auth.issueInvite(args[0],{trialEndsAt:args[1]});
    else if(command==='end'&&args.length===2){auth.setInviteTrialEnd(...args);result={updated:true,invitationID:args[0]};}
    else if(command==='revoke'&&args.length===1){auth.revokeInvite(args[0]);result={revoked:true,invitationID:args[0]};}
    else if(command==='list'&&args.length===0)result=auth.listInvitations();
    else throw Error('INVALID_OPERATOR_ARGUMENTS');
    console.log(JSON.stringify(result,null,2));
  }finally{auth.close();}
}
