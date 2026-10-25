"""[ALERT APP + EMAIL] One server worker, two delivery adapters.

No browser polling is required after a demo is started. Jobs/events are persisted
in MySQL; event IDs prevent repeated delivery when the same sample is checked.
External delivery defaults to OFF. A crash during delivery leaves 'sending'
unretried: SMTP cannot guarantee exactly-once delivery after an uncertain reply.
"""
import csv
from contextlib import contextmanager
import hashlib
import json
import os
import re
import secrets
import smtplib
import ssl
import statistics
import threading
import time
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlsplit
from auth import AuthError
from mysql_store import connect, read_tables
from roles import allowed_ids, DemoRoleStore

ROOT = Path(__file__).resolve().parent
STATE = Path(os.getenv('GB_STATE_DIR', '/login-state'))
EMAIL_SEND = os.getenv('GB_EMAIL_SEND') == '1'
PUSH_SEND = os.getenv('GB_PUSH_SEND') == '1'
KEYS = [f'{a}_{f}' for a in ('h','v') for f in ('rms','peak','kurtosis')]


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


@contextmanager
def subscription_transaction(endpoint_hash):
    """Serialize ownership checks across the team and personal tables.

    MySQL named locks are connection-scoped, so keep the lock until the write
    commits or rolls back. No table reads may precede the lock in this transaction.
    """
    lock_name = 'gb-push:' + endpoint_hash[:56]  # MySQL limit: 64 characters.
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT GET_LOCK(%s,5) acquired', (lock_name,))
            if cur.fetchone()['acquired'] != 1:
                raise AuthError('이 기기 연결을 처리 중입니다. 잠시 후 다시 시도해 주세요.', 429)
            try:
                yield cur
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
            finally:
                cur.execute('SELECT RELEASE_LOCK(%s)', (lock_name,))
    finally:
        # Closing also releases the lock if an exceptional disconnect prevents
        # explicit RELEASE_LOCK. Never leave a pooled owner lock behind.
        conn.close()


def event_recipients(event, profiles, process):
    """Approval requests go only to the lead; decisions return to the requester.

    Playback/demo alarms go only to the account that started that run.
    Recipients come from persisted server roles, never a browser-supplied list.
    """
    if event['kind'] == 'approval_request':
        return [u for u in profiles if u['role'] == 'supervisor']
    if event['kind'] in ('approval_approved', 'approval_rejected'):
        return [u for u in profiles if u['id'] == event['username']
                and (not u['process'] or u['process'] == process)]
    if event['kind'] in ('playback', 'playback_round', 'csv', 'test'):
        return [u for u in profiles if u['id'] == event['username']
                and (not u['process'] or u['process'] == process)]
    return [u for u in profiles if (not u['process'] or u['process'] == process)
            and (event['kind'] != 'test' or u['id'] == event['username'])]


def event_url(delivery):
    if delivery.get('kind') == 'experience':
        return '/experience/#/equipment/' + delivery['equipment_id'] if delivery.get('equipment_id') else '/experience/#/notifications'
    # Approval notifications open the review queue rather than a fan detail page.
    return '/#/approvals' if delivery.get('kind', '').startswith('approval_') else '/#/equipment/' + delivery['equipment_id']


def first_alarm(series):
    # Same N20 / sample standard deviation / 2 of 3 / consecutive 4 rule as engine.js.
    thresholds = {k: statistics.mean([r[k] for r in series[:20]]) +
                     3 * statistics.stdev([r[k] for r in series[:20]]) for k in KEYS}
    runs = dict.fromkeys(KEYS, 0)
    for i, row in enumerate(series):
        for k in KEYS:
            runs[k] = runs[k] + 1 if i >= 20 and row[k] > thresholds[k] else 0
        if any(sum(runs[f'{a}_{f}'] >= 4 for f in ('rms','peak','kurtosis')) >= 2 for a in ('h','v')):
            return i
    return -1


def alarm_indexes():
    by = {}
    with (ROOT/'data/sensor_timeseries.csv').open(encoding='utf-8-sig', newline='') as handle:
        for row in csv.DictReader(handle):
            by.setdefault(row['equipment_id'], []).append({k: float(row[k]) for k in KEYS})
    return {key: first_alarm(series) for key, series in by.items()}


def vapid_keys():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    import base64
    STATE.mkdir(parents=True, exist_ok=True)
    path = STATE/'vapid-private.pem'
    if not path.exists():
        key = ec.generate_private_key(ec.SECP256R1())
        path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                          serialization.NoEncryption()))
    key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return str(path), base64.urlsafe_b64encode(public).decode().rstrip('=')


def validate_subscription(subscription):
    if not isinstance(subscription, dict):
        raise ValueError('구독 정보 형식')
    endpoint = subscription.get('endpoint', '')
    if not isinstance(endpoint, str) or len(endpoint) > 4096:
        raise ValueError('푸시 주소 길이')
    url = urlsplit(endpoint)
    host = url.hostname or ''
    known = host == 'fcm.googleapis.com' or host.endswith('.push.apple.com') or host.endswith('.push.services.mozilla.com')
    if url.scheme != 'https' or not known or url.port not in (None, 443) or url.username or url.password:
        raise ValueError('지원하지 않는 푸시 제공자')
    keys = subscription.get('keys', {})
    if not isinstance(keys, dict) or any(not re.fullmatch(r'[A-Za-z0-9_-]{16,200}={0,2}', str(keys.get(k,''))) for k in ('auth','p256dh')):
        raise ValueError('푸시 키 형식')
    return dict(endpoint=endpoint, keys={k: keys[k] for k in ('auth','p256dh')})


class Notifications:
    def __init__(self, role_store=None):
        # Reuse the initialized store: constructing one hashes a dummy password.
        # profiles() still reads current roles through a fresh DB connection per poll.
        self.role_store = role_store if role_store is not None else DemoRoleStore()
        self.indexes = alarm_indexes()
        # Stable across deployments/roles. Replaying the same measurement must not
        # notify every phone again just because another PC opened the dashboard.
        self.revision = hashlib.sha256(b'n20-b2of3x4-v1\n' +
            (ROOT/'data/sensor_timeseries.csv').read_bytes()).hexdigest()
        self.private_key, self.public_key = vapid_keys()
        self.stop = threading.Event()

    def _playback_round(self, cur, user):
        # Lock the account, not a global row: separate roles never reset each other.
        cur.execute('SELECT username FROM gb_users WHERE username=%s AND active=1 FOR UPDATE', (user['id'],))
        if not cur.fetchone():
            raise AuthError('현재 담당자를 확인하지 못했습니다.', 403)
        cur.execute("SELECT job_id,created_epoch FROM gb_alert_jobs WHERE username=%s "
                    "AND kind='playback_round' ORDER BY created_epoch DESC,job_id DESC LIMIT 1", (user['id'],))
        row = cur.fetchone()
        if not row:
            row = dict(job_id=digest('team-round:initial:' + user['id'] + self.revision)[:32], created_epoch=time.time())
            cur.execute('INSERT INTO gb_alert_jobs(job_id,username,kind,created_epoch) VALUES(%s,%s,%s,%s)',
                        (row['job_id'], user['id'], 'playback_round', row['created_epoch']))
        return row

    def current_round(self, user):
        with connect() as conn, conn.cursor() as cur:
            row = self._playback_round(cur, user)
            conn.commit()
        return dict(id=row['job_id'], revision=self.revision)

    def reset_round(self, user, payload):
        request_id = payload.get('request_id')
        if not isinstance(request_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,100}', request_id):
            raise ValueError('재생 요청 번호 형식')
        ident = digest('team-round:' + user['id'] + ':' + self.revision + ':' + request_id)[:32]
        with connect() as conn, conn.cursor() as cur:
            current = self._playback_round(cur, user)
            cur.execute('SELECT job_id FROM gb_alert_jobs WHERE job_id=%s AND username=%s', (ident, user['id']))
            previous = cur.fetchone()
            if previous:
                if current['job_id'] != ident:
                    raise AuthError('이미 다음 재생 회차가 시작되었습니다. 새로고침해 주세요.', 409)
            else:
                if payload.get('expected_round_id') != current['job_id']:
                    raise AuthError('다른 화면에서 재생을 다시 시작했습니다. 새로고침해 주세요.', 409)
                initial = digest('team-round:initial:' + user['id'] + self.revision)[:32]
                if current['job_id'] != initial and time.time() - current['created_epoch'] < 10:
                    raise AuthError('재생을 다시 시작한 직후입니다. 잠시 후 다시 눌러 주세요.', 429)
                cur.execute('INSERT INTO gb_alert_jobs(job_id,username,kind,created_epoch) VALUES(%s,%s,%s,%s)',
                            (ident, user['id'], 'playback_round', time.time()))
                # Cancel only unsent alarms from this account's prior round.
                cur.execute("UPDATE gb_alert_events SET processed=1 WHERE job_id=%s AND processed=0", (current['job_id'],))
                cur.execute("UPDATE gb_alert_deliveries d JOIN gb_alert_events e ON e.event_id=d.event_id "
                            "SET d.status='cancelled',d.detail='새 재생 회차 시작' WHERE e.job_id=%s AND d.status='pending'",
                            (current['job_id'],))
            conn.commit()
        return dict(id=ident, revision=self.revision)

    def playback(self, user, payload):
        """Bridge ordinary browser CSV playback to the persistent delivery worker.

        The browser reports a sample, never a recipient, title or verdict. The
        server independently checks its CSV rule and the selected role's scope.
        One event per account/round/equipment. Reloads retry; explicit resets resend.
        """
        if payload.get('actor_id') != user['id']:
            raise AuthError('담당자가 변경되었습니다. 새로고침해 주세요.', 403)
        if payload.get('revision') != self.revision:
            raise AuthError('데이터가 업데이트되었습니다. 새로고침해 주세요.', 409)
        eq_id, index = payload.get('equipment_id'), payload.get('sample_index')
        if not isinstance(eq_id, str) or eq_id not in allowed_ids(user):
            raise AuthError('담당 공정의 설비만 알림을 등록할 수 있습니다.', 403)
        if type(index) is not int or index < 0 or index != self.indexes.get(eq_id):
            raise ValueError('서버의 최초 경보 측정과 일치하지 않습니다.')
        equipment = next(e for e in read_tables(['equipment'])['equipment'] if e['equipment_id'] == eq_id)
        title = '[CSV 재생] ' + equipment['equipment_name'] + ' 최초 경보'
        body = (f"{equipment['location']} · {index + 1}번째 측정에서 2/3·연속 4회 조건 충족. "
                '현재 CSV 재생 데이터의 경보입니다.')
        with connect() as conn, conn.cursor() as cur:
            current = self._playback_round(cur, user)
            job = current['job_id']
            if payload.get('round_id') != job:
                raise AuthError('재생 회차가 변경되었습니다. 새로고침해 주세요.', 409)
            event = digest(f'playback:{user["id"]}:{job}:{self.revision}:{eq_id}:{index}')
            cur.execute('INSERT IGNORE INTO gb_alert_events(event_id,job_id,equipment_id,title,body,due_epoch) '
                        'VALUES(%s,%s,%s,%s,%s,%s)', (event, job, eq_id, title, body, time.time()))
            created = cur.rowcount == 1
            conn.commit()
        return dict(ok=True, event_id=event, created=created)

    def status(self, user):
        with connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT email,email_enabled FROM gb_notice_settings WHERE username=%s', (user['id'],))
            settings = cur.fetchone() or dict(email='', email_enabled=False)
            cur.execute('SELECT COUNT(*) n FROM gb_push_subscriptions WHERE username=%s', (user['id'],))
            subscriptions = cur.fetchone()['n']
            cur.execute('SELECT d.channel,d.status,d.detail,d.created_at,e.title,e.body,e.equipment_id '
                        'FROM gb_alert_deliveries d JOIN gb_alert_events e ON e.event_id=d.event_id '
                        'WHERE d.username=%s ORDER BY d.created_at DESC LIMIT 50', (user['id'],))
            rows = cur.fetchall()
        ids = allowed_ids(user)
        rows = [dict(r, created_at=str(r['created_at'])) for r in rows if r['equipment_id'] in ids]
        return dict(**settings, subscriptions=subscriptions, deliveries=rows, public_key=self.public_key,
                    email_live=EMAIL_SEND, push_live=PUSH_SEND)

    def settings(self, user, payload):
        email = payload.get('email', '').strip()
        enabled = payload.get('enabled') is True
        if email and (len(email) > 254 or not re.fullmatch(r'[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+', email)):
            raise ValueError('이메일 주소 형식')
        if enabled and not email:
            raise ValueError('수신 이메일 필요')
        with connect() as conn, conn.cursor() as cur:
            cur.execute('INSERT INTO gb_notice_settings(username,email,email_enabled) VALUES(%s,%s,%s) '
                        'ON DUPLICATE KEY UPDATE email=VALUES(email),email_enabled=VALUES(email_enabled)',
                        (user['id'], email, enabled)); conn.commit()
        return {'ok': True}

    def subscribe(self, user, payload):
        sub = validate_subscription(payload.get('subscription'))
        with subscription_transaction(digest(sub['endpoint'])) as cur:
            cur.execute('SELECT visitor_id FROM gb_experience_subscriptions WHERE endpoint_hash=%s', (digest(sub['endpoint']),))
            if cur.fetchone():
                raise AuthError('개인 체험에 연결된 푸시입니다. 팀 앱에서 별도로 연결해 주세요.', 409)
            # On a shared phone, this endpoint belongs to the most recently selected role.
            cur.execute('INSERT INTO gb_push_subscriptions(endpoint_hash,username,subscription_json) VALUES(%s,%s,%s) '
                        'ON DUPLICATE KEY UPDATE username=VALUES(username),subscription_json=VALUES(subscription_json)',
                        (digest(sub['endpoint']), user['id'], json.dumps(sub)))
        return {'ok': True}

    def unsubscribe(self, user):
        with connect() as conn, conn.cursor() as cur:
            cur.execute('DELETE FROM gb_push_subscriptions WHERE username=%s', (user['id'],)); conn.commit()
        return {'ok': True}

    def start(self, user, kind):
        if kind not in ('test', 'csv'):
            raise ValueError('시연 종류')
        if kind == 'csv' and user['role'] != 'supervisor':
            raise AuthError('전체 CSV 알림 시연은 설비 팀장만 시작할 수 있습니다.', 403)
        equipment = [e for e in read_tables(['equipment'])['equipment'] if e['equipment_id'] in allowed_ids(user)]
        now, job = time.time(), secrets.token_hex(16)
        maximum = max(self.indexes.values()) or 1
        with connect() as conn, conn.cursor() as cur:
            # Rate limit per selected role. Each click creates a separate, explicit demo run.
            cur.execute("SELECT MAX(created_epoch) t FROM gb_alert_jobs WHERE username=%s AND kind IN ('test','csv')", (user['id'],))
            last = cur.fetchone()['t']
            if last and now - last < (125 if kind == 'csv' else 15):
                raise AuthError('이전 알림 시연이 처리 중입니다. 잠시 후 다시 시도해 주세요.', 429)
            cur.execute('INSERT INTO gb_alert_jobs VALUES(%s,%s,%s,%s)', (job, user['id'], kind, now))
            for eq in equipment[:1] if kind == 'test' else equipment:
                index = self.indexes[eq['equipment_id']]
                if kind == 'csv' and index < 0:
                    continue
                due = now + (10 if kind == 'test' else max(3, 120 * index / maximum))
                title = '[시연] ' + eq['equipment_name'] + (' 알림 테스트' if kind == 'test' else ' 최초 경보')
                body = '실제 현장 경보가 아닙니다. ' + ('10초 예약 알림입니다.' if kind == 'test' else f'CSV {index + 1}번째 측정에서 2/3·연속 4회 조건 충족.')
                cur.execute('INSERT INTO gb_alert_events(event_id,job_id,equipment_id,title,body,due_epoch) VALUES(%s,%s,%s,%s,%s,%s)',
                            (digest(job + eq['equipment_id']), job, eq['equipment_id'], title, body, due))
            conn.commit()
        return dict(ok=True, job_id=job, message='10초 후 본인에게 알림' if kind == 'test' else '서버에서 CSV 최초 경보를 2분 동안 요약 재생합니다.')

    def enqueue(self):
        profiles = self.role_store.profiles()
        eq_process = {e['equipment_id']: e['process'] for e in read_tables(['equipment'])['equipment']}
        with connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT e.*,j.username,j.kind FROM gb_alert_events e JOIN gb_alert_jobs j ON j.job_id=e.job_id '
                        'WHERE e.processed=0 AND e.due_epoch<=%s FOR UPDATE', (time.time(),))
            for event in cur.fetchall():
                recipients = event_recipients(event, profiles, eq_process[event['equipment_id']])
                for user in recipients:
                    cur.execute('SELECT email FROM gb_notice_settings WHERE username=%s AND email_enabled=1', (user['id'],))
                    email = cur.fetchone()
                    cur.execute('SELECT subscription_json FROM gb_push_subscriptions WHERE username=%s', (user['id'],))
                    subscriptions = cur.fetchall()
                    destinations = [('email', email['email'])] if email else []
                    destinations += [('push', s['subscription_json']) for s in subscriptions]
                    # Preview captures prove both adapters are invoked without requiring an iPhone or real mail.
                    if not PUSH_SEND and not subscriptions:
                        destinations.append(('push', 'dry-run:no-device'))
                    if not EMAIL_SEND and not email:
                        destinations.append(('email', 'preview@example.invalid'))
                    for channel, destination in destinations:
                        ident = digest(event['event_id'] + user['id'] + channel + destination)
                        cur.execute('INSERT IGNORE INTO gb_alert_deliveries(delivery_id,event_id,username,channel,destination) VALUES(%s,%s,%s,%s,%s)',
                                    (ident, event['event_id'], user['id'], channel, destination))
                cur.execute('UPDATE gb_alert_events SET processed=1 WHERE event_id=%s', (event['event_id'],))
            conn.commit()

    def deliver(self):
        with connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT d.*,e.title,e.body,e.equipment_id,j.kind FROM gb_alert_deliveries d '
                        'JOIN gb_alert_events e ON e.event_id=d.event_id '
                        'JOIN gb_alert_jobs j ON j.job_id=e.job_id WHERE d.status=\'pending\' LIMIT 1 FOR UPDATE SKIP LOCKED')
            delivery = cur.fetchone()
            if not delivery:
                return False
            cur.execute("UPDATE gb_alert_deliveries SET status='sending' WHERE delivery_id=%s", (delivery['delivery_id'],)); conn.commit()
        status, detail = self.send_delivery(delivery)
        with connect() as conn, conn.cursor() as cur:
            cur.execute('UPDATE gb_alert_deliveries SET status=%s,detail=%s WHERE delivery_id=%s',
                        (status, detail, delivery['delivery_id'])); conn.commit()
        return True

    def send_delivery(self, delivery):
        """Delivery adapters only; queue ownership is controlled by the caller.

        Personal experiences never enter the team's recipient selection or queue.
        """
        payload = dict(title=delivery['title'], body=delivery['body'], tag=delivery['event_id'],
                       url=event_url(delivery))
        live = EMAIL_SEND if delivery['channel'] == 'email' else PUSH_SEND
        try:
            if not live:
                directory = STATE/'notification-captures'; directory.mkdir(exist_ok=True)
                if delivery['channel'] == 'email':
                    (directory/(delivery['delivery_id']+'.eml')).write_bytes(self.email_message(delivery).as_bytes())
                else:
                    (directory/(delivery['delivery_id']+'.json')).write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
                status, detail = 'dry_run', '발송 없이 생성 결과 저장'
            elif delivery['channel'] == 'email':
                # TLS verification is required. Never log the password or SMTP conversation.
                secret_file = Path(os.environ['GB_SMTP_PASSWORD_FILE'])
                with smtplib.SMTP('smtp.gmail.com', 587, timeout=20) as smtp:
                    smtp.ehlo(); smtp.starttls(context=ssl.create_default_context()); smtp.ehlo()
                    smtp.login(os.environ['GB_SMTP_USER'], secret_file.read_text().strip().replace(' ', ''))
                    smtp.send_message(self.email_message(delivery))
                status, detail = 'sent', '메일 서버 수락 (기기 수신은 별도 확인)'
            else:
                from pywebpush import webpush
                webpush(subscription_info=json.loads(delivery['destination']), data=json.dumps(payload, ensure_ascii=False),
                        vapid_private_key=self.private_key, vapid_claims={'sub': os.environ['GB_VAPID_SUBJECT']}, timeout=20)
                status, detail = 'sent', '푸시 서비스 수락 (기기 수신은 별도 확인)'
        except Exception as error:
            # A timeout can occur after the provider accepted the payload: do not auto-resend.
            status, detail = 'failed', type(error).__name__ + ': 설정 또는 제공자 응답 확인 필요; 자동 재발송 없음'
        return status, detail

    @staticmethod
    def email_message(delivery):
        message = EmailMessage()
        message['Subject'] = delivery['title']
        message['From'] = os.getenv('GB_SMTP_USER', 'preview@example.invalid')
        message['To'] = delivery['destination']
        label = '승인 요청 확인: ' if delivery.get('kind', '').startswith('approval_') else '설비 확인: '
        footer = '\n본인이 연결한 개인 알림 체험에서 확인하세요.' if delivery.get('kind') == 'experience' else '\n선택한 역할의 담당 공정에서 확인하세요.'
        message.set_content(delivery['body'] + '\n\n' + label + os.getenv('GB_PUBLIC_ORIGIN', '').rstrip('/') +
                            event_url(delivery) + footer)
        return message

    def run(self):
        while not self.stop.is_set():
            try:
                self.enqueue()
                for _ in range(30):
                    if not self.deliver(): break
            except Exception as error:
                print('Notification worker:', type(error).__name__, flush=True)
            try:
                if getattr(self, 'experience', None):
                    for _ in range(10):
                        if not self.experience.process_one(): break
            except Exception as error:
                # A visitor queue failure cannot stop team notifications.
                print('Experience worker:', type(error).__name__, flush=True)
            self.stop.wait(1)

    def start_worker(self):
        threading.Thread(target=self.run, name='gb-alert-worker', daemon=True).start()
