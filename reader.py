import base64, hashlib, hmac, json, os, re, secrets, sqlite3, subprocess, threading, time, urllib.parse, urllib.request
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from annotation_geometry import validate_ink_position
from annotation_conflicts import LocalCommentConflict
from sync_protection import annotation_snapshot,tag_names,SnapshotConflict
from pdf_versions import pdf_status,review_pdf,ensure_pdf_revision,PdfChangedError
from reading_state import get_progress,save_progress,list_progress
from zotero_status import zotero_status,require_zotero,ZoteroUnavailable
from ze_runtime import load_environment,resolve_cli,resolve_write_python

BASE = Path(__file__).resolve().parent
load_environment(BASE)
CLI = resolve_cli(BASE)
DB = Path(os.environ.get('PAPER_READER_DB',str(BASE/'reader-data.sqlite')))
LOCK = threading.Lock()
SYNC_LOCK = threading.RLock()
LAST_ACTIVITY = time.time()
PASSWORD_FILE = BASE/'password.hash'
LOGIN_FAILURES = []
AUTH_LOCK = threading.Lock()

def build_asset(url,base=None):
    if url=='/assets/ZE-LICENSES.txt':
        file=Path(base or BASE)/'static/build/ZE-LICENSES.txt'
        if file.is_file():return file,'text/plain; charset=utf-8'
        return None
    match=re.fullmatch(r'/assets/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(js|css|svg|woff2))',url)
    if not match:return None
    folder=(Path(base or BASE)/'static/build').resolve();file=folder/match.group(1)
    if not file.is_file() or file.resolve().parent!=folder:return None
    mime={'js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8','svg':'image/svg+xml','woff2':'font/woff2'}[match.group(2)]
    return file,mime

def pdf_worker_source():
    try:
        manifest=json.loads((BASE/'static/build/manifest.json').read_text(encoding='utf-8'))
        asset=build_asset(manifest.get('pdfWorker',''))
        if asset and asset[1].startswith('text/javascript'):return asset[0]
    except (OSError,ValueError,TypeError):pass
    return BASE/'node_modules/pdfjs-dist/build/pdf.worker.mjs'

def hash_password(password):
    salt=secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),salt,300000)
    return 'pbkdf2_sha256$300000$'+salt.hex()+'$'+digest.hex()

def verify_password(password, record):
    try:
        algorithm,iterations,salt,expected=record.strip().split('$')
        if algorithm!='pbkdf2_sha256' or int(iterations)!=300000: return False
        actual=hashlib.pbkdf2_hmac('sha256',password.encode('utf-8'),bytes.fromhex(salt),int(iterations))
        return hmac.compare_digest(actual,bytes.fromhex(expected))
    except (ValueError,TypeError,AttributeError): return False

def issue_session(path=None):
    path=path or DB
    token=secrets.token_urlsafe(32)
    digest=hashlib.sha256(token.encode('ascii')).hexdigest()
    with closing(queue_connection(path)) as con:
        con.execute('INSERT INTO trusted_sessions (token_hash,created) VALUES (?,?)',(digest,time.time())); con.commit()
    return token

def session_valid(token,path=None):
    path=path or DB
    if not isinstance(token,str) or len(token)>100: return False
    digest=hashlib.sha256(token.encode('utf-8')).hexdigest()
    with closing(queue_connection(path)) as con:
        return con.execute('SELECT 1 FROM trusted_sessions WHERE token_hash=?',(digest,)).fetchone() is not None

def revoke_sessions(path=None):
    path=path or DB
    with closing(queue_connection(path)) as con:
        con.execute('DELETE FROM trusted_sessions'); con.commit()

def valid_key(value): return isinstance(value,str) and bool(re.fullmatch(r'[A-Z0-9]{8}',value))
def safe_page(value): return type(value) is int and 1 <= value <= 100000
def validate_text(value): return isinstance(value,str) and 0 < len(value.strip()) <= 10000

def parse_google_translation(result):
    try:
        text=''.join(segment[0] for segment in result[0] if segment and isinstance(segment[0],str))
        if text: return text
    except (TypeError,IndexError,KeyError): pass
    raise ValueError('Google 未返回译文')

def parse_microsoft_translation(result):
    try:
        text=result[0]['translations'][0]['text']
        if isinstance(text,str) and text: return text
    except (TypeError,IndexError,KeyError): pass
    raise ValueError('微软翻译未返回译文')

def translate_google(text):
    query=urllib.parse.urlencode({'client':'gtx','sl':'auto','tl':'zh-CN','dt':'t','q':text})
    try:
        with urllib.request.urlopen('https://translate.googleapis.com/translate_a/single?'+query,timeout=20) as response:
            return parse_google_translation(json.load(response))
    except ValueError: raise
    except Exception as error: raise ValueError('无法连接 Google 翻译，请检查网络') from error

def translate_microsoft(text):
    url='https://edge.microsoft.com/translate/translatetext?from=en&to=zh-Hans&isEnterpriseClient=false'
    headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36 Edg/113.0.1774.42'}
    request=urllib.request.Request(url,data=json.dumps([text]).encode('utf-8'),headers=headers,method='POST')
    try:
        with urllib.request.urlopen(request,timeout=20) as response: return parse_microsoft_translation(json.load(response))
    except ValueError: raise
    except Exception as error: raise ValueError('无法连接微软翻译，请检查网络') from error

def cnki_encode(text):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding
    padder = padding.PKCS7(128).padder()
    data = padder.update(text.encode('utf-8')) + padder.finalize()
    cipher = Cipher(algorithms.AES(b'4e87183cfd3a45fe'), modes.ECB()).encryptor()
    return base64.b64encode(cipher.update(data) + cipher.finalize()).decode('ascii').replace('/', '_').replace('+', '-')

def translate_cnki(text):
    require_zotero()
    bridge_token=BASE/'bridge.token'
    if bridge_token.is_file():
        body=json.dumps({'text':text,'token':bridge_token.read_text(encoding='utf-8').strip()}).encode('utf-8')
        request=urllib.request.Request('http://127.0.0.1:23119/paper-reader/translate',data=body,headers={'Content-Type':'application/json'},method='POST')
        try:
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(request,timeout=30) as response:
                bridged=json.load(response)
            if isinstance(bridged.get('text'),str) and bridged['text']: return bridged['text']
            raise ValueError('Zotero 翻译插件未返回译文')
        except urllib.error.HTTPError as error:
            if error.code != 404:
                try: detail=json.loads(error.read().decode('utf-8')).get('error')
                except Exception: detail=None
                finally: error.close()
                raise ValueError(str(detail or 'Zotero 翻译桥接请求失败')[:500]) from error
            error.close()
        except urllib.error.URLError:
            pass
    base='https://dict.cnki.net/fyzs-front-api/'
    headers={'User-Agent':'Mozilla/5.0','Referer':'https://dict.cnki.net/','Origin':'https://dict.cnki.net'}
    try:
        with urllib.request.urlopen(urllib.request.Request(base+'getToken',headers=headers),timeout=15) as response:
            token_response=json.load(response)
        token=token_response.get('data')
        if token_response.get('code') != 200 or not isinstance(token,str): raise ValueError('无法获取 CNKI 翻译令牌')
        payload=json.dumps({'words':cnki_encode(text),'translateType':None}).encode('utf-8')
        headers.update({'Content-Type':'application/json;charset=UTF-8','Token':token})
        with urllib.request.urlopen(urllib.request.Request(base+'translate/literaltranslation',data=payload,headers=headers),timeout=20) as response:
            result=json.load(response)
        data=result.get('data') or {}
        if data.get('isInputVerificationCode'): raise ValueError('CNKI 要求人工验证，请在 dict.cnki.net 完成验证后重试')
        translated=data.get('mResult')
        if not isinstance(translated,str) or not translated: raise ValueError('CNKI 未返回译文')
        return translated
    except ValueError: raise
    except Exception as error: raise ValueError('CNKI 连接中断，请检查网络或稍后重试') from error

def cli(*args):
    require_zotero()
    env = os.environ.copy(); env['PYTHONIOENCODING'] = 'utf-8'
    p = subprocess.run([str(CLI),'--json',*map(str,args)], capture_output=True, text=True, encoding='utf-8', errors='replace', env=env, timeout=45)
    try: result=json.loads(p.stdout)
    except json.JSONDecodeError: raise ValueError((p.stderr or 'Zotero CLI returned an invalid response')[:500])
    if p.returncode or not result.get('ok'): raise ValueError(str(result.get('error') or p.stderr or 'Zotero operation failed')[:500])
    return result.get('data')

PLAN_TAGS=(
    '阅读顺序-01-基础-IBE', '阅读顺序-02-基础-FuzzyIBE',
    '阅读顺序-03-核心-KPABE', '阅读顺序-04-核心-CPABE2007',
    '阅读顺序-05-核心-CPABE2011', '阅读顺序-06-扩展-DualPolicyABE',
    '阅读顺序-07-证明-DualSystem', '阅读顺序-08-证明-FullySecureFE',
    '阅读顺序-09-扩展-DecentralizingABE', '阅读顺序-10-框架-PredicateEncodings',
    '阅读顺序-11-综合-MatchmakingEncryption',
)
def reading_plan():
    def find(tag):
        result=cli('search','--mode','tag',tag,'--limit','100')
        return {'tag':tag,'items':[item for item in result.get('items',[]) if tag in item.get('tags',[])]}
    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(find,PLAN_TAGS))

def pdf_path(key):
    if not valid_key(key): raise ValueError('无效的附件编号')
    data=cli('path',key); match=re.search(r'- Local path: `([^`]+)`',data.get('text',''))
    if not match: raise ValueError('该附件没有可读取的本地文件')
    path=Path(match.group(1))
    if path.suffix.lower() != '.pdf' or not path.is_file(): raise ValueError('本地 PDF 不存在')
    return path

def read_annotations(key, database=None):
    if not valid_key(key): raise ValueError('无效的附件编号')
    database = Path(database or os.environ.get('ZOTERO_DATABASE', Path.home()/'Zotero/zotero.sqlite'))
    uri = database.resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True, timeout=0.2)) as con:
        con.row_factory = sqlite3.Row
        version='ai.version' if 'version' in {r[1] for r in con.execute('PRAGMA table_info(items)')} else '0'
        rows=con.execute('SELECT ai.key AS annotation_key,a.type,a.text,a.comment,a.color,a.pageLabel,a.position,'+version+' AS version FROM itemAnnotations a JOIN items i ON i.itemID=a.parentItemID JOIN items ai ON ai.itemID=a.itemID WHERE i.key=?',(key,)).fetchall()
        tags={}
        if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='itemTags'").fetchone():
            for tag in con.execute('SELECT ai.key,t.name FROM itemTags it JOIN tags t ON t.tagID=it.tagID JOIN items ai ON ai.itemID=it.itemID JOIN itemAnnotations a ON a.itemID=ai.itemID JOIN items p ON p.itemID=a.parentItemID WHERE p.key=?',(key,)):tags.setdefault(tag[0],[]).append(tag[1])

    result=[]
    for row in rows:
        item=dict(row)
        native_key=item.pop('annotation_key');item['id']='z:'+native_key;item['tags']=tags.get(native_key,[])
        try: item['position']=json.loads(item['position'])
        except (ValueError,TypeError): continue
        result.append(item)
    return result

def annotations_for(key):
    try:
        return read_annotations(key)
    except sqlite3.OperationalError:
        entries = cli('annotations', 'list', '--item-key', key, '--limit', '1000')
        keys = [x.get('annotation_key') for x in entries if valid_key(x.get('annotation_key'))]
        result = []
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for start in range(0, len(keys), 50):
            query = urllib.parse.urlencode({'itemKey': ','.join(keys[start:start+50])})
            with opener.open('http://127.0.0.1:23119/api/users/0/items?' + query, timeout=15) as response:
                for row in json.load(response):
                    data = row.get('data', {})
                    try: position = json.loads(data.get('annotationPosition', '{}'))
                    except (ValueError, TypeError): continue
                    result.append({'id':'z:'+data.get('key',''),'version':data.get('version',0),'tags':tag_names(data.get('tags',[])), 'type': data.get('annotationType'), 'text': data.get('annotationText', ''), 'comment': data.get('annotationComment', ''), 'color': data.get('annotationColor', '#ffd400'), 'pageLabel': data.get('annotationPageLabel', ''), 'position': position})
        return result

def queue_connection(path=None):
    path=path or DB
    con = sqlite3.connect(path, timeout=5)
    con.execute("CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY, attachment TEXT, page INTEGER, text TEXT, comment TEXT, position TEXT, last_error TEXT, color TEXT DEFAULT '#ffd400')")
    if 'color' not in [row[1] for row in con.execute('PRAGMA table_info(pending)')]:
        try: con.execute("ALTER TABLE pending ADD COLUMN color TEXT DEFAULT '#ffd400'")
        except sqlite3.OperationalError as error:
            if 'duplicate column' not in str(error): raise
    if 'annotation_type' not in [row[1] for row in con.execute('PRAGMA table_info(pending)')]:
        try: con.execute("ALTER TABLE pending ADD COLUMN annotation_type TEXT DEFAULT 'highlight'")
        except sqlite3.OperationalError as error:
            if 'duplicate column' not in str(error): raise
    con.execute('CREATE TABLE IF NOT EXISTS translations (id INTEGER PRIMARY KEY, attachment TEXT, page INTEGER, text TEXT, x REAL, y REAL)')
    con.execute('CREATE TABLE IF NOT EXISTS reading_plan_done (tag TEXT PRIMARY KEY)')
    con.execute('CREATE TABLE IF NOT EXISTS trusted_sessions (token_hash TEXT PRIMARY KEY, created REAL NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS pending_deletions (annotation_key TEXT PRIMARY KEY, attachment TEXT NOT NULL, last_error TEXT)')
    con.execute('CREATE TABLE IF NOT EXISTS pending_updates (annotation_key TEXT PRIMARY KEY, attachment TEXT NOT NULL, comment TEXT NOT NULL, color TEXT NOT NULL, last_error TEXT)')
    if 'blocked' not in [row[1] for row in con.execute('PRAGMA table_info(pending_updates)')]:
        try: con.execute('ALTER TABLE pending_updates ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0')
        except sqlite3.OperationalError as error:
            if 'duplicate column' not in str(error): raise
    con.execute('CREATE TABLE IF NOT EXISTS sync_failure_archive (kind TEXT NOT NULL, item_key TEXT NOT NULL, payload TEXT NOT NULL, error TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(kind,item_key))')
    con.execute('CREATE TABLE IF NOT EXISTS queue_sequence (name TEXT PRIMARY KEY, value INTEGER NOT NULL)')
    if 'annotation_type' not in [row[1] for row in con.execute('PRAGMA table_info(pending_updates)')]:
        try: con.execute('ALTER TABLE pending_updates ADD COLUMN annotation_type TEXT')
        except sqlite3.OperationalError as error:
            if 'duplicate column' not in str(error): raise
    con.execute('CREATE TABLE IF NOT EXISTS sync_map (pending_id INTEGER PRIMARY KEY, annotation_key TEXT NOT NULL, attachment TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS annotation_receipts (client_id TEXT PRIMARY KEY, attachment TEXT NOT NULL, pending_id INTEGER NOT NULL)')
    if 'annotation_key' not in [row[1] for row in con.execute('PRAGMA table_info(pending)')]:
        try: con.execute('ALTER TABLE pending ADD COLUMN annotation_key TEXT')
        except sqlite3.OperationalError as error:
            if 'duplicate column' not in str(error): raise
    for table in ('pending','pending_updates','pending_deletions'):
        columns={row[1] for row in con.execute('PRAGMA table_info('+table+')')}
        fields={'blocked':'INTEGER NOT NULL DEFAULT 0','base':'TEXT','pdf_revision':'TEXT','conflict_details':'TEXT','tags':'TEXT','edit_token':'TEXT'}
        for name,definition in fields.items():
            if name not in columns:
                try:con.execute('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition)
                except sqlite3.OperationalError as error:
                    if 'duplicate column' not in str(error):raise
    con.execute('CREATE TABLE IF NOT EXISTS annotation_pdf (attachment TEXT NOT NULL,annotation_key TEXT NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(attachment,annotation_key))')
    return con

def queue_annotation(item, path=None):
    path=path or DB
    with closing(queue_connection(path)) as con:
        # Never recycle a pending ID: another device can still hold an older
        # p: ID after that item was synced or deleted. Allocate atomically.
        con.execute('BEGIN IMMEDIATE')
        client_id=item.get('client_id')
        if client_id:
            receipt=con.execute('SELECT attachment,pending_id FROM annotation_receipts WHERE client_id=?',(client_id,)).fetchone()
            if receipt:
                if receipt[0]!=item['key']: raise ValueError('标注请求编号重复')
                return 'p:'+str(receipt[1])
        previous=con.execute("SELECT value FROM queue_sequence WHERE name='annotation'").fetchone()
        largest=con.execute('SELECT MAX(value) FROM (SELECT MAX(id) AS value FROM pending UNION ALL SELECT MAX(pending_id) AS value FROM sync_map)').fetchone()[0] or 0
        annotation_id=max(int(time.time()*1000),(previous[0]+1) if previous else 1,largest+1)
        con.execute("INSERT OR REPLACE INTO queue_sequence VALUES ('annotation',?)",(annotation_id,))
        con.execute('INSERT INTO pending (id,attachment,page,text,comment,position,color,annotation_type) VALUES (?,?,?,?,?,?,?,?)', (annotation_id,item['key'], item['page'], item['text'], item['comment'], json.dumps(item['position']), item.get('color', '#ffd400'),item.get('type','highlight')))
        con.execute('UPDATE pending SET tags=?,pdf_revision=? WHERE id=?',(json.dumps(tag_names(item.get('tags',[])),ensure_ascii=False),item.get('pdf_revision'),annotation_id))
        if client_id: con.execute('INSERT INTO annotation_receipts VALUES (?,?,?)',(client_id,item['key'],annotation_id))
        con.commit()
        return 'p:'+str(annotation_id)

def pending_annotations(key, path=None):
    path=path or DB
    with closing(queue_connection(path)) as con:
        con.row_factory=sqlite3.Row
        rows=con.execute('SELECT * FROM pending WHERE attachment=?',(key,)).fetchall()
    return [{'text':r['text'],'comment':r['comment'],'position':json.loads(r['position']),'color':r['color'],'pending':True,'error':r['last_error'],'id':'p:'+str(r['id']),'type':r['annotation_type'],'tags':json.loads(r['tags'] or '[]'),'pdfRevision':r['pdf_revision'],'conflict':bool(r['blocked']),'conflictDetails':json.loads(r['conflict_details'] or 'null')} for r in rows]

def resolve_annotation(con, attachment, annotation_id):
    if annotation_id.startswith('p:') and annotation_id[2:].isdigit():
        pending_id=int(annotation_id[2:])
        row=con.execute('SELECT id FROM pending WHERE id=? AND attachment=?',(pending_id,attachment)).fetchone()
        if row: return ('pending',pending_id)
        row=con.execute('SELECT annotation_key FROM sync_map WHERE pending_id=? AND attachment=?',(pending_id,attachment)).fetchone()
        if row: return ('saved',row[0])
    if annotation_id.startswith('z:') and valid_key(annotation_id[2:]): return ('saved',annotation_id[2:])
    raise ValueError('找不到该标注')

def archive_entry(con,kind,key,payload,error):
    archive_key=str(key) if kind in ('create','update','delete') else str(key)+'@'+str(time.time_ns())
    con.execute('INSERT OR REPLACE INTO sync_failure_archive VALUES (?,?,?,?,?)',(kind,archive_key,json.dumps(payload,ensure_ascii=False),str(error)[:500],time.time()))

def delete_annotation(attachment, annotation_id, path=None, base=None, pdf_revision=None):
    path=path or DB
    with SYNC_LOCK, closing(queue_connection(path)) as con:
        try:kind,key=resolve_annotation(con,attachment,annotation_id)
        except ValueError:
            if annotation_id.startswith('p:') and annotation_id[2:].isdigit():return
            raise
        if kind=='pending':con.execute('DELETE FROM pending WHERE id=?',(key,))
        else:
            con.row_factory=sqlite3.Row
            old=con.execute('SELECT * FROM pending_updates WHERE annotation_key=?',(key,)).fetchone()
            if old and old['attachment']!=attachment:raise ValueError('标注不属于当前附件')
            if old:archive_entry(con,'update-before-delete',key,dict(old),'网页请求删除前保留编辑草稿')
            con.execute('DELETE FROM pending_updates WHERE annotation_key=?',(key,))
            con.execute('INSERT OR REPLACE INTO pending_deletions (annotation_key,attachment,base,pdf_revision) VALUES (?,?,?,?)',(key,attachment,json.dumps(base) if base else None,pdf_revision))
        con.commit()

def update_annotation(attachment, annotation_id, comment, color, annotation_type=None, base=None,tags=None,pdf_revision=None,edit_token=None,resolve=False,path=None):
    with SYNC_LOCK, closing(queue_connection(path or DB)) as con:
        kind,key=resolve_annotation(con,attachment,annotation_id)
        if kind=='pending':
            con.execute('UPDATE pending SET comment=?,color=?,annotation_type=COALESCE(?,annotation_type),tags=COALESCE(?,tags),pdf_revision=COALESCE(?,pdf_revision) WHERE id=?',(comment,color,annotation_type,json.dumps(tags,ensure_ascii=False) if tags is not None else None,pdf_revision,key))
        else:
            con.row_factory=sqlite3.Row
            previous=con.execute('SELECT * FROM pending_updates WHERE annotation_key=?',(key,)).fetchone()
            if previous and previous['attachment']!=attachment:raise ValueError('标注不属于当前附件')
            blocked=0;details=None
            if previous and previous['edit_token'] and edit_token!=previous['edit_token'] and not resolve:
                archive_entry(con,'other-web-draft',key,dict(previous),'另一阅读会话提交了不同草稿')
                if previous['comment']!=comment or previous['color']!=color or (tags is not None and json.loads(previous['tags'] or '[]')!=tags):
                    blocked=1;details={'reason':'web_concurrent','olderWeb':{'comment':previous['comment'],'color':previous['color'],'tags':json.loads(previous['tags'] or '[]')},'web':{'comment':comment,'color':color,'tags':tags},'base':base}
            if previous and not base:base=json.loads(previous['base'] or 'null')
            con.execute('INSERT OR REPLACE INTO pending_updates (annotation_key,attachment,comment,color,annotation_type,base,tags,pdf_revision,edit_token,blocked,conflict_details) VALUES (?,?,?,?,?,?,?,?,?,?,?)',(key,attachment,comment,color,annotation_type,json.dumps(base) if base else None,json.dumps(tags,ensure_ascii=False) if tags is not None else None,pdf_revision,edit_token,blocked,json.dumps(details,ensure_ascii=False) if details else None))
        con.commit()

def native_annotation_write(payload):
    if payload.get('key'):
        path=pdf_path(payload['key']);status=ensure_pdf_revision(payload['key'],payload.get('pdf_revision'),path,DB)
        payload={**payload,'path':str(path),'pdf_revision':status['revision']}
    runtime=resolve_write_python(BASE)
    env=os.environ.copy();env['PYTHONIOENCODING']='utf-8'
    result=subprocess.run([str(runtime),str(BASE/'zotero_annotation_write.py')],input=json.dumps(payload,ensure_ascii=False),capture_output=True,text=True,encoding='utf-8',env=env,timeout=45)
    try: data=json.loads(result.stdout)
    except ValueError: raise ValueError('Zotero 本地写入失败，标注仍保存在缓存中')
    if data.get('conflict')=='snapshot':
        error=SnapshotConflict(data.get('error'));error.details=data.get('details') or {};raise error
    if data.get('conflict')=='local_comment_longer': raise LocalCommentConflict(data.get('error'))
    if result.returncode or not data.get('ok'): raise ValueError(data.get('error') or 'Zotero 未确认写入成功')
    return data

def sync_one(path=None, only_if_idle=False):
    path=path or DB
    with SYNC_LOCK:
        if only_if_idle and time.time()-LAST_ACTIVITY<60:return False,None
        with closing(queue_connection(path)) as con:
            con.row_factory=sqlite3.Row
            selection=None
            for table,column,kind in [('pending_deletions','annotation_key','delete'),('pending_updates','annotation_key','update'),('pending','id','create')]:
                row=con.execute('SELECT * FROM '+table+' WHERE blocked=0 ORDER BY '+column+' LIMIT 1').fetchone()
                if row:selection=(table,column,kind,dict(row));break
            if not selection:return False,None
            table,column,kind,row=selection;key=row[column]
            if kind=='create' and not row['annotation_key']:
                row['annotation_key']=''.join(secrets.choice('23456789ABCDEFGHIJKLMNPQRSTUVWXYZ') for _ in range(8))
                con.execute('UPDATE pending SET annotation_key=? WHERE id=?',(row['annotation_key'],key));con.commit()
            if kind=='create' and not row['base']:
                row['base']=json.dumps(annotation_snapshot({'text':row['text'],'position':json.loads(row['position']),'comment':row['comment'],'color':row['color'],'type':row['annotation_type'],'tags':json.loads(row['tags'] or '[]')}),ensure_ascii=False)
                con.execute('UPDATE pending SET base=? WHERE id=?',(row['base'],key));con.commit()
        try:
            payload={'key':row['attachment'],'pdf_revision':row['pdf_revision'],'base':json.loads(row['base'] or 'null')}
            if kind=='create':payload.update(annotation_key=row['annotation_key'],page=row['page'],text=row['text'],position=json.loads(row['position']))
            else:payload.update(operation=kind,id=key)
            if kind!='delete':
                payload.update(comment=row['comment'],color=row['color'],type=row['annotation_type'] or ('highlight' if kind=='create' else None))
                if row['tags'] is not None:payload['tags']=json.loads(row['tags'])
            native=native_annotation_write(payload)
            with closing(queue_connection(path)) as con:
                if kind=='create':
                    native_key=native.get('key')
                    if not valid_key(native_key):raise ValueError('Zotero 未确认标注编号，队列保留')
                    con.execute('INSERT OR REPLACE INTO sync_map VALUES (?,?,?)',(key,native_key,row['attachment']))
                    if row['pdf_revision']:con.execute('INSERT OR REPLACE INTO annotation_pdf VALUES (?,?,?)',(row['attachment'],native_key,row['pdf_revision']))
                con.execute('DELETE FROM '+table+' WHERE '+column+'=?',(key,));con.commit()
        except Exception as error:
            details=getattr(error,'details',None)
            with closing(queue_connection(path)) as con:
                archive_entry(con,kind,key,row,error)
                con.execute('UPDATE '+table+' SET last_error=?,blocked=?,conflict_details=? WHERE '+column+'=?',(str(error)[:500],int(isinstance(error,LocalCommentConflict)),json.dumps(details,ensure_ascii=False) if details else None,key));con.commit()
            if isinstance(error,LocalCommentConflict):return False,None
            return False,str(error)[:500]
        return True,None

def sync_all(path=None):
    path=path or DB
    synced=0
    while True:
        done,error=sync_one(path)
        if error:break
        if done:synced+=1;continue
        with closing(queue_connection(path)) as con:active=sum(con.execute('SELECT COUNT(*) FROM '+table+' WHERE blocked=0').fetchone()[0] for table in ('pending','pending_updates','pending_deletions'))
        if not active:break
    with closing(queue_connection(path)) as con:
        remaining=sum(con.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ('pending','pending_updates','pending_deletions'))
        skipped=sum(con.execute('SELECT COUNT(*) FROM '+table+' WHERE blocked=1').fetchone()[0] for table in ('pending','pending_updates','pending_deletions'))
    return {'synced':synced,'remaining':remaining,'skipped':skipped,'error':error}

def sync_worker():
    while True:
        time.sleep(10)
        if time.time() - LAST_ACTIVITY < 60: continue
        if not zotero_status()['available']: continue
        _,error=sync_one(only_if_idle=True)
        if error: time.sleep(60)

def annotation_view(key):
    saved=annotations_for(key)
    with closing(queue_connection()) as con:
        con.row_factory=sqlite3.Row
        deletes={r['annotation_key']:dict(r) for r in con.execute('SELECT * FROM pending_deletions WHERE attachment=?',(key,))}
        updates={r['annotation_key']:dict(r) for r in con.execute('SELECT * FROM pending_updates WHERE attachment=?',(key,))}
        aliases={r['annotation_key']:'p:'+str(r['pending_id']) for r in con.execute('SELECT pending_id,annotation_key FROM sync_map WHERE attachment=?',(key,))}
        revisions={r['annotation_key']:r['revision'] for r in con.execute('SELECT * FROM annotation_pdf WHERE attachment=?',(key,))}
        try:source=con.execute('SELECT revision,reviewed FROM pdf_sources WHERE attachment=?',(key,)).fetchone()
        except sqlite3.OperationalError:source=None
        result=[]
        for annotation in saved:
            native_key=annotation['id'][2:];deletion=deletes.get(native_key)
            if deletion and not deletion['blocked']:continue
            annotation['base']=annotation_snapshot(annotation)
            if native_key in aliases:annotation['aliases']=[aliases[native_key]]
            revision=revisions.get(native_key) or (source['reviewed'] if source else None)
            if revision and native_key not in revisions:con.execute('INSERT OR IGNORE INTO annotation_pdf VALUES (?,?,?)',(key,native_key,revision))
            annotation['pdfRevision']=revision
            annotation['needsPdfReview']=bool(source and revision and revision!=source['revision'])
            change=updates.get(native_key) or deletion
            if change and change['blocked']:
                annotation.update(conflict=True,webDraftComment=change.get('comment',''),error=change['last_error'],conflictDetails=json.loads(change['conflict_details'] or 'null'),conflictKind='delete' if deletion else 'update')
            elif change:
                annotation.update(comment=change['comment'],color=change['color'],pending=True,error=change['last_error'])
                if change['annotation_type']:annotation['type']=change['annotation_type']
                if change['tags'] is not None:annotation['tags']=json.loads(change['tags'])
                annotation['base']=json.loads(change['base'] or 'null')
            result.append(annotation)
        con.commit()
    pending=pending_annotations(key)
    for annotation in pending:
        annotation['needsPdfReview']=bool(source and annotation.get('pdfRevision') and annotation['pdfRevision']!=source['revision'])
    return result+pending

def db():
    con=sqlite3.connect(DB); con.execute('CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY, page INTEGER NOT NULL)'); return con

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
    def send_bytes(self, data, mime, code=200, cookie=None):
        self.send_response(code); self.send_header('Content-Type',mime); self.send_header('Content-Length',str(len(data))); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Cache-Control','no-store'); self.send_header('Referrer-Policy','no-referrer')
        if cookie: self.send_header('Set-Cookie',cookie)
        self.end_headers(); self.wfile.write(data)
    def json(self, data, code=200): self.send_bytes(json.dumps(data,ensure_ascii=False).encode(),'application/json; charset=utf-8',code)
    def authenticated(self):
        cookie=SimpleCookie()
        try: cookie.load(self.headers.get('Cookie','')); token=cookie['reader_session'].value
        except Exception: return False
        return session_valid(token)
    def do_GET(self):
        try:
            u=urllib.parse.urlparse(self.path); q=urllib.parse.parse_qs(u.query); path=u.path
            cosmetic=build_asset(path)
            if cosmetic:
                file,mime=cosmetic
                return self.send_bytes(file.read_bytes(),mime)
            if path=='/zotero-bridge-updates.json':
                return self.json({'addons':{'paper-reader-bridge@local.example':{'updates':[]}}})
            if not self.authenticated():
                if path=='/': return self.send_bytes((BASE/'static/login.html').read_bytes(),'text/html; charset=utf-8')
                return self.json({'error':'请先登录'},401)
            if path=='/api/zotero-status': return self.json(zotero_status())
            if path=='/pdf.worker.mjs':return self.send_bytes(pdf_worker_source().read_bytes(),'text/javascript; charset=utf-8')
            if path=='/api/reading-plan-status':
                with closing(queue_connection()) as con: done=[row[0] for row in con.execute('SELECT tag FROM reading_plan_done')]
                return self.json({'done':done,'progress':list_progress(DB)})
            if path=='/api/reading-plan':
                plan=reading_plan()
                with closing(queue_connection()) as con: done={row[0] for row in con.execute('SELECT tag FROM reading_plan_done')}
                return self.json({'steps':[{**step,'done':step['tag'] in done} for step in plan]})
            if path=='/api/collections': return self.json(cli('get','collections'))
            if path=='/api/items':
                coll=q.get('collection',[''])[0]
                if coll and not valid_key(coll): raise ValueError('无效的分类编号')
                return self.json(cli('get','collection-items',coll,'--limit','1000') if coll else cli('get','recent','--limit','1000'))
            if path=='/api/children':
                key=q.get('key',[''])[0]
                if not valid_key(key): raise ValueError('无效的论文编号')
                return self.json(cli('get','children',key))
            if path=='/api/annotations':
                key=q.get('key',[''])[0]
                if not valid_key(key):raise ValueError('无效的附件编号')
                return self.json(annotation_view(key))
            if path=='/api/pdf-status':
                key=q.get('key',[''])[0]
                return self.json(pdf_status(key,pdf_path(key),DB))
            if path=='/api/progress':
                key=q.get('key',[''])[0]
                if not valid_key(key): raise ValueError('无效的论文编号')
                with LOCK: progress=get_progress(key,DB)
                return self.json(progress)
            if path=='/api/translations':
                key=q.get('key',[''])[0]
                if not valid_key(key): raise ValueError('无效的附件编号')
                with closing(queue_connection()) as con:
                    rows=con.execute('SELECT id,page,text,x,y FROM translations WHERE attachment=?',(key,)).fetchall()
                return self.json([{'id':r[0],'page':r[1],'text':r[2],'x':r[3],'y':r[4]} for r in rows])
            if path=='/api/pdf':
                key=q.get('key',[''])[0];p=pdf_path(key);content=p.read_bytes();revision=hashlib.sha256(content).hexdigest()
                expected=q.get('revision',[''])[0]
                if expected and expected!=revision:return self.json({'error':'PDF 在打开期间已变化，请重新打开'},409)
                return self.send_bytes(content,'application/pdf')
            files={'/ink-geometry.mjs':('static/ink-geometry.mjs','text/javascript; charset=utf-8'),'/pencil-tools.mjs':('static/pencil-tools.mjs','text/javascript; charset=utf-8'),'/library-sidebar.mjs':('static/library-sidebar.mjs','text/javascript; charset=utf-8'),'/highlight-geometry.mjs':('static/highlight-geometry.mjs','text/javascript; charset=utf-8'),'/text-order.mjs':('static/text-order.mjs','text/javascript; charset=utf-8'),'/zotero-availability.mjs':('static/zotero-availability.mjs','text/javascript; charset=utf-8'),'/reading-tabs.mjs':('static/reading-tabs.mjs','text/javascript; charset=utf-8'),'/pdf-navigation.mjs':('static/pdf-navigation.mjs','text/javascript; charset=utf-8'),'/reader-extras.mjs':('static/reader-extras.mjs','text/javascript; charset=utf-8'),'/reader-extras.css':('static/reader-extras.css','text/css; charset=utf-8'),'/reading-tools.css':('static/reading-tools.css','text/css; charset=utf-8'),'/reading-view.mjs':('static/reading-view.mjs','text/javascript; charset=utf-8'),'/metadata-cache.mjs':('static/metadata-cache.mjs','text/javascript; charset=utf-8'),'/annotation-writer.mjs':('static/annotation-writer.mjs','text/javascript; charset=utf-8'),'/popovers.css':('static/popovers.css','text/css; charset=utf-8'),'/':('static/index.html','text/html; charset=utf-8'),'/app.js':('static/app.js','text/javascript; charset=utf-8'),'/tree.mjs':('static/tree.mjs','text/javascript; charset=utf-8'),'/geometry.mjs':('static/geometry.mjs','text/javascript; charset=utf-8'),'/selection-input.mjs':('static/selection-input.mjs','text/javascript; charset=utf-8'),'/style.css':('static/style.css','text/css; charset=utf-8'),'/viewer.css':('node_modules/pdfjs-dist/web/pdf_viewer.css','text/css; charset=utf-8'),'/pdf.mjs':('node_modules/pdfjs-dist/build/pdf.mjs','text/javascript; charset=utf-8'),'/pdf.worker.mjs':('node_modules/pdfjs-dist/build/pdf.worker.mjs','text/javascript; charset=utf-8')}
            if path in files:
                f,mime=files[path]; return self.send_bytes((BASE/f).read_bytes(),mime)
            self.json({'error':'Not found'},404)
        except ZoteroUnavailable as e: self.json({'error':str(e),'code':'zotero_unavailable'},503)
        except Exception as e: self.json({'error':str(e)},500)
    def do_POST(self):
        global LAST_ACTIVITY
        try:
            origin=self.headers.get('Origin')
            if origin and urllib.parse.urlparse(origin).netloc.lower() != self.headers.get('Host','').lower(): raise ValueError('请求来源不匹配')
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>30000: raise ValueError('请求内容不正确')
            obj=json.loads(self.rfile.read(length)); path=urllib.parse.urlparse(self.path).path
            if path=='/api/login':
                now=time.time(); password=obj.get('password')
                with AUTH_LOCK:
                    LOGIN_FAILURES[:]=[stamp for stamp in LOGIN_FAILURES if stamp>now-300]
                    if len(LOGIN_FAILURES)>=10: return self.json({'error':'尝试次数过多，请五分钟后重试'},429)
                    ok=isinstance(password,str) and len(password)<=256 and PASSWORD_FILE.is_file() and verify_password(password,PASSWORD_FILE.read_text(encoding='utf-8'))
                    if not ok: LOGIN_FAILURES.append(now); return self.json({'error':'口令不正确'},401)
                    LOGIN_FAILURES.clear(); token=issue_session()
                cookie='reader_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=315360000'
                if self.headers.get('X-Forwarded-Proto','').lower()=='https': cookie+='; Secure'
                return self.send_bytes(b'{"ok":true}','application/json; charset=utf-8',cookie=cookie)
            if not self.authenticated(): return self.json({'error':'请先登录'},401)
            LAST_ACTIVITY = time.time()
            if path=='/api/reading-plan':
                tag=obj.get('tag'); done=obj.get('done')
                if tag not in PLAN_TAGS or type(done) is not bool: raise ValueError('无效的阅读计划')
                with closing(queue_connection()) as con:
                    if done: con.execute('INSERT OR IGNORE INTO reading_plan_done VALUES (?)',(tag,))
                    else: con.execute('DELETE FROM reading_plan_done WHERE tag=?',(tag,))
                    con.commit()
                return self.json({'ok':True})
            if path=='/api/activity': return self.json({'ok':True})
            if path=='/api/sync':
                require_zotero()
                return self.json(sync_all())
            if path=='/api/translation-note':
                key=obj.get('key'); page=obj.get('page'); value=obj.get('text'); x=obj.get('x'); y=obj.get('y')
                if not valid_key(key) or not safe_page(page) or not validate_text(value) or type(x) not in (int,float) or type(y) not in (int,float) or not 0<=x<=1 or not 0<=y<=1: raise ValueError('译文位置不正确')
                with closing(queue_connection()) as con:
                    cursor=con.execute('INSERT INTO translations (attachment,page,text,x,y) VALUES (?,?,?,?,?)',(key,page,value,x,y)); con.commit()
                    return self.json({'id':cursor.lastrowid})
            if path=='/api/translation-delete':
                note_id=obj.get('id')
                if type(note_id) is not int or note_id<1: raise ValueError('无效的译文编号')
                with closing(queue_connection()) as con: con.execute('DELETE FROM translations WHERE id=?',(note_id,)); con.commit()
                return self.json({'ok':True})
            if path=='/api/progress':
                key=obj.get('key'); page=obj.get('page')
                if not valid_key(key) or not safe_page(page): raise ValueError('无效的阅读进度')
                with LOCK: save_progress(obj,DB)
                return self.json({'ok':True})
            if path=='/api/pdf-review':
                key=obj.get('key');return self.json(review_pdf(key,obj.get('revision'),pdf_path(key),DB))
            if path=='/api/annotation-pdf-review':
                key=obj.get('key');revision=obj.get('revision');status=ensure_pdf_revision(key,revision,pdf_path(key),DB)
                with SYNC_LOCK,closing(queue_connection()) as con:
                    kind,annotation_id=resolve_annotation(con,key,obj.get('id',''))
                    if kind=='pending':con.execute('UPDATE pending SET pdf_revision=?,blocked=0,last_error=NULL,conflict_details=NULL WHERE id=?',(status['revision'],annotation_id))
                    else:
                        con.execute('INSERT OR REPLACE INTO annotation_pdf VALUES (?,?,?)',(key,annotation_id,status['revision']))
                        for table in ('pending_updates','pending_deletions'):
                            con.execute('UPDATE '+table+' SET pdf_revision=?,blocked=CASE WHEN conflict_details LIKE ? THEN 0 ELSE blocked END,last_error=CASE WHEN conflict_details LIKE ? THEN NULL ELSE last_error END WHERE annotation_key=?',(status['revision'],'%pdf_changed%','%pdf_changed%',annotation_id))
                    con.commit()
                return self.json({'ok':True})
            if path=='/api/annotation-conflict':
                key=obj.get('key')
                if not valid_key(key):raise ValueError('无效的附件编号')
                if obj.get('resolution')!='keep_local':raise ValueError('无效的冲突处理方式')
                with SYNC_LOCK,closing(queue_connection()) as con:
                    kind,annotation_id=resolve_annotation(con,key,obj.get('id',''))
                    if kind!='saved':raise ValueError('该标注尚未写入 Zotero')
                    con.row_factory=sqlite3.Row
                    for table in ('pending_updates','pending_deletions'):
                        row=con.execute('SELECT * FROM '+table+' WHERE annotation_key=? AND attachment=?',(annotation_id,key)).fetchone()
                        if row:archive_entry(con,'resolved-'+table,annotation_id,dict(row),'保留本地内容，原网页草稿留档')
                        con.execute('DELETE FROM '+table+' WHERE annotation_key=? AND attachment=?',(annotation_id,key))
                    con.commit()
                return self.json({'ok':True})
            if path=='/api/annotation':
                key=obj.get('key'); page=obj.get('page'); content=obj.get('text',''); comment=obj.get('comment',''); annotation_type=obj.get('type','highlight')
                if not valid_key(key) or not safe_page(page) or not (isinstance(content,str) and len(content)<=10000 if annotation_type=='ink' else validate_text(content)) or not isinstance(comment,str) or len(comment)>3000: raise ValueError('标注内容不正确')
                color=obj.get('color','#ffd400')
                if color not in ('#ffd400','#ff6666','#5fb236','#2ea8e5','#a28ae5','#e56eee','#f19837','#aaaaaa','#000000'): raise ValueError('无效的标注颜色')
                annotation_type=obj.get('type','highlight')
                if annotation_type not in ('highlight','underline','ink'): raise ValueError('无效的标注类型')
                position=obj.get('position')
                if annotation_type=='ink':position=validate_ink_position(position,page)
                elif not isinstance(position,dict) or position.get('pageIndex') != page-1 or not isinstance(position.get('rects'),list) or not position['rects']: raise ValueError('无效的标注位置')
                client_id=obj.get('client_id')
                if client_id is not None and (not isinstance(client_id,str) or not re.fullmatch(r'[A-Za-z0-9:_-]{8,160}',client_id)): raise ValueError('无效的标注请求编号')
                annotation_id=queue_annotation({'key':key,'page':page,'text':content,'comment':comment,'position':position,'color':color,'type':annotation_type,'client_id':client_id,'tags':tag_names(obj.get('tags',[])),'pdf_revision':obj.get('pdf_revision')})
                return self.json({'ok':True,'pending':True,'id':annotation_id})
            if path in ('/api/annotation-delete','/api/annotation-update'):
                key=obj.get('key'); annotation_id=obj.get('id')
                if not valid_key(key) or not isinstance(annotation_id,str): raise ValueError('无效的标注编号')
                if path=='/api/annotation-delete': delete_annotation(key,annotation_id,base=obj.get('base'),pdf_revision=obj.get('pdf_revision'))
                else:
                    comment=obj.get('comment',''); color=obj.get('color')
                    if not isinstance(comment,str) or len(comment)>3000 or color not in ('#ffd400','#ff6666','#5fb236','#2ea8e5','#a28ae5','#e56eee','#f19837','#aaaaaa','#000000'): raise ValueError('标注内容不正确')
                    annotation_type=obj.get('type')
                    if annotation_type is not None and annotation_type not in ('highlight','underline','ink'): raise ValueError('无效的标注类型')
                    update_annotation(key,annotation_id,comment,color,annotation_type,base=obj.get('base'),tags=tag_names(obj['tags']) if 'tags' in obj else None,pdf_revision=obj.get('pdf_revision'),edit_token=obj.get('edit_token'),resolve=obj.get('resolve') is True)
                return self.json({'ok':True})
            if path=='/api/translate':
                content=obj.get('text')
                if not validate_text(content) or len(content)>800: raise ValueError('请选择不超过 800 个字符的文字')
                service=obj.get('service','cnki')
                providers={'cnki':translate_cnki,'google':translate_google,'microsoft':translate_microsoft}
                if service not in providers: raise ValueError('未知的翻译服务')
                return self.json({'text':providers[service](content),'service':service})
            self.json({'error':'Not found'},404)
        except ZoteroUnavailable as e: self.json({'error':str(e),'code':'zotero_unavailable'},503)
        except Exception as e: self.json({'error':str(e)},400)

if __name__=='__main__':
    port=int(os.environ.get('PAPER_READER_PORT','8765'))
    print(f'ZE: http://127.0.0.1:{port}',flush=True)
    threading.Thread(target=sync_worker, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
