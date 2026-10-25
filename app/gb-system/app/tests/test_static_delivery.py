"""Byte-level compression, cache validation and role-scoped CSV checks."""
import csv
import gzip
import hashlib
import io
import json
import mimetypes
from pathlib import Path
import shutil
import tempfile
import unittest

import static_delivery as delivery


class Response:
    def __init__(self, headers=None, method='GET'):
        self.headers = headers or {}
        self.command = method
        self.sent = {}
        self.wfile = io.BytesIO()
    def send_response(self, status): self.status = status
    def send_error(self, status): self.status = status
    def send_header(self, name, value): self.sent[name] = value
    def end_headers(self): pass
    def guess_type(self, path): return mimetypes.guess_type(path)[0] or 'application/octet-stream'
    def copyfile(self, source, output): shutil.copyfileobj(source, output)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root/'js').mkdir()
        self.code = self.root/'js/test.js'
        self.code.write_text('const 한글 = 123;\n'*100, encoding='utf-8')

    def test_gzip_and_head_preserve_bytes_and_content_length(self):
        response = Response({'Accept-Encoding': 'br, gzip'})
        delivery.serve_static(response, self.root, 'js/test.js')
        self.assertEqual(gzip.decompress(response.wfile.getvalue()), self.code.read_bytes())
        self.assertEqual(int(response.sent['Content-Length']), len(response.wfile.getvalue()))
        self.assertEqual(response.sent['Vary'], 'Accept-Encoding')
        head = Response({'Accept-Encoding': 'gzip'}, 'HEAD')
        delivery.serve_static(head, self.root, 'js/test.js')
        self.assertEqual(head.wfile.getvalue(), b'')
        self.assertEqual(head.sent['Content-Length'], response.sent['Content-Length'])

    def test_etag_revalidation_and_file_update(self):
        first = Response()
        delivery.serve_static(first, self.root, 'js/test.js')
        cached = Response({'If-None-Match': 'W/'+first.sent['ETag']})
        delivery.serve_static(cached, self.root, 'js/test.js')
        self.assertEqual(cached.status, 304)
        self.assertEqual(cached.wfile.getvalue(), b'')
        self.code.write_text('changed code and length', encoding='utf-8')
        changed = Response({'If-None-Match': first.sent['ETag']})
        delivery.serve_static(changed, self.root, 'js/test.js')
        self.assertEqual(changed.status, 200)
        self.assertNotEqual(changed.sent['ETag'], first.sent['ETag'])

    def test_webp_requires_support_and_matching_original(self):
        (self.root/'assets/optimized').mkdir(parents=True)
        source = self.root/'assets/test.png'
        source.write_bytes(b'original png bytes')
        (self.root/'assets/optimized/test.webp').write_bytes(b'lossless variant bytes')
        (self.root/'assets/optimized/manifest.json').write_text(json.dumps({'assets/test.png':{
            'file':'assets/optimized/test.webp', 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}}))
        for accept, expected in [('image/webp',b'lossless variant bytes'), ('*/*',b'original png bytes'),
                                 ('image/webp;q=0,*/*;q=1',b'original png bytes')]:
            response = Response({'Accept':accept})
            delivery.serve_static(response, self.root, 'assets/test.png')
            self.assertEqual(response.wfile.getvalue(), expected)
            self.assertEqual(response.sent['Vary'], 'Accept')
        source.write_bytes(b'replaced original')
        response = Response({'Accept':'image/webp'})
        delivery.serve_static(response, self.root, 'assets/test.png')
        self.assertEqual(response.wfile.getvalue(), b'replaced original')

    def test_csv_cache_is_scoped_and_invalidates_when_dataset_changes(self):
        (self.root/'data').mkdir()
        source = self.root/'data/sensor_timeseries.csv'
        source.write_text('equipment_id,value\nEGF-01,1\nEGF-04,4\n'*1, encoding='utf-8')
        for ids in (['EGF-01','EGF-04'], ['EGF-04'], ['EGF-01'], []):
            body, encoded = delivery.scoped_csv(self.root, ids, 'gzip')
            rows = list(csv.DictReader(io.StringIO((gzip.decompress(body) if encoded else body).decode())))
            self.assertEqual({r['equipment_id'] for r in rows}, set(ids))
        source.write_text('equipment_id,value\nEGF-01,changed\n', encoding='utf-8')
        body, _ = delivery.scoped_csv(self.root, ['EGF-01'], '')
        self.assertIn(b'changed', body)

    def test_compression_opt_out_is_respected(self):
        self.assertFalse(delivery.accepts('gzip;q=0, *;q=1', 'gzip'))
        self.assertTrue(delivery.accepts('gzip;q=1', 'gzip'))
        self.assertFalse(delivery.accepts('br', 'gzip'))


if __name__ == '__main__':
    unittest.main()
