// Geometry is shared by pen input and the optional finger-selection mode.
export function selectionTextForTranslation(text){return text.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g,'$1$2').replace(/\s+/g,' ').trim()}
export function wordBounds(text,offset){
 let i=Math.max(0,Math.min(text.length-1,offset));
 const isWord=c=>!!c&&/[\p{L}\p{N}_'’\-]/u.test(c);
 if(!isWord(text[i])&&i>0&&isWord(text[i-1]))i--;
 if(!isWord(text[i]))return [i,Math.min(text.length,i+1)];
 let start=i,end=i+1;while(start>0&&isWord(text[start-1]))start--;while(end<text.length&&isWord(text[end]))end++;
 return [start,end];
}
export function nearestBox(boxes,x,y){
 let best=-1,score=Infinity;
 boxes.forEach((r,i)=>{const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),d=dx*dx+dy*dy*9;if(d<score){score=d;best=i}});
 return best;
}
export function popoverPosition(anchor,width,height,viewport){
 const left=viewport.left+8,top=viewport.top+8,right=viewport.left+viewport.width-8,bottom=viewport.top+viewport.height-8;
 let y=anchor.bottom+12;if(y+height>bottom)y=anchor.top-height-12;
 const center=(anchor.left+anchor.right)/2;
 return {left:Math.max(left,Math.min(center-width/2,right-width)),top:Math.max(top,Math.min(y,bottom-height))};
}
export function selectionFocusRect(selection){
 if(!selection?.rangeCount||!selection.focusNode)return null;
 const node=selection.focusNode,offset=selection.focusOffset,doc=node.ownerDocument;
 const point=(rect,x)=>({left:x,right:x,top:rect.top,bottom:rect.bottom});
 const usable=r=>r.height>0&&Number.isFinite(r.left)&&Number.isFinite(r.top);
 // A collapsed DOM range follows the moving end, including reverse and
 // keyboard selections. The union of the whole selection cannot do that.
 try{const caret=doc.createRange();caret.setStart(node,offset);caret.collapse(true);const rect=Array.from(caret.getClientRects()).find(usable);if(rect)return point(rect,rect.left)}catch{}
 if(node.nodeType===3&&node.length){
  const i=Math.max(0,Math.min(node.length-1,offset===0?0:offset-1)),char=doc.createRange();char.setStart(node,i);char.setEnd(node,i+1);const rect=char.getBoundingClientRect();
  if(usable(rect)){const rtl=doc.defaultView.getComputedStyle(node.parentElement).direction==='rtl';return point(rect,offset===0?(rtl?rect.right:rect.left):(rtl?rect.left:rect.right))}
 }
 const range=selection.getRangeAt(0),rects=Array.from(range.getClientRects()).filter(usable);if(!rects.length)return null;
 const backward=node===range.startContainer&&offset===range.startOffset,rect=backward?rects[0]:rects.at(-1);return point(rect,backward?rect.left:rect.right);
}
function caretAt(layer,x,y){
 // Native hit testing often returns the page rather than the transparent PDF
 // text on iPad. Fall back to the closest visible text run and character.
 const doc=layer.ownerDocument;
 let native=doc.caretPositionFromPoint?.(x,y),node=native?.offsetNode,offset=native?.offset;
 if(!node){const r=doc.caretRangeFromPoint?.(x,y);node=r?.startContainer;offset=r?.startOffset}
 if(node?.nodeType===3&&layer.contains(node))return {node,offset};
 const walker=doc.createTreeWalker(layer,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode()){const n=walker.currentNode;if(n.textContent.trim())nodes.push(n)}
 const ranges=nodes.map(n=>{const r=doc.createRange();r.selectNodeContents(n);return r.getBoundingClientRect()});
 const index=nearestBox(ranges,x,y);if(index<0)return null;
 node=nodes[index];const r=doc.createRange(),characters=[];
 for(let i=0;i<node.length;i++){r.setStart(node,i);r.setEnd(node,i+1);characters.push(r.getBoundingClientRect())}
 offset=nearestBox(characters,x,y);return offset<0?null:{node,offset};
}
function selectWords(anchor,focus){
 const doc=anchor.node.ownerDocument,a=wordBounds(anchor.node.textContent,anchor.offset),b=wordBounds(focus.node.textContent,focus.offset);
 const first=doc.createRange(),last=doc.createRange();first.setStart(anchor.node,a[0]);first.collapse(true);last.setStart(focus.node,b[0]);last.collapse(true);
 const r=doc.createRange();if(first.compareBoundaryPoints(Range.START_TO_START,last)<=0){r.setStart(anchor.node,a[0]);r.setEnd(focus.node,b[1])}else{r.setStart(focus.node,b[0]);r.setEnd(anchor.node,a[1])}
 const selection=doc.getSelection();
 if(selection.setBaseAndExtent){if(first.compareBoundaryPoints(Range.START_TO_START,last)<=0)selection.setBaseAndExtent(anchor.node,a[0],focus.node,b[1]);else selection.setBaseAndExtent(anchor.node,a[1],focus.node,b[0])}
 else{selection.removeAllRanges();selection.addRange(r)}
}
export function installSelectionInput(root,{onStart,onFinish,onTap,getPenMode=()=> 'select'}={}){
 let gesture=null,fingerSelect=false,ignoreClickUntil=0;
 const begin=(target,x,y,source,id)=>{
  const layer=target.closest?.('.textLayer');if(!layer||!root.contains(layer))return false;
  const anchor=caretAt(layer,x,y);if(!anchor)return false;
  onStart?.();gesture={layer,anchor,source,id,x,y,moved:false};root.classList.add('custom-selecting');selectWords(anchor,anchor);return true;
 };
 const move=(x,y)=>{if(!gesture)return;gesture.moved||=Math.hypot(x-gesture.x,y-gesture.y)>5;const focus=caretAt(gesture.layer,x,y);if(focus)selectWords(gesture.anchor,focus)};
 const end=(x,y,cancelled=false)=>{
  if(!gesture)return;const g=gesture;gesture=null;root.classList.remove('custom-selecting');ignoreClickUntil=Date.now()+500;
  if(cancelled){root.ownerDocument.getSelection()?.removeAllRanges();return}
  if(!g.moved&&onTap?.({clientX:x,clientY:y},g.layer.closest('.pdf-page'))){root.ownerDocument.getSelection()?.removeAllRanges();return}
  onFinish?.();
 };
 root.addEventListener('pointerdown',e=>{
  if(getPenMode()!=='select')return;
  if(e.pointerType==='mouse'){
   // Browsers otherwise start an HTML text drag when pressing inside the
   // previous PDF selection. Start a new native caret selection instead.
   if(e.button!==0||e.shiftKey||!e.target.closest?.('.textLayer'))return;
   onStart?.();root.ownerDocument.getSelection()?.removeAllRanges();return;
  }
  if(e.pointerType!=='pen'&&!(e.pointerType==='touch'&&fingerSelect))return;
  if(gesture)return;
  if(begin(e.target,e.clientX,e.clientY,'pointer',e.pointerId)){e.preventDefault();try{gesture.layer.setPointerCapture(e.pointerId)}catch{}}
 });
 root.addEventListener('pointermove',e=>{if(gesture?.source==='pointer'&&gesture.id===e.pointerId){e.preventDefault();move(e.clientX,e.clientY)}});
 root.addEventListener('pointerup',e=>{if(gesture?.source==='pointer'&&gesture.id===e.pointerId){move(e.clientX,e.clientY);end(e.clientX,e.clientY)}});
 root.addEventListener('pointercancel',e=>{if(gesture?.source==='pointer'&&gesture.id===e.pointerId)end(e.clientX,e.clientY,true)});
 // WebKit Touch Events let Pencil cancel panning without disabling finger
 // scrolling on the same PDF surface. Pointer Events remain the fallback.
 root.addEventListener('touchstart',e=>{
  if(getPenMode()!=='select')return;
  if(e.touches.length>1){if(gesture)end(0,0,true);return}
  const t=Array.from(e.changedTouches).find(t=>t.touchType==='stylus'||fingerSelect);
  if(!t||!e.target.closest?.('.textLayer'))return;
  if(gesture){gesture.source='touch';gesture.id=t.identifier}
  else if(!begin(e.target,t.clientX,t.clientY,'touch',t.identifier))return;
  if(e.cancelable)e.preventDefault();
 },{passive:false});
 root.addEventListener('touchmove',e=>{if(gesture?.source!=='touch')return;const t=Array.from(e.changedTouches).find(t=>t.identifier===gesture.id);if(t){if(e.cancelable)e.preventDefault();move(t.clientX,t.clientY)}},{passive:false});
 root.addEventListener('touchend',e=>{if(gesture?.source!=='touch')return;const t=Array.from(e.changedTouches).find(t=>t.identifier===gesture.id);if(t){move(t.clientX,t.clientY);end(t.clientX,t.clientY)}});
 root.addEventListener('touchcancel',()=>{if(gesture?.source==='touch')end(0,0,true)});
 root.addEventListener('contextmenu',e=>{if(gesture||fingerSelect)e.preventDefault()});
 root.addEventListener('dragstart',e=>{if(e.target.closest?.('.textLayer'))e.preventDefault()});
 return {get active(){return !!gesture},get suppressClick(){return Date.now()<ignoreClickUntil},cancel(){if(gesture)end(0,0,true)},setFingerSelect(value){fingerSelect=value;root.classList.toggle('finger-select',value)}};
}
