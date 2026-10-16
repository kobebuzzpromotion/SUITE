const LIMIT=1024*1024;
const LABELS={exposure:'露光量（EV）',contrast:'コントラスト（倍率）',saturation:'彩度（倍率）',highlights:'ハイライト',shadows:'シャドウ',whites:'白レベル',blacks:'黒レベル',vibrance:'自然な彩度'};

/** Explicit public XMP subset import; parsing and Recipe mutation stay in Session. */
export function mountWebConnectedXMP(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('XMP_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','XMP設定取込');root.append(el('h3','XMP設定取込'),el('p','1 MiB以下のローカルXMPから、露光量・コントラスト・彩度・ハイライト・シャドウ・白レベル・黒レベル・自然な彩度の8設定に対応します。未記載の値は維持します。露光量±4 EVを超える値や非対応項目は拒否し、黙って省略しません。Adobeの現像・描画結果を再現する機能ではありません。'));
  const fields=el('fieldset');fields.append(el('legend','内容確認と適用'));
  const fileLabel=el('label','XMPファイル'),file=el('input');file.type='file';file.accept='.xmp,application/rdf+xml,application/xml,text/xml';fileLabel.append(file);fields.append(fileLabel);
  const inspect=el('button','設定内容を確認');inspect.type='button';fields.append(inspect);
  const list=el('ul');fields.append(list);
  const agreeLabel=el('label','Adobeの描画再現ではなく、SUITE設定への取込であることに同意して適用する'),agree=el('input');agree.type='checkbox';agreeLabel.prepend(agree);fields.append(agreeLabel);
  const apply=el('button','確認した設定を適用');apply.type='button';fields.append(apply);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,status);container.append(root);
  let current=null,signature=null,proposal=null,pending=false,disposed=false,generation=0;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();inspect.disabled=!file.files?.length||typeof session.proposeXMPImport!=='function';agree.disabled=!proposal;apply.disabled=!proposal||!agree.checked||typeof session.applyProposedXMPImport!=='function';root.setAttribute('aria-busy',String(pending));}
  function invalidate(){generation++;proposal=null;agree.checked=false;list.replaceChildren();}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.afterURL??null]);if(next!==signature){const lost=Boolean(proposal)||Boolean(file.files?.length);signature=next;invalidate();file.value='';if(lost)status.textContent='画像またはRecipeが変わったため、ファイル選択・確認済み設定・同意を破棄しました。';}controls();}
  file.addEventListener('change',()=>{invalidate();status.textContent='選択したファイルの設定内容を確認してください。';controls();});agree.addEventListener('change',controls);
  function showError(error){
    status.replaceChildren(el('span','取込できませんでした。非対応設定・数値範囲・XMP形式を確認してください。'));
    if(Array.isArray(error?.properties)&&error.properties.length){const entries=el('ul');for(const property of error.properties)entries.append(el('li',String(property)));status.append(el('p','対応外の項目（省略して適用はしません）：'),entries);}
    else if(error?.property)status.append(el('p',`対象項目：${String(error.property)}。露光量の対応範囲は−4〜＋4 EVです。`));
  }
  inspect.addEventListener('click',async()=>{
    if(disposed||pending||!permitted()||inspect.disabled)return;const selected=file.files?.[0];
    if(!selected||!Number.isSafeInteger(selected.size)||selected.size<1||selected.size>LIMIT||typeof selected.arrayBuffer!=='function'){status.textContent='空ではない1 MiB以下のXMPを選択してください。';return;}
    invalidate();const token=generation;pending=true;controls();
    try{const bytes=await selected.arrayBuffer();if(disposed||token!==generation)return;if(!permitted()||bytes.byteLength!==selected.size||bytes.byteLength>LIMIT)throw Error('XMP_FILE_CHANGED');
      const next=await session.proposeXMPImport(new Uint8Array(bytes));if(disposed||token!==generation)return;
      if(!permitted()||!next?.binding||!next.controls||typeof next.controls!=='object'||Array.isArray(next.controls)||Object.entries(next.controls).some(([key,value])=>!Object.hasOwn(LABELS,key)||!Number.isFinite(value)||Math.abs(value)>(key==='exposure'?4:['contrast','saturation'].includes(key)?2:100)||['contrast','saturation'].includes(key)&&value<0))throw Error('XMP_PROPOSAL_INVALID');
      proposal=next;for(const [key,value] of Object.entries(next.controls))list.append(el('li',`${LABELS[key]}：${value}`));status.textContent=Object.keys(next.controls).length?'まだ未適用です。設定一覧と解釈を確認して同意してください。':'対応設定が記載されていません。';if(!Object.keys(next.controls).length)proposal=null;
    }catch(error){if(!disposed&&token===generation){proposal=null;showError(error);}}
    finally{pending=false;if(!disposed)controls();}
  });
  apply.addEventListener('click',async()=>{
    if(disposed||pending||!permitted()||apply.disabled)return;const value=proposal,assetID=current.asset.id;pending=true;controls();
    try{await session.applyProposedXMPImport({...value,interpretation:'suite-controls-not-adobe-render'});if(!disposed&&current?.asset?.id===assetID){invalidate();status.textContent='記載されたSUITE設定を適用しました。Recipe保存は既存の保存操作で行ってください。';}}
    catch(error){if(!disposed){invalidate();showError(error);}}
    finally{pending=false;if(!disposed)controls();}
  });
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;invalidate();if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
