const median=values=>{const a=values.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
function bodyHeight(runs){
 const sorted=runs.slice().sort((a,b)=>a.height-b.height),half=sorted.reduce((sum,r)=>sum+r.right-r.left,0)/2;
 let width=0;for(const r of sorted){width+=r.right-r.left;if(width>=half)return r.height}
 return sorted.at(-1).height;
}

// PDF drawing order is not necessarily reading order. Attach small script and
// fraction runs to their visual line before arranging that line left to right.
// Keep line order from the regular text, so two-column papers stay column-first.
function readingLines(boxes){
 const valid=boxes.map((b,index)=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom,index,height:b.bottom-b.top,cy:(b.top+b.bottom)/2})).filter(b=>b.height>0&&b.right>b.left);
 if(!valid.length)return [boxes.map((_,i)=>i)];
 const height=bodyHeight(valid),lines=[];
 for(const b of valid.filter(b=>b.height>=height*.8).sort((a,b)=>a.cy-b.cy||a.left-b.left)){
  let line=lines.find(l=>Math.abs(l.cy-b.cy)<height*.4&&b.left<=l.right+height*4&&b.right>=l.left-height*4);
  if(!line){line={cy:b.cy,left:b.left,right:b.right,runs:[],regular:[]};lines.push(line)}
  line.runs.push(b);line.regular.push(b.index);line.left=Math.min(line.left,b.left);line.right=Math.max(line.right,b.right);
  line.cy=median(line.runs.map(r=>r.cy));
 }
 for(const b of valid.filter(b=>b.height<height*.8)){
  const score=l=>Math.abs(l.cy-b.cy)*4+Math.max(l.left-b.right,0,b.left-l.right);
  const line=lines.reduce((best,l)=>!best||score(l)<score(best)?l:best,null);
  if(line&&Math.abs(line.cy-b.cy)<height*.95)line.runs.push(b);
  else lines.push({cy:b.cy,left:b.left,right:b.right,runs:[b],regular:[b.index]});
 }
 lines.sort((a,b)=>median(a.regular)-median(b.regular));
 const order=lines.map(l=>l.runs.sort((a,b)=>a.left-b.left||a.top-b.top||a.index-b.index).map(r=>r.index));
 const included=new Set(order.flat()),rest=boxes.map((_,i)=>i).filter(i=>!included.has(i));
 return rest.length?order.concat([rest]):order;
}
export const textReadingOrder=boxes=>readingLines(boxes).flat();
export const textReadingLines=boxes=>readingLines(boxes);

export function orderTextLayer(layer,textDivs){
 // Keep PDF.js's item-to-element map intact for search. Only the DOM ordering
 // changes; absolute positions and the original rendered PDF never change.
 const divs=textDivs.filter(s=>s.textContent);
 layer.dataset.readingOrder='native';
 if(Number(layer.dataset.mainRotation||0)%180!==0||divs.some(s=>/rotate\((?:-?90|-?270)deg\)/.test(s.style.transform)))return;
 if(divs.length<2||divs.some(s=>s.parentElement!==layer))return;
 const boxes=divs.map(s=>s.getBoundingClientRect());
 const lines=readingLines(boxes);
 const fragment=layer.ownerDocument.createDocumentFragment();
 for(const line of lines){
  for(const i of line)fragment.append(divs[i]);
  const br=layer.ownerDocument.createElement('br');br.setAttribute('role','presentation');fragment.append(br);
 }
 layer.replaceChildren(fragment);
 layer.dataset.readingOrder='visual';
}
