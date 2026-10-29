"""Serve the isolated, disposable selection-input regression page."""
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path

BASE=Path(__file__).resolve().parent.parent
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        files={'/':('tests/selection-browser.html','text/html'),'/selection-input.mjs':('static/selection-input.mjs','text/javascript')}
        if self.path not in files: self.send_error(404);return
        name,mime=files[self.path];data=(BASE/name).read_bytes()
        self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
if __name__=='__main__': HTTPServer(('127.0.0.1',8766),Handler).serve_forever()
