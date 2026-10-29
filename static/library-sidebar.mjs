import {buildTree} from './tree.mjs';

export function filterLibraryItems(items,query){
 const words=query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!words.length)return items;
 return items.filter(item=>{const text=[item.title,item.date,...(item.creators||[]).map(c=>c.last||c.lastName||c.name||''),...(item.tags||[]).map(t=>typeof t==='string'?t:t.tag)].join(' ').normalize('NFKC').toLocaleLowerCase();return words.every(word=>text.includes(word))});
}
export function collectionTrail(collections,key){
 const byKey=new Map(collections.map(c=>[c.key,c])),trail=[],seen=new Set();
 while(key&&byKey.has(key)&&!seen.has(key)){seen.add(key);const c=byKey.get(key);trail.unshift(c.name);key=c.parentCollection}
 return ['我的文库',...trail];
}

export function createLibrarySidebar(root,{onCollection,onOpen}={}){
 root.classList.add('library-component');
 root.innerHTML=`<div class="library-heading"><h1>我的文献</h1><span class="library-origin">Zotero</span></div>
 <div class="library-search"><input id="search" type="search" placeholder="搜索标题、作者或标签" aria-label="筛选文献"><button id="clear-library-search" aria-label="清除文献搜索" hidden>×</button></div>
 <button id="library-scope" class="library-scope" aria-label="选择文献分类" aria-expanded="false" aria-controls="collection-picker"><span id="library-scope-name">我的文库</span><span class="scope-chevron" aria-hidden="true"></span></button>
 <div id="collection-picker" class="collection-picker" hidden><div class="collection-picker-heading"><strong>选择分类</strong><button id="close-collection-picker" aria-label="收起分类面板">×</button></div><div id="collection-tree" class="collection-tree" aria-label="文献分类"></div></div>
 <div class="library-list-heading"><span id="library-count" role="status">正在读取文献…</span><button id="reset-library-search" hidden>清除筛选</button></div>
 <div id="items" class="items" aria-label="文献列表" aria-busy="true"></div>`;
 const $=selector=>root.querySelector(selector),expanded=new Set();let items=[],collections=[],selected='',active='',loading=false;
 function togglePicker(open){$('#collection-picker').hidden=!open;$('#library-scope').setAttribute('aria-expanded',String(open));if(open)drawTree()}
 function choose(key){selected=key;updateScope();togglePicker(false);$('#library-scope').focus();onCollection?.(key)}
 function updateScope(){const trail=collectionTrail(collections,selected);$('#library-scope-name').textContent=trail.at(-1);$('#library-scope').title=trail.join(' / ')}
 function drawTree(){
  const tree=$('#collection-tree');tree.replaceChildren();const all=document.createElement('button');all.className='tree-all'+(!selected?' selected':'');all.textContent='我的文库';all.onclick=()=>choose('');tree.append(all);
  function row(node,depth){
   const line=document.createElement('div');line.className='tree-line';line.style.paddingLeft=depth*16+'px';
   const toggle=document.createElement('button');toggle.className='tree-toggle';toggle.dataset.key=node.key;toggle.disabled=!node.children.length;toggle.setAttribute('aria-label',expanded.has(node.key)?'收起分类':'展开分类');toggle.setAttribute('aria-expanded',String(expanded.has(node.key)));toggle.onclick=()=>{expanded.has(node.key)?expanded.delete(node.key):expanded.add(node.key);drawTree()};
   const folder=document.createElement('button');folder.dataset.key=node.key;folder.className='tree-folder'+(selected===node.key?' selected':'');folder.textContent=node.name;folder.title=collectionTrail(collections,node.key).join(' / ');folder.onclick=()=>choose(node.key);line.append(toggle,folder);tree.append(line);
   if(expanded.has(node.key))node.children.forEach(child=>row(child,depth+1));
  }
  buildTree(collections).forEach(node=>row(node,0));
 }
 function draw(){
  const query=$('#search').value,list=filterLibraryItems(items,query),container=$('#items');container.replaceChildren();container.setAttribute('aria-busy',String(loading));
  $('#library-count').textContent=loading?'正在读取文献…':query.trim()?`${list.length} / ${items.length} 篇文献`:`${items.length} 篇文献`;
  $('#clear-library-search').hidden=$('#reset-library-search').hidden=!query.length;
  for(const item of list){
   const button=document.createElement('button');button.className='item'+(active===item.key?' active':'');button.dataset.key=item.key;button.title=item.title||'未命名文献';button.setAttribute('aria-current',active===item.key?'true':'false');
   const title=document.createElement('strong');title.textContent=item.title||'未命名文献';
   const meta=document.createElement('small');const authors=(item.creators||[]).map(c=>c.last||c.lastName||c.name||'').filter(Boolean).slice(0,2).join(', ');meta.textContent=[authors,item.date].filter(Boolean).join(' · ');
   button.append(title);if(meta.textContent)button.append(meta);button.onclick=()=>onOpen?.(item);container.append(button);
  }
  if(!list.length){const empty=document.createElement('div');empty.className='library-empty';empty.textContent=loading?'正在读取文献…':query?'没有匹配的文献，试试作者、年份或更短的关键词。':'这个分类还没有文献。';container.append(empty)}
 }
 $('#library-scope').onclick=()=>togglePicker($('#collection-picker').hidden);
 $('#close-collection-picker').onclick=()=>{togglePicker(false);$('#library-scope').focus()};
 $('#search').oninput=draw;
 const clear=()=>{$('#search').value='';draw();$('#search').focus()};$('#clear-library-search').onclick=clear;$('#reset-library-search').onclick=clear;
 const outside=event=>{if(!$('#collection-picker').contains(event.target)&&!$('#library-scope').contains(event.target))togglePicker(false)},escape=event=>{if(event.key==='Escape'&&!$('#collection-picker').hidden){togglePicker(false);$('#library-scope').focus();event.stopPropagation()}};
 document.addEventListener('pointerdown',outside,{passive:true});root.addEventListener('keydown',escape);
 return {
  get selectedCollection(){return selected},
  update(data){if(data.items)items=data.items;if(data.collections)collections=data.collections;if('active' in data)active=data.active||'';loading=false;updateScope();drawTree();draw()},
  setActive(key){active=key||'';for(const button of $('#items').querySelectorAll('.item')){const selected=button.dataset.key===active;button.classList.toggle('active',selected);button.setAttribute('aria-current',String(selected))}},setLoading(value){loading=value;$('#items').setAttribute('aria-busy',String(value));$('#library-count').textContent=value?'正在读取文献…':`${filterLibraryItems(items,$('#search').value).length} 篇文献`},
  destroy(){document.removeEventListener('pointerdown',outside);root.removeEventListener('keydown',escape)}
 };
}
