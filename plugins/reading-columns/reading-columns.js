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
  let keys=[], windows=new Map(), zotero=null;
  function selected(win) {
    try { return win.ZoteroPane.getSelectedCollection()?.key || ''; } catch {return '';}
  }
  function value(item,win) {
    if(!item || item.parentID) return {order:'',position:''};
    return display(item.getTags(),selected(win));
  }
  async function setupWindow(win) {
    if(windows.has(win)) return;
    const state={last:null,busy:false,timer:null,configured:false};
    windows.set(win,state);
    const refresh=async()=>{
      const collection=selected(win), view=win.ZoteroPane?.itemsView;
      if(state.busy || !view || collection===state.last) return;
      state.busy=true;
      try {
        await view.refreshAndMaintainSelection();
        if(branches[collection]) {
          for(const key of keys) {
            const cols=view._getColumns(),i=cols.findIndex(c=>c.dataKey===key);
            if(i>=0 && cols[i].hidden) view.tree._columns.toggleHidden(i);
          }
          if(!state.configured) {
            let cols=view._getColumns();
            let i=cols.findIndex(c=>c.dataKey===keys[0]);
            if(i>=0) view.tree._columns.setOrder(i,0);
            cols=view._getColumns();
            i=cols.findIndex(c=>c.dataKey===keys[1]);
            if(i>=0) view.tree._columns.setOrder(i,2);
            state.configured=true;
          }
          if(view.getSortField()!==keys[0]) {
            const i=view._getColumns().findIndex(c=>c.dataKey===keys[0]);
            if(i>=0) view.toggleSort(i);
          }
          if(view.getSortDirection()===-1) {
            const i=view._getColumns().findIndex(c=>c.dataKey===keys[0]);
            if(i>=0) view.toggleSort(i);
          }
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
    for(const [name,label,width] of [['order','阅读顺序','84'],['position','分支定位','240']]) {
      const key=await Zotero.ItemTreeManager.registerColumn({
        dataKey:name,label,pluginID,width,minWidth:60,enabledTreeIDs:['main'],
        zoteroPersist:['width','hidden','sortDirection'],
        dataProvider:item=>value(item,Zotero.getMainWindow())[name],
        renderCell:(index,data,column,isFirst,doc)=>{
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
  async function stop() {
    for(const [win,state] of windows) {try{win.clearInterval(state.timer);}catch{}}
    windows.clear();
    for(const key of keys) await zotero.ItemTreeManager.unregisterColumn(key);
    keys=[];
  }
  return {display,start,stop,setupWindow};
})();
