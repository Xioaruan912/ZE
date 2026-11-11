var ZEHoverPreview = {
 async resolvePDF(Zotero,item){
  const isPDF=x=>x&&!x.deleted&&!x.parentItem?.deleted&&x.isAttachment?.()&&x.attachmentContentType==='application/pdf';
  if(!item||item.deleted)return {reason:'条目已不可用'};
  let candidates=[];
  if(isPDF(item))candidates=[item];
  else if(item.isRegularItem?.()){
   const best=await item.getBestAttachment?.();if(best)candidates.push(best);
   for(const id of item.getAttachments?.()||[])if(!candidates.some(x=>x.id===id)){const child=await Zotero.Items.getAsync(id);if(child)candidates.push(child);}
  }
  let hasPDF=false;
  for(const attachment of candidates){if(!isPDF(attachment))continue;hasPDF=true;if(await attachment.fileExists?.())return {attachment};}
  return {reason:hasPDF?'PDF 尚未下载或文件已缺失':'没有可预览的 PDF 附件'};
 },
 create({resolvePDF,view,setTimeout,clearTimeout}){
  let disposed=false,current=null,serial=0,startTimer=null,hideTimer=null;
  const clearStart=()=>{if(startTimer!==null){clearTimeout(startTimer);startTimer=null;}};
  const clearHide=()=>{if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}};
  function close(){serial++;clearStart();clearHide();current=null;view.hide();}
  function activate(){
   if(disposed||!current||current.started||startTimer!==null)return;
   const request=current;
   startTimer=setTimeout(async()=>{
    startTimer=null;if(disposed||current!==request)return;request.started=true;const token=++serial;
    try{
     view.loading(request.item,request.point);
     const result=await resolvePDF(request.item);
     if(disposed||serial!==token||current!==request)return;
     if(result.attachment)await view.pdf(result.attachment,request.point);else view.message(result.reason||'没有可预览的 PDF',request.point);
    }catch{if(!disposed&&serial===token)view.message('预览暂不可用，请正式打开 PDF。',request.point);}
   },350);
  }
  function leave(){if(disposed)return;clearStart();if(hideTimer!==null)return;hideTimer=setTimeout(()=>{hideTimer=null;close();},220);}
  return {
   hover(item,point,altKey){
    if(disposed)return;if(!item){leave();return;}clearHide();
    if(current?.item!==item){close();current={item,point,started:false};}else current.point=point;
    if(altKey)activate();
   },activate,leave,enterPopup:clearHide,close,
   dispose(){if(disposed)return;disposed=true;close();}
  };
 },
 createView({Zotero,win,onEnter,onLeave,onClose}){
  const doc=win.document,timers=new Set();let panel=null,title=null,status=null,body=null,prev=null,next=null,open=null;
  let browser=null,reader=null,attachment=null,page=1,visible=false,disposed=false,generation=0,cancelLoad=null;
  const element=(name,text)=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml',name);if(text!==undefined)node.textContent=text;return node;};
  const uninit=value=>{try{value?.uninit();}catch{}};
  function dropReader(){
   generation++;cancelLoad?.();cancelLoad=null;
   for(const timer of timers)win.clearTimeout(timer);timers.clear();
   uninit(reader);reader=null;browser?.remove();browser=null;
  }
  function ensure(){
   if(panel)return;
   panel=doc.createXULElement('panel');panel.setAttribute('noautofocus','true');panel.setAttribute('noautohide','true');panel.setAttribute('consumeoutsideclicks','false');
   const box=element('div');box.style.cssText='color: CanvasText; background: Canvas; padding: 10px; font: 13px system-ui;';box.style.width=Math.min(420,Math.max(260,(win.innerWidth||1024)-80))+'px';
   title=element('div');title.style.cssText='font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;';
   const actions=element('div');actions.style.cssText='display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
   prev=element('button','上一页');next=element('button','下一页');open=element('button','打开 PDF');const close=element('button','关闭');
   for(const button of [prev,next,open,close]){button.type='button';button.style.cssText='font: inherit; color: inherit; cursor: pointer;';actions.appendChild(button);}
   status=element('div');status.setAttribute('role','status');status.style.cssText='padding: 4px 0;';body=element('div');
   prev.addEventListener('click',()=>go('prev'));next.addEventListener('click',()=>go('next'));
   close.addEventListener('click',()=>onClose?onClose():api.hide());
   open.addEventListener('click',async()=>{
    const item=attachment,index=page-1;if(!item)return;onClose?onClose():api.hide();
    try{await Zotero.Reader.open(item.id,{pageIndex:index},{allowDuplicate:false});}catch{win.alert?.('无法打开 PDF，请检查附件文件是否可用。');}
   });
   box.append(title,actions,status,body);panel.appendChild(box);
   panel.addEventListener('mouseenter',()=>onEnter?.());panel.addEventListener('mouseleave',()=>onLeave?.());
   (doc.getElementById?.('mainPopupSet')||doc.documentElement).appendChild(panel);
  }
  function show(point={}){
   if(disposed)return false;ensure();
   if(!visible){
    const screen=win.screen||{},left=screen.availLeft||0,top=screen.availTop||0,width=screen.availWidth||1280,height=screen.availHeight||900;
    const x=Math.max(left+8,Math.min((point.screenX||left)+16,left+width-460));
    const y=Math.max(top+8,Math.min((point.screenY||top)+12,top+height-660));
    panel.openPopupAtScreen(x,y,false);visible=true;
   }
   return true;
  }
  function update(){if(!reader||!visible)return;status.textContent='第 '+page+' 页';prev.disabled=!reader.canGoto('prev');next.disabled=!reader.canGoto('next');}
  function go(direction){
   if(!reader?.canGoto(direction))return;reader.goto(direction);page+=direction==='next'?1:-1;
   status.textContent='第 '+page+' 页';const token=generation;
   const timer=win.setTimeout(()=>{timers.delete(timer);if(!disposed&&token===generation)update();},150);timers.add(timer);
  }
  const api={
   loading(item,point){if(!show(point))return;dropReader();attachment=null;prev.disabled=true;next.disabled=true;open.disabled=true;title.textContent=item.getDisplayTitle?.()||item.getField?.('title')||'PDF 预览';status.textContent='正在读取本机 PDF…';},
   message(text,point){if(!show(point))return;dropReader();status.textContent=text;prev.disabled=true;next.disabled=true;open.disabled=!attachment;},
   async pdf(item,point){
    if(!show(point))return;dropReader();attachment=item;page=1;prev.disabled=true;next.disabled=true;open.disabled=false;
    if(!Zotero.Reader?.openPreview){api.message('当前 Zotero 的 PDF 预览接口不可用。',point);return;}
    const token=generation;browser=doc.createXULElement('browser');const target=browser;
    target.setAttribute('type','content');target.setAttribute('transparent','transparent');target.setAttribute('flex','1');
    target.style.cssText='display: block; width: 100%; pointer-events: none;';target.style.height=Math.max(180,Math.min(520,(win.innerHeight||800)-180))+'px';
    const ready=new Promise(resolve=>{
     let timer=null,done=false;
     const finish=value=>{if(done)return;done=true;target.removeEventListener('DOMContentLoaded',loaded,true);if(timer!==null){win.clearTimeout(timer);timers.delete(timer);}if(cancelLoad===cancel)cancelLoad=null;resolve(value);};
     const loaded=event=>{if(event.target===target.contentDocument&&event.target.documentURI?.startsWith('resource://zotero/reader/reader.html'))finish(true);};
     const cancel=()=>finish(false);cancelLoad=cancel;target.addEventListener('DOMContentLoaded',loaded,true);
     timer=win.setTimeout(()=>finish(false),8000);timers.add(timer);
    });
    target.setAttribute('src','resource://zotero/reader/reader.html');body.appendChild(target);
    if(!await ready){if(!disposed&&token===generation)api.message('预览加载超时，可点击“打开 PDF”。',point);return;}
    if(disposed||token!==generation)return;
    let localReader=null;
    try{
     localReader=await Zotero.Reader.openPreview(item.id,target);
     if(disposed||token!==generation){uninit(localReader);return;}reader=localReader;
     const success=await localReader._open({location:{pageIndex:0}});
     if(disposed||token!==generation){uninit(localReader);return;}
     if(!success){api.message('此 PDF 无法预览，可点击“打开 PDF”。',point);return;}update();
    }catch{
     uninit(localReader);if(!disposed&&token===generation)api.message('预览失败，可点击“打开 PDF”。',point);
    }
   },
   contains:node=>!!panel?.contains(node),get visible(){return visible;},
   hide(){dropReader();attachment=null;if(panel&&visible){visible=false;panel.hidePopup();}},
   dispose(){if(disposed)return;api.hide();disposed=true;panel?.remove();panel=null;}
  };
  return api;
 },
 attach({Zotero,win}){
  const doc=win.document;if(!doc?.addEventListener||!doc.createXULElement)throw new Error('PDF 预览窗口接口不可用');
  let controller;const listeners=[];
  const view=ZEHoverPreview.createView({Zotero,win,onEnter:()=>controller.enterPopup(),onLeave:()=>controller.leave(),onClose:()=>controller.close()});
  controller=ZEHoverPreview.create({resolvePDF:item=>ZEHoverPreview.resolvePDF(Zotero,item),view,setTimeout:win.setTimeout.bind(win),clearTimeout:win.clearTimeout.bind(win)});
  const on=(target,type,handler)=>{target.addEventListener(type,handler,true);listeners.push(()=>target.removeEventListener(type,handler,true));};
  const editing=target=>!!target?.closest?.('input,textarea,editable-text,[contenteditable="true"]');
  on(doc,'mousemove',event=>{
   if(view.contains(event.target)){controller.enterPopup();return;}
   const tree=win.ZoteroPane?.itemsView,node=event.target?.closest?.('[id*="-row-"]'),prefix=(tree?.id||'zotero-items-tree')+'-row-';
   let item=null;
   if(node?.id?.startsWith(prefix)&&/^\d+$/.test(node.id.slice(prefix.length))&&!editing(event.target)){
    const row=tree.getRow(Number(node.id.slice(prefix.length)));if(row?.ref?.isRegularItem?.()||row?.ref?.isAttachment?.())item=row.ref;
   }
   controller.hover(item,{screenX:event.screenX,screenY:event.screenY},event.altKey);
  });
  on(doc,'keydown',event=>{if(event.key==='Escape'&&view.visible){event.preventDefault();event.stopPropagation();controller.close();}else if(event.key==='Alt'&&!editing(event.target))controller.activate();});
  on(doc,'keyup',event=>{if(event.key==='Alt'&&view.visible){event.preventDefault();event.stopPropagation();}});
  on(doc,'mousedown',event=>{if(!view.contains(event.target))controller.close();});on(doc,'wheel',()=>controller.close());on(win,'blur',()=>controller.close());
  return {dispose(){for(const remove of listeners)remove();controller.dispose();view.dispose();}};
 }
};
