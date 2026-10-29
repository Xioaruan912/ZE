import './touch-reader.css';

// Reuse the reader's controls and handlers. Ordinary desktop DOM and geometry
// stay intact; leaving touch layout restores the exact original node order.
export function installTouchReader({doc=document,view=window}={}){
 const toolbar=doc.querySelector('.toolbar');if(!toolbar)return {destroy(){}};
 const media=view.matchMedia('(max-width:760px), (max-width:1366px) and (any-pointer:coarse)'),html=doc.documentElement,$=s=>doc.querySelector(s);
 let teardown=null;
 function activate(){
  const originals=Array.from(toolbar.childNodes),cleanups=[],on=(el,type,fn,options)=>{el?.addEventListener(type,fn,options);cleanups.push(()=>el?.removeEventListener(type,fn,options))};
  html.setAttribute('data-ze-touch-ui','');
  const primary=doc.createElement('div');primary.className='touch-primary';primary.setAttribute('role','group');primary.setAttribute('aria-label','翻页与导航');
  const pagination=doc.createElement('div');pagination.className='touch-pagination';
  for(const el of [$('#prev'),$('#page').closest('label'),$('#next')])pagination.append(el);
  primary.append($('#show-navigation'),pagination,$('#show-notes'));
  const frame=doc.createElement('div');frame.className='touch-tools-frame';
  const tools=doc.createElement('div');tools.id='touch-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','阅读工具，可左右滑动');
  for(const id of ['mark-tool','tool-color','touch-select','zoomout','zoom-mode','zoomin','zoom-value','nav-back','nav-forward'])tools.append($('#'+id));
  const cue=doc.createElement('span');cue.className='touch-tools-cue';cue.setAttribute('aria-hidden','true');cue.textContent='›';frame.append(tools,cue);toolbar.append(primary,frame);
  const backdrop=doc.createElement('button');backdrop.id='touch-backdrop';backdrop.type='button';backdrop.hidden=true;backdrop.setAttribute('aria-label','关闭侧边面板');doc.body.append(backdrop);
  const close=doc.createElement('button');close.id='close-touch-library';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭文献列表');$('#library .library-heading')?.append(close);
  const library=$('#library'),panel=$('#panel'),workspace=$('.workspace'),wasInert=workspace.inert,oldRoles=[library,panel].map(el=>[el,el.getAttribute('role'),el.getAttribute('aria-modal')]);
  let lastPane=null,frameRequest=0;
  function updateOverflow(){frame.classList.toggle('can-scroll-next',tools.scrollLeft+tools.clientWidth<tools.scrollWidth-3);frame.classList.toggle('can-scroll-back',tools.scrollLeft>3)}
  function visibleViewport(){const v=view.visualViewport;return {top:v?.offsetTop||0,bottom:(v?.offsetTop||0)+(v?.height||view.innerHeight)}}
  function keepEditorVisible(){
   const field=doc.activeElement;if(!field?.matches?.('input,textarea,select'))return;
   const container=field.closest('.popover-content,#panel,#library');if(!container||container.scrollHeight<=container.clientHeight)return;
   const r=field.getBoundingClientRect(),box=container.getBoundingClientRect(),v=visibleViewport(),heading=container.id==='panel'?(container.querySelector('.panel-title')?.getBoundingClientRect().height||0):0,top=Math.max(box.top+heading,v.top)+8,bottom=Math.min(box.bottom,v.bottom)-8;
   if(r.bottom>bottom)container.scrollTop+=r.bottom-bottom;else if(r.top<top)container.scrollTop-=top-r.top;
  }
  function layout(){
   const v=visibleViewport();syncViewport();
   const scope=$('#library-scope');if(scope){html.style.setProperty('--ze-touch-picker-top',scope.offsetTop+scope.offsetHeight+6+'px');html.style.setProperty('--ze-touch-picker-max',Math.max(44,v.bottom-scope.getBoundingClientRect().bottom-22)+'px')}
   updateOverflow();keepEditorVisible();
  }
  function syncViewport(){const v=visibleViewport();for(const [name,value] of [['--ze-touch-view-top',v.top+'px'],['--ze-touch-view-bottom',v.bottom+'px']])if(html.style.getPropertyValue(name)!==value)html.style.setProperty(name,value)}
  function schedule(){syncViewport();view.cancelAnimationFrame(frameRequest);frameRequest=view.requestAnimationFrame(layout)}
  function sync(records=[]){
   let libraryOpen=library.classList.contains('open'),panelOpen=!panel.hidden;
   if(libraryOpen&&panelOpen){if(records.at(-1)?.target===library){panel.hidden=true;panelOpen=false}else{library.classList.remove('open');libraryOpen=false}}
   const pane=panelOpen?panel:libraryOpen?library:null;
   backdrop.hidden=!pane;workspace.inert=!!pane;
   for(const el of [library,panel]){if(el===pane){el.setAttribute('role','dialog');el.setAttribute('aria-modal','true')}else{el.removeAttribute('role');el.removeAttribute('aria-modal')}}
   const menu=$('#menu'),menuLabel=libraryOpen?'收起文献列表':'打开文献列表';menu.setAttribute('aria-expanded',String(libraryOpen));menu.setAttribute('aria-label',menuLabel);menu.title=menuLabel;
   if(!pane&&lastPane&&(lastPane.contains(doc.activeElement)||doc.activeElement===backdrop)){
    doc.activeElement?.blur();const opener=lastPane===library?menu:$('#'+(panel.dataset.view==='plan'?'show-plan':panel.dataset.view==='navigation'?'show-navigation':'show-notes'));opener?.focus({preventScroll:true});
   }
   lastPane=pane;schedule();
  }
  const dismiss=()=>{library.classList.remove('open');panel.hidden=true;sync()};
  on(close,'click',()=>{library.classList.remove('open');sync()});on(backdrop,'click',dismiss);
  on(doc,'keydown',event=>{if(event.key==='Escape'&&!backdrop.hidden){dismiss();event.preventDefault()}});
  on(tools,'scroll',updateOverflow,{passive:true});
  on(tools,'focusin',event=>{const r=event.target.getBoundingClientRect(),box=tools.getBoundingClientRect();if(r.right>box.right-8)tools.scrollLeft+=r.right-box.right+8;else if(r.left<box.left+8)tools.scrollLeft-=box.left+8-r.left});
  on(doc,'focusin',()=>{layout();schedule()});on(view,'resize',schedule);on(view.visualViewport,'resize',schedule);on(view.visualViewport,'scroll',schedule);
  const observer=new MutationObserver(sync);observer.observe(library,{attributes:true,attributeFilter:['class']});observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
  const picker=$('#collection-picker');if(picker)observer.observe(picker,{attributes:true,attributeFilter:['hidden']});
  const resize=new ResizeObserver(schedule);resize.observe(tools);resize.observe($('#zotero-notice'));sync();
  teardown=()=>{
   observer.disconnect();resize.disconnect();view.cancelAnimationFrame(frameRequest);cleanups.forEach(remove=>remove());workspace.inert=wasInert;
   for(const [el,role,modal] of oldRoles){if(role===null)el.removeAttribute('role');else el.setAttribute('role',role);if(modal===null)el.removeAttribute('aria-modal');else el.setAttribute('aria-modal',modal)}
   backdrop.remove();close.remove();toolbar.replaceChildren(...originals);library.classList.remove('open');html.removeAttribute('data-ze-touch-ui');
   for(const name of ['--ze-touch-view-top','--ze-touch-view-bottom','--ze-touch-picker-top','--ze-touch-picker-max'])html.style.removeProperty(name);teardown=null;
  };
 }
 const changed=()=>{if(media.matches&&!teardown)activate();else if(!media.matches&&teardown)teardown()};
 media.addEventListener('change',changed);changed();
 return {destroy(){media.removeEventListener('change',changed);teardown?.()}};
}
