import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from reader import queue_annotation, pending_annotations, sync_all

class ReliabilityTests(unittest.TestCase):
    def test_preallocated_zotero_key_is_a_create_at_version_zero(self):
        from zotero_annotation_write import create_payload
        payload=create_payload({'key':'ABCDEFGH','annotation_key':'12345678','type':'highlight','text':'selected','comment':'','color':'#ffd400','position':{'pageIndex':0}},[[1,2,3,4]],'1','00000')
        self.assertEqual(payload['key'],'12345678')
        self.assertEqual(payload['version'],0)

    def test_highlight_keeps_exact_geometry_instead_of_researching_repeated_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'cache.sqlite'
            position={'pageIndex':2,'rects':[[100,200,180,214],[30,180,190,194]]}
            queue_annotation({'key':'ABCDEFGH','page':3,'text':'repeated words','comment':'note','position':position},path)
            with patch('reader.native_annotation_write',return_value={'key':'12345678'}) as write:
                self.assertEqual(sync_all(path)['synced'],1)
            self.assertEqual(write.call_args.args[0]['position'],position)
            self.assertEqual(write.call_args.args[0]['type'],'highlight')

    def test_lost_zotero_acknowledgement_reuses_native_annotation_key(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'cache.sqlite'
            queue_annotation({'key':'ABCDEFGH','page':1,'text':'selected','comment':'note','position':{'pageIndex':0,'rects':[[1,2,3,4]]}},path)
            with patch('reader.native_annotation_write',side_effect=[ValueError('lost response'),{'key':'12345678'}]) as write:
                sync_all(path);sync_all(path)
            first,second=[call.args[0].get('annotation_key') for call in write.call_args_list]
            self.assertIsNotNone(first)
            self.assertEqual(first,second)

    def test_repeated_client_create_after_sync_returns_original_id(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'cache.sqlite'
            item={'key':'ABCDEFGH','page':1,'text':'passage','comment':'note','position':{'pageIndex':0,'rects':[[1,2,3,4]]},'client_id':'browser-unique-create-1'}
            first=queue_annotation(item,path)
            self.assertEqual(queue_annotation(item,path),first)
            self.assertEqual(len(pending_annotations('ABCDEFGH',path)),1)
            with patch('reader.native_annotation_write',return_value={'key':'12345678'}): sync_all(path)
            self.assertEqual(queue_annotation(item,path),first)
            self.assertEqual(pending_annotations('ABCDEFGH',path),[])
