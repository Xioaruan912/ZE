const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(){const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(__dirname+'/reading-columns.js','utf8'),scope);return scope.ReadingColumns;}
function paper(tags=[],save=async()=>{}){
 let current=tags.map(t=>typeof t==='string'?{tag:t,type:0}:{...t});
 const item={parentID:null,key:'PAPER001',saves:0,isRegularItem:()=>true,getField:()=> 'Test paper',
  getTags:()=>current.map(t=>({...t})),addTag:(tag,type)=>{if(!current.some(t=>t.tag===tag))current.push({tag,type});},
  removeTag:tag=>{current=current.filter(t=>t.tag!==tag);},async saveTx(){await save();item.saves++;}};
 return item;
}
function ui(item){
 const definitions=[],alerts=[],errors=[],view={getRow:()=>({ref:item}),async refreshAndMaintainSelection(){}};
 const win={collection:'BJED65AU',ZoteroPane:{getSelectedCollection:()=>({key:win.collection}),itemsView:view},setInterval:()=>1,clearInterval(){},alert:text=>alerts.push(text)};
 const doc={defaultView:win,createElement(){return this.createElementNS();},createElementNS(){return {style:{},children:[],handlers:{},attributes:{},appendChild(node){this.children.push(node);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;}};}};
 const Zotero={Prefs:{get:()=>2},ItemTreeManager:{registerColumn:o=>{definitions.push(o);return o.dataKey;},unregisterColumn(){}},getMainWindows:()=>[win],getMainWindow:()=>win,logError:e=>errors.push(e)};
 return {definitions,alerts,errors,win,doc,Zotero};
}
const event=key=>({key,stopPropagation(){},preventDefault(){}});

test('editing an order preserves its stage, short name, other branches and read status',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006','阅读顺序-90证明工具-06-核心-ZK','阅读状态-已读','原有标签']);
 await api.setOrder(item,'BJED65AU','7');
 assert.equal(api.display(item.getTags(),'BJED65AU').order,'07');
 assert.deepEqual(item.getTags().map(t=>t.tag),['阅读顺序-90证明工具-06-核心-ZK','阅读状态-已读','原有标签','阅读顺序-02访问控制-07-奠基-KPABE2006']);
 await api.setOrder(item,'BJED65AU','07');assert.equal(item.saves,1);
});

test('a paper without a route can be numbered and clearing removes only that branch',async()=>{
 const api=load(),item=paper(['原有标签']);await api.setOrder(item,'BJED65AU','2');
 assert.equal(api.display(item.getTags(),'BJED65AU').order,'02');
 assert.ok(item.getTags().some(t=>t.tag==='阅读顺序-02访问控制-02-自定-Test paper'));
 await api.setOrder(item,'BJED65AU','');assert.deepEqual(item.getTags(),[{tag:'原有标签',type:0}]);
});

test('invalid numbers and unconfigured collections cannot write route tags',async()=>{
 const api=load(),item=paper();
 for(const value of ['0','00','100','1.5','-2','x'])await assert.rejects(api.setOrder(item,'BJED65AU',value),/01|99/);
 await assert.rejects(api.setOrder(item,'UNKNOWN','2'),/分类/);assert.equal(item.saves,0);assert.deepEqual(item.getTags(),[]);
});

test('failed order saves restore every original route tag and tag type',async()=>{
 const original=[{tag:'阅读顺序-02访问控制-03-奠基-KPABE2006',type:1},{tag:'原有标签',type:0}];
 const api=load(),item=paper(original,async()=>{throw Error('read only');});
 await assert.rejects(api.setOrder(item,'BJED65AU','5'),/read only/);
 assert.deepEqual(item.getTags().sort((a,b)=>a.tag.localeCompare(b.tag)),original.sort((a,b)=>a.tag.localeCompare(b.tag)));assert.equal(item.saves,0);
});

test('order cells accept Enter and blur saves while Escape cancels an uncommitted edit',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 const column=env.definitions.find(c=>c.dataKey==='order');
 const cell=column.renderCell(0,'03',{className:'order-column'},false,env.doc),input=cell.children[0];assert.ok(input,'order cell must contain an editable input');
 assert.equal(input.value,'03');input.value='8';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 input.value='9';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 input.value='6';await input.handlers.blur(event());assert.equal(api.display(item.getTags(),'BJED65AU').order,'06');assert.equal(env.alerts.length,0);await api.stop();
});

test('an editing cell retains its original branch after a collection switch and restores failed input',async()=>{
 let fail=false;const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);
 item.saveTx=async()=>{if(fail)throw Error('read only');item.saves++;};await api.start(env.Zotero);
 const input=env.definitions.find(c=>c.dataKey==='order').renderCell(0,'03',{},false,env.doc).children[0];assert.ok(input);
 env.win.collection='K57JIGUF';input.value='4';await input.handlers.blur(event());assert.equal(api.display(item.getTags(),'BJED65AU').order,'04');assert.equal(api.display(item.getTags(),'K57JIGUF').order,'');
 fail=true;input.value='5';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'04');assert.equal(input.disabled,false);assert.match(env.alerts[0],/未保存/);await api.stop();
});

test('read and route writes on one paper serialize rather than overwrite each other',async()=>{
 const api=load();let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});let calls=0;
 const item=paper([],async()=>{if(++calls===1){entered();await gate;}});
 const order=api.setOrder(item,'BJED65AU','2');await started;const read=api.setRead(item,true);
 assert.equal(calls,1);release();await Promise.all([order,read]);assert.equal(api.isRead(item),true);assert.equal(api.display(item.getTags(),'BJED65AU').order,'02');
});

test('a custom branch position overrides the automatic text and survives renumbering',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006','阅读顺序-90证明工具-06-核心-ZK']);
 await api.setPosition(item,'BJED65AU','核心 · 标准模型下的构造');
 assert.equal(api.display(item.getTags(),'BJED65AU').position,'核心 · 标准模型下的构造');
 assert.equal(api.display(item.getTags(),'K57JIGUF').position,'核心 · 零知识与证明工具');
 await api.setOrder(item,'BJED65AU','9');assert.equal(api.display(item.getTags(),'BJED65AU').position,'核心 · 标准模型下的构造');
 await api.setPosition(item,'BJED65AU','');assert.equal(api.display(item.getTags(),'BJED65AU').position,'奠基 · 标准模型与完全安全证明');
});

test('position edits work without a number and reject control characters or excessive length',async()=>{
 const api=load(),item=paper(['原有标签']);await api.setPosition(item,'BJED65AU','参考');
 assert.equal(api.display(item.getTags(),'BJED65AU').order,'');assert.equal(api.display(item.getTags(),'BJED65AU').position,'参考');
 for(const value of ['x\ny','x\ty','x'.repeat(121)])await assert.rejects(api.setPosition(item,'BJED65AU',value),/120|单行/);
 await assert.rejects(api.setPosition(item,'UNKNOWN','参考'),/分类/);assert.equal(item.saves,1);
});

test('failed position writes restore the original override and unrelated tags',async()=>{
 const api=load(),original=[{tag:'阅读定位-02访问控制-核心 · 原定位',type:1},{tag:'原有标签',type:0}],item=paper(original,async()=>{throw Error('read only');});
 await assert.rejects(api.setPosition(item,'BJED65AU','参考'),/read only/);
 assert.deepEqual(item.getTags().sort((a,b)=>a.tag.localeCompare(b.tag)),original.sort((a,b)=>a.tag.localeCompare(b.tag)));
});

test('position cells accept direct text and clearing restores the automatic position',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 const input=env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc).children[0];assert.ok(input,'position must be editable');
 input.value='进阶 · 我自己的定位';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'进阶 · 我自己的定位');
 input.value='取消';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'进阶 · 我自己的定位');
 input.value='';await input.handlers.blur(event());assert.equal(input.value,'奠基 · ABE构造主线');await api.stop();
});

test('Chinese composition confirmation and cancellation do not submit or restore the position field',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 const input=env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc).children[0];let prevented=0;
 input.value='核心 · 正在输入';await input.handlers.keydown({...event('Enter'),isComposing:true,preventDefault(){prevented++;}});
 assert.equal(item.saves,0);assert.equal(prevented,0);assert.notEqual(input.disabled,true);
 await input.handlers.keydown({...event('Escape'),isComposing:true});assert.equal(input.value,'核心 · 正在输入');
 await input.handlers.compositionstart(event());await input.handlers.keydown(event('Enter'));assert.equal(item.saves,0);
 await input.handlers.compositionend(event());await input.handlers.keydown({...event('Enter'),keyCode:229});assert.equal(item.saves,0);
 await input.handlers.keydown(event('Enter'));assert.equal(item.saves,1);assert.equal(input.value,'核心 · 正在输入');await api.stop();
});
