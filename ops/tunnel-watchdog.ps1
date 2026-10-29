[CmdletBinding()]
param(
    [switch]$FunctionsOnly,
    [switch]$ProbeOnly,
    [string]$StateRoot = 'C:\ProgramData\PaperReaderTunnel',
    [string]$ExpectedTunnelId = $env:ZE_TUNNEL_ID
)
$ErrorActionPreference = 'Stop'

function Get-TunnelRecoveryPlan {
    param([bool]$Healthy,[int]$Failures,[long]$LastRestart,[long]$NowSeconds,[long]$BootAgeSeconds)
    if ($Healthy) { return [pscustomobject]@{Action='none';Failures=0;LastRestart=$LastRestart;Reason='ready'} }
    if ($BootAgeSeconds -lt 120) { return [pscustomobject]@{Action='none';Failures=0;LastRestart=$LastRestart;Reason='startup-grace'} }
    $next = $Failures + 1
    if ($next -lt 3) { return [pscustomobject]@{Action='none';Failures=$next;LastRestart=$LastRestart;Reason='waiting'} }
    if ($LastRestart -gt 0 -and $NowSeconds - $LastRestart -lt 600) { return [pscustomobject]@{Action='none';Failures=$next;LastRestart=$LastRestart;Reason='cooldown'} }
    return [pscustomobject]@{Action='restart';Failures=0;LastRestart=$NowSeconds;Reason='three-failed-checks'}
}

function Get-LocalTunnelJson {
    param([int]$Port,[string]$Endpoint)
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:'+$Port+'/'+$Endpoint)
        $request.Proxy = $null
        $request.Timeout = 3000
        $request.ReadWriteTimeout = 3000
        try { $response = $request.GetResponse() }
        catch [System.Net.WebException] { $response = $_.Exception.Response; if ($null -eq $response) { return $null } }
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        return [pscustomobject]@{Status=[int]$response.StatusCode;Body=$body}
    } catch { return $null }
    finally { if ($null -ne $response) { $response.Close() } }
}

function Test-TunnelConnection {
    $service = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
    if ($null -eq $service) { return [pscustomobject]@{Healthy=$false;Reason='service-missing';Connections=0} }
    if ($service.State -ne 'Running') { return [pscustomobject]@{Healthy=$false;Reason=$service.State;Connections=0;ProcessId=$service.ProcessId} }
    $ports = @(Get-NetTCPConnection -State Listen -OwningProcess $service.ProcessId -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -ge 20241 -and $_.LocalPort -le 20245 -and $_.LocalAddress -in @('127.0.0.1','::1') } | Select-Object -ExpandProperty LocalPort -Unique)
    foreach ($port in $ports) {
        $diagnostic = Get-LocalTunnelJson -Port $port -Endpoint 'diag/tunnel'
        if ($null -eq $diagnostic -or $diagnostic.Status -ne 200) { continue }
        if ($ExpectedTunnelId -and $diagnostic.Body.tunnelID -ne $ExpectedTunnelId) { return [pscustomobject]@{Healthy=$false;Reason='different-tunnel';Connections=0;ProcessId=$service.ProcessId} }
        $ready = Get-LocalTunnelJson -Port $port -Endpoint 'ready'
        $connections = 0
        if ($null -ne $ready) { $connections = [int]$ready.Body.readyConnections }
        return [pscustomobject]@{Healthy=($null -ne $ready -and $ready.Status -eq 200 -and $connections -gt 0);Reason='connection-check';Connections=$connections;ProcessId=$service.ProcessId;MetricsPort=$port}
    }
    return [pscustomobject]@{Healthy=$false;Reason='metrics-unavailable';Connections=0;ProcessId=$service.ProcessId}
}

function Write-TunnelWatchdogLog {
    param([string]$Message)
    $log = Join-Path $StateRoot 'watchdog.log'
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1048576) { Move-Item -LiteralPath $log -Destination (Join-Path $StateRoot 'watchdog.previous.log') -Force }
    ([DateTime]::UtcNow.ToString('o')+' '+$Message) | Add-Content -LiteralPath $log -Encoding UTF8
}

function Restart-DisconnectedTunnel {
    $current = Test-TunnelConnection
    if ($current.Healthy) { Write-TunnelWatchdogLog 'Connection recovered before restart; no action.'; return }
    $service = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
    if ($null -eq $service) { throw 'Cloudflared service is missing.' }
    if ($service.State -ne 'Stopped') {
        & "$env:WINDIR\System32\sc.exe" stop Cloudflared | Out-Null
        for ($attempt=0; $attempt -lt 10; $attempt++) {
            $service = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
            if ($service.State -eq 'Stopped') { break }
            Start-Sleep -Seconds 2
        }
        if ($service.State -ne 'Stopped' -and $service.ProcessId -gt 0) {
            # Only terminate the verified cloudflared service executable, never the reader.
            $process = Get-CimInstance Win32_Process -Filter ('ProcessId='+$service.ProcessId)
            if ($process.ExecutablePath -ine 'C:\Program Files (x86)\cloudflared\cloudflared.exe') { throw 'Service process identity changed; refusing to terminate it.' }
            Write-TunnelWatchdogLog 'Service did not stop within 20 seconds; terminating verified connector process.'
            Stop-Process -Id $service.ProcessId -Force
            Start-Sleep -Seconds 2
        }
    }
    Start-Service -Name Cloudflared
    Write-TunnelWatchdogLog 'Cloudflared restart requested. Further restart attempts are rate-limited for 10 minutes.'
}

if ($FunctionsOnly) { return }
try {
$health = Test-TunnelConnection
if ($ProbeOnly) { $health | ConvertTo-Json -Compress; exit 0 }
if (-not (Test-Path -LiteralPath $StateRoot -PathType Container)) { throw 'Secure watchdog state directory is missing.' }
if ($health.Reason -in @('different-tunnel','service-missing')) { Write-TunnelWatchdogLog ('Automatic recovery skipped: '+$health.Reason); exit 0 }

$now = [long]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$bootAge = [long](([DateTime]::Now-$boot).TotalSeconds)
$statePath = Join-Path $StateRoot 'state.json'
$failures = 0; $lastRestart = 0
if (Test-Path -LiteralPath $statePath) {
    try {
        $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($previous.BootTime -eq $boot.ToUniversalTime().ToString('o')) { $failures=[int]$previous.Failures; $lastRestart=[long]$previous.LastRestart }
    } catch { Write-TunnelWatchdogLog 'Invalid previous state; starting a new observation window.' }
}
$plan = Get-TunnelRecoveryPlan -Healthy $health.Healthy -Failures $failures -LastRestart $lastRestart -NowSeconds $now -BootAgeSeconds $bootAge
$record = [pscustomobject]@{BootTime=$boot.ToUniversalTime().ToString('o');CheckedAt=$now;Healthy=$health.Healthy;Connections=$health.Connections;Failures=$plan.Failures;LastRestart=$plan.LastRestart;Reason=$plan.Reason}
$temporary = $statePath+'.tmp'
$record | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporary -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $statePath -Force
if (-not $health.Healthy) { Write-TunnelWatchdogLog ('Connection check failed: reason='+$health.Reason+' failures='+$plan.Failures+' policy='+$plan.Reason) }
elseif ($failures -gt 0) { Write-TunnelWatchdogLog ('Connection recovered: active connections='+$health.Connections) }
if ($plan.Action -eq 'restart') { Restart-DisconnectedTunnel }
$record | ConvertTo-Json -Compress
} catch {
    Write-TunnelWatchdogLog ('Watchdog error: '+$_.Exception.Message+' at '+$_.ScriptStackTrace)
    exit 1
}
