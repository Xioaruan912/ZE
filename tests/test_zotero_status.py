import io,json,unittest
from unittest.mock import patch
import zotero_status as status

class Response(io.BytesIO):
    def __init__(self,data):super().__init__(data);self.status=200

class ZoteroStatusTests(unittest.TestCase):
    def test_unreachable_zotero_is_offline(self):
        with patch.object(status,'open_local',side_effect=OSError('refused')):
            self.assertFalse(status.probe_zotero()['available'])
    def test_running_process_with_disabled_local_api_is_unavailable(self):
        with patch.object(status,'open_local',side_effect=[Response(b'Zotero is running'),OSError('disabled')]):
            self.assertEqual(status.probe_zotero()['reason'],'api_unavailable')
    def test_ping_and_local_api_confirm_availability(self):
        with patch.object(status,'open_local',side_effect=[Response(b'Zotero is running'),Response(b'[]')]):
            self.assertTrue(status.probe_zotero()['available'])
    def test_another_service_on_the_port_is_not_zotero(self):
        with patch.object(status,'open_local',return_value=Response(b'<html>other server</html>')):
            self.assertFalse(status.probe_zotero()['available'])
    def test_require_raises_clear_offline_error(self):
        with patch.object(status,'zotero_status',return_value={'available':False,'message':'请开启 Zotero'}):
            with self.assertRaises(status.ZoteroUnavailable):status.require_zotero()
