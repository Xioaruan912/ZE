import importlib.util
import hashlib
import json
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
        self.assertEqual(manifest['version'], '0.5.2')
        settings = manifest['applications']['zotero']
        self.assertEqual(settings['id'], 'reading-route-columns@local.example')
        self.assertEqual(settings['strict_max_version'], '10.0.*')
        self.assertEqual(settings['update_url'], 'https://raw.githubusercontent.com/Xioaruan912/ZE/plugin/plugins/ze-reader/updates.json')
        self.assertEqual(manifest['icons']['64'], 'assets/icon.png')

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

    def test_delivered_package_has_current_sources_and_only_native_reading_resources(self):
        builder = self.builder()
        with zipfile.ZipFile(PLUGIN / 'ze-reader.xpi') as archive:
            expected = {'manifest.json', 'bootstrap.js', 'runtime.js', 'reading-columns.js', 'hover-preview.js', 'tag-visibility.js', 'pins.js', 'assets/icon.png'}
            self.assertEqual(set(archive.namelist()), expected)
            for name, source in builder.RUNTIME_FILES.items():
                content = archive.read(name)
                expected_content = source.read_bytes()
                if name.endswith(('.js', '.json')):
                    expected_content = expected_content.replace(b'\r\n', b'\n')
                self.assertEqual(content, expected_content)
                self.assertNotIn(b'__BRIDGE_TOKEN__', content)
                self.assertNotIn(b'C:/Users/Administrator', content)
                self.assertNotIn(b'C:\\Users\\Administrator', content)

    def test_updates_manifest_matches_the_built_package_and_zotero_compatibility(self):
        builder = self.builder()
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'ze-reader.xpi'
            builder.build(output)
            updates = json.loads((output.parent / 'updates.json').read_text(encoding='utf-8'))
            manifest = json.loads((PLUGIN / 'manifest.json').read_text(encoding='utf-8'))
            settings = manifest['applications']['zotero']
            entries = updates['addons'][settings['id']]['updates']
            self.assertEqual(len(entries), 1)
            entry = entries[0]
            self.assertEqual(entry['version'], manifest['version'])
            self.assertEqual(entry['update_hash'], 'sha256:' + hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(entry['update_link'], 'https://github.com/Xioaruan912/ZE/releases/download/ze-reader-v0.5.2/ze-reader.xpi')
            self.assertEqual(entry['applications']['zotero'], {'strict_min_version': '10.0', 'strict_max_version': '10.0.*'})
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.read('assets/icon.png'), (PLUGIN / 'assets/icon.png').read_bytes())
                self.assertTrue(archive.read('assets/icon.png').startswith(b'\x89PNG\r\n\x1a\n'))

    def test_delivered_update_manifest_is_current(self):
        updates = json.loads((PLUGIN / 'updates.json').read_text(encoding='utf-8'))
        entry = updates['addons']['reading-route-columns@local.example']['updates'][0]
        self.assertEqual(entry['update_hash'], 'sha256:' + hashlib.sha256((PLUGIN / 'ze-reader.xpi').read_bytes()).hexdigest())

if __name__ == '__main__':
    unittest.main()
