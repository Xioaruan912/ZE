var ZESummary = {
 create({adapter,htmlToText}){
  const identity=item=>item.libraryID+':'+item.key;
  function cancelled(signal){if(signal?.aborted){const error=Error('读取已取消');error.name='AbortError';throw error;}}
  return {
   async collect(win,scope,{signal,onProgress}={}){
    const papers=[],records=[],warnings=[],seenRoots=new Set(),seenItems=new Set();
    const check=()=>cancelled(signal);
    check();const selected=await adapter.getScopeItems(win,scope);check();
    async function root(item){
     const visited=new Set();
     while(item?.parentID){
      if(visited.has(item.id)){warnings.push('部分条目父子关系异常，已跳过。');return null;}visited.add(item.id);
      item=await adapter.getItem(item.parentID);check();
     }
     return item&&!item.deleted?item:null;
    }
    async function visit(item,paperID,attachment=null){
     check();if(!item||item.deleted||seenItems.has(identity(item)))return;seenItems.add(identity(item));
     if(item.isNote?.()){
      records.push({id:identity(item),paperID,kind:'note',text:htmlToText(item.getNote()),comment:'',color:'',tags:(item.getTags?.()||[]).map(x=>x.tag),pageLabel:'',annotationType:'',source:{kind:'note',libraryID:item.libraryID,itemKey:item.key}});
     }else if(item.isAnnotation?.()){
      let pageIndex;
      try{const raw=item.annotationPosition;const pos=typeof raw==='string'?JSON.parse(raw):raw;if(Number.isInteger(pos?.pageIndex)&&pos.pageIndex>=0)pageIndex=pos.pageIndex;}catch{}
      const source={kind:'annotation',libraryID:item.libraryID,itemKey:item.key,annotationKey:item.key};
      if(attachment)source.attachmentKey=attachment.key;
      if(pageIndex!==undefined)source.pageIndex=pageIndex;
      records.push({id:identity(item),paperID,kind:'annotation',text:item.annotationText||'',comment:item.annotationComment||'',color:item.annotationColor||'',tags:(item.getTags?.()||[]).map(x=>x.tag),pageLabel:item.annotationPageLabel||'',annotationType:item.annotationType||'',source});
     }
     if(records.length&&records.length%50===0){onProgress?.({papers:papers.length,records:records.length});await new Promise(resolve=>setTimeout(resolve,0));check();}
     if(item.isRegularItem?.()||(item.isAttachment?.()&&item.attachmentContentType==='application/pdf')){
      const children=await adapter.getChildren(item);check();
      for(const child of children)await visit(child,paperID,item.isAttachment?.()?item:attachment);
     }
    }
    for(const selectedItem of selected){
     check();
     try{
      const item=await root(selectedItem);if(!item||seenRoots.has(identity(item)))continue;
      seenRoots.add(identity(item));const id=identity(item);
      papers.push({id,libraryID:item.libraryID,key:item.key,title:item.getDisplayTitle?.()||item.key});
      await visit(item,id);
     }catch(error){if(error.name==='AbortError')throw error;warnings.push('部分文献内容无法读取，请检查附件和访问权限。');}
    }
    check();onProgress?.({papers:papers.length,records:records.length});return {papers,records,warnings};
   },
   filter(records,{query='',kind='',color='',tag=''}={}){
    const text=query.trim().toLocaleLowerCase();
    return records.filter(record=>(!kind||record.kind===kind)&&(!color||record.color.toLowerCase()===color.toLowerCase())&&(!tag||record.tags.includes(tag))&&(!text||[record.text,record.comment,...record.tags].join(' ').toLocaleLowerCase().includes(text)));
   }
  };
 }
};
