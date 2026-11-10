var ZESettings = {
 mount(doc,{store,bridge,pickTokenFile,readText}){
  let disposed=false;const listeners=[],$=id=>doc.getElementById(id),message=$('ze-settings-message'),input=$('ze-token');
  input.value='';
  const status=()=>{if(!disposed)$('ze-bridge-status').textContent=bridge?.status().message||'翻译桥接不可用';};
  const on=(id,action)=>{const node=$(id),handler=async()=>{
   node.disabled=true;
   try{await action();if(!disposed){input.value='';status();}}
   catch{if(!disposed)message.textContent='操作未完成。请检查令牌格式、翻译插件和网络；令牌应为至少 32 字符的单行内容。';}
   finally{if(!disposed)node.disabled=false;}
  };node.addEventListener('click',handler);listeners.push(()=>node.removeEventListener('click',handler));};
  on('ze-save-token',async()=>{store.setToken(input.value);message.textContent='令牌已保存到本机。';});
  on('ze-clear-token',async()=>{store.setToken('');message.textContent='本机令牌已清除。';});
  on('ze-import-token',async()=>{const path=await pickTokenFile();if(disposed||!path)return;const text=await readText(path);if(disposed)return;store.setToken(text);message.textContent='令牌已导入。';});
  on('ze-test-translation',async()=>{const result=await bridge.testTranslation();if(!disposed)message.textContent='测试结果：'+result;});
  status();
  return {dispose(){disposed=true;input.value='';for(const remove of listeners)remove();}};
 },
 watch(doc,runtime){
  let controller=null;const view=doc.defaultView;
  const mount=()=>{if(!doc.getElementById('ze-token'))return false;controller=runtime.attachSettings(doc);return true;};
  if(mount())return;
  const observer=new view.MutationObserver(()=>{if(mount())observer.disconnect();});
  observer.observe(doc.documentElement,{subtree:true,childList:true});
  view.addEventListener('unload',()=>{observer.disconnect();controller?.dispose();},{once:true});
 }
};
if(typeof document!=='undefined'&&typeof Zotero!=='undefined'&&Zotero.ZEReader)ZESettings.watch(document,Zotero.ZEReader);
