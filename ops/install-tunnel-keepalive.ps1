#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$')]
    [string]$TunnelId
)
$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\PaperReaderTunnel'
$taskName = 'PaperReader-TunnelKeepalive'
if (Test-Path -LiteralPath $root) {
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a redirected operations directory.' }
} else { New-Item -ItemType Directory -Path $root | Out-Null }
$acl = New-Object Security.AccessControl.DirectorySecurity
$administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($administrators)
$acl.SetAccessRuleProtection($true,$false)
foreach ($identity in @($administrators,$system)) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
}
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($owner,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $root -AclObject $acl
$destination = Join-Path $root 'watchdog.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tunnel-watchdog.ps1') -Destination $destination -Force
$before = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared'
$stamp = Get-Date -Format yyyyMMdd-HHmmss
@{Start=$before.Start;DelayedAutoStart=$before.DelayedAutoStart;ImagePath=$before.ImagePath;FailureActions=$before.FailureActions;FailureActionsOnNonCrashFailures=$before.FailureActionsOnNonCrashFailures} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $root ('service-before-'+$stamp+'.json')) -Encoding UTF8
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    if ($existing.Actions.Arguments -notmatch [regex]::Escape($destination)) { throw 'A different task already uses this name.' }
    Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $root ('task-before-'+$stamp+'.xml')) -Encoding UTF8
}
& "$env:WINDIR\System32\sc.exe" config Cloudflared start= delayed-auto | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not enable delayed startup.' }
& "$env:WINDIR\System32\sc.exe" failure Cloudflared reset= 86400 actions= restart/20000/restart/60000/restart/120000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not set service recovery.' }
& "$env:WINDIR\System32\sc.exe" failureflag Cloudflared 1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not enable failure recovery.' }
$boot = New-ScheduledTaskTrigger -AtStartup
$boot.Delay = 'PT2M'
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+$destination+'" -ExpectedTunnelId '+$TunnelId) -WorkingDirectory $root
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($boot,$repeat) -Principal $principal -Settings $settings -Description 'Checks the ze tunnel connection, restarts only after three failures, and preserves a 10 minute recovery cooldown.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State | ConvertTo-Json -Compress
