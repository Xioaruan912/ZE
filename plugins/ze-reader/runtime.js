var ZERuntime = {
 create({Zotero,Services,id,rootURI}) {
  let started=false;
  const states={},cleanups=[],menus=new Map(),workspaces=new Map(),settings=new Map();
  const runtime={
   async start(){
    if(started)return;started=true;
    try{
     if(Zotero.ReadingRouteColumns&&Zotero.ReadingRouteColumns!==ReadingColumns)await Zotero.ReadingRouteColumns.stop();
     Zotero.ReadingRouteColumns=ReadingColumns;await ReadingColumns.start(Zotero,id);states.columns={state:'ready',message:'阅读列已就绪'};
    }catch{await ReadingColumns.stop();states.columns={state:'error',message:'阅读列初始化失败'};Zotero.logError(new Error(states.columns.message));}
    Zotero.ZEReader=runtime;
    if(typeof ZEPreferences!=='undefined'&&typeof ZEAdapter!=='undefined'){
     runtime.store=ZEPreferences.create(Zotero);runtime.adapter=ZEAdapter.create({Zotero,Services,rootURI});
     if(typeof ZETabGroups!=='undefined')runtime.groups=ZETabGroups.create({store:runtime.store,adapter:runtime.adapter});
     if(typeof ZEBridge!=='undefined'){
      runtime.bridge=ZEBridge.create({Zotero,store:runtime.store,adapter:runtime.adapter,pluginID:id});cleanups.push(()=>runtime.bridge.stop());
      try{states.bridge=await runtime.bridge.start();}catch{states.bridge={state:'error',message:'翻译桥接初始化失败'};}
     }
     try{
      cleanups.push(runtime.adapter.registerResources());
      const pane=await Zotero.PreferencePanes.register({id:'ze-reader-preferences',pluginID:id,label:'ZE Reader',src:rootURI+'settings.xhtml',scripts:[rootURI+'settings.js'],stylesheets:[rootURI+'workbench.css']});
      cleanups.push(()=>Zotero.PreferencePanes.unregister(pane));states.workspace={state:'ready',message:'工作台已就绪'};
     }catch{states.workspace={state:'unavailable',message:'工作台资源或设置接口不可用，请检查 Zotero 版本'};}
    }
    for(const win of Zotero.getMainWindows())await runtime.setupWindow(win);
   },
   async setupWindow(win){
    if(!started)return;
    if(states.columns?.state==='ready')await ReadingColumns.setupWindow(win);
    if(states.workspace?.state!=='ready'||menus.has(win))return;
    const doc=win.document,popup=doc?.getElementById('menu_ToolsPopup');
    if(!popup)return;
    const menu=doc.createXULElement('menuitem');menu.id='ze-reader-open';menu.setAttribute('label','ZE Reader 工作台');
    const handler=()=>runtime.openWorkbench(win);menu.addEventListener('command',handler);popup.appendChild(menu);menus.set(win,{menu,handler});
   },
   releaseWindow(win){
    ReadingColumns.releaseWindow?.(win);
    const entry=menus.get(win);if(entry){entry.menu.removeEventListener('command',entry.handler);entry.menu.remove();menus.delete(win);}
    const workspace=workspaces.get(win);if(workspace&&!workspace.closed)workspace.close();workspaces.delete(win);
   },
   openWorkbench(win){
    if(states.workspace?.state!=='ready'){win.alert?.(states.workspace?.message||'工作台不可用');return;}
    const old=workspaces.get(win);if(old&&!old.closed){old.focus();return;}
    workspaces.set(win,ZEWorkbench.open({owner:win,runtime}));
   },
   mountWorkbench(doc,owner){
    const summary=ZESummary.create({adapter:runtime.adapter,htmlToText:html=>ZEWorkbench.htmlToText(doc,html)});
    const controller=ZEWorkbench.mount(doc,{owner,groups:runtime.groups,summary,matrix:ZEMatrix,store:runtime.store,adapter:runtime.adapter});
    const button=doc.getElementById('ze-open-settings'),open=()=>Zotero.Utilities.Internal.openPreferences('ze-reader-preferences');button.addEventListener('click',open);
    doc.defaultView.addEventListener('unload',()=>button.removeEventListener('click',open),{once:true});return controller;
   },
   attachSettings(doc){
    if(settings.has(doc))return settings.get(doc);
    const controller=ZESettings.mount(doc,{store:runtime.store,bridge:runtime.bridge,
     async pickTokenFile(){
      const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
      const picker=new FilePicker();picker.init(doc.defaultView,'选择 ZE 的 bridge.token',picker.modeOpen);picker.appendFilter('Bridge token','*.token');
      return await picker.show()===picker.returnOK?picker.file:null;
     },
     readText:path=>Zotero.File.getContentsAsync(path)
    });
    settings.set(doc,controller);doc.defaultView.addEventListener('unload',()=>{controller.dispose();settings.delete(doc);},{once:true});return controller;
   },
   status(){return {...states,...(runtime.bridge?{bridge:runtime.bridge.status()}: {})};},
   async stop(){
    if(!started)return;started=false;
    for(const win of [...menus.keys(),...workspaces.keys()])runtime.releaseWindow(win);
    for(const controller of settings.values())controller.dispose();settings.clear();
    while(cleanups.length){try{await cleanups.pop()();}catch{Zotero.logError(new Error('ZE Reader 资源清理失败'));}}
    await ReadingColumns.stop();
    if(Zotero.ReadingRouteColumns===ReadingColumns)delete Zotero.ReadingRouteColumns;
    if(Zotero.ZEReader===runtime)delete Zotero.ZEReader;
   }
  };
  return runtime;
 }
};
