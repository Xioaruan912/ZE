import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {environment,plugin} from './ze-reader-fixtures.mjs';
import {fileURLToPath} from 'node:url';
test('delivered lightweight XPI registers only reading columns without workspace or translation resources',async()=>{
 const archive=fileURLToPath(new URL('ze-reader.xpi',plugin));
 const files=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))",archive],{encoding:'utf8'}));
 assert.deepEqual(Object.keys(files).sort(),['bootstrap.js','manifest.json','reading-columns.js','runtime.js']);
 const env=environment(),rootURI='jar:file:///fixture.xpi!/',loads=[],forbidden=[];
 for(const name of ['Server','PreferencePanes'])Object.defineProperty(env.Zotero,name,{get(){forbidden.push(name);throw Error('removed feature accessed');}});
 const Services={scriptloader:{loadSubScript(uri,target){
  assert.ok(uri.startsWith(rootURI));const name=uri.slice(rootURI.length);assert.ok(Object.hasOwn(files,name));loads.push(name);
  vm.runInContext(files[name],vm.isContext(target)?target:vm.createContext(target),{filename:name});
 }}};
 const context=vm.createContext({Zotero:env.Zotero,Services});
 vm.runInContext(files['bootstrap.js'],context);await context.startup({rootURI,id:'reading-route-columns@local.example'});
 assert.equal(env.registered.size,3);assert.equal(env.timers.size,1);assert.deepEqual(forbidden,[]);
 assert.deepEqual(loads,['reading-columns.js','runtime.js']);assert.equal(env.Zotero.ZEReader,undefined);
 context.onMainWindowUnload({window:env.win});assert.equal(env.timers.size,0);
 context.onMainWindowLoad({window:env.win});assert.equal(env.timers.size,1);
 await context.shutdown();assert.equal(env.registered.size,0);assert.equal(env.timers.size,0);assert.equal(env.Zotero.ReadingRouteColumns,undefined);
});
