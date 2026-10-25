"""Private-experience integration tests: isolated MySQL + fake delivery only.

Emit fixture with --fixture, apply it with the LOCAL MySQL root helper, then run
with MYSQL_DATABASE=gb_experience_test_20261024 and both delivery flags=0.
No production calls, HTTP requests, email, or push provider calls are performed.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from auth import AuthError
import experience
from mysql_store import connect

DB = 'gb_experience_test_20261024'
TEAM_TABLES = ('gb_users', 'gb_notice_settings', 'gb_alert_jobs', 'gb_alert_events',
               'gb_alert_deliveries', 'gb_push_subscriptions', 'inspections', 'follow_ups')


def fixture():
    print(f'CREATE DATABASE IF NOT EXISTS {DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs; USE {DB};')
    print('CREATE TABLE IF NOT EXISTS equipment(equipment_id VARCHAR(32) PRIMARY KEY, '
          'equipment_name VARCHAR(100) NOT NULL, location VARCHAR(200) NOT NULL, process VARCHAR(24) NOT NULL);')
    print("INSERT IGNORE INTO equipment VALUES ('EGF-01','Fan 01','Sinter site','sinter'),"
          "('EGF-04','Fan 04','Steel site','steel');")
    for table in TEAM_TABLES:
        if table == 'gb_push_subscriptions':
            print('CREATE TABLE IF NOT EXISTS gb_push_subscriptions(endpoint_hash CHAR(64) PRIMARY KEY,'
                  'username VARCHAR(64) NOT NULL,subscription_json JSON NOT NULL);')
            sub = json.dumps(subscription('team-only'))
            print("INSERT IGNORE INTO gb_push_subscriptions VALUES ('" + experience.digest(subscription('team-only')['endpoint']) +
                  "','kmj123',CONVERT(X'" + sub.encode().hex() + "' USING utf8mb4));")
        else:
            print(f'CREATE TABLE IF NOT EXISTS {table}(id VARCHAR(64) PRIMARY KEY,marker VARCHAR(100) NOT NULL);')
            print(f"INSERT IGNORE INTO {table} VALUES ('team-preserve','must-not-change');")
        print(f"GRANT SELECT ON {DB}.{table} TO 'gummy_app'@'%';")
    print(f"GRANT SELECT ON {DB}.equipment TO 'gummy_app'@'%';")
    sql = (ROOT.parent/'migrations/experience_additive.sql').read_text(encoding='utf-8')
    print(sql.replace('gummybearing_v5_draft.', DB + '.'))


def subscription(key):
    # Structurally valid provider subscription. FakeAdapter never sends it.
    return dict(endpoint='https://fcm.googleapis.com/fcm/send/experience-' + key,
                keys=dict(auth='abcdefghijklmnopqrstuv', p256dh='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ab'))


class FakeAdapter:
    revision = 'c' * 64
    public_key = 'local-test-public-key'
    indexes = {'EGF-01': 40, 'EGF-04': 60}

    def __init__(self):
        self.sent = []
        self.fail = False

    def send_delivery(self, delivery):
        self.sent.append(dict(delivery))
        if self.fail:
            raise TimeoutError('provider reply uncertain')
        return 'dry_run', '격리 테스트: 외부 전송 없음'


class ExperienceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ.get('MYSQL_DATABASE') == DB
        assert os.environ.get('GB_EMAIL_SEND') == os.environ.get('GB_PUSH_SEND') == '0'

    def setUp(self):
        self.adapter=FakeAdapter()
        self.service=experience.Experience(self.adapter)

    def test_only_integrated_entry_is_available(self):
        self.assertEqual([p['id'] for p in self.service.profiles()], ['all'])
        for scope in ('sinter','steel','iron'):
            with self.assertRaises(ValueError): self.service.start({'username':scope},'local-test')

    def test_session_restores_read_only_all_process_user(self):
        token,session=self.service.start({'username':'all'},'local-'+uuid.uuid4().hex)
        user=session['user']
        self.assertEqual(user['role'],'visitor')
        self.assertIsNone(user['process'])
        self.assertEqual(user['home'],'#/')
        self.assertFalse(user['capabilities']['personal_notifications'])
        self.assertFalse(user['capabilities']['business_write'])
        self.assertEqual(self.service.session(token),session)
        self.service.logout(token)
        self.assertIsNone(self.service.session(token))

    def test_legacy_scoped_sessions_open_integrated_view(self):
        for process in ('sinter','steel',None):
            user=experience.public_user(dict(visitor_id='a'*32,display_name='Visitor',process_key=process))
            self.assertIsNone(user['process'])
            self.assertFalse(user['capabilities']['personal_notifications'])

    def test_worker_cannot_dispatch_legacy_queue(self):
        self.assertFalse(self.service.process_one())
        self.assertEqual(self.adapter.sent,[])

if __name__=='__main__':
    if '--fixture' in sys.argv: fixture()
    else: unittest.main()
