import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {environment,plugin} from './ze-reader-fixtures.mjs';
import {dom} from './ze-reader-dom.mjs';
import {fileURLToPath} from 'node:url';
test('actual delivered XPI boots, registers the workspace and cleans up without external file loads',async()=>{
 const archive=fileURLToPath(new URL('ze-reader.xpi',plugin));
 const files=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode('utf-8') for n in z.namelist()}))",archive],{encoding:'utf8'}));
 const env=environment(),{doc}=dom(['menu_ToolsPopup']);doc.createXULElement=tag=>doc.createElementNS('',tag);env.win.document=doc;
 const panes=new Set();env.Zotero.PreferencePanes={register:async o=>{panes.add(o.id);return o.id;},unregister:id=>panes.delete(id)};
 const rootURI='jar:file:///fixture.xpi!/',loads=[];
 const Services={io:{newURI:uri=>uri},scriptloader:{loadSubScript(uri,target){
  assert.ok(uri.startsWith(rootURI));const name=uri.slice(rootURI.length);assert.ok(Object.hasOwn(files,name));loads.push(name);
  vm.runInContext(files[name],vm.isContext(target)?target:vm.createContext(target),{filename:name});
 }}};
 const context=vm.createContext({Zotero:env.Zotero,Services,ChromeUtils:{importESModule:()=>({AddonManager:{getAddonByID:async()=>null}})},Cc:{'@mozilla.org/addons/addon-manager-startup;1':{getService:()=>({registerChrome:()=>({destruct(){}})})}},Ci:{amIAddonManagerStartup:{}}});
 vm.runInContext(files['bootstrap.js'],context);await context.startup({rootURI,id:'reading-route-columns@local.example'});
 assert.equal(env.registered.size,3);assert.equal(env.Zotero.ZEReader.status().workspace.state,'ready');assert.equal(panes.size,1);
 assert.ok(loads.includes('reading-columns.js'));assert.ok(env.Zotero.Server.Endpoints['/paper-reader/translate']);
 await context.shutdown();assert.equal(env.registered.size,0);assert.equal(panes.size,0);assert.equal(env.timers.size,0);assert.equal(env.Zotero.ZEReader,undefined);
});
