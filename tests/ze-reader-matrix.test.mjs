import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './ze-reader-fixtures.mjs';
const matrix=()=>load(['matrix.js']).ZEMatrix;
const rules=[{name:'方法',kind:'color',value:'#FF0000'},{name:'证据',kind:'tag',value:'方法'}];
function snapshot(){return {papers:[{id:'1:A',title:'A | [paper]'}, {id:'2:A',title:'B'}],records:[
 {id:'1:X',paperID:'1:A',kind:'annotation',text:'x | y\n[next]',comment:'comment',color:'#ff0000',tags:['方法'],source:{kind:'annotation'}},
 {id:'1:Y',paperID:'1:A',kind:'annotation',text:'second',comment:'',color:'#ff0000',tags:['方法/extra'],source:{kind:'annotation'}},
 {id:'1:N',paperID:'1:A',kind:'note',text:'not an annotation',color:'#ff0000',tags:['方法']}
 ]};}
test('matrix preserves all annotations, exact tags and library-qualified paper identities without mutations',()=>{
 const m=matrix(),input=snapshot(),before=JSON.stringify(input),rows=m.build(input,rules);
 assert.equal(rows.length,2);assert.equal(rows[0].cells[0].length,2);assert.equal(rows[0].cells[1].length,1);assert.equal(rows[1].cells[0].length,0);
 assert.equal(JSON.stringify(input),before);assert.equal(rules[0].value,'#FF0000');
});
test('invalid, empty and duplicate rules fail explicitly',()=>{
 const m=matrix();for(const value of [[{name:'',kind:'tag',value:'x'}],[{name:'A',kind:'color',value:'red'}],[{name:'A',kind:'other',value:'x'}],[{name:'A',kind:'tag',value:''}],[{name:'A',kind:'tag',value:'x'},{name:' A ',kind:'tag',value:'y'}]])assert.throws(()=>m.validateRules(value));
 assert.equal(m.validateRules([]).length,0);
});
test('Markdown preserves text comments and source links while escaping table and inline syntax',()=>{
 const m=matrix(),rows=m.build(snapshot(),rules),markdown=m.toMarkdown(rows,rules,()=> 'zotero://open-pdf/library/items/ABCDEFGH?annotation=ANNKEY01');
 assert.ok(markdown.includes('A \\| \\[paper\\]'));assert.ok(markdown.includes('x \\| y'));assert.ok(markdown.includes('comment'));
 assert.ok(markdown.includes('无匹配标注'));assert.ok(markdown.includes('[原文](zotero://open-pdf/library/items/ABCDEFGH?annotation=ANNKEY01)'));
 assert.equal(markdown.split('\n').length,4);
});
