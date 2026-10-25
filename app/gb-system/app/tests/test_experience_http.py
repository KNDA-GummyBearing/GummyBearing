"""Local preview HTTP contract check. No external delivery or production calls."""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mysql_store import connect
from notifications import Notifications

BASE = 'http://127.0.0.1:8000'
ORIGIN = 'http://127.0.0.1:18084'
TABLES = ('gb_users', 'gb_notice_settings', 'gb_push_subscriptions', 'gb_alert_jobs',
          'gb_alert_events', 'gb_alert_deliveries', 'inspections', 'follow_ups',
          'gb_schedule_approvals', 'gb_completion_approvals')

class Client:
    def __init__(self):
        self.cookie = ''
        self.csrf = ''

    def request(self, path, payload=None, csrf=True, origin=ORIGIN):
        headers = {'Cookie': self.cookie}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers.update({'X-GB-Request': '1', 'Content-Type': 'application/json', 'Origin': origin})
            if csrf: headers['X-CSRF-Token'] = self.csrf
        req = urllib.request.Request(BASE + path, body, headers)
        try: response = urllib.request.urlopen(req, timeout=15)
        except urllib.error.HTTPError as error: response = error
        raw = response.read()
        cookie = response.headers.get('Set-Cookie')
        if cookie: self.cookie = cookie.split(';')[0]
        value = json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw
        if isinstance(value, dict) and value.get('csrf'): self.csrf = value['csrf']
        return response.status, value, dict(response.headers)

def snapshot():
    with connect() as conn, conn.cursor() as cur:
        result = {}
        for table in TABLES:
            cur.execute('SELECT * FROM ' + table)
            rows = sorted(json.dumps(row, sort_keys=True, default=str) for row in cur.fetchall())
            result[table] = hashlib.sha256(json.dumps(rows).encode()).hexdigest()
        return result

from unittest.mock import Mock
from experience import Experience, public_user

class ScreenExperienceTests(unittest.TestCase):
    def test_screen_only_endpoints_and_team_isolation(self):
        assert os.environ.get('GB_EMAIL_SEND')==os.environ.get('GB_PUSH_SEND')=='0'
        before=snapshot()
        c=Client();api='/experience/api'
        self.assertEqual([p['id'] for p in c.request(api+'/demo/profiles')[1]['profiles']],['all'])
        status,session,headers=c.request(api+'/demo/select',{'username':'all'})
        self.assertEqual(status,200,session)
        self.assertEqual(session['user']['home'],'#/')
        self.assertIsNone(session['user']['process'])
        self.assertFalse(session['user']['capabilities']['personal_notifications'])
        for path in ('/notifications/settings','/notifications/verify-email','/notifications/subscribe',
                     '/notifications/unsubscribe','/notifications/playback','/notifications/round/reset',
                     '/notifications/start','/pair/create','/pair/claim','/approvals/submit',
                     '/approvals/decide','/completions/submit','/maintenance'):
            self.assertEqual(c.request(api+path,{})[0],403,path)
        for path in ('/notifications','/notifications/round'):
            self.assertEqual(c.request(api+path)[0],403,path)
        self.assertEqual(c.request('/api/notifications')[0],401)
        equipment=c.request(api+'/equipment')[1]['records']
        self.assertEqual({r['process'] for r in equipment},{'sinter','steel'})
        self.assertEqual(c.request(api+'/maintenance')[0],200)
        self.assertEqual(c.request(api+'/demo/select',{'username':'steel'})[0],400)
        c.request(api+'/auth/logout',{})
        self.assertEqual(c.request(api+'/auth/session')[0],401)
        self.assertEqual(snapshot(),before)

    def test_old_visitor_sessions_also_become_screen_only(self):
        user=public_user(dict(visitor_id='a'*32,display_name='방문자',process_key='steel'))
        self.assertIsNone(user['process'])
        self.assertEqual(user['home'],'#/')
        self.assertFalse(user['capabilities']['personal_notifications'])

    def test_pending_visitor_delivery_cannot_call_adapter(self):
        adapter=Mock()
        service=Experience(adapter)
        self.assertFalse(service.process_one())
        adapter.send_delivery.assert_not_called()

if __name__=='__main__': unittest.main()
