import {animate} from 'motion';
import './ze-theme.css';
import './library-sidebar.css';
import {installTouchReader} from './touch-reader.mjs';
import './pencil-tools.css';

// Motion is confined to chrome. Never register an animation on the PDF surface
// or any ancestor that would change its selection/annotation coordinate system.
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const reduceMotion=()=>motionPreference.matches||new URL(location.href).searchParams.get('motion')==='reduce';
const running=new Map();let selecting=false,disposed=false;
const spring={type:'spring',duration:.42,bounce:.18};
function play(element,frames,options={}){
 if(!element||!element.isConnected||disposed||selecting||reduceMotion()||document.hidden||element.closest('#document'))return;
 running.get(element)?.stop();
 const control=animate(element,frames,{...spring,...options});running.set(element,control);
 Promise.resolve(control).then(()=>{if(running.get(element)===control){running.delete(element);element.style.removeProperty('transform');element.style.removeProperty('opacity')}}).catch(()=>{});
 return control;
}
function settle(){for(const [el,animation] of running){animation.stop();el.style.removeProperty('transform');el.style.removeProperty('opacity')}running.clear()}
function ready(){
 const touchReader=installTouchReader();
 document.documentElement.dataset.zeMotion=reduceMotion()?'reduced':'maximum';
 for(const id of ['menu','back','prev','next','zoomout','zoomin','nav-back','nav-forward','close-panel','copy-selection'])document.getElementById(id)?.setAttribute('data-ze-icon','only');
 for(const id of ['show-plan','sync-now','refresh'])document.getElementById(id)?.setAttribute('data-ze-icon','label');
 const cleanups=[],on=(element,event,callback,options)=>{element.addEventListener(event,callback,options);cleanups.push(()=>element.removeEventListener(event,callback,options))};
 const uiButton=target=>target.closest?.('button:not(:disabled)');let pressed=null;
 on(document,'pointerdown',event=>{
  if(event.target.closest?.('#document')){selecting=true;settle();return}
  const button=uiButton(event.target);if(!button||button.id==='run-fixture')return;
  pressed=button;play(button,{scale:[1,.95]},{duration:.16,bounce:0});
 },{capture:true,passive:true});
 const release=()=>{selecting=false;if(pressed){play(pressed,{scale:[.95,1]},{duration:.4,bounce:.24});pressed=null}};
 on(document,'pointerup',release,{capture:true,passive:true});on(document,'pointercancel',release,{capture:true,passive:true});
 on(document,'pointerover',event=>{
  if(event.pointerType!=='mouse'||selecting)return;
  const button=uiButton(event.target);if(!button||button.contains(event.relatedTarget)||button.closest('#selection-actions')||button.id==='run-fixture')return;
  if(button.matches('header button,.toolbar button,.tab-close'))play(button,{y:[0,-1]},{duration:.22,bounce:0});
 },{passive:true});
 let toastVisible=false,translationValue='';
 const observer=new MutationObserver(records=>{
  const arrivals=[];
  for(const record of records){
   const el=record.target;
   if(record.type==='attributes'){
    if(el.id==='translation-text'){if(el.value!==translationValue){translationValue=el.value;if(el.value&&document.activeElement!==el)play(el,{opacity:[.35,1],y:[4,0]},{duration:.34,bounce:0})}continue}
    if(el.id==='toast'){const visible=getComputedStyle(el).display!=='none';if(visible&&!toastVisible)play(el,{opacity:[0,1]},{duration:.22,bounce:0});toastVisible=visible;continue}
    if(el.hidden||getComputedStyle(el).display==='none')continue;
    if(el.id==='selection-actions')play(el.querySelector('.popover-content'),{opacity:[.25,1],y:[el.classList.contains('popover-above')?7:-7,0],scale:[.965,1]},{duration:.3,bounce:.12});
    else if(el.id==='panel')play(el,{opacity:[.4,1],x:[18,0]},{duration:.46});
    else if(el.id==='collection-picker')play(el,{opacity:[0,1],y:[-7,0]},{duration:.28,bounce:.1});
    else if(el.id==='library'&&!el.classList.contains('collapsed'))play(el,{opacity:[.5,1],x:[-14,0]},{duration:.44});
    else if(el.id==='welcome')play(el.querySelector('.welcome-icon'),{opacity:[0,1],y:[12,0],rotate:[-8,0]},{duration:.8,bounce:.26});
   }else for(const node of record.addedNodes){
    if(node.nodeType!==1)continue;
    if(node.matches('.reading-tab'))play(node,{opacity:[0,1],y:[-5,0]},{duration:.32});
    else if(node.matches('.item,.plan-step,.managed-note,.navigation-entry'))arrivals.push(node);
   }
  }
  if(arrivals.length&&!selecting&&!reduceMotion()&&!document.hidden){
   const visible=arrivals.filter(el=>el.getBoundingClientRect().bottom>0&&el.getBoundingClientRect().top<innerHeight).slice(0,10);
   visible.forEach((el,i)=>play(el,{opacity:[.4,1],x:[-7,0]},{duration:.42,delay:i*.022}));
  }
 });
 for(const id of ['selection-actions','panel','library','welcome','collection-picker']){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:id==='library'?['class']:['hidden','data-mode']})}
 for(const id of ['items','reading-tabs','collection-tree','panel-content']){const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,subtree:id==='panel-content'})}
 const toast=document.getElementById('toast');if(toast)observer.observe(toast,{attributes:true,attributeFilter:['style']});
 const translation=document.getElementById('translation-text');if(translation)observer.observe(translation,{attributes:true,attributeFilter:['style']});
 const preferenceChanged=()=>{settle();document.documentElement.dataset.zeMotion=reduceMotion()?'reduced':'maximum'};
 on(motionPreference,'change',preferenceChanged);
 on(document,'visibilitychange',()=>{document.documentElement.toggleAttribute('data-ze-paused',document.hidden);if(document.hidden)settle()});
 const login=document.querySelector('.ze-login main');if(login)play(login,{opacity:[0,1],y:[14,0],scale:[.98,1]},{duration:.75,bounce:.14});
 const book=document.querySelector('#welcome:not([hidden]) .welcome-icon');if(book)play(book,{opacity:[0,1],y:[15,0],rotate:[-8,0]},{duration:.9,bounce:.26});
 on(window,'pagehide',event=>{disposed=true;observer.disconnect();settle();if(!event.persisted)touchReader.destroy();cleanups.forEach(remove=>remove())},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
