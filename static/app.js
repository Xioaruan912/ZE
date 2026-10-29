import {installPencilTools} from '/pencil-tools.mjs';
import {annotationKind,annotationRects,inkHitTest,renderInk} from '/ink-geometry.mjs';
import * as pdfjs from '/pdf.mjs';
import {createLibrarySidebar} from '/library-sidebar.mjs';
import {prepareTextGeometry,selectionInkRects,fitHighlightToLine} from '/highlight-geometry.mjs';
import {mergeRects} from '/geometry.mjs';
import {orderTextLayer} from '/text-order.mjs';
import {createZoteroAvailability} from '/zotero-availability.mjs';
import {installSelectionInput,popoverPosition,selectionTextForTranslation,selectionFocusRect} from '/selection-input.mjs';
import {createMetadataCache} from '/metadata-cache.mjs';
import {createReaderExtras} from '/reader-extras.mjs';
import {createAnnotationWriter} from '/annotation-writer.mjs';
import {fitScale,readingAnchor,anchorScroll,planResume,filterAnnotations,mergeDrafts,createMarkTool} from '/reading-view.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';
const $=s=>document.querySelector(s); let items=[],doc=null,current=null,attachment=null,page=1,scale=1.25,selected='',renderTask=null,annotations=[],selectionTimer=null,selectionRects=[],currentViewport=null,selectionAnchor=null,translations=[],selectedCollection='',selectedColor='#ffd400',translationTimer=null,lastSelectionSignature='',translationRequest=0,pageObserver=null,pageGeneration=0,viewports=new Map(),editingAnnotation=null,editorDirty=false,editorSession=null,editorTimer=null,selectedType='highlight';
async function api(url,options){const res=await fetch(url,{cache:'no-store',...options});const body=await res.json();if(!res.ok){if(body.code==='zotero_unavailable')zoteroAvailability.offline(body.error);const error=new Error(body.error||'请求失败');error.code=body.code;throw error}return body}
async function post(url,data){return api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})}
function toast(text){const e=$('#toast');e.textContent=text;e.style.display='block';clearTimeout(e.timer);e.timer=setTimeout(()=>e.style.display='none',5000)}
function esc(s){const e=document.createElement('span');e.textContent=s||'';return e.innerHTML}
const inkRecovery=new Map();
let browserStorage;try{browserStorage=window.localStorage}catch{}
const librarySidebar=createLibrarySidebar($('#library'),{onCollection:key=>{selectedCollection=key;load()},onOpen:openPaper});
const metadataCache=createMetadataCache({storage:browserStorage,fetcher:url=>api(url)});let libraryRequest=0,planRequest=0;
async function load({force=false}={}){const serial=++libraryRequest,collection=selectedCollection;try{librarySidebar.setLoading(true);setLibraryStatus('读取文献');const [c,l]=await Promise.all([metadataCache.get('/api/collections',{force}),metadataCache.get('/api/items'+(collection?'?collection='+encodeURIComponent(collection):''),{force})]);if(serial!==libraryRequest)return;items=l.data.items||[];librarySidebar.update({collections:c.data.collections||[],items,active:current?.key});setLibraryStatus(c.stale||l.stale?'本地文库 · 更新失败':c.cached&&l.cached?'文献已就绪':'已连接 Zotero');$('#status').title=c.cached&&l.cached?'来自浏览器缓存，可点击刷新文献更新':'来自 Zotero 最新数据'}catch(e){if(serial===libraryRequest){librarySidebar.setLoading(false);setLibraryStatus('读取失败');if(e.code!=='zotero_unavailable')toast(e.message)}}}

function draw(){librarySidebar.setActive(current?.key)}
let programmaticScrollUntil=0;
let appliedViewSize='';function documentSize(){const root=$('#document');return root.clientWidth+':'+root.clientHeight}
let pdfRevision=null;
let openGeneration=0,navigationGeneration=0,zoomMode='width',baseSizes=[],restoringView=false,lastReadingAnchor=null,progressChain=Promise.resolve();
const markTool=createMarkTool();
function currentAnchor(){const root=$('#document').getBoundingClientRect();return readingAnchor([...document.querySelectorAll('.pdf-page')].map(w=>({...w.getBoundingClientRect().toJSON(),page:Number(w.dataset.page)})),root)}
function readingPayload(){const anchor=currentAnchor();return current&&anchor?{key:current.key,title:current.title||'',attachment:attachment.key,...anchor,zoom_mode:zoomMode,scale}:null}
function saveReadingPosition({keepalive=false}={}){if(restoringView||documentSize()!==appliedViewSize)return Promise.resolve();const payload=readingPayload();if(!payload)return Promise.resolve();lastReadingAnchor={page:payload.page,fraction:payload.fraction,x:payload.x};if(keepalive){return fetch('/api/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true,cache:'no-store'}).catch(()=>{})}progressChain=progressChain.catch(()=>{}).then(()=>post('/api/progress',payload));return progressChain.catch(()=>{})}
function applyFit(){const root=$('#document'),size=baseSizes[page-1]||baseSizes[0];if(!size)return;scale=fitScale(zoomMode,root.clientWidth,root.clientHeight,size.width,size.height,compactLayout()?6:12,scale);$('#zoom-mode').value=zoomMode;$('#zoom-value').textContent=Math.round(scale*100)+'%'}
async function readAnnotations(key){const fresh=await api('/api/annotations?key='+key);if(attachment?.key!==key)return;annotations=fresh;paintAnnotations();return fresh}
function recoveryAnnotations(){return [...inkRecovery.values()].map(s=>({id:s.target?.id||'b:'+s.draftId,draftId:s.draftId,key:s.key,type:'ink',position:s.position,color:s.inkColor,text:'',comment:s.target?.comment||'',tags:s.tags||[],browserDraft:true,pending:true,memoryOnly:true,pdfRevision:s.pdfRevision}))}
function visibleAnnotations(){return mergeDrafts(annotations,[...annotationWriter.drafts(attachment?.key),...recoveryAnnotations().filter(a=>a.key===attachment?.key)])}
async function openPaper(item){
 pencilInput.finish();
 if(!zoteroAvailability.available)return;
 const serial=++openGeneration;await flushEditor();await saveReadingPosition();closeSelection();
 try{
  toast('正在打开论文…');const data=await api('/api/children?key='+item.key);if(serial!==openGeneration)return;
  const file=(data.items||[]).find(x=>x.itemType==='attachment'&&(/pdf/i.test(x.title||'')||/\.pdf/i.test(x.url||'')))||(data.items||[]).find(x=>x.itemType==='attachment');if(!file)throw new Error('这篇文献没有 PDF 附件');
  const status=await api('/api/pdf-status?key='+file.key);if(serial!==openGeneration)return;
  const [pdf,progress]=await Promise.all([pdfjs.getDocument('/api/pdf?key='+file.key+'&revision='+encodeURIComponent(status.revision)).promise,api('/api/progress?key='+item.key).catch(()=>({page:1,fraction:0,x:.5}))]);
  if(serial!==openGeneration){pdf.destroy();return}
  const sizes=await Promise.all(Array.from({length:pdf.numPages},async(_,i)=>{const p=await pdf.getPage(i+1),v=p.getViewport({scale:1});return {width:v.width,height:v.height}}));
  if(serial!==openGeneration){pdf.destroy();return}
  const old=doc;++pageGeneration;pageObserver?.disconnect();current=item;attachment=file;doc=pdf;pdfRevision=status.revision;baseSizes=sizes;annotations=[];translations=[];page=Math.min(Math.max(progress.page,1),pdf.numPages);zoomMode=progress.zoom_mode||'width';scale=progress.scale||1.25;
  $('#title').textContent=item.title;$('#pages').textContent=pdf.numPages;$('#welcome').hidden=true;$('#reader').hidden=false;$('#library').classList.remove('open');updateLibraryToggle();pencilInput.refresh();draw();readerExtras.opened(status);applyFit();
  await render({page,fraction:progress.fraction||0,x:progress.x??.5});old?.destroy();
  if(!$('#panel').hidden&&$('#panel').dataset.view==='notes')showNotes();
  readAnnotations(file.key).catch(e=>toast('已有标注读取失败：'+e.message));
  api('/api/translations?key='+file.key).then(a=>{if(attachment?.key===file.key){translations=a;showTranslations()}}).catch(e=>toast(e.message));
  await saveReadingPosition();toast('论文已打开');
 }catch(e){if(serial===openGeneration)toast(e.message)}
}
async function render(anchor=lastReadingAnchor||{page,fraction:0,x:.5}){pencilInput.finish();
 if(!doc)return;const generation=++pageGeneration;pageObserver?.disconnect();viewports=new Map();restoringView=true;if($('#selection-actions').dataset.mode!=='annotation')closeSelection();
 const container=$('#pages-container');container.replaceChildren();
 for(let i=1;i<=doc.numPages;i++){const size=baseSizes[i-1];let wrap=document.createElement('div');wrap.className='pdf-page';wrap.dataset.page=i;wrap.style.width=size.width*scale+'px';wrap.style.height=size.height*scale+'px';wrap.setAttribute('aria-label','第 '+i+' 页');container.append(wrap)}
 pageObserver=new IntersectionObserver(entries=>{for(const entry of entries){let wrap=entry.target;if(entry.isIntersecting){drawPage(wrap,generation)}else if(wrap.dataset.ready==='yes'){wrap.replaceChildren();wrap.dataset.ready='';viewports.delete(Number(wrap.dataset.page))}}},{root:$('#document'),rootMargin:'700px 0px'});
 container.querySelectorAll('.pdf-page').forEach(w=>pageObserver.observe(w));
 restoreReadingAnchor(anchor);appliedViewSize=documentSize();
 page=anchor.page;$('#page').value=page;lastReadingAnchor=anchor;requestAnimationFrame(()=>{if(generation===pageGeneration)restoringView=false});
}
function restoreReadingAnchor(anchor){const root=$('#document'),target=document.querySelector(`.pdf-page[data-page="${anchor.page}"]`);if(!target)return;const r=target.getBoundingClientRect(),v=root.getBoundingClientRect(),scroll=anchorScroll(anchor,{top:r.top-v.top+root.scrollTop,left:r.left-v.left+root.scrollLeft,height:r.height,width:r.width},{width:root.clientWidth});programmaticScrollUntil=Date.now()+400;root.scrollTo({...scroll,behavior:'instant'})}
function drawPage(wrap,generation){if(wrap.renderPromise)return wrap.renderPromise;wrap.renderPromise=renderPage(wrap,generation).finally(()=>{wrap.renderPromise=null});return wrap.renderPromise}
async function renderPage(wrap,generation){if(wrap.dataset.ready==='yes'||wrap.dataset.ready==='loading')return;wrap.dataset.ready='loading';let number=Number(wrap.dataset.page);try{let p=await doc.getPage(number);if(generation!==pageGeneration)return;let viewport=p.getViewport({scale});viewports.set(number,viewport);wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';let canvas=document.createElement('canvas'),marks=document.createElement('div'),layer=document.createElement('div');marks.className='annotation-layer';layer.className='textLayer';let ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8000000/(viewport.width*viewport.height)));canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';layer.style.setProperty('--scale-factor',viewport.scale);wrap.replaceChildren(canvas,marks,layer);await p.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;if(generation!==pageGeneration)return;const textContent=await p.getTextContent(),textLayer=new pdfjs.TextLayer({textContentSource:textContent,container:layer,viewport});await textLayer.render();prepareTextGeometry(wrap,textContent,textLayer.textDivs,viewport);orderTextLayer(layer,textLayer.textDivs);wrap.textDivsByItem=new Map();let divIndex=0;for(let i=0;i<textContent.items.length;i++)if(typeof textContent.items[i].str==='string')wrap.textDivsByItem.set(i,textLayer.textDivs[divIndex++]);wrap.dataset.ready='yes';paintAnnotations();showTranslations();repositionAnnotationCard();readerExtras.pageReady(wrap,p,viewport)}catch(e){wrap.dataset.ready='';toast('页面加载失败：'+e.message)}}
function annotationType(a){return annotationKind(a)}
function paintAnnotations(){
 for(const wrap of document.querySelectorAll('.pdf-page')){
  const number=Number(wrap.dataset.page),viewport=viewports.get(number),layer=wrap.querySelector('.annotation-layer');if(!viewport||!layer)continue;layer.replaceChildren();const groups=new Map();
  for(const a of (readerExtras.canWrite()?visibleAnnotations():[])){if(a.position?.pageIndex!==number-1||a.draftId===pencilInput.activeDraftId&&a.draftId)continue;if(annotationType(a)==='ink')continue;const color=a.color||'#ffd400',type=annotationType(a),key=type+color;if(!groups.has(key))groups.set(key,{color,type,rects:[]});for(const rect of a.position.rects||[]){const r=viewport.convertToViewportRectangle(rect);groups.get(key).rects.push(fitHighlightToLine({left:Math.min(r[0],r[2]),right:Math.max(r[0],r[2]),top:Math.min(r[1],r[3]),bottom:Math.max(r[1],r[3])},wrap.inkLines))}}
  for(const {color,type,rects} of groups.values()){const group=document.createElement('div');group.className='annotation-color-group'+(type==='underline'?' underline-group':'');layer.append(group);for(const r of mergeRects(rects)){const mark=document.createElement('div');mark.className='annotation-mark'+(type==='underline'?' annotation-underline':'');Object.assign(mark.style,{left:r.left+'px',top:r.top+'px',width:r.right-r.left+'px',height:r.bottom-r.top+'px',backgroundColor:color});mark.style.setProperty('--annotation-color',color);group.append(mark)}}
  const ink=visibleAnnotations().filter(a=>annotationType(a)==='ink'&&a.position?.pageIndex===number-1&&(!a.draftId||a.draftId!==pencilInput.activeDraftId));if(readerExtras.canWrite()&&ink.length)renderInk(layer,ink,viewport);
  if(editingAnnotation?.position?.pageIndex===number-1&&!$('#selection-actions').hidden&&$('#selection-actions').dataset.mode==='annotation'){for(const rect of annotationRects(editingAnnotation)){const r=viewport.convertToViewportRectangle(rect),outline=document.createElement('div');outline.className='annotation-selection-outline';Object.assign(outline.style,{left:Math.min(r[0],r[2])-2+'px',top:Math.min(r[1],r[3])-2+'px',width:Math.abs(r[2]-r[0])+4+'px',height:Math.abs(r[3]-r[1])+4+'px'});layer.append(outline)}}
 }
}

function turn(n){if(!doc)return;pencilInput.finish();++navigationGeneration;closeSelection();page=Math.max(1,Math.min(doc.numPages,n));$('#page').value=page;const root=$('#document'),target=document.querySelector(`.pdf-page[data-page="${page}"]`);if(target){programmaticScrollUntil=Date.now()+400;root.scrollTo({top:root.scrollTop+target.getBoundingClientRect().top-root.getBoundingClientRect().top,behavior:'instant'})}lastReadingAnchor=currentAnchor();saveReadingPosition()}
let scrollTimer;$('#document').addEventListener('scroll',()=>{if(restoringView||documentSize()!==appliedViewSize)return;lastReadingAnchor=currentAnchor();if(lastReadingAnchor){page=lastReadingAnchor.page;$('#page').value=page}clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>saveReadingPosition(),500)},{passive:true});
function setZoom(mode,manual=scale){if(!doc)return;++navigationGeneration;const anchor=currentAnchor();zoomMode=mode;scale=manual;applyFit();render(anchor);setTimeout(()=>saveReadingPosition(),50)}
$('#prev').onclick=()=>turn(page-1);$('#next').onclick=()=>turn(page+1);$('#page').onchange=e=>turn(Number(e.target.value)||1);
$('#zoomin').onclick=()=>setZoom('manual',Math.min(4,scale+.15));$('#zoomout').onclick=()=>setZoom('manual',Math.max(.15,scale-.15));$('#zoom-mode').onchange=e=>setZoom(e.target.value);
$('#refresh').onclick=async()=>{metadataCache.expire();await load({force:true});if(!$('#panel').hidden&&$('#panel').dataset.view==='plan')showReadingPlan(true)};$('#menu').onclick=toggleLibrary;$('#back').onclick=toggleLibrary;$('#close-panel').onclick=()=>$('#panel').hidden=true;
let resizeTimer,lastDocumentSize='';new ResizeObserver(()=>{const signature=documentSize();if(signature===lastDocumentSize)return;lastDocumentSize=signature;clearTimeout(resizeTimer);const resizeDoc=doc,anchor=lastReadingAnchor||currentAnchor();resizeTimer=setTimeout(()=>{if(!doc||doc!==resizeDoc||restoringView||selectionInput.active||pencilInput.active||!anchor)return;const before=scale;applyFit();if(Math.abs(before-scale)>.002)render(anchor);else{restoreReadingAnchor(anchor);appliedViewSize=documentSize();lastReadingAnchor=anchor;repositionAnnotationCard()}},160)}).observe($('#document'));
let selectionPointerDown=false,lastSelectionBox=null,lastSelectionShown=0;
const compactLayout=()=>matchMedia('(max-width:760px), (max-width:1366px) and (any-pointer:coarse)').matches;
function positionSelectionPopover(anchor=lastSelectionBox){const bar=$('#selection-actions');if(bar.hidden||!anchor)return;const v=window.visualViewport;const viewport={left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};bar.style.maxHeight=Math.max(100,viewport.height-16)+'px';const pos=popoverPosition(anchor,bar.offsetWidth,bar.offsetHeight,viewport);bar.style.left=pos.left+'px';bar.style.top=pos.top+'px';bar.classList.toggle('popover-above',pos.top+bar.offsetHeight<=anchor.top);bar.style.setProperty('--arrow-left',Math.max(14,Math.min(bar.offsetWidth-14,((anchor.left+anchor.right)/2||anchor.left)-pos.left))+'px')}
function updateSelection(){if(pencilInput.mode!=='select'||pencilInput.active)return;if(selectionInput.active||selectionPointerDown||$('#selection-actions').contains(document.activeElement))return;let selection=window.getSelection();let text=selection?.toString().trim();let bar=$('#selection-actions');if(!text||!selection.rangeCount||!selection.anchorNode?.parentElement?.closest('.textLayer')){return}let range=selection.getRangeAt(0), r=range.getBoundingClientRect(), pageElement=selection.anchorNode.parentElement.closest('.pdf-page');if(!pageElement)return;let endElement=selection.focusNode?.parentElement?.closest('.pdf-page');if(endElement!==pageElement){$('#selection-actions').hidden=true;return}page=Number(pageElement.dataset.page);currentViewport=viewports.get(page);let wrap=pageElement.getBoundingClientRect();if(!currentViewport)return;let signature=attachment.key+':'+page+':'+text+':'+range.startOffset+':'+range.endOffset+':'+Math.round((r.top-wrap.top)*10)+':'+Math.round((r.left-wrap.left)*10);selected=text;selectionRects=selectionInkRects(range,pageElement).map(x=>{let a=currentViewport.convertToPdfPoint(x.left,x.top),b=currentViewport.convertToPdfPoint(x.right,x.bottom);return [a[0],a[1],b[0],b[1]].map(v=>Number(v.toFixed(3)))});if(!selectionRects.length)return;selectionAnchor={x:Math.max(0,Math.min(1,(r.left-wrap.left)/wrap.width)),y:Math.max(0,Math.min(1,(r.bottom-wrap.top)/wrap.height))};lastSelectionBox=selectionFocusRect(selection)||r;bar.hidden=false;lastSelectionShown=Date.now();positionSelectionPopover();
 if(signature!==lastSelectionSignature){flushEditor();if(selectedType==='ink')selectedType='highlight';editingAnnotation=null;editorDirty=false;editorSession={key:attachment.key,page,text,position:{pageIndex:page-1,rects:selectionRects},target:null,type:selectedType,revision:0,tags:[],pdfRevision};setPopoverMode('selection');lastSelectionSignature=signature;translateSelected();const mode=markTool.claim(editorSession);if(mode)saveAnnotation(false,markColor,mode);paintAnnotations()}
}
const servicePicker=$('#translation-service');servicePicker.value=localStorage.getItem('paper-reader-translation-service')||'cnki';
function translateSelected(){if(servicePicker.value==='cnki'&&!zoteroAvailability.available){++translationRequest;clearTimeout(translationTimer);$('#translation-text').value='';$('#translation-state').textContent=zoteroAvailability.message;resizeTranslation();positionSelectionPopover();return}let text=selected,service=servicePicker.value,label=servicePicker.options[servicePicker.selectedIndex].textContent,serial=++translationRequest;clearTimeout(translationTimer);$('#translation-text').value='';$('#translation-state').textContent='正在翻译…';resizeTranslation();positionSelectionPopover();translationTimer=setTimeout(async()=>{try{const result=await post('/api/translate',{text:selectionTextForTranslation(text),service});if(serial===translationRequest){$('#translation-text').value=result.text;$('#translation-state').textContent=label;resizeTranslation();positionSelectionPopover()}}catch(e){if(serial===translationRequest)$('#translation-state').textContent='翻译失败：'+e.message}},500)}
servicePicker.addEventListener('change',()=>{localStorage.setItem('paper-reader-translation-service',servicePicker.value);if(selected&&!$('#selection-actions').hidden)translateSelected()});
document.addEventListener('selectionchange',()=>{clearTimeout(selectionTimer);if(!selectionInput.active&&!selectionPointerDown)selectionTimer=setTimeout(updateSelection,300)});
document.addEventListener('pointerdown',e=>{if(e.target.closest?.('.textLayer')){selectionPointerDown=true;clearTimeout(selectionTimer)}},{capture:true});
const finishSelection=()=>{selectionPointerDown=false;clearTimeout(selectionTimer);selectionTimer=setTimeout(updateSelection,180)};
document.addEventListener('pointerup',finishSelection);document.addEventListener('pointercancel',()=>{selectionPointerDown=false});document.addEventListener('touchend',finishSelection);
window.visualViewport?.addEventListener('resize',()=>positionSelectionPopover());window.visualViewport?.addEventListener('scroll',()=>positionSelectionPopover());
$('#selection-actions').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});

function showTranslations(){document.querySelectorAll('.translation-note').forEach(e=>e.remove());for(const n of translations){let wrap=document.querySelector(`.pdf-page[data-page="${n.page}"]`);if(!wrap||wrap.dataset.ready!=='yes')continue;let note=document.createElement('div');note.className='translation-note';note.style.left=Math.min(75,Math.max(1,n.x*100))+'%';note.style.top=(n.y*100)+'%';let t=document.createElement('span');t.textContent=n.text;let close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','删除译文');close.onclick=async()=>{try{await post('/api/translation-delete',{id:n.id});translations=translations.filter(x=>x.id!==n.id);note.remove()}catch(e){toast(e.message)}};note.append(t,close);wrap.append(note)}}
function activeEditor(){return $('#selection-actions').dataset.mode==='annotation'?$('#annotation-comment'):$('#translation-text')}
function updateModeButtons(){for(const [id,type] of [['mark-mode','highlight'],['underline-mode','underline']])$('#'+id).setAttribute('aria-pressed',String(selectedType===type));for(const b of document.querySelectorAll('.swatch'))b.setAttribute('aria-pressed',String(b.dataset.color===selectedColor))}
function setPopoverMode(mode){const bar=$('#selection-actions');bar.dataset.mode=mode;if(mode==='selection')bar.dataset.annotationKind='text';bar.classList.remove('editing-color');$('#change-annotation-color').setAttribute('aria-expanded','false');updateModeButtons();positionSelectionPopover()}
function resizeTranslation(){const field=$('#translation-text');field.style.height='auto';field.style.height=Math.max(76,Math.min(210,field.scrollHeight))+'px'}
function drawAnnotationTags(){
 const chips=$('#annotation-tag-chips'),presets=$('#annotation-tag-presets');chips.replaceChildren();presets.replaceChildren();if(!editorSession)return;
 for(const tag of editorSession.tags||[]){const chip=document.createElement('button');chip.className='tag-chip';chip.textContent=tag+' ×';chip.setAttribute('aria-label','移除标签：'+tag);chip.onclick=()=>changeAnnotationTag(tag,false);chips.append(chip)}
 for(const tag of ['定义','证明思路','疑问','待回看']){const button=document.createElement('button');button.textContent=tag;button.setAttribute('aria-pressed',String((editorSession.tags||[]).includes(tag)));button.onclick=()=>changeAnnotationTag(tag,!(editorSession.tags||[]).includes(tag));presets.append(button)}
 positionSelectionPopover();
}
function changeAnnotationTag(value,add=true){if(!editorSession)return;const tag=value.trim();if(!tag)return;const tags=new Set(editorSession.tags||[]);if(add)tags.add(tag);else tags.delete(tag);if(tags.size>40){toast('每条批注最多 40 个标签');return}editorSession.tags=[...tags].sort();editorSession.revision++;drawAnnotationTags();saveAnnotation(true,selectedColor)}
$('#annotation-tag-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();changeAnnotationTag(event.target.value);event.target.value=''}});
const annotationWriter=createAnnotationWriter({
 storage:browserStorage,review:payload=>post('/api/annotation-pdf-review',payload),create:payload=>post('/api/annotation',payload),update:payload=>post('/api/annotation-update',payload),remove:payload=>post('/api/annotation-delete',payload),onDraft:()=>paintAnnotations(),
 onSaved:(session,target,edit)=>{if(target){delete target.browserDraft;delete target.draftId;delete target.deleted}if(attachment?.key===session.key){if(edit.deleted)annotations=annotations.filter(a=>a.id!==target?.id);else if(!annotations.some(a=>a.id===target.id))annotations.push(target);else Object.assign(annotations.find(a=>a.id===target.id),target)}if(session===editorSession&&!edit.deleted){editingAnnotation=target;$('#annotation-type').style.color=target.color;$('#annotation-type').classList.toggle('is-underline',target.type==='underline');if(session.revision===edit.revision){$('#annotation-save-state').textContent='已保存';$('#annotation-save-state').classList.remove('save-error')}}paintAnnotations();if($('#panel').dataset.view==='notes'&&!$('#panel').hidden)notesRender?.()}
});
function flushEditor(){clearTimeout(editorTimer);if(editorDirty&&editorSession)return saveAnnotation(true,selectedColor);return Promise.resolve(true)}
function closeSelection(){flushEditor();const bar=$('#selection-actions');if(bar.contains(document.activeElement))document.activeElement.blur();bar.hidden=true;lastSelectionSignature='';++translationRequest;clearTimeout(translationTimer);paintAnnotations()}
async function saveAnnotation(withComment=true,color=selectedColor,type=selectedType){
 const session=editorSession;if(!session)return false;const revision=session.revision,comment=withComment?activeEditor().value.trim():(session.target?.comment||'');editorDirty=false;selectedColor=color;selectedType=type;session.type=type;updateModeButtons();$('#annotation-save-state').textContent='正在保存…';
 if(!readerExtras.canWrite()){try{annotationWriter.stage(session,{comment,color,type,revision,tags:session.tags||[]});$('#annotation-save-state').textContent='PDF 已变化，草稿保留，等待核对'}catch(e){editorDirty=true;toast('浏览器无法保存草稿：'+e.message)}return false}
 try{await annotationWriter.save(session,{comment,color,type,revision,tags:session.tags||[]});if(session===editorSession&&!selectionInput.active&&$('#selection-actions').dataset.mode==='selection')window.getSelection()?.removeAllRanges();return true}
 catch(e){if(session===editorSession){editorDirty=true;$('#annotation-save-state').textContent='草稿已保留，等待恢复连接';$('#annotation-save-state').classList.add('save-error')}if(!browserStorage||!annotationWriter.drafts(session.key).length)toast('浏览器无法保存草稿，请保留此页并复制批注：'+e.message);return false}
}
for(const button of document.querySelectorAll('.swatch')){button.style.setProperty('--swatch',button.dataset.color);button.onclick=()=>saveAnnotation(true,button.dataset.color)}
$('#mark-mode').onclick=()=>saveAnnotation(true,selectedColor,'highlight');$('#underline-mode').onclick=()=>saveAnnotation(true,selectedColor,'underline');
for(const field of [$('#translation-text'),$('#annotation-comment')]){
 field.addEventListener('input',()=>{editorDirty=true;if(editorSession){editorSession.revision++;try{annotationWriter.stage(editorSession,{comment:field.value.trim(),color:selectedColor,type:selectedType,revision:editorSession.revision,tags:editorSession.tags||[]})}catch(e){toast('浏览器无法保存草稿，请保留此页并复制批注：'+e.message)}}++translationRequest;clearTimeout(translationTimer);$('#annotation-save-state').textContent='正在编辑…';if(field.id==='translation-text'){$('#translation-state').textContent='批注';resizeTranslation()}clearTimeout(editorTimer);editorTimer=setTimeout(()=>saveAnnotation(true,selectedColor),650)});
 field.addEventListener('blur',()=>{if(editorDirty)flushEditor()});
}
async function copySelected(){try{await navigator.clipboard.writeText(selected)}catch(e){toast('复制失败，请使用系统复制')}}
$('#copy-selection').onclick=copySelected;$('#copy-annotation').onclick=copySelected;
$('#change-annotation-color').onclick=()=>{const bar=$('#selection-actions');bar.classList.toggle('editing-color');$('#change-annotation-color').setAttribute('aria-expanded',String(bar.classList.contains('editing-color')));positionSelectionPopover()};
async function removeAnnotationSession(session){clearTimeout(editorTimer);editorDirty=false;try{await annotationWriter.remove(session)}catch(e){if(!annotationWriter.drafts(session.key).length)toast('删除尚未保存：'+e.message)}if(attachment?.key===session.key)annotations=annotations.filter(a=>a.id!==session.target?.id&&a.draftId!==session.draftId);if(editorSession===session){editingAnnotation=null;editorSession=null;$('#selection-actions').hidden=true}paintAnnotations()}
$('#delete-annotation').onclick=()=>{if(editorSession)removeAnnotationSession(editorSession)};
function openAnnotation(a,event,wrap){
 flushEditor();clearTimeout(translationTimer);editingAnnotation=a;selected=a.text||'';selectionRects=a.position.rects||[];page=Number(wrap.dataset.page);currentViewport=viewports.get(page);selectedColor=a.color||'#ffd400';selectedType=annotationType(a);editorDirty=false;editorSession={key:attachment.key,page,text:selected,position:a.position,target:a.id.startsWith('b:')?null:a,draftId:a.draftId,type:selectedType,revision:0,base:a.base,tags:[...(a.tags||[])],pdfRevision:a.pdfRevision||pdfRevision};lastSelectionSignature='';++translationRequest;window.getSelection()?.removeAllRanges();
 drawAnnotationTags();$('#annotation-comment').value=a.comment||'';$('#conflict-details').hidden=!a.conflict;$('#conflict-draft').textContent=a.webDraftComment||'';$('#annotation-page').textContent='页 '+(a.pageLabel||page);$('#annotation-type').classList.toggle('is-underline',selectedType==='underline');$('#annotation-type').classList.toggle('is-ink',selectedType==='ink');$('#annotation-type').textContent=selectedType==='ink'?'✎':'A';$('#selection-actions').dataset.annotationKind=selectedType;$('#annotation-type').style.color=selectedColor;$('#annotation-save-state').textContent=a.conflict?'双方内容已保留，等待核对':a.needsPdfReview?'PDF 已变化，请先在管理面板核对位置':'批注会自动保存';$('#annotation-save-state').classList.remove('save-error');const bar=$('#selection-actions');lastSelectionBox={left:event.clientX,right:event.clientX,top:event.clientY,bottom:event.clientY};bar.hidden=false;setPopoverMode('annotation');positionSelectionPopover();paintAnnotations();
}

function repositionAnnotationCard(){const a=editingAnnotation,bar=$('#selection-actions');if(!a||bar.hidden||bar.dataset.mode!=='annotation')return;const number=(a.position?.pageIndex??0)+1,wrap=document.querySelector(`.pdf-page[data-page="${number}"]`),viewport=viewports.get(number),rect=annotationRects(a)[0];if(!wrap||!viewport||!rect)return;const r=viewport.convertToViewportRectangle(rect),box=wrap.getBoundingClientRect();lastSelectionBox={left:box.left+Math.max(r[0],r[2]),right:box.left+Math.max(r[0],r[2]),top:box.top+Math.min(r[1],r[3]),bottom:box.top+Math.max(r[1],r[3])};positionSelectionPopover()}
function annotationAtPoint(event,wrap){if(!wrap)return null;const viewport=viewports.get(Number(wrap.dataset.page)),box=wrap.getBoundingClientRect();if(!viewport)return null;const padding=matchMedia('(any-pointer:coarse)').matches?7:2;return [...visibleAnnotations()].reverse().find(x=>x.position?.pageIndex===Number(wrap.dataset.page)-1&&(annotationType(x)==='ink'?inkHitTest(x.position,viewport.convertToPdfPoint(event.clientX-box.left,event.clientY-box.top),padding/viewport.scale):annotationRects(x).some(rect=>{const r=viewport.convertToViewportRectangle(rect);return event.clientX-box.left>=Math.min(r[0],r[2])-padding&&event.clientX-box.left<=Math.max(r[0],r[2])+padding&&event.clientY-box.top>=Math.min(r[1],r[3])-padding&&event.clientY-box.top<=Math.max(r[1],r[3])+padding})))}
let selectionInput;
const pencilInput=installPencilTools($('#document'),{
 getState:()=>({attachment,pdfRevision,canWrite:!attachment||readerExtras.canWrite()}),getViewport:wrap=>viewports.get(Number(wrap.dataset.page)),getAnnotations:visibleAnnotations,
 onStart:()=>{selectionInput?.cancel();selectionPointerDown=false;clearTimeout(selectionTimer);closeSelection()},
 onBegin:ctx=>({key:ctx.key,page:ctx.page,text:'',position:null,target:null,type:'ink',revision:0,tags:[],pdfRevision:ctx.pdfRevision,inkColor:ctx.color,drawing:true}),
 onDraft:stageInk,onCommit:saveInk,onErase:eraseInk,onUndo:async sessions=>{for(const session of sessions){session.drawing=false;await annotationWriter.remove(session);inkRecovery.delete(session.draftId)}paintAnnotations()},
 onRestore:async a=>{const s={key:a.key,page:a.position.pageIndex+1,text:'',position:a.position,target:null,type:'ink',revision:0,tags:a.tags||[],pdfRevision:a.pdfRevision,inkColor:a.color};s.restoreComment=a.comment||'';await saveInk(s,a.position);return s},
 onExport:()=>{const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),paper:current,annotations:visibleAnnotations().filter(a=>annotationType(a)==='ink'),browserDrafts:annotationWriter.export(),recovery:recoveryAnnotations()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ZE-handwriting-'+(attachment?.key||'backup')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},onPaint:paintAnnotations
});
function inkEdit(s){return {comment:s.restoreComment||'',color:s.inkColor,type:'ink',revision:s.revision,tags:s.tags||[]}}
function stageInk(s,position){s.position=position;s.revision++;reportActivity();inkRecovery.delete(s.draftId);try{annotationWriter.stage(s,inkEdit(s))}catch(error){inkRecovery.set(s.draftId,s);paintAnnotations();throw Error('手写尚未缓存，请保留此页并点底栏备份')}}
async function saveInk(s,position){s.drawing=false;s.position=position;try{stageInk(s,position);await annotationWriter.save(s,inkEdit(s));inkRecovery.delete(s.draftId)}catch(error){if(!annotationWriter.drafts(s.key).some(a=>a.draftId===s.draftId)){inkRecovery.set(s.draftId,s);throw Error('手写尚未缓存，请先备份')}}finally{paintAnnotations()}}
function eraseInk(a,ctx){const session=annotationSession(a,ctx.key),pending=annotationWriter.remove(session);pending.catch(()=>{});return annotationWriter.drafts(ctx.key).some(d=>d.draftId===session.draftId&&d.deleted)?session:null}
selectionInput=installSelectionInput($('#document'),{getPenMode:()=>pencilInput.mode,
 onStart:()=>{clearTimeout(selectionTimer);closeSelection()},
 onFinish:()=>{selectionPointerDown=false;updateSelection()},
 onTap:(event,wrap)=>{const a=annotationAtPoint(event,wrap);if(!a)return false;openAnnotation(a,event,wrap);return true}
});
$('#document').addEventListener('scroll',()=>{const bar=$('#selection-actions');if(Date.now()>programmaticScrollUntil&&!selectionInput.active&&!selectionPointerDown&&!bar.contains(document.activeElement)){if(!bar.hidden)closeSelection();window.getSelection()?.removeAllRanges()}},{passive:true});
$('#touch-select').onclick=()=>{const button=$('#touch-select'),enabled=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'划词中':'手指划词';selectionInput.setFingerSelect(enabled);closeSelection()};
document.addEventListener('click',event=>{const bar=$('#selection-actions');if(bar.contains(event.target))return;const wrap=event.target.closest?.('.pdf-page');if(wrap&&pencilInput.mode!=='select')return;if(wrap&&(pencilInput.suppressClick||selectionInput.suppressClick||Date.now()-lastSelectionShown<400))return;if(wrap&&!window.getSelection()?.toString().trim()){const a=annotationAtPoint(event,wrap);if(a){openAnnotation(a,event,wrap);return}}if(!bar.hidden)closeSelection()});

let notesRequest=0,notesRender=null;
async function jumpToAnnotation(a){const p=(a.position?.pageIndex??0)+1;if(compactLayout())$('#panel').hidden=true;turn(p);let wrap=document.querySelector(`.pdf-page[data-page="${p}"]`);if(!wrap)return;await drawPage(wrap,pageGeneration);const viewport=viewports.get(p),rect=annotationRects(a)[0];if(!viewport||!rect)return;const r=viewport.convertToViewportRectangle(rect),root=$('#document');programmaticScrollUntil=Date.now()+400;root.scrollTo({top:root.scrollTop+wrap.getBoundingClientRect().top-root.getBoundingClientRect().top+Math.min(r[1],r[3])-100,behavior:'instant'});const box=wrap.getBoundingClientRect();openAnnotation(a,{clientX:box.left+(r[0]+r[2])/2,clientY:box.top+Math.max(r[1],r[3])},wrap)}
function annotationSession(a,key=attachment.key){return {key,page:(a.position?.pageIndex??0)+1,text:a.text,position:a.position,target:a.id.startsWith('b:')?null:a,draftId:a.draftId,type:annotationType(a),base:a.base,tags:[...(a.tags||[])],pdfRevision:a.pdfRevision||pdfRevision}}
function snapshotDescription(value){if(!value)return '未记录原始版本';return (value.comment||'（无批注文字）')+'\n颜色：'+(value.color||'未指定')+' · '+(value.type==='underline'?'下划线':'高亮')+'\n标签：'+((value.tags||[]).join('、')||'无')}
async function keepLocalConflict(a){await post('/api/annotation-conflict',{key:attachment.key,id:a.id,resolution:'keep_local'});await readAnnotations(attachment.key);if(editorSession?.target?.id===a.id)closeSelection();notesRender?.()}
function managedNote(a,key,refresh){
 const card=document.createElement('article');card.className='managed-note';card.style.setProperty('--note-color',a.color||'#ffd400');
 const jump=document.createElement('button');jump.className='annotation-item';jump.textContent=`第 ${(a.position?.pageIndex??0)+1} 页 · ${annotationType(a)==='ink'?'手写':annotationType(a)==='underline'?'下划线':'高亮'}${a.browserDraft?' · 浏览器草稿':a.conflict?' · 待核对冲突':a.pending?' · 待同步':''}\n${a.text||''}${a.comment?'\n'+a.comment:''}`;jump.onclick=event=>{event.stopPropagation();jumpToAnnotation(a)};card.append(jump);
 const labels=document.createElement('div');for(const tag of a.tags||[]){const label=document.createElement('button');label.className='note-tag';label.textContent=tag;label.onclick=()=>{$('#notes-tag').value=tag;refresh()};labels.append(label)}card.append(labels);
 if(a.conflict){
  const detail=document.createElement('details');detail.className='conflict-box';const summary=document.createElement('summary');summary.textContent=a.conflictKind==='delete'?'删除已暂停，查看变化':'查看双方内容与原始版本';detail.append(summary);
  const data=a.conflictDetails||{};for(const [title,value] of [['打开时的版本',data.base],['Zotero 当前内容',a.base],['网页草稿',data.web||{comment:a.webDraftComment}],...(data.olderWeb?[['另一网页草稿',data.olderWeb]]:[])]){const heading=document.createElement('strong'),text=document.createElement('pre');heading.textContent=title;text.textContent=snapshotDescription(value);detail.append(heading,text)}
  const keep=document.createElement('button');keep.className='conflict-action';keep.textContent='保留本地版本';keep.onclick=async()=>{try{await keepLocalConflict(a)}catch(e){toast(e.message)}};detail.append(keep);
  if(a.conflictKind!=='delete'){const merge=document.createElement('button');merge.className='conflict-action';merge.textContent='合并后编辑';merge.onclick=async event=>{event.stopPropagation();await jumpToAnnotation(a);if(editorSession){editorSession.resolve=true;const snippets=[a.webDraftComment,data.olderWeb?.comment].filter(Boolean);for(const value of snippets)if(!$('#annotation-comment').value.includes(value))$('#annotation-comment').value+='\n\n'+value;$('#annotation-comment').focus()}};detail.append(merge)}card.append(detail);
 }
 if(a.needsPdfReview||a.conflictDetails?.reason==='pdf_changed'){
  const warning=document.createElement('p');warning.className='pdf-review-note';warning.textContent='这条标注关联旧 PDF，核对选区位置后再继续同步。';const review=document.createElement('button');review.className='conflict-action';review.textContent='此标注位置已核对';review.onclick=async()=>{try{if(!readerExtras.canWrite())throw Error('请先重新打开并核对页面上方提示的当前 PDF');if(a.browserDraft){annotationWriter.reviewPdf(a.draftId,pdfRevision);await annotationWriter.retry()}else await post('/api/annotation-pdf-review',{key,id:a.id,revision:pdfRevision});await readAnnotations(key);refresh()}catch(e){toast(e.message)}};card.append(warning,review);
 }
 const actions=document.createElement('div');actions.className='note-actions';const edit=document.createElement('button');edit.textContent='定位并编辑';edit.onclick=event=>{event.stopPropagation();jumpToAnnotation(a)};const del=document.createElement('button');del.textContent='删除';del.className='danger';del.onclick=async()=>{if(!confirm('删除这条标注？'))return;await removeAnnotationSession(annotationSession(a,key));refresh()};actions.append(edit,del);card.append(actions);return card;
}
async function showNotes(){
 if(!attachment)return;await flushEditor();const serial=++notesRequest,key=attachment.key,panel=$('#panel'),box=$('#panel-content');panel.dataset.view='notes';$('#panel .panel-title h2').textContent='批注管理';panel.hidden=false;
 box.innerHTML=`<div class="note-actions"><button id="retry-drafts">重试保存</button><button id="export-drafts">导出备份</button></div><div class="note-filters"><input id="notes-query" aria-label="搜索标注" placeholder="搜索原文、批注、标签或冲突草稿"><select id="notes-color" aria-label="筛选标注颜色"><option value="">所有颜色</option>${[...$('#tool-color').options].map(o=>`<option value="${o.value}">${o.textContent}</option>`).join('')}</select><select id="notes-type" aria-label="筛选标注类型"><option value="">所有类型</option><option value="highlight">高亮</option><option value="underline">下划线</option><option value="ink">手写</option></select><select id="notes-tag" aria-label="筛选批注标签"><option value="">所有标签</option></select><select id="notes-status" aria-label="筛选同步状态"><option value="">所有状态</option><option value="pending">等待同步</option><option value="browser">浏览器草稿</option><option value="conflict">有冲突</option><option value="saved">已同步</option></select><input id="notes-page" type="number" min="1" max="${doc.numPages}" aria-label="筛选页码" placeholder="页码"></div><p id="notes-summary" role="status">正在读取最新标注…</p><div id="notes-list"></div>`;
 const renderList=()=>{if(panel.dataset.view!=='notes'||attachment?.key!==key||serial!==notesRequest)return;const all=visibleAnnotations(),picker=$('#notes-tag'),chosen=picker.value;picker.innerHTML='<option value="">所有标签</option>';for(const tag of [...new Set(all.flatMap(a=>a.tags||[]))].sort()){const option=document.createElement('option');option.value=tag;option.textContent=tag;picker.append(option)}picker.value=chosen;
  const filtered=filterAnnotations(all,{query:$('#notes-query').value,color:$('#notes-color').value,type:$('#notes-type').value,page:$('#notes-page').value,status:$('#notes-status').value,tag:picker.value});$('#notes-summary').textContent=`${filtered.length} / ${all.length} 条标注`;const list=$('#notes-list');list.replaceChildren();for(const a of filtered)list.append(managedNote(a,key,renderList));if(!filtered.length)list.textContent='没有符合条件的标注。';
 };notesRender=renderList;
 for(const input of box.querySelectorAll('.note-filters input,.note-filters select'))input.addEventListener('input',renderList);
 $('#retry-drafts').onclick=async()=>{try{await annotationWriter.retry();await readAnnotations(key);renderList()}catch(e){renderList();$('#notes-summary').textContent='草稿已保留，重试失败：'+e.message}};
 $('#export-drafts').onclick=()=>{const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),paper:current,annotations:visibleAnnotations(),browserDrafts:annotationWriter.export(),recovery:recoveryAnnotations()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='paper-reader-annotations-'+key+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 renderList();try{await readAnnotations(key);renderList()}catch(e){if(serial===notesRequest&&panel.dataset.view==='notes')$('#notes-summary').textContent='读取最新标注失败，浏览器草稿仍保留：'+e.message}
}
$('#show-notes').onclick=showNotes;
$('#append-conflict').onclick=()=>{const value=$('#conflict-draft').textContent,field=$('#annotation-comment');if(editorSession)editorSession.resolve=true;if(value&&!field.value.endsWith(value)){field.value+='\n\n'+value;field.dispatchEvent(new Event('input',{bubbles:true}))}$('#conflict-details').hidden=true};
$('#keep-local-conflict').onclick=async()=>{if(editingAnnotation)try{await keepLocalConflict(editingAnnotation)}catch(e){toast(e.message)}};
$('#save-resolved-conflict').onclick=()=>{if(editorSession){editorSession.resolve=true;editorSession.revision++;saveAnnotation(true,selectedColor)}};
let markColor=browserStorage?.getItem('paper-reader-mark-color')||'#ffd400';$('#tool-color').value=markColor;
$('#tool-color').style.setProperty('--tool-color',markColor);$('#tool-color').onchange=e=>{markColor=e.target.value;e.target.style.setProperty('--tool-color',markColor);try{browserStorage?.setItem('paper-reader-mark-color',markColor)}catch{}};
$('#mark-tool').onchange=e=>{markTool.setMode(e.target.value);$('#document').classList.toggle('continuous-mark',markTool.mode!=='select');closeSelection()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){markTool.setMode('select');$('#mark-tool').value='select';$('#document').classList.remove('continuous-mark');closeSelection()}});
let draftRetrying=false;async function retryBrowserDrafts(){if(draftRetrying)return;draftRetrying=true;try{if(editorDirty)await flushEditor();for(const s of [...inkRecovery.values()])if(!s.drawing)await saveInk(s,s.position);await annotationWriter.retry();paintAnnotations()}catch{}finally{draftRetrying=false}}
window.addEventListener('online',retryBrowserDrafts);
setInterval(()=>{if(document.visibilityState==='visible'&&(inkRecovery.size||annotationWriter.drafts().length))retryBrowserDrafts()},15000);
window.addEventListener('pagehide',()=>{flushEditor();saveReadingPosition({keepalive:true})});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){flushEditor();saveReadingPosition({keepalive:true})}else retryBrowserDrafts()});
annotationWriter.retry().catch(()=>{});



let lastPing=0;function reportActivity(){if(Date.now()-lastPing>10000){lastPing=Date.now();post('/api/activity',{active:true}).catch(()=>{})}};for(const event of ['pointerdown','keydown','wheel','touchstart'])document.addEventListener(event,reportActivity,{passive:true});

setInterval(()=>{if(document.visibilityState==='visible' && document.hasFocus())reportActivity()},20000);

function updateLibraryToggle(){const mobile=compactLayout();const library=$('#library');const visible=mobile?library.classList.contains('open'):!library.classList.contains('collapsed');const button=$('#menu');button.setAttribute('aria-expanded',String(visible));button.setAttribute('aria-label',visible?'收起文献列表':'打开文献列表');button.title=visible?'收起文献列表':'打开文献列表'}
function toggleLibrary(){const library=$('#library');if(compactLayout())library.classList.toggle('open');else library.classList.toggle('collapsed');updateLibraryToggle()}
window.addEventListener('resize',updateLibraryToggle);updateLibraryToggle();

const syncButton=$('#sync-now');
syncButton.addEventListener('pointerdown',e=>e.preventDefault());
syncButton.addEventListener('click',async()=>{
  await flushEditor();await annotationWriter.flush();try{await annotationWriter.retry()}catch(e){toast('草稿已保留，连接恢复后可重试：'+e.message);return}
  syncButton.disabled=true;syncButton.textContent='同步中…';
  try{const result=await post('/api/sync',{});await refreshOpenAnnotation();if(result.error)toast(`已同步 ${result.synced} 条，剩余 ${result.remaining} 条：${result.error}`);else if(result.skipped)toast(`已同步 ${result.synced} 条；${result.skipped} 条需要核对，已暂停写回并保留草稿`);else toast(result.synced?`已同步 ${result.synced} 条标注`:'没有待同步的标注')}
  catch(e){toast('同步失败：'+e.message)}finally{syncButton.disabled=!zoteroAvailability.available;syncButton.textContent='立即同步'}
});

async function showReadingPlan(force=false){
 await saveReadingPosition();const serial=++planRequest,panel=$('#panel'),box=$('#panel-content');panel.dataset.view='plan';panel.hidden=false;$('#panel .panel-title h2').textContent='阅读计划';box.textContent='正在读取阅读计划…';
 try{
  const result=await metadataCache.get('/api/reading-plan',{force});if(serial!==planRequest||panel.dataset.view!=='plan')return;const steps=result.data.steps;box.replaceChildren();
  const summary=document.createElement('p');summary.className='plan-summary';const resumeBox=document.createElement('div');resumeBox.className='plan-resume';box.append(summary,resumeBox);let progress={};const paperButtons=new Map();const refreshResume=()=>{resumeBox.replaceChildren();const result=planResume(steps,progress);for(const [key,{button,item}] of paperButtons){button.textContent=(item.title||'未命名文献')+(progress[key]?.updated?' · 第 '+progress[key].page+' 页':'')}for(const [label,entry] of [['继续上次阅读',result.resume],['开始下一项',result.next]]){if(!entry||(label==='开始下一项'&&entry.item.key===result.resume?.item.key))continue;const b=document.createElement('button');b.className='plan-continue';b.textContent=label+' · '+(entry.item.title||'未命名文献')+(entry.progress?.updated?' · 第 '+entry.progress.page+' 页':'');b.onclick=()=>{if(compactLayout())panel.hidden=true;openPaper(entry.item)};resumeBox.append(b)}};
  const refreshSummary=()=>{summary.textContent=`已完成 ${steps.filter(s=>s.done).length} / ${steps.length} 项`};refreshSummary();
  const checkboxes=new Map();let statusRevision=0;
  for(const step of steps){
   const group=document.createElement('section');group.className='plan-step';
   const label=document.createElement('label');label.className='plan-heading';const check=document.createElement('input');check.type='checkbox';check.checked=step.done;checkboxes.set(step.tag,check);
   const title=document.createElement('span');title.textContent=step.tag.replace('阅读顺序-','').replaceAll('-', ' · ');label.append(check,title);group.append(label);
   check.onchange=async()=>{statusRevision++;check.disabled=true;try{await post('/api/reading-plan',{tag:step.tag,done:check.checked});step.done=check.checked;metadataCache.update('/api/reading-plan',data=>({...data,steps:data.steps.map(s=>s.tag===step.tag?{...s,done:step.done}:s)}));refreshSummary();refreshResume()}catch(e){check.checked=!check.checked;toast('保存失败：'+e.message)}finally{check.disabled=false}};
   if(!step.items.length){const empty=document.createElement('div');empty.className='plan-empty';empty.textContent='没有找到带此标签的论文';group.append(empty)}
   for(const item of step.items){const button=document.createElement('button');button.className='plan-paper';paperButtons.set(item.key,{button,item});button.textContent=item.title||'未命名文献';button.onclick=()=>{if(compactLayout())panel.hidden=true;openPaper(item)};group.append(button)}box.append(group);
  }
  // Only the small completion-status response is fetched on repeated opens.
  try{const revision=statusRevision,status=await api('/api/reading-plan-status');if(serial!==planRequest||panel.dataset.view!=='plan'||revision!==statusRevision)return;progress=status.progress||{};const done=new Set(status.done);for(const step of steps){if(checkboxes.get(step.tag).disabled)continue;step.done=done.has(step.tag);checkboxes.get(step.tag).checked=step.done}refreshSummary();refreshResume()}catch{summary.textContent+=' · 完成状态暂未更新'}
 }catch(e){if(serial===planRequest)box.textContent='读取阅读计划失败：'+e.message}
}
$('#show-plan').onclick=()=>showReadingPlan();

async function closePaper(){pencilInput.finish();await flushEditor();await saveReadingPosition();closeSelection();++openGeneration;++pageGeneration;pageObserver?.disconnect();const old=doc;doc=null;current=null;attachment=null;pdfRevision=null;annotations=[];translations=[];viewports=new Map();$('#pages-container').replaceChildren();$('#reader').hidden=true;$('#welcome').hidden=false;$('#panel').hidden=true;old?.destroy();readerExtras.closed();pencilInput.refresh();draw()}
async function ensurePage(number){const wrap=document.querySelector(`.pdf-page[data-page="${number}"]`);if(wrap)await drawPage(wrap,pageGeneration);return wrap}
async function navigateAnchor(anchor){const request=++navigationGeneration,targetDoc=doc,targetPage=Math.max(1,Math.min(doc.numPages,anchor.page));closeSelection();page=targetPage;$('#page').value=targetPage;await ensurePage(targetPage);if(request!==navigationGeneration||doc!==targetDoc)return;const target={...anchor,page:targetPage};restoreReadingAnchor(target);page=targetPage;$('#page').value=targetPage;lastReadingAnchor=target;saveReadingPosition()}
const readerExtras=createReaderExtras({storage:browserStorage,getState:()=>({doc,current,attachment,pdfRevision,viewports,onRevisionReviewed:()=>{readAnnotations(attachment.key).then(()=>{paintAnnotations();if($('#panel').dataset.view==='notes'&&!$('#panel').hidden)showNotes()}).catch(()=>{})}}),api,post,openPaper,closePaper,goTo:navigateAnchor,ensurePage,getAnchor:currentAnchor,flush:flushEditor,notify:toast});


async function refreshOpenAnnotation(){const session=editorSession,key=attachment?.key,revision=session?.revision;if(!key)return;try{await readAnnotations(key);if(session&&session===editorSession&&!editorDirty&&session.revision===revision&&!annotationWriter.drafts(key).length){const fresh=annotations.find(a=>a.id===session.target?.id||(a.aliases||[]).includes(session.target?.id));if(fresh&&!fresh.pending&&!fresh.conflict){session.base=fresh.base;session.target=fresh;session.tags=[...(fresh.tags||[])];session.pdfRevision=fresh.pdfRevision||pdfRevision;if(!$('#selection-actions').hidden&&$('#selection-actions').dataset.mode==='annotation'){$('#annotation-comment').value=fresh.comment||'';selectedColor=fresh.color;selectedType=annotationType(fresh);drawAnnotationTags();updateModeButtons()}}}if($('#panel').dataset.view==='notes'&&!$('#panel').hidden)notesRender?.()}catch{}}
window.addEventListener('focus',()=>{if(!editorDirty)refreshOpenAnnotation()});

let libraryStatus='文献已就绪',readerStarted=false;
function setLibraryStatus(text){libraryStatus=text;$('#status').textContent=zoteroAvailability.available?text:'Zotero 未连接'}
const zoteroAvailability=createZoteroAvailability({check:()=>api('/api/zotero-status'),onChange:(state,wasAvailable)=>{
 document.body.classList.toggle('zotero-offline',!state.available);
 if(readerStarted&&state.available&&!wasAvailable)load();
 $('#status').textContent=state.available?libraryStatus:'Zotero 未连接';
 if(!state.available&&servicePicker.value==='cnki'){++translationRequest;clearTimeout(translationTimer);if(!$('#selection-actions').hidden&&$('#selection-actions').dataset.mode==='selection')$('#translation-state').textContent=state.message}
 if(state.available&&!wasAvailable&&selected&&!editorDirty&&!$('#selection-actions').contains(document.activeElement)&&!$('#selection-actions').hidden&&$('#selection-actions').dataset.mode==='selection'&&servicePicker.value==='cnki')translateSelected();
}});
new ResizeObserver(entries=>{document.body.style.setProperty('--zotero-notice-height',entries[0].target.getBoundingClientRect().height+'px')}).observe($('#zotero-notice'));
setInterval(()=>{if(document.visibilityState==='visible')zoteroAvailability.refresh()},15000);
window.addEventListener('focus',()=>zoteroAvailability.refresh());
zoteroAvailability.refresh().then(()=>{readerStarted=true;load();if(zoteroAvailability.available)readerExtras.restore()});
