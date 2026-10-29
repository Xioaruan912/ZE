import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function loadBridge(){
 const calls=[];
 const Zotero={initializationPromise:Promise.resolve(),Server:{Endpoints:{}},PDFTranslate:{api:{translate:async(text,options)=>{calls.push({text,options});return {status:'success',result:'你好，世界。'}}}}};
 const context=vm.createContext({Zotero});vm.runInContext(fs.readFileSync(new URL('../zotero-bridge/bootstrap.js',import.meta.url),'utf8'),context);await context.startup();
 return {Zotero,calls,context,endpoint:new Zotero.Server.Endpoints['/paper-reader/translate']()};
}
test('bridge forwards only authenticated text to the desktop CNKI API',async()=>{
 const {endpoint,calls}=await loadBridge();
 assert.equal((await endpoint.init({data:{text:'Hello world',token:'wrong'}}))[0],403);
 assert.equal(calls.length,0);
 const result=await endpoint.init({data:{text:'Hello world',token:'__BRIDGE_TOKEN__'}});
 assert.equal(result[0],200);assert.equal(JSON.parse(result[2]).text,'你好，世界。');
 assert.equal(calls[0].options.service,'cnki');assert.equal(calls[0].options.pluginID,'paper-reader-bridge@local.example');
});
test('bridge rejects browser-origin requests and handles an unready translator',async()=>{
 const {endpoint,Zotero,context}=await loadBridge();
 assert.equal((await endpoint.init({headers:{Origin:'https://example.org'},data:{text:'Hello',token:'__BRIDGE_TOKEN__'}}))[0],403);
 Zotero.PDFTranslate=null;
 assert.equal((await endpoint.init({data:{text:'Hello',token:'__BRIDGE_TOKEN__'}}))[0],503);
 context.shutdown();assert.equal(Zotero.Server.Endpoints['/paper-reader/translate'],undefined);
});
