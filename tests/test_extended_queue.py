import json
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from reader import queue_connection,update_annotation,sync_all
from sync_protection import annotation_snapshot,SnapshotConflict

class ExtendedQueueTests(unittest.TestCase):
    def test_failed_create_keeps_the_first_attempt_baseline_for_recovery(self):
        from reader import queue_annotation
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'reader.sqlite';annotation_id=queue_annotation({'key':'ABCDEFGH','page':1,'text':'quote','comment':'first note','position':{'pageIndex':0,'rects':[[1,2,3,4]]}},path)
            with patch('reader.native_annotation_write',side_effect=ValueError('lost acknowledgement')):sync_all(path)
            update_annotation('ABCDEFGH',annotation_id,'later longer note','#ffd400',path=path)
            with closing(queue_connection(path)) as con:
                base=con.execute('SELECT base FROM pending').fetchone()[0]
                self.assertIsNotNone(base);self.assertEqual(json.loads(base)['comment'],'first note')
    def test_different_web_sessions_keep_both_drafts_and_pause_write(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'reader.sqlite';base=annotation_snapshot({'comment':'base'})
            update_annotation('ABCDEFGH','z:12345678','first draft','#ffd400',base=base,tags=['定义'],edit_token='web-one',path=path)
            update_annotation('ABCDEFGH','z:12345678','other draft','#ffd400',base=base,tags=['疑问'],edit_token='web-two',path=path)
            with closing(queue_connection(path)) as con:
                row=con.execute('SELECT blocked,conflict_details FROM pending_updates').fetchone()
                self.assertEqual(row[0],1);self.assertEqual(json.loads(row[1])['olderWeb']['comment'],'first draft')
                self.assertIsNotNone(con.execute('SELECT payload FROM sync_failure_archive').fetchone())
    def test_changed_deletion_is_blocked_and_other_items_continue(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'reader.sqlite'
            with closing(queue_connection(path)) as con:
                con.execute("INSERT INTO pending_deletions(annotation_key,attachment) VALUES ('12345678','ABCDEFGH')")
                con.execute("INSERT INTO pending_updates(annotation_key,attachment,comment,color) VALUES ('87654321','ABCDEFGH','web','#ffd400')");con.commit()
            with patch('reader.native_annotation_write',side_effect=[SnapshotConflict('changed',reason='delete_changed'),{'key':'87654321'}]):result=sync_all(path)
            self.assertEqual((result['synced'],result['skipped'],result['remaining']),(1,1,1))
