const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function load(){const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(__dirname+'/reading-columns.js','utf8'),scope);return scope.ReadingColumns;}
const tags=['阅读顺序-02访问控制-10-进阶-DualSystem2009','阅读顺序-03谓词匹配-04-基础-DualSystem2009','阅读顺序-90证明工具-10-核心-DualSystem2009','阅读定位-03谓词匹配-自己的定位','阅读顺序-02访问控制-10-进阶-duplicate','阅读顺序-bad'];
function item(){return {id:42,key:'PAPER042',libraryID:1,isRegularItem:()=>true,getTags:()=>tags.map(tag=>({tag})),getCollections:()=>[2,3,90]};}
function env(){
 const calls=[],definitions=[],collections=new Map([['BJED65AU',{id:2,key:'BJED65AU',libraryID:1,name:'按条件解密'}],['J74UBEJE',{id:3,key:'J74UBEJE',libraryID:1,name:'谓词匹配'}],['K57JIGUF',{id:90,key:'K57JIGUF',libraryID:1,name:'证明工具'}]]);
 const win={collection:'BJED65AU',ZoteroPane:{getSelectedCollection:()=>({key:win.collection}),collectionsView:{async selectCollection(id){calls.push(['collection',id]);win.collection=[...collections.values()].find(c=>c.id===id).key;return true;}},itemsView:{async selectItem(id){calls.push(['item',id]);return 1;},async refreshAndMaintainSelection(){},getRow:()=>({ref:paper})}},Zotero_Tabs:{select:id=>calls.push(['tab',id])},setInterval:()=>1,clearInterval(){}};
 const paper=item(),Zotero={Prefs:{get:()=>true},ItemTreeManager:{registerColumn:o=>{definitions.push(o);return o.dataKey;},unregisterColumn(){}},getMainWindows:()=>[win],getMainWindow:()=>win,Collections:{getByLibraryAndKey:(libraryID,key)=>{const c=collections.get(key);return c?.libraryID===libraryID?c:false;}},logError(){}};
 return {win,paper,Zotero,calls,collections,definitions};
}
test('cross-route list deduplicates branch tags and includes each branch own order and override',()=>{
 const api=load(),rows=api.routes(item());assert.equal(rows.length,3);
 const selected=rows.find(x=>x.collectionKey==='J74UBEJE');assert.equal(selected.order,'04');assert.equal(selected.position,'自己的定位');
 assert.equal(rows.find(x=>x.collectionKey==='BJED65AU').order,'10');
});
test('route jump selects the target collection and same item without writing or moving anything',async()=>{
 const api=load(),e=env();await api.start(e.Zotero);await api.jumpRoute(e.paper,'J74UBEJE',e.win);
 assert.deepEqual(e.calls,[['collection',3],['item',42],['tab','zotero-pane']]);await api.stop();
});
test('stale tags, wrong libraries and unavailable views cannot jump to an unrelated collection',async()=>{
 for(const mode of ['removed','wrong-library','missing','filtered']){
  const api=load(),e=env();await api.start(e.Zotero);
  if(mode==='removed')e.paper.getCollections=()=>[2];
  if(mode==='wrong-library')e.collections.get('J74UBEJE').libraryID=2;
  if(mode==='missing')e.collections.delete('J74UBEJE');
  if(mode==='filtered')e.win.ZoteroPane.itemsView.selectItem=async()=>false;
  await assert.rejects(api.jumpRoute(e.paper,'J74UBEJE',e.win));
  if(mode!=='filtered')assert.equal(e.calls.length,0);await api.stop();
 }
});

test('readonly branch text opens a route menu and editable cells keep the single global edit model',async()=>{
 const api=load(),e=env();
 const make=()=>({children:[],style:{},handlers:{},attributes:{},appendChild(n){this.children.push(n);return n;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.handlers[k]=v;},remove(){this.removed=true;},openPopup(){this.opened=true;},hidePopup(){this.handlers.popuphidden?.();}});
 const root=make(),doc={defaultView:e.win,documentElement:root,createElement:make,createElementNS:make,createXULElement:make,getElementById:()=>null};e.win.document=doc;
 await api.start(e.Zotero);
 const cell=e.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,doc),text=cell.children[0].children[0];
 assert.equal(text.attributes.role,'button');assert.equal(text.textContent,'进阶 · 标准模型与完全安全证明');
 await text.handlers.click({stopPropagation(){}});const menu=root.children[0];assert.equal(menu.opened,true);assert.equal(menu.children.length,3);
 assert.equal(menu.children[0].attributes.disabled,'true');assert.match(menu.children[1].attributes.label,/谓词匹配.*04.*自己的定位/);
 await menu.children[1].handlers.command();assert.deepEqual(e.calls.slice(0,2),[['collection',3],['item',42]]);
 await api.stop();assert.equal(menu.removed,true);
});

test('route navigation waits until target items load, and a later classification change aborts item selection',{timeout:2000},async()=>{
 for(const changed of [false,true]){
  const api=load(),e=env();await api.start(e.Zotero);let release,entered,loaded=false;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  e.win.ZoteroPane.itemsView.waitForLoad=async()=>{entered();await gate;loaded=true;};
  e.win.ZoteroPane.itemsView.selectItem=async id=>{assert.equal(loaded,true);e.calls.push(['item',id]);return 1;};
  const navigating=api.jumpRoute(e.paper,'J74UBEJE',e.win);await started;
  assert.deepEqual(e.calls,[['collection',3]]);
  if(changed)e.win.collection='K57JIGUF';release();
  if(changed){await assert.rejects(navigating);assert.deepEqual(e.calls,[['collection',3]]);}else await navigating;
  await api.stop();
 }
});
