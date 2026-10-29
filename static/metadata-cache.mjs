const PREFIX='paper-reader:metadata:v1:';
export function cacheableMetadata(url){
 if(url==='/api/collections'||url==='/api/reading-plan'||url==='/api/items')return true;
 return /^\/api\/items\?collection=[A-Z0-9]{8}$/.test(url);
}
export function createMetadataCache({storage,fetcher,now=Date.now,ttl=24*60*60*1000}){
 const memory=new Map(),inflight=new Map();let generation=0;
 function read(url){
  if(memory.has(url))return memory.get(url);
  try{const entry=JSON.parse(storage?.getItem(PREFIX+url)||'null');if(entry?.version===1&&Number.isFinite(entry.cachedAt)&&entry.data!==undefined){memory.set(url,entry);return entry}}catch{}
  return null;
 }
 function write(url,data,cachedAt=now()){
  if(!cacheableMetadata(url))return;
  const entry={version:1,cachedAt,data};memory.set(url,entry);
  try{storage?.setItem(PREFIX+url,JSON.stringify(entry))}catch{}
 }
 function urls(){const keys=new Set(memory.keys());try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))keys.add(key.slice(PREFIX.length))}}catch{}return keys}
 return {
  async get(url,{force=false}={}){
   if(!cacheableMetadata(url))return {data:await fetcher(url),cached:false,stale:false};
   const entry=read(url);
   if(!force&&entry&&now()-entry.cachedAt<ttl)return {data:entry.data,cached:true,stale:false};
   if(inflight.has(url))return inflight.get(url);
   const epoch=generation;
   const request=Promise.resolve().then(()=>fetcher(url)).then(data=>{if(epoch===generation)write(url,data);return {data,cached:false,stale:false}}).catch(error=>{if(entry)return {data:entry.data,cached:true,stale:true,error};throw error}).finally(()=>{if(inflight.get(url)===request)inflight.delete(url)});
   inflight.set(url,request);return request;
  },
  update(url,fn){const entry=read(url);if(entry)write(url,fn(entry.data),entry.cachedAt)},
  expire(){generation++;inflight.clear();for(const url of urls()){const entry=read(url);if(entry)write(url,entry.data,now()-ttl-1)}},
  clear(){generation++;inflight.clear();for(const url of urls()){try{storage?.removeItem(PREFIX+url)}catch{}}memory.clear()},
 };
}
