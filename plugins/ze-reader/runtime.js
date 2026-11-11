var ZERuntime = {
 create({Zotero,id}) {
  let started=false;
  const states={};
  const runtime={
   async start(){
    if(started)return;started=true;
    try{
     if(Zotero.ReadingRouteColumns&&Zotero.ReadingRouteColumns!==ReadingColumns)await Zotero.ReadingRouteColumns.stop();
     Zotero.ReadingRouteColumns=ReadingColumns;
     await ReadingColumns.start(Zotero,id);
     states.columns={state:'ready',message:'阅读列已就绪'};
    }catch{
     await ReadingColumns.stop();states.columns={state:'error',message:'阅读列初始化失败'};
     Zotero.logError(new Error(states.columns.message));
    }
   },
   async setupWindow(win){if(started&&states.columns?.state==='ready')await ReadingColumns.setupWindow(win);},
   releaseWindow(win){ReadingColumns.releaseWindow(win);},
   status(){return {...states};},
   async stop(){
    if(!started)return;started=false;
    await ReadingColumns.stop();
    if(Zotero.ReadingRouteColumns===ReadingColumns)delete Zotero.ReadingRouteColumns;
   }
  };
  return runtime;
 }
};
