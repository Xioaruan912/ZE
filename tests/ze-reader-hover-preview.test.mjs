import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './ze-reader-fixtures.mjs';
import {windowDOM,settle} from './ze-reader-ui-fixtures.mjs';
function clock(){let id=0;const tasks=new Map();return {setTimeout(fn,ms){const key=++id;tasks.set(key,{fn,ms});return key;},clearTimeout(key){tasks.delete(key);},run(ms){for(const [key,task] of [...tasks])if(task.ms===ms){tasks.delete(key);task.fn();}},size:()=>tasks.size};}
function controller(resolvePDF){
 const events=[],timer=clock(),api=load(['hover-preview.js']).ZEHoverPreview;
 const view={loading:(item)=>events.push(['loading',item.id]),pdf:att=>events.push(['pdf',att.id]),message:text=>events.push(['message',text]),hide:()=>events.push(['hide'])};
 return {api,timer,events,controller:api.create({resolvePDF,view,setTimeout:timer.setTimeout,clearTimeout:timer.clearTimeout})};
}
test('ordinary hovering activates one delayed preview without a modifier key',async()=>{
 let calls=0;const env=controller(async item=>{calls++;return {attachment:item};}),item={id:1};
 env.controller.hover(item,{screenX:10,screenY:20});assert.equal(env.timer.size(),1);assert.equal(calls,0);
 env.controller.hover(item,{screenX:11,screenY:20});assert.equal(env.timer.size(),1);
 env.timer.run(350);await settle();assert.equal(calls,1);assert.deepEqual(env.events.filter(x=>x[0]==='pdf'),[['pdf',1]]);env.controller.dispose();
});
test('late PDF resolutions cannot replace a newer hovered paper',async()=>{
 const pending=new Map(),env=controller(item=>new Promise(resolve=>pending.set(item.id,resolve)));
 env.controller.hover({id:1},{},true);env.timer.run(350);await settle();
 env.controller.hover({id:2},{},true);env.timer.run(350);await settle();
 pending.get(2)({attachment:{id:2}});await settle();pending.get(1)({attachment:{id:1}});await settle();
 assert.deepEqual(env.events.filter(x=>x[0]==='pdf'),[['pdf',2]]);env.controller.dispose();
});
test('moving into the popup keeps it open and leaving or disposing cancels work',async()=>{
 let resolve;const env=controller(()=>new Promise(done=>{resolve=done;}));env.controller.hover({id:1},{},true);env.timer.run(350);await settle();
 env.controller.leave();env.controller.enterPopup();env.timer.run(220);assert.equal(env.timer.size(),0);
 env.controller.leave();env.timer.run(220);resolve({attachment:{id:1}});await settle();assert.equal(env.events.some(x=>x[0]==='pdf'),false);
 env.controller.hover({id:2},{},true);env.controller.dispose();env.controller.leave();env.timer.run(350);assert.equal(env.timer.size(),0);
});
test('missing files and resolver errors produce readable messages without raw paths',async()=>{
 const env=controller(async()=>({reason:'PDF 尚未下载'}));env.controller.hover({id:1},{},true);env.timer.run(350);await settle();assert.deepEqual(env.events.find(x=>x[0]==='message'),['message','PDF 尚未下载']);env.controller.dispose();
 const failed=controller(async()=>{throw Error('C:/private/path.pdf');});failed.controller.hover({id:1},{},true);failed.timer.run(350);await settle();
 assert.ok(failed.events.some(x=>x[0]==='message'));assert.ok(!JSON.stringify(failed.events).includes('private'));failed.controller.dispose();
});
test('PDF resolution uses a local PDF instead of a missing preferred file or non-PDF attachment',async()=>{
 const api=load(['hover-preview.js']).ZEHoverPreview,items=new Map();
 const pdf=(id,exists)=>({id,isAttachment:()=>true,attachmentContentType:'application/pdf',fileExists:async()=>exists});
 items.set(1,pdf(1,false));items.set(2,{id:2,isAttachment:()=>true,attachmentContentType:'text/html'});items.set(3,pdf(3,true));
 const Zotero={Items:{getAsync:async id=>items.get(id)}},paper={isRegularItem:()=>true,getBestAttachment:async()=>items.get(1),getAttachments:()=>[1,2,3]};
 assert.equal((await api.resolvePDF(Zotero,paper)).attachment.id,3);assert.match((await api.resolvePDF(Zotero,items.get(1))).reason,/下载|缺失/);
 assert.equal((await api.resolvePDF(Zotero,{deleted:true})).attachment,undefined);
});
test('a native preview closed during browser initialization never starts a reader',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);env.win.innerWidth=1100;env.win.innerHeight=800;
 let opened=0;const Zotero={Reader:{openPreview:async()=>{opened++;throw Error('must not run');}}};
 const view=load(['hover-preview.js']).ZEHoverPreview.createView({Zotero,win:env.win});
 const rendering=view.pdf({id:1},{});await settle();view.hide();await rendering;
 assert.equal(opened,0);assert.equal(env.root.querySelector('browser'),null);assert.equal(timer.size(),0);view.dispose();
});
test('a reader returned after native popup disposal is uninitialized instead of displayed',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);let resolve,closed=0;
 const Zotero={Reader:{openPreview:()=>new Promise(done=>{resolve=done;})}};
 const view=load(['hover-preview.js']).ZEHoverPreview.createView({Zotero,win:env.win});
 const rendering=view.pdf({id:1},{});const browser=env.root.querySelector('browser');assert.ok(browser);
 browser.contentDocument={documentURI:'resource://zotero/reader/reader.html'};await browser.fire('DOMContentLoaded',{target:browser.contentDocument});await settle();
 view.dispose();resolve({uninit(){closed++;},_open(){throw Error('must not run');}});await rendering;
 assert.equal(closed,1);assert.equal(env.root.querySelector('panel'),null);assert.equal(timer.size(),0);
});

test('native item-tree row events open the preview and document listeners are released on disposal',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);
 const item={id:1,isAttachment:()=>true,attachmentContentType:'application/pdf',fileExists:async()=>true};
 env.win.ZoteroPane={itemsView:{id:'item-tree-main',getRow:index=>index===0?{ref:item}:null}};
 const Zotero={Reader:{openPreview:async()=>{throw Error('browser not loaded');}}};
 const controller=load(['hover-preview.js']).ZEHoverPreview.attach({Zotero,win:env.win});
 const target={closest:selector=>selector.startsWith('[id*')?{id:'item-tree-main-row-0'}:null};
 await env.doc.fire('mousemove',{target,altKey:true,screenX:100,screenY:200});timer.run(350);await settle();
 assert.ok(env.root.querySelector('panel'));assert.equal(env.root.querySelector('panel').state,'open');
 await env.doc.fire('keydown',{key:'Escape'});assert.equal(env.root.querySelector('panel').state,'closed');
 controller.dispose();assert.equal(env.root.querySelector('panel'),null);assert.equal(timer.size(),0);
 assert.equal([...env.doc.handlers.values()].reduce((n,set)=>n+set.size,0),0);
});

test('native preview starts at page one, pages locally and opens the displayed page only on request',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);let page=1,options,closed=0;const opened=[];
 const reader={async _open(value){options=value;return true;},canGoto:direction=>direction==='prev'?page>1:page<3,goto:direction=>{page+=direction==='next'?1:-1;},uninit(){closed++;}};
 const Zotero={Reader:{openPreview:async()=>reader,open:async(...args)=>opened.push(args)}};
 const view=load(['hover-preview.js']).ZEHoverPreview.createView({Zotero,win:env.win});
 const rendering=view.pdf({id:42},{}),browser=env.root.querySelector('browser');browser.contentDocument={documentURI:'resource://zotero/reader/reader.html'};
 await browser.fire('DOMContentLoaded',{target:browser.contentDocument});await rendering;
 assert.equal(options.location.pageIndex,0);assert.equal(opened.length,0);
 await env.root.querySelectorAll('button').find(node=>node.textContent==='下一页').fire('click');
 await env.root.querySelectorAll('button').find(node=>node.textContent==='打开 PDF').fire('click');
 assert.equal(opened[0][0],42);assert.equal(opened[0][1].pageIndex,1);assert.equal(closed,1);assert.equal(timer.size(),0);view.dispose();
});

test('a descendant blur keeps preview controls usable while actual window blur closes it',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);
 const item={id:1,isAttachment:()=>true,attachmentContentType:'application/pdf',fileExists:async()=>true};
 env.win.ZoteroPane={itemsView:{id:'item-tree-main',getRow:()=>({ref:item})}};
 const owner=load(['hover-preview.js']).ZEHoverPreview.attach({Zotero:{Reader:{openPreview(){throw Error('not loaded');}}},win:env.win});
 const target={closest:selector=>selector.startsWith('[id*')?{id:'item-tree-main-row-0'}:null};
 await env.doc.fire('mousemove',{target,altKey:true});timer.run(350);await settle();const panel=env.root.querySelector('panel');
 await env.win.fire('blur',{target:env.root.querySelector('button')});assert.equal(panel.state,'open');
 await env.win.fire('blur',{target:env.win});assert.equal(panel.state,'closed');owner.dispose();
});

test('leaving the row before the hover delay cancels native activation',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);
 const item={id:1,isRegularItem:()=>true};env.win.ZoteroPane={itemsView:{id:'item-tree-main',getRow:()=>({ref:item})}};
 const owner=load(['hover-preview.js']).ZEHoverPreview.attach({Zotero:{},win:env.win});
 const target={closest:selector=>selector.startsWith('[id*')?{id:'item-tree-main-row-0'}:null};
 await env.doc.fire('mousemove',{target});await env.doc.fire('mousemove',{target:env.doc});
 timer.run(350);timer.run(220);await settle();assert.equal(env.root.querySelector('panel'),null);assert.equal(timer.size(),0);owner.dispose();
});

test('late native page stats enable navigation and synchronize the displayed and opened page',async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);const stats={},requests=[],opened=[];
 const reader={_internalReader:{_state:{primaryViewStats:stats}},async _open(){return true;},canGoto:direction=>stats[direction==='prev'?'canNavigateToPreviousPage':'canNavigateToNextPage'],goto:direction=>requests.push(direction),uninit(){}};
 const view=load(['hover-preview.js']).ZEHoverPreview.createView({Zotero:{Reader:{openPreview:async()=>reader,open:async(...args)=>opened.push(args)}},win:env.win});
 const rendering=view.pdf({id:42},{}),browser=env.root.querySelector('browser');browser.contentDocument={documentURI:'resource://zotero/reader/reader.html'};
 await browser.fire('DOMContentLoaded',{target:browser.contentDocument});await rendering;
 const buttons=env.root.querySelectorAll('button'),prev=buttons.find(x=>x.textContent==='上一页'),next=buttons.find(x=>x.textContent==='下一页');assert.equal(next.disabled,true);
 Object.assign(stats,{pageIndex:0,pagesCount:3,canNavigateToPreviousPage:false,canNavigateToNextPage:true});timer.run(200);assert.equal(next.disabled,false);
 await next.fire('click');assert.deepEqual(requests,['next']);assert.match(env.root.querySelector('[role]').textContent,/第 1 页/);
 Object.assign(stats,{pageIndex:1,canNavigateToPreviousPage:true});timer.run(200);assert.equal(prev.disabled,false);assert.match(env.root.querySelector('[role]').textContent,/第 2 页/);
 await prev.fire('click');assert.deepEqual(requests,['next','prev']);Object.assign(stats,{pageIndex:0,canNavigateToPreviousPage:false});timer.run(200);
 assert.equal(prev.disabled,true);await buttons.find(x=>x.textContent==='打开 PDF').fire('click');assert.equal(opened[0][1].pageIndex,0);assert.equal(timer.size(),0);view.dispose();
});

for(const rejects of [false,true])test('closing during native initialization defers first uninit and removes late observers on '+(rejects?'rejection':'success'),async()=>{
 const env=windowDOM(),timer=clock();Object.assign(env.win,timer);let release,calls=0;const gate=new Promise(resolve=>{release=resolve;}),observers=new Set();
 const reader={async _open(){await gate;for(let i=0;i<13;i++)observers.add(i);if(rejects)throw Error('late failure');return true;},uninit(){calls++;if(this._isUninitialized)return;this._isUninitialized=true;observers.clear();}};
 const view=load(['hover-preview.js']).ZEHoverPreview.createView({Zotero:{Reader:{openPreview:async()=>reader}},win:env.win});
 const rendering=view.pdf({id:1},{}),browser=env.root.querySelector('browser');browser.contentDocument={documentURI:'resource://zotero/reader/reader.html'};
 await browser.fire('DOMContentLoaded',{target:browser.contentDocument});await settle();view.dispose();
 assert.equal(calls,0,'native uninit must wait until initialization can no longer register observers');release();await rendering;
 assert.equal(calls,1);assert.equal(observers.size,0);assert.equal(env.root.querySelector('panel'),null);assert.equal(timer.size(),0);
});
