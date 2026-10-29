import {textReadingLines} from './text-order.mjs';
import {mergeRects} from './geometry.mjs';

export function pdfInkBand(transform,font,selection){
 let ascent=Number(font.ascent),descent=Number(font.descent),cap=Number(font.capHeight);
 if(descent>0)descent=-descent;
 if(!Number.isFinite(ascent)||!Number.isFinite(descent)||!ascent||!descent){ascent=.75;descent=-.25}
 if(ascent>1)ascent=.75;if(descent<-.5)descent=-.25;
 if(cap>0&&cap<ascent)ascent=cap;
 const [a,b,c,d,x,y]=transform,rect={left:selection.left,right:selection.right,top:selection.top,bottom:selection.bottom};
 if(Math.abs(b)<.00001&&Math.abs(c)<.00001){rect.top=Math.min(y+d*ascent,y+d*descent);rect.bottom=Math.max(y+d*ascent,y+d*descent)}
 else if(Math.abs(a)<.00001&&Math.abs(d)<.00001){rect.left=Math.min(x+c*ascent,x+c*descent);rect.right=Math.max(x+c*ascent,x+c*descent)}
 return rect;
}
export function fitHighlightToLine(rect,lines){
 let best=null,distance=Infinity;
 for(const line of lines||[]){
  const vertical=!!line.vertical,overlap=vertical?Math.min(rect.bottom,line.bottom)-Math.max(rect.top,line.top):Math.min(rect.right,line.right)-Math.max(rect.left,line.left);
  if(overlap<=0)continue;
  const delta=vertical?Math.abs((rect.left+rect.right-line.left-line.right)/2):Math.abs((rect.top+rect.bottom-line.top-line.bottom)/2);
  const size=vertical?Math.max(rect.right-rect.left,line.right-line.left):Math.max(rect.bottom-rect.top,line.bottom-line.top);
  if(delta<distance&&delta<size*.75){best=line;distance=delta}
 }
 if(!best)return {...rect};
 return best.vertical?{...rect,left:best.left,right:best.right}:{...rect,top:best.top,bottom:best.bottom};
}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
export function prepareTextGeometry(wrap,content,divs,viewport){
 const origin=wrap.getBoundingClientRect();wrap.inkRuns=[];let index=0;
 for(const item of content.items){
  if(typeof item.str!=='string')continue;const span=divs[index++];if(!span?.parentElement||!item.str.trim())continue;
  const r=span.getBoundingClientRect(),selection={left:r.left-origin.left,right:r.right-origin.left,top:r.top-origin.top,bottom:r.bottom-origin.top};
  const transform=multiply(viewport.transform,item.transform),bounds=pdfInkBand(transform,content.styles[item.fontName]||{},selection);
  if(bounds.right<=bounds.left||bounds.bottom<=bounds.top)continue;
  wrap.inkRuns.push({span,bounds,vertical:Math.abs(transform[0])<.00001});
 }
 const horizontal=wrap.inkRuns.filter(run=>!run.vertical),groups=textReadingLines(horizontal.map(run=>run.bounds));
 wrap.inkLines=groups.filter(group=>group.length).map(group=>{const boxes=group.map(i=>horizontal[i].bounds);return {left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))}});
 wrap.inkLines.push(...wrap.inkRuns.filter(run=>run.vertical).map(run=>({...run.bounds,vertical:true})));
}
export function selectionInkRects(selection,wrap){
 const origin=wrap.getBoundingClientRect(),rects=[];
 for(const {span} of wrap.inkRuns||[]){
  if(!selection.intersectsNode(span))continue;
  const part=span.ownerDocument.createRange();part.selectNodeContents(span);
  if(selection.compareBoundaryPoints(Range.START_TO_START,part)>0)part.setStart(selection.startContainer,selection.startOffset);
  if(selection.compareBoundaryPoints(Range.END_TO_END,part)<0)part.setEnd(selection.endContainer,selection.endOffset);
  if(part.collapsed||!part.toString().trim())continue;
  for(const r of part.getClientRects())if(r.width>0&&r.height>0)rects.push(fitHighlightToLine({left:r.left-origin.left,right:r.right-origin.left,top:r.top-origin.top,bottom:r.bottom-origin.top},wrap.inkLines));
 }
 return mergeRects(rects);
}
