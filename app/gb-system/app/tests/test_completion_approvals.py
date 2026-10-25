"""Real MySQL + HTTP tests for completion approval, using isolated local data.

No notification worker is started and both delivery flags must be off.
Apply completion_approvals_additive.sql to gb_approval_test_20261024 first.
"""
import concurrent.futures
import hashlib
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
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import approvals
from auth import AuthError
import bell
import mysql_store as records
import roles
import server
import test_schedule_approvals as fixture

TEAM, FIELD, STEEL = fixture.TEAM, fixture.FIELD, fixture.STEEL


class CompletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['MYSQL_DATABASE'] == fixture.DB
        assert os.environ.get('GB_PUSH_SEND') == '0' and os.environ.get('GB_EMAIL_SEND') == '0'
        assert os.environ.get('GB_DEMO_ROLE_SELECTION') == '1'

    def followup(self, user=FIELD):
        # Exercise the existing schedule-registration workflow as the fixture.
        payload = fixture.ApprovalTests().payload(equipment='EGF-04' if user == STEEL else 'EGF-01')
        req = approvals.submit(user, payload)['request']
        out = approvals.decide(TEAM, dict(request_id=req['request_id'], action='approve'))
        self.assertEqual(out['request']['request_kind'], 'schedule')
        return out['records']['follow_ups'][0]

    def payload(self, followup):
        return dict(follow_up_id=followup['follow_up_id'], request_key='completion-test-' + str(uuid.uuid4()), note='윤활 보충 및 정리 완료')

    def read(self, ident):
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s', (ident,))
            return approvals.completion_metadata(cur, records.audit_record(cur, 'follow_ups', cur.fetchone()))

    def complete_payload(self, *rows):
        return dict(operation='update', follow_ups=[dict(follow_up_id=r['follow_up_id'], status='완료') for r in rows])

    def outcome(self, fn):
        try:
            return fn()
        except AuthError as error:
            return error.status

    def event(self, request, kind):
        return hashlib.sha256(f"approval:{request['request_id']}:{kind}".encode()).hexdigest()

    def notice(self, user, request, kind):
        ident = self.event(request, kind)
        return next((n for n in bell.inbox(user)['notifications'] if n['id'] == ident), None)

    def test_pending_leaves_schedule_and_audit_unchanged_then_approval_completes(self):
        followup = self.followup()
        out = approvals.completion_submit(FIELD, self.payload(followup))
        request = out['request']
        self.assertEqual(request['request_kind'], 'completion')
        self.assertEqual(request['status'], 'pending')
        current = self.read(followup['follow_up_id'])
        self.assertEqual(current['status'], '예정')
        self.assertEqual(current['completed_by_user_id'], '')
        self.assertEqual(current['completion_approval_request_id'], request['request_id'])
        self.assertEqual(current['approval_status'], 'approved')  # original approval preserved
        out = approvals.completion_decide(TEAM, dict(request_id=request['request_id'], action='approve'))
        current = out['records']['follow_ups'][0]
        self.assertEqual(current['status'], '완료')
        self.assertEqual(current['completed_by_user_id'], FIELD['id'])
        self.assertEqual(current['completed_by'], FIELD['name'])
        self.assertEqual(out['request']['reviewed_by'], TEAM['id'])
        self.assertEqual(current['completion_approval_status'], 'approved')
        self.assertTrue(any(r['follow_up_id'] == current['follow_up_id'] for r in records.my_activity(FIELD)['completions']))

    def test_rejection_preserves_schedule_and_allows_new_request(self):
        followup = self.followup()
        original = self.payload(followup)
        req = approvals.completion_submit(FIELD, original)['request']
        with self.assertRaises(records.ValidationError):
            approvals.completion_decide(TEAM, dict(request_id=req['request_id'], action='reject'))
        approvals.completion_decide(TEAM, dict(request_id=req['request_id'], action='reject', note='현장 사진 보완'))
        current = self.read(followup['follow_up_id'])
        self.assertEqual(current['status'], followup['status'])
        self.assertEqual(current['completion_approval_status'], 'rejected')
        self.assertEqual(current['completed_by_user_id'], '')
        self.assertEqual(approvals.completion_submit(FIELD, original)['request']['status'], 'rejected')
        newer = approvals.completion_submit(FIELD, self.payload(followup))['request']
        self.assertNotEqual(newer['request_id'], req['request_id'])
        self.assertEqual(self.read(followup['follow_up_id'])['completion_approval_request_id'], newer['request_id'])

    def test_role_scope_and_payload_validation(self):
        sinter, steel = self.followup(), self.followup(STEEL)
        self.assertEqual(self.outcome(lambda: approvals.completion_submit(STEEL, self.payload(sinter))), 403)
        self.assertEqual(self.outcome(lambda: approvals.completion_submit(TEAM, self.payload(sinter))), 403)
        req = approvals.completion_submit(STEEL, self.payload(steel))['request']
        self.assertEqual(self.outcome(lambda: approvals.completion_decide(STEEL, dict(request_id=req['request_id'], action='approve'))), 403)
        self.assertFalse(any(r['request_id'] == req['request_id'] for r in approvals.listing(FIELD)['requests']))
        self.assertTrue(any(r['request_id'] == req['request_id'] for r in approvals.listing(STEEL)['requests']))
        for bad in ({}, {'follow_up_id': sinter['follow_up_id'], 'request_key': 'short'}, dict(self.payload(sinter), status='완료')):
            with self.assertRaises(records.ValidationError): approvals.completion_submit(FIELD, bad)
        self.assertEqual(self.outcome(lambda: approvals.direct_complete(FIELD, self.complete_payload(sinter))), 403)

    def test_concurrent_submit_and_changed_key_have_one_pending_and_notice(self):
        followup = self.followup(); payload = self.payload(followup)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            outputs = list(pool.map(lambda _: approvals.completion_submit(FIELD, payload), range(3)))
        ids = {out['request']['request_id'] for out in outputs}
        self.assertEqual(len(ids), 1)
        self.assertTrue(all(out['records']['follow_ups'][0]['status'] == '예정' for out in outputs))
        self.assertEqual(self.outcome(lambda: approvals.completion_submit(FIELD, dict(payload, note='다른 내용'))), 409)
        self.assertEqual(self.outcome(lambda: approvals.completion_submit(FIELD, self.payload(followup))), 409)
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_completion_approvals WHERE follow_up_id=%s', (followup['follow_up_id'],))
            self.assertEqual(cur.fetchone()['n'], 1)
            cur.execute('SELECT COUNT(*) n FROM gb_alert_events WHERE event_id=%s', (self.event(outputs[0]['request'], 'approval_request'),))
            self.assertEqual(cur.fetchone()['n'], 1)

    def test_concurrent_decision_and_retry_return_same_completion(self):
        followup = self.followup(); payload = self.payload(followup)
        request = approvals.completion_submit(FIELD, payload)['request']
        decision = dict(request_id=request['request_id'], action='approve')
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(approvals.completion_decide, TEAM, decision) for _ in range(2)]
            futures.append(pool.submit(approvals.completion_submit, FIELD, payload))
            outputs = [f.result() for f in futures]
        self.assertTrue(all(out['request']['request_id'] == request['request_id'] for out in outputs))
        self.assertTrue(all(len(out['records']['follow_ups']) == 1 for out in outputs))
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_followup_completions WHERE follow_up_id=%s', (followup['follow_up_id'],))
            self.assertEqual(cur.fetchone()['n'], 1)
        self.assertEqual(self.outcome(lambda: approvals.completion_decide(TEAM, dict(decision, action='reject', note='반려'))), 409)
        self.assertEqual(self.outcome(lambda: approvals.completion_submit(FIELD, self.payload(followup))), 409)

    def test_opposing_decisions_only_one_result(self):
        followup = self.followup(); request = approvals.completion_submit(FIELD, self.payload(followup))['request']
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outputs = list(pool.map(lambda action: self.outcome(lambda: approvals.completion_decide(TEAM,
                dict(request_id=request['request_id'], action=action, note='검토 결과'))), ['approve', 'reject']))
        self.assertEqual(sum(isinstance(o, dict) for o in outputs), 1)
        self.assertIn(409, outputs)
        winner = next(o for o in outputs if isinstance(o, dict))
        self.assertEqual(self.read(followup['follow_up_id'])['status'], '완료' if winner['request']['status'] == 'approved' else '예정')

    def test_team_direct_completion_is_atomic_and_pending_cannot_be_bypassed(self):
        first, pending = self.followup(), self.followup()
        approvals.completion_submit(FIELD, self.payload(pending))
        self.assertEqual(self.outcome(lambda: approvals.direct_complete(TEAM, self.complete_payload(first, pending))), 409)
        self.assertEqual(self.read(first['follow_up_id'])['status'], '예정')
        out = approvals.direct_complete(TEAM, self.complete_payload(first))
        self.assertEqual(out['records']['follow_ups'][0]['completed_by_user_id'], TEAM['id'])
        self.assertEqual(approvals.direct_complete(TEAM, self.complete_payload(first)), out)

    def test_direct_completion_race_cannot_leave_pending_on_completed(self):
        followup = self.followup()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            future_request = pool.submit(lambda: self.outcome(lambda: approvals.completion_submit(FIELD, self.payload(followup))))
            future_complete = pool.submit(lambda: self.outcome(lambda: approvals.direct_complete(TEAM, self.complete_payload(followup))))
            outcomes = [future_request.result(), future_complete.result()]
        self.assertEqual(sum(isinstance(o, dict) for o in outcomes), 1)
        self.assertIn(409, outcomes)
        current = self.read(followup['follow_up_id'])
        self.assertFalse(current['status'] == '완료' and current['completion_approval_status'] == 'pending')

    def test_notice_failure_rolls_back_request_and_decision(self):
        followup = self.followup(); payload = self.payload(followup)
        with patch.object(approvals, 'queue_notice', side_effect=RuntimeError('outbox unavailable')):
            with self.assertRaises(RuntimeError): approvals.completion_submit(FIELD, payload)
        self.assertEqual(self.read(followup['follow_up_id'])['completion_approval_status'], '')
        request = approvals.completion_submit(FIELD, payload)['request']
        with patch.object(approvals, 'queue_notice', side_effect=RuntimeError('outbox unavailable')):
            with self.assertRaises(RuntimeError): approvals.completion_decide(TEAM, dict(request_id=request['request_id'], action='approve'))
        current = self.read(followup['follow_up_id'])
        self.assertEqual(current['status'], '예정')
        self.assertEqual(current['completed_by_user_id'], '')
        self.assertEqual(current['completion_approval_status'], 'pending')

    def test_bell_recipients_request_kind_and_read_state(self):
        for user, action in ((FIELD, 'approve'), (STEEL, 'reject')):
            followup = self.followup(user)
            request = approvals.completion_submit(user, self.payload(followup))['request']
            incoming = self.notice(TEAM, request, 'approval_request')
            self.assertEqual(incoming['request_kind'], 'completion')
            self.assertEqual(incoming['request_id'], request['request_id'])
            self.assertIn('완료 승인 요청', incoming['title'])
            self.assertIsNone(self.notice(FIELD, request, 'approval_request'))
            self.assertIsNone(self.notice(STEEL, request, 'approval_request'))
            bell.mark_read(TEAM, dict(event_ids=[incoming['id']]))
            self.assertTrue(self.notice(TEAM, request, 'approval_request')['read'])
            approvals.completion_decide(TEAM, dict(request_id=request['request_id'], action=action, note='검토 결과'))
            kind = 'approval_approved' if action == 'approve' else 'approval_rejected'
            result = self.notice(user, request, kind)
            self.assertEqual(result['request_kind'], 'completion')
            self.assertFalse(result['read'])
            self.assertIsNone(self.notice(TEAM, request, kind))
            self.assertIsNone(self.notice(STEEL if user == FIELD else FIELD, request, kind))
            with self.assertRaises(AuthError): bell.mark_read(TEAM, dict(event_ids=[result['id']]))

    def test_http_cannot_bypass_workflow_and_requires_session_csrf(self):
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
                try: response = self.http.open(Request(base+path, headers=headers, data=None if payload is None else json.dumps(payload).encode()), timeout=15)
                except HTTPError as error: response = error
                case.assertEqual(response.status, status)
                return json.loads(response.read())
        try:
            followup = self.followup(); payload = self.payload(followup)
            Client().call('/api/completions/submit', payload, status=401)
            field, team, steel = Client('joy123'), Client('ksm123'), Client('kmj123')
            field.call('/api/completions/submit', payload, status=403, csrf=False)
            field.call('/api/maintenance', self.complete_payload(followup), status=403)
            steel.call('/api/completions/submit', payload, status=403)
            req = field.call('/api/completions/submit', payload)['request']
            team.call('/api/maintenance', self.complete_payload(followup), status=409)
            field.call('/api/completions/decide', dict(request_id=req['request_id'], action='approve'), status=403)
            current = next(r for r in field.call('/api/maintenance')['follow_ups'] if r['follow_up_id'] == followup['follow_up_id'])
            self.assertEqual(current['completion_approval_status'], 'pending')
            self.assertEqual(current['status'], '예정')
            team.call('/api/completions/decide', dict(request_id=req['request_id'], action='approve'))
            mine = field.call('/api/me/activity')
            current = next(r for r in mine['completions'] if r['follow_up_id'] == followup['follow_up_id'])
            self.assertEqual(current['completion_approval_status'], 'approved')
            self.assertEqual(current['completed_by_user_id'], FIELD['id'])
        finally:
            httpd.shutdown(); httpd.server_close(); worker.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
