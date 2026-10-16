// Two-Asset read-only synthetic Editor fixture: the old edge geometry must
// never remain actionable while a different Asset's Proxy is loading.
import './batch-final-browser-fixture.mjs';

const find=selector=>document.querySelector(selector);
const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const expect=(condition,label)=>{if(!condition)throw Error(`CANVAS_EDGE_SWITCH_ASSERT: ${label}`);};
async function waitFor(predicate,label){
  const deadline=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>deadline)throw Error(`CANVAS_EDGE_SWITCH_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
async function run(){
  const after=find('#after-image'),left=find('[data-canvas-edge="left"]');
  await waitFor(()=>after.complete&&after.naturalWidth===12&&!left.disabled,
    'first saved Asset and edge handles');
  const firstURL=after.src;
  find(`#library-list [data-asset-id="${second}"]`).click();
  expect(left.disabled||find('#after-figure').hidden,
    'old Asset handle cannot act while the next Asset loads');
  await waitFor(()=>find('#asset-name').textContent==='second.NONRAW'&&
    after.complete&&after.naturalWidth===12&&after.src!==firstURL&&
    !left.disabled,'second Asset fresh Proxy and edge handles');
  expect(left.getAttribute('aria-label').includes('0%')&&
    find('#canvas-left').value==='0','second Asset has its own neutral margins');
  const secondURL=after.src;
  find(`#library-list [data-asset-id="${first}"]`).click();
  await waitFor(()=>find('#asset-name').textContent==='first.NONRAW'&&
    after.complete&&after.src!==secondURL&&!left.disabled,
    'first Asset restores only after its fresh Proxy');
  expect(left.getAttribute('aria-label').includes('0%'),
    'no stale Asset margin or handle survives switch');
  find('#edge-switch-verdict').textContent=JSON.stringify({
    result:'CANVAS-EDGE-SWITCH-BROWSER-PASS',boundary:'two synthetic non-RAW Assets',
    original:'UNMODIFIED',raw:'NOT_RUN',cloud:'NOT_RUN'});
}
find('#edge-switch-run').addEventListener('click',()=>{void run().catch(error=>{
  find('#edge-switch-verdict').textContent=JSON.stringify({
    result:'CANVAS-EDGE-SWITCH-BROWSER-FAIL',error:error.message,stack:error.stack});
});});
