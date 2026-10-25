# [ROLE PREVIEW 2026-10-23] 역할 선택·공정 범위·XLSX·앱/메일 알림 API.
# 기존 업무 데이터와 과거 다섯 계정의 참조는 유지하고, 발표 역할 세 개를 별도로 사용합니다.
"""MySQL demo server with optional role selection and scoped notification APIs.

GB_DEMO_ROLE_SELECTION=1 replaces the password form with three demo profiles.
The existing password-auth path is retained only for compatibility when disabled.
"""
import csv
import io
from urllib.parse import parse_qs
import roles
from notifications import Notifications
from experience import Experience
import argparse
import base64
import hmac
import ipaddress
import json
import os
import pymysql
from http.cookies import SimpleCookie, CookieError
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from auth import AuthStore, AuthError, SESSION_SECONDS
import mysql_store as records
import approvals
import bell
from static_delivery import serve_static, scoped_csv, is_immutable_bundle
from origin_policy import validate_origin, demo_request_origin

ROOT = Path(__file__).resolve().parent
ROLE_DEMO = os.getenv('GB_DEMO_ROLE_SELECTION') == '1'
PUBLIC_ORIGIN = os.getenv('GB_PUBLIC_ORIGIN', '').rstrip('/')


class WebServer(ThreadingHTTPServer):
    # A page opens many public-resource connections at once through the proxy.
    # This is the pending accept queue, not a limit on active request threads.
    request_queue_size = 128


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript',
                      '.webp': 'image/webp', '.woff': 'font/woff', '.json': 'application/json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    @property
    def personal_experience(self):
        return urlsplit(self.path).path.startswith('/experience/')

    def send_response(self, code, message=None):
        self._response_status = code
        super().send_response(code, message)

    def end_headers(self):
        # Team and personal-experience URLs share the same public image/font files.
        # Resolve the allowlisted path; never cache private data or error responses.
        cache_control = 'no-store'
        if self.command in ('GET', 'HEAD') and getattr(self, '_response_status', None) in (200, 304):
            relative = self.static_path()
            if relative and relative.startswith('assets/'):
                cache_control = 'public, max-age=86400'
            elif relative and relative.startswith(('js/', 'css/')):
                # HTML stays fresh and selects new content-addressed bundles.
                # Original editable modules still revalidate on every reuse.
                cache_control = ('public, max-age=31536000, immutable'
                                 if is_immutable_bundle(ROOT, relative) else 'no-cache')
        self.send_header('Cache-Control', cache_control)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        super().end_headers()

    def send_json(self, obj, status=200, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        if cookie is not None:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def token(self):
        try:
            cookies = SimpleCookie(self.headers.get('Cookie', ''))
            name = 'gb_experience_session' if self.personal_experience else 'gb_session'
            return cookies[name].value if name in cookies else ''
        except CookieError:
            return ''

    def cookie(self, token=''):
        secure = '; Secure' if PUBLIC_ORIGIN.startswith('https://') else ''
        if self.personal_experience:
            return f'gb_experience_session={token}; Path=/experience/; HttpOnly; SameSite=Lax; Max-Age={30 * 86400 if token else 0}{secure}'
        return f'gb_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECONDS if token else 0}{secure}'

    def expected_origin(self):
        # [HTTP DEMO ADD] EC2 stop/start may change the IPv4; CSRF still requires same origin.
        if os.getenv('GB_HTTP_DEMO') == '1':
            try:
                return demo_request_origin(self.headers.get('Host',''),urlsplit(PUBLIC_ORIGIN).port)
            except ValueError:
                raise AuthError('현재 EC2의 IPv4와 데모 포트로 접속해 주세요.',403)
        if PUBLIC_ORIGIN:
            return PUBLIC_ORIGIN
        host, port = self.headers.get('Host', ''), self.server.server_port
        if host not in (f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'):
            raise AuthError('등록된 접속 주소를 사용해 주세요.', 403)
        return 'http://' + host

    def experience_client_ip(self):
        # Enable only when the published port is reachable solely through Caddy,
        # which sanitizes X-Forwarded-For. Never trust it on direct/public servers.
        peer = self.client_address[0]
        if os.getenv('GB_TRUST_PROXY_HEADERS') == '1' and ipaddress.ip_address(peer).is_private:
            forwarded = self.headers.get('X-Forwarded-For', '').split(',')[-1].strip()
            try: return str(ipaddress.ip_address(forwarded))
            except ValueError: pass
        return peer

    def outer_authorized(self):
        outer = os.getenv('GB_AUTH', '')
        if not outer or hmac.compare_digest(self.headers.get('Authorization', ''),
                                            'Basic ' + base64.b64encode(outer.encode()).decode()):
            return True
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="GummyBearing", charset="UTF-8"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return False

    def authenticate(self, csrf=False):
        store = self.server.experience if self.personal_experience else self.server.auth_store
        session = store.session(self.token())
        if not session:
            raise AuthError('로그인이 필요합니다.')
        if csrf and not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
            raise AuthError('로그인 정보를 새로고침한 뒤 다시 시도해 주세요.', 403)
        return session

    def static_path(self):
        path = unquote(urlsplit(self.path).path)
        if self.personal_experience:
            path = path[len('/experience'):]
            if path == '/sw.js': return 'experience-sw.js'
            if path == '/manifest.webmanifest': return 'experience.webmanifest'
        target = (ROOT / path.lstrip('/')).resolve()
        if not target.is_relative_to(ROOT):
            return None
        relative = target.relative_to(ROOT).as_posix()
        if relative in ('sw.js', 'manifest.webmanifest'):
            return relative
        if relative in ('.', 'index.html'):
            return 'index.html'
        if relative == 'data/sensor_timeseries.csv' or relative.startswith(('css/', 'js/', 'assets/')):
            return relative if target.is_file() else None
        return None

    def translate_path(self, path):
        # Both presentations use the same reviewed assets, with separate API,
        # session cookie and service worker scopes for personal experiences.
        relative = self.static_path()
        return str(ROOT / relative) if relative else str(ROOT / '__not_public__')

    def experience_get(self, path):
        service = self.server.experience
        if path == '/api/demo/profiles':
            return self.send_json({'profiles': service.profiles()})
        session = self.authenticate()
        user = session['user']
        if path == '/api/auth/session': return self.send_json(session)
        if path == '/api/notifications/inbox':
            return self.send_json({'notifications': [], 'unread_count': 0})
        if path == '/api/approvals':
            return self.send_json({'requests': [], 'counts': {'pending': 0, 'approved': 0, 'rejected': 0}})
        if path == '/api/config': return self.send_json({'storage': 'mysql', 'can_reset': False, 'business_write': False})
        if path == '/api/equipment':
            return self.send_json({'records': roles.scoped(records.read_tables(['equipment']), user)['equipment']})
        if path == '/api/maintenance':
            data = roles.scoped(records.read_tables(['inspections','maintenance_reviews','follow_ups','work_history']), user)
            return self.send_json(approvals.decorate_followups(data))
        return self.send_json({'error': '개인 체험에서 제공하지 않는 기능입니다.'}, 403)

    def experience_post(self, path, payload):
        service = self.server.experience
        # No visitor request is ever routed into a team write API.
        if path == '/api/demo/select':
            token, result = service.start(payload, self.experience_client_ip())
            return self.send_json(result, cookie=self.cookie(token))
        session = self.authenticate(csrf=True)
        user = session['user']
        if path == '/api/auth/logout':
            service.logout(self.token())
            return self.send_json({'ok': True}, cookie=self.cookie())
        # Public experience is screen-only: old clients cannot queue email or push.
        return self.send_json({'error': '개인 체험에서는 팀의 점검·일정·승인 기록을 변경할 수 없습니다.'}, 403)

    def _get(self, head=False):
        path = urlsplit(self.path).path
        try:
            if path == '/experience':
                self.send_response(308); self.send_header('Location', '/experience/'); self.send_header('Content-Length', '0'); self.end_headers()
                return
            if self.personal_experience:
                if not ROLE_DEMO: return self.send_error(404)
                path = path[len('/experience'):]
            if path == '/api/health':
                records.health()
                if not self.server.auth_store.ready():
                    return self.send_json({'ok': False}, 503)
                return self.send_json({'ok': True, 'storage': 'mysql'})
            if not self.outer_authorized():
                return
            if self.personal_experience and path.startswith('/api/'):
                return self.experience_get(path)
            if path == '/api/demo/profiles' and ROLE_DEMO:
                return self.send_json({'profiles': self.server.auth_store.profiles()})
            if path == '/api/auth/session':
                if not self.server.auth_store.ready():
                    return self.send_json({'error': '먼저 python tools/manage_users.py init으로 계정을 생성해 주세요.'}, 503)
                return self.send_json(self.authenticate())
            if path.startswith('/api/'):
                session = self.authenticate()
                # [MYPAGE ADD] Actor is always the authenticated account, never a query parameter.
                if path == '/api/me/activity':
                    activity = roles.activity(session['user'])
                    if ROLE_DEMO:
                        approvals.decorate_followups(activity)
                    return self.send_json({'user': session['user'], **activity})
                if path == '/api/notifications/round' and ROLE_DEMO:
                    return self.send_json(self.server.notifications.current_round(session['user']))
                if path == '/api/notifications' and ROLE_DEMO:
                    return self.send_json(self.server.notifications.status(session['user']))
                if path == '/api/approvals' and ROLE_DEMO:
                    return self.send_json(approvals.listing(session['user']))
                if path == '/api/notifications/inbox' and ROLE_DEMO:
                    return self.send_json(bell.inbox(session['user']))
                if path == '/api/export.xlsx':
                    from export_xlsx import workbook
                    query = parse_qs(urlsplit(self.path).query)
                    body = workbook(session['user'], query.get('process',['all'])[0], query.get('equipment',['all'])[0])
                    self.send_response(200)
                    self.send_header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                    self.send_header('Content-Disposition','attachment; filename=GummyBearing-records.xlsx')
                    self.send_header('Content-Length',str(len(body)))
                    self.end_headers()
                    if not head: self.wfile.write(body)
                    return
                if path == '/api/config':
                    return self.send_json({'storage': 'mysql', 'can_reset': False})
                if path == '/api/equipment':
                    return self.send_json({'records': roles.scoped(records.read_tables(['equipment']), session['user'])['equipment']})
                if path == '/api/maintenance':
                    data = roles.scoped(records.read_tables(['inspections','maintenance_reviews','follow_ups','work_history']), session['user'])
                    return self.send_json(approvals.decorate_report_reviews(approvals.decorate_followups(data)) if ROLE_DEMO else data)
                return self.send_json({'error': 'not found'}, 404)
            static = self.static_path()
            if static is None:
                return self.send_error(404)
            if static.startswith('data/'):
                session = self.authenticate()
                # [ROLE] CSV must obey the same scope as equipment and history.
                ids = roles.allowed_ids(session['user'])
                # [LOGIN CHANGE] 기존 시뮬레이션 CSV는 로그인 후에만 읽을 수 있음.
                body, encoded = scoped_csv(ROOT, ids, self.headers.get('Accept-Encoding', ''))
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Vary', 'Accept-Encoding')
                if encoded:
                    self.send_header('Content-Encoding', 'gzip')
                if ROLE_DEMO:
                    self.send_header('X-GB-Data-Revision', self.server.notifications.revision)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                if not head:
                    self.wfile.write(body)
                return
            return serve_static(self, ROOT, static)
        except AuthError as error:
            return self.send_json({'error': str(error)}, error.status)
        except (OSError, pymysql.MySQLError, json.JSONDecodeError):
            return self.send_json({'error': '저장소를 읽지 못했습니다. 서버 상태를 확인해 주세요.'}, 503)

    def do_GET(self):
        return self._get()

    def do_HEAD(self):
        return self._get(head=True)

    def do_POST(self):
        try:
            if not self.outer_authorized():
                return
            if self.headers.get('Origin') not in (None, self.expected_origin()) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
                raise AuthError('허용되지 않은 요청입니다.', 403)
            if self.headers.get('X-GB-Request') != '1' or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise AuthError('화면에서 요청해 주세요.', 403)
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                return self.send_json({'error': '요청 크기를 확인해 주세요.'}, 413)
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('요청은 객체 형식이어야 합니다.')
            path, store = urlsplit(self.path).path, self.server.auth_store
            if self.personal_experience:
                if not ROLE_DEMO: return self.send_error(404)
                return self.experience_post(path[len('/experience'):], payload)
            if path == '/api/demo/select' and ROLE_DEMO:
                token, result = store.select(payload.get('username'), self.token())
                return self.send_json(result, cookie=self.cookie(token))
            if path == '/api/auth/login' and ROLE_DEMO:
                raise AuthError('관리자 선택 화면을 사용해 주세요.', 410)
            if path == '/api/auth/login':
                if not store.ready():
                    return self.send_json({'error': '계정 초기 설정이 필요합니다.'}, 503)
                token, result = store.login(payload.get('username'), payload.get('password'), self.client_address[0], self.token())
                return self.send_json(result, cookie=self.cookie(token))
            session = self.authenticate(csrf=True)
            if path == '/api/approvals/submit' and ROLE_DEMO:
                return self.send_json(approvals.submit(session['user'], payload))
            if path == '/api/approvals/decide' and ROLE_DEMO:
                return self.send_json(approvals.decide(session['user'], payload))
            if path == '/api/completions/submit' and ROLE_DEMO:
                return self.send_json(approvals.completion_submit(session['user'], payload))
            if path == '/api/completions/decide' and ROLE_DEMO:
                return self.send_json(approvals.completion_decide(session['user'], payload))
            if path == '/api/notifications/read' and ROLE_DEMO:
                return self.send_json(bell.mark_read(session['user'], payload))
            if path.startswith('/api/notifications/') and ROLE_DEMO:
                notice, user = self.server.notifications, session['user']
                if path == '/api/notifications/round/reset': return self.send_json(notice.reset_round(user, payload))
                if path == '/api/notifications/playback': return self.send_json(notice.playback(user, payload))
                if path.endswith('/settings'): return self.send_json(notice.settings(user, payload))
                if path.endswith('/subscribe'): return self.send_json(notice.subscribe(user, payload))
                if path.endswith('/unsubscribe'): return self.send_json(notice.unsubscribe(user))
                if path.endswith('/start'): return self.send_json(notice.start(user, payload.get('kind')))
            if path == '/api/auth/logout':
                store.logout(self.token())
                return self.send_json({'ok': True}, cookie=self.cookie())
            if path == '/api/maintenance':
                if ROLE_DEMO and isinstance(payload, dict) and payload.get('operation') == 'update':
                    if session['user'].get('role') != 'supervisor':
                        raise AuthError('현장관리자는 완료 승인 요청을 제출해 주세요. 팀장 승인 후 완료됩니다.', 403)
                    return self.send_json(approvals.direct_complete(session['user'], payload))
                return self.send_json(records.save(payload, session['user']))
            if path == '/api/maintenance/reset':
                return self.send_json({'error':'MySQL 기록 보호를 위해 초기화를 제공하지 않습니다.'},405)
            return self.send_json({'error': 'not found'}, 404)
        except AuthError as error:
            return self.send_json({'error': str(error)}, error.status)
        except records.ValidationError as error:
            return self.send_json({'error': str(error)}, 400)
        except (ValueError, UnicodeDecodeError):
            return self.send_json({'error': '입력값 또는 점검·일정 연결을 확인해 주세요.'}, 400)
        except (OSError, pymysql.MySQLError):
            return self.send_json({'error': '서버 저장에 실패했습니다. 서버 상태를 확인해 주세요.'}, 503)

    def log_message(self, fmt, *args):
        if args and isinstance(args[0], str):
            super().log_message('%s', args[0].split('?')[0])


def main():
    parser = argparse.ArgumentParser(description='GummyBearing v9 — 5명 로그인')
    parser.add_argument('port_pos', nargs='?', type=int)
    parser.add_argument('--port', type=int, default=int(os.getenv('PORT', '8000')))
    parser.add_argument('--host', default=os.getenv('GUMMY_HOST', os.getenv('HOST', '127.0.0.1')))
    args = parser.parse_args()
    if os.getenv('GUMMY_STORAGE', 'mysql') != 'mysql':
        parser.error('이 패키지는 MySQL 로그인 추가본입니다.')
    if PUBLIC_ORIGIN:
        # [HTTP DEMO CHANGE] Authentication, CSRF and session checks stay enabled.
        try:
            validate_origin(PUBLIC_ORIGIN,http_demo=os.getenv('GB_HTTP_DEMO') == '1')
        except ValueError as error:
            parser.error(str(error))
    elif args.host not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('외부 배포에는 GB_PUBLIC_ORIGIN=https://실제도메인 설정이 필요합니다.')
    server = WebServer((args.host, args.port_pos or args.port), Handler)
    server.auth_store = roles.DemoRoleStore() if ROLE_DEMO else AuthStore()
    if ROLE_DEMO:
        server.notifications = Notifications(role_store=server.auth_store)
        server.experience = Experience(server.notifications)
        server.notifications.experience = server.experience
        server.notifications.start_worker()
    print(f'GummyBearing v9 로그인 서버: {PUBLIC_ORIGIN or "http://localhost:" + str(server.server_port)}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if ROLE_DEMO: server.notifications.stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
