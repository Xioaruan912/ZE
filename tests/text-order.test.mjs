import test from 'node:test';
import assert from 'node:assert/strict';
import {textReadingOrder} from '../static/text-order.mjs';
const box=(left,top,width=30,height=20)=>({left,top,right:left+width,bottom:top+height});
test('a late superscript belongs beside its base, not after the paragraph',()=>{
 const runs=[box(10,10),box(55,10),box(10,40,200),box(10,70,200),box(42,3,10,12)];
 assert.deepEqual(textReadingOrder(runs),[0,4,1,2,3]);
});
test('a late subscript stays with its baseline',()=>{
 assert.deepEqual(textReadingOrder([box(10,10),box(60,10),box(10,42,160),box(42,21,10,12)]),[0,3,1,2]);
});
test('two columns keep their original column reading order',()=>{
 assert.deepEqual(textReadingOrder([box(10,10,140),box(10,40,140),box(340,10,140),box(340,40,140),box(150,4,8,12)]),[0,4,1,2,3]);
});
test('fraction pieces do not pull in the following paragraph',()=>{
 const runs=[box(10,10),box(80,10),box(10,48,200),box(45,1,10,12),box(45,22,10,12)];
 assert.deepEqual(textReadingOrder(runs),[0,3,4,1,2]);
});
test('browser DOMRect prototype properties are read explicitly',()=>{
 const rect=b=>Object.create(b);
 assert.deepEqual(textReadingOrder([rect(box(10,10)),rect(box(10,40)),rect(box(40,4,10,12))]),[0,2,1]);
});
test('many tiny formula runs do not redefine the body text height',()=>{
 const runs=[box(10,10,160),box(10,48,220),...Array.from({length:7},(_,i)=>box(70+i*6,4,5,12))];
 assert.deepEqual(textReadingOrder(runs),[0,2,3,4,5,6,7,8,1]);
});
