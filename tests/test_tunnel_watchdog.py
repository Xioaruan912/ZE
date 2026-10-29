import json
import os
import subprocess
import unittest
from pathlib import Path

@unittest.skipUnless(os.name=='nt','Windows tunnel health policy')
class TunnelWatchdogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=(Path(__file__).resolve().parents[1]/'ops/tunnel-watchdog.ps1').as_posix()
        code="""$ErrorActionPreference='Stop'; . 'SOURCE' -FunctionsOnly
        $first=Get-TunnelRecoveryPlan -Healthy $false -Failures 0 -LastRestart 0 -NowSeconds 10000 -BootAgeSeconds 1000
        $third=Get-TunnelRecoveryPlan -Healthy $false -Failures 2 -LastRestart 0 -NowSeconds 10000 -BootAgeSeconds 1000
        $healthy=Get-TunnelRecoveryPlan -Healthy $true -Failures 2 -LastRestart 9500 -NowSeconds 10000 -BootAgeSeconds 1000
        $cooldown=Get-TunnelRecoveryPlan -Healthy $false -Failures 2 -LastRestart 9800 -NowSeconds 10000 -BootAgeSeconds 1000
        $boot=Get-TunnelRecoveryPlan -Healthy $false -Failures 2 -LastRestart 0 -NowSeconds 10000 -BootAgeSeconds 30
        @{first=$first;third=$third;healthy=$healthy;cooldown=$cooldown;boot=$boot}|ConvertTo-Json -Depth 4 -Compress
        """.replace('SOURCE',source)
        result=subprocess.run([str(Path(os.environ['WINDIR'])/'System32/WindowsPowerShell/v1.0/powershell.exe'),'-NoProfile','-NonInteractive','-Command',code],capture_output=True,text=True,timeout=20)
        if result.returncode:raise AssertionError(result.stderr)
        cls.results=json.loads(result.stdout)
    def test_short_failure_does_not_restart(self):
        self.assertEqual(self.results['first']['Action'],'none');self.assertEqual(self.results['first']['Failures'],1)
    def test_third_consecutive_failure_restarts(self):
        self.assertEqual(self.results['third']['Action'],'restart');self.assertEqual(self.results['third']['LastRestart'],10000)
    def test_healthy_connection_resets_failures(self):
        self.assertEqual(self.results['healthy']['Failures'],0);self.assertEqual(self.results['healthy']['LastRestart'],9500)
    def test_cooldown_prevents_restart_loop(self):
        self.assertEqual(self.results['cooldown']['Action'],'none');self.assertEqual(self.results['cooldown']['Reason'],'cooldown')
    def test_network_has_time_to_start_after_boot(self):
        self.assertEqual(self.results['boot']['Action'],'none');self.assertEqual(self.results['boot']['Failures'],0)
