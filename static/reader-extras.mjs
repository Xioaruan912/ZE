import {createReadingTabs} from './reading-tabs.mjs';
import {indexText,findMatches,collectReferences,createNavigationHistory} from './pdf-navigation.mjs';

// This controller owns metadata-only tabs, PDF navigation, and revision notices.
// PDF documents and annotation drafts stay in the reader's existing lifecycle.
export function createReaderExtras({storage,getState,api,post,openPaper,closePaper,goTo,ensurePage,getAnchor,flush,notify}){
 const $=s=>document.querySelector(s),tabs=createReadingTabs(storage),histories=new Map();
 let serial=0,panelSerial=0,textIndexes=new Map(),hits=[],selectedHit=-1,searchSerial=0,timer,currentStatus=null,outline=null;
 const compact=()=>matchMedia('(max-width:760px), (max-width:1366px) and (any-pointer:coarse)').matches;
 const history=()=>{const s=getState(),id=s.current?.key+':'+s.pdfRevision;if(!histories.has(id))histories.set(id,createNavigationHistory());return histories.get(id)};
 function historyButtons(){$('#nav-back').disabled=!history().canBack;$('#nav-forward').disabled=!history().canForward}
 function drawTabs(){
  const strip=$('#reading-tabs');strip.replaceChildren();strip.hidden=!tabs.list().length;
  for(const item of tabs.list()){
   const row=document.createElement('div');row.className='reading-tab'+(item.key===getState().current?.key?' active':'');row.setAttribute('role','presentation');
   const button=document.createElement('button');button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-selected',String(item.key===getState().current?.key));button.textContent=item.title;button.title=item.title;button.onclick=()=>openPaper(item);
   const close=document.createElement('button');close.className='tab-close';close.textContent='×';close.setAttribute('aria-label','关闭论文：'+item.title);close.onclick=async()=>{await flush();const active=getState().current?.key===item.key,next=tabs.close(item.key);if(active){if(next)await openPaper(tabs.list().find(x=>x.key===next));else await closePaper()}drawTabs()};
   row.append(button,close);strip.append(row);
  }
  strip.querySelector('.reading-tab.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 async function navigate(anchor,push=true){if(push)history().push(getAnchor());if(compact())$('#panel').hidden=true;await goTo(anchor);historyButtons()}
 $('#nav-back').onclick=()=>{const anchor=history().back(getAnchor());if(anchor)navigate(anchor,false)};
 $('#nav-forward').onclick=()=>{const anchor=history().forward(getAnchor());if(anchor)navigate(anchor,false)};
 async function destination(dest){
  const {doc}=getState();if(!doc)return;
  try{
   const resolved=typeof dest==='string'?await doc.getDestination(dest):dest;if(!resolved)return;
   const first=resolved[0],page=(Number.isInteger(first)?first:await doc.getPageIndex(first))+1;
   await ensurePage(page);if(getState().doc!==doc)return;
   const viewport=getState().viewports.get(page),kind=resolved[1]?.name;let top=null,left=null;
   if(kind==='XYZ'){left=resolved[2];top=resolved[3]}else if(kind==='FitH'||kind==='FitBH')top=resolved[2];else if(kind==='FitR'){left=resolved[2];top=resolved[5]}
   const point=top!==null&&viewport?viewport.convertToViewportPoint(left||0,top):null;
   await navigate({page,fraction:point?Math.max(0,Math.min(1,point[1]/viewport.height)):0,x:left!==null&&point?Math.max(0,Math.min(1,point[0]/viewport.width)):.5});
  }catch(e){notify('无法跳转到该位置：'+e.message)}
 }
 function safeUrl(url){try{const target=new URL(url);return ['https:','http:'].includes(target.protocol)?target.href:null}catch{return null}}
 function renderLinks(wrap,links,viewport){
  const layer=document.createElement('div');layer.className='pdf-link-layer';
  for(const link of links){if(link.subtype!=='Link'||(!link.dest&&!safeUrl(link.url)))continue;const rect=viewport.convertToViewportRectangle(link.rect),a=document.createElement('a');a.className='pdf-document-link';a.setAttribute('aria-label',link.dest?'跳转到论文内链接':'打开参考链接');Object.assign(a.style,{left:Math.min(rect[0],rect[2])+'px',top:Math.min(rect[1],rect[3])+'px',width:Math.abs(rect[2]-rect[0])+'px',height:Math.abs(rect[3]-rect[1])+'px'});
   if(link.dest){a.href='#';a.onclick=event=>{event.preventDefault();event.stopPropagation();flush();destination(link.dest)}}else{a.href=safeUrl(link.url);a.target='_blank';a.rel='noopener noreferrer';a.onclick=event=>event.stopPropagation()}
   layer.append(a);
  }wrap.append(layer);
 }
 function matchRects(wrap,hit){
  const rects=[];for(const part of hit.parts||[]){const div=wrap.textDivsByItem?.get(part.item),node=div?.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)continue;const range=document.createRange();range.setStart(node,Math.min(part.start,node.length));range.setEnd(node,Math.min(part.end,node.length));rects.push(...range.getClientRects())}return rects;
 }
 function paintMatches(wrap){
  wrap.querySelector('.pdf-search-layer')?.remove();const layer=document.createElement('div');layer.className='pdf-search-layer';const box=wrap.getBoundingClientRect();
  for(let i=0;i<hits.length;i++){const hit=hits[i];if(hit.page!==Number(wrap.dataset.page))continue;for(const rect of matchRects(wrap,hit)){const mark=document.createElement('div');mark.className='pdf-search-match'+(i===selectedHit?' current':'');Object.assign(mark.style,{left:rect.left-box.left+'px',top:rect.top-box.top+'px',width:rect.width+'px',height:rect.height+'px'});layer.append(mark)}}wrap.append(layer);
 }
 async function reveal(hit,index=null){
  const session=serial;await navigate({page:hit.page,fraction:0,x:.5});const wrap=await ensurePage(hit.page);if(serial!==session||!wrap)return;
  if(index!==null)selectedHit=index;const rect=matchRects(wrap,hit)[0],root=$('#document');
  if(rect){const relative=(root.getBoundingClientRect().top-wrap.getBoundingClientRect().top+rect.top-root.getBoundingClientRect().top-60)/wrap.getBoundingClientRect().height;await goTo({page:hit.page,fraction:Math.max(0,Math.min(1,relative)),x:.5})}
  for(const page of document.querySelectorAll('.pdf-page[data-ready="yes"]'))paintMatches(page);
  if($('#navigation-count'))$('#navigation-count').textContent=hits.length?`${selectedHit+1} / ${hits.length} 处`:'';
 }
 async function pageIndex(pdf,page){if(textIndexes.has(page))return textIndexes.get(page);const data=await (await pdf.getPage(page)).getTextContent();const index=indexText(data.items);if(getState().doc===pdf)textIndexes.set(page,index);return index}
 function panelCurrent(id){return id===panelSerial&&$('#panel').dataset.view==='navigation'}
 function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e}
 async function outlineView(box,id){
  box.textContent='正在读取目录…';const doc=getState().doc;
  try{outline??=await doc.getOutline()||[];if(!panelCurrent(id)||getState().doc!==doc)return;box.replaceChildren();
   function draw(entries,depth=0){for(const entry of entries){const button=element('button',entry.title||'未命名章节','navigation-entry');button.style.paddingLeft=(8+depth*14)+'px';button.onclick=()=>entry.dest?destination(entry.dest):safeUrl(entry.url)&&window.open(safeUrl(entry.url),'_blank','noopener,noreferrer');box.append(button);draw(entry.items||[],depth+1)}}
   if(outline.length)draw(outline);else box.textContent='这份 PDF 没有嵌入目录，可以使用文内搜索或参考文献列表。';
  }catch(e){if(panelCurrent(id))box.textContent='目录读取失败：'+e.message}
 }
 async function referencesView(box,id){
  box.textContent='正在识别参考文献…';const {doc}=getState(),generation=serial;
  try{const pages=[];for(let page=1;page<=doc.numPages;page++){const index=await pageIndex(doc,page);if(serial!==generation||!panelCurrent(id))return;pages.push({page,index})}const refs=collectReferences(pages);box.replaceChildren();
   for(const ref of refs){const button=element('button',`[${ref.label}] ${ref.title}`,'navigation-entry');button.onclick=()=>{const index=textIndexes.get(ref.page),item=index?.items[ref.item];reveal({page:ref.page,parts:[{item:ref.item,start:0,end:item?.str?.length||0}]})};box.append(button)}
   if(!refs.length)box.textContent='没有识别到编号参考文献。PDF 自带的引用链接仍可点击跳转。';
  }catch(e){if(panelCurrent(id))box.textContent='参考文献读取失败：'+e.message}
 }
 function searchView(box,id){
  box.replaceChildren();const row=element('div',null,'navigation-search'),input=element('input');input.placeholder='搜索当前论文';input.setAttribute('aria-label','文内搜索');input.type='search';
  const prev=element('button','上一处'),next=element('button','下一处'),count=element('span');count.id='navigation-count';count.setAttribute('role','status');row.append(input,prev,next);const list=element('div');box.append(row,count,list);
  prev.onclick=()=>hits.length&&reveal(hits[(selectedHit-1+hits.length)%hits.length],(selectedHit-1+hits.length)%hits.length);next.onclick=()=>hits.length&&reveal(hits[(selectedHit+1)%hits.length],(selectedHit+1)%hits.length);
  input.oninput=()=>{clearTimeout(timer);const request=++searchSerial;hits=[];selectedHit=-1;for(const wrap of document.querySelectorAll('.pdf-page'))paintMatches(wrap);list.replaceChildren();if(!input.value.trim()){count.textContent='';return}count.textContent='正在搜索…';const query=input.value,doc=getState().doc,generation=serial;
   timer=setTimeout(async()=>{try{const results=[];for(let page=1;page<=doc.numPages;page++){const index=await pageIndex(doc,page);if(request!==searchSerial||generation!==serial||!panelCurrent(id))return;results.push(...findMatches(index,query,Math.max(0,1000-results.length)).map(hit=>({...hit,page})));count.textContent=`已搜索 ${page} / ${doc.numPages} 页`;if(results.length>=1000)break}hits=results;count.textContent=results.length?`找到 ${results.length} 处${results.length===1000?'（最多显示 1000 处）':''}`:'没有找到匹配内容';for(let i=0;i<results.length;i++){const hit=results[i],button=element('button',`第 ${hit.page} 页 · ${hit.snippet}`,'navigation-entry');button.onclick=()=>reveal(hit,i);list.append(button)}for(const wrap of document.querySelectorAll('.pdf-page[data-ready="yes"]'))paintMatches(wrap)}catch(e){if(request===searchSerial)count.textContent='搜索失败：'+e.message}},220);
  };
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(hits.length){const i=event.shiftKey?(selectedHit-1+hits.length)%hits.length:(selectedHit+1)%hits.length;reveal(hits[i],i)}}};input.focus();
 }
 async function showNavigation(mode='outline'){
  if(!getState().doc)return;await flush();const panel=$('#panel'),box=$('#panel-content'),id=++panelSerial;panel.dataset.view='navigation';panel.hidden=false;$('#panel .panel-title h2').textContent='论文内导航';box.replaceChildren();
  const bar=element('div',null,'navigation-modes'),content=element('div',null,'navigation-content');for(const [kind,title] of [['outline','目录'],['search','搜索'],['references','参考文献']]){const button=element('button',title);button.setAttribute('aria-pressed',String(kind===mode));button.onclick=()=>showNavigation(kind);bar.append(button)}box.append(bar,content);
  if(mode==='search')searchView(content,id);else if(mode==='references')referencesView(content,id);else outlineView(content,id);
 }
 $('#show-navigation').onclick=()=>showNavigation();document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&getState().doc){event.preventDefault();showNavigation('search')}});
 function revisionNotice(status){
  currentStatus=status;const state=getState(),banner=$('#pdf-revision-notice');banner.hidden=!status||(!status.needsReview&&state.pdfRevision===status.revision);if(banner.hidden)return;banner.replaceChildren();
  const same=state.pdfRevision===status.revision,info=element('span',same?'PDF 已替换。请核对页码与旧标注位置；相关写回已暂停，草稿保留。':'本地 PDF 已更新。请重新打开最新版，当前草稿仍保留。');banner.append(info);
  const action=element('button',same?'已核对此 PDF 版本':'重新打开最新版');action.onclick=async()=>{try{if(!same){await openPaper(state.current);return}const result=await post('/api/pdf-review',{key:state.attachment.key,revision:status.revision});revisionNotice(result);state.onRevisionReviewed?.()}catch(e){notify('核对失败：'+e.message)}};banner.append(action);
 }
 async function checkRevision(){const {attachment,pdfRevision}=getState();if(!attachment)return;try{const status=await api('/api/pdf-status?key='+attachment.key);if(getState().attachment?.key===attachment.key&&getState().pdfRevision===pdfRevision)revisionNotice(status)}catch{}}
 setInterval(()=>{if(document.visibilityState==='visible')checkRevision()},60000);window.addEventListener('focus',checkRevision);
 return {
  restore(){drawTabs();const item=tabs.list().find(x=>x.key===tabs.active);if(item)openPaper(item)},
  opened(status){serial++;searchSerial++;panelSerial++;textIndexes=new Map();hits=[];selectedHit=-1;outline=null;tabs.open(getState().current);drawTabs();revisionNotice(status);historyButtons();if(!$('#panel').hidden&&$('#panel').dataset.view==='navigation')showNavigation()},
  closed(){serial++;searchSerial++;panelSerial++;hits=[];currentStatus=null;$('#pdf-revision-notice').hidden=true;drawTabs()},
  pageReady(wrap,pdfPage,viewport){const generation=serial;paintMatches(wrap);pdfPage.getAnnotations({intent:'display'}).then(links=>{if(generation===serial&&wrap.isConnected)renderLinks(wrap,links,viewport)}).catch(()=>{})},
  canWrite(){return !currentStatus||(currentStatus.revision===getState().pdfRevision&&!currentStatus.needsReview)},
  status:()=>currentStatus,
  showNavigation,
 };
}
