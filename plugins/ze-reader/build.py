"""Build native ZE Reader enhancements; never read private machine configuration."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
RUNTIME_FILES = {
    'assets/icon.png': BASE / 'assets' / 'icon.png',
    'hover-preview.js': BASE / 'hover-preview.js',
    'tag-visibility.js': BASE / 'tag-visibility.js',
    'pins.js': BASE / 'pins.js',
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
                content = source.read_bytes()
                if name.endswith(('.js', '.json')):
                    content = content.replace(b'\r\n', b'\n')
                archive.writestr(entry, content, compresslevel=9)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    manifest = json.loads(RUNTIME_FILES['manifest.json'].read_text(encoding='utf-8'))
    settings = manifest['applications']['zotero']
    update = {
        'version': manifest['version'],
        'update_link': 'https://github.com/Xioaruan912/ZE/releases/download/ze-reader-v' + manifest['version'] + '/ze-reader.xpi',
        'update_hash': 'sha256:' + hashlib.sha256(output.read_bytes()).hexdigest(),
        'applications': {'zotero': {key: settings[key] for key in ('strict_min_version', 'strict_max_version')}},
    }
    updates = {'addons': {settings['id']: {'updates': [update]}}}
    (output.parent / 'updates.json').write_text(json.dumps(updates, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(build(parser.parse_args().output))
