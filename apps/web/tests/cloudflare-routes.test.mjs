import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedSignInURL,validatedSignOutURL} from '../src/editor-ui.mjs';
import {SitesClient} from '../src/sites-client.mjs';

const base='https://suite.example.test/?view=author';

test('Cloudflare sign-in/out routes are exact same-origin root returns',()=>{
  assert.equal(validatedSignInURL('/auth/complete?return_to=/',base),'https://suite.example.test/auth/complete?return_to=/');
  assert.equal(validatedSignOutURL('/auth/logout?return_to=/',base),'https://suite.example.test/auth/logout?return_to=/');
  for(const value of ['https://other.example.test/auth/complete?return_to=/','/auth/complete?return_to=https://other.example.test','/auth/complete?return_to=/&return_to=/'])
    assert.throws(()=>validatedSignInURL(value,base),/SIGNIN_ROUTE_UNCONFIRMED/);
  for(const value of ['https://other.example.test/auth/logout?return_to=/','/auth/logout?return_to=//other.example.test','/auth/logout?return_to=/&next=/'])
    assert.throws(()=>validatedSignOutURL(value,base),/SIGNOUT_ROUTE_UNCONFIRMED/);
});

test('Cloudflare-aware Web client asks the server for revoking logout route',async()=>{
  const calls=[];
  const client=new SitesClient({baseURL:'https://suite.example.test',fetcher:async(path,options)=>{
    calls.push({path,options});return new Response(JSON.stringify({signOutURL:'/auth/logout?return_to=/'}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  assert.deepEqual(await client.logout(),{signOutURL:'/auth/logout?return_to=/'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'https://suite.example.test/trial/logout');
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.headers['X-Suite-Trial'],'1');
});
