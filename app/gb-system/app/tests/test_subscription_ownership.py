"""Real local MySQL cross-namespace ownership races, with delivery disabled.

The fixture creates only an isolated subscription database and fake team owner.
No notification adapter, HTTP request, VAPID initialization, or delivery runs.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import threading
import time
from types import SimpleNamespace
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from auth import AuthError
import experience
import notifications
from mysql_store import connect

DB = 'gb_subscription_test_20261024'
TEAM = dict(id='team-subscription-test', role='supervisor')


def fixture():
    print(f'CREATE DATABASE IF NOT EXISTS {DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs; USE {DB};')
    print('CREATE TABLE IF NOT EXISTS gb_users(username VARCHAR(64) COLLATE utf8mb4_0900_as_cs PRIMARY KEY);')
    print("INSERT IGNORE INTO gb_users VALUES ('team-subscription-test');")
    print('CREATE TABLE IF NOT EXISTS gb_push_subscriptions(endpoint_hash CHAR(64) PRIMARY KEY,'
          'username VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,subscription_json JSON NOT NULL,'
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(username) REFERENCES gb_users(username));')
    print(f"GRANT SELECT,INSERT,UPDATE,DELETE ON {DB}.gb_push_subscriptions TO 'gummy_app'@'%';")
    sql = (ROOT.parent/'migrations/experience_additive.sql').read_text(encoding='utf-8')
    print(sql.replace('gummybearing_v5_draft.', DB + '.'))


def subscription():
    return dict(endpoint='https://fcm.googleapis.com/fcm/send/isolated-ownership-' + uuid.uuid4().hex,
                keys=dict(auth='abcdefghijklmnopqrstuv', p256dh='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_ab'))


class SubscriptionOwnershipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ.get('MYSQL_DATABASE') == DB, 'Only isolated subscription database allowed'
        assert os.environ.get('GB_EMAIL_SEND') == '0' and os.environ.get('GB_PUSH_SEND') == '0'

    def setUp(self):
        self.service = experience.Experience(SimpleNamespace(revision='c'*64))
        # subscribe() does not need CSV/VAPID state. Do not start an adapter/worker.
        self.team = notifications.Notifications.__new__(notifications.Notifications)
        _, session = self.service.start({'username': 'all'}, 'isolated-subscriptions-' + uuid.uuid4().hex)
        self.user = session['user']

    def owners(self, sub):
        endpoint = notifications.digest(sub['endpoint'])
        with connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT username FROM gb_push_subscriptions WHERE endpoint_hash=%s', (endpoint,))
            team = cur.fetchone()
            cur.execute('SELECT visitor_id FROM gb_experience_subscriptions WHERE endpoint_hash=%s', (endpoint,))
            visitor = cur.fetchone()
        return team, visitor

    def test_mixed_concurrent_registration_has_exactly_one_namespace_owner(self):
        # Repeat with fresh endpoint keys; both transactions begin together.
        for _ in range(8):
            sub, barrier = subscription(), threading.Barrier(2)
            def register(personal):
                barrier.wait(timeout=5)
                try:
                    if personal:
                        self.service.subscribe(self.user, {'subscription': sub})
                    else:
                        self.team.subscribe(TEAM, {'subscription': sub})
                    return 'personal' if personal else 'team'
                except AuthError as error:
                    return error.status
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(register, (True, False)))
            self.assertEqual(results.count(409), 1, results)
            team, personal = self.owners(sub)
            self.assertEqual(int(team is not None) + int(personal is not None), 1)
            self.assertEqual(team is not None, 'team' in results)
            self.assertEqual(personal is not None, 'personal' in results)

    def test_existing_owner_conflicts_in_both_directions_and_own_retry_works(self):
        personal_sub = subscription()
        self.service.subscribe(self.user, {'subscription': personal_sub})
        self.service.subscribe(self.user, {'subscription': personal_sub})
        with self.assertRaises(AuthError) as raised:
            self.team.subscribe(TEAM, {'subscription': personal_sub})
        self.assertEqual(raised.exception.status, 409)
        team_sub = subscription()
        self.team.subscribe(TEAM, {'subscription': team_sub})
        self.team.subscribe(TEAM, {'subscription': team_sub})
        with self.assertRaises(AuthError) as raised:
            self.service.subscribe(self.user, {'subscription': team_sub})
        self.assertEqual(raised.exception.status, 409)

    def test_lock_covers_commit_and_waiting_reader_sees_committed_owner(self):
        sub, entered = subscription(), threading.Event()
        endpoint = notifications.digest(sub['endpoint'])
        def wait_for_owner():
            entered.set()
            try:
                self.service.subscribe(self.user, {'subscription': sub})
            except AuthError as error:
                return error.status
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            with notifications.subscription_transaction(endpoint) as cur:
                cur.execute('INSERT INTO gb_push_subscriptions(endpoint_hash,username,subscription_json) VALUES(%s,%s,%s)',
                            (endpoint, TEAM['id'], json.dumps(sub)))
                waiting = pool.submit(wait_for_owner)
                self.assertTrue(entered.wait(2))
                time.sleep(0.1)
                self.assertFalse(waiting.done(), 'Ownership lock released before commit')
            self.assertEqual(waiting.result(timeout=3), 409)
        self.assertIsNotNone(self.owners(sub)[0])
        self.assertIsNone(self.owners(sub)[1])

    def test_rollback_releases_lock_and_leaves_no_phantom_team_owner(self):
        sub = subscription()
        endpoint = notifications.digest(sub['endpoint'])
        with self.assertRaisesRegex(RuntimeError, 'rollback test'):
            with notifications.subscription_transaction(endpoint) as cur:
                cur.execute('INSERT INTO gb_push_subscriptions(endpoint_hash,username,subscription_json) VALUES(%s,%s,%s)',
                            (endpoint, TEAM['id'], json.dumps(sub)))
                raise RuntimeError('rollback test')
        self.assertEqual(self.owners(sub), (None, None))
        self.service.subscribe(self.user, {'subscription': sub})
        self.assertIsNotNone(self.owners(sub)[1])

    def test_lock_timeout_returns_retry_error_without_registering(self):
        sub = subscription()
        lock_name = 'gb-push:' + notifications.digest(sub['endpoint'])[:56]
        self.assertEqual(len(lock_name), 64)
        with connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT GET_LOCK(%s,1) acquired', (lock_name,))
            self.assertEqual(cur.fetchone()['acquired'], 1)
            try:
                with self.assertRaises(AuthError) as raised:
                    self.team.subscribe(TEAM, {'subscription': sub})
                self.assertEqual(raised.exception.status, 429)
                self.assertEqual(self.owners(sub), (None, None))
            finally:
                cur.execute('SELECT RELEASE_LOCK(%s)', (lock_name,))
        self.team.subscribe(TEAM, {'subscription': sub})
        self.assertIsNotNone(self.owners(sub)[0])


if __name__ == '__main__':
    if '--fixture' in sys.argv:
        fixture()
    else:
        unittest.main()
