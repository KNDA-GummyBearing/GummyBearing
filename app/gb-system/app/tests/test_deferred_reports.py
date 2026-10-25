"""Deferred report review on isolated MySQL; never starts delivery workers."""
import concurrent.futures
import copy
import hashlib
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import approvals
import bell
from auth import AuthError
import mysql_store as records
import test_schedule_approvals as fixture

TEAM, FIELD, STEEL = fixture.TEAM, fixture.FIELD, fixture.STEEL
DECISIONS = {'계속 관찰': '재확인', '추가 점검': '추가 점검', '정비 검토': '정비'}


class DeferredReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['MYSQL_DATABASE'] == fixture.DB, 'Isolated database required'
        assert os.environ.get('GB_PUSH_SEND') == '0' and os.environ.get('GB_EMAIL_SEND') == '0'
        assert os.environ.get('GB_DEMO_ROLE_SELECTION') == '1'

    def payload(self, decision='계속 관찰', supervisor=False, equipment='EGF-01'):
        payload = fixture.ApprovalTests().payload(inspection=True, equipment=equipment)
        payload['submission_kind'] = 'report'
        payload['inspection'].update(decision=decision, recheck_date='', additional_due='',
                                     additional_assignee='', additional_items='', noise_memo='')
        if not supervisor:
            payload.pop('schedule')
        else:
            payload['schedule']['type'] = DECISIONS[decision]
        return payload

    def decision(self, request):
        return dict(request_id=request['request_id'], action='approve', note='현장 보고서 확인',
                    schedule=dict(type=request['type'], due_date='2026-11-09',
                                  assignee='승인 지정 담당자', items='승인 지정 후속 점검 내용'))

    def count(self, table):
        return fixture.ApprovalTests().count(table)

    def notice(self, request_id, kind):
        event = hashlib.sha256(f'approval:{request_id}:{kind}'.encode()).hexdigest()
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT title,body FROM gb_alert_events WHERE event_id=%s', (event,))
            return cur.fetchone()

    def assert_no_followup(self, request):
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s', (request['inspection_id'],))
            self.assertEqual(cur.fetchone()['n'], 0)

    def test_three_decisions_submit_without_date_review_or_schedule(self):
        for decision, schedule_type in DECISIONS.items():
            with self.subTest(decision=decision):
                payload = self.payload(decision)
                payload['inspection']['memo'] = ''
                result = approvals.submit(FIELD, payload)
                request = result['request']
                self.assertEqual(request['request_kind'], 'report')
                self.assertEqual(request['submission_kind'], 'report')
                self.assertEqual(request['status'], 'pending')
                self.assertEqual(request['due_date'], '')
                self.assertEqual(request['type'], schedule_type)
                self.assertEqual(request['items'], '현장 점검 · ' + decision)
                self.assertIsNone(request['review'])
                self.assertEqual(result['records']['follow_ups'], [])
                self.assertEqual(request['inspection']['inspector'], FIELD['name'])
                self.assertEqual(request['inspection']['decision'], decision)
                self.assert_no_followup(request)
                notice = self.notice(request['request_id'], 'approval_request')
                self.assertEqual(notice['title'], '점검 보고서 승인 요청')
                self.assertIn('팀장 승인 시 날짜 지정', notice['body'])
                self.assertNotIn('None', notice['body'])
                listed = next(r for r in approvals.listing(TEAM)['requests'] if r['request_id'] == request['request_id'])
                self.assertEqual(listed['due_date'], '')
                self.assertTrue(any(r['approval_request_id'] == request['request_id']
                                    for r in records.my_activity(FIELD)['inspections']))

    def test_three_decisions_approve_into_one_reviewed_schedule(self):
        for decision in DECISIONS:
            with self.subTest(decision=decision):
                request = approvals.submit(FIELD, self.payload(decision))['request']
                result = approvals.decide(TEAM, self.decision(request))
                self.assertEqual(result['request']['status'], 'approved')
                self.assertEqual(result['request']['reviewed_by'], TEAM['id'])
                self.assertEqual(result['request']['request_kind'], 'report')
                self.assertEqual(len(result['records']['follow_ups']), 1)
                followup = result['records']['follow_ups'][0]
                self.assertEqual(followup['due_date'], '2026-11-09')
                self.assertEqual(followup['assignee'], '승인 지정 담당자')
                self.assertEqual(followup['items'], '승인 지정 후속 점검 내용')
                self.assertEqual(followup['type'], DECISIONS[decision])
                self.assertEqual(followup['created_by_user_id'], FIELD['id'])
                self.assertEqual(result['records']['inspections'][0]['approval_status'], 'approved')
                self.assertIn('일정 등록 완료', self.notice(request['request_id'], 'approval_approved')['title'])

    def test_report_reject_needs_note_but_no_date_or_schedule(self):
        request = approvals.submit(FIELD, self.payload('정비 검토'))['request']
        with self.assertRaises(records.ValidationError):
            approvals.decide(TEAM, dict(request_id=request['request_id'], action='reject'))
        payload = dict(request_id=request['request_id'], action='reject', note='현장 확인 내용 보완')
        result = approvals.decide(TEAM, payload)
        self.assertEqual(result['request']['status'], 'rejected')
        self.assertEqual(result['request']['due_date'], '')
        self.assert_no_followup(request)
        self.assertEqual(approvals.decide(TEAM, payload), result)
        self.assertEqual(self.notice(request['request_id'], 'approval_rejected')['title'], '점검 보고서 반려')
        self.assertIn('일정 미등록', self.notice(request['request_id'], 'approval_rejected')['body'])
        with self.assertRaises(AuthError) as raised:
            approvals.decide(TEAM, self.decision(request))
        self.assertEqual(raised.exception.status, 409)

    def test_bell_report_kind_and_requester_only_decision_recipients(self):
        for action in ('approve', 'reject'):
            request = approvals.submit(FIELD, self.payload())['request']
            incoming = hashlib.sha256(f"approval:{request['request_id']}:approval_request".encode()).hexdigest()
            def find(user, ident):
                return next((r for r in bell.inbox(user)['notifications'] if r['id'] == ident), None)
            self.assertEqual(find(TEAM, incoming)['request_kind'], 'report')
            self.assertIsNone(find(FIELD, incoming))
            self.assertIsNone(find(STEEL, incoming))
            decision = self.decision(request) if action == 'approve' else dict(
                request_id=request['request_id'], action='reject', note='보고서 보완')
            approvals.decide(TEAM, decision)
            status = 'approved' if action == 'approve' else 'rejected'
            outgoing = hashlib.sha256(f"approval:{request['request_id']}:approval_{status}".encode()).hexdigest()
            row = find(FIELD, outgoing)
            self.assertEqual(row['request_kind'], 'report')
            self.assertEqual(row['approval_status'], status)
            self.assertEqual(row['url'], '/#/approvals')
            self.assertIsNone(find(TEAM, outgoing))
            self.assertIsNone(find(STEEL, outgoing))

    def test_review_requires_explicit_valid_date_assignee_and_items(self):
        request = approvals.submit(FIELD, self.payload())['request']
        variants = [dict(request_id=request['request_id'], action='approve')]
        for key in ('due_date', 'assignee', 'items'):
            candidate = self.decision(request)
            candidate['schedule'].pop(key)
            variants.append(candidate)
        for key, value in (('due_date', ''), ('due_date', None), ('due_date', '2026-02-30'),
                           ('due_date', '2026-10-23'), ('assignee', '   '), ('items', ''),
                           ('type', '임의 종류'), ('equipment_id', 'EGF-04')):
            candidate = self.decision(request)
            candidate['schedule'][key] = value
            variants.append(candidate)
        for candidate in variants:
            with self.subTest(payload=candidate), self.assertRaises(records.ValidationError):
                approvals.decide(TEAM, candidate)
        self.assert_no_followup(request)
        self.assertIsNone(self.notice(request['request_id'], 'approval_approved'))
        pending = next(r for r in approvals.listing(FIELD)['requests'] if r['request_id'] == request['request_id'])
        self.assertEqual(pending['status'], 'pending')

    def test_report_schema_core_choices_and_hidden_fields_remain_strict(self):
        variants = []
        candidate = self.payload(); candidate.pop('inspection'); variants.append(candidate)
        candidate = self.payload(); candidate['submission_kind'] = 'anything'; variants.append(candidate)
        candidate = self.payload(); candidate['review'] = {}; variants.append(candidate)
        candidate = self.payload(supervisor=True); variants.append(candidate)
        for key, value in (('decision', ''), ('need_additional', ''), ('noise', ''),
                           ('operation_state', 'invalid'), ('recheck_date', '2026-11-05'),
                           ('additional_items', 'hidden old draft'), ('visual', ['기타'])):
            candidate = self.payload(); candidate['inspection'][key] = value; variants.append(candidate)
        candidate = self.payload(); candidate['inspection'].pop('noise_memo'); variants.append(candidate)
        candidate = self.payload(); candidate['inspection']['unknown_column'] = ''; variants.append(candidate)
        before = {table: self.count(table) for table in ('inspections', 'gb_schedule_approvals', 'gb_alert_events')}
        for candidate in variants:
            with self.subTest(candidate=candidate), self.assertRaises(records.ValidationError):
                approvals.submit(FIELD, candidate)
        self.assertEqual(before, {table: self.count(table) for table in before})

    def test_supervisor_three_decisions_autoapprove_with_explicit_schedule(self):
        for decision in DECISIONS:
            with self.subTest(decision=decision):
                with self.assertRaises(records.ValidationError):
                    approvals.submit(TEAM, self.payload(decision))
                result = approvals.submit(TEAM, self.payload(decision, supervisor=True))
                request = result['request']
                self.assertEqual(request['status'], 'approved')
                self.assertEqual(request['reviewed_by'], TEAM['id'])
                self.assertEqual(request['request_kind'], 'report')
                self.assertEqual(len(result['records']['follow_ups']), 1)
                self.assertIsNone(self.notice(request['request_id'], 'approval_request'))
                self.assertIsNone(self.notice(request['request_id'], 'approval_approved'))

    def test_concurrent_field_submit_and_approval_are_idempotent(self):
        payload = self.payload('추가 점검')
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: approvals.submit(FIELD, payload), range(3)))
        self.assertEqual(len({r['request']['request_id'] for r in results}), 1)
        self.assertEqual(len({r['request']['inspection_id'] for r in results}), 1)
        request = results[0]['request']
        changed = copy.deepcopy(payload); changed['inspection']['memo'] += ' 변경'
        with self.assertRaises(AuthError) as raised:
            approvals.submit(FIELD, changed)
        self.assertEqual(raised.exception.status, 409)
        decision = self.decision(request)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: approvals.decide(TEAM, decision), range(3)))
        self.assertEqual(len({r['request']['follow_up_id'] for r in results}), 1)
        retry = approvals.submit(FIELD, payload)
        self.assertEqual(retry['request']['status'], 'approved')
        self.assertEqual(len(retry['records']['follow_ups']), 1)
        with records.connect() as conn, conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM follow_ups WHERE inspection_id=%s', (request['inspection_id'],))
            self.assertEqual(cur.fetchone()['n'], 1)

    def test_concurrent_supervisor_submit_creates_one_report_and_schedule(self):
        payload = self.payload('정비 검토', supervisor=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: approvals.submit(TEAM, payload), range(3)))
        self.assertEqual(len({r['request']['request_id'] for r in results}), 1)
        self.assertEqual(len({r['request']['follow_up_id'] for r in results}), 1)
        self.assertTrue(all(r['request']['status'] == 'approved' for r in results))

    def test_notifications_and_business_changes_rollback_together(self):
        tables = ('inspections', 'gb_inspection_authors', 'gb_schedule_approvals', 'follow_ups', 'gb_followup_authors')
        before = {table: self.count(table) for table in tables}
        with patch.object(approvals, 'queue_notice', side_effect=RuntimeError('isolated outbox failure')):
            with self.assertRaises(RuntimeError):
                approvals.submit(FIELD, self.payload())
        self.assertEqual(before, {table: self.count(table) for table in tables})
        request = approvals.submit(FIELD, self.payload())['request']
        before = {table: self.count(table) for table in tables}
        with patch.object(approvals, 'queue_notice', side_effect=RuntimeError('isolated outbox failure')):
            with self.assertRaises(RuntimeError):
                approvals.decide(TEAM, self.decision(request))
        self.assertEqual(before, {table: self.count(table) for table in tables})
        self.assert_no_followup(request)
        self.assertEqual(next(r for r in approvals.listing(TEAM)['requests'] if r['request_id'] == request['request_id'])['status'], 'pending')

    def test_legacy_schedule_and_report_conditions_stay_strict(self):
        for decision in DECISIONS:
            candidate = self.payload(decision, supervisor=True)
            candidate.pop('submission_kind')
            with self.subTest(decision=decision), self.assertRaises(records.ValidationError):
                approvals.submit(FIELD, candidate)
        candidate = fixture.ApprovalTests().payload(inspection=True)
        request = approvals.submit(FIELD, candidate)['request']
        self.assertEqual(request['request_kind'], 'schedule')
        result = approvals.decide(TEAM, dict(request_id=request['request_id'], action='approve'))
        self.assertEqual(result['records']['follow_ups'][0]['due_date'], candidate['schedule']['due_date'])

    def test_scope_and_visitor_write_guards_stay_intact(self):
        with self.assertRaises(AuthError) as raised:
            approvals.submit(FIELD, self.payload(equipment='EGF-04'))
        self.assertEqual(raised.exception.status, 403)
        visitor = dict(id='visitor-isolated', name='개인 체험', role='visitor', process='sinter')
        for action in (lambda: approvals.submit(visitor, self.payload()),
                       lambda: approvals.listing(visitor),
                       lambda: approvals.decide(visitor, dict(request_id='anything', action='approve'))):
            with self.assertRaises(AuthError) as raised:
                action()
            self.assertEqual(raised.exception.status, 403)
        request = approvals.submit(STEEL, self.payload(equipment='EGF-04'))['request']
        self.assertFalse(any(r['request_id'] == request['request_id'] for r in approvals.listing(FIELD)['requests']))


if __name__ == '__main__':
    unittest.main()
