import {annotationKind,inkHitTest,inkPath} from './ink-geometry.mjs';
const NS='http://www.w3.org/2000/svg';
export function installPencilTools(root,{getState,getViewport,getAnnotations,onStart,onBegin,onDraft,onCommit,onErase,onUndo,onRestore,onExport,onProblem,onPaint}={}){
 const doc=root.ownerDocument,view=doc.defaultView,$=s=>doc.querySelector(s),dock=doc.createElement('div');dock.id='pencil-dock';dock.hidden=true;
 dock.innerHTML='<div class="pencil-buttons" role="toolbar" aria-label="Apple Pencil 工具"><div class="pencil-modes" role="group" aria-label="笔输入模式"><button type="button" data-pencil-mode="select" aria-pressed="true">划词</button><button type="button" data-pencil-mode="ink" aria-pressed="false">手写</button><button type="button" data-pencil-mode="erase" aria-pressed="false">橡皮</button></div><select id="pencil-color" aria-label="手写笔色"><option value="#000000">黑笔</option><option value="#2ea8e5">蓝笔</option><option value="#ff6666">红笔</option><option value="#5fb236">绿笔</option></select><select id="pencil-width" aria-label="手写粗细"><option value="0.8">细笔</option><option value="1.6" selected>中笔</option><option value="2.8">粗笔</option></select><button type="button" id="pencil-undo" aria-label="撤销上一笔" disabled>撤销</button><button type="button" id="pencil-export">备份</button></div><div id="pencil-hint" role="status">Pencil 划词 · 手指滚动</div>';
 root.after(dock);let mode='select',enabled=false,gesture=null,history=[],paperKey=null,ignoreClickUntil=0,frame=0;
 const hint=dock.querySelector('#pencil-hint'),undo=dock.querySelector('#pencil-undo'),color=dock.querySelector('#pencil-color'),width=dock.querySelector('#pencil-width');
 const tablet=()=>{const n=view.navigator;return (/iPad/.test(n.userAgent)||(n.platform==='MacIntel'&&n.maxTouchPoints>1))||(view.innerWidth>=761&&view.innerWidth<=1366&&view.matchMedia('(any-pointer:coarse)').matches)};
 const describe=()=>mode==='ink'?'Pencil 手写 · 手指滚动':mode==='erase'?'橡皮擦除整笔 · 手指滚动':'Pencil 划词 · 手指滚动';
 const problem=error=>{hint.textContent=error?.message||String(error);hint.classList.add('pencil-error');onProblem?.(error)};
 function controls(){for(const b of dock.querySelectorAll('[data-pencil-mode]'))b.setAttribute('aria-pressed',String(b.dataset.pencilMode===mode));color.disabled=width.disabled=mode!=='ink';undo.disabled=!history.length;hint.textContent=describe();hint.classList.remove('pencil-error');root.classList.toggle('pencil-writing',enabled&&mode!=='select');dock.dataset.mode=mode}
 function setMode(value){finish();mode=['ink','erase'].includes(value)?value:'select';onStart?.();view.getSelection()?.removeAllRanges();controls()}
 function refresh(){
  const state=getState();enabled=tablet();dock.hidden=!enabled||!state?.attachment;doc.documentElement.toggleAttribute('data-ze-pencil-ui',enabled);if(!enabled&&mode!=='select')setMode('select');
  const key=state?.attachment?.key||null;if(key!==paperKey){finish();paperKey=key;history=[];undo.disabled=true}root.classList.toggle('pencil-writing',enabled&&mode!=='select');
 }
 function position(g){const path=g.points.slice();if(path.length===2)path.push(Number((path[0]+.001).toFixed(3)),path[1]);return {pageIndex:g.ctx.page-1,width:g.ctx.width,paths:[path]}}
 function paint(){frame=0;const g=gesture;if(!g||g.mode!=='ink'||!g.preview)return;g.preview.setAttribute('d',inkPath(g.points,g.viewport))}
 function stage(g,force=false){if(g.mode!=='ink'||!g.points.length||(g.continuation&&g.points.length===2))return;if(!force&&Date.now()-g.stagedAt<100){if(!g.stageTimer)g.stageTimer=view.setTimeout(()=>{g.stageTimer=null;if(gesture===g)stage(g,true)},100-(Date.now()-g.stagedAt));return}view.clearTimeout(g.stageTimer);g.stageTimer=null;g.stagedAt=Date.now();try{onDraft(g.session,position(g));g.failed=false}catch(error){g.failed=true;problem(error)}}
 function seal(g){if(!g.session)return;g.session.drawing=false;if(!g.continuation||g.points.length>2){stage(g,true);const p=onCommit(g.session,position(g));Promise.resolve(p).catch(problem);g.group.push(g.session)}g.preview?.remove();g.session=null;onPaint?.()}
 function newPart(g){g.continuation=!!g.group.length;g.session=onBegin(g.ctx);g.session.drawing=true;g.preview=doc.createElementNS(NS,'path');for(const [name,value] of Object.entries({fill:'none',stroke:g.ctx.color,'stroke-width':g.ctx.width*g.viewport.scale,'stroke-linecap':'round','stroke-linejoin':'round'}))g.preview.setAttribute(name,value);g.svg.append(g.preview);stage(g,true)}
 function sample(x,y){
  const g=gesture;if(!g)return;const box=g.wrap.getBoundingClientRect(),cx=Math.max(0,Math.min(g.viewport.width,x-box.left)),cy=Math.max(0,Math.min(g.viewport.height,y-box.top)),p=g.viewport.convertToPdfPoint(cx,cy).map(v=>Number(v.toFixed(3)));
  if(g.mode==='erase'){
   for(const a of getAnnotations().slice().reverse()){if(annotationKind(a)!=='ink'||a.position?.pageIndex!==g.ctx.page-1||a.needsPdfReview||a.conflict||g.erasedIds.has(a.id)||!inkHitTest(a.position,p,8/g.viewport.scale))continue;const ref=onErase(a,g.ctx);if(ref){g.erasedIds.add(a.id);g.erased.push({...structuredClone(a),key:g.ctx.key,pdfRevision:g.ctx.pdfRevision})}}
   return;
  }
  const a=g.points;if(a.length&&Math.hypot(p[0]-a.at(-2),p[1]-a.at(-1))<.08)return;a.push(...p);
  if(a.length>=1200){seal(g);g.points=a.slice(-2);newPart(g)}stage(g);if(!frame)frame=view.requestAnimationFrame(paint);
 }
 function begin(target,x,y,source,id){
  const state=getState(),wrap=target.closest?.('.pdf-page');if(!enabled||mode==='select'||!wrap||!root.contains(wrap)||!state?.attachment)return false;
  if(!state.canWrite){problem(new Error('请先核对 PDF 版本，再开始手写'));return false}const viewport=getViewport(wrap);if(!viewport||wrap.dataset.ready!=='yes'){problem(new Error('页面还在加载，请稍后落笔'));return false}
  finish();onStart?.();view.getSelection()?.removeAllRanges();
  const ctx={key:state.attachment.key,pdfRevision:state.pdfRevision,page:Number(wrap.dataset.page),width:Number(width.value),color:color.value};
  gesture={wrap,viewport,ctx,source,id,mode,points:[],group:[],erased:[],erasedIds:new Set(),stagedAt:0};
  if(mode==='ink'){const svg=doc.createElementNS(NS,'svg');svg.classList.add('pencil-preview');svg.setAttribute('width',viewport.width);svg.setAttribute('height',viewport.height);svg.setAttribute('aria-hidden','true');wrap.append(svg);gesture.svg=svg;newPart(gesture)}sample(x,y);if(mode==='ink')gesture.leaseTimer=view.setInterval(()=>{if(gesture)stage(gesture,true)},1000);controls();return true;
 }
 function finish(){
  const g=gesture;if(!g)return;view.clearInterval(g.leaseTimer);view.cancelAnimationFrame(frame);frame=0;
  if(g.mode==='ink'){seal(g);g.svg?.remove();if(g.group.length)history.push({kind:'create',items:g.group,key:g.ctx.key})}
  else if(g.erased.length)history.push({kind:'erase',items:g.erased,key:g.ctx.key});
  gesture=null;ignoreClickUntil=Date.now()+550;undo.disabled=!history.length;onPaint?.();
 }
 root.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'&&gesture){if(e.cancelable)e.preventDefault();return}
  if(e.pointerType!=='pen'||!enabled||mode==='select')return;
  if(begin(e.target,e.clientX,e.clientY,'pointer',e.pointerId)){if(e.cancelable)e.preventDefault();try{gesture.wrap.setPointerCapture(e.pointerId)}catch{}}
 },{capture:true});
 root.addEventListener('pointermove',e=>{if(gesture?.source!=='pointer'||e.pointerId!==gesture.id)return;if(e.cancelable)e.preventDefault();let points;try{points=e.getCoalescedEvents?.()}catch{}for(const point of points?.length?points:[e])sample(point.clientX,point.clientY)});
 root.addEventListener('pointerup',e=>{if(gesture?.source==='pointer'&&e.pointerId===gesture.id){sample(e.clientX,e.clientY);finish()}});
 root.addEventListener('pointercancel',e=>{if(gesture?.source==='pointer'&&e.pointerId===gesture.id)finish()});
 root.addEventListener('touchstart',e=>{
  if(!enabled||mode==='select')return;const t=Array.from(e.changedTouches).find(t=>t.touchType==='stylus');
  if(!t){if(gesture&&e.cancelable)e.preventDefault();return}
  if(gesture){gesture.source='touch';gesture.id=t.identifier}else if(!begin(e.target,t.clientX,t.clientY,'touch',t.identifier))return;
  if(e.cancelable)e.preventDefault();
 },{passive:false});
 root.addEventListener('touchmove',e=>{if(gesture?.source!=='touch')return;const t=Array.from(e.changedTouches).find(t=>t.identifier===gesture.id);if(t){if(e.cancelable)e.preventDefault();sample(t.clientX,t.clientY)}},{passive:false});
 root.addEventListener('touchend',e=>{if(gesture?.source!=='touch')return;const t=Array.from(e.changedTouches).find(t=>t.identifier===gesture.id);if(t){sample(t.clientX,t.clientY);finish()}});
 root.addEventListener('touchcancel',()=>{if(gesture?.source==='touch')finish()});
 root.addEventListener('scroll',finish,{passive:true});view.addEventListener('blur',finish);view.addEventListener('pagehide',finish);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)finish()});view.addEventListener('resize',()=>{finish();refresh()});
 root.addEventListener('contextmenu',e=>{if(enabled&&mode!=='select')e.preventDefault()});
 for(const b of dock.querySelectorAll('[data-pencil-mode]'))b.onclick=()=>setMode(b.dataset.pencilMode);
 color.onchange=width.onchange=()=>{finish();controls()};
 undo.onclick=async()=>{finish();const action=history.pop();if(!action)return;undo.disabled=true;try{if(action.kind==='create')await onUndo(action.items);else for(const item of action.items){const restored=await onRestore(item);if(restored)for(const earlier of history)if(earlier.kind==='create')earlier.items=earlier.items.map(s=>(s.target?.id===item.id||s.draftId===item.draftId)?restored:s)}}catch(error){history.push(action);problem(error)}undo.disabled=!history.length};
 dock.querySelector('#pencil-export').onclick=()=>{finish();onExport()};
 refresh();controls();return {get mode(){return enabled?mode:'select'},get active(){return !!gesture},get activeDraftId(){return gesture?.session?.draftId},get suppressClick(){return Date.now()<ignoreClickUntil},finish,refresh,setMode};
}
