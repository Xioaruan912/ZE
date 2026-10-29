"""Fresh server-side reading positions, including migrations from page-only rows."""
import math
import sqlite3
import time
from contextlib import closing

def connection(path):
    con=sqlite3.connect(path,timeout=5)
    con.execute('CREATE TABLE IF NOT EXISTS progress (key TEXT PRIMARY KEY,page INTEGER NOT NULL)')
    columns={row[1] for row in con.execute('PRAGMA table_info(progress)')}
    for name,definition in [('fraction','REAL NOT NULL DEFAULT 0'),('x','REAL NOT NULL DEFAULT 0.5'),('zoom_mode',"TEXT NOT NULL DEFAULT 'width'"),('scale','REAL NOT NULL DEFAULT 1.25'),('updated','REAL NOT NULL DEFAULT 0'),('attachment',"TEXT NOT NULL DEFAULT ''"),('title',"TEXT NOT NULL DEFAULT ''")]:
        if name not in columns:
            try: con.execute('ALTER TABLE progress ADD COLUMN '+name+' '+definition)
            except sqlite3.OperationalError as error:
                if 'duplicate column' not in str(error): raise
    con.row_factory=sqlite3.Row
    return con

def get_progress(key,path):
    with closing(connection(path)) as con: row=con.execute('SELECT * FROM progress WHERE key=?',(key,)).fetchone()
    return dict(row) if row else {'key':key,'page':1,'fraction':0,'x':.5,'zoom_mode':'width','scale':1.25,'updated':0}

def list_progress(path):
    with closing(connection(path)) as con: return {row['key']:dict(row) for row in con.execute('SELECT * FROM progress')}

def save_progress(spec,path):
    import re
    if not isinstance(spec.get('key'),str) or not re.fullmatch('[A-Z0-9]{8}',spec['key']) or type(spec.get('page')) is not int or not 1<=spec['page']<=10000: raise ValueError('无效的阅读进度')
    values={name:spec.get(name,default) for name,default in [('fraction',0),('x',.5),('scale',1.25)]}
    for name,value in values.items():
        if type(value) not in (int,float) or not math.isfinite(value) or not (0<=value<=1 if name!='scale' else .15<=value<=4): raise ValueError('无效的阅读位置')
    mode=spec.get('zoom_mode','width')
    if mode not in ('width','page','manual'): raise ValueError('无效的缩放方式')
    attachment=spec.get('attachment','');title=spec.get('title','')
    if not isinstance(attachment,str) or (attachment and not re.fullmatch('[A-Z0-9]{8}',attachment)) or not isinstance(title,str) or len(title)>2000: raise ValueError('无效的论文信息')
    with closing(connection(path)) as con:
        con.execute('INSERT OR REPLACE INTO progress (key,page,fraction,x,zoom_mode,scale,updated,attachment,title) VALUES (?,?,?,?,?,?,?,?,?)',(spec['key'],spec['page'],values['fraction'],values['x'],mode,values['scale'],time.time(),attachment,title));con.commit()
