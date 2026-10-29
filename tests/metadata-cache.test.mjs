import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetadataCache} from '../static/metadata-cache.mjs';

function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size}}}
test('library metadata persists between page sessions without another request',async()=>{
 const store=storage();let calls=0;const fetcher=async()=>({items:[{key:String(++calls)}]});
 await createMetadataCache({storage:store,fetcher}).get('/api/items');
 const cached=await createMetadataCache({storage:store,fetcher}).get('/api/items');
 assert.equal(calls,1);assert.equal(cached.cached,true);assert.equal(cached.data.items[0].key,'1');
});
test('PDF, annotations, progress and attachment lookup are always fetched fresh',async()=>{
 const store=storage();let calls=0;const cache=createMetadataCache({storage:store,fetcher:async()=>++calls});
 for(const url of ['/api/pdf?key=ABCDEFGH','/api/annotations?key=ABCDEFGH','/api/progress?key=ABCDEFGH','/api/children?key=ABCDEFGH']){await cache.get(url);await cache.get(url)}
 assert.equal(calls,8);assert.equal(store.length,0);
});
test('parallel metadata requests coalesce, refresh invalidates saved data',async()=>{
 let calls=0;const cache=createMetadataCache({storage:storage(),fetcher:async()=>({count:++calls})});
 await Promise.all([cache.get('/api/collections'),cache.get('/api/collections')]);assert.equal(calls,1);
 cache.clear();await cache.get('/api/collections',{force:true});assert.equal(calls,2);
});
test('expired metadata can be shown if refresh fails, but is labelled stale',async()=>{
 let now=0;const store=storage();let fail=false;const cache=createMetadataCache({storage:store,now:()=>now,ttl:100,fetcher:async()=>{if(fail)throw Error('offline');return {steps:[]}}});
 await cache.get('/api/reading-plan');now=200;fail=true;
 const result=await cache.get('/api/reading-plan');assert.equal(result.stale,true);assert.equal(result.cached,true);
});
test('browser storage failures do not prevent loading or reading',async()=>{
 const cache=createMetadataCache({storage:{getItem(){throw Error()},setItem(){throw Error()}},fetcher:async()=>({collections:[]})});
 assert.deepEqual((await cache.get('/api/collections')).data,{collections:[]});
 assert.equal((await cache.get('/api/collections')).cached,true);
});
