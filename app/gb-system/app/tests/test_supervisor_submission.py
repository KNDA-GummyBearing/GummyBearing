"""Team lead direct reports vs field approvals, on isolated MySQL with sends off."""
import concurrent.futures
import copy
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import approvals
from auth import AuthError
import mysql_store as records
import roles
import server
import test_schedule_approvals as fixture

TEAM, FIELD, STEEL = fixture.TEAM, fixture.FIELD, fixture.STEEL


class SupervisorSubmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['MYSQL_DATABASE'] == fixture.DB, 'Isolated database required'
        assert os.environ.get('GB_PUSH_SEND') == '0' and os.environ.get('GB_EMAIL_SEND') == '0'
        assert os.environ.get('GB_DEMO_ROLE_SELECTION') == '1'

    def payload(self, review=False, equipment='EGF-01'):
        return fixture.ApprovalTests().payload(inspection=True, review=review, equipment=equipment)

    def counts(self):
        tables = ('inspections', 'gb_inspection_authors', 'maintenance_reviews', 'follow_ups',
                  'gb_followup_authors', 'gb_schedule_approvals', 'gb_alert_jobs', 'gb_alert_events')
        with records.connect() as conn, conn.cursor() as cur:
            result = {}
            for table in tables:
                cur.execute(f'SELECT COUNT(*) n FROM `{table}`')
                result[table] = cur.fetchone()['n']
            return result

    def assert_direct(self, response, review=False):
        request = response['request']
        self.assertEqual(request['status'], 'approved')
        self.assertEqual(request['requested_by'], TEAM['id'])
        self.assertEqual(request['reviewed_by'], TEAM['id'])
        self.assertEqual(request['reviewer_name'], TEAM['name'])
        self.assertTrue(request['reviewed_at'])
        self.assertEqual(request['note'], '설비 팀장 직접 제출')
        self.assertEqual(request['inspection']['inspector'], TEAM['name'])
        self.assertEqual(request['inspection']['approval_status'], 'approved')
        self.assertEqual(len(response['records']['inspections']), 1)
        self.assertEqual(len(response['records']['maintenance_reviews']), int(review))
        self.assertEqual(len(response['records']['follow_ups']), 1)
        followup = response['records']['follow_ups'][0]
        self.assertEqual(followup['follow_up_id'], request['follow_up_id'])
        self.assertEqual(followup['status'], '예정')
        self.assertEqual(followup['created_by_user_id'], TEAM['id'])
        self.assertEqual(followup['approval_status'], 'approved')
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_alert_events WHERE body LIKE %s', ('%' + request['request_id'] + '%',))
            self.assertEqual(cur.fetchone()['n'], 0, 'Direct submissions must not notify their own reviewer')
        return request

    def test_team_report_and_review_commit_approved_with_schedule(self):
        for review, equipment in ((False, 'EGF-01'), (True, 'EGF-04')):
            with self.subTest(review=review, equipment=equipment):
                payload = self.payload(review, equipment)
                request = self.assert_direct(approvals.submit(TEAM, payload), review)
                if review:
                    self.assertEqual(request['review']['approval_status'], 'approved')
                    self.assertEqual(request['type'], '정비')
                mine = records.my_activity(TEAM)
                self.assertTrue(any(r.get('approval_request_id') == request['request_id'] for r in mine['inspections']))

    def test_field_report_still_pending_with_notice_and_no_schedule(self):
        for user, equipment in ((FIELD, 'EGF-01'), (STEEL, 'EGF-04')):
            with self.subTest(role=user['id']):
                response = approvals.submit(user, self.payload(True, equipment))
                request = response['request']
                self.assertEqual(request['status'], 'pending')
                self.assertEqual(request['reviewed_by'], '')
                self.assertEqual(response['records']['follow_ups'], [])
                with records.connect() as conn, conn.cursor() as cur:
                    cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s', (request['inspection_id'],))
                    self.assertEqual(cur.fetchone()['n'], 0)
                    cur.execute("SELECT COUNT(*) n FROM gb_alert_events e JOIN gb_alert_jobs j ON j.job_id=e.job_id "
                                "WHERE j.kind='approval_request' AND e.body LIKE %s", ('%' + request['request_id'] + '%',))
                    self.assertEqual(cur.fetchone()['n'], 1)

    def test_team_concurrent_retries_have_one_report_review_schedule_and_no_notices(self):
        payload = self.payload(True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(pool.map(lambda _: approvals.submit(TEAM, payload), range(3)))
        for response in responses:
            self.assert_direct(response, True)
        self.assertTrue(all(response == responses[0] for response in responses))
        request = responses[0]['request']
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s', (request['inspection_id'],))
            self.assertEqual(cur.fetchone()['n'], 1)
        # Even a redundant explicit decision is an idempotent read, not an event.
        self.assertEqual(approvals.decide(TEAM, dict(request_id=request['request_id'], action='approve')), responses[0])
        self.assert_direct(responses[0], True)
        changed = copy.deepcopy(payload); changed['schedule']['items'] = '변경된 내용'
        with self.assertRaises(AuthError) as raised:
            approvals.submit(TEAM, changed)
        self.assertEqual(raised.exception.status, 409)
        with self.assertRaises(AuthError) as raised:
            approvals.decide(TEAM, dict(request_id=request['request_id'], action='reject', note='반려 변경'))
        self.assertEqual(raised.exception.status, 409)

    def test_failure_after_schedule_and_audit_write_rolls_back_everything(self):
        payload = self.payload(True)
        before = self.counts()
        original = approvals.apply_schedule_decision
        def fail_after_write(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError('local transaction failure injection')
        with patch.object(approvals, 'apply_schedule_decision', side_effect=fail_after_write):
            with self.assertRaises(RuntimeError):
                approvals.submit(TEAM, payload)
        self.assertEqual(self.counts(), before)
        # The same key remains usable after a rolled back transaction.
        self.assert_direct(approvals.submit(TEAM, payload), True)

    def test_team_has_no_validation_bypass_and_field_cannot_request_auto_approval(self):
        before = self.counts()
        invalid = self.payload(); invalid['schedule']['due_date'] = '2026-10-23'
        with self.assertRaises(records.ValidationError): approvals.submit(TEAM, invalid)
        invalid = self.payload(True); invalid['review']['estimated_hours'] = '-1'
        with self.assertRaises(records.ValidationError): approvals.submit(TEAM, invalid)
        forged = self.payload(); forged['role'] = 'supervisor'
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD, forged)
        forged = self.payload(); forged['status'] = 'approved'
        with self.assertRaises(records.ValidationError): approvals.submit(FIELD, forged)
        with self.assertRaises(AuthError) as raised:
            approvals.submit(FIELD, self.payload(equipment='EGF-04'))
        self.assertEqual(raised.exception.status, 403)
        self.assertEqual(self.counts(), before)

    def test_team_schedule_only_submit_also_has_no_self_approval_wait(self):
        payload = fixture.ApprovalTests().payload()
        response = approvals.submit(TEAM, payload)
        self.assertEqual(response['request']['status'], 'approved')
        self.assertEqual(response['records']['inspections'], [])
        self.assertEqual(len(response['records']['follow_ups']), 1)
        self.assertEqual(response['request']['requested_by'], response['request']['reviewed_by'])

    def test_http_uses_session_role_and_returns_direct_vs_pending_records(self):
        class QuietHandler(server.Handler):
            def log_message(self, *args): pass
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        httpd.auth_store = roles.DemoRoleStore()
        worker = threading.Thread(target=httpd.serve_forever, daemon=True); worker.start()
        base = 'http://127.0.0.1:' + str(httpd.server_port)
        case = self
        class Client:
            def __init__(self, username=None):
                self.http = build_opener(HTTPCookieProcessor(CookieJar())); self.csrf = ''
                if username: self.csrf = self.call('/api/demo/select', dict(username=username))['csrf']
            def call(self, path, payload=None, status=200, csrf=True):
                headers = {'Content-Type':'application/json', 'X-GB-Request':'1', 'Origin':os.environ['GB_PUBLIC_ORIGIN']}
                if csrf: headers['X-CSRF-Token'] = self.csrf
                try: response = self.http.open(Request(base + path, headers=headers, data=None if payload is None else json.dumps(payload).encode()), timeout=15)
                except HTTPError as error: response = error
                case.assertEqual(response.status, status)
                return json.loads(response.read())
        try:
            team, field = Client(TEAM['id']), Client(FIELD['id'])
            Client().call('/api/approvals/submit', self.payload(), status=401)
            team.call('/api/approvals/submit', self.payload(), status=403, csrf=False)
            response = team.call('/api/approvals/submit', self.payload(True))
            request = self.assert_direct(response, True)
            current = next(r for r in team.call('/api/maintenance')['follow_ups'] if r['follow_up_id'] == request['follow_up_id'])
            self.assertEqual(current['status'], '예정')
            self.assertEqual(current['approval_status'], 'approved')
            response = field.call('/api/approvals/submit', self.payload())
            self.assertEqual(response['request']['status'], 'pending')
            self.assertEqual(response['records']['follow_ups'], [])
            field.call('/api/approvals/decide', dict(request_id=response['request']['request_id'], action='approve'), status=403)
        finally:
            httpd.shutdown(); httpd.server_close(); worker.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
