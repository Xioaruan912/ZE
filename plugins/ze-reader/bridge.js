var ZEBridge = {
 create({Zotero,store,adapter,pluginID}){
  const path='/paper-reader/translate';
  let endpoint=null,releaseDebug=null,base={state:'unavailable',message:'翻译桥接未启动'};
  function protectDebug(){
   const original=Zotero.debug;
   if(typeof original!=='function')throw Error('安全调试日志接口不可用');
   let tokenProvider=()=>store.getToken();
   const wrapper=function(message,...args){
    if(tokenProvider&&typeof message==='string'){
     try{
      message=message.replace(/("token"\s*:\s*")(?:\\.|[^"\\])*(?:"|$)/gi,'$1[REDACTED]"');
      const token=tokenProvider();
      if(token)for(const value of [...new Set([token,JSON.stringify(token).slice(1,-1)])].sort((a,b)=>b.length-a.length))message=message.split(value).join('[REDACTED]');
     }catch{message='[ZE Reader debug content redacted]';}
    }
    return original.call(this,message,...args);
   };
   Zotero.debug=wrapper;
   return ()=>{if(Zotero.debug===wrapper)Zotero.debug=original;tokenProvider=null;};
  }
  const json=(status,data)=>[status,'application/json',JSON.stringify(data)];
  const bridge={
   status(){
    if(base.state!=='ready')return {...base};
    if(Zotero.Server?.Endpoints?.[path]!==endpoint)return {state:'conflict',message:'翻译端点被其他扩展占用，请停用旧 Bridge 后重新启用 ZE Reader'};
    if(!store.getToken())return {state:'unconfigured',message:'请在 ZE Reader 设置中导入 bridge.token'};
    if(!Zotero.PDFTranslate?.api?.translate)return {state:'unavailable',message:'Translate for Zotero 尚未就绪'};
    return {state:'ready',message:'翻译桥接已就绪'};
   },
   async start(){
    if(endpoint)return bridge.status();
    if(await adapter.legacyBridgeEnabled()||Zotero.Server?.Endpoints?.[path]){
     base={state:'conflict',message:'请停用旧 Translate Bridge 后重新启用 ZE Reader'};return bridge.status();
    }
    if(!Zotero.Server?.Endpoints){base={state:'unavailable',message:'Zotero 本地服务不可用'};return bridge.status();}
    endpoint=function(){};
    endpoint.prototype={
     supportedMethods:['POST'],supportedDataTypes:['application/json'],
     async init(request){
      try{
       if(Object.keys(request.headers||{}).some(k=>k.toLowerCase()==='origin'))return json(403,{error:'请通过已认证的阅读器服务访问'});
       let body;try{body=typeof request.data==='string'?JSON.parse(request.data):request.data;}catch{return json(400,{error:'请求 JSON 无效'});}
       const token=store.getToken();
       if(!token)return json(503,{error:'ZE Reader 尚未配置翻译令牌'});
       if(!body||body.token!==token)return json(403,{error:'Unauthorized'});
       if(typeof body.text!=='string'||!body.text.trim()||body.text.length>800)return json(400,{error:'Invalid text'});
       if(!Zotero.PDFTranslate?.api?.translate)return json(503,{error:'Translate for Zotero 尚未就绪'});
       const translated=await Zotero.PDFTranslate.api.translate(body.text,{pluginID,service:'cnki',langfrom:'en',langto:'zh-CN'});
       if(translated?.status==='error'||typeof translated?.result!=='string'||!translated.result)return json(502,{error:'翻译服务未返回有效结果，请检查翻译插件设置'});
       return json(200,{text:translated.result});
      }catch{return json(502,{error:'翻译请求失败，请检查翻译插件和网络后重试'});}
     }
    };
    releaseDebug=protectDebug();
    Zotero.Server.Endpoints[path]=endpoint;base={state:'ready',message:'翻译桥接已注册'};return bridge.status();
   },
   stop(){if(endpoint&&Zotero.Server?.Endpoints?.[path]===endpoint)delete Zotero.Server.Endpoints[path];releaseDebug?.();releaseDebug=null;endpoint=null;base={state:'unavailable',message:'翻译桥接已停止'};},
   async testTranslation(){
    const state=bridge.status();if(state.state!=='ready')throw Error(state.message);
    const response=await new endpoint().init({data:{token:store.getToken(),text:'Hello world.'}});
    const data=JSON.parse(response[2]);if(response[0]!==200)throw Error(data.error);
    return data.text;
   }
  };
  return bridge;
 }
};
