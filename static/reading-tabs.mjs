const KEY='paper-reader:tabs:v1';
export function createReadingTabs(storage){
 let state={items:[],active:null};try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved?.items){state.items=saved.items.filter(x=>/^[A-Z0-9]{8}$/.test(x.key)&&typeof x.title==='string').map(x=>({key:x.key,title:x.title}));state.active=state.items.some(x=>x.key===saved.active)?saved.active:state.items[0]?.key||null}}catch{}
 const persist=()=>{try{storage?.setItem(KEY,JSON.stringify(state))}catch{}};
 return {get active(){return state.active},list:()=>state.items.map(x=>({...x})),open(item){const existing=state.items.find(x=>x.key===item.key);if(existing)existing.title=item.title||existing.title;else state.items.push({key:item.key,title:item.title||'未命名文献'});state.active=item.key;persist()},close(key){const index=state.items.findIndex(x=>x.key===key);if(index<0)return state.active;state.items.splice(index,1);if(state.active===key)state.active=state.items[Math.min(index,state.items.length-1)]?.key||null;persist();return state.active}};
}
