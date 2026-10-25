"""Private visitor notification trials, separate from team accounts and records.

The HTTP layer owns origin/CSRF checks and cookie handling. This module accepts
only server-resolved visitor users. No method writes a team/business table;
only process_one invokes the shared, database-free delivery adapter.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
import secrets
import time

from auth import AuthError, fingerprint
from mysql_store import connect
import notifications as notice_module

SESSION_SECONDS = 30 * 24 * 60 * 60
PAIR_SECONDS = 300
VERIFY_SECONDS = 600
PROCESSES = {'all': ('전체 제철소', None), 'sinter': ('소결공정', 'sinter'),
             'steel': ('제강공정', 'steel')}
HEX32 = re.compile(r'^[0-9a-f]{32}$')
REQUEST_ID = re.compile(r'^[A-Za-z0-9_-]{8,100}$')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


@contextmanager
def transaction():
    conn = connect()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def public_user(row):
    process = None  # Existing visitors also open the integrated screen.
    scope = PROCESSES[process or 'all'][0]
    return dict(id=row['visitor_id'], name=row['display_name'], role='visitor',
                visitor=True, demo=True, title='개인 체험', process=process,
                scope=scope, avatar=0, home='#/process/' + process if process else '#/',
                capabilities=dict(business_write=False, team_notifications=False,
                                  personal_notifications=False))


def user_id(user):
    ident = user.get('id', '') if isinstance(user, dict) else ''
    if (not isinstance(ident, str) or not HEX32.fullmatch(ident)
            or user.get('role') != 'visitor' or user.get('visitor') is not True):
        raise AuthError('개인 체험으로 입장해 주세요.', 403)
    return ident


def _json(value):
    return json.loads(value) if isinstance(value, str) else value


class Experience:
    def __init__(self, notifications):
        self.notifications = notifications

    def profiles(self):
        return [dict(id=key, process=process, name=label, scope=label, title='개인 체험')
                for key, (label, process) in PROCESSES.items() if key == 'all']

    def _rate(self, key, limit, seconds):
        """Persist failed-attempt budgets separately, including rejected requests."""
        now = time.time()
        with transaction() as cur:
            # Acquire an exclusive row lock immediately. INSERT IGNORE followed
            # by SELECT FOR UPDATE upgrades two shared locks and can deadlock
            # when two phones claim a code at the same time.
            cur.execute('INSERT INTO gb_experience_limits(bucket_hash,attempts,reset_epoch) VALUES(%s,1,%s) '
                        'ON DUPLICATE KEY UPDATE attempts=IF(reset_epoch<=%s,1,attempts+1),'
                        'reset_epoch=IF(reset_epoch<=%s,%s,reset_epoch)',
                        (digest(key), now + seconds, now, now, now + seconds))
            cur.execute('SELECT attempts,reset_epoch FROM gb_experience_limits WHERE bucket_hash=%s',
                        (digest(key),))
            row = cur.fetchone()
            attempts = row['attempts']
        if attempts > limit:
            raise AuthError('요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429)

    def _visitor(self, cur, user, lock=False):
        ident = user_id(user)
        cur.execute('SELECT * FROM gb_experience_visitors WHERE visitor_id=%s' + (' FOR UPDATE' if lock else ''),
                    (ident,))
        row = cur.fetchone()
        if not row or not row['active'] or row['expires_epoch'] <= time.time():
            raise AuthError('개인 체험이 만료되었습니다. 새 체험을 시작해 주세요.')
        return row

    def _round(self, cur, visitor):
        cur.execute('SELECT round_id,revision FROM gb_experience_rounds WHERE round_id=%s AND visitor_id=%s',
                    (visitor['current_round_id'], visitor['visitor_id']))
        row = cur.fetchone()
        if not row:
            raise AuthError('체험 회차를 확인하지 못했습니다.', 409)
        return dict(id=row['round_id'], revision=row['revision'])

    def _new_session(self, cur, visitor):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        cur.execute('INSERT INTO gb_experience_sessions(token_hash,visitor_id,csrf,expires_epoch) '
                    'VALUES(%s,%s,%s,%s)',
                    (fingerprint(token), visitor['visitor_id'], csrf,
                     min(time.time() + SESSION_SECONDS, visitor['expires_epoch'])))
        return token, dict(user=public_user(visitor), csrf=csrf, round=self._round(cur, visitor))

    def start(self, payload, ip):
        process = payload.get('process', payload.get('profile', payload.get('username', 'all')))
        if process is None:
            process = 'all'
        if process != 'all':
            raise ValueError('체험 공정 선택')
        name = payload.get('name', '방문자')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40 or any(ord(c) < 32 for c in name):
            raise ValueError('표시 이름 형식')
        ip_hash = digest(str(ip)[:256])
        self._rate('create-ip:' + ip_hash, 12, 3600)
        self._rate('create-global', 200, 3600)
        now, ident, round_id = time.time(), secrets.token_hex(16), secrets.token_hex(16)
        visitor = dict(visitor_id=ident, display_name=name.strip(), process_key=PROCESSES[process][1],
                       current_round_id=round_id, creation_ip_hash=ip_hash, created_epoch=now,
                       expires_epoch=now + SESSION_SECONDS, active=True, last_round_epoch=now)
        with transaction() as cur:
            cur.execute('INSERT INTO gb_experience_visitors(visitor_id,display_name,process_key,current_round_id,'
                        'creation_ip_hash,created_epoch,expires_epoch,last_round_epoch) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                        (ident, visitor['display_name'], visitor['process_key'], round_id, ip_hash, now,
                         visitor['expires_epoch'], now))
            cur.execute('INSERT INTO gb_experience_settings(visitor_id) VALUES(%s)', (ident,))
            cur.execute('INSERT INTO gb_experience_rounds(round_id,visitor_id,revision,request_id,created_epoch) '
                        'VALUES(%s,%s,%s,%s,%s)', (round_id, ident, self.notifications.revision, 'initial', now))
            return self._new_session(cur, visitor)

    def session(self, token):
        if not isinstance(token, str) or not token or len(token) > 128:
            return None
        with transaction() as cur:
            cur.execute('SELECT v.*,s.csrf FROM gb_experience_sessions s JOIN gb_experience_visitors v '
                        'ON v.visitor_id=s.visitor_id WHERE s.token_hash=%s AND s.expires_epoch>%s '
                        'AND v.expires_epoch>%s AND v.active=1', (fingerprint(token), time.time(), time.time()))
            row = cur.fetchone()
            return dict(user=public_user(row), csrf=row['csrf'], round=self._round(cur, row)) if row else None

    def logout(self, token):
        if isinstance(token, str) and len(token) <= 128:
            with transaction() as cur:
                cur.execute('DELETE FROM gb_experience_sessions WHERE token_hash=%s', (fingerprint(token),))
        return {'ok': True}

    def current_round(self, user):
        with transaction() as cur:
            return self._round(cur, self._visitor(cur, user))

    def status(self, user):
        with transaction() as cur:
            visitor = self._visitor(cur, user)
            ident = visitor['visitor_id']
            cur.execute('SELECT email,email_enabled,email_verified,verification_expires,verification_hash '
                        'FROM gb_experience_settings WHERE visitor_id=%s', (ident,))
            settings = cur.fetchone()
            cur.execute('SELECT COUNT(*) n FROM gb_experience_subscriptions WHERE visitor_id=%s', (ident,))
            subscriptions = cur.fetchone()['n']
            cur.execute('SELECT d.channel,d.status,d.detail,d.created_epoch,e.title,e.equipment_id,e.kind '
                        'FROM gb_experience_deliveries d JOIN gb_experience_events e ON e.event_id=d.event_id '
                        'WHERE d.visitor_id=%s ORDER BY d.created_epoch DESC LIMIT 50', (ident,))
            deliveries = cur.fetchall()
            for row in deliveries:
                row['created_at'] = datetime.fromtimestamp(row.pop('created_epoch'), timezone.utc).isoformat()
            return dict(email=settings['email'], email_enabled=bool(settings['email_enabled']),
                        email_verified=bool(settings['email_verified']),
                        verification_required=bool(settings['verification_hash'] and settings['verification_expires'] > time.time()),
                        subscriptions=subscriptions, deliveries=deliveries,
                        public_key=self.notifications.public_key, email_live=notice_module.EMAIL_SEND,
                        push_live=notice_module.PUSH_SEND, round=self._round(cur, visitor))

    def _destinations(self, cur, ident):
        cur.execute('SELECT email FROM gb_experience_settings WHERE visitor_id=%s '
                    'AND email_enabled=1 AND email_verified=1', (ident,))
        settings = cur.fetchone()
        destinations = [('email', settings['email'])] if settings and settings['email'] else []
        cur.execute('SELECT subscription_json FROM gb_experience_subscriptions WHERE visitor_id=%s', (ident,))
        destinations += [('push', json.dumps(_json(row['subscription_json']), sort_keys=True)) for row in cur.fetchall()]
        return destinations

    def _queue(self, cur, ident, round_id, event_id, kind, equipment_id, title, body, due,
               destinations, verification_id=None):
        cur.execute('INSERT IGNORE INTO gb_experience_events(event_id,visitor_id,round_id,kind,equipment_id,'
                    'title,body,due_epoch,verification_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (event_id, ident, round_id, kind, equipment_id, title, body, due, verification_id))
        created = cur.rowcount == 1
        if created:
            for channel, destination in destinations:
                delivery_id = digest(event_id + ':' + ident + ':' + channel + ':' + destination)
                cur.execute('INSERT INTO gb_experience_deliveries(delivery_id,event_id,visitor_id,channel,'
                            'destination,created_epoch) VALUES(%s,%s,%s,%s,%s,%s)',
                            (delivery_id, event_id, ident, channel, destination, time.time()))
        return created

    def settings(self, user, payload):
        ident = user_id(user)
        email = payload.get('email', '')
        if not isinstance(email, str):
            raise ValueError('이메일 형식')
        email = email.strip()
        enabled = payload.get('enabled') is True
        if email and (len(email) > 254 or not re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+', email)):
            raise ValueError('이메일 형식')
        if enabled and not email:
            raise ValueError('수신 이메일 필요')
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            cur.execute('SELECT * FROM gb_experience_settings WHERE visitor_id=%s FOR UPDATE', (ident,))
            settings = cur.fetchone()
            verified = bool(settings['email_verified'] and settings['email'] == email)
            if enabled and not verified:
                # Limits use an independent transaction so failures cannot roll them back.
                self._rate('verify-minute:' + ident, 1, 60)
                self._rate('verify-owner:' + ident, 6, 3600)
                self._rate('verify-email:' + email.casefold(), 6, 3600)
                self._rate('verify-ip:' + visitor['creation_ip_hash'], 20, 3600)
                verification_id, code = secrets.token_hex(16), f'{secrets.randbelow(1_000_000):06d}'
                code_hash = digest(verification_id + ':' + code)
                expiry = time.time() + VERIFY_SECONDS
            else:
                verification_id = code_hash = None
                expiry = 0
            cur.execute('UPDATE gb_experience_settings SET email=%s,email_enabled=%s,email_verified=%s,'
                        'verification_id=%s,verification_hash=%s,verification_expires=%s,verification_attempts=0 '
                        'WHERE visitor_id=%s', (email, enabled and verified, verified, verification_id, code_hash, expiry, ident))
            # Disabling/changing a recipient cancels only this visitor's queued email.
            if settings['email'] != email or not enabled or verification_id:
                cur.execute("UPDATE gb_experience_deliveries SET status='cancelled',detail=%s WHERE visitor_id=%s "
                            "AND channel='email' AND status='pending'", ('이메일 설정 변경', ident))
            if verification_id:
                self._queue(cur, ident, None, digest('experience-verify:' + verification_id), 'verify_email', '',
                            '[GB system] 개인 체험 이메일 인증',
                            f'개인 체험 인증번호는 {code}입니다. 10분 안에 입력해 주세요.\n'
                            '본인이 요청한 경우에만 입력하세요. 인증 후 개인 체험 알림을 받습니다.',
                            time.time(), [('email', email)], verification_id)
        return dict(ok=True, verification_required=bool(verification_id),
                    email_enabled=bool(enabled and verified), email_verified=verified,
                    message='인증 메일을 요청했습니다. 받은 6자리 번호를 입력해 주세요.' if verification_id else '개인 이메일 설정을 저장했습니다.')

    def verify_email(self, user, payload):
        code = payload.get('code', '')
        if not isinstance(code, str) or not re.fullmatch(r'\d{6}', code):
            raise ValueError('6자리 인증번호 필요')
        failure = None
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            cur.execute('SELECT * FROM gb_experience_settings WHERE visitor_id=%s FOR UPDATE', (visitor['visitor_id'],))
            settings = cur.fetchone()
            if not settings['verification_hash'] or settings['verification_expires'] <= time.time():
                failure = AuthError('인증번호가 만료되었습니다. 인증 메일을 다시 요청해 주세요.', 400)
            elif settings['verification_attempts'] >= 5:
                failure = AuthError('인증 시도 횟수를 초과했습니다. 인증 메일을 다시 요청해 주세요.', 429)
            elif not hmac.compare_digest(settings['verification_hash'], digest(settings['verification_id'] + ':' + code)):
                cur.execute('UPDATE gb_experience_settings SET verification_attempts=verification_attempts+1 WHERE visitor_id=%s',
                            (visitor['visitor_id'],))
                failure = AuthError('인증번호를 확인해 주세요.', 400)
            else:
                cur.execute('UPDATE gb_experience_settings SET email_verified=1,email_enabled=1,verification_id=NULL,'
                            'verification_hash=NULL,verification_expires=0,verification_attempts=0 WHERE visitor_id=%s',
                            (visitor['visitor_id'],))
        if failure:
            raise failure
        return dict(ok=True, email_verified=True, email_enabled=True, message='이메일 인증을 완료했습니다.')

    def subscribe(self, user, payload):
        sub = notice_module.validate_subscription(payload.get('subscription'))
        endpoint = digest(sub['endpoint'])
        with notice_module.subscription_transaction(endpoint) as cur:
            visitor = self._visitor(cur, user, lock=True)
            # Read only: never take over a team's root-scope service worker endpoint.
            cur.execute('SELECT username FROM gb_push_subscriptions WHERE endpoint_hash=%s', (endpoint,))
            if cur.fetchone():
                raise AuthError('팀 앱과 분리된 개인 체험 앱에서 푸시를 연결해 주세요.', 409)
            cur.execute('SELECT visitor_id FROM gb_experience_subscriptions WHERE endpoint_hash=%s FOR UPDATE', (endpoint,))
            previous = cur.fetchone()
            if previous and previous['visitor_id'] != visitor['visitor_id']:
                raise AuthError('다른 개인 체험에 연결된 기기입니다. 연결 코드로 같은 체험에 입장해 주세요.', 409)
            cur.execute('SELECT COUNT(*) n FROM gb_experience_subscriptions WHERE visitor_id=%s', (visitor['visitor_id'],))
            if not previous and cur.fetchone()['n'] >= 8:
                raise AuthError('체험에는 최대 8개 기기까지 연결할 수 있습니다.', 429)
            cur.execute('INSERT INTO gb_experience_subscriptions(endpoint_hash,visitor_id,subscription_json,created_epoch) '
                        'VALUES(%s,%s,%s,%s) ON DUPLICATE KEY UPDATE subscription_json=VALUES(subscription_json)',
                        (endpoint, visitor['visitor_id'], json.dumps(sub, sort_keys=True), time.time()))
        return dict(ok=True, message='이 기기를 개인 체험에 연결했습니다.')

    def unsubscribe(self, user, payload):
        endpoint = payload.get('endpoint')
        if not isinstance(endpoint, str) or not endpoint or len(endpoint) > 4096:
            raise ValueError('현재 기기 endpoint 필요')
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            cur.execute('DELETE FROM gb_experience_subscriptions WHERE endpoint_hash=%s AND visitor_id=%s',
                        (digest(endpoint), visitor['visitor_id']))
        return dict(ok=True, message='현재 기기의 개인 체험 연결을 해제했습니다.')

    def pair_create(self, user):
        ident = user_id(user)
        self._rate('pair-create:' + ident, 5, PAIR_SECONDS)
        with transaction() as cur:
            self._visitor(cur, user, lock=True)
            cur.execute('DELETE FROM gb_experience_pairs WHERE visitor_id=%s', (ident,))
            for _ in range(5):
                code = f'{secrets.randbelow(100_000_000):08d}'
                cur.execute('INSERT IGNORE INTO gb_experience_pairs(code_hash,visitor_id,expires_epoch) VALUES(%s,%s,%s)',
                            (digest(code), ident, time.time() + PAIR_SECONDS))
                if cur.rowcount == 1:
                    break
            else:
                raise AuthError('연결 코드를 만들지 못했습니다. 다시 시도해 주세요.', 503)
        return dict(code=code, expires_in=PAIR_SECONDS)

    def pair_claim(self, payload, ip):
        self._rate('pair-guess-ip:' + digest(str(ip)[:256]), 10, PAIR_SECONDS)
        self._rate('pair-guess-global', 300, PAIR_SECONDS)
        code = payload.get('code', '')
        if not isinstance(code, str):
            raise ValueError('연결 코드 형식')
        code = re.sub(r'[\s-]', '', code).upper()
        if not re.fullmatch(r'[0-9]{8}', code):
            raise AuthError('연결 코드를 확인해 주세요.', 400)
        with transaction() as cur:
            cur.execute('SELECT * FROM gb_experience_pairs WHERE code_hash=%s FOR UPDATE', (digest(code),))
            pair = cur.fetchone()
            if not pair or pair['consumed_epoch'] is not None or pair['expires_epoch'] <= time.time():
                raise AuthError('연결 코드가 만료되었거나 이미 사용되었습니다.', 400)
            cur.execute('SELECT * FROM gb_experience_visitors WHERE visitor_id=%s', (pair['visitor_id'],))
            visitor = cur.fetchone()
            if not visitor or not visitor['active'] or visitor['expires_epoch'] <= time.time():
                raise AuthError('개인 체험이 만료되었습니다.', 400)
            cur.execute('UPDATE gb_experience_pairs SET consumed_epoch=%s WHERE code_hash=%s', (time.time(), digest(code)))
            return self._new_session(cur, visitor)

    def reset_round(self, user, payload):
        request_id = payload.get('request_id', '')
        if not isinstance(request_id, str) or not REQUEST_ID.fullmatch(request_id):
            raise ValueError('재시작 요청 식별자 필요')
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            ident = visitor['visitor_id']
            cur.execute('SELECT round_id,revision FROM gb_experience_rounds WHERE visitor_id=%s AND request_id=%s',
                        (ident, request_id))
            previous = cur.fetchone()
            if previous:
                if previous['round_id'] != visitor['current_round_id']:
                    raise AuthError('이미 다음 체험이 시작되었습니다. 현재 회차를 다시 불러와 주세요.', 409)
                return dict(id=previous['round_id'], revision=previous['revision'])
            if payload.get('expected_round_id') != visitor['current_round_id']:
                raise AuthError('다른 기기에서 체험을 다시 시작했습니다. 현재 회차를 다시 불러와 주세요.', 409)
            now = time.time()
            if now - visitor['last_round_epoch'] < 10:
                raise AuthError('체험을 시작한 직후입니다. 잠시 후 다시 시작해 주세요.', 429)
            cur.execute('SELECT COUNT(*) n FROM gb_experience_rounds WHERE visitor_id=%s AND created_epoch>%s',
                        (ident, now - 3600))
            if cur.fetchone()['n'] >= 20:
                raise AuthError('체험 재시작 횟수가 많습니다. 잠시 후 다시 시도해 주세요.', 429)
            round_id = secrets.token_hex(16)
            cur.execute('INSERT INTO gb_experience_rounds(round_id,visitor_id,revision,request_id,created_epoch) '
                        'VALUES(%s,%s,%s,%s,%s)', (round_id, ident, self.notifications.revision, request_id, now))
            cur.execute('UPDATE gb_experience_visitors SET current_round_id=%s,last_round_epoch=%s WHERE visitor_id=%s',
                        (round_id, now, ident))
            cur.execute("UPDATE gb_experience_deliveries d JOIN gb_experience_events e ON e.event_id=d.event_id "
                        "SET d.status='cancelled',d.detail=%s WHERE d.visitor_id=%s AND d.status='pending' "
                        "AND e.round_id IS NOT NULL", ('새 체험 회차 시작', ident))
        return dict(id=round_id, revision=self.notifications.revision)

    def _equipment(self, cur, visitor, equipment_id=None):
        clauses, args = [], []
        if visitor['process_key']:
            clauses.append('process=%s'); args.append(visitor['process_key'])
        if equipment_id is not None:
            clauses.append('equipment_id=%s'); args.append(equipment_id)
        cur.execute('SELECT equipment_id,equipment_name,location,process FROM equipment' +
                    (' WHERE ' + ' AND '.join(clauses) if clauses else '') + ' ORDER BY equipment_id', args)
        return cur.fetchall()

    def playback(self, user, payload):
        ident = user_id(user)
        if payload.get('actor_id') != ident:
            raise AuthError('개인 체험이 변경되었습니다. 새로고침해 주세요.', 403)
        eq_id, index = payload.get('equipment_id'), payload.get('sample_index')
        if not isinstance(eq_id, str) or type(index) is not int or index < 0 or index != self.notifications.indexes.get(eq_id):
            raise ValueError('최초 경보 측정 확인')
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            current = self._round(cur, visitor)
            if (payload.get('round_id') != current['id'] or payload.get('revision') != current['revision']
                    or current['revision'] != self.notifications.revision):
                raise AuthError('체험 회차나 데이터가 변경되었습니다. 다시 불러와 주세요.', 409)
            equipment = self._equipment(cur, visitor, eq_id)
            if not equipment:
                raise AuthError('선택한 체험 공정의 설비만 사용할 수 있습니다.', 403)
            eq = equipment[0]
            event_id = digest(f'experience:{ident}:{current["id"]}:{current["revision"]}:{eq_id}:{index}')
            created = self._queue(cur, ident, current['id'], event_id, 'playback', eq_id,
                                  '[개인 체험] ' + eq['equipment_name'] + ' 최초 경보',
                                  f'{eq["location"]} · {index + 1}번째 측정에서 최초 경보 조건 충족. '
                                  '실제 현장 경보가 아닌 개인 CSV 체험 알림입니다.',
                                  time.time(), self._destinations(cur, ident))
        return dict(ok=True, event_id=event_id, created=created)

    def start_notice(self, user, kind):
        if kind not in ('test', 'csv'):
            raise ValueError('체험 알림 종류')
        with transaction() as cur:
            visitor = self._visitor(cur, user, lock=True)
            ident, now = visitor['visitor_id'], time.time()
            wait = 15 if kind == 'test' else 125
            column = 'last_test_epoch' if kind == 'test' else 'last_csv_epoch'
            if now - visitor[column] < wait:
                raise AuthError('이전 체험 알림이 처리 중입니다. 잠시 기다려 주세요.', 429)
            current = self._round(cur, visitor)
            if current['revision'] != self.notifications.revision:
                raise AuthError('데이터가 변경되었습니다. 새 체험을 시작해 주세요.', 409)
            destinations = self._destinations(cur, ident)
            if not destinations:
                raise AuthError('먼저 개인 이메일을 인증하거나 이 기기 푸시를 연결해 주세요.', 400)
            self._rate('notice-hour:' + ident, 30, 3600)
            equipment = self._equipment(cur, visitor)
            job = secrets.token_hex(16)
            maximum = max(self.notifications.indexes.values(), default=1) or 1
            for eq in equipment[:1] if kind == 'test' else equipment:
                index = self.notifications.indexes.get(eq['equipment_id'], -1)
                if kind == 'csv' and index < 0:
                    continue
                due = now + (10 if kind == 'test' else max(3, 120 * index / maximum))
                self._queue(cur, ident, current['id'], digest('experience-test:' + job + ':' + eq['equipment_id']),
                            kind, eq['equipment_id'], '[개인 체험] ' + eq['equipment_name'] +
                            (' 알림 테스트' if kind == 'test' else ' 최초 경보'),
                            '실제 현장 경보가 아닌 본인만 받는 개인 체험 알림입니다.', due, destinations)
            cur.execute(f'UPDATE gb_experience_visitors SET {column}=%s WHERE visitor_id=%s', (now, ident))
        return dict(ok=True, job_id=job, message='10초 후 본인에게 알림을 보냅니다.' if kind == 'test' else '개인 CSV 경보를 2분 동안 요약 재생합니다.')

    def _delivery_allowed(self, cur, delivery):
        cur.execute('SELECT * FROM gb_experience_visitors WHERE visitor_id=%s', (delivery['visitor_id'],))
        visitor = cur.fetchone()
        if not visitor or not visitor['active'] or visitor['expires_epoch'] <= time.time():
            return False
        if delivery['event_kind'] == 'verify_email':
            cur.execute('SELECT email,verification_id,verification_expires FROM gb_experience_settings WHERE visitor_id=%s',
                        (delivery['visitor_id'],))
            settings = cur.fetchone()
            return bool(settings and settings['verification_id'] == delivery['verification_id']
                        and settings['verification_expires'] > time.time() and settings['email'] == delivery['destination'])
        if delivery['round_id'] != visitor['current_round_id']:
            return False
        if delivery['channel'] == 'email':
            cur.execute('SELECT email,email_enabled,email_verified FROM gb_experience_settings WHERE visitor_id=%s',
                        (delivery['visitor_id'],))
            settings = cur.fetchone()
            return bool(settings and settings['email_enabled'] and settings['email_verified']
                        and settings['email'] == delivery['destination'])
        if delivery['channel'] == 'push':
            sub = _json(delivery['destination'])
            cur.execute('SELECT subscription_json FROM gb_experience_subscriptions WHERE endpoint_hash=%s AND visitor_id=%s',
                        (digest(sub['endpoint']), delivery['visitor_id']))
            current = cur.fetchone()
            return bool(current and _json(current['subscription_json']) == sub)
        return False

    def process_one(self):
        # Screen-only experience: never dispatch older queued visitor mail/push.
        return False

    def _legacy_process_one(self):
        """Claim one due personal delivery. Never retry an uncertain provider reply."""
        with transaction() as cur:
            cur.execute('SELECT d.*,e.title,e.body,e.equipment_id,e.kind AS event_kind,e.round_id,e.verification_id '
                        'FROM gb_experience_deliveries d JOIN gb_experience_events e ON e.event_id=d.event_id '
                        "WHERE d.status='pending' AND e.due_epoch<=%s ORDER BY d.created_epoch LIMIT 1 FOR UPDATE SKIP LOCKED",
                        (time.time(),))
            delivery = cur.fetchone()
            if not delivery:
                return False
            if not self._delivery_allowed(cur, delivery):
                cur.execute("UPDATE gb_experience_deliveries SET status='cancelled',detail=%s WHERE delivery_id=%s",
                            ('설정·연결·체험 회차 변경', delivery['delivery_id']))
                return True
            cur.execute("UPDATE gb_experience_deliveries SET status='sending' WHERE delivery_id=%s", (delivery['delivery_id'],))
        delivery['kind'] = 'experience'
        delivery['url'] = '/experience/#/notifications' if delivery['event_kind'] == 'verify_email' else '/experience/#/equipment/' + delivery['equipment_id']
        try:
            status, detail = self.notifications.send_delivery(delivery)
            if status not in ('sent', 'dry_run', 'failed'):
                status, detail = 'failed', '전송 상태 확인 필요; 자동 재발송 없음'
        except Exception as error:
            status, detail = 'failed', type(error).__name__ + ': 전송 상태 확인 필요; 자동 재발송 없음'
        with transaction() as cur:
            cur.execute('UPDATE gb_experience_deliveries SET status=%s,detail=%s WHERE delivery_id=%s',
                        (status, str(detail)[:300], delivery['delivery_id']))
        return True
