import {assertPixels,checkAbort,srgbToLinear,linearToSrgb} from './pure.mjs';
import {applyColorAdjustments} from './color-adjustments.mjs';
import {trainPersonalizedLook} from './astra-look-learning.mjs';

const CRS='http://ns.adobe.com/camera-raw-settings/1.0/';
const mapping={Highlights2012:'highlights',Shadows2012:'shadows',Whites2012:'whites',
  Blacks2012:'blacks',Vibrance:'vibrance'};
const supported=new Set(['Exposure2012','Contrast2012','Saturation',...Object.keys(mapping)]);
const metadata=new Set(['Version','ProcessVersion','PresetType','Name','UUID']);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  value=>value.toString(16).padStart(2,'0')).join('');

/** Existing Workspace XMP reader only supports Rating/Label and cannot parse
 * color presets. This namespace-aware browser XML subset reader rejects DTD,
 * profiles, local masks, curves and every unimplemented CRS adjustment.
 */
export function readLookXMPSubset(bytes) {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>1024*1024)throw Error('LOOK_XMP_BYTES_INVALID');
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|\u0000/iu.test(xml))throw Error('LOOK_XMP_XML_UNSUPPORTED');
  if(typeof DOMParser==='undefined')throw Error('LOOK_XMP_XML_PARSER_UNAVAILABLE');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('LOOK_XMP_XML_INVALID');
  const values={},unhandled=new Set();
  const record=(name,value)=>{
    if(metadata.has(name))return;
    if(!supported.has(name)){unhandled.add(name);return;}
    if(Object.hasOwn(values,name))throw Error('LOOK_XMP_DUPLICATE_PROPERTY');
    const raw=value.trim();
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))throw Error('LOOK_XMP_NUMERIC_PROPERTY_INVALID');
    const number=Number(raw),limit=name==='Exposure2012'?5:100;
    if(!Number.isFinite(number)||number< -limit||number>limit)throw Error('LOOK_XMP_PROPERTY_RANGE');
    values[name]=number;
  };
  for(const node of doc.getElementsByTagName('*')){
    for(const attr of node.attributes)if(attr.namespaceURI===CRS)record(attr.localName,attr.value);
    if(node.namespaceURI===CRS){
      if(metadata.has(node.localName))continue;
      if(node.children.length){unhandled.add(node.localName);continue;}
      record(node.localName,node.textContent??'');
    }
  }
  if(unhandled.size){const error=Error('LOOK_XMP_ADJUSTMENTS_UNSUPPORTED');error.properties=[...unhandled];throw error;}
  if(!Object.keys(values).length)throw Error('LOOK_XMP_NO_COLOR_CONTROLS');
  return {kind:'camera-raw-color-subset',values,interpretation:'suite-approximation-not-adobe-render'};
}

/** Explicit opt-in SUITE interpretation, not Adobe RAW color parity. */
export function renderLookXMPSubset(frame,preset,{interpretation,signal}={}) {
  assertPixels(frame);checkAbort(signal);
  if(interpretation!=='suite-color-approximation'||preset?.kind!=='camera-raw-color-subset')
    throw Error('LOOK_XMP_EXPLICIT_INTERPRETATION_REQUIRED');
  const values=preset.values;
  if(!values||Object.keys(values).some(key=>!supported.has(key)||!Number.isFinite(values[key])||
      Math.abs(values[key])>(key==='Exposure2012'?5:100)))throw Error('LOOK_XMP_SETTINGS_INVALID');
  if(frame.width*frame.height>8_000_000||!(frame.data.buffer instanceof ArrayBuffer))throw Error('LOOK_XMP_FRAME_INVALID');
  const base={...frame,data:new Uint8ClampedArray(frame.data)},exposure=2**(values.Exposure2012??0);
  const contrast=1+(values.Contrast2012??0)/100,saturation=1+(values.Saturation??0)/100;
  for(let p=0;p<base.data.length;p+=4){
    if((p&65535)===0)checkAbort(signal);if(!base.data[p+3])continue;
    const rgb=[0,1,2].map(c=>Math.max(0,Math.min(1,(linearToSrgb(srgbToLinear(frame.data[p+c]/255)*exposure)-.5)*contrast+.5)));
    const y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for(let c=0;c<3;c++)base.data[p+c]=Math.round(Math.max(0,Math.min(1,y+(rgb[c]-y)*saturation))*255);
  }
  return applyColorAdjustments(base,Object.fromEntries(Object.entries(mapping).filter(([name])=>Object.hasOwn(values,name))
    .map(([name,target])=>[target,values[name]])),{signal});
}

/** Import real decoded pairs against a digest-pinned manifest. RAW/JPEG/TIFF
 * decoding and .lrcat database extraction belong to upstream codecs; this code
 * never interprets catalog blobs as images, guesses pairings by filename or
 * silently substitutes thumbnails for aligned full before/after renders.
 */
export async function importDecodedLookCorpus(manifest,decoded,{signal}={}) {
  if(!Array.isArray(manifest)||!manifest.length||manifest.length>10000||!Array.isArray(decoded)||decoded.length>20000||
      new Set(decoded.map(row=>row.id)).size!==decoded.length||new Set(manifest.map(row=>row.id)).size!==manifest.length)
    throw Error('LOOK_CORPUS_MANIFEST_INVALID');
  const records=new Map(decoded.map(row=>[row.id,row])),pairs=[];
  for(const item of manifest){
    checkAbort(signal);
    if(typeof item.id!=='string'||!item.id||!['raw','nonraw'].includes(item.format)||
        ![item.beforePixelsSHA256,item.afterPixelsSHA256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)))
      throw Error('LOOK_CORPUS_PAIR_BINDING_INVALID');
    const before=records.get(item.beforeID)?.pixels,after=records.get(item.afterID)?.pixels;
    assertPixels(before);assertPixels(after);
    if(before.width!==after.width||before.height!==after.height||before.width*before.height>8_000_000||
        !(before.data.buffer instanceof ArrayBuffer)||!(after.data.buffer instanceof ArrayBuffer))throw Error('LOOK_CORPUS_GEOMETRY_INVALID');
    const a={...before,data:new Uint8ClampedArray(before.data)},b={...after,data:new Uint8ClampedArray(after.data)};
    if(await hash(a.data)!==item.beforePixelsSHA256.toLowerCase()||await hash(b.data)!==item.afterPixelsSHA256.toLowerCase())
      throw Error('LOOK_CORPUS_PIXELS_DIGEST_MISMATCH');
    pairs.push({id:item.id,format:item.format,before:a,after:b});
  }
  checkAbort(signal);return pairs;
}

export function trainLiteLookFromXMP(frame,xmpBytes,{format,interpretation,signal}={}) {
  if(!['raw','nonraw'].includes(format))throw Error('LOOK_LITE_FORMAT_INVALID');
  const preset=readLookXMPSubset(xmpBytes),after=renderLookXMPSubset(frame,preset,{interpretation,signal});
  return trainPersonalizedLook([{id:'explicit-xmp-reference',format,before:frame,after}],
    {mode:'lite',formats:[format],signal});
}
