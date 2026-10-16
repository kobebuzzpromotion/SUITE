import {buildPointCurveLUT} from './processing/point-curves.mjs';

function validate(points){
  if(!Array.isArray(points)||points.length<2||points.length>16)throw Error('LUMA_CURVE_POINT_COUNT');
  buildPointCurveLUT(points);
  return points.map(({x,y})=>({x,y}));
}

/** Explicit luminance curve draft. RGB/master curves are never modified here. */
export function mountWebConnectedLumaCurve(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LUMA_CURVE_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','輝度カーブ');root.append(el('h3','輝度カーブ'),el('p','RGB各色・masterとは別の輝度カーブです。入力と出力は0〜255の整数、2〜16点。入力は昇順で、両端の入力0・255は固定です。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','輝度の入力・出力点'));
  const rows=el('div');fields.append(rows);
  const button=(text,type='button')=>{const node=el('button',text);node.type=type;fields.append(node);return node;};
  const add=button('点を追加'),apply=button('輝度カーブを適用','submit'),reset=button('輝度カーブだけをリセット');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,points=[{x:0,y:0},{x:255,y:255}],inputs=[],dirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setLumaCurve==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved;add.disabled=!validSaved||points.length>=16;for(const row of inputs){row.x.disabled=!validSaved||row.endpoint;row.y.disabled=!validSaved;row.remove.disabled=!validSaved||row.endpoint;}root.setAttribute('aria-busy',String(pending));}
  function capture(){const values=inputs.map(row=>{const pair={};for(const key of ['x','y']){const input=row[key],value=Number(input.value);if(input.value.trim()===''||!Number.isInteger(value)||value<0||value>255){input.focus();throw Error('LUMA_CURVE_INPUT');}pair[key]=value;}return pair;});return validate(values);}
  function show(){rows.replaceChildren();inputs=[];points.forEach((point,index)=>{
    const row=el('div'),endpoint=index===0||index===points.length-1,entry={endpoint};
    for(const [key,title] of [['x','入力'],['y','出力']]){const label=el('label',`点${index+1} ${title}`),input=el('input');input.type='number';input.min='0';input.max='255';input.step='1';input.required=true;input.value=String(point[key]);label.append(input);row.append(label);entry[key]=input;}
    const remove=el('button',endpoint?'端点（削除不可）':`点${index+1}を削除`);remove.type='button';entry.remove=remove;row.append(remove);rows.append(row);inputs.push(entry);
    remove.addEventListener('click',()=>{if(disposed||pending||!permitted()||!validSaved||endpoint)return;try{const next=capture();next.splice(index,1);points=validate(next);dirty=true;show();status.textContent='点を削除しました。まだ未適用です。';}catch{status.textContent='各点の整数値と入力の昇順を確認してください。';}});
  });controls();}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;dirty=false;try{const color=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color;points=validate(color&&Object.hasOwn(color,'lumaCurve')?color.lumaCurve:[{x:0,y:0},{x:255,y:255}]);validSaved=true;show();status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';}catch{validSaved=false;points=[];inputs=[];rows.replaceChildren();status.textContent='保存済み輝度カーブを解釈できません。自動置換はせず、明示リセットのみ可能です。';}}
    controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の入力があります。';});
  add.addEventListener('click',()=>{if(disposed||pending||!permitted()||!validSaved||points.length>=16)return;try{
    const next=capture();let index=0;for(let i=1;i<next.length-1;i++)if(next[i+1].x-next[i].x>next[index+1].x-next[index].x)index=i;
    const left=next[index],right=next[index+1];if(right.x-left.x<2)throw Error('LUMA_CURVE_NO_SPACE');
    const x=Math.floor((left.x+right.x)/2),y=Math.round(left.y+(right.y-left.y)*(x-left.x)/(right.x-left.x));next.splice(index+1,0,{x,y});points=validate(next);dirty=true;show();inputs[index+1].x.focus();status.textContent='点を追加しました。入力・出力を調整して適用してください。';
  }catch{status.textContent='各点の整数値と入力の昇順を確認してください。';}});
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!validSaved)return;let value=null;try{if(!clear)value=capture();}catch{status.textContent='2〜16点の整数値、入力の昇順、両端0・255を確認してください。';return;}
    pending=true;const assetID=current.asset.id;controls();try{await session.setLumaCurve(value);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'輝度カーブをリセットしました。RGB・masterは変更していません。':'輝度カーブを適用しました。Recipe保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態・現在のRecipeを確認してください。';}finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
