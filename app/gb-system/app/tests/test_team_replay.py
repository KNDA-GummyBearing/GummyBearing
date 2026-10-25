"""Account-isolated replay integration tests. Local dedicated DB; no real sends."""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth import AuthError
from mysql_store import connect
from notifications import Notifications, event_recipients

DB = 'gb_team_replay_test_20261025'
PROFILES = [dict(id='ksm123',role='supervisor',process=None),
            dict(id='joy123',role='field',process='sinter'),
            dict(id='kmj123',role='field',process='steel')]

def fixture():
    print(f'CREATE DATABASE IF NOT EXISTS {DB}; USE {DB};')
    for table in ('gb_users','equipment','gb_alert_jobs','gb_alert_events','gb_alert_deliveries','gb_notice_settings','gb_push_subscriptions'):
        print(f'CREATE TABLE IF NOT EXISTS {table} LIKE gummybearing_v5_draft.{table};')
    print("INSERT IGNORE INTO gb_users SELECT * FROM gummybearing_v5_draft.gb_users WHERE username IN ('ksm123','joy123','kmj123');")
    print('INSERT IGNORE INTO equipment SELECT * FROM gummybearing_v5_draft.equipment;')
    print(f"GRANT SELECT,INSERT,UPDATE,DELETE ON {DB}.* TO 'gummy_app'@'%';")

class FakeRoles:
    def profiles(self): return PROFILES

class TeamReplayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ.get('MYSQL_DATABASE') == DB
        assert os.environ.get('GB_EMAIL_SEND') == os.environ.get('GB_PUSH_SEND') == '0'

    def setUp(self):
        self.n = Notifications.__new__(Notifications)
        self.n.revision = 'b'*64
        self.n.indexes = {f'EGF-{i:02}':40 for i in range(1,7)}
        self.n.role_store = FakeRoles()
        with connect() as conn, conn.cursor() as c:
            for table in ('gb_alert_deliveries','gb_alert_events','gb_alert_jobs','gb_notice_settings','gb_push_subscriptions'):
                c.execute('DELETE FROM '+table)
            for user in PROFILES:
                c.execute('INSERT INTO gb_notice_settings(username,email,email_enabled) VALUES(%s,%s,1)', (user['id'],user['id']+'@example.invalid'))
                c.execute('INSERT INTO gb_push_subscriptions(endpoint_hash,username,subscription_json) VALUES(%s,%s,%s)',
                          (user['id'].ljust(64,'0'),user['id'],json.dumps({'endpoint':'https://fcm.googleapis.com/fake/'+user['id']})))
            conn.commit()

    def event(self, user, round, equipment):
        return dict(actor_id=user['id'],revision=self.n.revision,round_id=round['id'],equipment_id=equipment,sample_index=40)

    def test_three_roles_each_receive_only_their_own_round_and_can_repeat(self):
        for user in PROFILES:
            with self.subTest(user=user['id']):
                first = self.n.current_round(user)
                self.assertEqual(self.n.current_round(user),first)
                ids = ['EGF-01','EGF-04'] if user['role']=='supervisor' else ['EGF-01' if user['process']=='sinter' else 'EGF-04']
                for equipment in ids:
                    payload=self.event(user,first,equipment)
                    self.assertTrue(self.n.playback(user,payload)['created'])
                    self.assertFalse(self.n.playback(user,payload)['created'])
                self.n.enqueue()
                with connect() as conn, conn.cursor() as c:
                    c.execute('SELECT d.username,d.channel FROM gb_alert_deliveries d JOIN gb_alert_events e ON e.event_id=d.event_id WHERE e.job_id=%s',(first['id'],))
                    rows=c.fetchall()
                self.assertEqual(len(rows),len(ids)*2)
                self.assertEqual({r['username'] for r in rows},{user['id']})
                self.assertEqual({r['channel'] for r in rows},{'email','push'})
                before_other={u['id']:self.n.current_round(u) for u in PROFILES if u!=user}
                reset=dict(request_id='repeat-'+user['id'],expected_round_id=first['id'])
                second=self.n.reset_round(user,reset)
                self.assertNotEqual(first,second)
                self.assertEqual(self.n.reset_round(user,reset),second)
                for other in PROFILES:
                    if other!=user: self.assertEqual(self.n.current_round(other),before_other[other['id']])
                for equipment in ids:
                    self.assertTrue(self.n.playback(user,self.event(user,second,equipment))['created'])
                self.n.enqueue()
                with connect() as conn, conn.cursor() as c:
                    c.execute('SELECT d.username,d.channel FROM gb_alert_deliveries d JOIN gb_alert_events e ON e.event_id=d.event_id WHERE e.job_id=%s',(second['id'],))
                    rows=c.fetchall()
                self.assertEqual(len(rows),len(ids)*2)
                self.assertEqual({r['username'] for r in rows},{user['id']})
        # Exercise the worker's queued dispatch with a mock adapter, never SMTP/Push.
        with patch.object(self.n,'send_delivery',return_value=('dry_run','isolated test')) as send:
            while self.n.deliver(): pass
            self.assertEqual(send.call_count,8)  # two channels x (2 lead + 1 + 1 field)

    def test_stale_round_cross_actor_scope_and_spoofed_sample_rejected(self):
        lead,sinter,steel=PROFILES
        round=self.n.current_round(steel)
        payload=self.event(steel,round,'EGF-04')
        for change in ({'actor_id':'ksm123'},{'round_id':'f'*32},{'revision':'old'},{'equipment_id':'EGF-01'}):
            with self.assertRaises(AuthError): self.n.playback(steel,{**payload,**change})
        with self.assertRaises(ValueError): self.n.playback(steel,{**payload,'sample_index':41})
        self.n.reset_round(steel,dict(request_id='explicit-reset',expected_round_id=round['id']))
        with self.assertRaises(AuthError): self.n.playback(steel,payload)

    def test_concurrent_tabs_share_round_and_only_one_event(self):
        user=PROFILES[1]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            rounds=list(pool.map(lambda _:self.n.current_round(user),range(4)))
        self.assertEqual(len({r['id'] for r in rounds}),1)
        payload=self.event(user,rounds[0],'EGF-01')
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.n.playback(user,payload),range(4)))
        self.assertEqual(sum(r['created'] for r in results),1)

    def test_approval_rules_unchanged_and_demo_is_self_only(self):
        self.assertEqual([p['id'] for p in event_recipients(dict(kind='approval_request',username='kmj123'),PROFILES,'steel')],['ksm123'])
        for kind in ('approval_approved','approval_rejected'):
            self.assertEqual([p['id'] for p in event_recipients(dict(kind=kind,username='kmj123'),PROFILES,'steel')],['kmj123'])
        for kind in ('playback','playback_round','csv','test'):
            for user in PROFILES:
                rows=event_recipients(dict(kind=kind,username=user['id']),PROFILES,user['process'] or 'sinter')
                self.assertEqual(rows,[user])

if __name__=='__main__':
    if '--fixture' in sys.argv: fixture()
    else: unittest.main()
