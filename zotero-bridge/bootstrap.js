var bridgePath = '/paper-reader/translate';
function install() {}
async function startup() {
  await Zotero.initializationPromise;
  const endpoint = function() {};
  endpoint.prototype = {
    supportedMethods: ['POST'],
    supportedDataTypes: ['application/json'],
    async init(request) {
      try {
        const origin = Object.entries(request.headers || {}).find(([name]) => name.toLowerCase() === 'origin');
        if (origin) return [403, 'application/json', JSON.stringify({error:'Use the authenticated reader server'})];
        const body = typeof request.data === 'string' ? JSON.parse(request.data) : request.data;
        if (!body || body.token !== '__BRIDGE_TOKEN__') return [403, 'application/json', JSON.stringify({error:'Unauthorized'})];
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 800) return [400, 'application/json', JSON.stringify({error:'Invalid text'})];
        if (!Zotero.PDFTranslate?.api?.translate) return [503, 'application/json', JSON.stringify({error:'Translate for Zotero 尚未就绪'})];
        const translated = await Zotero.PDFTranslate.api.translate(body.text, {pluginID:'paper-reader-bridge@local.example', service:'cnki',langfrom:'en',langto:'zh-CN'});
        if (!translated.result || translated.status === 'error') return [502, 'application/json', JSON.stringify({error:String(translated.error || 'CNKI 翻译未返回结果')})];
        return [200, 'application/json', JSON.stringify({text:translated.result})];
      } catch (error) { return [502, 'application/json', JSON.stringify({error:String(error)})]; }
    }
  };
  Zotero.Server.Endpoints[bridgePath] = endpoint;
}
function shutdown() { if (Zotero.Server?.Endpoints) delete Zotero.Server.Endpoints[bridgePath]; }
function uninstall() {}
