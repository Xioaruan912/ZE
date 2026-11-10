import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
import {dom} from './ze-reader-dom.mjs';
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
test('workspace menu, preferences and chrome resources cleanly reload without closing native PDFs',async()=>{
 const env=environment(),{doc,nodes}=dom(['menu_ToolsPopup']);env.win.document=doc;doc.createXULElement=tag=>doc.createElementNS('',tag);
 let resources=0;const prefs=new Set(),workspace={closed:false,focus(){},close(){this.closed=true;}};
 env.Zotero.PreferencePanes={register:async o=>{prefs.add(o.id);return o.id;},unregister:id=>prefs.delete(id)};
 const scope=load(['reading-columns.js','runtime.js'],{
 ZEPreferences:{create:()=>({})},ZEAdapter:{create:()=>({registerResources(){resources++;return()=>{resources--;};}})},
 ZEWorkbench:{open:()=>workspace}
 });
 const runtime=scope.ZERuntime.create({...env,Services:{},id:'test',rootURI:'test:/'});
 await runtime.start();await runtime.setupWindow(env.win);await runtime.setupWindow(env.win);
 assert.equal(nodes.get('menu_ToolsPopup').children.length,1);assert.equal(prefs.size,1);assert.equal(resources,1);
 runtime.openWorkbench(env.win);await runtime.stop();
 assert.equal(workspace.closed,true);assert.equal(prefs.size,0);assert.equal(resources,0);assert.equal(env.timers.size,0);
});
