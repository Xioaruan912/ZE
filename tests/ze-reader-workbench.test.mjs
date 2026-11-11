import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
import {dom,settle} from './ze-reader-dom.mjs';
const ids=['view-tabs','view-notes','view-matrix','pane-tabs','pane-notes','pane-matrix','ze-message','ze-scope','ze-refresh','ze-query','ze-kind','ze-color','ze-tag','ze-count','ze-records','ze-prev','ze-next','ze-page','ze-tabs','ze-group-list','ze-group-name','ze-save-group','ze-rename-group','ze-delete-group','ze-restore-group','ze-group-reset','ze-rules','ze-add-rule','ze-save-rules','ze-rules-reset','ze-matrix','ze-copy-matrix'];
function setup({selected=true,collect,noBootstrapGlobals=false}={}){
 const env=environment(),{doc,nodes}=dom(ids),scope=load(['preferences.js','matrix.js','workbench.js'],noBootstrapGlobals?{AbortController:undefined}:{}),store=scope.ZEPreferences.create(env.Zotero);
 doc.defaultView.AbortController=AbortController;
 let copied='',copyCalls=0;
 const snapshot={papers:[{id:'1:A',title:'Paper'}],records:Array.from({length:55},(_,i)=>({id:String(i),paperID:'1:A',kind:'annotation',text:'text '+i,comment:'',color:'#ff0000',tags:['方法'],annotationType:'highlight',source:{}})),warnings:[]};
 const adapter={getScopeItems:async()=>selected?[{}]:[],selectTab(){},openSource:async()=>({}),sourceURL:()=> 'zotero://open-pdf/library/items/ABCDEFGH',copyText:text=>{copied=text;copyCalls++;}};
 const summary={collect:collect||(async()=>snapshot),filter:(records,{query='',kind='',color='',tag=''})=>records.filter(x=>(!query||x.text.includes(query))&&(!kind||x.kind===kind)&&(!color||x.color===color)&&(!tag||x.tags.includes(tag)))};
 const groups={listTabs:async()=>[{title:'Open paper',tabID:'a'}],listGroups:()=>({groups:[],warning:''})};
 const controller=scope.ZEWorkbench.mount(doc,{owner:{},groups,summary,matrix:scope.ZEMatrix,store,adapter});
 return {nodes,controller,store,groups,copied:()=>copied,copyCalls:()=>copyCalls};
}
test('workspace has separate views, explicit scope, search and 50-record pagination',async()=>{
 const env=setup({selected:false});await env.controller.ready;assert.equal(env.nodes.get('ze-scope').value,'current');
 await env.nodes.get('view-notes').fire('click');assert.equal(env.nodes.get('ze-records').children.length,50);assert.ok(env.nodes.get('ze-count').textContent.includes('1'));
 await env.nodes.get('ze-next').fire('click');assert.equal(env.nodes.get('ze-records').children.length,5);
 env.nodes.get('ze-query').value='text 54';await env.nodes.get('ze-query').fire('input');assert.equal(env.nodes.get('ze-records').children.length,1);
 await env.nodes.get('view-matrix').fire('click');assert.ok(env.nodes.get('ze-matrix').textContent.includes('规则'));
 env.controller.dispose();
});

test('workspace uses its document DOM constructors when bootstrap has no DOM globals',async()=>{
 const env=setup({noBootstrapGlobals:true});await env.controller.ready;
 assert.equal(env.nodes.get('ze-count').textContent,'1 个已打开 PDF');
 await env.nodes.get('view-notes').fire('click');assert.equal(env.nodes.get('ze-records').children.length,50);env.controller.dispose();
});
test('late reads after a scope change or disposal never overwrite the current workspace',async()=>{
 const pending=[];const env=setup({collect:()=>new Promise(resolve=>pending.push(resolve))});await env.controller.ready;
 const first=env.nodes.get('view-notes').fire('click');await settle();
 const second=env.nodes.get('ze-refresh').fire('click');await settle();
 pending[1]({papers:[],records:[],warnings:[]});await second;
 pending[0]({papers:[{title:'stale'}],records:[],warnings:[]});await first;
 assert.ok(!env.nodes.get('ze-count').textContent.includes('1 篇'));
 const third=env.nodes.get('ze-refresh').fire('click');await settle();env.controller.dispose();
 const before=env.nodes.get('ze-count').textContent;pending[2]({papers:[{}],records:[],warnings:[]});await third;assert.equal(env.nodes.get('ze-count').textContent,before);
});
test('matrix rules are configured through controls and copying uses only matching annotation content',async()=>{
 const env=setup();await env.controller.ready;await env.nodes.get('view-matrix').fire('click');
 await env.nodes.get('ze-add-rule').fire('click');const row=env.nodes.get('ze-rules').children[0];
 row.children[0].value='方法';row.children[1].value='tag';row.children[2].value='方法';
 await env.nodes.get('ze-save-rules').fire('click');assert.equal(env.store.readDocument('rules').data.rules[0].name,'方法');
 await env.nodes.get('ze-copy-matrix').fire('click');assert.ok(env.copied().includes('text 54'));env.controller.dispose();
});

test('scope changes and failed refreshes cannot export a stale literature matrix',async()=>{
 const sample=label=>({papers:[{id:'1:A',title:label}],records:[{id:'1:X',paperID:'1:A',kind:'annotation',text:label,comment:'',color:'#ff0000',tags:[],source:{}}],warnings:[]});
 let count=0,pending;const env=setup({collect:()=>++count===1?Promise.resolve(sample('Scope A')):new Promise((resolve,reject)=>{pending={resolve,reject};})});
 await env.controller.ready;env.store.writeDocument('rules',{version:1,rules:[{name:'方法',kind:'color',value:'#ff0000'}]});
 await env.nodes.get('view-matrix').fire('click');await env.nodes.get('ze-copy-matrix').fire('click');assert.equal(env.copyCalls(),1);
 env.nodes.get('ze-scope').value='current';const changed=env.nodes.get('ze-scope').fire('change');await settle();
 assert.equal(env.nodes.get('ze-copy-matrix').disabled,true);assert.ok(!env.nodes.get('ze-matrix').textContent.includes('Scope A'));
 await env.nodes.get('ze-copy-matrix').fire('click');assert.equal(env.copyCalls(),1);
 pending.resolve(sample('Scope B'));await changed;await env.nodes.get('ze-copy-matrix').fire('click');assert.ok(env.copied().includes('Scope B'));assert.equal(env.copyCalls(),2);
 const failed=env.nodes.get('ze-refresh').fire('click');await settle();pending.reject(Error('unavailable'));await failed;
 assert.equal(env.nodes.get('ze-copy-matrix').disabled,true);await env.nodes.get('ze-copy-matrix').fire('click');assert.equal(env.copyCalls(),2);env.controller.dispose();
});

test('finishing a group restore after disposal does not write or restart content reads',async()=>{
 const env=setup();await env.controller.ready;let resolve,reads=0;
 env.groups.restoreGroup=()=>new Promise(done=>{resolve=done;});env.groups.listTabs=async()=>{reads++;return [];};
 const operation=env.nodes.get('ze-restore-group').fire('click');await settle();env.controller.dispose();
 const previous=env.nodes.get('ze-count').textContent;resolve({opened:1,reused:0,skipped:[]});await operation;
 assert.equal(env.nodes.get('ze-count').textContent,previous);assert.equal(reads,0);
});
