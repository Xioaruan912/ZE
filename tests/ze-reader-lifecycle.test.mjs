import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
test('runtime reload does not duplicate columns and cleans timers without writing items',async()=>{
 const env=environment(),scope=load(['reading-columns.js','runtime.js']);
 const runtime=scope.ZERuntime.create({...env,Services:{},id:'reading-route-columns@local.example',rootURI:'test:/'});
 await runtime.start();await runtime.start();
 assert.equal(env.registered.size,3);assert.equal(env.timers.size,1);
 await runtime.stop();await runtime.stop();
 assert.equal(env.registered.size,0);assert.equal(env.timers.size,0);
 await runtime.start();assert.equal(env.registered.size,3);await runtime.stop();
});
test('a failed column registration is reported and partial registration is removed',async()=>{
 const env=environment();let count=0;const register=env.Zotero.ItemTreeManager.registerColumn;
 env.Zotero.ItemTreeManager.registerColumn=o=>{if(++count===2)throw Error('unavailable');return register(o);};
 const scope=load(['reading-columns.js','runtime.js']),runtime=scope.ZERuntime.create({...env,Services:{},id:'test',rootURI:'test:/'});
 await runtime.start();assert.equal(runtime.status().columns.state,'error');assert.equal(env.registered.size,0);await runtime.stop();
});

test('native enhancements attach once per window and release resources on reload',async()=>{
 const env=environment();env.win.document={};const attached=[],disposed=[];
 const scope=load(['reading-columns.js','runtime.js'],{
 ZEHoverPreview:{attach:({win})=>{attached.push(['preview',win]);return {dispose(){disposed.push('preview');}};}},
 ZETagVisibility:{attach:({win})=>{attached.push(['tags',win]);return {dispose(){disposed.push('tags');}};}}
 });
 const runtime=scope.ZERuntime.create({...env,id:'test'});await runtime.start();await runtime.setupWindow(env.win);
 assert.equal(attached.length,2);runtime.releaseWindow(env.win);assert.deepEqual(disposed.sort(),['preview','tags']);
 await runtime.setupWindow(env.win);assert.equal(attached.length,4);await runtime.stop();assert.equal(disposed.length,4);assert.equal(env.timers.size,0);
});

test('a native enhancement failure does not disable the reading columns or the other enhancement',async()=>{
 const env=environment();env.win.document={};let tags=0;
 const scope=load(['reading-columns.js','runtime.js'],{ZEHoverPreview:{attach(){throw Error('unsupported');}},ZETagVisibility:{attach(){tags++;return {dispose(){}};}}});
 const runtime=scope.ZERuntime.create({...env,id:'test'});await runtime.start();
 assert.equal(env.registered.size,3);assert.equal(tags,1);assert.equal(runtime.status().preview.state,'unavailable');await runtime.stop();
});

test('reader pin hooks start once globally, release window resources and dispose on plugin stop',async()=>{
 const env=environment(),events=[],unwrap=value=>value,cloneInto=value=>value;let received;
 const scope=load(['reading-columns.js','runtime.js'],{ZEPins:{create:options=>{received=options;return {start(){events.push('start');},releaseWindow:win=>events.push(win),dispose(){events.push('dispose');}};}}});
 const runtime=scope.ZERuntime.create({...env,id:'test',unwrap,cloneInto});await runtime.start();await runtime.start();assert.deepEqual(events,['start']);
 assert.equal(received.unwrap,unwrap);assert.equal(received.cloneInto,cloneInto);
 runtime.releaseWindow(env.win);assert.equal(events[1],env.win);await runtime.stop();assert.equal(events.at(-1),'dispose');
});

test('pin initialization failures clean up partial hooks and leave existing columns usable',async()=>{
 const env=environment();let disposed=0;
 const scope=load(['reading-columns.js','runtime.js'],{ZEPins:{create:()=>({start(){throw Error('unavailable');},dispose(){disposed++;}})}});
 const runtime=scope.ZERuntime.create({...env,id:'test'});await runtime.start();assert.equal(disposed,1);assert.equal(env.registered.size,3);assert.equal(runtime.status().pins.state,'unavailable');await runtime.stop();
});
