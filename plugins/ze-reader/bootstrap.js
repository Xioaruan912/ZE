var zeScope;
function install() {}
async function startup({id,rootURI}) {
 await Zotero.initializationPromise;
 zeScope={};
 for(const file of ['reading-columns.js','hover-preview.js','tag-visibility.js','pins.js','runtime.js']) Services.scriptloader.loadSubScript(rootURI+file,zeScope);
 const cloneInto=typeof Components==='undefined'?undefined:(value,win)=>Components.utils.cloneInto(value,win,{wrapReflectors:true});
 zeScope.runtime=zeScope.ZERuntime.create({Zotero,id,cloneInto});
 await zeScope.runtime.start();
}
function onMainWindowLoad({window}) {if(zeScope)void zeScope.runtime.setupWindow(window);}
function onMainWindowUnload({window}) {zeScope?.runtime.releaseWindow(window);}
async function shutdown() {if(zeScope){await zeScope.runtime.stop();zeScope=null;}}
function uninstall() {}
