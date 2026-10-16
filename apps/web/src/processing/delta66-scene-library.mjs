/** Reference-only, in-memory library reducer. Bytes, uploads, asset ownership,
 * cloud persistence and official packs belong to the existing authorized host.
 * No fictitious bundled/background asset is created here. */
const text=(v,max=160)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
const clone=v=>structuredClone(v);
export function createSceneLibrary(){return {version:1,groups:[],assets:[],cropPresets:[]};}
export function editSceneLibrary(library,action){
  if(library?.version!==1||!['groups','assets','cropPresets'].every(k=>Array.isArray(library[k]))||!action||!text(action.type))throw Error('SCENE_LIBRARY_INVALID');
  const out=clone(library),id=action.id,group=id=>out.groups.find(g=>g.id===id),asset=id=>out.assets.find(a=>a.id===id);
  if(!text(id))throw Error('SCENE_LIBRARY_ID');
  switch(action.type){
    case 'add-group':if(group(id)||out.groups.length>=100||!text(action.name))throw Error('SCENE_GROUP_INVALID');out.groups.push({id,name:action.name});break;
    case 'rename-group':if(!group(id)||!text(action.name))throw Error('SCENE_GROUP_INVALID');group(id).name=action.name;break;
    case 'delete-group':if(!group(id))throw Error('SCENE_GROUP_MISSING');out.groups=out.groups.filter(g=>g.id!==id);out.assets.forEach(a=>{if(a.groupID===id)a.groupID=null;});break;
    case 'add-asset':{
      if(asset(id)||out.assets.length>=1000||!text(action.name)||!['background','sky','foreground','solid'].includes(action.kind)||action.groupID!=null&&!group(action.groupID))throw Error('SCENE_ASSET_INVALID');
      const value={id,name:action.name,kind:action.kind,groupID:action.groupID??null};
      if(action.kind==='solid'){if(!Array.isArray(action.color)||action.color.length!==3||action.color.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('SCENE_COLOR_INVALID');value.color=[...action.color];}
      else{if(!text(action.assetRef,2048)||!['image/jpeg','image/png','image/webp'].includes(action.mime)||action.kind==='foreground'&&action.mime!=='image/png')throw Error('SCENE_ASSET_REFERENCE');value.assetRef=action.assetRef;value.mime=action.mime;}
      out.assets.push(value);break;}
    case 'rename-asset':if(!asset(id)||!text(action.name))throw Error('SCENE_ASSET_INVALID');asset(id).name=action.name;break;
    case 'move-asset':if(!asset(id)||action.groupID!=null&&!group(action.groupID))throw Error('SCENE_GROUP_INVALID');asset(id).groupID=action.groupID??null;break;
    case 'delete-asset':if(!asset(id))throw Error('SCENE_ASSET_MISSING');out.assets=out.assets.filter(a=>a.id!==id);break;
    case 'reorder-assets':{const a=asset(id);if(!a||!Number.isInteger(action.index)||action.index<0||action.index>=out.assets.length)throw Error('SCENE_ASSET_ORDER');out.assets=out.assets.filter(v=>v.id!==id);out.assets.splice(action.index,0,a);break;}
    case 'put-crop-preset':{const p=action.preset;if(!text(action.name)||!p||!Number.isFinite(p.ratio)||p.ratio<=0||p.ratio>10||out.cropPresets.length>=100&&!out.cropPresets.some(v=>v.id===id))throw Error('SCENE_CROP_PRESET');
      out.cropPresets=out.cropPresets.filter(v=>v.id!==id);out.cropPresets.push({id,name:action.name,preset:clone(p)});break;}
    case 'delete-crop-preset':out.cropPresets=out.cropPresets.filter(v=>v.id!==id);break;
    default:throw Error('SCENE_LIBRARY_ACTION');
  }return out;
}
