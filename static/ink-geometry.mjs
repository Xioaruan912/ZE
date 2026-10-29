export function annotationKind(a){return a?.type==='ink'||a?.type===4?'ink':a?.type==='underline'||a?.type===5?'underline':'highlight'}
export function penRoute(mode,type){return type==='pen'?(['ink','erase'].includes(mode)?mode:'select'):type==='touch'?'scroll':'mouse'}
export function inkBounds(position){
 const paths=position?.paths||[],pad=(position?.width||1)/2;let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const path of paths)for(let i=0;i<path.length-1;i+=2){left=Math.min(left,path[i]);right=Math.max(right,path[i]);top=Math.min(top,path[i+1]);bottom=Math.max(bottom,path[i+1])}
 return Number.isFinite(left)?[left-pad,top-pad,right+pad,bottom+pad]:null;
}
export function annotationRects(a){const bounds=annotationKind(a)==='ink'?inkBounds(a.position):null;return bounds?[bounds]:(a.position?.rects||[])}
function distance(x,y,a,b,c,d){const dx=c-a,dy=d-b,t=dx||dy?Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy))):0;return Math.hypot(x-a-t*dx,y-b-t*dy)}
export function inkHitTest(position,point,tolerance=0){
 const radius=(position?.width||1)/2+tolerance;
 for(const path of position?.paths||[]){if(path.length===2&&Math.hypot(point[0]-path[0],point[1]-path[1])<=radius)return true;for(let i=2;i<path.length;i+=2)if(distance(...point,path[i-2],path[i-1],path[i],path[i+1])<=radius)return true}return false;
}
export function inkPath(path,viewport){let d='';for(let i=0;i<path.length-1;i+=2){const [x,y]=viewport.convertToViewportPoint(path[i],path[i+1]);d+=(i?'L':'M')+Number(x.toFixed(3))+' '+Number(y.toFixed(3))}if(path.length===2)d+='l.001 0';return d}
const NS='http://www.w3.org/2000/svg';
export function renderInk(layer,annotations,viewport){
 const svg=layer.ownerDocument.createElementNS(NS,'svg');svg.classList.add('handwriting-layer');svg.setAttribute('width',viewport.width);svg.setAttribute('height',viewport.height);svg.setAttribute('aria-hidden','true');
 for(const a of annotations)for(const points of a.position?.paths||[]){const path=layer.ownerDocument.createElementNS(NS,'path');path.setAttribute('d',inkPath(points,viewport));path.setAttribute('fill','none');path.setAttribute('stroke',a.color||'#000000');path.setAttribute('stroke-width',(a.position.width||1)*viewport.scale);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.dataset.inkId=a.id;svg.append(path)}
 layer.append(svg);return svg;
}
