import {APIClient} from './api-client.mjs';
export class TrialClient extends APIClient {
  constructor(options={}){super({...options,requestHeader:'X-Suite-Trial'});}
  getSession(){return this.request('/trial/session');}
  login(inviteToken){return this.request('/trial/login',{method:'POST',body:{inviteToken}});}
  logout(){return this.request('/trial/logout',{method:'POST',body:{}});}
  async listDrafts(){return (await this.request('/trial/drafts')).drafts;}
  createDraft(input){return this.request('/trial/drafts',{method:'POST',body:input});}
  saveDraft(id,input){return this.request('/trial/drafts/'+id,{method:'PUT',body:input});}
  submitDraft(id,input){return this.request('/trial/drafts/'+id+'/submit',{method:'POST',body:input});}
  async listSubmitted(){return (await this.request('/trial/submissions')).submissions;}
  reviewDraft(id,input){return this.request('/trial/drafts/'+id+'/review',{method:'POST',body:input});}
  async listPresets(){return (await this.request('/trial/presets')).presets;}
  async assertPermission(assetID,action){const r=await this.request('/trial/authorize',{method:'POST',body:{assetID,action}});if(r.authorized!==true)throw Error('TRIAL_PERMISSION_DENIED');return r;}
  async listMembers(){return (await this.request('/trial/members')).members;}
  createMember(input){return this.request('/trial/members',{method:'POST',body:input});}
  updateMember(id,input){return this.request('/trial/members/'+id,{method:'POST',body:input});}
  revokeMember(id){return this.request('/trial/members/'+id+'/revoke',{method:'POST',body:{}});}
}
