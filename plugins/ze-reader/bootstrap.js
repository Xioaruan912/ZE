var zeScope;
function install() {}
async function startup({id,rootURI}) {
 await Zotero.initializationPromise;
 zeScope={};
 for(const file of ['reading-columns.js','runtime.js']) Services.scriptloader.loadSubScript(rootURI+file,zeScope);
 zeScope.runtime=zeScope.ZERuntime.create({Zotero,id});
 await zeScope.runtime.start();
}
function onMainWindowLoad({window}) {if(zeScope)void zeScope.runtime.setupWindow(window);}
function onMainWindowUnload({window}) {zeScope?.runtime.releaseWindow(window);}
async function shutdown() {if(zeScope){await zeScope.runtime.stop();zeScope=null;}}
function uninstall() {}
