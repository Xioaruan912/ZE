import json
import unittest
import zipfile
import io
import tempfile
import importlib.util
import urllib.error
from unittest.mock import patch,MagicMock
from pathlib import Path

BASE=Path(__file__).resolve().parent.parent

class BridgePackageTests(unittest.TestCase):
    def test_manifest_provides_all_fields_required_by_zotero(self):
        manifest=json.loads((BASE/'zotero-bridge/manifest.json').read_text(encoding='utf-8'))
        settings=manifest['applications']['zotero']
        self.assertTrue(settings.get('update_url','').startswith('https://'))
        self.assertTrue(settings.get('id'))
        self.assertTrue(settings.get('strict_max_version'))

    def test_built_package_has_matching_manifest_and_token(self):
        spec=importlib.util.spec_from_file_location('ze_bridge_test',BASE/'zotero-bridge/build.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);module.build(base=root)
            with zipfile.ZipFile(root/'paper-reader-bridge.xpi') as archive:
                manifest=json.loads(archive.read('manifest.json'))
                script=archive.read('bootstrap.js').decode()
            token=(root/'bridge.token').read_text(encoding='utf-8').strip()
        self.assertIn(manifest['applications']['zotero']['id'],script)
        self.assertNotIn('__BRIDGE_TOKEN__',script)
        self.assertIn(token,script)

    def test_bridge_not_ready_error_is_not_hidden_by_a_direct_fallback(self):
        from reader import translate_cnki
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'bridge.token').write_text('test-token',encoding='utf-8')
            error=urllib.error.HTTPError('http://127.0.0.1:23119/paper-reader/translate',503,'unready',{},io.BytesIO(json.dumps({'error':'Translate for Zotero 尚未就绪'}).encode()))
            opener=MagicMock();opener.open.side_effect=error
            with patch('reader.require_zotero'),patch('reader.BASE',root),patch('reader.urllib.request.build_opener',return_value=opener),patch('reader.urllib.request.urlopen') as direct:
                with self.assertRaisesRegex(ValueError,'尚未就绪'): translate_cnki('Hello world')
                direct.assert_not_called()
