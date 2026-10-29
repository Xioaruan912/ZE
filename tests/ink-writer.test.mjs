import test from 'node:test';import assert from 'node:assert/strict';
import {createAnnotationWriter} from '../static/annotation-writer.mjs';
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
test('active Pencil stroke is persisted but background retries wait for pen-up',async()=>{
 const store=storage(),sent=[],s={key:'ABCDEFGH',page:1,text:'',type:'ink',drawing:true,position:{pageIndex:0,width:1,paths:[[1,2]]}};
 const writer=createAnnotationWriter({storage:store,create:async p=>{sent.push(p);return {id:'p:1'}},update:async()=>{}});
 writer.stage(s,{type:'ink',comment:'',color:'#000000'});assert.equal(writer.drafts('ABCDEFGH').length,1);await writer.retry();assert.equal(sent.length,0);
 s.drawing=false;s.position={pageIndex:0,width:1,paths:[[1,2,3,4]]};await writer.save(s,{type:'ink',comment:'',color:'#000000'});assert.equal(sent.length,1);assert.deepEqual(sent[0].position.paths,[[1,2,3,4]]);
});
test('after reload an interrupted stroke recovers after its short drawing lease expires',async t=>{
 const store=storage(),s={key:'ABCDEFGH',page:1,text:'',type:'ink',drawing:true,position:{pageIndex:0,width:1,paths:[[1,2,3,4]]}};
 createAnnotationWriter({storage:store}).stage(s,{type:'ink',comment:'',color:'#000000'});
 const now=Date.now;t.mock.method(Date,'now',()=>now()+6000);let sent;await createAnnotationWriter({storage:store,create:async p=>{sent=p;return {id:'p:1'}}}).retry();assert.deepEqual(sent.position.paths,[[1,2,3,4]]);
});
test('another browser tab cannot submit a half-drawn stroke',async()=>{
 const store=storage(),s={key:'ABCDEFGH',page:1,text:'',type:'ink',drawing:true,position:{pageIndex:0,width:1,paths:[[1,2]]}};
 createAnnotationWriter({storage:store}).stage(s,{type:'ink',comment:'',color:'#000000'});let creates=0;
 await createAnnotationWriter({storage:store,create:async()=>{creates++;return {id:'p:1'}}}).retry();assert.equal(creates,0);
});
