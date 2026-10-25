"""Accept-queue and cache boundaries; no DB access or notification workers."""
import hashlib
import io
import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

import server


class RefreshDeliveryTests(unittest.TestCase):
    def test_browser_burst_can_queue_before_accept_loop_starts(self):
        httpd = server.WebServer(('127.0.0.1', 0), server.Handler)
        clients = []
        try:
            # The old backlog of five times out before all sixteen can connect.
            for _ in range(16):
                clients.append(socket.create_connection(httpd.server_address, timeout=.5))
            self.assertEqual(len(clients), 16)
        finally:
            for client in clients:
                client.close()
            httpd.server_close()

    def header(self, path, status=200):
        handler = server.Handler.__new__(server.Handler)
        handler.path, handler.command, handler.request_version = path, 'GET', 'HTTP/1.1'
        handler._headers_buffer, handler.wfile = [], io.BytesIO()
        handler.log_request = lambda *args: None
        handler.send_response(status)
        handler.end_headers()
        return next(line.split(': ', 1)[1] for line in handler.wfile.getvalue().decode('latin1').splitlines()
                    if line.lower().startswith('cache-control:'))

    def test_only_matching_content_named_bundles_are_immutable(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server, 'ROOT', Path(folder)):
            root = Path(folder)
            for kind, stem, body in [('js', 'app', b'const value = 1;'), ('css', 'site', b'body { color: navy; }')]:
                (root/kind).mkdir()
                name = f'{kind}/{stem}.{hashlib.sha256(body).hexdigest()[:16]}.{kind}'
                (root/name).write_bytes(body)
                for prefix in ('', '/experience'):
                    self.assertEqual(self.header(prefix+'/'+name), 'public, max-age=31536000, immutable')
                    self.assertEqual(self.header(prefix+'/'+name, 401), 'no-store')
                    self.assertEqual(self.header(prefix+'/'+name, 500), 'no-store')
                (root/name).write_bytes(body+b' /* modified */')
                self.assertEqual(self.header('/'+name), 'no-cache')
            self.assertEqual(self.header('/js/app.0000000000000000.js', 404), 'no-store')
            self.assertEqual(self.header('/api/maintenance?version=123'), 'no-store')
            self.assertEqual(self.header('/experience/data/sensor_timeseries.csv'), 'no-store')

    def test_built_html_selects_existing_content_addressed_bundles(self):
        manifest = json.loads((server.ROOT/'js/build-manifest.json').read_text(encoding='utf-8'))
        html = (server.ROOT/'index.html').read_text(encoding='utf-8')
        for name, expected in manifest['files'].items():
            self.assertIn(name, html)
            self.assertEqual(hashlib.sha256((server.ROOT/name).read_bytes()).hexdigest(), expected)
        self.assertEqual(html.count('rel="stylesheet"'), 1)
        self.assertEqual(html.count('type="module"'), 1)


if __name__ == '__main__':
    unittest.main()
