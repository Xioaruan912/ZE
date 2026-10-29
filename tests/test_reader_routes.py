import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from contextlib import ExitStack,closing
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import reader

class ReaderRouteTests(unittest.TestCase):
    def test_zotero_offline_rejects_native_actions_but_keeps_durable_drafts(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            db=Path(directory)/'reader.sqlite'
            stack.enter_context(patch.object(reader,'DB',db));stack.enter_context(patch.object(reader.Handler,'authenticated',return_value=True))
            stack.enter_context(patch.object(reader,'zotero_status',return_value={'available':False,'message':'需要开启 Zotero'}))
            stack.enter_context(patch.object(reader,'require_zotero',side_effect=reader.ZoteroUnavailable('需要开启 Zotero')))
            server=ThreadingHTTPServer(('127.0.0.1',0),reader.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(server.server_port)
            def request(path,data=None):
                req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
                try:
                    with urllib.request.urlopen(req,timeout=4) as response:return response.status,json.load(response)
                except urllib.error.HTTPError as error:
                    try:return error.code,json.load(error)
                    finally:error.close()
            try:
                self.assertFalse(request('/api/zotero-status')[1]['available'])
                for path,data in [('/api/items',None),('/api/sync',{}),('/api/translate',{'text':'Hello','service':'cnki'})]:
                    code,body=request(path,data);self.assertEqual(code,503);self.assertEqual(body['code'],'zotero_unavailable')
                code,body=request('/api/annotation',{'key':'ABCDEFGH','page':1,'text':'offline quote','comment':'durable comment','position':{'pageIndex':0,'rects':[[1,2,3,4]]},'client_id':'offline-test'})
                self.assertEqual(code,200);self.assertEqual(reader.pending_annotations('ABCDEFGH',db)[0]['comment'],'durable comment')
                with patch.object(reader,'translate_google',return_value='你好'):
                    self.assertEqual(request('/api/translate',{'text':'Hello','service':'google'})[1]['text'],'你好')
            finally:server.shutdown();server.server_close();thread.join()

    def test_pdf_reviews_tags_conflict_archive_and_revision_bound_pdf_reads(self):
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            db=Path(directory)/'reader.sqlite';pdf=Path(directory)/'paper.pdf';pdf.write_bytes(b'%PDF-1.4 original')
            saved={'id':'z:12345678','version':3,'text':'quote','comment':'local','color':'#ffd400','type':'highlight','tags':['定义'],'position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            stack.enter_context(patch.object(reader,'DB',db));stack.enter_context(patch.object(reader,'pdf_path',return_value=pdf));stack.enter_context(patch.object(reader,'annotations_for',side_effect=lambda key:[dict(saved)]));stack.enter_context(patch.object(reader.Handler,'authenticated',return_value=True))
            server=ThreadingHTTPServer(('127.0.0.1',0),reader.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(server.server_port)
            def request(path,data=None):
                req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
                try:
                    with urllib.request.urlopen(req,timeout=4) as response:return json.load(response)
                except urllib.error.HTTPError as error:
                    error.add_note(error.read().decode());error.close();raise
            try:
                status=request('/api/pdf-status?key=ABCDEFGH');notes=request('/api/annotations?key=ABCDEFGH');snapshot=notes[0]['base'];self.assertEqual(snapshot['tags'],['定义'])
                pending=request('/api/annotation',{'key':'ABCDEFGH','page':1,'text':'new','comment':'draft','position':saved['position'],'tags':['疑问'],'pdf_revision':status['revision']})
                request('/api/annotation-update',{'key':'ABCDEFGH','id':'z:12345678','comment':'local with web addition','color':'#ffd400','tags':['定义','疑问'],'base':snapshot,'pdf_revision':status['revision']})
                self.assertEqual(request('/api/annotations?key=ABCDEFGH')[0]['tags'],['定义','疑问'])
                pdf.write_bytes(b'%PDF-1.4 changed!');changed=request('/api/pdf-status?key=ABCDEFGH');self.assertTrue(changed['needsReview'])
                with self.assertRaises(urllib.error.HTTPError):request('/api/pdf?key=ABCDEFGH&revision='+status['revision'])
                request('/api/pdf-review',{'key':'ABCDEFGH','revision':changed['revision']})
                request('/api/annotation-pdf-review',{'key':'ABCDEFGH','id':pending['id'],'revision':changed['revision']})
                request('/api/annotation-pdf-review',{'key':'ABCDEFGH','id':'z:12345678','revision':changed['revision']})
                request('/api/annotation-conflict',{'key':'ABCDEFGH','id':'z:12345678','resolution':'keep_local'})
                with closing(reader.queue_connection(db)) as con:
                    self.assertEqual(con.execute('SELECT COUNT(*) FROM pending_updates').fetchone()[0],0)
                    self.assertEqual(json.loads(con.execute('SELECT payload FROM sync_failure_archive').fetchone()[0])['comment'],'local with web addition')
            finally:server.shutdown();server.server_close();thread.join()
