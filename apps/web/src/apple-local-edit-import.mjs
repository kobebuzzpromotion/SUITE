const fail=()=>{throw Error('APPLE_LOCAL_EDIT_INVALID_OR_UNSUPPORTED');};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/i.test(v);
const num=v=>typeof v==='number'&&Number.isFinite(v);
// JSON.parse keeps only the last duplicate key. Reject duplicates (including
// escaped spellings) before parsing so discarded values cannot evade validation.
export function rejectDuplicateKeys(text){
  const stack=[];
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='{'){if(stack.length>=32)fail();stack.push(new Set());}
    else if(c==='['){if(stack.length>=32)fail();stack.push(null);}
    else if(c==='}'||c===']')stack.pop();
    else if(c==='"'){
      const start=i;let escaped=false;
      for(i++;i<text.length;i++){if(escaped)escaped=false;else if(text[i]==='\\')escaped=true;else if(text[i]==='"')break;}
      let next=i+1;while(/\s/.test(text[next]??'')&&next<text.length)next++;
      if(text[next]===':'){
        const keys=stack.at(-1),key=JSON.parse(text.slice(start,i+1));
        if(!(keys instanceof Set)||keys.has(key))fail();keys.add(key);
      }
    }
  }
}
function fields(v,required,optional=[]){
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
  if(required.some(k=>!Object.hasOwn(v,k))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))fail();
}
function rect(v){fields(v,['x','y','width','height']);if(!Object.values(v).every(num)||v.x<0||v.y<0||v.width<=0||v.height<=0||v.x+v.width>1||v.y+v.height>1)fail();}
export function validateAppleLocalEdit(name,v,binding){
  if(name==='localBackdrop')return validateBackdrop(v,binding);
  const warp=name==='localWarp';if(!warp&&name!=='localRetouch')fail();
  fields(v,['schemaVersion','assetID','originalSHA256','referenceWidth','referenceHeight',warp?'operations':'layers',...(warp?['engineVersion']:[])],warp?['protectionRectangle','bodyMask']:[]);
  if(v.schemaVersion!==1||!uuid(v.assetID)||!sha(v.originalSHA256)||![v.referenceWidth,v.referenceHeight].every(n=>Number.isInteger(n)&&n>=1&&n<=1600))fail();
  if(binding&&(v.assetID.toLowerCase()!==binding.id.toLowerCase()||v.originalSHA256.toLowerCase()!==binding.sha256.toLowerCase()))fail();
  if(warp){
    if(v.bodyMask!=null){
      const m=v.bodyMask;fields(m,['sha256','width','height','byteCount']);
      if(!sha(m.sha256)||![m.width,m.height].every(n=>Number.isInteger(n)&&n>0&&n<=32768)||
        m.width*m.height>8_000_000||m.byteCount!==m.width*m.height||
        Math.abs(m.width/m.height-v.referenceWidth/v.referenceHeight)>1/v.referenceHeight+1/m.height)fail();
    }
    if(v.engineVersion!=='suite-manual-warp-applied-contractive-v1'||!Array.isArray(v.operations)||v.operations.length<1||v.operations.length>128)fail();
    if(v.protectionRectangle!=null)rect(v.protectionRectangle);
    for(const o of v.operations){fields(o,['kind','center','rx','ry','amount','dx','dy','angle']);fields(o.center,['x','y']);
      if(!['translate','scaleX','scaleY','scale','rotate','mShape','smooth','restore','pushLeft'].includes(o.kind)||![o.center.x,o.center.y].every(n=>num(n)&&n>=0&&n<=1)||![o.rx,o.ry].every(n=>num(n)&&n>0&&n<=1)||o.rx*v.referenceWidth<1||o.ry*v.referenceHeight<1||![o.amount,o.dx,o.dy,o.angle].every(n=>num(n)&&Math.abs(n)<=1))fail();
    }
  }else{
    if(!Array.isArray(v.layers)||v.layers.length<1||v.layers.length>16)fail();const ids=new Set();
    for(const l of v.layers){fields(l,['id','selection','effect'],['protection']);if(!uuid(l.id)||ids.has(l.id.toLowerCase()))fail();ids.add(l.id.toLowerCase());rect(l.selection);if(l.protection!=null)rect(l.protection);
      const e=l.effect;fields(e,['kind','strength'],['radiusReferencePixels','sourceOffsetX','sourceOffsetY']);if(!num(e.strength)||e.strength<0||e.strength>1)fail();
      if(e.kind==='skinSmoothing'){if(!num(e.radiusReferencePixels)||e.radiusReferencePixels<=0||e.radiusReferencePixels>32||e.sourceOffsetX!=null||e.sourceOffsetY!=null)fail();}
      else if(e.kind==='localRepair'){const x=e.sourceOffsetX,y=e.sourceOffsetY,s=l.selection;if(e.radiusReferencePixels!=null||![x,y].every(n=>num(n)&&Math.abs(n)<1)||x===0&&y===0||s.x+x<0||s.x+s.width+x>1||s.y-y<0||s.y+s.height-y>1)fail();}
      else fail();
    }
  }
  return v;
}
function validateBackdrop(v,binding){
  fields(v,['schemaVersion','assetID','originalSHA256','background','maskSHA256','maskWidth','maskHeight','maskByteCount','placement','backgroundEV','shadow'],['finalMask']);
  const dimension=n=>Number.isInteger(n)&&n>=1&&n<=32768;
  if(v.schemaVersion!==1||!uuid(v.assetID)||!sha(v.originalSHA256)||!sha(v.maskSHA256)||
    !dimension(v.maskWidth)||!dimension(v.maskHeight)||v.maskWidth*v.maskHeight>8_000_000||
    !Number.isInteger(v.maskByteCount)||v.maskByteCount!==v.maskWidth*v.maskHeight||!num(v.backgroundEV)||Math.abs(v.backgroundEV)>5)fail();
  if(binding&&(v.assetID.toLowerCase()!==binding.id.toLowerCase()||v.originalSHA256.toLowerCase()!==binding.sha256.toLowerCase()))fail();
  if(v.finalMask!=null){
    const f=v.finalMask;fields(f,['sha256','width','height','byteCount']);
    if(!sha(f.sha256)||!dimension(f.width)||!dimension(f.height)||f.width*f.height>8_000_000||
      !Number.isInteger(f.byteCount)||f.byteCount!==f.width*f.height||
      Math.abs(f.width/f.height-v.maskWidth/v.maskHeight)>1/v.maskHeight+1/f.height)fail();
  }
  const b=v.background;fields(b,['assetID','version','sha256','byteCount','width','height']);
  if(!uuid(b.assetID)||typeof b.version!=='string'||!b.version.trim()||b.version.includes('\0')||
    new TextEncoder().encode(b.version).length>256||!sha(b.sha256)||!Number.isInteger(b.byteCount)||
    b.byteCount<1||b.byteCount>32*1024*1024||!dimension(b.width)||!dimension(b.height)||b.width*b.height>8_000_000)fail();
  const p=v.placement;fields(p,['x','y','width','height']);
  if(!Object.values(p).every(num)||Math.abs(p.x)>4||Math.abs(p.y)>4||p.width<.001||p.width>8||p.height<.001||p.height>8)fail();
  const s=v.shadow;
  if(s?.kind==='none')fields(s,['kind']);
  else if(s?.kind==='addDrop'){
    fields(s,['kind','offsetX','offsetY','blurRadius','opacity']);
    if(![s.offsetX,s.offsetY,s.blurRadius,s.opacity].every(num)||Math.abs(s.offsetX)>32768||Math.abs(s.offsetY)>32768||s.blurRadius<0||s.blurRadius>128||s.opacity<0||s.opacity>1)fail();
  }else fail();
  // References only: this does not verify local bytes, permission or a render.
  return v;
}
/** Bounded read-only import. Original text and every history branch remain intact.
 * The injected preflight validates each Recipe; no renderer or save is invoked. */
export function readAppleLocalEditJSON(text,{preflight}={}){
  if(typeof text!=='string'||text.length>2_000_000||new TextEncoder().encode(text).length>2_000_000||typeof preflight!=='function')fail();
  let depth=0,quoted=false,escaped=false;
  for(const c of text){
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
    else if(c==='"')quoted=true;
    else if(c==='{'||c==='['){if(++depth>32)fail();}
    else if(c==='}'||c===']'){if(--depth<0)fail();}
  }
  if(depth!==0||quoted)fail();
  rejectDuplicateKeys(text);
  const doc=JSON.parse(text);let recipes,binding;
  if(!doc||typeof doc!=='object'||Array.isArray(doc))fail();
  if(Object.hasOwn(doc,'history')){
    fields(doc,['schemaVersion','asset','history','revision','updatedAt']);if(doc.schemaVersion!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0||!num(doc.updatedAt))fail();
    binding=doc.asset;fields(binding,['id','originalFilename','originalRelativePath','sha256','createdAt']);
    if(!uuid(binding.id)||!sha(binding.sha256)||!num(binding.createdAt)||typeof binding.originalFilename!=='string'||!binding.originalFilename||/[\\/\x00-\x1f\x7f]/.test(binding.originalFilename)||typeof binding.originalRelativePath!=='string'||/[\\:\x00-\x1f\x7f]/.test(binding.originalRelativePath)||binding.originalRelativePath.split('/').some(p=>!p||p==='.'||p==='..'))fail();
    fields(doc.history,['entries','cursor']);const entries=doc.history.entries;
    if(!Array.isArray(entries)||entries.length<1||entries.length>2048||!Number.isInteger(doc.history.cursor)||doc.history.cursor<0||doc.history.cursor>=entries.length)fail();
    recipes=entries.map(e=>{fields(e,['parameters','timestamp'],['editorID']);if(!num(e.timestamp)||e.editorID!=null&&(typeof e.editorID!=='string'||!e.editorID))fail();return {schemaVersion:1,parameters:e.parameters};});
  }else recipes=[doc];
  const reports=recipes.map(recipe=>{
    // Do not rely on an injected reporter to reject unknown wire schemas.
    fields(recipe,['schemaVersion','parameters']);if(recipe.schemaVersion!==1)fail();
    fields(recipe.parameters,['exposure','contrast','saturation','rotationDegrees','extendedParameters','processingOrder']);
    const p=recipe.parameters;
    if(!num(p.exposure)||!num(p.contrast)||p.contrast<0||!num(p.saturation)||p.saturation<0||!Number.isSafeInteger(p.rotationDegrees))fail();
    for(const name of ['localRetouch','localWarp','localBackdrop'])if(recipe?.parameters?.extendedParameters?.[name]!==undefined)validateAppleLocalEdit(name,recipe.parameters.extendedParameters[name],binding);
    return preflight({direction:'apple-to-web',kind:'recipe',record:recipe});
  });
  return {originalJSON:text,document:doc,reports,historyCount:recipes.length,operationAllowed:false,renderConnected:false};
}
