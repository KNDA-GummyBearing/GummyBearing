"""Real MySQL approval transaction tests; isolated DB and delivery disabled only.

Run fixture output through the LOCAL root MySQL helper; then run this test with
MYSQL_DATABASE=gb_approval_test_20261024. No server worker or external send runs.
"""
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import approvals
from auth import AuthError
import mysql_store as records

DB = 'gb_approval_test_20261024'
TEAM = dict(id='ksm123', name='김수민', role='supervisor', process=None)
FIELD = dict(id='joy123', name='정온유', role='field', process='sinter')
STEEL = dict(id='kmj123', name='강민준', role='field', process='steel')


def fixture():
    package = ROOT.parent
    print(f'CREATE DATABASE IF NOT EXISTS {DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs; USE {DB};')
    schema = (package/'db/01_schema.sql').read_text(encoding='utf-8-sig')
    schema = re.sub(r'CREATE DATABASE IF NOT EXISTS `gummybearing_v5_draft`\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;', '', schema)
    schema = schema.replace('USE `gummybearing_v5_draft`;', '')
    print(schema)
    for user in (TEAM, FIELD, STEEL):
        def hextext(s): return "CONVERT(X'"+s.encode().hex()+"' USING utf8mb4)"
        print(f"INSERT INTO gb_users(username,display_name,password_hash) VALUES('{user['id']}',{hextext(user['name'])},'unused-test-password');")
    for filename in ('role_notifications_additive.sql', 'schedule_approvals_additive.sql',
                     'completion_approvals_additive.sql', 'bell_inbox_additive.sql',
                     'report_deferred_schedule_additive.sql'):
        sql = (package/'migrations'/filename).read_text(encoding='utf-8-sig')
        print(re.sub(r'GRANT[^;]+;', '', sql))
    equipment = json.loads((ROOT/'data/equipment_db.json').read_text(encoding='utf-8'))['records']
    for row in equipment:
        def lit(v):
            return str(v) if isinstance(v, (int,float)) else "CONVERT(X'"+v.encode().hex()+"' USING utf8mb4)"
        print('INSERT INTO equipment ('+','.join('`'+k+'`' for k in row)+') VALUES ('+','.join(lit(v) for v in row.values())+');')
    privileges()


def privileges(replace=False):
    # Match production's least privileges, including column-only followup UPDATE.
    # Never test under broad schema permissions which could mask a runtime bug.
    if replace:
        print(f"REVOKE SELECT,INSERT,UPDATE,DELETE ON {DB}.* FROM 'gummy_app'@'%';")
    access = {
        'equipment': 'SELECT', 'work_history': 'SELECT', 'gb_demo_roles': 'SELECT',
        'inspections': 'SELECT,INSERT', 'maintenance_reviews': 'SELECT,INSERT',
        'follow_ups': 'SELECT,INSERT,UPDATE(status,source)',
        'gb_users': 'SELECT,INSERT,UPDATE', 'gb_schedule_approvals': 'SELECT,INSERT,UPDATE',
        'gb_completion_approvals': 'SELECT,INSERT,UPDATE', 'gb_bell_reads': 'SELECT,INSERT',
        'gb_sessions': 'SELECT,INSERT,DELETE',
        'gb_inspection_authors': 'SELECT,INSERT', 'gb_followup_authors': 'SELECT,INSERT',
        'gb_followup_completions': 'SELECT,INSERT',
        'gb_alert_jobs': 'SELECT,INSERT,UPDATE', 'gb_alert_events': 'SELECT,INSERT,UPDATE',
        'gb_alert_deliveries': 'SELECT,INSERT,UPDATE',
    }
    for table, grant in access.items():
        print(f"GRANT {grant} ON {DB}.{table} TO 'gummy_app'@'%';")


class ApprovalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['MYSQL_DATABASE'] == DB, 'Isolated test database required'
        assert os.environ.get('GB_PUSH_SEND') == '0' and os.environ.get('GB_EMAIL_SEND') == '0'
        assert os.environ.get('GB_DEMO_ROLE_SELECTION') == '1'

    def payload(self, inspection=False, review=False, equipment='EGF-01'):
        payload = dict(request_key='test-'+str(uuid.uuid4()), schedule=dict(equipment_id=equipment,
                       type='재확인', due_date='2026-11-05', assignee='정온유', items='승인 흐름 검증'))
        if inspection:
            row = json.loads((ROOT/'data/maintenance_db.json').read_text(encoding='utf-8'))['inspections'][0]
            row.update(equipment_id=equipment, inspected_at='2026-10-24T10:30', inspector='위조 작성자',
                       decision='계속 관찰', recheck_date='2026-11-05', memo='격리 DB 승인 검증')
            payload['inspection'] = row
        if review:
            payload['inspection'].update(decision='정비 검토', recheck_date='')
            payload['review'] = dict(review_id='temporary', inspection_id='temporary', equipment_id=equipment,
                necessity='정비 필요',target='윤활 계통',content='윤활 보충',priority='일반',desired_date='2026-11-05',
                estimated_hours='1.50', work_memo='', review_status='검토 중',registered_at='2026-10-24T10:30',source='app')
            payload['schedule']['type'] = '정비'
        return payload

    def count(self, table):
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute(f'SELECT COUNT(*) n FROM `{table}`')
            return cur.fetchone()['n']

    def test_atomic_submit_inspection_review_and_notification(self):
        response = approvals.submit(FIELD, self.payload(True, True))
        request = response['request']
        self.assertEqual(request['status'], 'pending')
        self.assertEqual(request['requester_name'], '정온유')
        self.assertEqual(request['inspection']['inspector'], '정온유')
        self.assertEqual(request['inspection']['approval_status'], 'pending')
        self.assertEqual(request['review']['approval_status'], 'pending')
        self.assertEqual(response['records']['follow_ups'], [])
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s', (request['inspection_id'],))
            self.assertEqual(cur.fetchone()['n'], 0)
            cur.execute("SELECT COUNT(*) n FROM gb_alert_events e JOIN gb_alert_jobs j ON e.job_id=j.job_id "
                        "WHERE j.kind='approval_request' AND e.body LIKE %s", ('%'+request['request_id']+'%',))
            self.assertEqual(cur.fetchone()['n'], 1)
        my = records.my_activity(FIELD)
        self.assertTrue(any(r['approval_request_id']==request['request_id'] for r in my['inspections']))

    def test_invalid_review_rolls_back_inspection_audit_and_notice(self):
        tables = ['inspections','gb_inspection_authors','maintenance_reviews','gb_schedule_approvals','gb_alert_jobs']
        before = {t: self.count(t) for t in tables}
        payload = self.payload(True, True)
        payload['review']['estimated_hours'] = '-1'
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD,payload)
        self.assertEqual(before,{t:self.count(t) for t in tables})

    def test_notice_failure_rolls_back_whole_submission(self):
        tables=['inspections','gb_inspection_authors','gb_schedule_approvals','gb_alert_jobs']
        before={t:self.count(t) for t in tables}
        with patch.object(approvals,'queue_notice',side_effect=RuntimeError('outbox unavailable')):
            with self.assertRaises(RuntimeError): approvals.submit(FIELD,self.payload(True))
        self.assertEqual(before,{t:self.count(t) for t in tables})

    def test_concurrent_identical_submit_has_one_request_and_children(self):
        payload = self.payload(True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(pool.map(lambda _: approvals.submit(FIELD,payload),range(3)))
        self.assertEqual(len({r['request']['request_id'] for r in responses}),1)
        self.assertEqual(len({r['request']['inspection_id'] for r in responses}),1)
        self.assertTrue(all(len(r['records']['inspections'])==1 for r in responses))
        self.assertTrue(all(r['request']['inspection'] is not None for r in responses))
        changed = copy.deepcopy(payload); changed['schedule']['items']='내용 변경'
        with self.assertRaises(AuthError) as raised: approvals.submit(FIELD, changed)
        self.assertEqual(raised.exception.status,409)

    def test_scope_role_rejection_and_field_visibility(self):
        payload = self.payload(equipment='EGF-04')
        with self.assertRaises(AuthError) as raised: approvals.submit(FIELD,payload)
        self.assertEqual(raised.exception.status,403)
        request = approvals.submit(STEEL,payload)['request']
        self.assertFalse(any(r['request_id']==request['request_id'] for r in approvals.listing(FIELD)['requests']))
        self.assertTrue(any(r['request_id']==request['request_id'] for r in approvals.listing(TEAM)['requests']))
        with self.assertRaises(AuthError) as raised:
            approvals.decide(STEEL,dict(request_id=request['request_id'],action='approve'))
        self.assertEqual(raised.exception.status,403)
        with self.assertRaises(records.ValidationError):
            approvals.decide(TEAM,dict(request_id=request['request_id'],action='reject'))
        rejected=approvals.decide(TEAM,dict(request_id=request['request_id'],action='reject',note='예정일 재검토'))
        self.assertEqual(rejected['request']['status'],'rejected')
        self.assertEqual(rejected['records']['follow_ups'],[])
        self.assertEqual(approvals.decide(TEAM,dict(request_id=request['request_id'],action='reject',note='예정일 재검토')),rejected)
        with self.assertRaises(AuthError) as raised:
            approvals.decide(TEAM,dict(request_id=request['request_id'],action='approve'))
        self.assertEqual(raised.exception.status,409)

    def test_concurrent_approval_creates_one_schedule_and_audit(self):
        request=approvals.submit(FIELD,self.payload(True))['request']
        decision=dict(request_id=request['request_id'],action='approve',note='일정 확인',
                      schedule=dict(due_date='2026-11-06',assignee='정온유',items='윤활 확인 후 재점검',type='정기 점검'))
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            responses=list(pool.map(lambda _: approvals.decide(TEAM,decision),range(3)))
        self.assertEqual(len({r['request']['follow_up_id'] for r in responses}),1)
        r=responses[0]
        self.assertEqual(r['request']['reviewed_by'],'ksm123')
        self.assertEqual(r['request']['due_date'],'2026-11-06')
        self.assertEqual(r['records']['inspections'][0]['approval_status'],'approved')
        follow=r['records']['follow_ups'][0]
        self.assertEqual(follow['created_by_user_id'],'joy123')
        self.assertEqual(follow['due_date'],'2026-11-06')
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s',(request['inspection_id'],))
            self.assertEqual(cur.fetchone()['n'],1)
            cur.execute("SELECT COUNT(*) n FROM gb_alert_events e JOIN gb_alert_jobs j ON e.job_id=j.job_id "
                        "WHERE j.kind='approval_approved' AND e.body LIKE %s", ('%'+request['request_id']+'%',))
            self.assertEqual(cur.fetchone()['n'],1)

    def test_concurrent_opposite_decisions_only_one_wins(self):
        request=approvals.submit(FIELD,self.payload())['request']
        def decide(action):
            try: return approvals.decide(TEAM,dict(request_id=request['request_id'],action=action,note='동시 요청'))
            except AuthError as error: return error.status
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            answers=list(pool.map(decide,['approve','reject']))
        self.assertEqual(sum(answer==409 for answer in answers),1)
        done=next(answer for answer in answers if isinstance(answer,dict))
        self.assertEqual(len(done['records']['follow_ups']),int(done['request']['status']=='approved'))

    def test_submit_retry_racing_with_approval_has_complete_consistent_records(self):
        # Run several interleavings; each request and its newly inserted followup
        # must be visible together even under MySQL's REPEATABLE READ isolation.
        for _ in range(5):
            payload=self.payload(True)
            request=approvals.submit(FIELD,payload)['request']
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                retry=pool.submit(approvals.submit,FIELD,payload)
                decision=pool.submit(approvals.decide,TEAM,dict(request_id=request['request_id'],action='approve'))
                responses=[retry.result(),decision.result()]
            for response in responses:
                self.assertEqual(len(response['records']['inspections']),1)
                self.assertEqual(len(response['records']['follow_ups']),int(response['request']['status']=='approved'))
                self.assertEqual(response['records']['inspections'][0]['approval_status'],response['request']['status'])

    def test_legacy_bypass_blocked_and_approved_completion_allowed(self):
        with self.assertRaises(AuthError): records.save(dict(inspections=[self.payload(True)['inspection']]),FIELD)
        with self.assertRaises(AuthError): records.save(dict(inspections=[self.payload(True)['inspection']]),TEAM)
        row=dict(follow_up_id='tmp',equipment_id='EGF-01',inspection_id='',type='정기 점검',due_date='2026-11-05',
                 assignee='정온유',items='우회 확인',status='예정',created_at='2026-10-24T10:30',source='app')
        with self.assertRaises(AuthError): records.save(dict(follow_ups=[row]),FIELD)
        request=approvals.submit(FIELD,self.payload())['request']
        follow=approvals.decide(TEAM,dict(request_id=request['request_id'],action='approve'))['records']['follow_ups'][0]
        with self.assertRaises(AuthError): records.save(dict(operation='update',follow_ups=[dict(follow_up_id=follow['follow_up_id'],status='완료')]),STEEL)
        result=records.save(dict(operation='update',follow_ups=[dict(follow_up_id=follow['follow_up_id'],status='완료')]),FIELD)
        self.assertEqual(result['records']['follow_ups'][0]['completed_by_user_id'],'joy123')
        self.assertEqual(result['records']['follow_ups'][0]['status'],'완료')

    def test_dates_empty_fields_and_mismatched_equipment(self):
        for date_value in ('2026-02-30','2026-2-3','0999-01-01','2026-11-01T12:00'):
            payload=self.payload();payload['schedule']['due_date']=date_value
            with self.assertRaises(records.ValidationError): approvals.submit(FIELD,payload)
        payload=self.payload();payload['schedule']['assignee']='   '
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD,payload)
        payload=self.payload(True);payload['inspection']['equipment_id']='EGF-02'
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD,payload)
        payload=self.payload(True);payload['schedule']['due_date']='2026-10-23'
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD,payload)


if __name__=='__main__':
    if sys.argv[1:]==['--fixture']: fixture()
    elif sys.argv[1:]==['--replace-test-privileges']: privileges(replace=True)
    else: unittest.main()
