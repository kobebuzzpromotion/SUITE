import {validateSceneGeometry} from './processing/scene-geometry-contract.mjs';

const FIELDS=[
  ['angle','任意回転角（度）',-180,180,.1,0],
  ['scale','拡大率',.2,5,.01,1],['aspect','縦横比補正',.2,5,.01,1],
  ['x','横位置（offset X）',-2,2,.01,0],['y','縦位置（offset Y）',-2,2,.01,0],
  ['vertical','垂直遠近',-.8,.8,.01,0],['horizontal','水平遠近',-.8,.8,.01,0],
];
const settings=controls=>({schemaVersion:1,engineVersion:'suite-scene-geometry-1',mode:'manual',controls});
const identity=()=>settings({angle:0,flipX:false,flipY:false,aspect:1,scale:1,x:0,y:0,vertical:0,horizontal:0});
const corners=()=>[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];

/** Manual pre-rotation geometry draft; old 90-degree rotation/crop remain separate. */
export function mountWebConnectedGeometry(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('GEOMETRY_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','任意幾何補正');
  root.append(el('h3','任意幾何補正'),el('p','顔・マスク補正後、既存の90度回転・トリミング前に適用します。変形で画像の外側になる部分には透明余白が生じます。既存の回転・切抜き設定は変更しません。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','角度・形状・位置'));
  const modeLabel=el('label','補正方式'),mode=el('select');for(const [value,text] of [['manual','手動パラメータ'],['guided','4点ガイド']]){const option=el('option',text);option.value=value;mode.append(option);}modeLabel.append(mode);fields.append(modeLabel);
  const manualFields=el('fieldset');manualFields.append(el('legend','手動パラメータ'));fields.append(manualFields);
  const inputs=new Map();
  for(const [key,title,min,max,step,value] of FIELDS){const label=el('label',title),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.required=true;input.value=String(value);label.append(input);manualFields.append(label);inputs.set(key,input);}
  for(const [key,title] of [['flipX','左右反転'],['flipY','上下反転']]){const label=el('label',title),input=el('input');input.type='checkbox';label.prepend(input);manualFields.append(label);inputs.set(key,input);}
  const guidedFields=el('fieldset');guidedFields.append(el('legend','対応する4点'),el('p','元画像と変形先は、90度回転・トリミング前の枠で指定します。左上が(0,0)、右下が(1,1)。元画像の点1は変形先の点1へ、同じ番号同士が対応します。初期順序は左上→右上→右下→左下です。'));
  const guidedInputs=new Map();for(const [key,title] of [['sourcePoints','元画像'],['destinationPoints','変形先']]){const group=el('fieldset');group.append(el('legend',title));const rows=corners().map((point,index)=>{const pair={};for(const axis of ['x','y']){const label=el('label',`${title} 点${index+1} ${axis}`),input=el('input');input.type='number';input.min='0';input.max='1';input.step='.01';input.required=true;input.value=String(point[axis]);label.append(input);group.append(label);pair[axis]=input;}return pair;});guidedInputs.set(key,rows);guidedFields.append(group);}fields.append(guidedFields);
  const apply=el('button','幾何補正を適用');apply.type='submit';const reset=el('button','任意幾何だけをリセット');reset.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setSceneGeometry==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved;mode.disabled=!validSaved;manualFields.hidden=mode.value!=='manual';guidedFields.hidden=mode.value!=='guided';manualFields.disabled=!validSaved||manualFields.hidden;guidedFields.disabled=!validSaved||guidedFields.hidden;for(const input of inputs.values())input.disabled=!validSaved;root.setAttribute('aria-busy',String(pending));}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;dirty=false;try{
      const extra=value?.recipe?.parameters?.extendedParameters;
      const saved=validateSceneGeometry(extra&&Object.hasOwn(extra,'sceneGeometry')?extra.sceneGeometry:identity());
      mode.value=saved.mode;const manual=saved.mode==='manual'?saved.controls:identity().controls;
      for(const [key,input] of inputs)if(input.type==='checkbox')input.checked=manual[key];else input.value=String(manual[key]);
      for(const [key,rows] of guidedInputs){const points=saved.mode==='guided'?saved[key]:corners();rows.forEach((pair,index)=>{for(const axis of ['x','y'])pair[axis].value=String(points[index][axis]);});}
      validSaved=true;status.textContent=lost?'写真またはRecipeが変わったため、未適用の幾何設定を破棄しました。':'';
    }catch{validSaved=false;status.textContent='保存済み幾何設定を解釈できません。自動置換はしません。明示リセットは可能です。';}}
    controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の幾何設定があります。';});
  mode.addEventListener('change',()=>{dirty=true;status.textContent='方式を変更しました。まだ未適用です。手動値と4点ガイドは相互変換しません。';controls();});
  function readNumber(input){const number=Number(input.value);if(input.value.trim()===''||!Number.isFinite(number)||number<Number(input.min)||number>Number(input.max)){input.focus();throw Error('GEOMETRY_INPUT');}return number;}
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!validSaved)return;let value=null;
    if(!clear){try{if(mode.value==='guided'){const draft={schemaVersion:1,engineVersion:'suite-scene-geometry-1',mode:'guided'};for(const [key,rows] of guidedInputs)draft[key]=rows.map(pair=>({x:readNumber(pair.x),y:readNumber(pair.y)}));value=validateSceneGeometry(draft);}else if(mode.value==='manual'){const draft={};for(const [key,input] of inputs)draft[key]=input.type==='checkbox'?input.checked:readNumber(input);value=validateSceneGeometry(settings(draft));}else throw Error('GEOMETRY_MODE');}catch{status.textContent='各項目の数値範囲と、4点の対応・配置を確認してください。';return;}}
    pending=true;const assetID=current.asset.id;controls();
    try{await session.setSceneGeometry(value);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'任意幾何をリセットしました。90度回転・切抜きは維持しています。':'幾何補正を適用しました。Recipe保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。遠近変形の組合せ・権限・処理状態・原寸情報を確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
