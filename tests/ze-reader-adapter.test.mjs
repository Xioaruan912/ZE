import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './ze-reader-fixtures.mjs';
function setup(){
 const items=new Map(),opened=[],selected=[],Zotero={
 Items:{getAsync:async id=>items.get(id),getByLibraryAndKeyAsync:async(lib,key)=>[...items.values()].find(x=>x.libraryID===lib&&x.key===key)},
 Libraries:{get:id=>({libraryType:id===1?'user':'group',groupID:42})},
 Reader:{open:async(...args)=>opened.push(args)},getMainWindow:()=>win};
 const win={Zotero_Tabs:{_tabs:[],select:id=>selected.push(id)},ZoteroPane:{getSelectedItems:()=>[items.get(1)],itemsView:{getSortedItems:()=>[...items.values()]},openNoteWindow:async id=>opened.push(['note',id])},focus(){}};
 function pdf(id,libraryID,key){const item={id,libraryID,key,attachmentContentType:'application/pdf',isAttachment:()=>true,getDisplayTitle:()=>key,getFilePathAsync:async()=>'/fixture.pdf'};items.set(id,item);return item;}
 const scope=load(['zotero-adapter.js']);return {adapter:scope.ZEAdapter.create({Zotero,Services:{},rootURI:'test:/'}),Zotero,items,opened,selected,pdf,win};
}
test('PDF tabs retain real tab IDs and distinguish library-qualified attachment keys',async()=>{
 const {adapter,win,pdf}=setup();pdf(1,1,'ABCDEFGH');pdf(2,2,'ABCDEFGH');
 win.Zotero_Tabs._tabs=[{id:'one',type:'reader',title:'A',data:{itemID:1}},{id:'two',type:'reader-unloaded',title:'B',data:{itemID:2}},{id:'lib',type:'library',data:{}}];
 const tabs=await adapter.listPDFTabs(win);assert.equal(tabs.length,2);assert.equal(tabs[1].libraryID,2);assert.equal(tabs[0].tabID,'one');
 assert.equal((await adapter.resolveAttachment(tabs[1])).id,2);
 await assert.rejects(adapter.listPDFTabs({}),/标签页/);
});
test('source links use real personal or group identifiers without guessing pages',()=>{
 const {adapter}=setup();
 assert.equal(adapter.sourceURL({kind:'note',libraryID:1,itemKey:'ABCDEFGH'}),'zotero://select/library/items/ABCDEFGH');
 assert.equal(adapter.sourceURL({kind:'annotation',libraryID:2,itemKey:'ANNKEY01',attachmentKey:'ABCDEFGH',annotationKey:'ANNKEY01',pageIndex:2}),'zotero://open-pdf/groups/42/items/ABCDEFGH?annotation=ANNKEY01&page=3');
});
test('native source navigation prefers annotation key then reliable page index',async()=>{
 const {adapter,pdf,opened}=setup();pdf(1,1,'ABCDEFGH');
 await adapter.openSource({kind:'annotation',libraryID:1,itemKey:'ANNKEY01',attachmentKey:'ABCDEFGH',annotationKey:'ANNKEY01',pageIndex:3},{focus(){}});
 assert.equal(opened[0][1].annotationID,'ANNKEY01');
 await adapter.openSource({kind:'annotation',libraryID:1,itemKey:'ANNKEY01',attachmentKey:'ABCDEFGH',pageIndex:3});
 assert.equal(opened[1][1].pageIndex,3);
 const result=await adapter.openSource({kind:'annotation',libraryID:1,itemKey:'ANNKEY01',attachmentKey:'ABCDEFGH',pageLabel:'iv'});
 assert.equal(opened[2][1],undefined);assert.ok(result.warning);
});
test('scopes are limited to selected items or current visible list',async()=>{
 const {adapter,pdf,win}=setup();pdf(1,1,'ABCDEFGH');pdf(2,2,'IJKLMNOP');
 assert.equal((await adapter.getScopeItems(win,'selected')).length,1);assert.equal((await adapter.getScopeItems(win,'current')).length,2);
 await assert.rejects(adapter.getScopeItems(win,'all'),/范围/);
});

test('group opening creates a tab when a separate reader window already holds the PDF',async()=>{
 const {adapter,Zotero,pdf,win,selected}=setup();pdf(1,1,'ABCDEFGH');let calls=0;
 Zotero.Reader.open=async(id,location,options)=>{calls++;if(options.allowDuplicate)win.Zotero_Tabs._tabs.push({id:'restored',type:'reader',title:'A',data:{itemID:id}});else return {readerWindow:true};};
 const ref={libraryID:1,attachmentKey:'ABCDEFGH',title:'A'};
 await adapter.openAttachment(ref,win);assert.equal((await adapter.listPDFTabs(win)).length,1);
 await adapter.openAttachment(ref,win);assert.equal(calls,1);assert.equal(selected[0],'restored');
});
