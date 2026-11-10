var ZERuntime = {
 create({Zotero,Services,id,rootURI}) {
  let started=false;
  const states={},cleanups=[];
  const runtime={
   async start(){
    if(started)return;started=true;
    try{
     if(Zotero.ReadingRouteColumns && Zotero.ReadingRouteColumns!==ReadingColumns)await Zotero.ReadingRouteColumns.stop();
     Zotero.ReadingRouteColumns=ReadingColumns;
     await ReadingColumns.start(Zotero,id);
     states.columns={state:'ready',message:'阅读列已就绪'};
    }catch(e){await ReadingColumns.stop();states.columns={state:'error',message:'阅读列初始化失败'};Zotero.logError(new Error(states.columns.message));}
    if(typeof ZEPreferences!=='undefined'&&typeof ZEAdapter!=='undefined'){
     runtime.store=ZEPreferences.create(Zotero);runtime.adapter=ZEAdapter.create({Zotero,Services,rootURI});
     if(typeof ZETabGroups!=='undefined')runtime.groups=ZETabGroups.create({store:runtime.store,adapter:runtime.adapter});
     if(typeof ZEBridge!=='undefined'){
      runtime.bridge=ZEBridge.create({Zotero,store:runtime.store,adapter:runtime.adapter,pluginID:id});
      cleanups.push(()=>runtime.bridge.stop());
      try{states.bridge=await runtime.bridge.start();}catch{states.bridge={state:'error',message:'翻译桥接初始化失败'};}
     }
    }
   },
   async setupWindow(win){if(started && states.columns?.state==='ready')await ReadingColumns.setupWindow(win);},
   releaseWindow(win){ReadingColumns.releaseWindow?.(win);},
   status(){return {...states,...(runtime.bridge?{bridge:runtime.bridge.status()}: {})};},
   async stop(){
    if(!started)return;started=false;
    while(cleanups.length){try{await cleanups.pop()();}catch{Zotero.logError(new Error('ZE Reader 资源清理失败'));}}
    await ReadingColumns.stop();
    if(Zotero.ReadingRouteColumns===ReadingColumns)delete Zotero.ReadingRouteColumns;
   }
  };
  return runtime;
 }
};
