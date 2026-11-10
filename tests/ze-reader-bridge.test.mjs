import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
async function setup({legacy=false,token='a'.repeat(32),foreign}={}){
 const env=environment(),calls=[],scope=load(['preferences.js','bridge.js']);
 const store=scope.ZEPreferences.create(env.Zotero);store.setToken(token);
 env.Zotero.PDFTranslate={api:{translate:async(text,options)=>{calls.push({text,options});return {result:'你好',status:'success'};}}};
 if(foreign)env.Zotero.Server.Endpoints['/paper-reader/translate']=foreign;
 const bridge=scope.ZEBridge.create({Zotero:env.Zotero,store,adapter:{legacyBridgeEnabled:async()=>legacy},pluginID:'reading-route-columns@local.example'});
 await bridge.start();const Type=env.Zotero.Server.Endpoints['/paper-reader/translate'];
 return {...env,store,bridge,calls,endpoint:Type?new Type():null};
}
test('authenticated translation keeps the reader protocol and reads changed tokens immediately',async()=>{
 const {endpoint,store,calls}=await setup();
 const result=await endpoint.init({data:{token:'a'.repeat(32),text:'Hello'}});
 assert.equal(result[0],200);assert.equal(JSON.parse(result[2]).text,'你好');
 assert.equal(calls[0].options.pluginID,'reading-route-columns@local.example');
 store.setToken('b'.repeat(32));
 assert.equal((await endpoint.init({data:{token:'a'.repeat(32),text:'Hello'}}))[0],403);
 assert.equal((await endpoint.init({data:{token:'b'.repeat(32),text:'Hello'}}))[0],200);
});
test('origin, malformed data and length boundaries are rejected before translation',async()=>{
 const {endpoint,calls}=await setup(),token='a'.repeat(32);
 for(const [request,want] of [
 [{headers:{oRiGiN:''},data:{token,text:'Hi'}},403],
 [{data:'{'},400],[{data:{token:'wrong',text:'Hi'}},403],
 ...[null,42,'','   ','x'.repeat(801)].map(text=>[{data:{token,text}},400])
 ])assert.equal((await endpoint.init(request))[0],want);
 assert.equal(calls.length,0);
 assert.equal((await endpoint.init({data:{token,text:'x'.repeat(800)}}))[0],200);
});
test('unconfigured token, unready plugin and upstream errors remain distinguishable without leaking secrets',async()=>{
 const env=await setup({token:''});
 assert.equal((await env.endpoint.init({data:{text:'Hi'}}))[0],503);
 env.store.setToken('a'.repeat(32));env.Zotero.PDFTranslate=null;
 assert.equal((await env.endpoint.init({data:{token:'a'.repeat(32),text:'Hi'}}))[0],503);
 env.Zotero.PDFTranslate={api:{translate:async()=>{throw Error('private '+'a'.repeat(32));}}};
 const result=await env.endpoint.init({data:{token:'a'.repeat(32),text:'Hi'}});
 assert.equal(result[0],502);assert.ok(!result[2].includes('a'.repeat(32)));
});
test('legacy enabled before endpoint exists prevents takeover, and shutdown respects foreign ownership',async()=>{
 const legacy=await setup({legacy:true});assert.equal(legacy.bridge.status().state,'conflict');assert.equal(legacy.endpoint,null);
 const env=await setup();function foreign(){}env.Zotero.Server.Endpoints['/paper-reader/translate']=foreign;
 env.bridge.stop();assert.equal(env.Zotero.Server.Endpoints['/paper-reader/translate'],foreign);
 const clean=await setup();clean.bridge.stop();assert.equal(clean.Zotero.Server.Endpoints['/paper-reader/translate'],undefined);
});
test('network self-test only sends its visible fixed sentence when explicitly called',async()=>{
 const env=await setup();assert.equal(env.calls.length,0);
 assert.equal(await env.bridge.testTranslation(),'你好');assert.equal(env.calls[0].text,'Hello world.');
});
