var ReadingColumns = (() => {
  const branches = {
    ZJI2ABHV:'01保密寻址', BJED65AU:'02访问控制', J74UBEJE:'03谓词匹配',
    L6AU695F:'04匿名凭证', '5BIMGTFI':'05盲签令牌', '4MSVVQJY':'06广播撤销',
    X6W3F7R7:'07高效签名', KMCWDIWI:'08可信通信', UR76MGUS:'09证据留存',
    S2HU58UX:'10系统溯源', K57JIGUF:'90证明工具', '2VEFCB7H':'91格密码'
  };
  function role(code,n) {
    switch(code) {
      case '01': return n<=5?'公钥加密基础':n===6?'主动攻击与CCA安全':n<=10?'身份加密与层级委派':'格加密平行分支';
      case '02': return n===1?'秘密共享前置':n<=5?'ABE构造主线':n<=8?'策略与授权方平行扩展':'标准模型与完全安全证明';
      case '03': return n===1?'定义与安全目标总览':n<=3?'谓词与内积加密':n<=5?'双系统与谓词编码工具':'双方匹配加密平行分支';
      case '04': return n===1?'承诺与共享前置':n===2?'假名与隐私动机':[3,6,13].includes(n)?'群签名分支':[4,5,8,9,10,11].includes(n)?'匿名凭证的签名构件':n===7?'限次匿名认证':n===12?'属性资格证明（ABS）':n===14?'匿名凭证撤销':'非交互证明工具';
      case '05': return n===1?'签名代数前置':n===2?'经典盲签名起读':[3,7].includes(n)?'限次匿名认证与令牌':'新盲签名方案平行比较';
      case '06': return n<=3?'广播加密与解密资格撤销':'凭证撤销与成员证明';
      case '07': return n<=2?'经典签名基础':n<=5?'短签名与聚合':n<=8?'在线离线签名与陷门哈希':n===9?'标准模型身份签名':n===10?'无配对短签名':'格签名平行分支';
      case '08': return n<=2?'密钥交换与认证模型基础':n===3?'短认证串与VRF认证':n===4?'策略合规安全消息':'抗颠覆与可组合密钥交换';
      case '09': return n<=2?'量子删除与可认证否认':n===3?'量子多副本安全专题':n===4?'量子原语关系选读':n===5?'短效证明与签名':'隐写签名';
      case '10': return n===1?'AI代理安全地图':n===2?'语言模型内容溯源':n===3?'签名泄露分析':'侧信道与跨实现攻击';
      case '90': return n===1?'证明方法论总览':n<=3?'加密安全与规约':n<=5?'共享与承诺':n<=8?'零知识与证明工具':n<=11?'标准模型与双系统':n===12?'功能加密安全定义':n<=14?'可组合性与博弈专题':'按需查阅教材';
      case '91': return n<=4?'格几何与LWE背景':n===5?'LWE原始加密与规约':n===6?'格陷门及签名/IBE':n===7?'最坏情形复杂性':n===10?'短向量算法专题':'按需查阅资料';
      default: return '';
    }
  }
  function display(tags,collectionKey) {
    const branch=branches[collectionKey];
    if(!branch) return {order:'',position:''};
    for(const tag of tags) {
      const m=/^阅读顺序-([^-]+)-(\d{2})-([^-]+)-(.+)$/.exec(typeof tag==='string'?tag:tag.tag);
      if(m && m[1]===branch) return {order:m[2],position:m[3]+' · '+role(branch.slice(0,2),Number(m[2]))};
    }
    return {order:'',position:''};
  }
  const READ_TAG='阅读状态-已读';
  const LAYOUT_PREF='extensions.zotero.readingRouteColumns.layoutVersion';
  const writes=new WeakMap();
  let keys=[], windows=new Map(), zotero=null, migrateLayout=false;
  function canMarkRead(item) {
    return !!item && !item.parentID && (item.isRegularItem?.() ||
      (item.isAttachment?.() && item.attachmentContentType==='application/pdf'));
  }
  function isRead(item) {
    return canMarkRead(item) && item.getTags().some(tag=>tag.tag===READ_TAG);
  }
  async function setRead(item,checked) {
    if(!canMarkRead(item)) throw new Error('只能标记论文或独立 PDF 的已读状态');
    const previous=writes.get(item) || Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const oldTag=item.getTags().find(tag=>tag.tag===READ_TAG);
      if(!!oldTag===checked) return;
      try {
        if(checked) item.addTag(READ_TAG,0);
        else item.removeTag(READ_TAG);
        await item.saveTx();
      } catch(error) {
        if(oldTag) item.addTag(READ_TAG,oldTag.type);
        else item.removeTag(READ_TAG);
        throw error;
      }
    });
    writes.set(item,task);
    try {await task;}
    finally {if(writes.get(item)===task) writes.delete(item);}
  }
  async function setOrder(item,collectionKey,input) {
    if(!canMarkRead(item)) throw new Error('只能为论文或独立 PDF 设置阅读顺序');
    const branch=branches[collectionKey];
    if(!branch) throw new Error('当前分类尚未配置阅读路线');
    const raw=typeof input==='string'?input.trim():'invalid';
    if(raw && (!/^\d{1,2}$/.test(raw)||Number(raw)<1||Number(raw)>99)) throw new Error('阅读顺序请输入 01–99，留空可清除');
    const order=raw?raw.padStart(2,'0'):'';
    const previous=writes.get(item)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const old=item.getTags().map(tag=>({...tag,match:/^阅读顺序-([^-]+)-(\d{2})-([^-]+)-(.+)$/.exec(tag.tag)})).filter(tag=>tag.match?.[1]===branch);
      const first=old[0]?.match;
      const title=String(item.getField?.('title')||item.key||'文献').replace(/[\r\n]+/g,' ').trim().slice(0,80)||'文献';
      const next=order?'阅读顺序-'+branch+'-'+order+'-'+(first?first[3]:'自定')+'-'+(first?first[4]:title):'';
      if((!next&&!old.length)||(old.length===1&&old[0].tag===next)) return;
      try {
        for(const tag of old)item.removeTag(tag.tag);
        if(next)item.addTag(next,0);
        await item.saveTx();
      } catch(error) {
        if(next)item.removeTag(next);
        for(const tag of old)item.addTag(tag.tag,tag.type);
        throw error;
      }
    });
    writes.set(item,task);
    try {await task;}
    finally {if(writes.get(item)===task)writes.delete(item);}
  }
  async function refreshWindows() {
    for(const win of windows.keys()) {
      try {if(!win.closed) await win.ZoteroPane?.itemsView?.refreshAndMaintainSelection();}
      catch(error) {zotero.logError(error);}
    }
  }
  function renderReadCell(index,data,column,isFirst,doc) {
    const span=doc.createElement('span');
    span.className='cell '+(column.className || '');
    const item=doc.defaultView.ZoteroPane?.itemsView?.getRow(index)?.ref;
    if(!canMarkRead(item)) return span;
    span.style.display='flex';
    span.style.alignItems='center';
    span.style.justifyContent='center';
    const checkbox=doc.createElementNS('http://www.w3.org/1999/xhtml','input');
    checkbox.type='checkbox';
    checkbox.checked=isRead(item);
    checkbox.setAttribute('aria-label','已读');
    const updateTitle=()=>{checkbox.title=checkbox.checked?'已读，点击取消':'标为已读';};
    updateTitle();
    for(const type of ['mousedown','click','dblclick']) {
      checkbox.addEventListener(type,event=>event.stopPropagation());
    }
    checkbox.addEventListener('keydown',event=>{
      if(event.key===' ' || event.key==='Enter') event.stopPropagation();
    });
    checkbox.addEventListener('change',async event=>{
      event.stopPropagation();
      const checked=checkbox.checked;
      checkbox.disabled=true;
      try {
        await setRead(item,checked);
        await refreshWindows();
      } catch(error) {
        zotero.logError(error);
        await refreshWindows();
        doc.defaultView.alert('已读状态未保存，请重试。\n'+String(error.message || error));
      } finally {
        checkbox.checked=isRead(item);
        checkbox.disabled=false;
        updateTitle();
      }
    });
    span.appendChild(checkbox);
    return span;
  }
  function selected(win) {
    try { return win.ZoteroPane.getSelectedCollection()?.key || ''; } catch {return '';}
  }
  function renderOrderCell(index,data,column,isFirst,doc) {
    const span=doc.createElement('span');span.className='cell '+(column.className||'');
    const win=doc.defaultView,item=win.ZoteroPane?.itemsView?.getRow(index)?.ref,collectionKey=selected(win);
    if(!canMarkRead(item)||!branches[collectionKey]){span.textContent=item?value(item,win).order:data;return span;}
    const input=doc.createElementNS('http://www.w3.org/1999/xhtml','input');
    input.type='text';input.maxLength=2;input.size=2;input.placeholder='—';input.setAttribute('inputmode','numeric');input.setAttribute('aria-label','阅读顺序');
    input.title='输入 01–99；Enter 或离开输入框保存，Esc 取消，留空清除';
    Object.assign(input.style,{width:'100%',minWidth:'0',boxSizing:'border-box',font:'inherit',color:'inherit',background:'transparent',border:'1px solid GrayText',borderRadius:'3px',textAlign:'center'});
    const restore=()=>{input.value=display(item.getTags(),collectionKey).order;};restore();
    const save=async()=>{
      if(input.disabled)return;
      if(input.value===display(item.getTags(),collectionKey).order)return;
      const draft=input.value;input.disabled=true;
      try {await setOrder(item,collectionKey,draft);await refreshWindows();}
      catch(error){zotero.logError(error);win.alert('阅读顺序未保存。\n'+String(error.message||error));}
      finally {restore();input.disabled=false;}
    };
    for(const type of ['mousedown','click','dblclick'])input.addEventListener(type,event=>event.stopPropagation());
    input.addEventListener('keydown',async event=>{
      event.stopPropagation();
      if(event.key==='Enter'){event.preventDefault();await save();}
      else if(event.key==='Escape'){event.preventDefault();restore();}
    });
    input.addEventListener('blur',save);span.appendChild(input);return span;
  }
  function value(item,win) {
    if(!item || item.parentID) return {order:'',position:'',read:''};
    return {...display(item.getTags(),selected(win)),read:canMarkRead(item)?(isRead(item)?'1':'0'):''};
  }
  async function setupWindow(win) {
    if(windows.has(win)) return;
    const state={last:null,busy:false,timer:null,configured:false};
    windows.set(win,state);
    const refresh=async()=>{
      if(win.closed) {win.clearInterval(state.timer);windows.delete(win);return;}
      const collection=selected(win), view=win.ZoteroPane?.itemsView;
      if(state.busy || !view || collection===state.last) return;
      state.busy=true;
      try {
        await view.refreshAndMaintainSelection();
        if(!state.configured) {
          if(migrateLayout) {
            for(const key of keys) {
              const cols=view._getColumns(),i=cols.findIndex(c=>c.dataKey===key);
              const hidden=key!==keys[0];
              if(i<0) throw new Error('等待已读列初始化');
              if(!!cols[i].hidden!==hidden) view.tree._columns.toggleHidden(i);
            }
            const i=view._getColumns().findIndex(c=>c.dataKey===keys[0]);
            view.tree._columns.setOrder(i,0);
            if(keys.slice(1).includes(view.getSortField())) {
              const title=view._getColumns().findIndex(c=>c.dataKey==='title');
              if(title>=0) view.toggleSort(title);
            }
            zotero.Prefs.set(LAYOUT_PREF,2,true);
            migrateLayout=false;
          }
          state.configured=true;
        }
        state.last=collection;
      } catch(e) {zotero.logError(e);} finally {state.busy=false;}
    };
    state.timer=win.setInterval(()=>{void refresh();},400);
    await refresh();
  }
  async function start(Zotero,pluginID='reading-route-columns@local.example') {
    zotero=Zotero;
    if(keys.length) return keys;
    migrateLayout=Zotero.Prefs.get(LAYOUT_PREF,true)!==2;
    for(const [name,label,width] of [['read','已读','60'],['order','阅读顺序','84'],['position','分支定位','240']]) {
      const key=await Zotero.ItemTreeManager.registerColumn({
        dataKey:name,label,pluginID,width,minWidth:60,enabledTreeIDs:['main'],
        zoteroPersist:['width','hidden','sortDirection'],
        dataProvider:item=>value(item,Zotero.getMainWindow())[name],
        renderCell:name==='read'?renderReadCell:name==='order'?renderOrderCell:(index,data,column,isFirst,doc)=>{
          const span=doc.createElement('span');
          span.className='cell '+(column.className || '');
          const item=doc.defaultView.ZoteroPane?.itemsView?.getRow(index)?.ref;
          span.textContent=item?value(item,doc.defaultView)[name]:data;
          span.title=span.textContent;
          return span;
        }
      });
      if(!key) throw new Error('Could not register '+label);
      keys.push(key);
    }
    for(const win of Zotero.getMainWindows()) await setupWindow(win);
    return keys;
  }
  function releaseWindow(win) {
    const state=windows.get(win);
    if(state) {try{win.clearInterval(state.timer);}catch{} windows.delete(win);}
  }
  async function stop() {
    for(const [win,state] of windows) {try{win.clearInterval(state.timer);}catch{}}
    windows.clear();
    for(const key of keys) await zotero.ItemTreeManager.unregisterColumn(key);
    keys=[];
  }
  return {display,isRead,setRead,setOrder,start,stop,setupWindow,releaseWindow};
})();
