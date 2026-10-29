import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch


class CommentProtectionTests(unittest.TestCase):
    def test_longer_local_comment_is_protected_ignoring_html_formatting(self):
        from annotation_conflicts import ensure_comment_not_shorter,LocalCommentConflict
        with self.assertRaises(LocalCommentConflict):
            ensure_comment_not_shorter('<p>本地已有更完整的理解与证明细节</p>','简短批注')
        ensure_comment_not_shorter('<b>本地</b>','网页补充了更多理解')
        ensure_comment_not_shorter('same','same')

    def test_conflict_retains_web_draft_and_other_items_can_still_sync(self):
        from annotation_conflicts import LocalCommentConflict
        from reader import queue_connection,queue_annotation,sync_all
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'cache.sqlite'
            with closing(queue_connection(path)) as con:
                con.execute('INSERT INTO pending_updates (annotation_key,attachment,comment,color) VALUES (?,?,?,?)',('12345678','ABCDEFGH','web draft','#ff6666'))
                con.commit()
            queue_annotation({'key':'ABCDEFGH','page':1,'text':'new','comment':'','position':{'pageIndex':0,'rects':[[1,2,3,4]]}},path)
            with patch('reader.native_annotation_write',side_effect=[LocalCommentConflict('local is longer'),{'key':'87654321'}]):
                result=sync_all(path)
            self.assertEqual(result['synced'],1)
            self.assertEqual(result['skipped'],1)
            self.assertEqual(result['remaining'],1)
            self.assertIsNone(result['error'])
            with closing(queue_connection(path)) as con:
                self.assertEqual(con.execute('SELECT comment,blocked FROM pending_updates').fetchone(),('web draft',1))
                self.assertEqual(json.loads(con.execute('SELECT payload FROM sync_failure_archive').fetchone()[0])['comment'],'web draft')
            with patch('reader.native_annotation_write') as write,patch('reader.cli') as cli:
                sync_all(path)
                write.assert_not_called();cli.assert_not_called()
