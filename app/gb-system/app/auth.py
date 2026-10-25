# [LOGIN ADD] 신규 파일: 5개 동일 권한 계정, 비밀번호 해시와 서버 세션 관리.
"""Five equal-permission accounts; passwords and sessions never go to the browser.

MySQL stores accounts, sessions and audit metadata. Existing business tables
remain unchanged. Call tools/manage_users.py once to enroll
the five members. Demo setup explicitly uses ID-equals-password; no public registration exists.
"""
import hashlib
import hmac
import secrets
import time
from contextlib import contextmanager
from pathlib import Path

TEAM = [('ksm123', '김수민'), ('kmj123', '강민준'), ('joy123', '정온유'),
        ('ssy123', '송상엽'), ('lsm123', '이수민')]
ITERATIONS = 600_000
SESSION_SECONDS = 8 * 60 * 60
WINDOW = 300


class AuthError(ValueError):
    def __init__(self, message, status=401):
        super().__init__(message)
        self.status = status


def hash_password(password, *, team_demo=False):
    # [LOGIN CHANGE] Explicit team-demo policy. General administrator resets still require 12+ chars.
    demo_value = team_demo and password in {u for u, _ in TEAM}
    if not isinstance(password, str) or not (demo_value or 12 <= len(password) <= 128):
        raise AuthError('비밀번호는 12~128자로 입력해 주세요.', 400)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}'


def verify_password(password, encoded):
    if not isinstance(password, str) or len(password) > 128:
        return False
    algorithm, rounds, salt, expected = encoded.split('$')
    if algorithm != 'pbkdf2_sha256':
        return False
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
    return hmac.compare_digest(actual.hex(), expected)


def fingerprint(token):
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(row):
    return {'id': row['username'], 'name': row['display_name'], 'role': 'member', 'title': '관리자'}


class AuthStore:
    """[LOGIN ADD] Accounts/sessions use the same persistent MySQL database."""
    def __init__(self, path=None):
        self.dummy = hash_password(secrets.token_urlsafe(24))

    @contextmanager
    def db(self):
        from mysql_store import connect
        conn = connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def ready(self):
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM gb_users WHERE active=1")
            return cur.fetchone()['n'] == 5

    def configure_team_demo_passwords(self):
        """[LOGIN CHANGE] Server-only setup: exactly five accounts, password equals own ID.

        Existing business records and account names are preserved. This method is
        never exposed as an HTTP endpoint. Repeated calls leave matching hashes alone.
        """
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK('gb_login_enroll',10) AS acquired")
            if cur.fetchone()['acquired'] != 1:
                raise AuthError('계정 설정이 진행 중입니다.',409)
            try:
                cur.execute('SELECT * FROM gb_users ORDER BY username FOR UPDATE')
                rows = cur.fetchall()
                expected = dict(TEAM)
                if rows and ({r['username'] for r in rows} != set(expected)
                             or any(not r['active'] or r['display_name'] != expected[r['username']] for r in rows)):
                    raise AuthError('기존 계정 구성이 다릅니다. 계정을 변경하지 않았습니다.',409)
                if not rows:
                    cur.executemany('INSERT INTO gb_users(username,display_name,password_hash) VALUES(%s,%s,%s)',
                                    [(u,n,hash_password(u,team_demo=True)) for u,n in TEAM])
                else:
                    for row in rows:
                        username = row['username']
                        if not verify_password(username,row['password_hash']):
                            cur.execute('UPDATE gb_users SET password_hash=%s WHERE username=%s',
                                        (hash_password(username,team_demo=True),username))
                            cur.execute('DELETE FROM gb_sessions WHERE username=%s',(username,))
                            cur.execute('DELETE FROM gb_login_attempts WHERE bucket=%s',('user:'+username,))
                conn.commit()
            finally:
                cur.execute("SELECT RELEASE_LOCK('gb_login_enroll')")

    def enroll(self, passwords):
        hashes = {u: hash_password(passwords[u]) for u, _ in TEAM}
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK('gb_login_enroll',10) AS acquired")
            if cur.fetchone()['acquired'] != 1:
                raise AuthError('계정 초기 설정이 진행 중입니다.',409)
            try:
                cur.execute("SELECT COUNT(*) AS n FROM gb_users")
                if cur.fetchone()['n']:
                    raise AuthError('기존 계정이 있음. reset-password를 사용해 주세요.',409)
                cur.executemany("INSERT INTO gb_users(username,display_name,password_hash) VALUES(%s,%s,%s)",
                                [(u,name,hashes[u]) for u,name in TEAM])
                conn.commit()
            finally:
                cur.execute("SELECT RELEASE_LOCK('gb_login_enroll')")

    def login(self, username, password, ip, previous_token=''):
        username = username.strip().lower() if isinstance(username,str) else ''
        if len(username)>64: username=''
        now=int(time.time())
        rejected=False
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT GET_LOCK('gb_login_attempt',10) AS acquired")
            if cur.fetchone()['acquired']!=1:
                raise AuthError('잠시 후 다시 로그인해 주세요.',429)
            try:
                cur.execute("DELETE FROM gb_login_attempts WHERE reset_at<=%s",(now,))
                cur.execute("DELETE FROM gb_sessions WHERE expires_at<=%s",(now,))
                buckets=[('user:'+username,8),('ip:'+ip,40)]
                for key,limit in buckets:
                    cur.execute("SELECT attempts FROM gb_login_attempts WHERE bucket=%s",(key,))
                    row=cur.fetchone()
                    if row and row['attempts']>=limit:
                        raise AuthError('로그인 시도가 많음. 5분 뒤 다시 시도해 주세요.',429)
                cur.execute("SELECT * FROM gb_users WHERE username=%s FOR UPDATE",(username,))
                user=cur.fetchone()
                valid=verify_password(password,user['password_hash'] if user else self.dummy)
                if not user or not user['active'] or not valid:
                    for key,_ in buckets:
                        cur.execute("INSERT INTO gb_login_attempts(bucket,attempts,reset_at) VALUES(%s,1,%s) "
                                    "ON DUPLICATE KEY UPDATE attempts=attempts+1",(key,now+WINDOW))
                    rejected=True
                else:
                    cur.execute("DELETE FROM gb_login_attempts WHERE bucket=%s",('user:'+username,))
                    cur.execute("DELETE FROM gb_sessions WHERE token_hash=%s",(fingerprint(previous_token),))
                    token,csrf=secrets.token_urlsafe(32),secrets.token_urlsafe(32)
                    cur.execute("INSERT INTO gb_sessions(token_hash,username,csrf,expires_at) VALUES(%s,%s,%s,%s)",
                                (fingerprint(token),username,csrf,now+SESSION_SECONDS))
                    result=(token,{'user':public_user(user),'csrf':csrf})
                conn.commit()
            finally:
                cur.execute("SELECT RELEASE_LOCK('gb_login_attempt')")
        if rejected: raise AuthError('아이디 또는 비밀번호를 확인해 주세요.')
        return result

    def session(self, token):
        if not token or len(token)>128: return None
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT u.*,s.csrf FROM gb_sessions s JOIN gb_users u ON u.username=s.username "
                        "WHERE s.token_hash=%s AND s.expires_at>%s AND u.active=1",
                        (fingerprint(token),int(time.time())))
            row=cur.fetchone()
        return {'user':public_user(row),'csrf':row['csrf']} if row else None

    def logout(self, token):
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM gb_sessions WHERE token_hash=%s",(fingerprint(token),))

    def change_password(self, username, password, current=None):
        encoded=hash_password(password)
        with self.db() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM gb_users WHERE username=%s FOR UPDATE",(username,))
            row=cur.fetchone()
            if not row or (current is not None and not verify_password(current,row['password_hash'])):
                raise AuthError('현재 비밀번호를 확인해 주세요.',400)
            cur.execute("UPDATE gb_users SET password_hash=%s WHERE username=%s",(encoded,username))
            cur.execute("DELETE FROM gb_sessions WHERE username=%s",(username,))
            cur.execute("DELETE FROM gb_login_attempts WHERE bucket=%s",('user:'+username,))
