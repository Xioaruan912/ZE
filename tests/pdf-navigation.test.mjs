import test from 'node:test';import assert from 'node:assert/strict';
import {indexText,findMatches,createNavigationHistory,collectReferences} from '../static/pdf-navigation.mjs';
test('search maps ligatures and wrapped hyphens to original text items',()=>{
 const index=indexText([{str:'An efﬁcient multi-',hasEOL:true},{str:'user scheme',hasEOL:true}]);
 const matches=findMatches(index,'efficient multiuser');assert.equal(matches.length,1);assert.deepEqual(matches[0].parts,[{item:0,start:3,end:17},{item:1,start:0,end:4}]);
});
test('history restores prior anchors and replaces forward history after a new jump',()=>{
 const h=createNavigationHistory();h.push({page:1,fraction:.4});h.push({page:5,fraction:.2});assert.deepEqual(h.back({page:9,fraction:.1}),{page:5,fraction:.2});assert.deepEqual(h.forward({page:5,fraction:.2}),{page:9,fraction:.1});h.back({page:9,fraction:.1});h.push({page:3,fraction:0});assert.equal(h.forward({page:4,fraction:0}),null);
});
test('reference list uses bibliography entries rather than body citations',()=>{
 const pages=[{page:1,index:indexText([{str:'See [1] for a proof.',hasEOL:true}])},{page:8,index:indexText([{str:'References',hasEOL:true},{str:'[1] A. Author. A theorem.',hasEOL:true},{str:'[2] B. Author. Another theorem.',hasEOL:true}])}];
 assert.deepEqual(collectReferences(pages).map(x=>[x.label,x.page]),[['1',8],['2',8]]);
});
test('search joins touching font runs and collapses existing whitespace',()=>{
 const index=indexText([{str:'Private ',transform:[12,0,0,12,0,10],width:40},{str:'key encryp',transform:[12,0,0,12,45,10],width:60},{str:'tion',transform:[12,0,0,12,105,10],width:20,hasEOL:true}]);
 assert.equal(findMatches(index,'private key encryption').length,1);
});
