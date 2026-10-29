import copy,json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import reader
from annotation_geometry import validate_ink_position
from sync_protection import annotation_snapshot
from zotero_annotation_write import create_payload

POSITION={'pageIndex':0,'width':1.6,'paths':[[10,20,11.25,22.5,18,30]]}
class InkTests(unittest.TestCase):
 def test_ink_geometry_rejects_nonfinite_odd_and_oversized_paths(self):
  validate_ink_position(POSITION,1)
  for pos in [{**POSITION,'width':0},{**POSITION,'paths':[[1,2,3]]},{**POSITION,'paths':[[1,float('nan')]]},{**POSITION,'paths':[[0,0]*1300]},{**POSITION,'pageIndex':1}]:
   with self.assertRaises(ValueError):validate_ink_position(pos,1)
 def test_native_payload_preserves_paths_and_does_not_invent_text(self):
  p=create_payload({'key':'ABCDEFGH','type':'ink','text':'','comment':'formula','color':'#000000','position':POSITION},[[10,20,18,30]],'1','00000|000000|00000')
  self.assertEqual(json.loads(p['annotationPosition']),POSITION);self.assertNotIn('annotationText',p)
 def test_native_ink_snapshot_keeps_type_and_normalizes_absent_quote(self):
  self.assertEqual(annotation_snapshot({'type':4,'text':None,'position':POSITION})['type'],'ink')
  self.assertEqual(annotation_snapshot({'type':'ink','text':None,'position':POSITION})['structure'],annotation_snapshot({'type':'ink','text':'','position':POSITION})['structure'])
 def test_ink_survives_failed_native_sync_with_geometry_and_type(self):
  with tempfile.TemporaryDirectory() as d:
   db=Path(d)/'reader.sqlite';spec={'key':'ABCDEFGH','page':1,'text':'','comment':'','color':'#000000','type':'ink','position':POSITION,'client_id':'ink-stroke-001'}
   first=reader.queue_annotation(spec,db);self.assertEqual(first,reader.queue_annotation(spec,db))
   with patch('reader.native_annotation_write',side_effect=ValueError('offline')):self.assertEqual(reader.sync_all(db)['remaining'],1)
   with patch('reader.native_annotation_write',return_value={'key':'12345678'}) as write:self.assertEqual(reader.sync_all(db)['synced'],1)
   self.assertEqual(write.call_args.args[0]['position'],POSITION);self.assertEqual(write.call_args.args[0]['type'],'ink')
 def test_authenticated_route_accepts_ink_and_rejects_invalid_paths(self):
  with tempfile.TemporaryDirectory() as d,patch.object(reader,'DB',Path(d)/'db.sqlite'),patch.object(reader.Handler,'authenticated',return_value=True):
   server=ThreadingHTTPServer(('127.0.0.1',0),reader.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   def post(position):
    return urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/api/annotation',data=json.dumps({'key':'ABCDEFGH','page':1,'text':'','type':'ink','color':'#000000','position':position,'client_id':'ink-route-001'}).encode(),headers={'Content-Type':'application/json'}),timeout=3)
   try:
    with post(POSITION) as response:self.assertEqual(response.status,200)
    with self.assertRaises(urllib.error.HTTPError) as error:post({**POSITION,'paths':[[1,2,3]]})
    self.assertEqual(error.exception.code,400);error.exception.close()
   finally:server.shutdown();server.server_close();thread.join()
