import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


PLUGIN = Path(__file__).resolve().parent.parent / 'plugins' / 'reading-columns'


class ReadingColumnsPackageTests(unittest.TestCase):
    def test_installer_metadata_contains_required_fields(self):
        manifest = json.loads((PLUGIN / 'manifest.json').read_text(encoding='utf-8'))
        settings = manifest['applications']['zotero']
        self.assertEqual(settings['id'], 'reading-route-columns@local.example')
        self.assertTrue(settings['update_url'].startswith('https://'))
        self.assertTrue(settings['strict_min_version'])
        self.assertTrue(settings['strict_max_version'])

    def test_package_is_reproducible_and_contains_only_plugin_runtime(self):
        spec = importlib.util.spec_from_file_location('reading_columns_build', PLUGIN / 'build.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'reading-route-columns.xpi'
            builder.build(output)
            first = output.read_bytes()
            self.assertEqual(first, (PLUGIN / 'reading-route-columns.xpi').read_bytes())
            builder.build(output)
            self.assertEqual(first, output.read_bytes())
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {
                    'manifest.json', 'bootstrap.js', 'reading-columns.js'
                })
                for name in archive.namelist():
                    self.assertEqual(archive.read(name), (PLUGIN / name).read_bytes().replace(b'\r\n', b'\n'))


if __name__ == '__main__':
    unittest.main()
