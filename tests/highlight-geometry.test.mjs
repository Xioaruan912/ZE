import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfInkBand,fitHighlightToLine} from '../static/highlight-geometry.mjs';
test('PDF cap height and descent replace the larger browser selection line box',()=>{
 const band=pdfInkBand([10,0,0,-10,40,100],{ascent:.8,descent:-.2,capHeight:.7},{left:40,right:140,top:90,bottom:105});
 assert.deepEqual(band,{left:40,right:140,top:93,bottom:102});
});
test('adjacent text lines retain the same whitespace as native font bounds',()=>{
 const style={ascent:.8,descent:-.2,capHeight:.7};
 const first=pdfInkBand([10,0,0,-10,0,100],style,{left:0,right:100,top:90,bottom:105});
 const second=pdfInkBand([10,0,0,-10,0,112],style,{left:0,right:100,top:102,bottom:117});
 assert.equal(second.top-first.bottom,3);
});
test('rendering an older tall web rectangle snaps to its own line only',()=>{
 const lines=[{left:0,right:120,top:93,bottom:102},{left:0,right:120,top:105,bottom:114}];
 assert.deepEqual(fitHighlightToLine({left:20,right:80,top:90,bottom:105},lines),{left:20,right:80,top:93,bottom:102});
 assert.deepEqual(fitHighlightToLine(lines[0],lines),lines[0]);
});
test('vertical pages use the font band on the horizontal axis',()=>{
 assert.deepEqual(pdfInkBand([0,10,10,0,100,40],{ascent:.8,descent:-.2,capHeight:.7},{left:90,right:115,top:40,bottom:140}),{left:98,right:107,top:40,bottom:140});
});
test('broken font metadata uses safe PDF defaults without growing the selection',()=>{
 const band=pdfInkBand([10,0,0,-10,0,100],{ascent:100,descent:4},{left:0,right:100,top:90,bottom:105});
 assert.deepEqual(band,{left:0,right:100,top:92.5,bottom:102.5});
});
