var ZEWorkbench = {
 open({owner,runtime}){return owner.openDialog('chrome://ze-reader/content/workbench.xhtml','', 'chrome,resizable,centerscreen,width=1080,height=760',{owner,runtime});},
 htmlToText(doc,html){
  const inert=new doc.defaultView.DOMParser().parseFromString(html,'text/html');
  for(const node of inert.querySelectorAll('script,style,iframe,object'))node.remove();
  for(const node of inert.querySelectorAll('p,div,li,br'))node.append('\n');
  return inert.body.textContent.trim();
 },
 mount(doc,{owner,groups,summary,matrix,store,adapter}){
  const $=id=>doc.getElementById(id),listeners=[],create=(tag,text)=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);if(text!==undefined)node.textContent=text;return node;};
  let disposed=false,request=0,abort=null,view='tabs',snapshot={papers:[],records:[],warnings:[]},page=0,ruleRows=[];
  const message=text=>{if(!disposed)$('ze-message').textContent=text;};
  const on=(id,type,action)=>{const node=$(id),handler=async event=>{try{await action(event);}catch{message('操作未完成，请检查所选文献、配置和附件后重试。');}};
   node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
  const option=(label,value)=>{const node=create('option',label);node.value=value;return node;};
  function choices(id,values){const selected=$(id).value;$(id).replaceChildren(option('全部',''),...values.map(v=>option(v,v)));$(id).value=values.includes(selected)?selected:'';}
  function recordNode(record){
   const article=create('article');article.className='ze-record';
   const paper=snapshot.papers.find(x=>x.id===record.paperID);
   article.append(create('h3',paper?.title||'文献'),create('p',record.text||'['+(record.annotationType||'无文字标注')+']'));
   if(record.comment)article.append(create('p','批注：'+record.comment));
   article.append(create('small',[record.kind==='note'?'笔记':'标注',record.pageLabel?'第 '+record.pageLabel+' 页':'',...record.tags].filter(Boolean).join(' · ')));
   const open=create('button','打开来源');open.type='button';open.addEventListener('click',async()=>{try{const result=await adapter.openSource(record.source,owner);if(result.warning)message(result.warning);}catch{message('来源不可打开，请检查附件和访问权限。');}});
   article.append(open);return article;
  }
  function renderNotes(){
   const records=summary.filter(snapshot.records,{query:$('ze-query').value,kind:$('ze-kind').value,color:$('ze-color').value,tag:$('ze-tag').value});
   page=Math.max(0,Math.min(page,Math.ceil(records.length/50)-1));
   $('ze-records').replaceChildren(...records.slice(page*50,page*50+50).map(recordNode));
   if(!records.length)$('ze-records').textContent='没有匹配的笔记或标注。';
   $('ze-page').textContent=(records.length?page+1:0)+' / '+Math.ceil(records.length/50);
   $('ze-prev').disabled=page===0;$('ze-next').disabled=(page+1)*50>=records.length;
  }
  function currentRules(){const result=store.readDocument('rules');if(result.warning)message(result.warning);$('ze-rules-reset').hidden=!result.warning;return result.data.rules;}
  function drawRules(){
   ruleRows=[];$('ze-rules').replaceChildren();
   for(const rule of currentRules())addRule(rule);
  }
  function addRule(rule={name:'',kind:'color',value:'#ffd400'}){
   const row=create('div');row.className='ze-rule';
   const name=create('input');name.value=rule.name;name.setAttribute('aria-label','矩阵列名');name.placeholder='列名，如方法';
   const kind=create('select');kind.append(option('颜色','color'),option('标签','tag'));kind.value=rule.kind;kind.setAttribute('aria-label','匹配类型');
   const value=create('input');value.value=rule.value;value.setAttribute('aria-label','颜色值或精确标签');
   const remove=create('button','移除');remove.type='button';remove.addEventListener('click',()=>{ruleRows=ruleRows.filter(x=>x.row!==row);row.remove();});
   row.append(name,kind,value,remove);ruleRows.push({row,name,kind,value});$('ze-rules').append(row);
  }
  function drawMatrix(){
   const rules=currentRules(),container=$('ze-matrix');container.replaceChildren();$('ze-copy-matrix').disabled=!rules.length;
   if(!rules.length){container.textContent='请添加并保存矩阵规则：指定列名，再选择标注颜色或精确标签。';return;}
   const rows=matrix.build(snapshot,rules),table=create('table'),head=create('thead'),tr=create('tr');
   for(const label of ['文献',...rules.map(x=>x.name)]){const th=create('th',label);th.setAttribute('scope','col');tr.append(th);}head.append(tr);table.append(head);
   const body=create('tbody');
   for(const row of rows){const tr=create('tr'),title=create('th',row.paper.title);title.setAttribute('scope','row');tr.append(title);
    for(const records of row.cells){const td=create('td');if(records.length)td.append(...records.map(recordNode));else td.textContent='无匹配标注';tr.append(td);}body.append(tr);}
   table.append(body);container.append(table);if(!rows.length)container.append(create('p','当前范围没有文献。'));
  }
  async function drawTabs(serial){
   const tabs=await groups.listTabs(owner);if(disposed||serial!==request)return;
   const query=$('ze-query').value.trim().toLocaleLowerCase();$('ze-tabs').replaceChildren();
   for(const tab of tabs.filter(x=>x.title.toLocaleLowerCase().includes(query))){const button=create('button',tab.title);button.type='button';button.className='ze-tab-entry';button.addEventListener('click',()=>{try{adapter.selectTab(tab.tabID,owner);}catch{message('标签页已变化，请刷新。');}});$('ze-tabs').append(button);}
   if(!$('ze-tabs').children.length)$('ze-tabs').textContent='没有匹配的已打开 PDF。';
   const saved=groups.listGroups(),selected=$('ze-group-list').value;
   $('ze-group-list').replaceChildren(option('选择分组',''),...saved.groups.map(x=>option(x.name,x.name)));$('ze-group-list').value=saved.groups.some(x=>x.name===selected)?selected:'';
   $('ze-group-reset').hidden=!saved.warning;if(saved.warning)message(saved.warning);
   $('ze-count').textContent=tabs.length+' 个已打开 PDF';
  }
  async function refresh(){
   const serial=++request;abort?.abort();abort=new AbortController();const signal=abort.signal;
   $('ze-count').textContent='正在读取…';
   try{
    if(view==='tabs'){await drawTabs(serial);return;}
    const result=await summary.collect(owner,$('ze-scope').value,{signal,onProgress:progress=>{if(!disposed&&serial===request)$('ze-count').textContent='已读取 '+progress.papers+' 篇文献 · '+progress.records+' 条内容';}});
    if(disposed||serial!==request)return;snapshot=result;page=0;
    $('ze-count').textContent=snapshot.papers.length+' 篇文献 · '+snapshot.records.length+' 条笔记与标注';
    choices('ze-color',[...new Set(snapshot.records.map(x=>x.color).filter(Boolean))]);choices('ze-tag',[...new Set(snapshot.records.flatMap(x=>x.tags))]);
    if(view==='notes')renderNotes();else drawMatrix();message(snapshot.warnings.join(' '));
   }catch(error){if(!disposed&&serial===request&&error.name!=='AbortError'){message('内容读取失败，请检查范围和附件后刷新。');$('ze-count').textContent='读取失败';}}
  }
  for(const name of ['tabs','notes','matrix'])on('view-'+name,'click',async()=>{
   view=name;for(const key of ['tabs','notes','matrix']){$('pane-'+key).hidden=key!==view;$('view-'+key).setAttribute('aria-pressed',String(key===view));}
   if(view==='matrix')drawRules();await refresh();
  });
  on('ze-refresh','click',refresh);on('ze-scope','change',refresh);
  on('ze-query','input',()=>{page=0;return view==='tabs'?refresh():renderNotes();});
  for(const id of ['ze-kind','ze-color','ze-tag'])on(id,'change',()=>{page=0;renderNotes();});
  on('ze-prev','click',()=>{page--;renderNotes();});on('ze-next','click',()=>{page++;renderNotes();});
  on('ze-save-group','click',async()=>{await groups.saveGroup($('ze-group-name').value,owner);message('分组已保存。');await refresh();});
  on('ze-rename-group','click',async()=>{groups.renameGroup($('ze-group-list').value,$('ze-group-name').value);await refresh();});
  on('ze-delete-group','click',async()=>{groups.deleteGroup($('ze-group-list').value);await refresh();});
  on('ze-restore-group','click',async()=>{const result=await groups.restoreGroup($('ze-group-list').value,owner);await refresh();message('新打开 '+result.opened+'，复用 '+result.reused+'，跳过 '+result.skipped.length+' 个附件。');});
  on('ze-group-reset','click',async()=>{store.writeDocument('groups',{version:1,groups:[]},{replaceInvalid:true});await refresh();message('本机分组配置已重建。');});
  on('ze-add-rule','click',()=>addRule());
  on('ze-save-rules','click',()=>{
   const rules=matrix.validateRules(ruleRows.map(x=>({name:x.name.value,kind:x.kind.value,value:x.value.value})));
   store.writeDocument('rules',{version:1,rules});drawRules();drawMatrix();message('矩阵规则已保存。');
  });
  on('ze-rules-reset','click',()=>{store.writeDocument('rules',{version:1,rules:[]},{replaceInvalid:true});drawRules();drawMatrix();});
  on('ze-copy-matrix','click',()=>{const rules=currentRules();if(!rules.length)return;adapter.copyText(matrix.toMarkdown(matrix.build(snapshot,rules),rules,source=>adapter.sourceURL(source)));message('矩阵已复制为 Markdown。');});
  const controller={refresh,dispose(){disposed=true;request++;abort?.abort();for(const remove of listeners)remove();}};
  controller.ready=(async()=>{try{const selected=await adapter.getScopeItems(owner,'selected');if(disposed)return;$('ze-scope').value=selected.length?'selected':'current';await refresh();}catch{message('文献范围不可用，请返回 Zotero 主窗口后重试。');}})();
  return controller;
 }
};
if(typeof window!=='undefined')window.addEventListener('load',()=>{
 const args=window.arguments?.[0];if(!args?.runtime)return;
 const controller=args.runtime.mountWorkbench(document,args.owner);
 window.addEventListener('unload',()=>controller.dispose(),{once:true});
},{once:true});
