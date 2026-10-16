import {assertPixels, checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {personProcessingStatus, PERSON_PRIVACY_APPROVED} from '../person-privacy.mjs';

export const ASTRA_CULLING_VERSION = 'suite-quality-duplicate-culling-1';
const clamp = v => Math.max(0, Math.min(1, v));
const luma = (data, p) => (.2126*data[p]+.7152*data[p+1]+.0722*data[p+2])/255;
function checkedFrame(frame) {
  assertPixels(frame);
  if (frame.width*frame.height > 8_000_000 || !(frame.data.buffer instanceof ArrayBuffer))
    throw Error('CULLING_FRAME_INVALID');
}
function measure(frame, bounds = {left: 0, top: 0, right: 1, bottom: 1}) {
  const w = 64, h = 64, plane = new Float32Array(w*h), visible = new Uint8Array(w*h);
  let total = 0, square = 0, count = 0, dark = 0, bright = 0;
  const colors = [0,0,0], histogram = Array(8).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(frame.width-1, Math.max(0, Math.floor((bounds.left+(x+.5)/w*(bounds.right-bounds.left))*frame.width)));
    const sy = Math.min(frame.height-1, Math.max(0, Math.floor((bounds.top+(y+.5)/h*(bounds.bottom-bounds.top))*frame.height)));
    const p = (sy*frame.width+sx)*4, i = y*w+x;
    if (!frame.data[p+3]) continue;
    const value = luma(frame.data,p); plane[i] = value; visible[i] = 1;
    total += value; square += value*value; count++;
    if (value < .02) dark++; if (value > .98) bright++;
    histogram[Math.min(7,Math.floor(value*8))]++;
    for (let c = 0; c < 3; c++) colors[c] += frame.data[p+c]/255;
  }
  if (!count) throw Error('CULLING_FRAME_NO_VISIBLE_PIXELS');
  let lap = 0, lapSquare = 0, lapCount = 0;
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    const i = y*w+x;
    if (![i,i-1,i+1,i-w,i+w].every(j=>visible[j])) continue;
    const value = 4*plane[i]-plane[i-1]-plane[i+1]-plane[i-w]-plane[i+w];
    lap += value; lapSquare += value*value; lapCount++;
  }
  const variance = lapCount ? Math.max(0,lapSquare/lapCount-(lap/lapCount)**2) : 0;
  const focus = clamp(Math.log1p(variance*1000)/Math.log(101));
  const mean = total/count, contrast = Math.sqrt(Math.max(0,square/count-mean*mean));
  const exposure = clamp(1-(dark+bright)/count-.5*Math.abs(mean-.5));
  return {focus, laplacianVariance: variance, exposure, meanLuma: mean, contrast,
    blackClipping: dark/count, whiteClipping: bright/count,
    meanRGB: colors.map(v=>v/count), histogram: histogram.map(v=>v/count),
    quality: .6*focus+.4*exposure, confidence: count/(w*h), analysisGrid: [w,h]};
}
function differenceHash(frame) {
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const yy = Math.min(frame.height-1, Math.floor((y+.5)*frame.height/8));
    const a = Math.min(frame.width-1, Math.floor((x+.5)*frame.width/9));
    const b = Math.min(frame.width-1, Math.floor((x+1.5)*frame.width/9));
    if (luma(frame.data,(yy*frame.width+a)*4) > luma(frame.data,(yy*frame.width+b)*4))
      hash |= 1n << BigInt(y*8+x);
  }
  return hash.toString(16).padStart(16,'0');
}
const boundsOf = points => ({left: Math.min(...points.map(p=>p.x)), right: Math.max(...points.map(p=>p.x)),
  top: Math.min(...points.map(p=>p.y)), bottom: Math.max(...points.map(p=>p.y))});
function eyeOpenness(points, frame) {
  const pts = points.map(p=>({x:p.x*frame.width,y:p.y*frame.height}));
  let length = 0, pair;
  for (const a of pts) for (const b of pts) if (Math.hypot(a.x-b.x,a.y-b.y)>length) {
    length = Math.hypot(a.x-b.x,a.y-b.y); pair = [a,b];
  }
  if (!pair || length < 2) return null;
  const [a,b] = pair, normal = pts.map(p=>((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/length);
  return (Math.max(...normal)-Math.min(...normal))/length;
}

/** Quality is a deterministic heuristic, not aesthetic truth or a calibrated
 * camera-focus measure. Face analysis uses existing privacy/model gates. */
export async function analyzeCullingFrame(pixels, {faces = false, privacy, signal} = {}) {
  checkAbort(signal); checkedFrame(pixels);
  const frame = {...pixels,data:new Uint8ClampedArray(pixels.data)};
  const quality = measure(frame), result = {version: ASTRA_CULLING_VERSION,
    quality, hash: differenceHash(frame), aspect: frame.width/frame.height,
    faces: [], faceAnalysis: faces ? 'pending' : 'not-requested', tags: []};
  if (quality.focus < .2) result.tags.push('low-focus');
  if (quality.blackClipping > .2) result.tags.push('dark');
  if (quality.whiteClipping > .2) result.tags.push('bright');
  if (quality.quality > .65) result.tags.push('high-quality');
  if (faces) {
    if (personProcessingStatus(privacy) !== PERSON_PRIVACY_APPROVED) throw Error('PRIVACY_REVIEW_REQUIRED');
    const detection = await detectFaceFeatures(frame,{signal});
    result.faces = detection.faces.map((face,index) => {
      const bounds = boundsOf(face.oval), faceQuality = measure(frame,bounds);
      const eyes = [eyeOpenness(face.regions.imageLeftEye,frame),eyeOpenness(face.regions.imageRightEye,frame)];
      const eyeState = eyes.some(v=>v===null) ? 'unknown' : eyes.some(v=>v<.12) ? 'possibly-closed' : 'open-shape';
      const points = face.landmarks, middle = (points[13].y+points[14].y)/2;
      const mouthWidth = Math.abs(points[61].x-points[291].x);
      const mouthCornerLift = mouthWidth ? (middle-(points[61].y+points[291].y)/2)/mouthWidth : null;
      return {index,bounds,focus:faceQuality.focus,eyes,eyeState,mouthCornerLift,
        expression:'geometry-only-not-emotion',visibility:face.visibility};
    });
    result.faceAnalysis = 'analyzed'; result.faceModelSHA256 = detection.modelSHA256;
    if (result.faces.some(face=>face.eyeState==='possibly-closed')) result.tags.push('possibly-closed-eyes');
    if (result.faces.length) result.tags.push('faces');
  }
  checkAbort(signal); return result;
}

function hashDistance(a,b) {let value=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(value){value&=value-1n;count++;}return count;}
function validResult(item) {
  if (!item || typeof item.id!=='string' || !item.id || !/^[a-f0-9]{64}$/i.test(item.originalSHA256??'') ||
      item.analysis?.version!==ASTRA_CULLING_VERSION || !/^[a-f0-9]{16}$/.test(item.analysis.hash??'') ||
      !Number.isFinite(item.analysis.aspect) || item.analysis.aspect <= 0 ||
      !Number.isFinite(item.analysis.quality?.quality) || !Array.isArray(item.analysis.quality?.meanRGB) ||
      item.analysis.quality.meanRGB.length!==3 || item.analysis.quality.meanRGB.some(v=>!Number.isFinite(v)))
    throw Error('CULLING_ANALYSIS_INVALID');
}

/** Near-duplicate connected components, deterministic best-pick suggestions.
 * No existing Stars/Flags/Tags/Segments or selection state is modified. */
export function suggestCulling(results, {maxHashDistance=8, maxColorDistance=.18,
  perCluster=1, totalLimit=1000, timeWindowMs=30000, signal}={}) {
  if (!Array.isArray(results)||results.length>2000||new Set(results.map(v=>v.id)).size!==results.length||
      !Number.isSafeInteger(maxHashDistance)||maxHashDistance<0||maxHashDistance>64||
      !Number.isFinite(maxColorDistance)||maxColorDistance<0||maxColorDistance>2||
      !Number.isSafeInteger(perCluster)||perCluster<1||perCluster>100||
      !Number.isSafeInteger(totalLimit)||totalLimit<0||totalLimit>2000||
      !Number.isFinite(timeWindowMs)||timeWindowMs<0) throw Error('CULLING_SELECTION_SETTINGS_INVALID');
  results.forEach(validResult);
  const parent=results.map((_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<results.length;i++) {
    checkAbort(signal);
    for(let j=i+1;j<results.length;j++) {
      const a=results[i],b=results[j];
      if(Number.isFinite(a.capturedAtMs)&&Number.isFinite(b.capturedAtMs)&&Math.abs(a.capturedAtMs-b.capturedAtMs)>timeWindowMs)continue;
      if(Math.abs(Math.log(a.analysis.aspect/b.analysis.aspect))>.08)continue;
      const color=Math.hypot(...a.analysis.quality.meanRGB.map((v,c)=>v-b.analysis.quality.meanRGB[c]));
      if(color<=maxColorDistance&&hashDistance(a.analysis.hash,b.analysis.hash)<=maxHashDistance)parent[root(j)]=root(i);
    }
  }
  const groups=new Map();for(let i=0;i<results.length;i++){const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(results[i]);}
  const score=item=>{
    const faces=item.analysis.faces??[],focus=faces.length?faces.reduce((sum,f)=>sum+f.focus,0)/faces.length:item.analysis.quality.focus;
    return item.analysis.quality.quality*.75+focus*.25-(faces.some(f=>f.eyeState==='possibly-closed') ? .12 : 0);
  };
  const clusters=[...groups.values()].map(group=>{
    const ranked=[...group].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
    return {id:'cluster:'+ranked.map(x=>x.id).sort()[0],members:ranked.map(x=>({id:x.id,score:score(x)})),
      proposed:ranked.slice(0,perCluster).map(x=>x.id)};
  });
  const candidates=clusters.flatMap(c=>c.members.filter(m=>c.proposed.includes(m.id)))
    .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,totalLimit);
  const picks=new Set(candidates.map(x=>x.id));
  return {version:ASTRA_CULLING_VERSION,proposalOnly:true,clusters:clusters.map(c=>({...c,proposed:c.proposed.filter(id=>picks.has(id))})),
    picks:[...picks],rejected:results.filter(x=>!picks.has(x.id)).map(x=>x.id),
    scoreMeaning:'relative-heuristic-not-an-aesthetic-verdict'};
}

export function groupCullingStories(results,{gapMs=15*60*1000}={}) {
  if(!Number.isFinite(gapMs)||gapMs<0)throw Error('CULLING_STORY_GAP_INVALID');
  const sorted=results.filter(x=>Number.isFinite(x.capturedAtMs)).sort((a,b)=>a.capturedAtMs-b.capturedAtMs||a.id.localeCompare(b.id));
  const stories=[];let previous;
  for(const item of sorted){if(previous===undefined||item.capturedAtMs-previous>gapMs)stories.push([]);stories[stories.length-1].push(item.id);previous=item.capturedAtMs;}
  return {stories,unassigned:results.filter(x=>!Number.isFinite(x.capturedAtMs)).map(x=>x.id),timestampSource:'caller-must-verify-capture-metadata'};
}

/** Literal local tags/names search; never claim text-to-image semantic retrieval. */
export function searchCullingMetadata(results,query,{mode='and'}={}) {
  if(typeof query!=='string'||!['and','or'].includes(mode))throw Error('CULLING_QUERY_INVALID');
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return results.filter(item=>{
    const text=[item.name??'',...(item.tags??[]),...(item.analysis.tags??[])].join(' ').toLowerCase();
    return !terms.length||(mode==='and'?terms.every(t=>text.includes(t)):terms.some(t=>text.includes(t)));
  }).map(item=>item.id);
}

/** Incremental analysis job emits separate immutable proposals and progress.
 * Existing cached analyses reused only by ID+OriginalSHA+analysis version and
 * matching requested face mode. No project writes or background service starts. */
export async function analyzeCullingSet(items,{cache=[],faces=false,privacy,signal,onProgress}={}) {
  if(faces && personProcessingStatus(privacy)!==PERSON_PRIVACY_APPROVED)throw Error('PRIVACY_REVIEW_REQUIRED');
  if(!Array.isArray(items)||items.length>2000||new Set(items.map(x=>x.id)).size!==items.length)
    throw Error('CULLING_JOB_INPUT_INVALID');
  const output=[];
  for(const item of items){
    checkAbort(signal);
    if(typeof item.id!=='string'||!item.id||!/^[a-f0-9]{64}$/i.test(item.originalSHA256??''))throw Error('CULLING_ASSET_BINDING_INVALID');
    const previous=cache.find(x=>x.id===item.id&&x.originalSHA256===item.originalSHA256&&
      x.analysis?.version===ASTRA_CULLING_VERSION&&(faces?x.analysis.faceAnalysis==='analyzed':x.analysis.faceAnalysis==='not-requested'));
    const analysis=previous?structuredClone(previous.analysis):await analyzeCullingFrame(item.pixels,{faces,privacy,signal});
    output.push({id:item.id,originalSHA256:item.originalSHA256,capturedAtMs:item.capturedAtMs,name:item.name,tags:[...(item.tags??[])],analysis});
    onProgress?.({completed:output.length,total:items.length});
  }
  checkAbort(signal);return output;
}

/** Return sidecar text only. Caller chooses destination; Original never edited. */
export function cullingMarksXMP({rating=0,label='',flag='none'}={}) {
  if(!Number.isSafeInteger(rating)||rating<0||rating>5||typeof label!=='string'||label.length>80||
      !['none','pick','reject'].includes(flag))throw Error('CULLING_MARKS_INVALID');
  const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  return `<?xpacket begin="\uFEFF"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:suite="https://suite.local/ns/culling/1.0/" xmp:Rating="${rating}" xmp:Label="${escape(label)}" suite:Flag="${flag}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
