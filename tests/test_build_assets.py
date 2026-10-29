import tempfile,unittest,json,threading,urllib.request,urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import reader
from pathlib import Path
from reader import build_asset

class BuildAssetTests(unittest.TestCase):
    def test_cosmetic_assets_are_limited_to_the_build_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'static/build';folder.mkdir(parents=True)
            (folder/'ze-ui-ABC.css').write_text('body{}')
            path,mime=build_asset('/assets/ze-ui-ABC.css',root)
            self.assertEqual(path,(folder/'ze-ui-ABC.css').resolve());self.assertEqual(mime,'text/css; charset=utf-8')
            for unsafe in ['/assets/../password.hash','/assets/%2e%2e/password.hash','/assets/manifest.json','/assets/file.sqlite','/assets/missing.css','/app.js']:
                self.assertIsNone(build_asset(unsafe,root))
    def test_fonts_and_icons_have_explicit_types(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'static/build';folder.mkdir(parents=True)
            for name,mime in [('font-ABC.woff2','font/woff2'),('book-ABC.svg','image/svg+xml'),('ze-ui-ABC.js','text/javascript; charset=utf-8')]:
                (folder/name).write_bytes(b'test')
                self.assertEqual(build_asset('/assets/'+name,root)[1],mime)

    def test_public_cosmetic_assets_do_not_unlock_library_endpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'static/build';folder.mkdir(parents=True)
            (folder/'ze-ui-ABC.css').write_text('body{color:black}')
            with patch.object(reader,'BASE',root),patch.object(reader.Handler,'authenticated',return_value=False):
                server=ThreadingHTTPServer(('127.0.0.1',0),reader.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                base='http://127.0.0.1:'+str(server.server_port)
                try:
                    with urllib.request.urlopen(base+'/assets/ze-ui-ABC.css',timeout=3) as response:self.assertEqual(response.status,200)
                    for path in ['/api/items','/api/pdf?key=ABCDEFGH','/app.js','/assets/../password.hash']:
                        with self.assertRaises(urllib.error.HTTPError) as captured:urllib.request.urlopen(base+path,timeout=3)
                        self.assertEqual(captured.exception.code,401);captured.exception.close()
                finally:server.shutdown();server.server_close();thread.join()
