"""Build the shareable reading-columns XPI from an explicit runtime allowlist."""

import argparse
import zipfile
from pathlib import Path


BASE = Path(__file__).resolve().parent
RUNTIME_FILES = ('manifest.json', 'bootstrap.js', 'reading-columns.js')


def build(output=None):
    output = Path(output) if output is not None else BASE / 'reading-route-columns.xpi'
    with zipfile.ZipFile(output, 'w') as archive:
        for name in RUNTIME_FILES:
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            data = (BASE / name).read_bytes().replace(b'\r\n', b'\n')
            archive.writestr(entry, data, compresslevel=9)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    print(build(args.output))
