import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {InviteAuth} from '../apps/web/invite-auth.mjs';
// Explicit local UI test identity, no RAW/preset data and no external recipient.
// The generated one-use credential is ignored runtime data, not public Evidence.
const directory=resolve('.runtime/web-trial');mkdirSync(directory,{recursive:true});
const auth=new InviteAuth(join(directory,'auth.sqlite'));
try{
  const author=auth.createAuthor({authorName:'LOCAL UI QA',role:'admin',trialEndsAt:'2026-10-04T14:00:00.000Z'});
  const invitation=auth.issueInvite(author.id,{trialEndsAt:author.trialEndsAt});
  writeFileSync(resolve('.runtime/ui-qa-invitation.json'),JSON.stringify({authorID:author.id,invitationID:invitation.invitationID,inviteToken:invitation.inviteToken}),{flag:'wx'});
  console.log(JSON.stringify({scope:'LOCAL_NON_RAW_UI_TEST_IDENTITY',authorID:author.id,invitationID:invitation.invitationID,trialEndsAt:author.trialEndsAt,secret:'REDACTED; temporary ignored runtime file for local browser QA only'}));
}finally{auth.close();}
