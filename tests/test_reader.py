import unittest
from reader import valid_key, safe_page, validate_text

class ValidationTests(unittest.TestCase):
    def test_key_rejects_path_and_accepts_zotero_key(self):
        self.assertTrue(valid_key('U7UCUEJJ'))
        self.assertFalse(valid_key('../secret'))
    def test_page_must_be_positive_integer(self):
        self.assertTrue(safe_page(1))
        self.assertFalse(safe_page(0))
        self.assertFalse(safe_page(True))
    def test_text_is_bounded(self):
        self.assertTrue(validate_text('hello'))
        self.assertFalse(validate_text(''))
        self.assertFalse(validate_text('x' * 10001))

if __name__ == '__main__': unittest.main()

class AnnotationTests(unittest.TestCase):
    def test_reads_only_annotations_for_requested_attachment(self):
        import sqlite3, tempfile
        from pathlib import Path
        from reader import read_annotations
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'z.sqlite'; c=sqlite3.connect(p)
            c.executescript('CREATE TABLE items(itemID INTEGER,key TEXT); CREATE TABLE itemAnnotations(itemID INTEGER,parentItemID INTEGER,type INTEGER,text TEXT,comment TEXT,color TEXT,pageLabel TEXT,position TEXT);')
            c.execute('INSERT INTO items VALUES (1, ?)',('ABCDEFGH',)); c.execute('INSERT INTO items VALUES (2, ?)',('12345678',))
            c.execute('INSERT INTO itemAnnotations VALUES (2,1,1,?,?,?,?,?)',('quoted','note','#ffd400','1','{"pageIndex":0,"rects":[[1,2,3,4]]}')); c.commit(); c.close()
            result=read_annotations('ABCDEFGH',p)
            self.assertEqual(result[0]['text'],'quoted'); self.assertEqual(result[0]['position']['pageIndex'],0)
            self.assertEqual(read_annotations('87654321',p),[])

class QueueTests(unittest.TestCase):
    def test_pending_annotation_remains_visible_until_synced(self):
        import tempfile
        from pathlib import Path
        from reader import queue_annotation, pending_annotations
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'queue.sqlite'
            item={'key':'ABCDEFGH','page':2,'text':'a passage','comment':'note','position':{'pageIndex':1,'rects':[[1,2,3,4]]}}
            queue_annotation(item,p)
            saved=pending_annotations('ABCDEFGH',p)
            self.assertEqual(len(saved),1)
            self.assertEqual(saved[0]['text'],'a passage')
            self.assertEqual(saved[0]['position']['pageIndex'],1)
            self.assertEqual(pending_annotations('87654321',p),[])

class ColorTests(unittest.TestCase):
    def test_queue_preserves_chosen_color(self):
        import tempfile
        from pathlib import Path
        from reader import queue_annotation,pending_annotations
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cache.sqlite'
            queue_annotation({'key':'ABCDEFGH','page':1,'text':'highlight','comment':'','color':'#2ea8e5','position':{'pageIndex':0,'rects':[[1,2,3,4]]}},p)
            self.assertEqual(pending_annotations('ABCDEFGH',p)[0]['color'],'#2ea8e5')

class CnkiTests(unittest.TestCase):
    def test_cnki_encodes_text_compatibly_with_plugin(self):
        from reader import cnki_encode
        self.assertEqual(cnki_encode('Hello world'), 'o6lFoDA0PAqeFlRA72D96g==')

class PasswordTests(unittest.TestCase):
    def test_password_hash_verifies_correct_password_only(self):
        from reader import hash_password, verify_password
        hashed=hash_password('example-pass')
        self.assertTrue(verify_password('example-pass',hashed))
        self.assertFalse(verify_password('bad',hashed))
        self.assertNotIn('example-pass',hashed)

class TrustedDeviceTests(unittest.TestCase):
    def test_device_session_survives_reopen_and_can_be_revoked(self):
        import tempfile
        from pathlib import Path
        from reader import issue_session, session_valid, revoke_sessions
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'auth.sqlite'
            token=issue_session(path)
            self.assertTrue(session_valid(token,path))
            self.assertFalse(session_valid('wrong',path))
            revoke_sessions(path)
            self.assertFalse(session_valid(token,path))

class DeleteTests(unittest.TestCase):
    def test_delete_unwritten_highlight_removes_only_that_pending_item(self):
        import tempfile
        from pathlib import Path
        from reader import queue_annotation,pending_annotations,delete_annotation
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'one','comment':'','color':'#ffd400','position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            queue_annotation(item,p); queue_annotation({**item,'text':'two'},p)
            first=pending_annotations('ABCDEFGH',p)[0]
            delete_annotation('ABCDEFGH',first['id'],p)
            self.assertEqual([a['text'] for a in pending_annotations('ABCDEFGH',p)],['two'])

class DeleteSavedTests(unittest.TestCase):
    def test_deleting_saved_mark_queues_it_and_leaves_other_marks(self):
        import tempfile,sqlite3
        from contextlib import closing
        from pathlib import Path
        from reader import delete_annotation,queue_connection
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cache.sqlite'
            delete_annotation('ABCDEFGH','z:12345678',p)
            with closing(queue_connection(p)) as c:
                self.assertEqual(c.execute('select annotation_key,attachment from pending_deletions').fetchall(), [('12345678','ABCDEFGH')])

class TranslationProviderTests(unittest.TestCase):
    def test_google_response_extracts_multiple_segments(self):
        from reader import parse_google_translation
        self.assertEqual(parse_google_translation([[['你好','Hello'],['世界','world']]]),'你好世界')
    def test_microsoft_response_extracts_translated_text(self):
        from reader import parse_microsoft_translation
        self.assertEqual(parse_microsoft_translation([{'translations':[{'text':'你好'}]}]),'你好')

class ManualSyncTests(unittest.TestCase):
    def test_sync_drains_queue_and_preserves_failed_item(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from reader import queue_annotation, pending_annotations, sync_all
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'one','comment':'','position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            queue_annotation(item,p); queue_annotation({**item,'text':'two'},p)
            with patch('reader.native_annotation_write', side_effect=[{'key':'12345678'}, ValueError('offline')]):
                result=sync_all(p)
            self.assertEqual(result['synced'],1)
            self.assertEqual(result['remaining'],1)
            self.assertIn('offline',result['error'])
            self.assertEqual(pending_annotations('ABCDEFGH',p)[0]['text'],'two')

class ReadingPlanTests(unittest.TestCase):
    def test_plan_uses_exact_tags_and_order(self):
        from unittest.mock import patch
        from reader import reading_plan, PLAN_TAGS
        def fake(*args):
            tag=args[3]
            return {'items':[{'key':'ABCDEFGH','title':'paper','tags':[tag]}, {'key':'OTHERKEY','tags':[tag+'extra']}]}
        with patch('reader.cli',side_effect=fake):
            plan=reading_plan()
        self.assertEqual([step['tag'] for step in plan],list(PLAN_TAGS))
        self.assertTrue(all([item['key'] for item in step['items']]==['ABCDEFGH'] for step in plan))

class FailedSyncArchiveTests(unittest.TestCase):
    def test_failed_item_is_archived_even_if_removed_from_queue(self):
        import tempfile, sqlite3, json
        from contextlib import closing
        from pathlib import Path
        from unittest.mock import patch
        from reader import queue_annotation, sync_all, delete_annotation
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'important','comment':'note','position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            item_id=queue_annotation(item,p)
            with patch('reader.native_annotation_write',side_effect=ValueError('offline')): sync_all(p)
            delete_annotation('ABCDEFGH',item_id,p)
            with closing(sqlite3.connect(p)) as c:
                snapshot=json.loads(c.execute('select payload from sync_failure_archive').fetchone()[0])
            self.assertEqual(snapshot['text'],'important')
            self.assertEqual(snapshot['comment'],'note')

class QueueIdentityTests(unittest.TestCase):
    def test_removed_queue_id_is_never_reused_by_a_new_annotation(self):
        import tempfile
        from pathlib import Path
        from reader import queue_annotation, delete_annotation, pending_annotations
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'old','comment':'','position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            old_id=queue_annotation(item,path)
            delete_annotation('ABCDEFGH',old_id,path)
            new_id=queue_annotation({**item,'text':'new'},path)
            self.assertNotEqual(old_id,new_id)
            # Retrying a delete after a lost acknowledgement is harmless.
            delete_annotation('ABCDEFGH',old_id,path)
            self.assertEqual(pending_annotations('ABCDEFGH',path)[0]['text'],'new')

class UnderlineQueueTests(unittest.TestCase):
    def test_underline_type_and_exact_geometry_are_kept_for_sync(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from reader import queue_annotation,pending_annotations,sync_all
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'selected','comment':'note','color':'#ff6666','type':'underline','position':{'pageIndex':0,'rects':[[1,2,3,4]]}}
            queue_annotation(item,path)
            self.assertEqual(pending_annotations('ABCDEFGH',path)[0]['type'],'underline')
            with patch('reader.native_annotation_write',return_value={'key':'12345678'}) as write:
                self.assertEqual(sync_all(path)['synced'],1)
            payload=write.call_args.args[0]
            self.assertEqual(payload['type'],'underline')
            self.assertEqual(payload['position'],item['position'])
