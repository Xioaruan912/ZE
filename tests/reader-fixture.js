const fixtureRuntimeErrors=document.createElement('pre');fixtureRuntimeErrors.id='fixture-runtime-errors';fixtureRuntimeErrors.hidden=true;document.body.append(fixtureRuntimeErrors);window.addEventListener('error',e=>{if(!e.message.startsWith('ResizeObserver loop'))fixtureRuntimeErrors.textContent+=(e.error?.stack||e.message)+'\n'});
if(new URL(location.href).searchParams.has('preview')){const previewStyle=document.createElement('style');previewStyle.textContent='#run-fixture,#run-touch-fixture,#fixture-result,#touch-fixture-result,#run-pencil-fixture,#pencil-fixture-result{display:none!important}';document.head.append(previewStyle)}
// Native per-tab storage keeps independent test pages from retrying each other's drafts.
Object.defineProperty(window,'localStorage',{configurable:true,value:window.sessionStorage});
// Test-only coarse input emulation; it never ships in the app.
if(new URL(location.href).searchParams.get('touch')==='1'){const nativeMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('any-pointer:coarse')?{media:query,matches:true,addEventListener(){},removeEventListener(){}}:nativeMatchMedia(query)}
// The real app runs against this in-memory boundary, never the user's library.
const originalFetch=window.fetch,notes=[],receipts=new Map(),positions={};let offline=false,zoteroOnline=true,sequence=0,translationCalls=0;
for(const key of Object.keys(localStorage))if(key.startsWith('paper-reader:draft:v1:')||key.startsWith('paper-reader:metadata:'))localStorage.removeItem(key);
localStorage.removeItem('paper-reader:tabs:v1');
const fixtureItem={key:'TESTPAPR',title:'Reader interaction fixture',creators:[{last:'Sahai'}],date:'2005',tags:['基础']},fixturePosition={pageIndex:0,rects:[[50,695,300,715]]};
const secondItem={key:'SECONDP1',title:'Second paper fixture'},initialRevision='a'.repeat(64),pdfStates=new Map(),pdfReads=new Map();
const statusFor=key=>{if(!pdfStates.has(key))pdfStates.set(key,{revision:initialRevision,reviewedRevision:initialRevision,needsReview:false,size:1000});return pdfStates.get(key)};
notes.push({id:'z:TESTNOTE',key:'TESTPDF1',text:'Reliable annotations',comment:'Existing comment',color:'#ff6666',type:'highlight',position:fixturePosition,tags:['定义'],pdfRevision:initialRevision});
window.fetch=async(url,options={})=>{
 const parsed=new URL(typeof url==='string'?url:url.url||String(url),location.origin);
 if(parsed.origin!==location.origin||!parsed.pathname.startsWith('/api/'))return originalFetch(url,options);
 const path=parsed.pathname,key=parsed.searchParams.get('key'),body=options.body?JSON.parse(options.body):{};let result={ok:true};
 if(offline&&options.method==='POST'&&path.startsWith('/api/annotation'))throw Error('fixture offline');
 if(path==='/api/zotero-status')result={available:zoteroOnline,message:zoteroOnline?'已连接 Zotero':'需要开启这台电脑上的 Zotero；已打开的论文可继续阅读，批注会保留为草稿。'};
 if(path==='/api/collections')result={collections:[{key:'ROOT0001',name:'密码学'},{key:'CHILD001',name:'基础论文',parentCollection:'ROOT0001'}]};
 if(path==='/api/items')result={items:parsed.searchParams.get('collection')==='CHILD001'?[fixtureItem]:[fixtureItem,secondItem]};
 if(path==='/api/children')result={items:[{key:key==='SECONDP1'?'PDFTEST2':'TESTPDF1',itemType:'attachment',title:'Fixture.pdf'}]};
 if(path==='/api/pdf'){pdfReads.set(key,(pdfReads.get(key)||0)+1);return originalFetch(url,options)}
 if(path==='/api/pdf-status')result=statusFor(key);
 if(path==='/api/pdf-review'){const status=statusFor(body.key);status.needsReview=false;status.reviewedRevision=body.revision;result=status}
 if(path==='/api/annotation-pdf-review'){const note=notes.find(a=>a.id===body.id);if(note){note.pdfRevision=body.revision;note.pdf_revision=body.revision;note.needsPdfReview=false}}
 if(path==='/api/annotation-conflict'){const note=notes.find(a=>a.id===body.id);if(note){delete note.conflict;delete note.conflictDetails;delete note.webDraftComment}}
 if(path==='/api/annotations')result=notes.filter(a=>a.key===key).map(a=>({...a,pdfRevision:a.pdf_revision||a.pdfRevision||initialRevision,needsPdfReview:(a.pdf_revision||a.pdfRevision||initialRevision)!==statusFor(key).revision,base:{comment:a.comment,color:a.color,type:a.type,tags:a.tags||[],structure:'fixture',version:1}}));
 if(path==='/api/translations')result=[];
 if(path==='/api/progress'){if(options.method==='POST')positions[body.key]={...body,updated:Date.now()/1000};else result=positions[key]||{page:1,fraction:0,x:.5}}
 if(path==='/api/reading-plan')result={steps:[{tag:'阅读顺序-01-基础-IBE',done:false,items:[fixtureItem]}]};
 if(path==='/api/reading-plan-status')result={done:[],progress:positions};
 if(path==='/api/annotation'){
  let id=receipts.get(body.client_id);if(!id){id='p:'+(++sequence);receipts.set(body.client_id,id);notes.push({...body,id})}result={id};
 }
 if(path==='/api/annotation-update'){const a=notes.find(a=>a.id===body.id);if(a)Object.assign(a,body)}
 if(path==='/api/annotation-delete'){const i=notes.findIndex(a=>a.id===body.id);if(i>=0)notes.splice(i,1)}
 if(path==='/api/translate'){translationCalls++;result={text:'译文：可靠的批注让阅读更舒适。'}};
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
window.addEventListener('DOMContentLoaded',()=>{
 document.querySelector('#run-fixture').onclick=async()=>{
  const output=document.querySelector('#fixture-result'),results=[],$=s=>document.querySelector(s),pause=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async(predicate,label)=>{for(let i=0;i<100;i++){if(predicate())return;await pause(50)}throw Error(label)};
  const assert=(condition,label)=>{if(!condition)throw Error(label);results.push('PASS '+label);output.textContent=results.join('\n')};
  try{
   await wait(()=>$('.item'),'library loads');
   if(matchMedia('(max-width:760px), (max-width:1366px) and (any-pointer:coarse)').matches&&!$('#library').classList.contains('open'))$('#menu').click();
   assert($('#collection-picker').hidden&&$('#items').getBoundingClientRect().height>innerHeight*.5,'library gives most space to papers and hides the category tree');
   $('#library-scope').click();await wait(()=>!$('#collection-picker').hidden,'category picker opens');$('.tree-toggle[data-key="ROOT0001"]').click();$('.tree-folder[data-key="CHILD001"]').click();await wait(()=>$('#library-count').textContent==='1 篇文献','collection filters papers');
   assert($('#collection-picker').hidden&&$('#library-scope-name').textContent==='基础论文'&&$('#library-scope').title.includes('密码学'),'choosing a nested collection closes its panel and retains the path');
   for(const query of ['Sahai','2005','基础']){$('#search').value=query;$('#search').dispatchEvent(new Event('input'));assert(document.querySelectorAll('.item').length===1,'sidebar search matches '+query)}
   $('#search').value='missing';$('#search').dispatchEvent(new Event('input'));assert(!$('.item')&&$('.library-empty'),'empty search has an explicit recovery state');$('#clear-library-search').click();
   $('#library-scope').click();$('.tree-all').click();await wait(()=>document.querySelectorAll('.item').length===2,'all papers restored');
   $('.item').focus();$('.item').click();await wait(()=>$('.pdf-page[data-ready="yes"] .textLayer span'),'PDF opens');
   await wait(()=>document.documentElement.dataset.zeMotion,'ZE motion loads');
   assert(document.title==='ZE','ZE product title is applied');
   const pageBox=$('.pdf-page').getBoundingClientRect(),menu=$('#menu');
   menu.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',pointerId:7}));await pause(70);
   assert(document.documentElement.dataset.zeMotion==='reduced'||getComputedStyle(menu).transform!=='none','controls have physical press feedback');
   menu.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',pointerId:7}));
   assert(Math.abs($('.pdf-page').getBoundingClientRect().width-pageBox.width)<.1&&!document.getAnimations().some(a=>a.effect?.target?.closest?.('#document')),'interface motion never animates PDF geometry');
   const layer=$('.pdf-page[data-ready="yes"] .textLayer'),base=[...layer.querySelectorAll('span')].find(s=>s.textContent==='Let p'),exponent=[...layer.querySelectorAll('span')].find(s=>s.textContent==='3'),mathRange=document.createRange();mathRange.setStart(base.firstChild,0);mathRange.setEnd(exponent.firstChild,1);
   assert(!mathRange.toString().includes('UNRELATED'),'superscript selection excludes later paragraphs');
   $('#show-notes').click();await wait(()=>$('.managed-note'),'notes load');$('.managed-note .note-actions button').click();await pause(500);
   assert(!$('#selection-actions').hidden,'annotation card survives programmatic jump');
   assert(!$('#annotation-menu-toggle')&&[...document.querySelectorAll('#annotation-actions button')].every(b=>b.getBoundingClientRect().width>35&&getComputedStyle(b).color!=='rgb(255, 255, 255)'),'color copy and delete are readable direct buttons');
   $('#change-annotation-color').click();assert($('#selection-actions').classList.contains('editing-color')&&$('#change-annotation-color').getAttribute('aria-expanded')==='true','color palette opens with one click');$('#change-annotation-color').click();
   let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text}}});$('#copy-annotation').click();await pause(20);assert(copied==='Reliable annotations','original annotation text copies with one click');
   $('#annotation-comment').value='Updated existing comment';$('#annotation-comment').dispatchEvent(new Event('input'));await wait(()=>notes[0].comment==='Updated existing comment','existing annotation updates');assert(true,'existing annotation remains editable');
   const initialPage=$('#page').value;$('#zoom-mode').value='page';$('#zoom-mode').dispatchEvent(new Event('change'));await pause(300);assert($('#page').value===initialPage,'zoom retains reading page');
   $('#close-panel').click();$('#mark-tool').value='highlight';$('#mark-tool').dispatchEvent(new Event('change'));await pause(350);
   await wait(()=>$('.pdf-page[data-ready="yes"] .textLayer span'),'text layer ready');
   const select=async()=>{await wait(()=>$('.pdf-page[data-ready="yes"] .textLayer span'),'selectable page ready');const span=$('.pdf-page[data-ready="yes"] .textLayer span'),text=span.firstChild,r=document.createRange();r.setStart(text,0);r.setEnd(text,Math.min(20,text.length));const selection=getSelection();selection.removeAllRanges();selection.addRange(r);document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse'}))};
   await select();await wait(()=>notes.length===2,'continuous highlight saved');document.dispatchEvent(new Event('selectionchange'));await pause(500);assert(notes.length===2,'continuous selection creates once');
   const markRect=notes[1].position.rects[0];assert(Math.abs(Math.abs(markRect[3]-markRect[1])-16.65)<.1,'new highlight uses native PDF cap height and descent instead of browser line leading');
   $('#mark-tool').value='select';$('#mark-tool').dispatchEvent(new Event('change'));await select();await wait(()=>$('#translation-text').value.includes('译文'),'translation appears');assert(notes.length===2,'selection mode does not create marks');assert($('#translation-text').value.includes('译文'),'translation appears in selection card');
   const span=$('.textLayer span'),textStyle=getComputedStyle(span);assert(textStyle.color==='rgba(0, 0, 0, 0)'&&textStyle.textShadow==='none','selectable text stays invisible over the PDF canvas');
   zoteroOnline=false;window.dispatchEvent(new Event('focus'));await wait(()=>$('#refresh').disabled,'Zotero offline disables refresh');
   assert($('#sync-now').disabled&&$('.item').disabled&&!$('#zotero-notice').hidden,'Zotero offline greys dependent controls and explains recovery');
   assert(!$('#mark-tool').disabled&&!$('#annotation-comment').disabled&&!$('#translation-service option[value="google"]').disabled&&$('#translation-service option[value="cnki"]').disabled,'offline keeps reading and draft editing but disables CNKI');
   // The offline banner changes fit-page height. Select on the settled page,
   // rather than racing the reader's asynchronous resize with a detached range.
   await pause(350);await select();await wait(()=>!$('#selection-actions').hidden,'offline selection card');$('#translation-service').value='google';$('#translation-service').dispatchEvent(new Event('change'));await wait(()=>$('#translation-text').value.includes('译文'),'independent translation works offline');assert(true,'Google translation remains usable without Zotero');
   zoteroOnline=true;window.dispatchEvent(new Event('focus'));await wait(()=>!$('#refresh').disabled,'Zotero recovery reenables controls');assert(!$('#sync-now').disabled&&$('#zotero-notice').hidden,'Zotero controls recover automatically');
   offline=true;$('#translation-text').focus();$('#translation-text').value='offline important comment';$('#translation-text').dispatchEvent(new Event('input'));await pause(800);$('#translation-text').blur();await pause(100);
   const {createAnnotationWriter}=await import('/annotation-writer.mjs');const persisted=createAnnotationWriter({storage:localStorage,create:async()=>{},update:async()=>{}}).drafts('TESTPDF1');assert(persisted.some(a=>a.comment==='offline important comment'),'offline typing is durable');
   offline=false;window.dispatchEvent(new Event('online'));await wait(()=>notes.some(a=>a.comment==='offline important comment'),'offline draft retries');assert(true,'connection recovery saves the draft');
   $('#mark-tool').value='underline';$('#mark-tool').dispatchEvent(new Event('change'));await select();await wait(()=>notes.some(a=>a.type==='underline'),'continuous underline saved');assert(true,'continuous underline uses underline type');
   $('#zoom-mode').value='width';$('#zoom-mode').dispatchEvent(new Event('change'));await pause(350);$('#page').value='2';$('#page').dispatchEvent(new Event('change'));await pause(300);const root=$('#document'),paper=$('.pdf-page[data-page="2"]');root.scrollTop+=paper.getBoundingClientRect().height*.35;await pause(650);
   $('#show-plan').click();await wait(()=>$('.plan-continue'),'resume button');assert($('.plan-continue').textContent.includes('继续上次阅读'),'reading plan resumes recent paper');
   $('.plan-continue').click();await wait(()=>$('#page').value==='2'&&$('.pdf-page[data-page="2"][data-ready="yes"]'),'resume opens page two');await pause(300);const resumed=$('.pdf-page[data-page="2"]').getBoundingClientRect(),view=$('#document').getBoundingClientRect();assert((view.top-resumed.top)/resumed.height>.25,'resume restores within-page offset');
   $('#show-navigation').click();await wait(()=>document.querySelector('.navigation-entry')?.textContent==='Second page','outline loads');$('.navigation-entry').click();await pause(300);assert($('#page').value==='2','outline destination opens target page');$('#nav-back').click();await pause(250);assert((view.top-$('.pdf-page[data-page="2"]').getBoundingClientRect().top)/$('.pdf-page[data-page="2"]').getBoundingClientRect().height>.25,'navigation back restores earlier anchor');
   $('#show-navigation').click();await wait(()=>$('.navigation-modes'),'navigation modes');[...document.querySelectorAll('.navigation-modes button')].find(b=>b.textContent==='搜索').click();await wait(()=>document.querySelector('[aria-label="文内搜索"]'),'search input');const search=document.querySelector('[aria-label="文内搜索"]');search.value='Reliable';search.dispatchEvent(new Event('input'));await wait(()=>document.querySelector('.navigation-entry')?.textContent.includes('reliable'),'search result');$('.navigation-entry').click();await wait(()=>$('#page').value==='1'&&document.querySelector('.pdf-search-match.current'),'search mark ready');assert(true,'search locates and marks original text');
   $('#show-navigation').click();await wait(()=>$('.navigation-modes'),'navigation again');[...document.querySelectorAll('.navigation-modes button')].find(b=>b.textContent==='参考文献').click();await wait(()=>document.querySelector('.navigation-entry')?.textContent.startsWith('[1]'),'references detected');assert(document.querySelectorAll('.navigation-entry').length===2,'reference list identifies bibliography entries');
   await wait(()=>document.querySelector('.pdf-document-link'),'embedded link ready');document.querySelector('.pdf-document-link').click();await wait(()=>$('#page').value==='2','embedded link destination');$('#nav-back').click();await wait(()=>$('#page').value==='1','embedded link back');assert(true,'embedded PDF links support return navigation');
   $('#show-notes').click();await wait(()=>$('.managed-note'),'annotation manager');$('.managed-note .note-actions button').click();await pause(300);const preset=[...document.querySelectorAll('#annotation-tag-presets button')].find(b=>b.textContent==='疑问');preset.click();await wait(()=>notes[0].tags.includes('疑问'),'tag saves');assert(true,'annotation tags save through draft queue');$('#show-notes').click();await wait(()=>$('#notes-tag'),'tag filter');$('#notes-tag').value='疑问';$('#notes-tag').dispatchEvent(new Event('input'));assert($('#notes-summary').textContent.startsWith('1 /'),'annotation tag filter narrows notes');
   if(!document.querySelector('#library.open')&&matchMedia('(max-width:760px), (max-width:1366px) and (any-pointer:coarse)').matches)$('#menu').click();document.querySelector('.item[data-key="SECONDP1"]').click();await wait(()=>$('#title').textContent==='Second paper fixture','second paper opens');assert(document.querySelectorAll('.reading-tab').length===2,'multiple papers have independent tabs');const reads=pdfReads.get('TESTPDF1');[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent==='Reader interaction fixture').click();await wait(()=>$('#title').textContent==='Reader interaction fixture','first tab resumes');assert($('#page').value==='1'&&pdfReads.get('TESTPDF1')>reads,'tab switches fetch fresh PDF and restore position');
   const state=statusFor('TESTPDF1');state.previousRevision=state.revision;state.revision='b'.repeat(64);state.needsReview=true;window.dispatchEvent(new Event('focus'));await wait(()=>!$('#pdf-revision-notice').hidden,'PDF change notice');assert($('#pdf-revision-notice').textContent.includes('重新打开'),'changed PDF requires a fresh read');$('#pdf-revision-notice button').click();await wait(()=>$('#pdf-revision-notice button')?.textContent==='已核对此 PDF 版本','new revision opens');$('#pdf-revision-notice button').click();await wait(()=>$('#pdf-revision-notice').hidden,'PDF review acknowledged');$('#show-notes').click();await wait(()=>[...document.querySelectorAll('.conflict-action')].some(b=>b.textContent==='此标注位置已核对'),'old marks require review');assert(true,'old annotations keep separate PDF position review');
   [...document.querySelectorAll('.conflict-action')].find(b=>b.textContent==='此标注位置已核对').click();await wait(()=>notes[0].pdfRevision===state.revision,'single annotation reviewed');assert(true,'position confirmation rebinds only the selected annotation');
   const localText=notes[0].comment;Object.assign(notes[0],{conflict:true,webDraftComment:'a conflicting web draft',conflictDetails:{base:{comment:'old'},web:{comment:'a conflicting web draft'},reason:'content_changed'}});$('#show-notes').click();await wait(()=>$('.conflict-box'),'conflict comparison');$('.conflict-box summary').click();[...document.querySelectorAll('.conflict-action')].find(b=>b.textContent==='保留本地版本').click();await wait(()=>!notes[0].conflict,'keep local resolves');assert(notes[0].comment===localText,'conflict comparison can keep desktop content unchanged');
   await wait(()=>!$('.conflict-box'),'conflict resolution finishes');$('.managed-note .note-actions button').click();await wait(()=>!$('#selection-actions').hidden,'card opens for deletion');$('#delete-annotation').click();await wait(()=>!notes.some(a=>a.id==='z:TESTNOTE'),'annotation deletes');assert($('#selection-actions').hidden,'delete button removes the annotation directly and closes its card');
   document.querySelector('.reading-tab:not(.active) .tab-close').click();await wait(()=>document.querySelectorAll('.reading-tab').length===1,'inactive tab closes');document.querySelector('.tab-close').click();await wait(()=>!$('#welcome').hidden&&document.querySelectorAll('.reading-tab').length===0,'last tab closes');assert(true,'closing the last paper returns to the library');
   output.dataset.result='pass';
  }catch(error){output.textContent=results.join('\n')+'\nFAIL '+error.message;output.dataset.result='fail';console.error(error)}
 };
});
