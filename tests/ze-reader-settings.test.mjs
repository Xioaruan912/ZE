import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
import {dom} from './ze-reader-dom.mjs';
function setup(){
 const {doc,nodes}=dom(['ze-token','ze-save-token','ze-import-token','ze-clear-token','ze-test-translation','ze-bridge-status','ze-settings-message']);
 const env=environment(),scope=load(['preferences.js','settings.js']),store=scope.ZEPreferences.create(env.Zotero);store.setToken('a'.repeat(32));
 let tests=0,reads=0,picked=null;
 const controller=scope.ZESettings.mount(doc,{store,bridge:{status:()=>({state:'ready',message:'ready'}),testTranslation:async()=>{tests++;return '你好';}},pickTokenFile:async()=>picked,readText:async()=>{reads++;return 'b'.repeat(32);}});
 return {nodes,store,controller,pick:p=>{picked=p;},counts:()=>({tests,reads})};
}
test('settings never reveal saved tokens and import only a user-selected file',async()=>{
 const env=setup();assert.equal(env.nodes.get('ze-token').value,'');assert.equal(env.counts().tests,0);
 await env.nodes.get('ze-import-token').fire('click');assert.equal(env.counts().reads,0);assert.equal(env.store.getToken(),'a'.repeat(32));
 env.pick('/chosen/bridge.token');await env.nodes.get('ze-import-token').fire('click');
 assert.equal(env.counts().reads,1);assert.equal(env.store.getToken(),'b'.repeat(32));assert.equal(env.nodes.get('ze-token').value,'');
 await env.nodes.get('ze-test-translation').fire('click');assert.equal(env.counts().tests,1);
 env.controller.dispose();await env.nodes.get('ze-clear-token').fire('click');assert.equal(env.store.getToken(),'b'.repeat(32));
});
test('manual token entry is cleared after save and invalid values get safe errors',async()=>{
 const env=setup(),input=env.nodes.get('ze-token');input.value='short';await env.nodes.get('ze-save-token').fire('click');
 assert.ok(env.nodes.get('ze-settings-message').textContent);assert.equal(env.store.getToken(),'a'.repeat(32));
 input.value='c'.repeat(32);await env.nodes.get('ze-save-token').fire('click');assert.equal(input.value,'');assert.equal(env.store.getToken(),'c'.repeat(32));
});
