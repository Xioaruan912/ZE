export class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes=new Map();this.handlers=new Map();this.style={};this.hidden=false;this.parentNode=null;this._text='';}
 setAttribute(k,v){this.attributes.set(k,String(v));}
 getAttribute(k){return this.attributes.get(k)??null;}
 hasAttribute(k){return this.attributes.has(k);}
 removeAttribute(k){this.attributes.delete(k);}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set textContent(v){this._text=String(v);for(const c of this.children)c.parentNode=null;this.children=[];}
 appendChild(node){node.remove();this.children.push(node);node.parentNode=this;return node;}
 append(...nodes){for(const node of nodes)this.appendChild(node);}
 insertBefore(node,before){node.remove();const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);node.parentNode=this;}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}}
 contains(node){return node===this||this.children.some(c=>c.contains(node));}
 matches(selector){if(selector.startsWith('['))return this.hasAttribute(selector.slice(1,-1));if(selector.startsWith('.'))return (this.className||'').split(' ').includes(selector.slice(1));return this.tagName===selector;}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,fn){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn);}
 removeEventListener(type,fn){this.handlers.get(type)?.delete(fn);}
 async fire(type,event={}){for(const fn of [...this.handlers.get(type)||[]])await fn({target:this,stopPropagation(){},preventDefault(){},...event});}
 openPopupAtScreen(x,y){this.popupPoint={x,y};this.state='open';}
 hidePopup(){this.state='closed';}
}
export function windowDOM(){
 const root=new Node('window'),observers=[],doc=new Node('document');doc.append(root);doc.documentElement=root;
 doc.createElementNS=(_,tag)=>new Node(tag);doc.createXULElement=tag=>new Node(tag);doc.activeElement=null;
 const win=new Node('window-events');win.document=doc;win.MutationObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}trigger(){if(!this.disconnected)this.fn([]);}};doc.defaultView=win;
 return {win,doc,root,observers};
}
export const settle=async()=>{await Promise.resolve();await Promise.resolve();};
