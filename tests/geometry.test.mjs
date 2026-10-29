import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mergeRects} from '../static/geometry.mjs';
test('overlapping rectangles on one line become one highlight',()=>{
 const a=mergeRects([{left:10,right:30,top:10,bottom:20},{left:20,right:40,top:10,bottom:20},{left:5,right:12,top:25,bottom:35}]);
 assert.equal(a.length,2);assert.equal(a[0].left,10);assert.equal(a[0].right,40);
});
