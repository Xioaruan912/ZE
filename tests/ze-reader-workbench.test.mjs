import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
import {dom,settle} from './ze-reader-dom.mjs';
const ids=['view-tabs','view-notes','view-matrix','pane-tabs','pane-notes','pane-matrix','ze-message','ze-scope','ze-refresh','ze-query','ze-kind','ze-color','ze-tag','ze-count','ze-records','ze-prev','ze-next','ze-page','ze-tabs','ze-group-list','ze-group-name','ze-save-group','ze-rename-group','ze-delete-group','ze-restore-group','ze-group-reset','ze-rules','ze-add-rule','ze-save-rules','ze-rules-reset','ze-matrix','ze-copy-matrix'];
function setup({selected=true,collect}={}){
 const env=environment(),{doc,nodes}=dom(ids),scope=load(['preferences.js','matrix.js','workbench.js']),store=scope.ZEPreferences.create(env.Zotero);
 let copied='';
 const snapshot={papers:[{id:'1:A',title:'Paper'}],records:Array.from({length:55},(_,i)=>({id:String(i),paperID:'1:A',kind:'annotation',text:'text '+i,comment:'',color:'#ff0000',tags:['方法'],annotationType:'highlight',source:{}})),warnings:[]};
 const adapter={getScopeItems:async()=>selected?[{}]:[],selectTab(){},openSource:async()=>({}),sourceURL:()=> 'zotero://open-pdf/library/items/ABCDEFGH',copyText:text=>{copied=text;}};
 const summary={collect:collect||(async()=>snapshot),filter:(records,{query='',kind='',color='',tag=''})=>records.filter(x=>(!query||x.text.includes(query))&&(!kind||x.kind===kind)&&(!color||x.color===color)&&(!tag||x.tags.includes(tag)))};
 const groups={listTabs:async()=>[{title:'Open paper',tabID:'a'}],listGroups:()=>({groups:[],warning:''})};
 const controller=scope.ZEWorkbench.mount(doc,{owner:{},groups,summary,matrix:scope.ZEMatrix,store,adapter});
 return {nodes,controller,store,copied:()=>copied};
}
test('workspace has separate views, explicit scope, search and 50-record pagination',async()=>{
 const env=setup({selected:false});await env.controller.ready;assert.equal(env.nodes.get('ze-scope').value,'current');
 await env.nodes.get('view-notes').fire('click');assert.equal(env.nodes.get('ze-records').children.length,50);assert.ok(env.nodes.get('ze-count').textContent.includes('1'));
 await env.nodes.get('ze-next').fire('click');assert.equal(env.nodes.get('ze-records').children.length,5);
 env.nodes.get('ze-query').value='text 54';await env.nodes.get('ze-query').fire('input');assert.equal(env.nodes.get('ze-records').children.length,1);
 await env.nodes.get('view-matrix').fire('click');assert.ok(env.nodes.get('ze-matrix').textContent.includes('规则'));
 env.controller.dispose();
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
