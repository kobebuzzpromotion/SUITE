/** Shared Editor input contract. Per-image capacity/upscale checks stay in Final. */
export function parseExportSizeSelection(kind,{value='',width='',height='',strategy='',background='white'}={}){
  const integer=(raw,max)=>{const text=String(raw).trim();if(!/^\d+$/.test(text))throw Error('出力サイズは1以上の整数で指定してください。');const number=Number(text);if(!Number.isSafeInteger(number)||number<1||number>max)throw Error(`出力サイズは1〜${max}の整数で指定してください。`);return number;};
  if(kind==='original')return {kind};
  if(kind==='percentage')return {kind,value:integer(value,100)};
  if(['width','height','long-edge','short-edge'].includes(kind))return {kind,value:integer(value,16384)};
  if(['fit','dimensions'].includes(kind))return {kind,width:integer(width,16384),height:integer(height,16384)};
  if(kind==='exact-dimensions'){
    if(!['pad','crop','stretch'].includes(strategy))throw Error('縦横比が異なる場合の処理を選択してください。');
    const colors={white:[255,255,255],gray:[128,128,128],black:[0,0,0]};
    if(strategy==='pad'&&!Object.hasOwn(colors,background))throw Error('余白の色を選択してください。');
    return {kind,width:integer(width,16384),height:integer(height,16384),strategy,...(strategy==='pad'?{background:colors[background]}:{})};
  }
  throw Error('EXPORT_SIZE_MODE_UNSUPPORTED');
}
