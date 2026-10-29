import test from 'node:test';
import assert from 'node:assert/strict';
import {fitScale,readingAnchor,anchorScroll,planResume,filterAnnotations,mergeDrafts,createMarkTool} from '../static/reading-view.mjs';
test('fit modes account for available space without capping a narrow phone page',()=>{
 assert.equal(fitScale('width',400,700,600,800,20),.6);
 assert.equal(fitScale('page',1000,700,600,800,20),.825);
 assert.equal(fitScale('manual',400,700,600,800,20,1.8),1.8);
});
test('reading anchor survives a size change mid-page',()=>{
 const anchor=readingAnchor([{page:1,top:-600,bottom:200,height:800,left:-50,width:600},{page:2,top:220,bottom:1020,height:800,left:-50,width:600}],{top:0,left:0,width:400});
 assert.deepEqual(anchor,{page:1,fraction:.75,x:5/12});
 assert.deepEqual(anchorScroll(anchor,{top:20,left:10,height:1600,width:1200},{width:400}),{top:1220,left:310});
});
test('plan resume skips unrelated recent papers and suggests next unfinished step',()=>{
 const steps=[{tag:'a',done:true,items:[{key:'A'}]},{tag:'b',done:false,items:[{key:'B'}]},{tag:'c',done:false,items:[{key:'C'}]}];
 const result=planResume(steps,{A:{updated:20,page:9},B:{updated:30,page:3},OTHER:{updated:100,page:2}});
 assert.equal(result.resume.item.key,'B');assert.equal(result.next.item.key,'B');
 assert.equal(planResume(steps.map(s=>({...s,done:true})),{}).next,null);
});
test('annotation filters combine color, page, type and web draft text',()=>{
 const notes=[{id:'1',text:'first',comment:'',color:'#ff6666',type:'underline',position:{pageIndex:2},conflict:true,webDraftComment:'my proof'},{id:'2',text:'proof',color:'#ffd400',position:{pageIndex:1}}];
 assert.deepEqual(filterAnnotations(notes,{query:'proof',color:'#ff6666',type:'underline',page:3,status:'conflict'}).map(a=>a.id),['1']);
 assert.equal(filterAnnotations(notes,{page:2}).length,1);
});
test('unsent drafts overlay fresh notes and deletion drafts hide only their target',()=>{
 const saved=[{id:'z:A',comment:'local'},{id:'z:B',comment:'other'}];
 const merged=mergeDrafts(saved,[{id:'z:A',comment:'draft',browserDraft:true},{id:'z:B',deleted:true},{id:'b:new',comment:'offline'}]);
 assert.deepEqual(merged.map(a=>[a.id,a.comment]),[['z:A','draft'],['b:new','offline']]);
});
test('continuous mode marks once per selection session and defaults to selection',()=>{
 const tool=createMarkTool();assert.equal(tool.claim('s1'),null);
 tool.setMode('underline');assert.equal(tool.claim('s1'),'underline');assert.equal(tool.claim('s1'),null);
 assert.equal(tool.claim('s2'),'underline');tool.setMode('select');assert.equal(tool.claim('s3'),null);
});
test('an offline edit uses saved annotation aliases after native sync',()=>{
 const notes=[{id:'z:ABCDEF12',aliases:['p:123'],comment:'saved'}];
 const merged=mergeDrafts(notes,[{id:'p:123',comment:'newer draft',browserDraft:true}]);
 assert.equal(merged.length,1);assert.equal(merged[0].id,'z:ABCDEF12');assert.equal(merged[0].comment,'newer draft');
});
test('annotation tags are searchable and filterable independently of the quotation',()=>{
 const notes=[{id:'a',text:'quote',tags:['定义','疑问'],position:{pageIndex:0}},{id:'b',text:'other',tags:['证明思路'],position:{pageIndex:0}}];
 assert.deepEqual(filterAnnotations(notes,{tag:'疑问'}).map(x=>x.id),['a']);
 assert.deepEqual(filterAnnotations(notes,{query:'证明思路'}).map(x=>x.id),['b']);
});
