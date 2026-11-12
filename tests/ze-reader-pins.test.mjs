import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,plugin} from './ze-reader-fixtures.mjs';
import {windowDOM,Node,settle} from './ze-reader-ui-fixtures.mjs';
function api(){assert.ok(fs.existsSync(new URL('pins.js',plugin)),'pins module must exist');return load(['pins.js']).ZEPins;}
// Independent PDF viewport oracle: PDF origin bottom-left; CSS origin top-left.
function viewport(scale=1,rotation=0){
 const forward=([x,y])=>rotation===90?[y,x]:rotation===180?[600-x,y]:rotation===270?[800-y,600-x]:[x,800-y];
 const inverse=([x,y])=>rotation===90?[y,x]:rotation===180?[600-x,y]:rotation===270?[600-y,800-x]:[x,800-y];
 return {width:(rotation%180?800:600)*scale,height:(rotation%180?600:800)*scale,rotation,
  convertToPdfPoint:(x,y)=>inverse([x/scale,y/scale]),
  convertToViewportRectangle:rect=>[...forward(rect.slice(0,2)).map(x=>x*scale),...forward(rect.slice(2)).map(x=>x*scale)]};
}
function renderEnv(rotation=0){
 const env=windowDOM(),calls=[],canvases=[];
 env.doc.createElement=tag=>env.doc.createElementNS('',tag);
 const create=env.doc.createElementNS;
 env.doc.createElementNS=(ns,tag)=>{const node=create(ns,tag);if(tag==='canvas'){canvases.push(node);node.getContext=()=>({canvas:node});node.toDataURL=()=> 'data:image/png;base64,fixture';}return node;};
 const page={view:[0,0,600,800],rotate:rotation,getViewport:({scale})=>viewport(scale,rotation),render(options){calls.push(options);return {promise:Promise.resolve(),cancel(){calls.push('cancel');}};}};
 const app={pdfDocument:{getPage:async index=>{assert.equal(index,3);return page;}}};
 return {...env,calls,canvases,page,app};
}
for(const rotation of [0,90,180,270])for(const scale of [0.5,2])test(`dragging preserves PDF coordinates at rotation ${rotation}, scale ${scale} and CSS resizing`,()=>{
 const pins=api(),v=viewport(scale,rotation),rect=[100,200,250,350],vr=v.convertToViewportRectangle(rect),box={left:30,top:40,width:v.width*0.75,height:v.height*0.75};
 const point=(x,y)=>({x:box.left+x*0.75,y:box.top+y*0.75});
 const position=pins.dragPosition({id:3,viewport:v,pdfPage:{view:[0,0,600,800]}},box,point(vr[0],vr[1]),point(vr[2],vr[3]));
 assert.equal(position.pageIndex,2);assert.deepEqual(Array.from(position.rects[0]),rect);
});
test('selection rectangles are bounded, invalid selections are rejected and reversed drags clamp to the page',()=>{
 const pins=api();
 assert.deepEqual(Array.from(pins.selectionPosition({position:{pageIndex:1,rects:[[5,8,12,16],[20,3,30,9]]}}).rects[0]),[5,3,30,16]);
 for(const position of [{pageIndex:-1,rects:[[0,0,1,1]]},{pageIndex:0,rects:[[0,0,NaN,1]]},{pageIndex:0,rects:[]},{pageIndex:0,rects:[[0,0,1,1]],nextPageRects:[[0,0,1,1]]}])assert.throws(()=>pins.selectionPosition({position}));
 const p=pins.dragPosition({id:3,viewport:viewport(),pdfPage:{view:[0,0,600,800]}},{left:0,top:0,width:600,height:800},{x:200,y:100},{x:-20,y:900});
 assert.deepEqual(Array.from(p.rects[0]),[0,0,200,700]);
});
for(const rotation of [0,90,180,270])test('rendering clips the source PDF region, caps pixels and releases canvas at rotation '+rotation,async()=>{
 const pins=api(),env=renderEnv(rotation),position={pageIndex:2,rects:[[100,200,250,350]]};
 const image=await pins.renderRegion({...env,document:env.doc,position,request:{}});
 assert.ok(image.startsWith('data:image/png;'));assert.equal(env.calls.length,1);
 const {viewport:v,transform}=env.calls[0],r=v.convertToViewportRectangle([98,198,252,352]);
 assert.deepEqual(Array.from(transform),[1,0,0,1,-Math.floor(Math.min(r[0],r[2])),-Math.floor(Math.min(r[1],r[3]))]);
 assert.equal(env.canvases[0].width,0);assert.equal(env.canvases[0].height,0);
 let dimensions;env.page.getViewport=({scale})=>viewport(scale*20,rotation);env.page.render=options=>{dimensions=[options.canvasContext.canvas.width,options.canvasContext.canvas.height];return {promise:Promise.resolve()};};
 await pins.renderRegion({...env,document:env.doc,position:{pageIndex:2,rects:[[0,0,600,800]]},request:{}});
 assert.ok(dimensions[0]*dimensions[1]<=4_200_000);assert.ok(Math.max(...dimensions)<=4096);
});
test('render cancellation cancels PDF.js and frees the canvas without changing the PDF',async()=>{
 const pins=api(),env=renderEnv(),request={};let reject,cancelled=0;
 env.page.render=()=>({promise:new Promise((_,r)=>reject=r),cancel(){cancelled++;reject(Error('cancelled'));}});
 const promise=pins.renderRegion({...env,document:env.doc,position:{pageIndex:2,rects:[[0,0,50,50]]},request});await settle();
 request.cancelled=true;request.cancel();await assert.rejects(promise);assert.equal(cancelled,1);assert.equal(env.canvases[0].width,0);
});

test('content PDF.js receives cloned options and arrays while its own viewport instance is retained',async()=>{
 const pins=api(),env=renderEnv(),cloned=new WeakSet(),original=env.page.getViewport;let calls=0,nativeViewport;
 const cloneInto=(value,win)=>{assert.equal(win,env.doc.defaultView);calls++;const clone=Array.isArray(value)?Array.from(value):{...value};cloned.add(clone);return clone;};
 env.page.getViewport=options=>{assert.ok(cloned.has(options));nativeViewport=original(options);const convert=nativeViewport.convertToViewportRectangle;nativeViewport.convertToViewportRectangle=rect=>{assert.ok(cloned.has(rect));return convert(rect);};return nativeViewport;};
 env.page.render=options=>{assert.ok(cloned.has(options));assert.equal(options.viewport,nativeViewport);return {promise:Promise.resolve()};};
 await pins.renderRegion({...env,document:env.doc,position:{pageIndex:2,rects:[[1,2,30,40]]},request:{},cloneInto});assert.equal(calls,3);
});

test('an awaited PDF page is unwrapped before invoking its prototype methods',async()=>{
 const pins=api(),env=renderEnv(),wrapped={};let unwrapped=false;
 env.app.pdfDocument.getPage=async()=>wrapped;
 const unwrap=value=>{if(value===wrapped){unwrapped=true;return env.page;}return value;};
 const result=await pins.renderRegion({...env,document:env.doc,position:{pageIndex:2,rects:[[1,2,30,40]]},request:{},unwrap});
 assert.ok(unwrapped);assert.ok(result.startsWith('data:image/png;'));assert.equal(env.calls.length,1);
});

function managerEnv(renderer){
 const host=windowDOM(),frame=windowDOM(),pdf=windowDOM(),listeners=new Map(),opened=[],errors=[];
 host.win.innerWidth=1200;host.win.innerHeight=850;host.win.screen={availWidth:1400,availHeight:1000};
 const item={id:42,key:'PDF00042',libraryID:1,parentID:5,isAttachment:()=>true,attachmentContentType:'application/pdf',fileExists:async()=>true};
 const parent={getField:()=> 'A paper',getDisplayTitle:()=> 'A paper'};
 const Zotero={Items:{get:id=>id===42?item:parent,getAsync:async()=>item},Reader:{_readers:[],registerEventListener(type,fn){listeners.set(type,fn);},unregisterEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},open:async(...args)=>opened.push(args)},getMainWindow:()=>host.win,logError:e=>errors.push(e)};
 const pageView={id:3,viewport:viewport(),pdfPage:{view:[0,0,600,800]},div:new Node()};pageView.div.getBoundingClientRect=()=>({left:0,top:0,width:600,height:800});
 const iframe=frame.doc.createElementNS('','iframe');iframe.ownerDocument=frame.doc;iframe.getBoundingClientRect=()=>({left:0,top:0,width:600,height:800});frame.root.appendChild(iframe);pdf.win.innerWidth=600;pdf.win.innerHeight=800;
 pdf.win.PDFViewerApplication={pdfDocument:{},pdfViewer:{pagesCount:3,getPageView:index=>index===2?pageView:null}};
 const reader={itemID:42,_type:'pdf',_window:host.win,_iframeWindow:frame.win,_internalReader:{_primaryView:{_iframeWindow:pdf.win,_iframe:iframe}},_isUninitialized:false,_isTransient(){return false;}};
 const pins=api(),manager=pins.create({Zotero,id:'test',renderRegion:renderer||(async()=> 'data:image/png;base64,image')});
 const fire=(type,extra={})=>{const appended=[];listeners.get(type)?.({reader,doc:frame.doc,params:{},append:node=>appended.push(node),...extra});return appended;};
 return {host,frame,pdf,Zotero,reader,manager,fire,listeners,opened,item,errors};
}
test('official reader hooks open region selection, Escape cancels it, and all resources are removed on stop',async()=>{
 const env=managerEnv();env.manager.start();assert.equal(env.listeners.size,2);
 const [button]=env.fire('renderToolbar');assert.ok(button);await button.fire('click');
 assert.ok(env.frame.root.querySelector('[data-ze-pin-overlay]'));await env.pdf.win.fire('keydown',{key:'Escape'});
 assert.equal(env.frame.root.querySelector('[data-ze-pin-overlay]'),null);
 env.manager.dispose();assert.equal(env.listeners.size,0);assert.equal(env.host.root.querySelector('panel'),null);
});

test('native transient method is invoked with its receiver; previews have neither pin entry nor PDF views',()=>{
 const pins=api(),env=managerEnv();let calls=0;
 env.reader._isTransient=function(){assert.equal(this,env.reader);calls++;return true;};env.manager.start();
 assert.equal(env.fire('renderToolbar').length,0);
 assert.equal(env.fire('renderTextSelectionPopup',{params:{annotation:{position:{pageIndex:0,rects:[[0,0,10,10]]}}}}).length,0);
 assert.equal(pins.views(env.reader).length,0);assert.equal(calls,3);
 env.reader._isTransient=function(){assert.equal(this,env.reader);return false;};
 assert.equal(env.fire('renderToolbar').length,1);assert.equal(pins.views(env.reader).length,1);env.manager.dispose();
});

test('already-open native readers receive a visible pin entry on plugin startup',()=>{
 const env=managerEnv(),target=env.frame.doc.createElementNS('','div');target.className='custom-sections';env.frame.root.appendChild(target);
 const query=env.frame.doc.querySelector.bind(env.frame.doc);
 env.frame.doc.querySelector=selector=>selector==='.toolbar .end .custom-sections'?target:query(selector);
 env.Zotero.Reader._readers=[env.reader];env.manager.start();
 assert.equal(target.querySelectorAll('[data-ze-pin-toolbar]').length,1);
 assert.equal(target.querySelector('[data-ze-pin-toolbar]').textContent,'固定');env.manager.dispose();
});
test('region pointer events pin a PDF image without creating annotations; source remains bound to its attachment',async()=>{
 const regions=[],env=managerEnv(async args=>{regions.push(args.position);return 'data:image/png;base64,image';});env.manager.start();
 await env.fire('renderToolbar')[0].fire('click');const overlay=env.frame.root.querySelector('[data-ze-pin-overlay]');
 await overlay.fire('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});
 await overlay.fire('pointermove',{pointerId:1,clientX:250,clientY:250});
 await overlay.fire('pointerup',{pointerId:1,clientX:250,clientY:250});await settle();
 assert.equal(regions.length,1);assert.deepEqual(Array.from(regions[0].rects[0]),[100,550,250,700]);
 assert.equal(env.frame.root.querySelector('[data-ze-pin-overlay]'),null);assert.ok(env.host.root.querySelector('img'));
 const buttons=env.host.root.querySelectorAll('button');await buttons.find(x=>x.textContent==='返回原文').fire('click');
 assert.equal(env.opened[0][0],42);assert.equal(env.opened[0][1].pageIndex,2);assert.equal(env.opened[0][1].position.pageIndex,2);
 await buttons.find(x=>x.textContent==='折叠').fire('click');assert.equal(env.host.root.querySelector('img').hidden,true);assert.equal(env.host.root.querySelector('img').style.display,'none');
 env.manager.dispose();
});
test('three-pin limit includes pending renders, and disposed windows cannot receive late images',async()=>{
 const pending=[],env=managerEnv(()=>new Promise(resolve=>pending.push(resolve)));env.manager.start();
 const position={pageIndex:2,rects:[[0,0,20,20]]};
 for(let i=0;i<4;i++)await env.fire('renderTextSelectionPopup',{params:{annotation:{position}}})[0].fire('click');
 assert.equal(pending.length,3);assert.match(env.host.root.textContent,/最多.*3/);
 env.manager.releaseWindow(env.host.win);for(const resolve of pending)resolve('data:image/png;base64,late');await settle();
 assert.equal(env.host.root.querySelector('panel'),null);env.manager.dispose();
});
test('clear and close remove images, missing sources do not open another attachment and preview readers are excluded',async()=>{
 const env=managerEnv();env.manager.start();env.reader._isTransient=()=>true;assert.equal(env.fire('renderToolbar').length,0);env.reader._isTransient=()=>false;
 const position={pageIndex:2,rects:[[0,0,20,20]]};await env.fire('renderTextSelectionPopup',{params:{annotation:{position}}})[0].fire('click');await settle();
 env.item.key='REPLACED';await env.host.root.querySelectorAll('button').find(x=>x.textContent==='返回原文').fire('click');assert.equal(env.opened.length,0);assert.match(env.host.root.textContent,/不可用/);
 await env.host.root.querySelectorAll('button').find(x=>x.textContent==='关闭').fire('click');assert.equal(env.host.root.querySelector('img'),null);
 env.manager.dispose();
});

test('outer overlay does not enter native PDF window capture/bubble paths for mouse, pen or touch',async()=>{
 for(const pointerType of ['mouse','pen','touch']){
  const env=managerEnv();env.manager.start();await env.fire('renderToolbar')[0].fire('click');
  const outer=env.frame.root.querySelector('[data-ze-pin-overlay]'),inner=env.pdf.root.querySelector('[data-ze-pin-overlay]'),overlay=outer||inner;let nativeDown=false;
  // Model native inner-window capture on down and bubble on up; iframe boundaries stop propagation.
  const dispatch=async(type,event)=>{let stopped=false;if(inner&&type==='pointerdown')nativeDown=true;
   await overlay.fire(type,{...event,pointerType,stopPropagation(){stopped=true;}});
   if(inner&&type==='pointerup'&&!stopped)nativeDown=false;
  };
  await dispatch('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});await dispatch('pointerup',{pointerId:1,clientX:200,clientY:200});
  assert.equal(nativeDown,false,'plugin drag must not leave native pointer flags set');assert.ok(outer);assert.equal(inner,null);env.manager.dispose();
 }
});

test('iframe offset and CSS scale map to the correct inner PDF region; moving the frame cancels selection',async()=>{
 const positions=[],env=managerEnv(async args=>{positions.push(args.position);return 'data:image/png;base64,image';});env.manager.start();
 const frame=env.reader._internalReader._primaryView._iframe;let box={left:20,top:50,width:300,height:400};frame.getBoundingClientRect=()=>box;
 await env.fire('renderToolbar')[0].fire('click');let overlay=env.frame.root.querySelector('[data-ze-pin-overlay]');
 await overlay.fire('pointerdown',{button:0,pointerId:1,clientX:70,clientY:100});await overlay.fire('pointerup',{pointerId:1,clientX:145,clientY:175});await settle();
 assert.deepEqual(Array.from(positions[0].rects[0]),[100,550,250,700]);
 await env.host.root.querySelectorAll('button').find(x=>x.textContent==='框选').fire('click');overlay=env.frame.root.querySelector('[data-ze-pin-overlay]');
 await overlay.fire('pointerdown',{button:0,pointerId:1,clientX:70,clientY:100});box={...box,left:100};await overlay.fire('pointerup',{pointerId:1,clientX:145,clientY:175});
 assert.equal(positions.length,1);assert.match(env.host.root.textContent,/页面位置已变化/);env.manager.dispose();
});

test('a pending or replaced PDF canvas does not prevent a visible drag rectangle or change its page coordinates',async()=>{
 const regions=[],env=managerEnv(async args=>{regions.push(args.position);return 'data:image/png;base64,image';});
 const page=env.pdf.win.PDFViewerApplication.pdfViewer.getPageView(2),wrapper=new Node();
 wrapper.getBoundingClientRect=()=>({left:30,top:40,width:600,height:800});
 page.div.querySelector=selector=>selector==='.canvasWrapper'?wrapper:null;
 page.canvas=new Node('canvas');page.canvas.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});
 env.manager.start();await env.fire('renderToolbar')[0].fire('click');const overlay=env.frame.root.querySelector('[data-ze-pin-overlay]');
 await overlay.fire('pointerdown',{button:0,pointerId:1,clientX:130,clientY:140});
 const selection=overlay.children[1];assert.equal(selection.style.display,'block','feedback must begin at pointerdown');
 await overlay.fire('pointermove',{pointerId:1,clientX:280,clientY:290});
 assert.equal(selection.style.left,'130px');assert.equal(selection.style.top,'140px');assert.equal(selection.style.width,'150px');assert.equal(selection.style.height,'150px');
 page.canvas=new Node('canvas');page.canvas.getBoundingClientRect=()=>({left:30,top:40,width:600,height:800});
 await overlay.fire('pointerup',{pointerId:1,clientX:280,clientY:290});await settle();
 assert.equal(regions.length,1);assert.deepEqual(Array.from(regions[0].rects[0]),[100,550,250,700]);env.manager.dispose();
});

test('card drag moves its native popup, folding changes actual display, and current PDF is used after a tab switch',async()=>{
 const env=managerEnv();env.manager.start();await env.fire('renderTextSelectionPopup',{params:{annotation:{position:{pageIndex:2,rects:[[0,0,20,20]]}}}})[0].fire('click');await settle();
 const panel=env.host.root.querySelector('panel'),moves=[];panel.moveTo=(x,y)=>moves.push([x,y]);
 await env.host.root.querySelector('strong').fire('pointerdown',{button:0,pointerId:1,screenX:100,screenY:100});await env.host.win.fire('pointermove',{screenX:120,screenY:130});await env.host.win.fire('pointerup');
 assert.deepEqual(moves,[[panel.popupPoint.x+20,panel.popupPoint.y+30]]);
 env.host.win.Zotero_Tabs={selectedID:'other'};const other={...env.reader,_internalReader:{...env.reader._internalReader}};env.Zotero.Reader.getByTabID=id=>id==='other'?other:null;
 await env.host.root.querySelectorAll('button').find(x=>x.textContent==='框选').fire('click');assert.ok(env.frame.root.querySelector('[data-ze-pin-overlay]'));env.manager.dispose();
});

test('a source navigation waiting on I/O does not open another reader after plugin disposal',async()=>{
 const env=managerEnv();env.manager.start();await env.fire('renderTextSelectionPopup',{params:{annotation:{position:{pageIndex:2,rects:[[0,0,20,20]]}}}})[0].fire('click');await settle();
 let release;env.item.fileExists=()=>new Promise(resolve=>release=resolve);
 const navigating=env.host.root.querySelectorAll('button').find(x=>x.textContent==='返回原文').fire('click');await settle();env.manager.dispose();release(true);await navigating;assert.equal(env.opened.length,0);
});
