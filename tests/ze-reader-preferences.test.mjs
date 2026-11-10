import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
function setup(){const env=environment();return {...env,store:load(['preferences.js']).ZEPreferences.create(env.Zotero)};}
test('local documents round trip and damaged or future data is never silently replaced',()=>{
 const {store,prefs}=setup(),key='extensions.zotero.zeReader.groups.v1';
 assert.equal(store.readDocument('groups').data.version,1);
 store.writeDocument('groups',{version:1,groups:[{name:'ABE',attachments:[{libraryID:1,attachmentKey:'ABCDEFGH',title:'A'}]}]});
 assert.equal(store.readDocument('groups').data.groups[0].name,'ABE');
 for(const raw of ['broken','{"version":2,"groups":[]}', '{"version":1,"groups":[{}]}']){
  prefs.set(key,raw);assert.ok(store.readDocument('groups').warning);
  assert.throws(()=>store.writeDocument('groups',{version:1,groups:[]}));
  assert.equal(prefs.get(key),raw);
 }
 store.writeDocument('groups',{version:1,groups:[]},{replaceInvalid:true});assert.equal(store.readDocument('groups').warning,'');
});
test('tokens are validated, trimmed, cleared and never echoed in errors',()=>{
 const {store}=setup(),token='x'.repeat(32);
 store.setToken(' '+token+'\n');assert.equal(store.getToken(),token);
 for(const bad of ['short','x'.repeat(32)+'\ny'])assert.throws(()=>store.setToken(bad),e=>!e.message.includes(bad));
 store.setToken('');assert.equal(store.getToken(),'');
});
test('malformed group refs and rule schemas cannot be persisted',()=>{
 const {store}=setup();
 assert.throws(()=>store.writeDocument('groups',{version:1,groups:[{name:'A',attachments:[{libraryID:1,attachmentKey:'bad',title:'A'}]}]}));
 assert.throws(()=>store.writeDocument('rules',{version:1,rules:[{name:'方法',kind:'anything',value:'x'}]}));
 assert.throws(()=>store.readDocument('unknown'));
});
test('failed preference writes keep the prior serialized document',()=>{
 const {store,prefs,Zotero}=setup();store.writeDocument('rules',{version:1,rules:[]});
 const old=prefs.get('extensions.zotero.zeReader.rules.v1');
 Zotero.Prefs.set=()=>{throw Error('disk full');};
 assert.throws(()=>store.writeDocument('rules',{version:1,rules:[{name:'A',kind:'tag',value:'a'}]}));
 assert.equal(prefs.get('extensions.zotero.zeReader.rules.v1'),old);
});
