var ZEPins = {
 isTransient(reader){return typeof reader?._isTransient==='function'?reader._isTransient():reader?._isTransient===true;},
 rect(value,bounds){
  if(!value||value.length!==4||!Array.from(value).every(Number.isFinite))throw Error('无法识别选区坐标');
  let [x1,y1,x2,y2]=value;[x1,x2]=[Math.min(x1,x2),Math.max(x1,x2)];[y1,y2]=[Math.min(y1,y2),Math.max(y1,y2)];
  if(bounds){x1=Math.max(x1,bounds[0]);y1=Math.max(y1,bounds[1]);x2=Math.min(x2,bounds[2]);y2=Math.min(y2,bounds[3]);}
  if(x2<=x1||y2<=y1)throw Error('请框选有面积的区域');return [x1,y1,x2,y2];
 },
 selectionPosition(annotation){
  const p=annotation?.position;
  if(p?.nextPageRects?.length)throw Error('选区跨页，请分两次固定');
  if(!Number.isInteger(p?.pageIndex)||p.pageIndex<0||!p.rects?.length)throw Error('当前选区没有可固定的 PDF 区域');
  const rects=Array.from(p.rects,r=>ZEPins.rect(r));
  return {pageIndex:p.pageIndex,rects:[[Math.min(...rects.map(r=>r[0])),Math.min(...rects.map(r=>r[1])),Math.max(...rects.map(r=>r[2])),Math.max(...rects.map(r=>r[3]))]]};
 },
 dragPosition(page,box,start,end){
  if(!(box.width>0&&box.height>0)||!Number.isInteger(page.id)||page.id<1)throw Error('PDF 页面尚未就绪');
  const v=page.viewport,point=p=>v.convertToPdfPoint((p.x-box.left)*v.width/box.width,(p.y-box.top)*v.height/box.height);
  return {pageIndex:page.id-1,rects:[ZEPins.rect([...point(start),...point(end)],page.pdfPage.view)]};
 },
 async renderRegion({app,document,position,request,cloneInto,unwrap=value=>value}){
  if(request.cancelled)throw Error('已取消');
  const p=ZEPins.selectionPosition({position}),page=unwrap(await app.pdfDocument.getPage(p.pageIndex+1));
  if(request.cancelled)throw Error('已取消');
  if(typeof page?.getViewport!=='function'||typeof page.render!=='function')throw Error('PDF 页面尚未就绪，请稍后重试');
  const raw=p.rects[0],rect=ZEPins.rect([raw[0]-2,raw[1]-2,raw[2]+2,raw[3]+2],page.view);
  const into=value=>cloneInto?cloneInto(value,document.defaultView):value;
  const rotation=app.pdfViewer?.getPageView?.(p.pageIndex)?.viewport?.rotation??page.rotate;
  let scale=2,viewport=page.getViewport(into({scale,rotation})),r=ZEPins.rect(viewport.convertToViewportRectangle(into(rect)));
  const width=r[2]-r[0],height=r[3]-r[1],factor=Math.min(1,4094/width,4094/height,Math.sqrt(4_000_000/(width*height)));
  if(factor<1){scale*=factor;viewport=page.getViewport(into({scale,rotation}));r=ZEPins.rect(viewport.convertToViewportRectangle(into(rect)));}
  const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
  canvas.width=Math.ceil(r[2])-Math.floor(r[0]);canvas.height=Math.ceil(r[3])-Math.floor(r[1]);
  try{
   const options=into({canvasContext:canvas.getContext('2d',{alpha:false}),transform:[1,0,0,1,-Math.floor(r[0]),-Math.floor(r[1])],background:'#ffffff'});
   // Keep the native PDF.js viewport instance; only chrome-owned options need cloning.
   options.viewport=viewport;const task=page.render(options);
   request.cancel=()=>task.cancel?.();if(request.cancelled)request.cancel();
   await task.promise;if(request.cancelled)throw Error('已取消');return canvas.toDataURL('image/png');
  }finally{request.cancel=null;canvas.width=0;canvas.height=0;}
 },
 views(reader){
  const internal=reader?._internalReader;if(!internal||reader._type!=='pdf'||ZEPins.isTransient(reader)||reader._isUninitialized)return [];
  return [internal._primarySDTView?null:internal._primaryView,internal._secondarySDTView?null:internal._secondaryView].filter(Boolean).map(view=>{
   const raw=view._iframeWindow||view.iframeWindow,win=raw?.wrappedJSObject||raw;
   return {view,win,doc:win?.document,frame:view._iframe||raw?.frameElement,app:win?.PDFViewerApplication};
  }).filter(x=>x.doc&&x.app?.pdfDocument&&x.app.pdfViewer);
 },
 create({Zotero,id,renderRegion=ZEPins.renderRegion,cloneInto,unwrap}){
  let started=false,disposed=false,capture=null;
  const boards=new Map(),documents=new Map();
  const html=(doc,name,text)=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml',name);if(text!==undefined)node.textContent=text;return node;};
  const report=error=>Zotero.logError?.(error);
  function button(doc,label,action){
   const node=html(doc,'button',label);node.type='button';node.setAttribute('aria-label',label);node.style.cssText='font: inherit; color: inherit; cursor: pointer;';
   node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();return action();});return node;
  }
  function owner(reader){return reader._window||reader._iframe?.ownerGlobal||Zotero.getMainWindow();}
  function activeReader(state){
   const tabs=state.win.Zotero_Tabs;
   const reader=tabs?Zotero.Reader.getByTabID?.(tabs.selectedID):state.currentReader;
   if(!reader||reader._isUninitialized||reader._isTabClosed){state.message('请先打开要框选的 PDF。');return null;}return reader;
  }
  function boardFor(win){
   if(boards.has(win))return boards.get(win);
   const doc=win.document;if(!doc?.createXULElement)throw Error('当前窗口不支持临时固定面板');
   const panel=doc.createXULElement('panel');
   for(const [k,v] of Object.entries({noautofocus:'true',noautohide:'true',consumeoutsideclicks:'false'}))panel.setAttribute(k,v);
   const box=html(doc,'div');box.style.cssText='background: Canvas; color: CanvasText; font: 12px system-ui; padding: 10px; box-sizing: border-box; resize: both; overflow: auto; width: 360px; height: 420px; min-width: 220px; min-height: 120px;';
   box.style.maxWidth=Math.max(220,(win.screen?.availWidth||1200)-40)+'px';box.style.maxHeight=Math.max(120,(win.screen?.availHeight||900)-80)+'px';
   const header=html(doc,'div');header.style.cssText='display: flex; align-items: center; gap: 6px;';
   const title=html(doc,'strong','临时固定');title.style.cssText='flex: 1; cursor: move; user-select: none;';title.title='拖动移动；右下角调整大小';
   const status=html(doc,'div','框选公式或定义；最多保留 3 块，重启清空。');status.setAttribute('role','status');status.style.cssText='padding: 8px 0;';
   const content=html(doc,'div');let visible=false,drag=null,left=0,top=0;
   const state={win,panel,status,content,items:[],pending:new Set(),disposed:false,currentReader:null,
    show(){if(state.disposed)return;if(!visible){const screen=win.screen||{},x=(win.screenX||0)+(win.innerWidth||1200)-400,y=(win.screenY||0)+110;left=Math.max(screen.availLeft||0,Math.min(x,(screen.availLeft||0)+(screen.availWidth||1400)-380));top=Math.max(screen.availTop||0,y);panel.openPopupAtScreen(left,top,false);visible=true;}},
    message(text){status.textContent=text;state.show();},
    clear(){for(const token of state.pending){token.cancelled=true;token.cancel?.();}state.pending.clear();for(const item of state.items){item.image.src='';item.node.remove();}state.items=[];status.textContent='已清空；最多保留 3 块。';},
    dispose(){if(state.disposed)return;state.disposed=true;state.clear();if(capture?.win===win)cancelCapture();panel.hidePopup();panel.remove();win.removeEventListener('unload',unload);title.removeEventListener('pointerdown',down);win.removeEventListener('pointermove',move,true);win.removeEventListener('pointerup',up,true);win.removeEventListener('pointercancel',up,true);win.removeEventListener('blur',up);boards.delete(win);}
   };
   const move=e=>{if(!drag)return;const s=win.screen||{};left=Math.min((s.availLeft||0)+(s.availWidth||1400)-220,Math.max(s.availLeft||0,drag.left+e.screenX-drag.x));top=Math.min((s.availTop||0)+(s.availHeight||900)-60,Math.max(s.availTop||0,drag.top+e.screenY-drag.y));panel.moveTo?.(left,top);e.preventDefault();};
   const up=()=>{drag=null;};
   const down=e=>{if(e.button!==0)return;drag={x:e.screenX,y:e.screenY,left,top};title.setPointerCapture?.(e.pointerId);e.preventDefault();};
   const unload=()=>state.dispose();
   title.addEventListener('pointerdown',down);win.addEventListener('pointermove',move,true);win.addEventListener('pointerup',up,true);win.addEventListener('pointercancel',up,true);win.addEventListener('blur',up);win.addEventListener('unload',unload);
   header.append(title,button(doc,'框选',()=>{const reader=activeReader(state);if(reader)beginCapture(reader);}),button(doc,'清空',()=>state.clear()),button(doc,'收起',()=>{panel.hidePopup();visible=false;}));
   box.append(header,status,content);panel.appendChild(box);(doc.getElementById?.('mainPopupSet')||doc.documentElement).appendChild(panel);boards.set(win,state);return state;
  }
  async function pin(reader,position,view){
   if(disposed||reader._isUninitialized)return;
   let state,token;
   try{
    state=boardFor(owner(reader));state.currentReader=reader;
    if(state.items.length+state.pending.size>=3){state.message('最多固定 3 块，请先关闭一块或清空。');return;}
    const source=Zotero.Items.get(reader.itemID);
    if(!source?.isAttachment?.()||source.deleted||source.attachmentContentType!=='application/pdf')throw Error('原 PDF 附件不可用');
    const parent=source.parentID?Zotero.Items.get(source.parentID):source;
    const saved={itemID:source.id,key:source.key,libraryID:source.libraryID,title:parent?.getField?.('title')||parent?.getDisplayTitle?.()||'PDF',position:ZEPins.selectionPosition({position})};
    const target=view||ZEPins.views(reader)[0];if(!target)throw Error('请切回 PDF 原始版式后固定');
    token={cancelled:false,cancel:null,reader};state.pending.add(token);state.message('正在固定选区…');
    const data=await renderRegion({app:target.app,document:target.doc,position:saved.position,request:token,cloneInto,unwrap});
    if(disposed||state.disposed||token.cancelled)return;
    const doc=state.win.document,node=html(doc,'section');node.style.cssText='border: 1px solid GrayText; border-radius: 6px; padding: 7px; margin: 6px 0;';
    const title=html(doc,'div',saved.title+' · PDF 第 '+(saved.position.pageIndex+1)+' 页');title.style.cssText='overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';title.title=title.textContent;
    const image=html(doc,'img');image.src=data;image.alt='固定的 PDF 原文区域';image.style.cssText='display: block; width: 100%; height: auto; margin-top: 6px;';
    const actions=html(doc,'div');actions.style.cssText='display: flex; gap: 6px; margin-top: 6px;';
    const collapse=button(doc,'折叠',()=>{image.hidden=!image.hidden;image.style.display=image.hidden?'none':'block';collapse.textContent=image.hidden?'展开':'折叠';});
    const item={node,image,saved};
    actions.append(button(doc,'返回原文',async()=>{try{const source=await Zotero.Items.getAsync(saved.itemID);if(disposed||state.disposed)return;if(!source||source.deleted||source.key!==saved.key||source.libraryID!==saved.libraryID||source.attachmentContentType!=='application/pdf'||!await source.fileExists())throw Error('原 PDF 附件不可用');if(disposed||state.disposed)return;await Zotero.Reader.open(saved.itemID,{pageIndex:saved.position.pageIndex,position:saved.position},{allowDuplicate:false});}catch(error){if(!disposed&&!state.disposed){report(error);state.message('原 PDF 附件不可用，无法返回。');}}}),collapse,button(doc,'关闭',()=>{state.items=state.items.filter(x=>x!==item);image.src='';node.remove();state.message('已关闭固定内容。');}));
    node.append(title,actions,image);state.content.appendChild(node);state.items.push(item);state.message('已固定 '+state.items.length+' / 3；拖动标题移动，右下角调整大小。');
   }catch(error){if(!token?.cancelled&&!state?.disposed&&!disposed){report(error);state?.message('固定失败：'+String(error.message||error));}}
   finally{if(token)state?.pending.delete(token);}
  }
  function cancelCapture(){if(!capture)return;const old=capture;capture=null;old.cleanup();}
  function beginCapture(reader){
   if(disposed)return;
   if(capture?.reader===reader){cancelCapture();return;}cancelCapture();
   let state;
   try{
    state=boardFor(owner(reader));state.currentReader=reader;
    if(state.items.length+state.pending.size>=3){state.message('最多固定 3 块，请先关闭一块。');return;}
    const views=ZEPins.views(reader).filter(view=>view.frame?.getBoundingClientRect);
    if(!views.length){state.message('请切回 PDF 原始版式；当前阅读器不能框选。');return;}
    const removers=[];let gesture=null;
    const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);removers.push(()=>target.removeEventListener(type,fn,options));};
    const stop=e=>{e.preventDefault();e.stopPropagation();};
    const key=e=>{if(e.key==='Escape'){stop(e);cancelCapture();}};
    const active={reader,win:state.win,cleanup(){for(const remove of removers)remove();gesture=null;}};capture=active;
    listen(reader._iframeWindow,'keydown',key,true);listen(state.win,'keydown',key,true);
    listen(state.win,'blur',event=>{if(event.target===state.win)cancelCapture();});
    for(const view of views){
     // Outside the PDF iframe: its native window capture handlers must never see our drag.
     const {win,app}=view,doc=view.frame.ownerDocument,frameBox=view.frame.getBoundingClientRect();
     if(!(frameBox.width>0&&frameBox.height>0))continue;
     const innerWidth=win.innerWidth,innerHeight=win.innerHeight;
     const point=e=>({x:(e.clientX-frameBox.left)*innerWidth/frameBox.width,y:(e.clientY-frameBox.top)*innerHeight/frameBox.height});
     const overlay=html(doc,'div');overlay.setAttribute('data-ze-pin-overlay','true');overlay.style.cssText='position: fixed; z-index: 2147483646; cursor: crosshair; background: rgba(0,0,0,.025); touch-action: none; user-select: none;';
     Object.assign(overlay.style,{left:frameBox.left+'px',top:frameBox.top+'px',width:frameBox.width+'px',height:frameBox.height+'px'});
     const hint=html(doc,'div','拖动框选公式或定义 · Esc 取消');hint.style.cssText='position: absolute; top: 8px; left: 12px; background: Canvas; color: CanvasText; padding: 7px; border: 1px solid GrayText; pointer-events: none;';
     const selection=html(doc,'div');selection.style.cssText='position: fixed; border: 2px solid #008b8b; background: rgba(0,139,139,.12); pointer-events: none; display: none;';overlay.append(hint,selection);(doc.body||doc.documentElement).appendChild(overlay);removers.push(()=>overlay.remove());
     // PDF.js assigns canvas before inserting it, and swaps it during rendering.
     // Its stable page wrapper remains usable while that canvas has no layout box.
     const boxFor=page=>{
      for(const element of [page.div?.querySelector?.('.canvasWrapper'),page.canvas,page.div]){
       const box=element?.getBoundingClientRect();if(box?.width>0&&box.height>0)return box;
      }
     };
     const drawSelection=(start,end)=>{selection.style.display='block';Object.assign(selection.style,{left:Math.min(start.x,end.x)+'px',top:Math.min(start.y,end.y)+'px',width:Math.abs(end.x-start.x)+'px',height:Math.abs(end.y-start.y)+'px'});};
     listen(overlay,'pointerdown',e=>{
      stop(e);if(e.button!==0)return;
      const start=point(e);
      for(let i=0;i<app.pdfViewer.pagesCount;i++){
       const page=app.pdfViewer.getPageView(i),box=page&&boxFor(page);
       if(page?.pdfPage&&page.viewport&&box?.width>0&&box.height>0&&start.x>=box.left&&start.x<=box.left+box.width&&start.y>=box.top&&start.y<=box.top+box.height){
        gesture={page,box,start,outerStart:{x:e.clientX,y:e.clientY},pointerId:e.pointerId,view,overlay,selection,viewport:page.viewport};drawSelection(gesture.outerStart,gesture.outerStart);overlay.setPointerCapture?.(e.pointerId);break;
       }
      }
      if(!gesture)hint.textContent='请在已加载的 PDF 页面内框选 · Esc 取消';
     });
     listen(overlay,'pointermove',e=>{stop(e);if(!gesture||gesture.overlay!==overlay||e.pointerId!==gesture.pointerId)return;drawSelection(gesture.outerStart,{x:e.clientX,y:e.clientY});});
     listen(overlay,'pointerup',e=>{
      stop(e);const g=gesture;if(!g||g.overlay!==overlay||g.pointerId!==e.pointerId)return;
      try{
       const box=boxFor(g.page),currentFrame=view.frame.getBoundingClientRect();
       if(g.viewport!==g.page.viewport||['width','height','left','top'].some(key=>Math.abs(box[key]-g.box[key])>1||Math.abs(currentFrame[key]-frameBox[key])>1)||win.innerWidth!==innerWidth||win.innerHeight!==innerHeight)throw Error('页面位置已变化，请重新框选');
       if(Math.abs(e.clientX-g.outerStart.x)<6||Math.abs(e.clientY-g.outerStart.y)<6)throw Error('请框选更大的区域');
       const position=ZEPins.dragPosition(g.page,g.box,g.start,point(e));cancelCapture();void pin(reader,position,g.view);
      }catch(error){cancelCapture();state.message(String(error.message||error));}
     });
     listen(overlay,'pointercancel',()=>cancelCapture());listen(overlay,'lostpointercapture',()=>cancelCapture());listen(overlay,'wheel',stop,{passive:false});listen(win,'keydown',key,true);
    }
   }catch(error){cancelCapture();report(error);state?.message('当前 PDF 暂时无法框选。');}
  }
  function remember(reader,doc){
   if(documents.has(doc))return;
   const unload=()=>{if(capture?.reader===reader)cancelCapture();for(const state of boards.values()){if(state.currentReader===reader)state.currentReader=null;for(const token of state.pending)if(token.reader===reader){token.cancelled=true;token.cancel?.();}}for(const node of doc.querySelectorAll?.('[data-ze-pin-control]')||[])node.remove();documents.delete(doc);};
   doc.defaultView.addEventListener('unload',unload);documents.set(doc,{reader,unload});
  }
  function toolbar({reader,doc,append}){
   if(disposed||reader._type!=='pdf'||ZEPins.isTransient(reader)||reader._isUninitialized||doc.querySelector?.('[data-ze-pin-toolbar]'))return;
   remember(reader,doc);const node=button(doc,'固定',()=>{const state=boards.get(owner(reader));if(capture?.reader===reader)cancelCapture();else if(state?.items.length){state.currentReader=reader;state.show();}else beginCapture(reader);});
   node.setAttribute('data-ze-pin-control','true');node.setAttribute('data-ze-pin-toolbar','true');node.title='临时固定公式或定义';node.className='toolbar-button';node.style.minWidth='38px';append(node);
  }
  function selection({reader,doc,params,append}){
   if(disposed||reader._type!=='pdf'||ZEPins.isTransient(reader)||reader._isUninitialized)return;
   let position;try{position=ZEPins.selectionPosition(params.annotation);}catch{return;}
   remember(reader,doc);const node=button(doc,'临时固定',()=>{void pin(reader,position);});node.setAttribute('data-ze-pin-control','true');append(node);
  }
  return {
   start(){if(started||disposed)return;if(!Zotero.Reader?.registerEventListener)throw Error('阅读器扩展接口不可用');started=true;Zotero.Reader.registerEventListener('renderToolbar',toolbar,id);Zotero.Reader.registerEventListener('renderTextSelectionPopup',selection,id);
    for(const reader of Zotero.Reader._readers||[]){const doc=reader._iframeWindow?.document,target=doc?.querySelector('.toolbar .end .custom-sections')||doc?.querySelector('.toolbar .end');if(target)toolbar({reader,doc,append:node=>target.appendChild(node)});}
   },
   releaseWindow(win){if(capture?.win===win)cancelCapture();boards.get(win)?.dispose();for(const [doc,state] of documents)if(owner(state.reader)===win){doc.defaultView.removeEventListener('unload',state.unload);state.unload();}},
   dispose(){if(disposed)return;disposed=true;cancelCapture();for(const win of [...boards.keys()])boards.get(win).dispose();for(const [doc,state] of [...documents]){doc.defaultView.removeEventListener('unload',state.unload);state.unload();}if(started){Zotero.Reader.unregisterEventListener('renderToolbar',toolbar);Zotero.Reader.unregisterEventListener('renderTextSelectionPopup',selection);}started=false;}
  };
 }
};
