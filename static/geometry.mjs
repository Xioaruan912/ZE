export function mergeRects(input){
 const rects=input.filter(r=>r.right>r.left&&r.bottom>r.top).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})).sort((a,b)=>a.top-b.top||a.left-b.left);
 const out=[];
 for(const r of rects){let last=out[out.length-1];let overlap=last?Math.min(last.bottom,r.bottom)-Math.max(last.top,r.top):0;let similar=last&&overlap>=Math.min(last.bottom-last.top,r.bottom-r.top)*.6;
  if(similar&&r.left<=last.right+2&&r.right>=last.left-2){last.left=Math.min(last.left,r.left);last.right=Math.max(last.right,r.right);last.top=Math.min(last.top,r.top);last.bottom=Math.max(last.bottom,r.bottom)}else out.push({...r});}
 return out;
}
