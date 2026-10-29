import copy
import unittest
from sync_protection import annotation_snapshot,SnapshotConflict
from zotero_annotation_write import write_existing

class LocalStore:
    def __init__(self,data):self.data=copy.deepcopy(data)
    def update_item(self,item):
        if item['data']['version']!=self.data['version']:raise ValueError('version mismatch')
        self.data=copy.deepcopy(item['data']);self.data['version']+=1;return True
    def delete_item(self,item):
        if item['data']['version']!=self.data['version']:raise ValueError('version mismatch')
        self.data=None;return True

class NativeProtectionTests(unittest.TestCase):
    def setUp(self):
        self.data={'key':'12345678','version':4,'itemType':'annotation','parentItem':'ABCDEFGH','annotationType':'highlight','annotationText':'quote','annotationComment':'note','annotationColor':'#ffd400','annotationPosition':'{"pageIndex":0,"rects":[[1,2,3,4]]}','tags':[{'tag':'定义','type':1}]}
    def test_native_update_merges_without_erasing_unrelated_desktop_tags(self):
        base=annotation_snapshot(self.data);local=copy.deepcopy(self.data);local['tags'].append({'tag':'桌面新增'});local['version']=5;store=LocalStore(local)
        write_existing(store,{'data':copy.deepcopy(local)},{'operation':'update','key':'ABCDEFGH','id':'12345678','base':base,'comment':'note plus explanation','color':'#ffd400','type':'highlight','tags':['定义','疑问']})
        self.assertEqual(store.data['annotationComment'],'note plus explanation')
        self.assertEqual({tag['tag'] for tag in store.data['tags']},{'定义','桌面新增','疑问'})
        self.assertEqual(next(tag for tag in store.data['tags'] if tag['tag']=='定义')['type'],1)
    def test_native_delete_keeps_annotation_if_desktop_changed(self):
        base=annotation_snapshot(self.data);local={**self.data,'annotationComment':'a new desktop note'};store=LocalStore(local)
        with self.assertRaises(SnapshotConflict):write_existing(store,{'data':copy.deepcopy(local)},{'operation':'delete','key':'ABCDEFGH','id':'12345678','base':base})
        self.assertEqual(store.data,local)
