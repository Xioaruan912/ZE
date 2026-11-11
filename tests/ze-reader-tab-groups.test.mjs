import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
function setup(){
 const scope=load(['preferences.js','tab-groups.js']),env=environment(),store=scope.ZEPreferences.create(env.Zotero);
 let tabs=[{libraryID:1,attachmentKey:'ABCDEFGH',title:'A',tabID:'a'},{libraryID:2,attachmentKey:'ABCDEFGH',title:'B',tabID:'b'},{libraryID:1,attachmentKey:'ABCDEFGH',title:'A',tabID:'a'}];
 const adapter={listPDFTabs:async()=>tabs,openAttachment:async ref=>{if(ref.attachmentKey==='MISSING1')throw Error('private/path');tabs.push({...ref,tabID:'new'});}};
 return {...env,store,adapter,scope,groups:scope.ZETabGroups.create({store,adapter}),setTabs:value=>{tabs=value;}};
}
test('groups persist only library-qualified refs, deduplicate, rename and refuse silent replacement',async()=>{
 const env=setup();await env.groups.saveGroup(' ABE ',{});
 const saved=env.groups.listGroups().groups[0];
 assert.equal(saved.name,'ABE');assert.equal(saved.attachments.length,2);assert.equal(saved.attachments[0].tabID,undefined);
 const reloaded=env.scope.ZETabGroups.create({store:env.store,adapter:env.adapter});assert.equal(reloaded.listGroups().groups[0].name,'ABE');
 await assert.rejects(env.groups.saveGroup('ABE',{}));await assert.rejects(env.groups.saveGroup(' ',{}));
 env.groups.renameGroup('ABE','New');assert.equal(env.groups.listGroups().groups[0].name,'New');
 env.groups.deleteGroup('New');assert.equal(env.groups.listGroups().groups.length,0);
});
test('restore reuses tabs, opens missing refs in order, and continues on unavailable files',async()=>{
 const env=setup();await env.groups.saveGroup('Group',{});
 const doc=env.store.readDocument('groups').data;doc.groups[0].attachments.push({libraryID:1,attachmentKey:'MISSING1',title:'Missing'});
 env.store.writeDocument('groups',doc);env.setTabs([{libraryID:1,attachmentKey:'ABCDEFGH',title:'A',tabID:'a'}]);
 const result=await env.groups.restoreGroup('Group',{});
 assert.equal(result.opened,1);assert.equal(result.reused,1);assert.equal(result.skipped.length,1);
 assert.ok(!result.skipped[0].reason.includes('private'));
 assert.equal((await env.adapter.listPDFTabs()).length,2);
 const again=await env.groups.restoreGroup('Group',{});assert.equal(again.opened,0);assert.equal(again.reused,2);
});
test('damaged local groups remain intact until explicitly rebuilt',async()=>{
 const env=setup(),key='extensions.zotero.zeReader.groups.v1';env.prefs.set(key,'damaged');
 assert.ok(env.groups.listGroups().warning);
 await assert.rejects(env.groups.saveGroup('New',{}));assert.equal(env.prefs.get(key),'damaged');
});

test('restore does not claim a PDF tab opened when the platform only reuses a separate window',async()=>{
 const env=setup();await env.groups.saveGroup('Group',{});env.setTabs([]);env.adapter.openAttachment=async()=>{};
 const result=await env.groups.restoreGroup('Group',{});assert.equal(result.opened,0);assert.equal(result.skipped.length,2);
});
