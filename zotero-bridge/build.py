"""Build the private local bridge. The XPI contains a token; do not publish it."""
import json
import zipfile
import secrets
from pathlib import Path

def build(base=None):
    source=Path(__file__).resolve().parent
    base=Path(base) if base is not None else source.parent
    base.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    settings=manifest['applications']['zotero']
    if not all(settings.get(key) for key in ('id','update_url','strict_max_version')):
        raise ValueError('Missing required Zotero manifest fields')
    if not settings['update_url'].startswith('https://'): raise ValueError('Zotero requires secure updates')
    token_file=base/'bridge.token'
    if not token_file.exists():
        try:
            with token_file.open('x',encoding='utf-8') as handle:handle.write(secrets.token_urlsafe(32))
        except FileExistsError:pass
    token=token_file.read_text(encoding='utf-8').strip()
    if len(token)<32: raise ValueError('Missing bridge token')
    script=(source/'bootstrap.js').read_text(encoding='utf-8').replace('__BRIDGE_TOKEN__',token)
    target=base/'paper-reader-bridge.xpi'
    temporary=target.with_suffix('.building')
    with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
        archive.writestr('bootstrap.js',script)
    temporary.replace(target)
    (base/f"paper-reader-bridge-{manifest['version']}.xpi").write_bytes(target.read_bytes())
    print('Built private bridge version '+manifest['version'])

if __name__=='__main__': build()
