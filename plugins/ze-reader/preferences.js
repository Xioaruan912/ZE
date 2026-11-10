var ZEPreferences = {
 create(Zotero){
  const prefix='extensions.zotero.zeReader.',clone=v=>JSON.parse(JSON.stringify(v));
  const empty=kind=>({version:1,[kind]:[]});
  const key=kind=>{if(!['groups','rules'].includes(kind))throw Error('未知配置类型');return prefix+kind+'.v1';};
  function valid(kind,data){
   if(!data || data.version!==1 || !Array.isArray(data[kind]))return false;
   const names=new Set();
   return data[kind].every(entry=>{
    if(!entry || typeof entry.name!=='string' || !entry.name.trim() || names.has(entry.name))return false;
    names.add(entry.name);
    if(kind==='groups')return Array.isArray(entry.attachments)&&entry.attachments.every(ref=>ref&&Number.isInteger(ref.libraryID)&&ref.libraryID>0&&/^[A-Z0-9]{8}$/.test(ref.attachmentKey)&&typeof ref.title==='string');
    return ['color','tag'].includes(entry.kind)&&typeof entry.value==='string'&&!!entry.value.trim()&&(entry.kind!=='color'||/^#[0-9a-f]{6}$/i.test(entry.value));
   });
  }
  const store={
   getToken(){const value=Zotero.Prefs.get(prefix+'bridgeToken',true);return typeof value==='string'?value:'';},
   setToken(value){
    if(typeof value!=='string')throw Error('令牌格式无效');
    const token=value.trim();
    if(token&&(token.length<32||token.length>4096||/[\x00-\x20\x7f]/.test(token)))throw Error('令牌需为至少 32 字符的单行内容');
    Zotero.Prefs.set(prefix+'bridgeToken',token,true);
   },
   readDocument(kind){
    const raw=Zotero.Prefs.get(key(kind),true);
    if(raw===undefined||raw===null||raw==='')return {data:empty(kind),warning:''};
    try{const data=JSON.parse(raw);if(valid(kind,data))return {data:clone(data),warning:''};}catch{}
    return {data:empty(kind),warning:'本机配置损坏或版本不受支持；原数据已保留，请明确重建后再保存。'};
   },
   writeDocument(kind,data,{replaceInvalid=false}={}){
    key(kind);
    if(!valid(kind,data))throw Error('配置格式无效');
    if(store.readDocument(kind).warning&&!replaceInvalid)throw Error('请先重建损坏的本机配置');
    Zotero.Prefs.set(key(kind),JSON.stringify(data),true);
   }
  };
  return store;
 }
};
