import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {landingCopy,mountLanding} from '../src/landing-ui.mjs';
import {bindLandingAccount} from '../src/landing-account.mjs';
import {mountAdminLogin} from '../src/admin-login-ui.mjs';

test('official top copy is complete and rendered as HTML text, separate from the photograph',()=>{
  const expected=[
    'SUITE','Your Vision. Fully Realized.','写真はクラウドへ。','編集を、一台のパソコンから解き放つ。',
    '肌・人物補正はプラン内。チケット不要、枚数課金なし。','色も、質感も、思いのままに。',
    'AI編集モードで、さらに表現を広げる。','※AI生成は別料金を予定','編集へ',
    '神戸発、安心の日本品質の写真編集アプリ。','Made in Kobe, Japan.'
  ];
  assert.deepEqual(landingCopy,expected);
  const previous=globalThis.document;
  const classes=[];globalThis.document={body:{classList:{add:name=>classes.push(name)}}};
  try{
    const root={innerHTML:''};mountLanding(root);
    assert.deepEqual(classes,['editorial-home-page']);
    const renderedText=root.innerHTML.replace(/<[^>]*>/g,'').replace(/\s+/g,' ');
    for(const phrase of expected)assert.ok(renderedText.includes(phrase),`missing: ${phrase}`);
    assert.match(root.innerHTML,/src="\/assets\/suite-editorial-hero-clean\.png"/);
    assert.doesNotMatch(root.innerHTML,/SUITE_group_editorial_D_fullcopy\.png/);
    assert.match(root.innerHTML,/href="\/\?view=editor"/);
    assert.match(root.innerHTML,/id="landing-logout" type="button" hidden/);
    assert.match(root.innerHTML,/クラウド保存・作者提出・管理機能は現在未接続/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('editor has an explicit route back to the top and landing uses the verified sign-out route',()=>{
  const editor=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../src/bootstrap.mjs',import.meta.url),'utf8');
  assert.match(editor,/<a href="\/">トップへ<\/a>/);
  assert.match(bootstrap,/bindLandingAccount\(/);
});

test('top logout is absent for anonymous use and uses a verified route for an authenticated owner',async()=>{
  let click;
  const logout={hidden:true,disabled:false,addEventListener:(name,fn)=>{assert.equal(name,'click');click=fn;}};
  const status={hidden:true,textContent:''};
  const root={querySelector:selector=>selector==='#landing-logout'?logout:selector==='#landing-account-status'?status:null};
  const destinations=[];
  const trial={logout:async()=>({signOutURL:'/auth/logout?return_to=/'})};
  const deps={root,trial,navigate:href=>destinations.push(href),validateSignOutURL:value=>{
    assert.equal(value,'/auth/logout?return_to=/');return 'https://suite-preview.example/auth/logout?return_to=/';
  }};
  assert.equal(bindLandingAccount({...deps,context:{principal:null}}),false);
  assert.equal(logout.hidden,true);
  assert.equal(bindLandingAccount({...deps,context:{mode:'SITES',principal:{id:'owner'}}}),true);
  assert.equal(logout.hidden,false);
  await click();
  assert.deepEqual(destinations,['https://suite-preview.example/auth/logout?return_to=/']);
});

test('invalid old session exposes a recovery logout without treating anonymous editing as signed in',async()=>{
  let click;
  const logout={hidden:true,disabled:false,addEventListener:(_name,fn)=>{click=fn;}};
  const status={hidden:true,textContent:''};
  const root={querySelector:selector=>selector==='#landing-logout'?logout:selector==='#landing-account-status'?status:null};
  const destinations=[];
  const available=bindLandingAccount({root,context:{mode:'SITES',principal:null,endedReason:'SESSION_INVALID'},
    trial:{logout:()=>{throw Error('must not call invalid-session API');}},navigate:href=>destinations.push(href),
    validateSignOutURL:href=>{assert.equal(href,'/auth/logout?return_to=/');return 'https://suite-preview.example/auth/logout?return_to=/';}});
  assert.equal(available,true);assert.equal(logout.hidden,false);
  await click();
  assert.deepEqual(destinations,['https://suite-preview.example/auth/logout?return_to=/']);
});

test('admin password screen retains exact top and server logout routes',()=>{
  const previous=globalThis.document;
  const create=tag=>({tag,children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){},addEventListener(){}});
  const root=create('root');root.replaceChildren=()=>{root.children=[];};
  globalThis.document={querySelector:selector=>selector==='#app'?root:null,createElement:create};
  try{
    mountAdminLogin({}, {principal:{id:'owner',role:'admin'},signInURL:'/auth/complete?return_to=/'});
    const links=[];const visit=node=>{if(node.tag==='a')links.push([node.textContent,node.href]);for(const child of node.children||[])visit(child);};
    visit(root);
    assert.deepEqual(links,[['トップへ','/'],['ログアウト','/auth/logout?return_to=/']]);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('public build includes only the clean hero asset',()=>{
  const source=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
  assert.match(source,/suite-editorial-hero-clean\.png/);
  assert.doesNotMatch(source,/SUITE_group_editorial_D_fullcopy\.png/);
});
