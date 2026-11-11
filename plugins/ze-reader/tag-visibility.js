var ZETagVisibility = {
 isInternal(text){return typeof text==='string'&&['阅读顺序-','阅读状态-','阅读定位-'].some(prefix=>text.startsWith(prefix));},
 attach({win}){
  const doc=win.document,sections=new Map(),marked=new Set();let disposed=false,queued=false;
  if(!doc?.documentElement||!win.MutationObserver)throw new Error('标签显示接口不可用');
  const style=doc.createElementNS('http://www.w3.org/1999/xhtml','style');
  style.textContent='tags-box [data-ze-internal-hidden="true"] { display: none !important; }';doc.documentElement.appendChild(style);
  const unmark=row=>{row.removeAttribute('data-ze-internal-hidden');marked.delete(row);};
  function refresh(){
   if(disposed)return;
   const boxes=new Set(doc.querySelectorAll('tags-box'));
   for(const [box,state] of sections)if(!boxes.has(box)){state.button.remove();sections.delete(box);}
   for(const box of boxes){
    const body=box.querySelector('.body');if(!body)continue;
    let state=sections.get(box);
    if(!state){
     const button=doc.createElementNS('http://www.w3.org/1999/xhtml','button');button.type='button';
     button.style.cssText='font: inherit; color: inherit; background: transparent; border: 1px solid GrayText; border-radius: 4px; padding: 3px 8px; margin: 4px 0; cursor: pointer;';
     state={button,showAll:false};button.addEventListener('click',event=>{event.stopPropagation();state.showAll=!state.showAll;refresh();});
     sections.set(box,state);body.insertBefore(button,body.firstChild);
    }
    let count=0;
    for(const row of box.querySelectorAll('[tagName]')){
     const internal=ZETagVisibility.isInternal(row.getAttribute('tagName'));if(internal)count++;
     if(internal&&!state.showAll&&!row.contains(doc.activeElement)){row.setAttribute('data-ze-internal-hidden','true');marked.add(row);}else unmark(row);
    }
    const label=(state.showAll?'收起内部标签':'显示内部标签')+'（'+count+'）';
    if(state.button.textContent!==label)state.button.textContent=label;
    state.button.hidden=count===0;state.button.setAttribute('aria-expanded',String(state.showAll));
   }
   for(const row of marked)if(!doc.documentElement.contains(row))unmark(row);
  }
  function schedule(){if(disposed||queued)return;queued=true;Promise.resolve().then(()=>{queued=false;refresh();});}
  const observer=new win.MutationObserver(schedule);
  observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['tagName','tagname']});
  doc.addEventListener('focusin',schedule,true);doc.addEventListener('focusout',schedule,true);refresh();
  return {dispose(){
   if(disposed)return;disposed=true;observer.disconnect();doc.removeEventListener('focusin',schedule,true);doc.removeEventListener('focusout',schedule,true);
   for(const row of [...marked])unmark(row);for(const state of sections.values())state.button.remove();sections.clear();style.remove();
  }};
 }
};
