// Reuse the existing authenticated synthetic non-RAW Editor/Worker fixture.
// Its own probe is intentionally not run: this checks the After edge handles.
import './canvas-expand-editor-browser-fixture.mjs';

const find=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`CANVAS_EDGE_EDITOR_ASSERT: ${label}`);};
const delay=()=>new Promise(resolve=>setTimeout(resolve,20));
async function waitFor(predicate,label){
  const deadline=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>deadline)throw Error(`CANVAS_EDGE_EDITOR_TIMEOUT: ${label}`);
    await delay();
  }
}
function key(button,value){
  button.focus();
  button.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
}
function touchDrag(button,delta){
  const rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const event=(type,clientX)=>new PointerEvent(type,{bubbles:true,cancelable:true,
    pointerId:19,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,
    clientX,clientY:y});
  button.dispatchEvent(event('pointerdown',x));
  button.dispatchEvent(event('pointermove',x+delta));
  button.dispatchEvent(event('pointerup',x+delta));
}
async function run(){
  const after=find('#after-image'),figure=find('#after-figure'),save=find('#save-indicator');
  find('#canvas-expand-section').open=true;
  await waitFor(()=>after.complete&&after.naturalWidth===120&&
    !find('[data-canvas-edge="left"]').disabled,'initial real Worker Preview and handles');
  expect(figure.contains(find('.canvas-expand-edge-overlay')),'overlay mounted only on After figure');
  const left=find('[data-canvas-edge="left"]'),right=find('[data-canvas-edge="right"]');
  const top=find('[data-canvas-edge="top"]'),bottom=find('[data-canvas-edge="bottom"]');
  expect(['left','right','top','bottom'].every(edge=>
    figure.querySelector(`[data-canvas-edge="${edge}"]`)?.getBoundingClientRect().width>=44),
  'four keyboard-focusable 44px handles');
  key(left,'ArrowLeft');
  await waitFor(()=>Number(find('#canvas-left').value)===1&&after.naturalWidth===121&&
    !left.disabled,'keyboard edge changes existing Recipe and Worker Preview');
  expect(save.textContent.includes('未保存'),'edge change remains an unsaved draft');
  const previousWidth=after.naturalWidth;
  touchDrag(right,12);
  await waitFor(()=>Number(find('#canvas-right').value)>0&&after.naturalWidth>previousWidth&&
    !right.disabled,'touch pointer drag changes only right edge');
  const rightPercent=Number(find('#canvas-right').value);
  expect(Number(find('#canvas-left').value)===1,'right drag preserves left margin');
  find('[data-action="undo"]').click();
  await waitFor(()=>Number(find('#canvas-right').value)===0&&!right.disabled,'Undo');
  find('[data-action="redo"]').click();
  await waitFor(()=>Number(find('#canvas-right').value)===rightPercent&&!right.disabled,'Redo');
  key(top,'ArrowUp');
  await waitFor(()=>Number(find('#canvas-top').value)===1&&after.naturalHeight===81&&
    !top.disabled,'top edge keyboard action');
  key(bottom,'ArrowDown');
  await waitFor(()=>Number(find('#canvas-bottom').value)===1&&after.naturalHeight===82&&
    !bottom.disabled,'bottom edge keyboard action');
  const exposure=find('#exposure');
  exposure.value='0.5';exposure.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>Number(exposure.value)===.5&&!left.disabled,'other adjustment applied');
  find('[data-action="save"]').click();
  await waitFor(()=>save.textContent.includes('保存済み')&&!left.disabled,'Recipe saved');
  find('[data-action="reload"]').click();
  await waitFor(()=>Number(find('#canvas-right').value)===rightPercent&&
    Number(find('#canvas-left').value)===1&&Number(find('#canvas-top').value)===1&&
    Number(find('#canvas-bottom').value)===1&&Number(exposure.value)===.5&&
    !left.disabled,'Recipe reloaded with other adjustment intact');
  const beforeFinal=after.naturalWidth;
  find('[data-action="export-png"]').click();
  await waitFor(()=>!find('#download-link').hidden&&
    find('#download-link').href.startsWith('blob:'),'saved Final link');
  const blob=await (await fetch(find('#download-link').href)).blob();
  const image=await createImageBitmap(blob);
  expect(blob.type==='image/png'&&image.width===240+Math.round(240*.01)+
    Math.round(240*rightPercent/100)&&image.height===164,
  'actual Worker Final dimensions reflect saved margins');
  image.close();
  expect(beforeFinal===120+Math.round(120*.01)+Math.round(120*rightPercent/100),
    'Proxy independently projects margins');
  find('[data-view="before"]').click();
  expect(left.disabled,'Before view disables After edge handle');
  find('[data-view="after"]').click();
  await waitFor(()=>!left.disabled,'After restores edge handle');
  Date.now=()=>Date.parse('2100-01-01T00:00:00Z');
  await waitFor(()=>left.disabled&&find('#trial-ended-notice').textContent.includes('TRIAL_EXPIRED'),
    'expired trial disables edge handle');
  find('#edge-verdict').textContent=JSON.stringify({result:'CANVAS-EDGE-EDITOR-BROWSER-PASS',
    boundary:'synthetic authenticated non-RAW Editor -> Recipe -> real Worker Proxy/Final',
    rightPercent,finalWidth:240+Math.round(240*.01)+Math.round(240*rightPercent/100),
    raw:'NOT_RUN',physicalTouch:'NOT_RUN',cloud:'NOT_RUN'});
}
find('#edge-run').addEventListener('click',()=>{void run().catch(error=>{
  find('#edge-verdict').textContent=JSON.stringify({result:'CANVAS-EDGE-EDITOR-BROWSER-FAIL',
    error:error.message,stack:error.stack,left:find('#canvas-left')?.value,
    right:find('#canvas-right')?.value,afterWidth:find('#after-image')?.naturalWidth});
});});
