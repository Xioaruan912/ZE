"""Resolve project-local tools without depending on one user's uv installation."""
import importlib.util
import os
import shutil
import sys
from pathlib import Path


def load_environment(base):
    path = Path(base) / '.env'
    if path.is_file():
        from dotenv import load_dotenv
        load_dotenv(path, override=False)


def resolve_cli(base, environ=None):
    env = os.environ if environ is None else environ
    if env.get('ZOTERO_CLI'):
        return Path(env['ZOTERO_CLI'])
    candidates = [Path(base) / '.venv/Scripts/zotero-cli.exe', Path(base) / '.venv/bin/zotero-cli']
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    found = shutil.which('zotero-cli')
    return Path(found) if found else Path.home() / '.local/bin/zotero-cli.exe'


def resolve_write_python(base, environ=None):
    env = os.environ if environ is None else environ
    if env.get('ZOTERO_PYTHON'):
        return Path(env['ZOTERO_PYTHON'])
    for candidate in [Path(base) / '.venv/Scripts/python.exe', Path(base) / '.venv/bin/python']:
        if candidate.is_file():
            return candidate
    if importlib.util.find_spec('zotero_mcp') is not None:
        return Path(sys.executable)
    legacy = Path.home() / 'AppData/Roaming/uv/tools/zotero-mcp-server/Scripts/python.exe'
    return legacy if legacy.is_file() else Path(sys.executable)
