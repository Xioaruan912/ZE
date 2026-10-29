import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnnotationWriter} from '../static/annotation-writer.mjs';

test('rapid edits to a new highlight create once then update the returned ID',async()=>{
 const calls=[];const writer=createAnnotationWriter({create:async payload=>{calls.push(['create',payload.comment]);return {id:'p:123'}},update:async payload=>calls.push(['update',payload.id,payload.comment])});
 const session={key:'ABCDEFGH',page:1,text:'paper',position:{pageIndex:0,rects:[[1,2,3,4]]},target:null};
 const first=writer.save(session,{comment:'first',color:'#ffd400'}),second=writer.save(session,{comment:'second',color:'#ff6666'});
 await Promise.all([first,second]);assert.deepEqual(calls,[['create','first'],['update','p:123','second']]);assert.equal(session.target.comment,'second');
});
test('saving a prior card preserves that paper and does not mix the next selection',async()=>{
 const saved=[];const writer=createAnnotationWriter({create:async payload=>{saved.push(payload);return {id:'p:'+saved.length}},update:async()=>{}});
 const old={key:'ABCDEFGH',page:2,text:'old',position:{pageIndex:1,rects:[[1,2,3,4]]},target:null};
 const promise=writer.save(old,{comment:'old note',color:'#ffd400'});
 const next={key:'12345678',page:7,text:'new',position:{pageIndex:6,rects:[[5,6,7,8]]},target:null};
 await writer.save(next,{comment:'new note',color:'#ff6666'});await promise;
 assert.equal(saved[0].key,'ABCDEFGH');assert.equal(saved[0].comment,'old note');assert.equal(saved[1].key,'12345678');
});
test('failed save rejects while keeping subsequent retries usable',async()=>{
 let fail=true;const writer=createAnnotationWriter({create:async()=>{if(fail)throw Error('offline');return {id:'p:1'}},update:async()=>{}});
 const session={key:'ABCDEFGH',page:1,text:'paper',position:{},target:null};
 await assert.rejects(writer.save(session,{comment:'draft',color:'#ffd400'}));assert.equal(session.target,null);
 fail=false;await writer.save(session,{comment:'draft',color:'#ffd400'});assert.equal(session.target.comment,'draft');
});
