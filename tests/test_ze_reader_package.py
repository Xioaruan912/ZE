import importlib.util
import json
import re
import xml.etree.ElementTree as ET
import tempfile
import unittest
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PLUGIN = BASE / 'plugins' / 'ze-reader'

class UnifiedPackageTests(unittest.TestCase):
    def builder(self):
        spec = importlib.util.spec_from_file_location('ze_reader_build', PLUGIN / 'build.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_unified_manifest_upgrades_route_plugin(self):
        manifest = json.loads((PLUGIN / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['name'], 'ZE Reader')
        self.assertEqual(manifest['version'], '0.3.0')
        settings = manifest['applications']['zotero']
        self.assertEqual(settings['id'], 'reading-route-columns@local.example')
        self.assertEqual(settings['strict_max_version'], '10.0.*')
        self.assertTrue(settings['update_url'].startswith('https://'))

    def test_package_is_reproducible_and_allowlisted(self):
        builder = self.builder()
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'ze-reader.xpi'
            builder.build(output)
            first = output.read_bytes()
            builder.build(output)
            self.assertEqual(first, output.read_bytes())
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), set(builder.RUNTIME_FILES))
                self.assertEqual(archive.read('reading-columns.js'), (BASE / 'plugins/reading-columns/reading-columns.js').read_bytes().replace(b'\r\n', b'\n'))
                self.assertNotIn('bridge.token', archive.namelist())

    def test_delivered_package_has_current_sources_and_complete_ui_resources(self):
        builder = self.builder()
        with zipfile.ZipFile(PLUGIN / 'ze-reader.xpi') as archive:
            expected = {'manifest.json', 'bootstrap.js', 'runtime.js', 'reading-columns.js',
                        'preferences.js', 'zotero-adapter.js', 'bridge.js', 'tab-groups.js',
                        'summary.js', 'matrix.js', 'workbench.xhtml', 'workbench.js',
                        'workbench.css', 'settings.xhtml', 'settings.js', 'locale/zh-CN/ze-reader.ftl'}
            self.assertEqual(set(archive.namelist()), expected)
            for name, source in builder.RUNTIME_FILES.items():
                content = archive.read(name)
                self.assertEqual(content, source.read_bytes().replace(b'\r\n', b'\n'))
                self.assertNotIn(b'__BRIDGE_TOKEN__', content)
                self.assertNotIn(b'C:/Users/Administrator', content)
                self.assertNotIn(b'C:\\Users\\Administrator', content)
            for name in ['workbench.xhtml', 'settings.xhtml']:
                content = archive.read(name).decode('utf-8')
                ET.fromstring(content)
                for ref in re.findall(r'(?:src|href)="chrome://ze-reader/content/([^"]+)"', content):
                    self.assertIn(ref, archive.namelist())

if __name__ == '__main__':
    unittest.main()
