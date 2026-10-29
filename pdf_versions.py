"""Fresh attachment hashes. No PDF bytes are cached here."""
import hashlib
import sqlite3
import time
from contextlib import closing
from sync_protection import SnapshotConflict

class PdfChangedError(SnapshotConflict):
    def __init__(self,status):
        super().__init__('PDF 已变化，标注草稿已保留，请核对位置后再同步',local=status,reason='pdf_changed')

def connection(db):
    con=sqlite3.connect(db,timeout=10)
    con.execute('CREATE TABLE IF NOT EXISTS pdf_sources (attachment TEXT PRIMARY KEY,revision TEXT NOT NULL,previous TEXT,reviewed TEXT NOT NULL,size INTEGER NOT NULL,modified REAL NOT NULL)')
    return con

def pdf_status(key,path,db):
    # Hash file contents every time: size and timestamps alone can miss a replacement.
    with path.open('rb') as file:
        revision=hashlib.file_digest(file,'sha256').hexdigest()
    stat=path.stat()
    with closing(connection(db)) as con:
        con.execute('BEGIN IMMEDIATE')
        row=con.execute('SELECT revision,previous,reviewed FROM pdf_sources WHERE attachment=?',(key,)).fetchone()
        previous=row[1] if row else None;reviewed=row[2] if row else revision
        if row and row[0]!=revision:previous=row[0]
        con.execute('INSERT OR REPLACE INTO pdf_sources VALUES (?,?,?,?,?,?)',(key,revision,previous,reviewed,stat.st_size,stat.st_mtime));con.commit()
    return {'revision':revision,'previousRevision':previous,'reviewedRevision':reviewed,'needsReview':reviewed!=revision,'size':stat.st_size,'modified':stat.st_mtime}

def review_pdf(key,revision,path,db):
    status=pdf_status(key,path,db)
    if status['revision']!=revision:raise PdfChangedError(status)
    with closing(connection(db)) as con:
        con.execute('UPDATE pdf_sources SET reviewed=? WHERE attachment=? AND revision=?',(revision,key,revision));con.commit()
    return {**status,'reviewedRevision':revision,'needsReview':False}

def ensure_pdf_revision(key,revision,path,db):
    status=pdf_status(key,path,db)
    if status['needsReview'] or (revision and revision!=status['revision']):raise PdfChangedError(status)
    return status
