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
 const win={collection:'BJED65AU',ZoteroPane:{getSelectedCollection:()=>({key:win.collection}),itemsView:view},setInterval(fn){win.tick=fn;return 1;},clearInterval(){},alert:text=>alerts.push(text)};
 const doc={defaultView:win,createElement(){return this.createElementNS();},createElementNS(){return {ownerDocument:doc,style:{},children:[],handlers:{},attributes:{},appendChild(node){this.children.push(node);node.parentNode=this;},setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},addEventListener(k,fn){this.handlers[k]=fn;},removeEventListener(k){delete this.handlers[k];},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}};}};
 const toolbar=doc.createElement();toolbar.id='zotero-items-toolbar';
 doc.getElementById=id=>id===toolbar.id?toolbar:toolbar.children.find(n=>n.id===id)||null;win.document=doc;
 const Zotero={Prefs:{get:()=>2},ItemTreeManager:{registerColumn:o=>{definitions.push(o);return o.dataKey;},unregisterColumn(){}},getMainWindows:()=>[win],getMainWindow:()=>win,logError:e=>errors.push(e)};
 return {definitions,alerts,errors,win,doc,toolbar,Zotero,button:()=>doc.getElementById('ze-reader-edit-routes')};
}
const event=key=>({key,stopPropagation(){},preventDefault(){}});
async function startUI(api,env){await api.start(env.Zotero);await env.button().handlers.click(event());}
function controls(cell){
 const nodes=[];function visit(node){nodes.push(node);for(const child of node.children||[])visit(child);}visit(cell);
 const input=nodes.find(n=>n.type==='text'),button=nodes.find(n=>n.type==='button'),text=nodes.find(n=>n.className==='route-value');
 return {input,button,text,async begin(){await input.handlers.focus?.(event());}};
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
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await startUI(api,env);
 const column=env.definitions.find(c=>c.dataKey==='order');
 const cell=column.renderCell(0,'03',{className:'order-column'},false,env.doc),editor=controls(cell),{input}=editor;assert.ok(input,'order cell must contain an editable input');await editor.begin();
 assert.equal(input.value,'03');input.value='8';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 await editor.begin();input.value='9';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'08');assert.equal(item.saves,1);
 await editor.begin();input.value='6';await input.handlers.blur(event());assert.equal(api.display(item.getTags(),'BJED65AU').order,'06');assert.equal(env.alerts.length,0);await api.stop();
});

test('an editing cell retains its original branch after a collection switch and restores failed input',async()=>{
 let fail=false;const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);
 item.saveTx=async()=>{if(fail)throw Error('read only');item.saves++;};await startUI(api,env);
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
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await startUI(api,env);
 const editor=controls(env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc)),{input}=editor;assert.ok(input,'position must be editable');await editor.begin();
 input.value='进阶 · 我自己的定位';await input.handlers.keydown(event('Enter'));assert.equal(input.value,'进阶 · 我自己的定位');
 await editor.begin();input.value='取消';await input.handlers.keydown(event('Escape'));assert.equal(input.value,'进阶 · 我自己的定位');
 await editor.begin();input.value='';await input.handlers.blur(event());assert.equal(input.value,'奠基 · ABE构造主线');await api.stop();
});

test('Chinese composition confirmation and cancellation do not submit or restore the position field',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await startUI(api,env);
 const editor=controls(env.definitions.find(c=>c.dataKey==='position').renderCell(0,'',{},false,env.doc)),{input}=editor;await editor.begin();let prevented=0;
 input.value='核心 · 正在输入';await input.handlers.keydown({...event('Enter'),isComposing:true,preventDefault(){prevented++;}});
 assert.equal(item.saves,0);assert.equal(prevented,0);assert.notEqual(input.disabled,true);
 await input.handlers.keydown({...event('Escape'),isComposing:true});assert.equal(input.value,'核心 · 正在输入');
 await input.handlers.compositionstart(event());await input.handlers.keydown(event('Enter'));assert.equal(item.saves,0);
 await input.handlers.compositionend(event());await input.handlers.keydown({...event('Enter'),keyCode:229});assert.equal(item.saves,0);
 await input.handlers.keydown(event('Enter'));assert.equal(item.saves,1);assert.equal(input.value,'核心 · 正在输入');await api.stop();
});

test('editable first-column cells provide the native cell-text wrapper and retain live input handlers',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await startUI(api,env);
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
 const api=load(),item=paper(),env=ui(item);await startUI(api,env);
 for(const first of [false,true])for(const name of ['order','position']){
  const cell=env.definitions.find(c=>c.dataKey===name).renderCell(0,'',{},first,env.doc);
  const editor=controls(cell),{input}=editor;let active=null,tableFocuses=0;
  // Zotero 10.0.8 VirtualizedTable focuses the table on both row mousedown and mouseup.
  const mouse=async (target,type)=>{
   let stopped=false,prevented=false;
   await target.handlers[type]?.({stopPropagation(){stopped=true;},preventDefault(){prevented=true;}});
   if(!stopped&&type!=='click'){active='table';tableFocuses++;}
   if(type==='mousedown'&&!prevented)active=target; // Browser default focus action
  };
  input.focus=()=>{active=input;};input.select=()=>{};
  for(const type of ['mousedown','mouseup','click'])await mouse(input,type);await editor.begin();
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

test('one toolbar button edits both route columns without per-cell buttons and Done flushes the focused draft',async()=>{
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006']),env=ui(item);await api.start(env.Zotero);
 const button=env.button();assert.ok(button);assert.equal(button.textContent,'编辑');assert.equal(env.toolbar.children.length,1);
 const render=name=>controls(env.definitions.find(c=>c.dataKey===name).renderCell(0,'',{},false,env.doc));
 for(const name of ['order','position']){
  const {input,button:local,text}=render(name);assert.equal(local,undefined,'cells have no edit buttons');
  assert.equal(input.hidden,true);assert.equal(input.readOnly,true);assert.equal(text.hidden,false);
  assert.equal(text.textContent,api.display(item.getTags(),'BJED65AU')[name]);
  const saves=item.saves;await input.handlers.blur(event());assert.equal(item.saves,saves,'read-only display cannot save');
 }
 await button.handlers.click(event());assert.equal(button.textContent,'完成编辑');assert.equal(button.getAttribute('aria-pressed'),'true');
 for(const name of ['order','position']){
  const editor=render(name),{input,text}=editor;assert.equal(input.hidden,false);assert.equal(input.readOnly,false);assert.equal(text.hidden,true);
  await editor.begin();const original=input.value;input.value='取消';await input.handlers.keydown(event('Escape'));
  assert.equal(input.value,original);assert.equal(input.hidden,false,'Escape cancels a field without leaving global edit mode');
  await editor.begin();input.value=name==='order'?'8':'自定定位';await input.handlers.keydown(event('Enter'));
  assert.equal(input.hidden,false);assert.equal(input.value,name==='order'?'08':'自定定位');
 }
 const editor=render('order');await editor.begin();editor.input.value='9';
 await button.handlers.click(event());assert.equal(item.saves,3);assert.equal(api.display(item.getTags(),'BJED65AU').order,'09');
 assert.equal(button.textContent,'编辑');assert.equal(button.getAttribute('aria-pressed'),'false');
 assert.equal(render('order').input.hidden,true);assert.equal(render('position').input.hidden,true);
 await api.stop();assert.equal(env.toolbar.children.length,0);
});

test('edit mode is per window, resets on collection switches and releases its single toolbar button',async()=>{
 const api=load(),first=ui(paper()),second=ui(paper());first.Zotero.getMainWindows=()=>[first.win,second.win];
 await api.start(first.Zotero);await api.setupWindow(first.win);assert.equal(first.toolbar.children.length,1);
 await first.button().handlers.click(event());assert.equal(first.button().textContent,'完成编辑');assert.equal(second.button().textContent,'编辑');
 first.win.collection='K57JIGUF';await first.win.tick();assert.equal(first.button().textContent,'编辑');
 first.win.collection='UNKNOWN';await first.win.tick();assert.equal(first.button().disabled,true);
 api.releaseWindow(first.win);assert.equal(first.toolbar.children.length,0);assert.equal(second.toolbar.children.length,1);
 await api.setupWindow(first.win);assert.equal(first.toolbar.children.length,1);assert.equal(first.button().disabled,true);
 await api.stop();assert.equal(first.toolbar.children.length,0);assert.equal(second.toolbar.children.length,0);
});

for(const rejects of [false,true])test('Done waits for a blur save already in progress and restores read-only display on '+(rejects?'failure':'success'),async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const api=load(),item=paper(['阅读顺序-02访问控制-03-奠基-KPABE2006'],async()=>{entered();await gate;if(rejects)throw Error('read only');}),env=ui(item);
 await startUI(api,env);
 const editor=controls(env.definitions.find(c=>c.dataKey==='order').renderCell(0,'',{},false,env.doc));await editor.begin();
 editor.input.value='8';const saving=editor.input.handlers.blur(event());await started;
 const closing=env.button().handlers.click(event());await Promise.resolve();await Promise.resolve();
 assert.equal(env.button().disabled,true);assert.equal(env.button().textContent,'完成编辑');
 release();await saving;await closing;
 assert.equal(api.display(item.getTags(),'BJED65AU').order,rejects?'03':'08');assert.equal(env.alerts.length,rejects?1:0);
 assert.equal(env.button().textContent,'编辑');assert.equal(env.button().disabled,false);
 const rendered=controls(env.definitions.find(c=>c.dataKey==='order').renderCell(0,'',{},false,env.doc));assert.equal(rendered.input.hidden,true);
 await api.stop();
});

test('switching collections saves a focused draft to its original branch before leaving global edit mode',async()=>{
 const api=load(),item=paper(),env=ui(item);await startUI(api,env);
 const editor=controls(env.definitions.find(c=>c.dataKey==='order').renderCell(0,'',{},false,env.doc));await editor.begin();editor.input.value='7';
 env.win.collection='K57JIGUF';await env.win.tick();
 assert.equal(api.display(item.getTags(),'BJED65AU').order,'07');assert.equal(api.display(item.getTags(),'K57JIGUF').order,'');
 assert.equal(env.button().textContent,'编辑');await api.stop();
});
