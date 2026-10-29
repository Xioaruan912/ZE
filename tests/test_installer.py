import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == 'nt', 'PowerShell Windows installer')
class InstallerTests(unittest.TestCase):
    def run_ps(self, body):
        script = str(ROOT / 'install.ps1').replace("'", "''")
        command = "$ErrorActionPreference='Stop'; . '" + script + "' -FunctionsOnly; " + body
        result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command],
                                capture_output=True, text=True, timeout=20)
        if result.returncode:
            self.fail(result.stderr)
        return json.loads(result.stdout)

    def test_install_rejects_the_profile_and_unrelated_existing_folders(self):
        result = self.run_ps("$profileRejected=$false;$unrelatedRejected=$false;try{Get-ZEInstallPath $env:USERPROFILE}catch{$profileRejected=$true};try{Get-ZEInstallPath $env:TEMP}catch{$unrelatedRejected=$true};@{profile=$profileRejected;unrelated=$unrelatedRejected}|ConvertTo-Json -Compress")
        self.assertEqual(result, {'profile': True, 'unrelated': True})

    def test_source_copy_never_overwrites_local_credentials_or_databases(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'
            target = Path(directory) / 'target'
            source.mkdir();target.mkdir()
            for name in ['reader.py', 'README.md', 'password.hash', 'bridge.token', 'reader-data.sqlite', '.env']:
                (source / name).write_text('source')
                (target / name).write_text('local')
            (source / 'backups').mkdir();(source / 'backups/private.txt').write_text('private')
            s = str(source).replace("'", "''");t = str(target).replace("'", "''")
            self.run_ps("Copy-ZESource '" + s + "' '" + t + "';@{ok=$true}|ConvertTo-Json -Compress")
            self.assertEqual((target / 'reader.py').read_text(), 'source')
            for name in ['password.hash', 'bridge.token', 'reader-data.sqlite', '.env']:
                self.assertEqual((target / name).read_text(), 'local')
            self.assertFalse((target / 'backups').exists())
