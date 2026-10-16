import {TrialClient} from './trial-client.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const sha=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export class SitesClient extends TrialClient {
  get supportsRecipeHistory(){return true;}
  async getRecipeHistory(assetID,{signal}={}){
    if(typeof assetID!=='string'||!assetID)throw Error('INVALID_ASSET');
    const response=await this.request('/v1/assets/'+encodeURIComponent(assetID)+'/recipe/history',{signal});
    if(!Array.isArray(response?.history))throw Error('RECIPE_HISTORY_INVALID');
    if(response.history.length>1000)throw Error('RECIPE_HISTORY_LIMIT');
    let prior=0,bytes=0;
    for(const row of response.history){
      if(!row||Object.keys(row).some(key=>!['revision','body'].includes(key))||
          !Number.isSafeInteger(row.revision)||row.revision!==prior+1||!row.body)throw Error('RECIPE_HISTORY_INVALID');
      validateRecipe(row.body);
      prior=row.revision;bytes+=new TextEncoder().encode(JSON.stringify(row.body)).byteLength;
      if(bytes>16*1024*1024)throw Error('RECIPE_HISTORY_LIMIT');
    }
    return response.history;
  }
  async logout(){return super.logout();}
  async putOriginal(assetID,body){
    if(!(body instanceof ArrayBuffer)||body.byteLength<=0||body.byteLength>128*1024*1024)throw Error('RAW_UPLOAD_SIZE');
    const sha256=await sha(body),size=body.byteLength;
    const resume=await this.request('/v1/assets/'+assetID+'/uploads');
    const upload=resume.upload||await this.request('/v1/assets/'+assetID+'/uploads',{method:'POST',body:{}});
    if(upload.assetID!==assetID||upload.sha256!==sha256||upload.size!==size||upload.partSize!==8*1024*1024||upload.partCount!==Math.ceil(size/upload.partSize)||typeof upload.id!=='string')throw Error('UPLOAD_BINDING_MISMATCH');
    for(let i=0;i<upload.partCount;i++){
      const partNumber=i+1,part=body.slice(i*upload.partSize,Math.min(size,(i+1)*upload.partSize)),partSHA=await sha(part);
      const existing=resume.parts?.find(p=>p.partNumber===partNumber);
      if(existing?.verified===true&&existing.sha256===partSHA&&existing.size===part.byteLength)continue;
      const stored=await this.request('/v1/uploads/'+upload.id+'/parts/'+partNumber,{method:'PUT',body:part,headers:{'Content-Type':'application/octet-stream','X-Suite-Part-SHA256':partSHA}});
      if(stored.partNumber!==partNumber||stored.sha256!==partSHA||stored.size!==part.byteLength||stored.verified!==true)throw Error('UPLOAD_PART_MISMATCH');
    }
    const asset=await this.request('/v1/uploads/'+upload.id+'/complete',{method:'POST',body:{}});
    if(asset.id!==assetID||asset.sha256!==sha256||asset.size!==size||asset.cloudSafe!==true)throw Error('UPLOAD_FINAL_MISMATCH');return asset;
  }
}
