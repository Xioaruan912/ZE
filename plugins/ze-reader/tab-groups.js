var ZETabGroups = {
 create({store,adapter}){
  const identity=ref=>ref.libraryID+':'+ref.attachmentKey;
  function name(value){if(typeof value!=='string'||!value.trim())throw Error('请输入分组名称');return value.trim();}
  function document(){const result=store.readDocument('groups');if(result.warning)throw Error(result.warning);return result.data;}
  function find(data,value){const group=data.groups.find(x=>x.name===name(value));if(!group)throw Error('分组不存在');return group;}
  const groups={
   listTabs(win){return adapter.listPDFTabs(win);},
   listGroups(){const result=store.readDocument('groups');return {groups:result.data.groups,warning:result.warning};},
   async saveGroup(value,win){
    const title=name(value),tabs=await adapter.listPDFTabs(win),data=document();
    if(data.groups.some(x=>x.name===title))throw Error('同名分组已存在');
    const seen=new Set(),attachments=[];
    for(const tab of tabs){const id=identity(tab);if(seen.has(id))continue;seen.add(id);attachments.push({libraryID:tab.libraryID,attachmentKey:tab.attachmentKey,title:tab.title});}
    if(!attachments.length)throw Error('当前没有已打开的 PDF');
    data.groups.push({name:title,attachments});store.writeDocument('groups',data);
   },
   renameGroup(oldName,newName){
    const data=document(),title=name(newName),group=find(data,oldName);
    if(data.groups.some(x=>x!==group&&x.name===title))throw Error('同名分组已存在');
    group.name=title;store.writeDocument('groups',data);
   },
   deleteGroup(value){const data=document(),group=find(data,value);data.groups=data.groups.filter(x=>x!==group);store.writeDocument('groups',data);},
   async restoreGroup(value,win){
    const group=find(document(),value),result={opened:0,reused:0,skipped:[]},seen=new Set();
    for(const ref of group.attachments){
     const id=identity(ref);if(seen.has(id))continue;seen.add(id);
     try{
      const current=await adapter.listPDFTabs(win);
      if(current.some(x=>identity(x)===id)){result.reused++;continue;}
      await adapter.openAttachment(ref,win);result.opened++;
     }catch{result.skipped.push({ref,reason:'附件不可打开，请检查文件是否存在、是否已下载以及访问权限。'});}
    }
    return result;
   }
  };
  return groups;
 }
};
