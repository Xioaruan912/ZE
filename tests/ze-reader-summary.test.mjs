import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './ze-reader-fixtures.mjs';
function setup(){
 const items=new Map();
 function item(id,key,type,parentID=null,extra={}){const x={id,key,libraryID:1,parentID,deleted:false,isRegularItem:()=>type==='paper',isAttachment:()=>type==='pdf',isNote:()=>type==='note',isAnnotation:()=>type==='annotation',attachmentContentType:type==='pdf'?'application/pdf':'',getDisplayTitle:()=>key,getTags:()=>[],...extra};items.set(id,x);return x;}
 const paper=item(1,'PAPER001','paper'),pdf=item(2,'PDFKEY01','pdf',1),note=item(3,'NOTEKEY1','note',1,{getNote:()=>'<p>Method</p>'}),ann=item(4,'ANNKEY01','annotation',2,{annotationText:'Pairings',annotationComment:'four',annotationColor:'#ff0000',annotationPageLabel:'iv',annotationType:'highlight',annotationPosition:'{"pageIndex":3}',getTags:()=>[{tag:'方法'}]});
 let scopeItems=[pdf,note,paper];
 const adapter={getScopeItems:async()=>scopeItems,getItem:async id=>items.get(id),getChildren:async x=>[...items.values()].filter(y=>y.parentID===x.id&&!y.deleted)};
 const summary=load(['summary.js']).ZESummary.create({adapter,htmlToText:html=>html.replace(/<[^>]+>/g,'')});
 return {items,item,paper,pdf,note,ann,adapter,summary,setScope:x=>{scopeItems=x;}};
}
test('selected children normalize to one root and preserve actual source annotation positions',async()=>{
 const env=setup(),snapshot=await env.summary.collect({},'selected',{});
 assert.equal(snapshot.papers.length,1);assert.equal(snapshot.records.length,2);
 const annotation=snapshot.records.find(x=>x.kind==='annotation');
 assert.equal(annotation.source.attachmentKey,'PDFKEY01');assert.equal(annotation.source.annotationKey,'ANNKEY01');assert.equal(annotation.source.pageIndex,3);assert.equal(annotation.pageLabel,'iv');
 assert.equal(snapshot.records.find(x=>x.kind==='note').text,'Method');
});
test('standalone items, multiple PDFs and same keys in different libraries stay distinct',async()=>{
 const env=setup();
 const pdf2=env.item(5,'PDFKEY02','pdf',1),ann2=env.item(6,'ANNKEY02','annotation',5,{annotationType:'ink',annotationComment:'drawing',annotationPosition:'broken'});
 const independent=env.item(7,'PAPER001','pdf',null,{libraryID:2});
 const standalone=env.item(8,'NOTEKEY2','note',null,{getNote:()=>'<p>Standalone</p>'});
 env.item(9,'DELETED1','note',1,{deleted:true,getNote:()=>{throw Error('deleted must not be read');}});
 env.setScope([env.paper,independent,standalone]);
 const result=await env.summary.collect({},'current',{});
 assert.equal(result.papers.length,3);assert.equal(result.records.length,4);
 assert.notEqual(result.papers[0].id,result.papers[1].id);
 const ink=result.records.find(x=>x.annotationType==='ink');assert.equal(ink.source.pageIndex,undefined);assert.equal(ink.text,'');assert.equal(ink.comment,'drawing');
});
test('filters intersect exact tags, type and color with case-insensitive ordinary text search',async()=>{
 const env=setup(),result=await env.summary.collect({},'selected',{});
 assert.equal(env.summary.filter(result.records,{query:'FOUR',kind:'annotation',tag:'方法',color:'#FF0000'}).length,1);
 assert.equal(env.summary.filter(result.records,{query:'four',tag:'方'}).length,0);
 assert.equal(env.summary.filter(result.records,{query:'Method',kind:'note'}).length,1);
});
test('cancellation and parent cycles terminate without publishing partial snapshots',async()=>{
 const env=setup(),controller=new AbortController();controller.abort();
 await assert.rejects(env.summary.collect({},'selected',{signal:controller.signal}),e=>e.name==='AbortError');
 env.paper.parentID=env.pdf.id;
 const result=await env.summary.collect({},'selected',{});assert.equal(result.papers.length,0);assert.ok(result.warnings.length);
});
test('progress is emitted in batches and a late async read respects cancellation',async()=>{
 const env=setup();for(let n=10;n<65;n++)env.item(n,'N'+String(n).padStart(7,'0'),'note',1,{getNote:()=>'<p>x</p>'});
 const progress=[];await env.summary.collect({},'selected',{onProgress:x=>progress.push(x)});
 assert.ok(progress.some(x=>x.records>=50));
 const controller=new AbortController(),get=env.adapter.getChildren;
 env.adapter.getChildren=async item=>{const result=await get(item);controller.abort();return result;};
 await assert.rejects(env.summary.collect({},'selected',{signal:controller.signal}),e=>e.name==='AbortError');
});

test('large summaries yield through the platform adapter without bootstrap timer globals',async()=>{
 const env=setup();let yields=0;env.adapter.yield=async()=>{yields++;};
 for(let n=10;n<65;n++)env.item(n,'N'+String(n).padStart(7,'0'),'note',1,{getNote:()=>'<p>x</p>'});
 const summary=load(['summary.js'],{setTimeout:undefined}).ZESummary.create({adapter:env.adapter,htmlToText:x=>x});
 const result=await summary.collect({},'selected',{});assert.equal(result.records.length,57);assert.ok(yields>0);
});
