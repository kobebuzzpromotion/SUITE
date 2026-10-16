/** Original procedural materials. No network, external textures, models or photo mutation. */
export const COSPLAY_PRESET_VERSION='suite-cosplay-procedural-1';
export const COSPLAY_PRESETS=Object.freeze([
  ['japanese','和風・月夜の回廊','background','赤い柱と格子、月夜の遠景。図形によるオリジナル背景。'],
  ['school','学園・夕方の教室','background','窓と机、夕方の光。特定作品や実在校を再現しない背景。'],
  ['fantasy','中華幻想・山と灯り','background','重なる山影と浮かぶ灯りの幻想背景。'],
  ['mansion','洋館・アーチホール','background','アーチと床の遠近線を使った洋館風背景。'],
  ['scifi','廃墟SF・光の通路','background','幾何学的な廃墟と発光する通路。'],
  ['smoke','スモーク','overlay','透過の霧。色・濃さ・配置seedを調整。'],
  ['laser','レーザー','overlay','透過の発光ライン。'],
  ['rays','光の筋','overlay','透過の放射光。'],
  ['flame','炎','overlay','透過の図形炎。写真の炎ではありません。'],
  ['sparks','火の粉','overlay','透過の発光粒子。'],
  ['slash','剣の軌跡','overlay','透過の弧状の発光軌跡。'],
].map(([id,label,kind,description])=>Object.freeze({id,label,kind,description})));

function settingsOf(input){
  if(!input||typeof input!=='object')throw Error('COSPLAY_SETTINGS_REQUIRED');
  const {presetID,width=1600,height=1200,seed=1,color='#ffb45c',opacity=.8}=input;
  const preset=COSPLAY_PRESETS.find(p=>p.id===presetID);
  if(!preset)throw Error('COSPLAY_UNKNOWN_PRESET');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096||width*height>8_000_000)throw Error('COSPLAY_MATERIAL_SIZE_LIMIT_8MP');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('COSPLAY_INVALID_SEED');
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw Error('COSPLAY_INVALID_COLOR');
  if(typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('COSPLAY_INVALID_OPACITY');
  return {preset,presetID,width,height,seed,color:color.toLowerCase(),opacity};
}
function random(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function polygon(c,points,fill){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();}
function line(c,points,color,width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function glow(c,x,y,r,color,alpha=1){
  c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);c.restore();
}
function sky(c,top,bottom){const g=c.createLinearGradient(0,0,0,1000);g.addColorStop(0,top);g.addColorStop(1,bottom);c.fillStyle=g;c.fillRect(0,0,1000,1000);}
function floor(c,horizon,color){
  polygon(c,[[0,horizon],[1000,horizon],[1000,1000],[0,1000]],'#111320');
  for(let i=-7;i<=7;i++)line(c,[[500+i*16,horizon],[500+i*200,1000]],color);
  for(let y=horizon+20;y<1000;y+=(y-horizon)*.4+15)line(c,[[0,y],[1000,y]],color);
}
function scenery(c,s,rnd){
  const accent=s.color;
  if(s.presetID==='japanese'){
    sky(c,'#10192f','#77728d');glow(c,680,210,120,'#d5e4ff',.5);
    c.fillStyle='#ebefff';c.beginPath();c.arc(680,210,38,0,Math.PI*2);c.fill();
    for(let k=0;k<4;k++){const pts=[[0,700]];for(let x=0;x<=1100;x+=80)pts.push([x,440+k*60+rnd()*100]);pts.push([1000,800]);polygon(c,pts,['#41485f','#353c52','#252e43','#182237'][k]);}
    floor(c,720,'#535064');
    for(const x of [55,210,790,945]){c.fillStyle='#572333';c.fillRect(x-14,75,28,720);c.fillStyle=accent;c.fillRect(x-14,75,4,720);}
    c.fillStyle='#341d30';c.fillRect(0,60,1000,40);c.fillRect(0,135,1000,16);
    for(const x of [0,820]){c.fillStyle='#161d30';c.fillRect(x,190,180,450);for(let y=210;y<640;y+=45)line(c,[[x,y],[x+180,y]],'#805663');for(let xx=x+20;xx<x+180;xx+=35)line(c,[[xx,190],[xx,640]],'#805663');}
  }else if(s.presetID==='school'){
    sky(c,'#3e394e','#b08c83');floor(c,720,'#645263');
    for(let i=0;i<4;i++){const x=40+i*235;c.fillStyle='#242a42';c.fillRect(x,125,200,390);const g=c.createLinearGradient(0,150,0,500);g.addColorStop(0,'#8e94b9');g.addColorStop(1,accent);c.fillStyle=g;c.fillRect(x+8,133,184,374);line(c,[[x+100,130],[x+100,510]],'#30344d',8);line(c,[[x,330],[x+200,330]],'#30344d',8);polygon(c,[[x,515],[x+160,515],[x+340,950],[x+80,950]],accent+'15');}
    // Desks stay near the edges, leaving the portrait centre unobstructed.
    for(const [x,y,w] of [[30,770,220],[750,770,220],[110,650,145],[745,650,145]]){polygon(c,[[x,y],[x+w,y],[x+w+25,y+36],[x-15,y+36]],'#75545a');line(c,[[x,y+36],[x-10,y+160]],'#242739',12);line(c,[[x+w,y+36],[x+w+10,y+160]],'#242739',12);}
  }else if(s.presetID==='fantasy'){
    sky(c,'#19283e','#b28c9b');glow(c,520,240,250,accent,.28);
    for(let k=0;k<5;k++){const pts=[[0,1000]];for(let x=-100;x<=1100;x+=70)pts.push([x,320+k*110+rnd()*160]);pts.push([1100,1000]);polygon(c,pts,['#68617b','#57546f','#44465f','#303950','#1d293e'][k]);}
    for(let i=0;i<24;i++){const x=rnd()*1000,y=60+rnd()*640,z=3+rnd()*7;glow(c,x,y,z*5,accent,.3);c.fillStyle=accent;c.fillRect(x-z/2,y-z,z,z*1.5);}
  }else if(s.presetID==='mansion'){
    sky(c,'#1e1b2a','#60434b');floor(c,740,'#705863');
    for(const [x,w] of [[35,180],[270,170],[560,170],[785,180]]){
      c.beginPath();c.moveTo(x,740);c.lineTo(x,300);c.bezierCurveTo(x,130,x+w,130,x+w,300);c.lineTo(x+w,740);c.closePath();c.fillStyle='#111622';c.fill();c.strokeStyle='#936f70';c.lineWidth=12;c.stroke();
      line(c,[[x+w/2,250],[x+w/2,700]],'#504452',4);glow(c,x+w/2,360,100,accent,.12);
    }
    c.fillStyle='#2b2230';c.fillRect(0,70,1000,30);line(c,[[0,105],[1000,105]],accent,3);
  }else{
    sky(c,'#070f1d','#25334b');floor(c,570,'#28435b');
    for(let i=0;i<6;i++){const inset=i*66;const col=i%2?'#304155':'#435167';line(c,[[inset,1000],[inset,80+inset*.6],[1000-inset,80+inset*.6],[1000-inset,1000]],col,16-i*2);line(c,[[inset+20,900],[inset+20,120+inset*.6]],accent+'80',3);}
    for(let i=0;i<18;i++){const left=rnd()<.5,x=left?rnd()*230:770+rnd()*230,y=650+rnd()*350;polygon(c,[[x,y],[x+20+rnd()*50,y-25],[x+70,y+20],[x-20,y+30]],'#101a2b');}
    glow(c,500,530,170,accent,.3);
  }
}
function effect(c,s,rnd){
  const color=s.color;c.globalAlpha=s.opacity;
  if(s.presetID==='smoke'){
    for(let i=0;i<110;i++){const x=rnd()*1200-100,y=660+Math.sin(x/180)*100+(rnd()-.5)*300;glow(c,x,y,70+rnd()*140,color,.035+rnd()*.045);}
  }else if(s.presetID==='laser'){
    c.lineCap='round';for(let i=0;i<3;i++){const pts=[[50+i*70,900],[720+i*100,80]];for(const [w,a] of [[40,.06],[18,.15],[6,.8],[1.5,1]]){c.globalAlpha=s.opacity*a;line(c,pts,w<2?'#ffffff':color,w);}}
  }else if(s.presetID==='rays'){
    for(let i=0;i<14;i++){const x=50+rnd()*900,w=12+rnd()*70;const g=c.createLinearGradient(500,60,x,1000);g.addColorStop(0,color+'b0');g.addColorStop(1,color+'00');polygon(c,[[500,60],[x-w,1000],[x+w,1000]],g);}
    glow(c,500,60,100,color,.7);
  }else if(s.presetID==='flame'){
    for(let i=0;i<35;i++){
      const x=40+rnd()*920,base=920+rnd()*80,h=100+rnd()*380,w=20+rnd()*45;
      glow(c,x,base-h*.3,h*.6,color,.07);
      c.beginPath();c.moveTo(x-w,base);c.bezierCurveTo(x-w*2,base-h*.35,x+w,base-h*.6,x+(rnd()-.5)*100,base-h);c.bezierCurveTo(x+w*.2,base-h*.45,x+w*2,base-h*.2,x+w,base);c.closePath();
      const g=c.createLinearGradient(x,base,x,base-h);g.addColorStop(0,'#fff1c2');g.addColorStop(.3,color+'cc');g.addColorStop(1,color+'00');c.fillStyle=g;c.fill();
    }
  }else if(s.presetID==='sparks'){
    for(let i=0;i<160;i++){const x=rnd()*1000,y=rnd()*1000,r=.5+rnd()*3;glow(c,x,y,r*7,color,.35);c.globalAlpha=s.opacity*(.2+rnd()*.8);line(c,[[x,y],[x+3+rnd()*6,y-3-rnd()*20]],color,r);}
  }else{
    c.lineCap='round';for(const [w,a] of [[65,.04],[30,.1],[12,.5],[3,1]]){c.globalAlpha=s.opacity*a;c.beginPath();c.moveTo(90,820);c.bezierCurveTo(180,170,870,100,920,380);c.strokeStyle=w===3?'#fff9ef':color;c.lineWidth=w;c.stroke();}
    glow(c,920,380,65,color,.6);
  }
}
export function renderCosplayPreset(canvas,input){
  const s=settingsOf(input);if(!canvas?.getContext)throw Error('COSPLAY_CANVAS_REQUIRED');
  // Assigning dimensions resets transforms, blending, clipping and pixels.
  canvas.width=s.width;canvas.height=s.height;const c=canvas.getContext('2d');if(!c)throw Error('COSPLAY_CANVAS_UNAVAILABLE');
  c.save();try{c.scale(s.width/1000,s.height/1000);const rnd=random(s.seed);if(s.preset.kind==='background')scenery(c,s,rnd);else effect(c,s,rnd);}finally{c.restore();}
  return canvas;
}
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
export async function exportCosplayPreset(canvas,input){
  const s=settingsOf(input),copy=canvas?.ownerDocument?.createElement('canvas');
  if(!copy)throw Error('COSPLAY_DOCUMENT_REQUIRED');
  // Fresh private render prevents a changing UI preview from changing an export.
  renderCosplayPreset(copy,s);
  try{
    const png=await new Promise((resolve,reject)=>copy.toBlob(blob=>blob?resolve(blob):reject(Error('COSPLAY_PNG_FAILED')),'image/png'));
    if(png.size>32*1024*1024)throw Error('COSPLAY_PNG_TOO_LARGE');
    const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',await png.arrayBuffer())));
    const identity=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(COSPLAY_PRESET_VERSION+':'+s.presetID))));
    const assetID=`${identity.slice(0,8)}-${identity.slice(8,12)}-5${identity.slice(13,16)}-a${identity.slice(17,20)}-${identity.slice(20,32)}`;
    const provenance=`SUITE original procedural drawing; no third-party image or AI model used. ${COSPLAY_PRESET_VERSION}; preset=${s.presetID}; seed=${s.seed}; color=${s.color}; opacity=${s.opacity}. Not a legal clearance certificate.`;
    const base={assetID,version:hash,expectedSHA256:hash,expectedByteCount:png.size,width:s.width,height:s.height,licenseID:'suite-original-procedural-v1',licenseDeclaration:provenance,permission:'unreviewed'};
    // Backdrop store accepts exact keys. Overlay is deliberately a different contract.
    const manifest=s.preset.kind==='background'?base:{schemaVersion:1,kind:'cosplayOverlay',...base,alpha:'straight',blendMode:'source-over',settings:{presetID:s.presetID,width:s.width,height:s.height,seed:s.seed,color:s.color,opacity:s.opacity},engineVersion:COSPLAY_PRESET_VERSION};
    return {png,manifest,fileName:`suite-${s.presetID}-${hash.slice(0,12)}`};
  }finally{copy.width=1;copy.height=1;}
}
