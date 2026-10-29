import test from 'node:test';
import assert from 'node:assert/strict';
import {wordBounds, nearestBox, popoverPosition,selectionTextForTranslation} from '../static/selection-input.mjs';

test('pen selection snaps to words and tolerates a caret at the word end',()=>{
 assert.deepEqual(wordBounds('Identity-Based encryption',4),[0,14]);
 assert.deepEqual(wordBounds('Identity-Based encryption',24),[15,25]);
 assert.deepEqual(wordBounds('hello world',5),[0,5]);
});
test('nearest text follows the line when the pen is in a small gap',()=>{
 const boxes=[{left:10,right:100,top:10,bottom:25},{left:10,right:100,top:35,bottom:50}];
 assert.equal(nearestBox(boxes,105,20),0);
 assert.equal(nearestBox(boxes,20,39),1);
});
test('popover stays inside the visible keyboard viewport',()=>{
 const result=popoverPosition({left:280,right:320,top:280,bottom:300},300,230,{left:0,top:100,width:390,height:380});
 assert.ok(result.left>=8 && result.left+300<=382);
 assert.ok(result.top>=108 && result.top+230<=472);
});
test('translation joins PDF line wraps without losing real hyphenated words',()=>{
 assert.equal(selectionTextForTranslation('Identity-Based en-\ncryption\nprotects messages.'),'Identity-Based encryption protects messages.');
});
test('popover centers its arrow on the final caret when there is room',()=>{
 const pos=popoverPosition({left:500,right:500,top:300,bottom:320},300,150,{left:0,top:0,width:1000,height:800});
 assert.equal(pos.left,350);assert.equal(pos.top,332);
});
