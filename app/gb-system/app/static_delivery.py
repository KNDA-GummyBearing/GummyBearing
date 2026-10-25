"""Small, dependency-free delivery layer for public assets and scoped CSV bytes.

Build-time lossless variants live beside untouched originals. No API/session data
is cached here. Text compression happens once per file revision, not per request.
"""
import csv
from datetime import timezone
from email.utils import formatdate, parsedate_to_datetime
from functools import lru_cache
import gzip
import hashlib
import io
import json
import re
from pathlib import Path


def accepts(value, token):
    choices = {}
    for entry in value.lower().split(','):
        name, *params = entry.strip().split(';')
        quality = 1.0
        for param in params:
            if param.strip().startswith('q='):
                try:
                    quality = float(param.strip()[2:])
                except ValueError:
                    quality = 0.0
        choices[name] = quality
    # Require explicit WebP support; a generic image/* or */* is insufficient.
    return choices.get(token, choices.get('*', 0) if token == 'gzip' else 0) > 0


def stamp(path):
    stat = path.stat()
    return str(path), stat.st_mtime_ns, stat.st_size


def is_immutable_bundle(root, relative):
    """Only intact, content-addressed public bundles receive long-lived caching."""
    match = re.fullmatch(r'(?:js/app|css/site)\.([0-9a-f]{16})\.(?:js|css)', relative)
    return bool(match and digest_file(*stamp(root / relative)).startswith(match.group(1)))


@lru_cache(maxsize=256)
def digest_file(path, mtime, size):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


@lru_cache(maxsize=8)
def variant_manifest(path, mtime, size):
    return json.loads(Path(path).read_text(encoding='utf-8'))


@lru_cache(maxsize=128)
def text_bytes(path, mtime, size):
    body = Path(path).read_bytes()
    return body, gzip.compress(body, compresslevel=6, mtime=0)


@lru_cache(maxsize=16)
def _scoped_csv(path, mtime, size, equipment_ids):
    source = io.StringIO(Path(path).read_text(encoding='utf-8-sig'))
    reader = csv.DictReader(source)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=reader.fieldnames)
    writer.writeheader()
    allowed = set(equipment_ids)
    writer.writerows(row for row in reader if row['equipment_id'] in allowed)
    body = output.getvalue().encode('utf-8')
    return body, gzip.compress(body, compresslevel=6, mtime=0)


def scoped_csv(root, equipment_ids, accept_encoding):
    # Caller must authenticate on every request. The cache key includes the full
    # allowed equipment set, so another role can never reuse a wider CSV result.
    body, compressed = _scoped_csv(*stamp(root/'data/sensor_timeseries.csv'), tuple(sorted(equipment_ids)))
    use_gzip = accepts(accept_encoding, 'gzip') and len(compressed) < len(body)
    return (compressed if use_gzip else body), use_gzip


def serve_static(handler, root, relative):
    source = (root/relative).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        return handler.send_error(404)
    selected = source
    vary = []
    if source.suffix.lower() == '.png':
        vary.append('Accept')
        manifest = root/'assets/optimized/manifest.json'
        if manifest.is_file() and accepts(handler.headers.get('Accept', ''), 'image/webp'):
            variant = variant_manifest(*stamp(manifest)).get(relative)
            if variant and digest_file(*stamp(source)) == variant['source_sha256']:
                candidate = (root/variant['file']).resolve()
                if candidate.is_relative_to(root/'assets/optimized') and candidate.is_file():
                    selected = candidate
    body = None
    encoded = False
    if source.suffix.lower() in ('.html', '.js', '.css', '.json', '.webmanifest', '.svg'):
        vary.append('Accept-Encoding')
        plain, compressed = text_bytes(*stamp(source))
        encoded = accepts(handler.headers.get('Accept-Encoding', ''), 'gzip') and len(compressed) < len(plain)
        body = compressed if encoded else plain
    etag = '"' + (hashlib.sha256(body).hexdigest() if body is not None else digest_file(*stamp(selected))) + '"'
    modified = selected.stat().st_mtime
    supplied_etags = handler.headers.get('If-None-Match')
    unchanged = False
    if supplied_etags:
        unchanged = any(tag.strip().removeprefix('W/') in ('*', etag) for tag in supplied_etags.split(','))
    elif handler.headers.get('If-Modified-Since'):
        try:
            date = parsedate_to_datetime(handler.headers['If-Modified-Since'])
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            unchanged = int(modified) <= int(date.timestamp())
        except (TypeError, ValueError, OverflowError):
            pass
    handler.send_response(304 if unchanged else 200)
    handler.send_header('ETag', etag)
    handler.send_header('Last-Modified', formatdate(modified, usegmt=True))
    if vary:
        handler.send_header('Vary', ', '.join(vary))
    if encoded:
        handler.send_header('Content-Encoding', 'gzip')
    if unchanged:
        handler.end_headers()
        return
    content_type = handler.guess_type(str(selected))
    if source.suffix in ('.js', '.css', '.html'):
        content_type += '; charset=utf-8'
    handler.send_header('Content-Type', content_type)
    handler.send_header('Content-Length', str(len(body) if body is not None else selected.stat().st_size))
    handler.end_headers()
    if handler.command != 'HEAD':
        if body is not None:
            handler.wfile.write(body)
        else:
            with selected.open('rb') as stream:
                handler.copyfile(stream, handler.wfile)
