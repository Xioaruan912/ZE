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
   },
   async setupWindow(win){if(started && states.columns?.state==='ready')await ReadingColumns.setupWindow(win);},
   releaseWindow(win){ReadingColumns.releaseWindow?.(win);},
   status(){return {...states};},
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
