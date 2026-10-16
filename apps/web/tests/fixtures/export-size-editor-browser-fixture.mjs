import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';
import {readExportResolution} from '../../src/export-resolution.mjs';

// Test-only owner/trial and synthetic non-RAW pixels. Product authentication,
// camera RAW decoding, Cloud bindings, and actual file delivery are not used.
const id='33333333-3333-4333-8333-333333333333';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_EXPORT_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'portrait.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const recipe=neutralRecipe(),recipeSnapshot=JSON.stringify(recipe);
const saved={assetId:id,revision:2,body:recipe};
const frame=()=>{
  const data=new Uint8ClampedArray(120*80*4);
  for(let y=0;y<80;y++)for(let x=0;x<120;x++){
    const at=(y*120+x)*4;data[at]=x*2;data[at+1]=y*3;data[at+2]=100;data[at+3]=255;
  }
  return {width:120,height:80,data};
};
const cache={asset:structuredClone(asset),proxy:frame(),history:[structuredClone(recipe)],
  cursor:0,revision:2,reference:null,dirty:false};
const api={
  async listAssets(){return [structuredClone(asset)];},
  async getRecipe(candidate){return candidate===id?structuredClone(saved):null;},
  async assertPermission(candidate,action){if(candidate!==id||action!=='export')throw Error('TEST_PERMISSION_DENIED');return {authorized:true};},
  async getOriginal(candidate){if(candidate!==id)throw Error('TEST_ASSET_UNKNOWN');return original.slice(0);},
  async saveRecipe(){throw Error('TEST_WRITE_FORBIDDEN');},
};
const storage={async get(candidate){return candidate===id?structuredClone(cache):undefined;},
  async put(){throw Error('TEST_WRITE_FORBIDDEN');}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(_bytes,{mode}={}){
  if(mode!=='final')throw Error('TEST_FINAL_ONLY');finalDecodeCount++;
  return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(id);
const calls=[];
const actualExportFinal=session.exportFinal.bind(session);
session.exportFinal=async args=>{calls.push(structuredClone(args));return actualExportFinal(args);};

const blobRegistry=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobRegistry.set(url,blob);return url;};
URL.revokeObjectURL=url=>{revokeURL(url);};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){
    autoClicks.push({name:this.download,href:this.href});return;
  }
  return anchorClick.apply(this,args);
};
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Browser Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const expect=(condition,label)=>{if(!condition)throw Error(`EXPORT_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`EXPORT_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const byID=id=>document.querySelector(id);
const setSelect=(selector,value)=>{const input=byID(selector);input.value=value;
  input.dispatchEvent(new Event('change',{bubbles:true}));};
const setValue=(selector,value)=>{const input=byID(selector);input.value=String(value);
  input.dispatchEvent(new Event('input',{bubbles:true}));};
const exportButton=format=>byID(`[data-action="export-${format}"]`);
const currentLink=()=>byID('#download-link');
const expectedSize={
  percentage:{kind:'percentage',value:50,width:60,height:40},
  width:{kind:'width',value:60,width:60,height:40},
  height:{kind:'height',value:40,width:60,height:40},
  'long-edge':{kind:'long-edge',value:60,width:60,height:40},
  'short-edge':{kind:'short-edge',value:40,width:60,height:40},
  dimensions:{kind:'dimensions',width:58,height:33,actualWidth:50,actualHeight:33},
};
function setSize(mode){
  setSelect('#export-size-method',mode);
  if(mode==='dimensions'){setValue('#export-size-width',58);setValue('#export-size-height',33);}
  else setValue('#export-size-value',expectedSize[mode].value);
}
function expectedArguments(mode,unit,value){
  const size=expectedSize[mode];
  return {size:mode==='dimensions'?{kind:mode,width:size.width,height:size.height}:
    {kind:mode,value:size.value},resolution:{unit,value}};
}
function inspectTIFF(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer);
  expect(bytes[0]===73&&bytes[1]===73&&view.getUint16(2,true)===42,'TIFF header');
  const u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true),ifd=u32(4),count=u16(ifd),tags=new Map();
  expect(count>=13&&ifd+2+count*12+4<=bytes.length,'TIFF IFD bounds');
  for(let index=0;index<count;index++){
    const at=ifd+2+index*12,type=u16(at+2),n=u32(at+4),length=n*(type===3?2:type===5?8:4);
    const valueAt=length>4?u32(at+8):at+8;
    expect(valueAt+Math.min(length,8)<=bytes.length,'TIFF tag bounds');
    tags.set(u16(at),{type,n,valueAt,value:type===3?u16(valueAt):u32(valueAt)});
  }
  const scalar=tag=>{expect(tags.has(tag),`TIFF tag ${tag}`);return tags.get(tag).value;};
  const density=tag=>{const entry=tags.get(tag);expect(entry?.type===5&&entry.valueAt+8<=bytes.length,`TIFF rational ${tag}`);return [u32(entry.valueAt),u32(entry.valueAt+4)];};
  return {width:scalar(256),height:scalar(257),unit:scalar(296),bits:scalar(258),compression:scalar(259),densityX:density(282),densityY:density(283)};
}
async function runBrowserChecks(){
  const results=[];
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'synthetic authenticated saved Editor asset');

  // UI rejects malformed controls before the Session/Worker boundary.
  setSize('long-edge');setValue('#export-size-value',0);
  expect(exportButton('jpeg').disabled&&exportButton('png').disabled&&exportButton('tiff').disabled&&calls.length===0,
    'zero long edge disabled without Session invocation');
  setSelect('#export-size-method','dimensions');setValue('#export-size-width',58);
  setValue('#export-size-height','');
  expect(exportButton('jpeg').disabled&&calls.length===0,'incomplete Dimensions disabled');
  setSize('long-edge');setSelect('#export-resolution-unit','ppi');
  setValue('#export-resolution-value',0);
  expect(exportButton('jpeg').disabled&&calls.length===0,'zero PPI disabled');
  setValue('#export-resolution-value',70000);
  expect(exportButton('png').disabled&&calls.length===0,'out-of-range density disabled');

  // Positive but enlargement is rejected by the real Final dimension planner.
  setValue('#export-resolution-value',300);setValue('#export-size-value',200);
  expect(!exportButton('png').disabled,'valid integer UI proceeds to runtime planner');
  exportButton('png').click();
  await waitFor(()=>session.state.error!==null,'runtime upscaling refusal');
  expect(calls.length===1&&finalDecodeCount===1&&
    session.state.error==='EXPORT_SIZE_EDGE_INVALID',
  'enlargement fails closed after UI-to-Session handoff');
  expect(!currentLink().href||currentLink().hidden,'enlargement produced no Blob link');
  setSize('percentage');setValue('#export-size-value',101);
  expect(exportButton('jpeg').disabled&&exportButton('tiff').disabled&&calls.length===1,
    'percentage above 100 is rejected before Session');
  for(const [mode,value,error] of [['width',121,'EXPORT_SIZE_WIDTH_INVALID'],
    ['height',81,'EXPORT_SIZE_HEIGHT_INVALID']]){
    setSize(mode);setValue('#export-size-value',value);
    expect(!exportButton('tiff').disabled,`${mode} valid UI integer reaches runtime planner`);
    const before=calls.length;
    exportButton('tiff').click();
    await waitFor(()=>calls.length===before+1&&session.state.error===error,
      `${mode} runtime upscaling refusal`);
    expect(!currentLink().href||currentLink().hidden,`${mode} enlargement produced no Blob link`);
  }

  for(const mode of ['percentage','width','height','long-edge','short-edge','dimensions']){
    setSize(mode);
    for(const resolution of [{unit:'ppi',value:300},{unit:'ppc',value:120}]){
      setSelect('#export-resolution-unit',resolution.unit);
      setValue('#export-resolution-value',resolution.value);
      for(const format of ['jpeg','png','tiff']){
        expect(!exportButton(format).disabled,`${mode}/${resolution.unit}/${format} UI enabled`);
        const before=calls.length,beforeClicks=autoClicks.length,priorURL=currentLink().href;
        exportButton(format).click();
        await waitFor(()=>calls.length===before+1&&autoClicks.length===beforeClicks+1,
          `${mode}/${resolution.unit}/${format} UI Final`);
        const args=calls.at(-1),expected=expectedArguments(mode,resolution.unit,resolution.value);
        expect(JSON.stringify(args.size)===JSON.stringify(expected.size)&&
          JSON.stringify(args.resolution)===JSON.stringify(expected.resolution),
        `${mode}/${resolution.unit}/${format} exact Editor-to-Session arguments`);
        expect(args.format===format,`${mode}/${resolution.unit}/${format} format argument`);
        const link=currentLink(),blob=blobRegistry.get(link.href);
        expect(!link.hidden&&link.href!==priorURL&&blob instanceof Blob,
          `${mode}/${resolution.unit}/${format} linked real Blob`);
        expect(blob.type===`image/${format}`&&blob.size>0,
          `${mode}/${resolution.unit}/${format} MIME and size`);
        let dimensions,metadata;
        if(format==='tiff'){
          metadata=inspectTIFF(await blob.arrayBuffer());
          dimensions={width:metadata.width,height:metadata.height};
          expect(metadata.bits===8&&metadata.compression===1&&metadata.unit===(resolution.unit==='ppi'?2:3)&&
            JSON.stringify(metadata.densityX)===JSON.stringify([resolution.value,1])&&
            JSON.stringify(metadata.densityY)===JSON.stringify([resolution.value,1]),
          `${mode}/${resolution.unit}/tiff actual TIFF density and encoding tags`);
        }else{
          const bitmap=await createImageBitmap(blob);
          dimensions={width:bitmap.width,height:bitmap.height};bitmap.close();
          metadata=readExportResolution(new Uint8Array(await blob.arrayBuffer()),format);
        }
        const width=mode==='dimensions'?50:60,height=mode==='dimensions'?33:40;
        expect(dimensions.width===width&&dimensions.height===height,
          `${mode}/${resolution.unit}/${format} actual pixel dimensions`);
        if(format!=='tiff'){
          const target=format==='png'?Math.round(resolution.value*(resolution.unit==='ppi'?10000/254:100)):
            resolution.value;
          expect(metadata.width===width&&metadata.height===height&&metadata.x===target&&
            metadata.y===target&&(format!=='jpeg'||metadata.unit===resolution.unit),
          `${mode}/${resolution.unit}/${format} actual encoded density metadata`);
        }
        expect((await checksum(original))===asset.sha256&&
          new Uint8Array(original).every((byte,index)=>byte===originalBytes[index])&&
          JSON.stringify(saved.body)===recipeSnapshot&&JSON.stringify(session.state.recipe)===recipeSnapshot,
        `${mode}/${resolution.unit}/${format} Original and Recipe unchanged`);
        results.push({mode,format,resolution,size:dimensions,metadata,mime:blob.type,bytes:blob.size});
      }
    }
  }
  expect(results.length===36&&finalDecodeCount===39&&autoClicks.length===36,
    '36 actual Editor UI deliveries plus three refused enlargements');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'EXPORT-SIZE-EDITOR-BROWSER-PASS',
    boundary:'synthetic authenticated non-RAW EditorSession -> actual Worker -> browser JPEG/PNG/TIFF Blob',
    invalidInputs:'zero edge, missing dimension, zero/oversize density, percentage above 100 blocked; long/width/height enlargement runtime refused',
    results});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'EXPORT-SIZE-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,calls,finalDecodeCount,
      uiNote:byID('#export-settings-note')?.textContent,exportNote:byID('#export-note')?.textContent});
  });
});
