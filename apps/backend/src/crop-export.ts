/** Shared data/calculation model only. Presence here never certifies a renderer or a device. */
export type CropOrientation = 'portrait'|'landscape';
export interface CropRatio {width:number; height:number}
export interface NormalizedCropRect {x:number; y:number; width:number; height:number}
export interface CropSettings {
  preset_id:string; preset_name:string; width_mm?:number; height_mm?:number;
  orientation:CropOrientation; crop_rect:NormalizedCropRect; crop_ratio?:CropRatio;
  rotation:number; custom_size:boolean; requested_dpi:number;
}
export type CropExportFormat='jpeg'|'tiff'|'png';
export interface ExportSettings {
  format:CropExportFormat; jpeg_quality:number; bit_depth:number; color_space:'sRGB'|'adobeRGB';
  tiff_compression:'none'|'lzw'; preserve_alpha:boolean; metadata:'preserve'|'remove';
  file_name_template:string; requested_dpi:number;
}
export interface PixelDimensions {width:number; height:number}
export interface ResolutionAssessment {
  required?:PixelDimensions; available:PixelDimensions; shortfallPercent:number;
  recommendedDPI?:number; needsUpscale:boolean;
}
export interface PrintPreset {
  id:string; name:string; category:'aSeries'|'bSeries'|'photoPrint'; width_mm:number|null; height_mm:number|null;
  source_url:string|null; available:boolean; notes:string; checked_at:string;
}
/** Verified dimensions; fixture regression checks this portable catalog against Swift. */
export const PRINT_PRESETS:readonly PrintPreset[] = [
  {
    "id": "a.a0-double",
    "name": "A0倍",
    "category": "aSeries",
    "width_mm": 1189,
    "height_mm": 1682,
    "source_url": "https://www.graphic.jp/lineup/poster_xl",
    "available": true,
    "notes": "A0とは別ID。印刷所のA0倍仕上がり寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a0",
    "name": "A0",
    "category": "aSeries",
    "width_mm": 841,
    "height_mm": 1189,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a1",
    "name": "A1",
    "category": "aSeries",
    "width_mm": 594,
    "height_mm": 841,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a2",
    "name": "A2",
    "category": "aSeries",
    "width_mm": 420,
    "height_mm": 594,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a3",
    "name": "A3",
    "category": "aSeries",
    "width_mm": 297,
    "height_mm": 420,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a4",
    "name": "A4",
    "category": "aSeries",
    "width_mm": 210,
    "height_mm": 297,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a5",
    "name": "A5",
    "category": "aSeries",
    "width_mm": 148,
    "height_mm": 210,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "a.a6",
    "name": "A6",
    "category": "aSeries",
    "width_mm": 105,
    "height_mm": 148,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b0-double",
    "name": "B0倍",
    "category": "bSeries",
    "width_mm": 1456,
    "height_mm": 2060,
    "source_url": "https://www.graphic.jp/lineup/poster_xl",
    "available": true,
    "notes": "B0とは別ID。JIS B系の印刷所B0倍。ISO Bと混同しない。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b0",
    "name": "B0",
    "category": "bSeries",
    "width_mm": 1030,
    "height_mm": 1456,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b1",
    "name": "B1",
    "category": "bSeries",
    "width_mm": 728,
    "height_mm": 1030,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b2",
    "name": "B2",
    "category": "bSeries",
    "width_mm": 515,
    "height_mm": 728,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b3",
    "name": "B3",
    "category": "bSeries",
    "width_mm": 364,
    "height_mm": 515,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b4",
    "name": "B4",
    "category": "bSeries",
    "width_mm": 257,
    "height_mm": 364,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b5",
    "name": "B5",
    "category": "bSeries",
    "width_mm": 182,
    "height_mm": 257,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "b.b6",
    "name": "B6",
    "category": "bSeries",
    "width_mm": 128,
    "height_mm": 182,
    "source_url": "https://www.yutakaprint.co.jp/papersize/",
    "available": true,
    "notes": "日本向けJIS B寸法。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.l",
    "name": "L",
    "category": "photoPrint",
    "width_mm": 89,
    "height_mm": 127,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.2l",
    "name": "2L",
    "category": "photoPrint",
    "width_mm": 127,
    "height_mm": 178,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.dsc",
    "name": "DSC",
    "category": "photoPrint",
    "width_mm": 89,
    "height_mm": 119,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.dscw",
    "name": "DSCW",
    "category": "photoPrint",
    "width_mm": 127,
    "height_mm": 169,
    "source_url": "https://ikb135.onlinelab.jp/help/faq/print.php",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.kg",
    "name": "KG",
    "category": "photoPrint",
    "width_mm": 102,
    "height_mm": 152,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.postcard",
    "name": "はがき",
    "category": "photoPrint",
    "width_mm": 100,
    "height_mm": 148,
    "source_url": "https://www2.epson.jp/support/manual/data/ink/scpx7v2/CMP0038_00.PDF",
    "available": true,
    "notes": "郵便はがき100×148mm。KG 102×152mmとは別ID。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.hv",
    "name": "HV",
    "category": "photoPrint",
    "width_mm": 89,
    "height_mm": 158,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "89×158mmを提供する写真のスマイルの候補。他のHV用紙とは寸法が異なる。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.square",
    "name": "スクエア",
    "category": "photoPrint",
    "width_mm": 89,
    "height_mm": 89,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "89mm正方形の候補。スクエアは寸法を一意に決める名称ではない。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.panorama",
    "name": "パノラマ",
    "category": "photoPrint",
    "width_mm": 89,
    "height_mm": 254,
    "source_url": "https://netprint-smile.com/netprint.html",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.cabinet",
    "name": "キャビネ",
    "category": "photoPrint",
    "width_mm": 127,
    "height_mm": 178,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.8cut",
    "name": "八切",
    "category": "photoPrint",
    "width_mm": 165,
    "height_mm": 216,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.6cut",
    "name": "六切",
    "category": "photoPrint",
    "width_mm": 203,
    "height_mm": 254,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.wide6",
    "name": "ワイド六切",
    "category": "photoPrint",
    "width_mm": 203,
    "height_mm": 305,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.4cut",
    "name": "四切",
    "category": "photoPrint",
    "width_mm": 254,
    "height_mm": 305,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.wide4",
    "name": "ワイド四切",
    "category": "photoPrint",
    "width_mm": 254,
    "height_mm": 381,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.large4",
    "name": "大四切",
    "category": "photoPrint",
    "width_mm": 279,
    "height_mm": 356,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.half",
    "name": "半切",
    "category": "photoPrint",
    "width_mm": 356,
    "height_mm": 432,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.full",
    "name": "全紙",
    "category": "photoPrint",
    "width_mm": 457,
    "height_mm": 560,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.largefull",
    "name": "大全紙",
    "category": "photoPrint",
    "width_mm": 508,
    "height_mm": 600,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.doublefull",
    "name": "全倍",
    "category": "photoPrint",
    "width_mm": 540,
    "height_mm": 840,
    "source_url": "https://www.tomicolor.co.jp/services/print/largeprint/",
    "available": true,
    "notes": "トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。",
    "checked_at": "2026-10-03"
  },
  {
    "id": "photo.a3plus",
    "name": "A3ノビ",
    "category": "photoPrint",
    "width_mm": 329,
    "height_mm": 483,
    "source_url": "https://www.epson.jp/products/colorio/supply/paper/use/pro.htm",
    "available": true,
    "notes": "提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。",
    "checked_at": "2026-10-03"
  }
];
export const defaultExportSettings=():ExportSettings=>({
  format:'jpeg',jpeg_quality:100,bit_depth:8,color_space:'sRGB',tiff_compression:'none',
  preserve_alpha:false,metadata:'preserve',file_name_template:'{original}-{sequence}',requested_dpi:300
});
export const defaultCropSettings=():CropSettings=>({
  preset_id:'ratio.original',preset_name:'Original',orientation:'landscape',
  crop_rect:{x:0,y:0,width:1,height:1},rotation:0,custom_size:false,requested_dpi:300
});
/** Recommendations only, never renderer capability claims or an automatic crop change. */
export const EXPORT_PRESETS = [
  {id:'export.web-sns',name:'Web / SNS',settings:defaultExportSettings(),suggestedRatioIDs:['ratio.1:1','ratio.4:5','ratio.16:9','ratio.9:16']},
  {id:'export.standard-print',name:'Standard Print',settings:defaultExportSettings(),suggestedRatioIDs:[]},
  {id:'export.fine-art',name:'Fine Art',settings:{...defaultExportSettings(),format:'tiff',bit_depth:16,color_space:'adobeRGB'},suggestedRatioIDs:[]},
  {id:'export.graphic-text',name:'Graphic / Text PNG',settings:{...defaultExportSettings(),format:'png',preserve_alpha:true},suggestedRatioIDs:[]}
] as const;
export const CROP_RATIOS = [
  {id:'ratio.original',name:'Original'}, {id:'ratio.free',name:'Free'},
  ...[[1,1],[3,2],[2,3],[4,3],[3,4],[5,4],[4,5],[16,9],[9,16]].map(([width,height])=>({
    id:'ratio.'+width+':'+height,name:width+':'+height,ratio:{width:width!,height:height!}
  })), {id:'ratio.custom',name:'Custom Ratio'}
] as const;
const fail=(name:string):never=>{throw new Error(name);};
function object(v:unknown,name:string):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))fail(name);return v as Record<string,unknown>;
}
function keys(v:Record<string,unknown>,required:string[],optional:string[]=[]) {
  if(required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))fail('INVALID_CROP_EXPORT_FIELDS');
}
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
export function validateCropRatio(v:unknown):asserts v is CropRatio{
  const r=object(v,'INVALID_CROP_RATIO');keys(r,['width','height']);
  if(!positive(r.width)||!positive(r.height)||!positive(r.width/r.height))fail('INVALID_CROP_RATIO');
}
export function validateCropRect(v:unknown):asserts v is NormalizedCropRect{
  const r=object(v,'INVALID_CROP_RECT');keys(r,['x','y','width','height']);
  if(typeof r.x!=='number'||typeof r.y!=='number'||!Number.isFinite(r.x)||!Number.isFinite(r.y)||
    r.x<0||r.y<0||!positive(r.width)||!positive(r.height)||r.x+r.width>1+1e-12||r.y+r.height>1+1e-12)fail('INVALID_CROP_RECT');
}
export function validateCropSettings(v:unknown):asserts v is CropSettings{
  const r=object(v,'INVALID_CROP');keys(r,['preset_id','preset_name','orientation','crop_rect','rotation','custom_size','requested_dpi'],['width_mm','height_mm','crop_ratio']);
  if(typeof r.preset_id!=='string'||!r.preset_id.trim()||typeof r.preset_name!=='string'||!r.preset_name.trim()||
    !['portrait','landscape'].includes(r.orientation as string)||!Number.isSafeInteger(r.rotation)||
    (r.rotation as number)%90!==0||typeof r.custom_size!=='boolean'||!positive(r.requested_dpi))fail('INVALID_CROP_SETTINGS');
  validateCropRect(r.crop_rect);
  if(Object.hasOwn(r,'crop_ratio'))validateCropRatio(r.crop_ratio);
  if(Object.hasOwn(r,'width_mm')!==Object.hasOwn(r,'height_mm'))fail('INVALID_CROP_PHYSICAL_SIZE');
  if(Object.hasOwn(r,'width_mm')){
    if(!positive(r.width_mm)||!positive(r.height_mm))fail('INVALID_CROP_PHYSICAL_SIZE');
    if(!r.crop_ratio)fail('INVALID_CROP_PHYSICAL_RATIO');
    const ratio=r.crop_ratio as CropRatio;
    if(Math.abs((r.width_mm as number)/(r.height_mm as number)-ratio.width/ratio.height)>1e-9)fail('INVALID_CROP_PHYSICAL_RATIO');
    if(r.orientation==='portrait'&&(r.width_mm as number)>(r.height_mm as number)||
       r.orientation==='landscape'&&(r.height_mm as number)>(r.width_mm as number))fail('INVALID_CROP_ORIENTATION');
    requiredPixels(r.width_mm as number,r.height_mm as number,r.requested_dpi as number);
  }else if(r.custom_size===true)fail('INVALID_CROP_CUSTOM_SIZE');
  const preset=PRINT_PRESETS.find(p=>p.id===r.preset_id);
  if(preset){
    if(!preset.available||r.custom_size||!positive(preset.width_mm)||!positive(preset.height_mm))fail('INVALID_CROP_PRESET');
    const w=preset.width_mm!,h=preset.height_mm!;
    if(r.width_mm!==(r.orientation==='portrait'?Math.min(w,h):Math.max(w,h))||
       r.height_mm!==(r.orientation==='portrait'?Math.max(w,h):Math.min(w,h)))fail('INVALID_CROP_PRESET_DIMENSIONS');
  }
}
export function validateExportSettings(v:unknown):asserts v is ExportSettings{
  const r=object(v,'INVALID_EXPORT');keys(r,['format','jpeg_quality','bit_depth','color_space','tiff_compression','preserve_alpha','metadata','file_name_template','requested_dpi']);
  if(!['jpeg','tiff','png'].includes(r.format as string)||!Number.isInteger(r.jpeg_quality)||
    (r.jpeg_quality as number)<1||(r.jpeg_quality as number)>100||![8,16].includes(r.bit_depth as number)||
    !['sRGB','adobeRGB'].includes(r.color_space as string)||!['none','lzw'].includes(r.tiff_compression as string)||
    typeof r.preserve_alpha!=='boolean'||!['preserve','remove'].includes(r.metadata as string)||
    !positive(r.requested_dpi))fail('INVALID_EXPORT_SETTINGS');
  if(r.format==='jpeg'&&(r.bit_depth!==8||r.preserve_alpha))fail('INVALID_EXPORT_JPEG');
  if(r.format!=='tiff'&&r.tiff_compression!=='none')fail('INVALID_EXPORT_COMPRESSION');
  if(typeof r.file_name_template!=='string'||!r.file_name_template.trim()||r.file_name_template.length>128||
    /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(r.file_name_template)||r.file_name_template.includes('..')||
    /[{}]/u.test(r.file_name_template.replaceAll('{original}','').replaceAll('{sequence}','')))fail('INVALID_EXPORT_NAMING');
}
function dimension(v:number):number{if(!Number.isSafeInteger(v)||v<=0)fail('INVALID_PIXEL_DIMENSION');return v;}
export function requiredPixels(widthMM:number,heightMM:number,dpi:number=300):PixelDimensions{
  if(!positive(widthMM)||!positive(heightMM)||!positive(dpi))fail('INVALID_PRINT_DIMENSION');
  return {width:dimension(Math.ceil(widthMM/25.4*dpi)),height:dimension(Math.ceil(heightMM/25.4*dpi))};
}
export function centeredRect(sourceWidth:number,sourceHeight:number,ratio:CropRatio):NormalizedCropRect{
  dimension(sourceWidth);dimension(sourceHeight);validateCropRatio(ratio);
  const target=ratio.width/ratio.height,source=sourceWidth/sourceHeight;
  const width=Math.min(1,target/source),height=Math.min(1,source/target);
  const result={x:(1-width)/2,y:(1-height)/2,width,height};validateCropRect(result);return result;
}
/** source dimensions are EXIF-upright, BEFORE recipe rotation; rotate exactly once. */
export function resolutionAssessment(sourceWidth:number,sourceHeight:number,crop:CropSettings):ResolutionAssessment{
  dimension(sourceWidth);dimension(sourceHeight);validateCropSettings(crop);
  const swap=Math.abs(crop.rotation%180)===90,w=swap?sourceHeight:sourceWidth,h=swap?sourceWidth:sourceHeight;
  const available={width:dimension(Math.floor(w*crop.crop_rect.width+1e-9)),height:dimension(Math.floor(h*crop.crop_rect.height+1e-9))};
  if(crop.crop_ratio){
    const actual=w*crop.crop_rect.width/(h*crop.crop_rect.height),target=crop.crop_ratio.width/crop.crop_ratio.height;
    if(Math.abs(actual-target)>1e-6*Math.max(1,target))fail('CROP_RECT_RATIO_MISMATCH');
  }
  if(crop.width_mm===undefined||crop.height_mm===undefined)return {available,shortfallPercent:0,needsUpscale:false};
  const required=requiredPixels(crop.width_mm,crop.height_mm,crop.requested_dpi);
  const scale=Math.min(1,available.width/required.width,available.height/required.height);
  return {required,available,shortfallPercent:(1-scale)*100,
    recommendedDPI:Math.floor(Math.min(available.width*25.4/crop.width_mm,available.height*25.4/crop.height_mm)),
    needsUpscale:available.width<required.width||available.height<required.height};
}
/** Raw pixel buffer estimate, NOT compressed output-file size or peak process memory. */
export function estimatedUncompressedBytes(pixels:PixelDimensions,settings:ExportSettings):number{
  dimension(pixels.width);dimension(pixels.height);validateExportSettings(settings);
  return dimension(pixels.width*pixels.height*(settings.preserve_alpha?4:3)*settings.bit_depth/8);
}
