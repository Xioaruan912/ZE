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
