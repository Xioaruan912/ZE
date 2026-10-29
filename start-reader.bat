@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set ZOTERO_LOCAL=true
set ZOTERO_NO_CLAUDE=true
set "ZE_PYTHON=python"
if exist ".venv\Scripts\python.exe" set "ZE_PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "password.hash" (
  "%ZE_PYTHON%" change-password.py
  if errorlevel 1 goto failed
)
echo ZE: http://127.0.0.1:8765
echo Keep this window and Zotero open while reading on other devices.
"%ZE_PYTHON%" reader.py
if not errorlevel 1 exit /b 0
:failed
echo ZE could not start. Check the message above and the README.
pause
exit /b 1
