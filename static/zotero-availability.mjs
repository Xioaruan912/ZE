const dependent='#refresh,#sync-now,.item,.plan-paper,.plan-continue,.reading-tab [role="tab"],#pdf-revision-notice button';
const offlineMessage='需要开启这台电脑上的 Zotero；已打开的论文可继续阅读，批注会保留为草稿。';
export function createZoteroAvailability({check,onChange=()=>{},root=document}){
 let state={available:false,message:'正在检查这台电脑上的 Zotero…'},request=null,checked=false;
 const apply=()=>{
  for(const button of root.querySelectorAll(dependent)){
   if(!state.available){
    if(!button.dataset.zoteroDisabled){button.dataset.zoteroDisabled='1';button.dataset.zoteroTitle=button.getAttribute('title')||'';button.dataset.zoteroWasDisabled=String(button.disabled)}
    button.disabled=true;button.title=state.message||offlineMessage;
   }else if(button.dataset.zoteroDisabled){
    button.disabled=button.dataset.zoteroWasDisabled==='true';button.title=button.dataset.zoteroTitle;
    delete button.dataset.zoteroDisabled;delete button.dataset.zoteroTitle;delete button.dataset.zoteroWasDisabled;
   }
  }
  const cnki=root.querySelector('#translation-service option[value="cnki"]');if(cnki){cnki.disabled=!state.available;cnki.title=state.available?'':state.message||offlineMessage}
  const notice=root.querySelector('#zotero-notice');if(notice){notice.hidden=state.available;notice.textContent=state.available?'':state.message||offlineMessage}
 };
 const update=value=>{const previous=state.available;state=value;checked=true;apply();onChange(state,previous)};
 const refresh=()=>{
  if(request)return request;
  request=Promise.resolve().then(check).then(update).catch(()=>update({available:false,reason:'unreachable',message:'暂时无法连接阅读器，请检查网络；批注草稿已保留。'})).finally(()=>{request=null});return request;
 };
 const observer=new MutationObserver(apply);
 for(const selector of ['#items','#panel-content','#reading-tabs','#pdf-revision-notice']){const element=root.querySelector(selector);if(element)observer.observe(element,{childList:true,subtree:true})}
 apply();
 return {get available(){return state.available},get checked(){return checked},get message(){return state.message||offlineMessage},refresh,apply,offline:message=>update({available:false,message:message||offlineMessage}),destroy:()=>observer.disconnect()};
}
