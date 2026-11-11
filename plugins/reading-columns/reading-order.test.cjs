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
function controls(cell){
 const nodes=[];function visit(node){nodes.push(node);for(const child of node.children||[])visit(child);}visit(cell);
 const input=nodes.find(n=>n.type==='text'),button=nodes.find(n=>n.type==='button'),text=nodes.find(n=>n.className==='route-value');
 return {input,button,text,async begin(){await button.handlers.click(event());}};
}

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
 const cell=column.renderCell(0,'03',{className:'order-column'},false,env.doc),editor=controls(cell),{input}=editor;assert.ok(input,'order cell must contain an editable input');await editor.begin();
 assert.equal(input.value,'03');input.value='8';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 await editor.begin();input.value='9';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 await editor.begin();input.value='6';await input.handlers.blur(event());assert.equal(api.display(item.getTags(),'BJED65AU').order,'06');assert.equal(env.alerts.length,0);await api.stop();
});

test('an editing cell retains its original branch after a collection switch and restores failed input',async()=>{
 let fail=false;const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);
 item.saveTx=async()=>{if(fail)throw Error('read only');item.saves++;};await api.start(env.Zotero);
 const editor=controls(env.definitions.find(c=>c.dataKey==='order').renderCell(0,'03',{},false,env.doc)),{input}=editor;assert.ok(input);await editor.begin();
 env.win.collection='K57JIGUF';input.value='4';await input.handlers.blur(event());assert.equal(api.display(item.getTags(),'BJED65AU').order,'04');assert.equal(api.display(item.getTags(),'K57JIGUF').order,'');
 fail=true;await editor.begin();input.value='5';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'04');assert.equal(input.disabled,false);assert.match(env.alerts[0],/未保存/);await api.stop();
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
 const editor=controls(env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc)),{input}=editor;assert.ok(input,'position must be editable');await editor.begin();
 input.value='进阶 · 我自己的定位';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'进阶 · 我自己的定位');
 await editor.begin();input.value='取消';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'进阶 · 我自己的定位');
 await editor.begin();input.value='';await input.handlers.blur(event());assert.equal(input.value,'奠基 · ABE构造主线');await api.stop();
});

test('Chinese composition confirmation and cancellation do not submit or restore the position field',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 const editor=controls(env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc)),{input}=editor;await editor.begin();let prevented=0;
 input.value='核心 · 正在输入';await input.handlers.keydown({...event('Enter'),isComposing:true,preventDefault(){prevented++;}});
 assert.equal(item.saves,0);assert.equal(prevented,0);assert.notEqual(input.disabled,true);
 await input.handlers.keydown({...event('Escape'),isComposing:true});assert.equal(input.value,'核心 · 正在输入');
 await input.handlers.compositionstart(event());await input.handlers.keydown(event('Enter'));assert.equal(item.saves,0);
 await input.handlers.compositionend(event());await input.handlers.keydown({...event('Enter'),keyCode:229});assert.equal(item.saves,0);
 await input.handlers.keydown(event('Enter'));assert.equal(item.saves,1);assert.equal(input.value,'核心 · 正在输入');await api.stop();
});

test('editable first-column cells provide the native cell-text wrapper and retain live input handlers',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 for(const name of ['order','position']){
  const cell=env.definitions.find(c=>c.dataKey===name).renderCell(0,'',{},true,env.doc);
  const content=cell.children.find(node=>(node.className||'').split(' ').includes('cell-text'));
  assert.ok(content,'native first-column processing reparses innerHTML unless cell-text already exists');
  const editor=controls(content),{input}=editor;assert.ok(input.handlers.keydown);assert.ok(input.value);await editor.begin();
  input.value=name==='order'?'4':'核心 · 手动定位';await input.handlers.keydown(event('Enter'));
 }
 assert.equal(api.display(item.getTags(),'BJED65AU').order,'04');assert.equal(api.display(item.getTags(),'BJED65AU').position,'核心 · 手动定位');await api.stop();
});

test('an unnumbered paper prompts for a manual position rather than claiming automatic positioning',async()=>{
 const api=load(),env=ui(paper());await api.start(env.Zotero);
 const {input}=controls(env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc));
 assert.equal(input.value,'');assert.equal(input.placeholder,'填写定位');await api.stop();
});

test('a complete mouse click keeps text fields focused so typing and Enter reach the editor',async()=>{
 const api=load(),item=paper(),env=ui(item);await api.start(env.Zotero);
 for(const first of [false,true])for(const name of ['order','position']){
  const cell=env.definitions.find(c=>c.dataKey===name).renderCell(0,'',{},first,env.doc);
  const editor=controls(cell),{input,button}=editor;let active=null,tableFocuses=0;
  // Zotero 10.0.8 VirtualizedTable focuses the table on both row mousedown and mouseup.
  const mouse=async (target,type)=>{
   let stopped=false,prevented=false;
   await target.handlers[type]?.({stopPropagation(){stopped=true;},preventDefault(){prevented=true;}});
   if(!stopped&&type!=='click'){active='table';tableFocuses++;}
   if(type==='mousedown'&&!prevented)active=target; // Browser default focus action
  };
  input.focus=()=>{active=input;};input.select=()=>{};
  for(const target of [button,input])for(const type of ['mousedown','mouseup','click'])await mouse(target,type);
  assert.equal(active,input,'row mouseup must not steal input focus');assert.equal(tableFocuses,0);
  input.value='';
  const draft=name==='order'?'13':'我的定位';
  for(const key of draft){
   let prevented=false;await active.handlers.keydown({...event(key),preventDefault(){prevented=true;}});
   if(!prevented)active.value+=key;
  }
  await active.handlers.keydown(event('Enter'));
  assert.equal(api.display(item.getTags(),'BJED65AU')[name],draft);
 }
 await api.stop();
});

test('route cells display read-only text until Edit, then save or cancel back to text',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 for(const name of ['order','position']){
  const editor=controls(env.definitions.find(c=>c.dataKey===name).renderCell(0,'',{},false,env.doc)),{input,button,text}=editor;
  assert.ok(button,'each editable cell needs an explicit edit button');assert.equal(button.textContent,'编辑');
  assert.equal(input.hidden,true);assert.equal(input.readOnly,true);assert.equal(text.hidden,false);assert.equal(button.hidden,false);
  const original=api.display(item.getTags(),'BJED65AU')[name];assert.equal(text.textContent,original);
  const saves=item.saves;await input.handlers.blur(event());assert.equal(item.saves,saves,'read-only display cannot save');
  let focuses=0;input.focus=()=>focuses++;await editor.begin();
  assert.equal(focuses,1);assert.equal(input.hidden,false);assert.equal(input.readOnly,false);assert.equal(text.hidden,true);assert.equal(button.hidden,true);
  input.value='取消';await input.handlers.keydown(event('Escape'));await input.handlers.blur(event());
  assert.equal(input.hidden,true);assert.equal(input.readOnly,true);assert.equal(text.textContent,original);assert.equal(button.hidden,false);
  await editor.begin();input.value=name==='order'?'8':'自定定位';await input.handlers.keydown(event('Enter'));
  assert.equal(input.hidden,true);assert.equal(text.hidden,false);assert.equal(text.textContent,name==='order'?'08':'自定定位');
  await editor.begin();await input.handlers.blur(event());assert.equal(input.hidden,true,'unchanged blur also exits editing');
 }
 assert.equal(item.saves,2);await api.stop();
});
