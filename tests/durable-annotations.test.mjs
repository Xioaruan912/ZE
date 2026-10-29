import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnnotationWriter} from '../static/annotation-writer.mjs';
const storage=()=>{const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
const session=()=>({key:'ABCDEFGH',page:2,text:'repeat passage',position:{pageIndex:1,rects:[[20,30,80,40]]},target:null});
test('typed draft survives reload before any network request',async()=>{
 const disk=storage(),s=session();const first=createAnnotationWriter({storage:disk,create:async()=>{throw Error('offline')},update:async()=>{}});
 first.stage(s,{comment:'important unsent note',color:'#ff6666',type:'underline'});
 const calls=[];const reopened=createAnnotationWriter({storage:disk,create:async p=>{calls.push(p);return {id:'p:123'}},update:async()=>{}});
 assert.equal(reopened.drafts('ABCDEFGH')[0].comment,'important unsent note');
 await reopened.retry();assert.equal(calls[0].type,'underline');assert.deepEqual(calls[0].position,{pageIndex:1,rects:[[20,30,80,40]]});assert.equal(reopened.drafts().length,0);
});
test('lost create response retries with same idempotency token',async()=>{
 const disk=storage(),tokens=[];let fail=true;const create=async p=>{tokens.push(p.client_id);if(fail)throw Error('lost response');return {id:'p:123'}};
 const writer=createAnnotationWriter({storage:disk,create,update:async()=>{}});
 await assert.rejects(writer.save(session(),{comment:'note',color:'#ffd400'}));
 fail=false;await createAnnotationWriter({storage:disk,create,update:async()=>{}}).retry();
 assert.equal(tokens.length,2);assert.ok(tokens[0]);assert.equal(tokens[0],tokens[1]);
});
test('old acknowledgement preserves newer staged text',async()=>{
 const disk=storage(),s=session();let release;const writer=createAnnotationWriter({storage:disk,create:()=>new Promise(r=>release=r),update:async()=>{}});
 const saving=writer.save(s,{comment:'first',color:'#ffd400'});await new Promise(r=>setTimeout(r,0));
 writer.stage(s,{comment:'newer typing',color:'#ff6666'});release({id:'p:123'});await saving;
 const draft=writer.drafts()[0];assert.equal(draft.comment,'newer typing');assert.equal(draft.id,'p:123');
 await writer.retry();assert.equal(writer.drafts().length,0);
});
test('offline deletion survives reload and retries without recreating mark',async()=>{
 const disk=storage(),s={...session(),target:{id:'z:12345678'}};
 const writer=createAnnotationWriter({storage:disk,create:async()=>{throw Error('must not create')},update:async()=>{},remove:async()=>{throw Error('offline')}});
 await assert.rejects(writer.remove(s));assert.equal(writer.drafts()[0].deleted,true);
 const removed=[];await createAnnotationWriter({storage:disk,create:async()=>{throw Error('must not create')},update:async()=>{},remove:async p=>removed.push(p)}).retry();
 assert.equal(removed[0].id,'z:12345678');assert.equal(writer.drafts().length,0);
});
test('a newer edit after a lost create response is sent to the recovered annotation',async()=>{
 const disk=storage(),s=session();let fail=true;const changes=[];const create=async()=>{if(fail)throw Error('lost response');return {id:'p:123'}};
 const writer=createAnnotationWriter({storage:disk,create,update:async p=>changes.push(p.comment)});
 await assert.rejects(writer.save(s,{comment:'first',color:'#ffd400'}));writer.stage(s,{comment:'new typing',color:'#ffd400'});
 fail=false;await createAnnotationWriter({storage:disk,create,update:async p=>changes.push(p.comment)}).retry();
 assert.deepEqual(changes,['new typing']);
});
test('tags, baseline and old PDF revision survive a browser restart',async()=>{
 const disk=storage(),s={...session(),base:{comment:'original',version:2},pdfRevision:'old-revision'};
 const writer=createAnnotationWriter({storage:disk,create:async()=>{throw Error('offline')},update:async()=>{}});
 writer.stage(s,{comment:'web note',color:'#ffd400',tags:['疑问']});
 const calls=[];const reopened=createAnnotationWriter({storage:disk,create:async p=>{calls.push(p);return {id:'p:1'}},update:async()=>{}});
 assert.equal(reopened.drafts()[0].pdfRevision,'old-revision');await reopened.retry();assert.deepEqual(calls[0].tags,['疑问']);assert.equal(calls[0].base.version,2);
});
test('explicit position review rebinds the durable draft and reviews its server target',async()=>{
 const disk=storage(),s={...session(),pdfRevision:'old'},calls=[];
 const writer=createAnnotationWriter({storage:disk,create:async()=>({id:'p:1'}),update:async()=>{},review:async p=>calls.push(p)});
 writer.stage(s,{comment:'draft',color:'#ffd400'});writer.reviewPdf(s.draftId,'new');await writer.retry();
 assert.deepEqual(calls,[{key:'ABCDEFGH',id:'p:1',revision:'new'}]);assert.equal(writer.drafts().length,0);
});
test('reopening the same saved annotation keeps this browser edit identity',async()=>{
 const disk=storage(),tokens=[];
 const make=()=>createAnnotationWriter({storage:disk,create:async()=>{},update:async p=>tokens.push(p.edit_token)});
 await make().save({...session(),target:{id:'z:12345678'}},{comment:'one',color:'#ffd400'});
 await make().save({...session(),target:{id:'z:12345678'}},{comment:'two',color:'#ffd400'});
 assert.ok(tokens[0]);assert.equal(tokens[0],tokens[1]);
});
