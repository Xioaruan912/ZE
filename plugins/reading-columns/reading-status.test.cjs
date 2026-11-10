const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/reading-columns.js','utf8');
const READ_TAG='阅读状态-已读';
function load(){const scope={};vm.createContext(scope);vm.runInContext(source,scope);return scope.ReadingColumns;}
function item({tags=['原有标签'],type='paper',parentID=null,save}={}){
 let current=tags.map(tag=>({tag,type:0}));
 const paper={parentID,attachmentContentType:type==='pdf'?'application/pdf':'',saved:[],
  isRegularItem:()=>type==='paper',isAttachment:()=>type==='pdf',
  getTags:()=>current.map(t=>({...t})),
  addTag:(tag,type)=>{if(!current.some(t=>t.tag===tag))current.push({tag,type});},
  removeTag:tag=>{current=current.filter(t=>t.tag!==tag);},
  async saveTx(){if(save)await save();paper.saved.push(paper.getTags());}
 };
 return paper;
}
function dom(){
 return {defaultView:{},createElement(){return this.createElementNS();},
  createElementNS(){return {style:{},children:[],handlers:{},attributes:{},
   appendChild(node){this.children.push(node);},setAttribute(k,v){this.attributes[k]=v;},
   addEventListener(k,fn){this.handlers[k]=fn;}
  };}
 };
}
function environment(paper,{prefs=new Map(),sort='order'}={}){
 const columns=[{dataKey:'title',hidden:false},{dataKey:'order',hidden:false},{dataKey:'position',hidden:false},{dataKey:'read',hidden:true}];
 const definitions=[],errors=[],alerts=[];
 const view={sort,refreshes:0,_getColumns:()=>columns,getRow:()=>({ref:paper}),
  async refreshAndMaintainSelection(){this.refreshes++;},getSortField(){return this.sort;},
  getSortDirection:()=>1,toggleSort(i){this.sort=columns[i].dataKey;},
  tree:{_columns:{toggleHidden(i){columns[i].hidden=!columns[i].hidden;},setOrder(i,j){columns.splice(j,0,columns.splice(i,1)[0]);}}}
 };
 const win={ZoteroPane:{getSelectedCollection:()=>({key:win.collection}),itemsView:view},collection:'BJED65AU',
  setInterval(fn){win.tick=fn;return 1;},clearInterval(){},alert:message=>alerts.push(message)};
 const zotero={ItemTreeManager:{registerColumn:options=>{definitions.push(options);return options.dataKey;},unregisterColumn:()=>{}},
  getMainWindows:()=>[win],getMainWindow:()=>win,logError:error=>errors.push(error),
  Prefs:{get:key=>prefs.get(key),set:(key,value)=>prefs.set(key,value)}
 };
 const document=dom();document.defaultView=win;
 return {zotero,columns,definitions,errors,alerts,view,win,document,prefs};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('closing a main window releases its timer without unregistering global columns',async()=>{
 const api=load(),env=environment(item());let cleared=0;env.win.clearInterval=()=>{cleared++;};
 await api.start(env.zotero);
 assert.equal(typeof api.releaseWindow,'function');api.releaseWindow(env.win);
 assert.equal(cleared,1);assert.equal(env.definitions.length,3);await api.stop();assert.equal(cleared,1);
});

test('checking and unchecking persist only the read tag without changing other tags',async()=>{
 const api=load(),paper=item();
 assert.equal(typeof api.setRead,'function');
 await api.setRead(paper,true);
 assert.deepEqual(paper.saved[0],[{tag:'原有标签',type:0},{tag:READ_TAG,type:0}]);
 assert.equal(api.isRead(paper),true);
 await api.setRead(paper,false);
 assert.deepEqual(paper.saved[1],[{tag:'原有标签',type:0}]);
 assert.equal(api.isRead(paper),false);
});
test('a failed save restores read membership and leaves unrelated tags intact',async()=>{
 const api=load(),paper=item({save:async()=>{throw new Error('read-only');}});
 assert.equal(typeof api.setRead,'function');
 await assert.rejects(api.setRead(paper,true),/read-only/);
 assert.equal(api.isRead(paper),false);
 assert.deepEqual(paper.getTags(),[{tag:'原有标签',type:0}]);
 assert.equal(paper.saved.length,0);
});
test('failed unchecking keeps the existing read tag and can be retried',async()=>{
 const api=load();let fail=true;
 const paper=item({tags:['原有标签',READ_TAG],save:async()=>{if(fail)throw new Error('offline');}});
 await assert.rejects(api.setRead(paper,false),/offline/);
 assert.equal(api.isRead(paper),true);
 assert.deepEqual(paper.getTags().map(t=>t.tag),['原有标签',READ_TAG]);
 fail=false;await api.setRead(paper,false);
 assert.equal(api.isRead(paper),false);assert.equal(paper.saved.length,1);
});
test('checking an already read paper does not create duplicate tags or redundant saves',async()=>{
 const api=load(),paper=item({tags:['原有标签',READ_TAG]});
 await api.setRead(paper,true);assert.equal(paper.saved.length,0);
 assert.equal(paper.getTags().filter(t=>t.tag===READ_TAG).length,1);
});
test('rapid changes to the same paper are saved in order',async()=>{
 const api=load();let release,entered;const gate=new Promise(r=>{release=r;});
 const firstSave=new Promise(r=>{entered=r;});let saves=0;
 const paper=item({save:async()=>{if(++saves===1){entered();await gate;}}});
 assert.equal(typeof api.setRead,'function');
 const checked=api.setRead(paper,true),unchecked=api.setRead(paper,false);
 await firstSave;assert.equal(saves,1);release();await Promise.all([checked,unchecked]);
 assert.deepEqual(paper.saved.map(tags=>tags.some(t=>t.tag===READ_TAG)),[true,false]);
});
test('upgrade shows the checkbox and hides text columns without forcing them back on branch changes',async()=>{
 const api=load(),env=environment(item());await api.start(env.zotero);
 assert.equal(env.columns.find(c=>c.dataKey==='read').hidden,false);
 assert.equal(env.columns.find(c=>c.dataKey==='order').hidden,true);
 assert.equal(env.columns.find(c=>c.dataKey==='position').hidden,true);
 assert.equal(env.columns[0].dataKey,'read');
 assert.equal(env.view.getSortField(),'title');
 env.win.collection='KMCWDIWI';env.win.tick();await settle();
 assert.equal(env.columns.find(c=>c.dataKey==='order').hidden,true);
 assert.equal(env.columns.find(c=>c.dataKey==='position').hidden,true);
 assert.equal(env.errors.length,0);await api.stop();
});
test('read checkbox works in unconfigured collections and survives rerender after branch switching',async()=>{
 const api=load(),paper=item({tags:[READ_TAG]}),env=environment(paper);env.win.collection='OTHER';
 await api.start(env.zotero);const column=env.definitions.find(c=>c.dataKey==='read');
 assert.ok(column,'read column must exist');
 const render=()=>column.renderCell(0,column.dataProvider(paper),{className:'reading-read'},true,env.document);
 const cell=render(),box=cell.children[0];
 assert.equal(box.type,'checkbox');assert.equal(box.checked,true);assert.ok(box.attributes['aria-label']);
 box.checked=false;await box.handlers.change({stopPropagation(){}});
 assert.equal(api.isRead(paper),false);assert.equal(paper.saved.length,1);
 env.win.collection='BJED65AU';assert.equal(render().children[0].checked,false);
 assert.equal(env.alerts.length,0);await api.stop();
});
test('save failure restores the checkbox and reports that the change was not saved',async()=>{
 const api=load(),paper=item({save:async()=>{throw new Error('readonly');}}),env=environment(paper);
 await api.start(env.zotero);const column=env.definitions.find(c=>c.dataKey==='read');assert.ok(column);
 const box=column.renderCell(0,'0',{className:'reading-read'},false,env.document).children[0];
 box.checked=true;await box.handlers.change({stopPropagation(){}});
 assert.equal(box.checked,false);assert.equal(box.disabled,false);assert.equal(paper.saved.length,0);
 assert.match(env.alerts[0],/未保存/);await api.stop();
});
test('child attachments and notes have no checkbox, standalone PDF does',async()=>{
 const api=load(),paper=item(),env=environment(paper);await api.start(env.zotero);
 const column=env.definitions.find(c=>c.dataKey==='read');assert.ok(column);
 for(const row of [item({parentID:42}),item({type:'note'})]){
  env.view.getRow=()=>({ref:row});
  assert.equal(column.renderCell(0,'',{className:'read'},false,env.document).children.length,0);
 }
 env.view.getRow=()=>({ref:item({type:'pdf'})});
 assert.equal(column.renderCell(0,'0',{className:'read'},false,env.document).children[0].type,'checkbox');
 await api.stop();
});
test('read setter refuses child items instead of writing a duplicate reading status',async()=>{
 const api=load(),child=item({parentID:42});
 await assert.rejects(api.setRead(child,true),/只能标记/);
 assert.equal(child.saved.length,0);
 assert.deepEqual(child.getTags(),[{tag:'原有标签',type:0}]);
});
test('layout migration preserves later manual choices after reloading the plugin',async()=>{
 const api=load(),env=environment(item());await api.start(env.zotero);
 env.columns.find(c=>c.dataKey==='order').hidden=false;await api.stop();
 await api.start(env.zotero);
 assert.equal(env.columns.find(c=>c.dataKey==='order').hidden,false);
 await api.stop();
});
