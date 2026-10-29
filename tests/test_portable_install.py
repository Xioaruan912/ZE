import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class PortableInstallTests(unittest.TestCase):
    def runtime(self):
        import ze_runtime
        return ze_runtime

    def test_project_environment_wins_over_an_unrelated_global_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            scripts = root / '.venv' / 'Scripts'
            scripts.mkdir(parents=True)
            cli = scripts / 'zotero-cli.exe'
            python = scripts / 'python.exe'
            cli.touch()
            python.touch()
            self.assertEqual(self.runtime().resolve_cli(root, {}), cli)
            self.assertEqual(self.runtime().resolve_write_python(root, {}), python)

    def test_explicit_runtime_overrides_are_respected(self):
        runtime = self.runtime()
        root = Path('example')
        self.assertEqual(runtime.resolve_cli(root, {'ZOTERO_CLI': 'custom/cli.exe'}), Path('custom/cli.exe'))
        self.assertEqual(runtime.resolve_write_python(root, {'ZOTERO_PYTHON': 'custom/python.exe'}), Path('custom/python.exe'))

    def test_bridge_build_generates_a_private_token_and_reuses_it(self):
        spec = importlib.util.spec_from_file_location('ze_bridge_build', ROOT / 'zotero-bridge/build.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            module.build(base=root)
            first = (root / 'bridge.token').read_text().strip()
            self.assertGreaterEqual(len(first), 32)
            module.build(base=root)
            self.assertEqual((root / 'bridge.token').read_text().strip(), first)
