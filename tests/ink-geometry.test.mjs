import test from 'node:test';
import assert from 'node:assert/strict';
import {inkBounds,inkHitTest,inkPath,annotationKind,penRoute} from '../static/ink-geometry.mjs';
test('native ink bounds include pen width and work for dots',()=>{
 assert.deepEqual(inkBounds({width:2,paths:[[10,20,30,40]]}),[9,19,31,41]);
 assert.deepEqual(inkBounds({width:2,paths:[[10,20]]}),[9,19,11,21]);
});
test('eraser hits the stroke, not empty space inside its bounding box',()=>{
 const p={width:2,paths:[[0,0,100,100]]};assert.equal(inkHitTest(p,[50,51],2),true);assert.equal(inkHitTest(p,[10,90],2),false);
});
test('native coordinates are transformed for rotated and zoomed display',()=>{
 assert.equal(inkPath([10,20,30,40],{convertToViewportPoint:(x,y)=>[y*2,x*2]}),'M40 20L80 60');
});
test('numeric native ink does not become a highlight',()=>{
 assert.equal(annotationKind({type:4}),'ink');assert.equal(annotationKind({type:5}),'underline');assert.equal(annotationKind({type:'ink'}),'ink');
});
test('explicit mode routes only the pen and keeps fingers for scrolling',()=>{
 assert.equal(penRoute('select','pen'),'select');assert.equal(penRoute('ink','pen'),'ink');assert.equal(penRoute('erase','pen'),'erase');assert.equal(penRoute('ink','touch'),'scroll');assert.equal(penRoute('erase','mouse'),'mouse');
});
