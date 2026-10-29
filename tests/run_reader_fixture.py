"""Isolated UI integration fixture: real static app, synthetic PDF, no Zotero writes."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def sample_pdf():
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',None,b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',None,b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    objects[0]=b'<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>'
    objects[2]=objects[2].replace(b'/Contents 4 0 R',b'/Contents 4 0 R /Annots [10 0 R]')
    objects[4]=objects[4].replace(b'600 800',b'600 2400')
    objects.extend([b'<< /Type /Outlines /First 9 0 R /Last 9 0 R /Count 1 >>',b'<< /Title (Second page) /Parent 8 0 R /Dest [5 0 R /Fit] >>',b'<< /Type /Annot /Subtype /Link /Rect [50 598 200 620] /Dest [5 0 R /Fit] /Border [0 0 0] >>'])
    # Deliberately draw a superscript after later paragraphs, as many PDFs do.
    content=b'BT /F1 18 Tf 50 700 Td (Reliable annotations make reading comfortable.) Tj 0 -30 Td (Select these words to translate and highlight.) Tj 0 -70 Td (Go to page two) Tj ET BT /F1 18 Tf 50 540 Td (Let p) Tj 35 0 Td (= 2 and consider a prime.) Tj ET BT /F1 18 Tf 50 510 Td (UNRELATED paragraph must stay unselected.) Tj ET BT /F1 10 Tf 80 549 Td (3) Tj ET'
    for i in (3,5): objects[i]=b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream'
    references=b'BT /F1 18 Tf 50 2200 Td (References) Tj 0 -30 Td ([1] A. Author. The first theorem.) Tj 0 -30 Td ([2] B. Author. Another theorem.) Tj ET'
    objects[5]=b'<< /Length '+str(len(references)).encode()+b' >>\nstream\n'+references+b'\nendstream'
    pdf=b'%PDF-1.4\n';offsets=[0]
    for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    count=str(len(objects)+1).encode();start=len(pdf);pdf+=b'xref\n0 '+count+b'\n0000000000 65535 f \n'+b''.join(f'{x:010d} 00000 n \n'.encode() for x in offsets[1:])+b'trailer\n<< /Size '+count+b' /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF'
    return pdf

class Fixture(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/api/pdf':data=sample_pdf();mime='application/pdf'
        elif path=='/pdf.worker.mjs':
            import reader
            data=reader.pdf_worker_source().read_bytes();mime='text/javascript; charset=utf-8'
        elif path=='/responsive.html':
            data=(ROOT/'tests/responsive.html').read_bytes();mime='text/html; charset=utf-8'
        elif path.startswith('/assets/'):
            import reader
            asset=reader.build_asset(path)
            if not asset:self.send_error(404);return
            file,mime=asset;data=file.read_bytes()
        elif path=='/':
            data=(ROOT/'static/index.html').read_text(encoding='utf-8').replace('<script type="module" src="/app.js?v=20261028-2"></script>','<script src="/reader-fixture.js"></script><script src="/touch-reader-fixture.js"></script><script src="/pencil-fixture.js"></script><script type="module" src="/app.js?v=20261028-2"></script><button id="run-pencil-fixture" style="position:fixed;bottom:55px;left:0;z-index:100">运行手写测试</button><pre id="pencil-fixture-result" style="position:fixed;bottom:55px;right:0;z-index:100;background:white;max-height:300px;overflow:auto"></pre><button id="run-touch-fixture" style="position:fixed;bottom:28px;left:0;z-index:100">运行触控测试</button><pre id="touch-fixture-result" style="position:fixed;bottom:28px;right:0;z-index:100;background:white;max-height:260px;overflow:auto"></pre><button id="run-fixture" style="position:fixed;bottom:0;left:0;z-index:100">运行隔离测试</button><pre id="fixture-result" style="position:fixed;bottom:0;right:0;z-index:100;background:white"></pre>').encode();mime='text/html; charset=utf-8'
        else:
            files={'/pdf.mjs':ROOT/'node_modules/pdfjs-dist/build/pdf.mjs','/pdf.worker.mjs':ROOT/'node_modules/pdfjs-dist/build/pdf.worker.mjs','/viewer.css':ROOT/'node_modules/pdfjs-dist/web/pdf_viewer.css','/reader-fixture.js':ROOT/'tests/reader-fixture.js','/touch-reader-fixture.js':ROOT/'tests/touch-reader-fixture.js','/pencil-fixture.js':ROOT/'tests/pencil-fixture.js'}
            file=files.get(path,ROOT/'static'/path.lstrip('/'))
            if not file.is_file() or ROOT not in file.resolve().parents:self.send_error(404);return
            data=file.read_bytes();mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css'}.get(file.suffix,'application/octet-stream')
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)

if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8767),Fixture).serve_forever()
