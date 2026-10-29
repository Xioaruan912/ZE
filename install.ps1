# ZE Windows installer. Run without administrator privileges.
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'ZE'),
    [string]$SourceDirectory,
    [switch]$NoSetup,
    [switch]$NoShortcut,
    [switch]$FunctionsOnly
)
$ErrorActionPreference = 'Stop'

function Get-ZEInstallPath {
    param([string]$Candidate)
    $target = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
    foreach ($forbidden in @([IO.Path]::GetPathRoot($target), $env:USERPROFILE, $env:LOCALAPPDATA, $env:TEMP)) {
        if ($forbidden -and $target -eq $forbidden.TrimEnd('\')) { throw 'Choose a dedicated ZE folder, not a profile, drive or temporary root.' }
    }
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Choose a normal ZE directory.' }
        if (@(Get-ChildItem -LiteralPath $target -Force).Count) {
            $marker = Join-Path $target '.ze-install.json'
            if (-not (Test-Path -LiteralPath $marker)) { throw 'This folder already contains other files. Use an empty folder or an existing ZE installation.' }
            $record = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
            if ($record.repository -ne 'Xioaruan912/ZE') { throw 'The installation marker belongs to another application.' }
        }
    }
    return $target
}

function Copy-ZESource {
    param([string]$Source, [string]$Destination)
    $sourceRoot = [IO.Path]::GetFullPath($Source).TrimEnd('\')
    $files = @()
    $rootNames = @('LICENSE', '.gitignore', '.gitattributes', '.env.example', 'requirements.txt', 'package.json', 'package-lock.json', 'install.ps1', 'start-reader.bat', 'configure-zotero.bat')
    $files += Get-ChildItem -LiteralPath $sourceRoot -File -Force | Where-Object { $_.Name -in $rootNames -or $_.Extension -in @('.py', '.md') }
    foreach ($directory in @('frontend', 'static', 'scripts', 'tests', 'zotero-bridge', 'ops', '.github', 'docs/screenshots')) {
        $path = Join-Path $sourceRoot $directory
        if (Test-Path -LiteralPath $path) { $files += Get-ChildItem -LiteralPath $path -File -Recurse -Force }
    }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
        if ($relative -match '(^|/)(node_modules|__pycache__|build|\.git)(/|$)|\.(token|hash|xpi|sqlite[^/]*|log|bin|pyc|pem|key)$') { continue }
        $destinationFile = Join-Path $Destination $relative
        $null = New-Item -ItemType Directory -Path (Split-Path $destinationFile -Parent) -Force
        Copy-Item -LiteralPath $file.FullName -Destination $destinationFile -Force
    }
}

function Invoke-ZENative {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('A setup step failed: ' + [IO.Path]::GetFileName($File) + '. Please retry after checking your network.') }
}

function Get-ZENode {
    param([string]$Tools, [string]$Stage)
    $existing = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($existing) {
        $version = & $existing.Source --version
        if ($LASTEXITCODE -eq 0 -and [int]($version.TrimStart('v').Split('.')[0]) -ge 22) { return $existing.Source }
    }
    $localNode = Join-Path $Tools 'node/node.exe'
    if (Test-Path -LiteralPath $localNode) { return $localNode }
    Write-Host '[2/5] Downloading a private Node.js LTS runtime...'
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $versions = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $release = $versions | Where-Object { $_.lts -and ([version]$_.version.TrimStart('v')).Major -ge 22 -and $_.files -contains ('win-' + $architecture + '-zip') } | Select-Object -First 1
    if (-not $release) { throw 'No supported Node.js LTS download was found.' }
    $archiveName = 'node-' + $release.version + '-win-' + $architecture + '.zip'
    $baseUrl = 'https://nodejs.org/dist/' + $release.version + '/'
    $archive = Join-Path $Stage $archiveName
    Invoke-WebRequest ($baseUrl + $archiveName) -OutFile $archive -UseBasicParsing
    $checksums = (Invoke-WebRequest ($baseUrl + 'SHASUMS256.txt') -UseBasicParsing).Content
    $entry = $checksums -split '\r?\n' | Where-Object { $_ -match ('\s+' + [regex]::Escape($archiveName) + '$') } | Select-Object -First 1
    if (-not $entry -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne ($entry -split '\s+')[0]) { throw 'Node.js checksum verification failed.' }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $Stage 'node')
    $extracted = Join-Path (Join-Path $Stage 'node') ([IO.Path]::GetFileNameWithoutExtension($archiveName))
    Move-Item -LiteralPath $extracted -Destination (Join-Path $Tools 'node')
    return $localNode
}

function Get-ZEUv {
    param([string]$Tools)
    $existing = Get-Command uv.exe -ErrorAction SilentlyContinue
    if ($existing) { return $existing.Source }
    $folder = Join-Path $Tools 'uv'
    $executable = Join-Path $folder 'uv.exe'
    if (Test-Path -LiteralPath $executable) { return $executable }
    Write-Host '[2/5] Installing uv from Astral...'
    $oldInstall = $env:UV_INSTALL_DIR
    $oldModify = $env:UV_NO_MODIFY_PATH
    try {
        $env:UV_INSTALL_DIR = $folder
        $env:UV_NO_MODIFY_PATH = '1'
        $installer = Invoke-RestMethod 'https://astral.sh/uv/install.ps1'
        & ([scriptblock]::Create($installer)) | Out-Host
    } finally {
        $env:UV_INSTALL_DIR = $oldInstall
        $env:UV_NO_MODIFY_PATH = $oldModify
    }
    if (-not (Test-Path -LiteralPath $executable)) { throw 'uv installation did not complete.' }
    return $executable
}

if ($FunctionsOnly) { return }
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) { throw 'This installer supports 64-bit Windows 10/11.' }
$installRoot = Get-ZEInstallPath $InstallDir
if ($SourceDirectory -and [IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\') -eq $installRoot) { throw 'Source and destination must be different folders.' }
$null = New-Item -ItemType Directory -Path $installRoot -Force
$markerPath = Join-Path $installRoot '.ze-install.json'
@{repository='Xioaruan912/ZE';state='preparing'} | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
$stageRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$stage = Join-Path $stageRoot ('ZE-setup-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $stage
$oldProgress = $ProgressPreference
$oldPath = $env:PATH
try {
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Write-Host '[1/5] Preparing ZE source...'
    if ($SourceDirectory) { $source = [IO.Path]::GetFullPath($SourceDirectory) }
    else {
        $archive = Join-Path $stage 'ZE.zip'
        Invoke-WebRequest 'https://github.com/Xioaruan912/ZE/archive/refs/heads/main.zip' -OutFile $archive -UseBasicParsing
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $stage 'source')
        $source = Join-Path $stage 'source/ZE-main'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $source 'reader.py'))) { throw 'The ZE download is incomplete.' }
    Copy-ZESource $source $installRoot
    $tools = Join-Path $installRoot '.tools'
    $null = New-Item -ItemType Directory -Path $tools -Force
    $uv = Get-ZEUv $tools
    $node = Get-ZENode $tools $stage
    $env:PATH = (Split-Path $node -Parent) + ';' + $env:PATH
    $python = Join-Path $installRoot '.venv/Scripts/python.exe'
    Write-Host '[3/5] Installing Python 3.12 and ZE dependencies...'
    if (-not (Test-Path -LiteralPath $python)) { Invoke-ZENative $uv @('venv', '--python', '3.12', (Join-Path $installRoot '.venv')) }
    Invoke-ZENative $uv @('pip', 'install', '--python', $python, '-r', (Join-Path $installRoot 'requirements.txt'))
    Write-Host '[4/5] Building ZE...'
    Push-Location $installRoot
    try {
        $npm = Join-Path (Split-Path $node -Parent) 'npm.cmd'
        Invoke-ZENative $npm @('ci', '--no-audit', '--no-fund')
        Invoke-ZENative $npm @('run', 'build')
        Invoke-ZENative $python @('zotero-bridge/build.py')
        if (-not $NoSetup -and -not (Test-Path -LiteralPath 'password.hash')) {
            Write-Host '[5/5] Choose your own ZE passphrase (there is no default)...'
            Invoke-ZENative $python @('change-password.py')
        }
    } finally { Pop-Location }
    if (-not $NoShortcut) {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZE.lnk'))
        $shortcut.TargetPath = Join-Path $installRoot 'start-reader.bat'
        $shortcut.WorkingDirectory = $installRoot
        $shortcut.Save()
    }
    @{repository='Xioaruan912/ZE';state='ready';installedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
    Write-Host ''
    Write-Host ('Installed ZE in ' + $installRoot)
    Write-Host 'Next: open Zotero 10+, enable its local API, and run configure-zotero.bat once.'
    Write-Host 'Then double-click ZE on your desktop (or start-reader.bat) and visit http://127.0.0.1:8765.'
    Write-Host 'Keep Zotero and ZE running. With Zotero closed, only already loaded/cached offline features remain available.'
} finally {
    $ProgressPreference = $oldProgress
    $env:PATH = $oldPath
    # This is the single temporary directory created by this invocation.
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    if ((Split-Path $resolvedStage -Parent).TrimEnd('\') -eq $stageRoot -and (Split-Path $resolvedStage -Leaf) -match '^ZE-setup-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolvedStage)) {
        if (-not ((Get-Item -LiteralPath $resolvedStage).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
    }
}
