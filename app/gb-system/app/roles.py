"""[ROLE PREVIEW] Passwordless demo selection; NOT identity authentication.

Only server-defined profiles determine the scope. Existing users/audit history
remain intact. Enable this module only with GB_DEMO_ROLE_SELECTION=1.
"""
import secrets
import time
from auth import AuthStore, AuthError, SESSION_SECONDS, fingerprint


def public_role(row):
    process = row['process_key'] or None
    return dict(id=row['username'], name=row['display_name'], role=row['role_key'],
                title='설비 팀장' if not process else '현장관리자', process=process,
                scope={'sinter': '소결공정', 'steel': '제강공정'}.get(process, '전체 제철소'),
                avatar={'ksm123': 1, 'joy123': 2, 'kmj123': 0}[row['username']],
                home='#/process/' + process if process else '#/', demo=True)


class DemoRoleStore(AuthStore):
    def profiles(self):
        with self.db() as conn, conn.cursor() as cur:
            cur.execute('SELECT u.*,r.role_key,r.process_key FROM gb_demo_roles r '
                        'JOIN gb_users u ON u.username=r.username WHERE u.active=1 ORDER BY r.sort_order')
            return [public_role(row) for row in cur.fetchall()]

    def ready(self):
        return len(self.profiles()) == 3

    def select(self, username, previous_token=''):
        profiles = {p['id']: p for p in self.profiles()}
        if not isinstance(username, str) or username not in profiles:
            raise AuthError('화면에 표시된 관리자를 선택해 주세요.', 400)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.db() as conn, conn.cursor() as cur:
            cur.execute('DELETE FROM gb_sessions WHERE token_hash=%s OR expires_at<=%s',
                        (fingerprint(previous_token), int(time.time())))
            cur.execute('INSERT INTO gb_sessions(token_hash,username,csrf,expires_at) VALUES(%s,%s,%s,%s)',
                        (fingerprint(token), username, csrf, int(time.time()) + SESSION_SECONDS))
        return token, dict(user=profiles[username], csrf=csrf)

    def session(self, token):
        if not token or len(token) > 128:
            return None
        with self.db() as conn, conn.cursor() as cur:
            cur.execute('SELECT u.*,r.role_key,r.process_key,s.csrf FROM gb_sessions s '
                        'JOIN gb_users u ON u.username=s.username JOIN gb_demo_roles r ON r.username=u.username '
                        'WHERE s.token_hash=%s AND s.expires_at>%s AND u.active=1',
                        (fingerprint(token), int(time.time())))
            row = cur.fetchone()
        return dict(user=public_role(row), csrf=row['csrf']) if row else None


def allowed_ids(user, cur=None):
    # A missing role on the legacy authenticated store retains the original scope.
    if cur is None:
        from mysql_store import connect
        with connect() as conn, conn.cursor() as cursor:
            return allowed_ids(user, cursor)
    if user.get('process'):
        cur.execute('SELECT equipment_id FROM equipment WHERE process=%s', (user['process'],))
    else:
        cur.execute('SELECT equipment_id FROM equipment')
    return {r['equipment_id'] for r in cur.fetchall()}


def assert_equipment(user, equipment_id, cur):
    if equipment_id not in allowed_ids(user, cur):
        raise AuthError('담당 공정의 설비만 조회하거나 수정할 수 있습니다.', 403)


def scoped(data, user):
    ids = allowed_ids(user)
    return {key: [r for r in rows if r.get('equipment_id') in ids]
            for key, rows in data.items()}


def activity(user):
    import mysql_store
    data = mysql_store.my_activity(user)
    result = scoped({k: v for k, v in data.items() if k != 'counts'}, user)
    result['counts'] = {k: len(v) for k, v in result.items()}
    result['counts']['authored'] = len(result['inspections']) + len(result['calendar_schedules'])
    return result
