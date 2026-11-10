"""Build the shareable ZE Reader XPI; never read private machine configuration."""
import argparse
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
RUNTIME_FILES = {
    'matrix.js': BASE / 'matrix.js',
    'summary.js': BASE / 'summary.js',
    'tab-groups.js': BASE / 'tab-groups.js',
    'bridge.js': BASE / 'bridge.js',
    'preferences.js': BASE / 'preferences.js',
    'zotero-adapter.js': BASE / 'zotero-adapter.js',
    'manifest.json': BASE / 'manifest.json',
    'bootstrap.js': BASE / 'bootstrap.js',
    'runtime.js': BASE / 'runtime.js',
    'reading-columns.js': BASE.parent / 'reading-columns' / 'reading-columns.js',
}

def build(output=None):
    output = Path(output) if output is not None else BASE / 'ze-reader.xpi'
    temporary = output.with_suffix('.building')
    try:
        with zipfile.ZipFile(temporary, 'w') as archive:
            for name, source in sorted(RUNTIME_FILES.items()):
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(entry, source.read_bytes().replace(b'\r\n', b'\n'), compresslevel=9)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(build(parser.parse_args().output))
