import test from 'node:test';
import assert from 'node:assert/strict';
import {load,environment} from './ze-reader-fixtures.mjs';
async function setup({legacy=false,token='a'.repeat(32),foreign}={}){
 const env=environment(),calls=[],scope=load(['preferences.js','bridge.js']);
 const store=scope.ZEPreferences.create(env.Zotero);store.setToken(token);
 const logs=[];const originalDebug=env.Zotero.debug=(...args)=>logs.push(args);
 env.Zotero.PDFTranslate={api:{translate:async(text,options)=>{calls.push({text,options});return {result:'你好',status:'success'};}}};
 if(foreign)env.Zotero.Server.Endpoints['/paper-reader/translate']=foreign;
 const bridge=scope.ZEBridge.create({Zotero:env.Zotero,store,adapter:{legacyBridgeEnabled:async()=>legacy},pluginID:'reading-route-columns@local.example'});
 await bridge.start();const Type=env.Zotero.Server.Endpoints['/paper-reader/translate'];
 return {...env,store,bridge,calls,logs,originalDebug,endpoint:Type?new Type():null};
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

test('native pre-endpoint debug logs redact full, escaped and ellipsized tokens',async()=>{
 const env=await setup();
 env.Zotero.debug(JSON.stringify({token:'a'.repeat(32),text:'Hello'}),5);
 assert.ok(!env.logs[0][0].includes('a'.repeat(32)));assert.equal(env.logs[0][1],5);
 const escaped='native-"'+String.fromCharCode(92)+'-token-0000000000000000000000';env.store.setToken(escaped);
 env.Zotero.debug(JSON.stringify({token:escaped,text:'Hello'}),5);
 assert.ok(!env.logs[1][0].includes('native-'));assert.ok(env.logs[1][0].includes('Hello'));
 env.store.setToken('z'.repeat(1400));env.Zotero.debug(JSON.stringify({token:'z'.repeat(1400)}).slice(0,1000)+'…',5);
 assert.ok(!env.logs[2][0].includes('z'.repeat(24)));
 env.Zotero.debug('ordinary log',3);assert.equal(env.logs[3][0],'ordinary log');
 env.bridge.stop();assert.equal(env.Zotero.debug,env.originalDebug);
});

test('debug protection respects another plugin wrapper on shutdown',async()=>{
 const env=await setup(),ours=env.Zotero.debug;
 const foreign=function(...args){return ours.apply(this,args);};env.Zotero.debug=foreign;
 env.bridge.stop();assert.equal(env.Zotero.debug,foreign);
 env.Zotero.debug('ordinary log',2);assert.equal(env.logs.at(-1)[0],'ordinary log');
});
