import fs from 'node:fs';
import vm from 'node:vm';
export const plugin=new URL('../plugins/ze-reader/',import.meta.url);
export function load(names,extra={}){
 const scope=vm.createContext({console,AbortController,setTimeout,clearTimeout,URL,...extra});
 for(const name of names){const url=name==='reading-columns.js'?new URL('../plugins/reading-columns/reading-columns.js',import.meta.url):new URL(name,plugin);vm.runInContext(fs.readFileSync(url,'utf8'),scope,{filename:name});}
 return scope;
}
export function environment(){
 const prefs=new Map([['extensions.zotero.readingRouteColumns.layoutVersion',2]]),registered=new Map(),timers=new Set(),errors=[];
 let next=0;
 const win={closed:false,ZoteroPane:{getSelectedCollection:()=>null,itemsView:{refreshAndMaintainSelection:async()=>{}}},
 setInterval(){const id=++next;timers.add(id);return id;},clearInterval(id){timers.delete(id);}};
 const Zotero={initializationPromise:Promise.resolve(),Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},
 ItemTreeManager:{registerColumn(o){if(registered.has(o.dataKey))throw Error('duplicate');registered.set(o.dataKey,o);return o.dataKey;},unregisterColumn(k){registered.delete(k);}},
 getMainWindows:()=>[win],getMainWindow:()=>win,logError:e=>errors.push(e),debug(){},Server:{Endpoints:{}}};
 return {Zotero,win,prefs,registered,timers,errors};
}
