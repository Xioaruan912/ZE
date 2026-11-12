var ZERuntime = {
 create({Zotero,id,cloneInto,unwrap}) {
  let started=false,pins=null;
  const states={},enhancements=new Map();
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
    if(typeof ZEPins!=='undefined'){
     try{pins=ZEPins.create({Zotero,id,cloneInto,unwrap});pins.start();states.pins={state:'ready'};}
     catch(error){pins?.dispose();pins=null;states.pins={state:'unavailable'};Zotero.logError(error);}
    }
    for(const win of Zotero.getMainWindows())await runtime.setupWindow(win);
   },
   async setupWindow(win){
    if(!started)return;
    if(states.columns?.state==='ready')await ReadingColumns.setupWindow(win);
    if(!started||!win.document||enhancements.has(win))return;
    const controllers=[];enhancements.set(win,controllers);
    const modules=[['preview',typeof ZEHoverPreview==='undefined'?null:ZEHoverPreview],['tags',typeof ZETagVisibility==='undefined'?null:ZETagVisibility]];
    for(const [name,module] of modules){
     if(!module)continue;
     try{controllers.push(module.attach({Zotero,win}));states[name]={state:'ready'};}
     catch{states[name]={state:'unavailable'};Zotero.logError(new Error('ZE Reader '+(name==='preview'?'PDF 预览':'标签精简')+'接口不可用'));}
    }
   },
   releaseWindow(win){
    pins?.releaseWindow(win);
    for(const controller of enhancements.get(win)||[]){try{controller.dispose();}catch{Zotero.logError(new Error('ZE Reader 窗口资源清理失败'));}}
    enhancements.delete(win);ReadingColumns.releaseWindow(win);
   },
   status(){return {...states};},
   async stop(){
    if(!started)return;started=false;
    for(const win of [...enhancements.keys()])runtime.releaseWindow(win);
    pins?.dispose();pins=null;
    await ReadingColumns.stop();
    if(Zotero.ReadingRouteColumns===ReadingColumns)delete Zotero.ReadingRouteColumns;
   }
  };
  return runtime;
 }
};
