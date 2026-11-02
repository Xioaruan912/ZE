var readingScope;
function install() {}
async function startup({rootURI,id}) {
  await Zotero.initializationPromise;
  if(Zotero.ReadingRouteColumns) await Zotero.ReadingRouteColumns.stop();
  readingScope={};
  Services.scriptloader.loadSubScript(rootURI+'reading-columns.js',readingScope);
  Zotero.ReadingRouteColumns=readingScope.ReadingColumns;
  await Zotero.ReadingRouteColumns.start(Zotero,id);
}
function onMainWindowLoad({window}) {
  if(readingScope) void readingScope.ReadingColumns.setupWindow(window);
}
async function shutdown() {
  if(!readingScope) return;
  await readingScope.ReadingColumns.stop();
  if(Zotero.ReadingRouteColumns===readingScope.ReadingColumns) delete Zotero.ReadingRouteColumns;
  readingScope=null;
}
function uninstall() {}
