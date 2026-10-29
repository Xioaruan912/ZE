@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set ZOTERO_LOCAL=true
set ZOTERO_NO_CLAUDE=true
if not exist ".venv\Scripts\zotero-mcp.exe" (
  echo Run the ZE installer first.
  pause
  exit /b 1
)
echo Open Zotero 10 or newer, then approve the write request in Zotero.
".venv\Scripts\zotero-mcp.exe" authorize-local --app-name ZE
if errorlevel 1 echo Authorization failed. Your unsynced annotations remain cached.
pause
