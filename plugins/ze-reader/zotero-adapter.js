var ZEAdapter = {
 create({Zotero,Services,rootURI}){
  const isPDF=item=>item&&!item.deleted&&item.isAttachment?.()&&item.attachmentContentType==='application/pdf';
  const adapter={
   copyText(text){Zotero.Utilities.Internal.copyTextToClipboard(text);},
   async getItem(id){return await Zotero.Items.getAsync(id)||null;},
   async resolveAttachment(ref){
    if(!ref||!Number.isInteger(ref.libraryID)||!/^[A-Z0-9]{8}$/.test(ref.attachmentKey))return null;
    const item=await Zotero.Items.getByLibraryAndKeyAsync(ref.libraryID,ref.attachmentKey);
    return isPDF(item)?item:null;
   },
   async listPDFTabs(win){
    const tabs=win?.Zotero_Tabs?._tabs;
    if(!Array.isArray(tabs))throw Error('当前窗口的标签页接口不可用');
    const results=[];
    for(const tab of tabs){
     if(!['reader','reader-unloaded'].includes(tab.type)||!tab.data?.itemID)continue;
     const item=await adapter.getItem(tab.data.itemID);
     if(isPDF(item))results.push({libraryID:item.libraryID,attachmentKey:item.key,title:tab.title||item.getDisplayTitle(),tabID:tab.id});
    }
    return results;
   },
   selectTab(tabID,win){if(!win?.Zotero_Tabs?.select)throw Error('标签页切换不可用');win.focus?.();win.Zotero_Tabs.select(tabID);},
   async openAttachment(ref,win){
    const item=await adapter.resolveAttachment(ref);
    if(!item)throw Error('附件已删除或不可访问');
    if(item.fileExists && !await item.fileExists())throw Error('附件文件尚未下载或已缺失');
    if(!Zotero.Reader?.open)throw Error('PDF 阅读接口不可用');
    win?.focus?.();await Zotero.Reader.open(item.id,undefined,{allowDuplicate:false});
   },
   async getScopeItems(win,scope){
    let items;
    if(scope==='selected')items=win?.ZoteroPane?.getSelectedItems?.();
    else if(scope==='current')items=win?.ZoteroPane?.itemsView?.getSortedItems?.();
    else throw Error('未知文献范围');
    if(!Array.isArray(items))throw Error('当前文献范围不可读取');
    return (await Promise.all(items.map(x=>typeof x==='number'?adapter.getItem(x):x))).filter(x=>x&&!x.deleted);
   },
   async getChildren(item){
    let children=[];
    if(item.isRegularItem?.())children=[...(item.getNotes?.()||[]),...(item.getAttachments?.()||[])];
    else if(isPDF(item))children=item.getAnnotations?.()||[];
    return (await Promise.all(children.map(x=>typeof x==='number'?adapter.getItem(x):x))).filter(x=>x&&!x.deleted);
   },
   sourceURL(source){
    const library=Zotero.Libraries.get(source.libraryID);
    if(!library)throw Error('来源文库不可用');
    let segment;
    if(library.libraryType==='user')segment='library';
    else if(library.libraryType==='group'&&Number.isInteger(library.groupID))segment='groups/'+library.groupID;
    else throw Error('来源文库类型不受支持');
    const valid=key=>typeof key==='string'&&/^[A-Z0-9]{8}$/.test(key);
    if(source.kind==='note'){
     if(!valid(source.itemKey))throw Error('笔记标识无效');
     return 'zotero://select/'+segment+'/items/'+source.itemKey;
    }
    if(!valid(source.attachmentKey))throw Error('附件标识无效');
    const params=[];
    if(valid(source.annotationKey))params.push('annotation='+source.annotationKey);
    if(Number.isInteger(source.pageIndex)&&source.pageIndex>=0)params.push('page='+(source.pageIndex+1));
    return 'zotero://open-pdf/'+segment+'/items/'+source.attachmentKey+(params.length?'?'+params.join('&'):'');
   },
   async openSource(source,win){
    win=win||Zotero.getMainWindow();
    if(source.kind==='note'){
     const note=await Zotero.Items.getByLibraryAndKeyAsync(source.libraryID,source.itemKey);
     if(!note||note.deleted)throw Error('原笔记不可用');
     if(!win?.ZoteroPane?.openNoteWindow)throw Error('笔记打开接口不可用');
     await win.ZoteroPane.openNoteWindow(note.id);return {};
    }
    const attachment=await adapter.resolveAttachment(source);
    if(!attachment)throw Error('原 PDF 不可用');
    win?.focus?.();
    let location;
    if(typeof source.annotationKey==='string'&&/^[A-Z0-9]{8}$/.test(source.annotationKey))location={annotationID:source.annotationKey};
    else if(Number.isInteger(source.pageIndex)&&source.pageIndex>=0)location={pageIndex:source.pageIndex};
    await Zotero.Reader.open(attachment.id,location,{allowDuplicate:false});
    return location?{}:{warning:'标注位置缺失，已打开附件，请手动定位。'};
   },
   async legacyBridgeEnabled(){
    if(typeof ChromeUtils==='undefined')throw Error('扩展状态接口不可用');
    const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    return !!(await AddonManager.getAddonByID('paper-reader-bridge@local.example'))?.isActive;
   },
   registerResources(){
    if(typeof Cc==='undefined'||typeof Ci==='undefined')throw Error('插件资源注册接口不可用');
    const manager=Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup);
    const handle=manager.registerChrome(Services.io.newURI(rootURI+'manifest.json'),[
     ['content','ze-reader',rootURI],['locale','ze-reader','zh-CN',rootURI+'locale/zh-CN/']
    ]);
    let disposed=false;return ()=>{if(!disposed){disposed=true;handle.destruct();}};
   }
  };
  return adapter;
 }
};
