export function dom(ids){
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners=new Map();this.attributes={};this.value='';this.hidden=false;this.disabled=false;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}appendChild(n){this.append(n);return n;}replaceChildren(...nodes){this._text='';this.children=[...nodes];}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
  addEventListener(t,fn){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(fn);}
  removeEventListener(t,fn){this.listeners.get(t)?.delete(fn);}remove(){this.removed=true;}focus(){}
  async fire(type){for(const fn of this.listeners.get(type)||[])await fn({target:this,preventDefault(){}});}
 }
 const nodes=new Map(ids.map(id=>[id,new Node()]));for(const [id,node] of nodes)node.id=id;
 const doc={defaultView:{addEventListener(){},removeEventListener(){}},getElementById:id=>nodes.get(id),createElementNS:(_,tag)=>new Node(tag)};
 return {doc,nodes};
}
export const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
