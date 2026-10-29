"""Short, direct loopback probes; no CLI subprocesses and no library writes."""
import json,threading,time,urllib.request

MESSAGE='需要开启这台电脑上的 Zotero；已打开的论文和网页批注草稿仍可使用。'
_lock=threading.Lock()
_cached=None
_checked=0

class ZoteroUnavailable(ValueError):pass

def open_local(path):
    return urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:23119'+path,timeout=1.5)

def probe_zotero():
    try:
        with open_local('/connector/ping') as response:
            if response.status!=200 or b'Zotero is running' not in response.read(4096):raise OSError('unexpected service')
    except Exception:return {'available':False,'reason':'not_running','message':MESSAGE}
    try:
        with open_local('/api/users/0/items?limit=1') as response:
            if response.status!=200 or not isinstance(json.loads(response.read(200000)),list):raise OSError('local API unavailable')
    except Exception:return {'available':False,'reason':'api_unavailable','message':'Zotero 已运行，但本机接口不可用，请检查 Zotero 本地 API 设置。'}
    return {'available':True,'reason':'ready','message':'已连接 Zotero'}

def zotero_status():
    global _cached,_checked
    with _lock:
        if _cached is None or time.monotonic()-_checked>3:
            _cached=probe_zotero();_checked=time.monotonic()
        return dict(_cached)

def require_zotero():
    state=zotero_status()
    if not state['available']:raise ZoteroUnavailable(state['message'])
