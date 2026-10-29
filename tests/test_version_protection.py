import tempfile
import unittest
from pathlib import Path
from sync_protection import annotation_snapshot, merge_annotation, check_deletion, SnapshotConflict
from pdf_versions import pdf_status, review_pdf, ensure_pdf_revision, PdfChangedError

class VersionProtectionTests(unittest.TestCase):
    def setUp(self):
        self.local={'comment':'same','color':'#ffd400','type':'highlight','text':'quote','position':{'pageIndex':0,'rects':[[1,2,3,4]]},'tags':['定义'],'version':1}
    def test_equal_length_competing_comments_are_preserved(self):
        base=annotation_snapshot(self.local)
        with self.assertRaises(SnapshotConflict): merge_annotation(base,{**self.local,'comment':'left','version':2},{'comment':'rght','color':'#ffd400','type':'highlight'})
    def test_independent_color_change_and_comment_edit_merge(self):
        base=annotation_snapshot(self.local)
        result=merge_annotation(base,{**self.local,'color':'#ff6666','tags':['定义','本地新增'],'version':2},{'comment':'same with web additions','color':'#ffd400','type':'highlight','tags':['定义','疑问']})
        self.assertEqual(result['color'],'#ff6666')
        self.assertEqual(set(result['tags']),{'定义','本地新增','疑问'})
    def test_delete_rejects_a_changed_annotation(self):
        with self.assertRaises(SnapshotConflict):check_deletion(annotation_snapshot(self.local),{**self.local,'tags':['定义','重要']})
        check_deletion(annotation_snapshot(self.local),self.local)
    def test_legacy_update_without_baseline_cannot_replace_different_content(self):
        with self.assertRaises(SnapshotConflict):merge_annotation(None,self.local,{'comment':'a much longer different draft','color':'#ffd400'})

class PdfVersionTests(unittest.TestCase):
    def test_content_change_with_same_size_and_timestamp_pauses_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'reader.sqlite';pdf=Path(directory)/'paper.pdf';pdf.write_bytes(b'first PDF')
            old=pdf_status('ABCDEFGH',pdf,db);self.assertFalse(old['needsReview'])
            import os
            stamp=pdf.stat().st_mtime_ns;pdf.write_bytes(b'other PDF');os.utime(pdf,ns=(stamp,stamp))
            changed=pdf_status('ABCDEFGH',pdf,db);self.assertTrue(changed['needsReview'])
            with self.assertRaises(PdfChangedError):ensure_pdf_revision('ABCDEFGH',old['revision'],pdf,db)
            review_pdf('ABCDEFGH',changed['revision'],pdf,db)
            with self.assertRaises(PdfChangedError):ensure_pdf_revision('ABCDEFGH',old['revision'],pdf,db)
            ensure_pdf_revision('ABCDEFGH',changed['revision'],pdf,db)
    def test_stale_review_does_not_acknowledge_a_newer_file(self):
        with tempfile.TemporaryDirectory() as directory:
            db=Path(directory)/'reader.sqlite';pdf=Path(directory)/'paper.pdf';pdf.write_bytes(b'old')
            old=pdf_status('ABCDEFGH',pdf,db);pdf.write_bytes(b'new')
            with self.assertRaises(PdfChangedError):review_pdf('ABCDEFGH',old['revision'],pdf,db)
