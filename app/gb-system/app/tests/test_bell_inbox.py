"""Read-state/recipient tests in the isolated local DB; never run a sender."""
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import time
import unittest
import uuid
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import approvals
import bell
from auth import AuthError
import mysql_store as records
import test_schedule_approvals as fixture
import server
import roles


def event_id(request, kind):
    return hashlib.sha256(f"approval:{request['request_id']}:{kind}".encode()).hexdigest()


class BellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['MYSQL_DATABASE'] == fixture.DB
        assert os.environ.get('GB_PUSH_SEND') == '0' and os.environ.get('GB_EMAIL_SEND') == '0'

    def request(self, user=fixture.FIELD):
        payload = fixture.ApprovalTests().payload(equipment='EGF-04' if user==fixture.STEEL else 'EGF-01')
        return approvals.submit(user,payload)['request']

    def find(self, user, ident):
        return next((row for row in bell.inbox(user)['notifications'] if row['id']==ident),None)

    def test_recipient_permissions_request_and_both_decisions(self):
        for user, action in ((fixture.FIELD,'approve'),(fixture.STEEL,'reject')):
            request=self.request(user)
            incoming=event_id(request,'approval_request')
            row=self.find(fixture.TEAM,incoming)
            self.assertIsNotNone(row)
            self.assertEqual(row['request_id'],request['request_id'])
            self.assertFalse(row['read'])
            self.assertIsNone(self.find(fixture.FIELD,incoming))
            self.assertIsNone(self.find(fixture.STEEL,incoming))
            approvals.decide(fixture.TEAM,dict(request_id=request['request_id'],action=action,note='검토 확인'))
            outcome=event_id(request,'approval_approved' if action=='approve' else 'approval_rejected')
            row=self.find(user,outcome)
            self.assertEqual(row['approval_status'],'approved' if action=='approve' else 'rejected')
            self.assertEqual(row['url'],'/#/approvals')
            self.assertIsNone(self.find(fixture.TEAM,outcome))
            other=fixture.STEEL if user==fixture.FIELD else fixture.FIELD
            self.assertIsNone(self.find(other,outcome))
            self.assertNotIn('username',row)
            self.assertNotIn('destination',row)

    def test_read_survives_reload_and_duplicate_submit_does_not_recreate(self):
        payload=fixture.ApprovalTests().payload()
        request=approvals.submit(fixture.FIELD,payload)['request']
        ident=event_id(request,'approval_request')
        before=bell.inbox(fixture.TEAM)['unread_count']
        result=bell.mark_read(fixture.TEAM,dict(event_ids=[ident,ident]))
        self.assertEqual(result['unread_count'],before-1)
        first=self.find(fixture.TEAM,ident)
        self.assertTrue(first['read'])
        self.assertTrue(first['read_at'].endswith('+09:00'))
        bell.mark_read(fixture.TEAM,dict(event_ids=[ident]))
        approvals.submit(fixture.FIELD,payload)
        self.assertEqual(self.find(fixture.TEAM,ident)['read_at'],first['read_at'])
        with records.connect() as conn,conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_bell_reads WHERE event_id=%s AND username=%s',(ident,fixture.TEAM['id']))
            self.assertEqual(cur.fetchone()['n'],1)

    def test_mixed_unauthorized_ids_fail_atomically(self):
        request=self.request()
        incoming=event_id(request,'approval_request')
        approvals.decide(fixture.TEAM,dict(request_id=request['request_id'],action='approve'))
        result=event_id(request,'approval_approved')
        with self.assertRaises(AuthError) as raised:
            bell.mark_read(fixture.FIELD,dict(event_ids=[result,incoming]))
        self.assertEqual(raised.exception.status,403)
        self.assertFalse(self.find(fixture.FIELD,result)['read'])
        self.assertFalse(self.find(fixture.TEAM,incoming)['read'])
        with self.assertRaises(AuthError) as raised:
            bell.mark_read(fixture.TEAM,dict(event_ids=[incoming,'0'*64]))
        self.assertEqual(raised.exception.status,403)
        self.assertFalse(self.find(fixture.TEAM,incoming)['read'])

    def test_only_explicit_ids_read_and_new_arrival_stays_unread(self):
        first=self.request(); seen=event_id(first,'approval_request')
        later=self.request(); unseen=event_id(later,'approval_request')
        bell.mark_read(fixture.TEAM,dict(event_ids=[seen]))
        self.assertTrue(self.find(fixture.TEAM,seen)['read'])
        self.assertFalse(self.find(fixture.TEAM,unseen)['read'])

    def test_invalid_request_and_scope_change_are_rejected(self):
        for payload in ({}, {'all':False}, {'all':1}, {'all':True,'event_ids':[]}, {'event_ids':[]}, {'event_ids':['bad']}):
            with self.assertRaises(records.ValidationError): bell.mark_read(fixture.FIELD,payload)
        request=self.request()
        approvals.decide(fixture.TEAM,dict(request_id=request['request_id'],action='approve'))
        ident=event_id(request,'approval_approved')
        changed=dict(fixture.FIELD,process='steel')
        self.assertIsNone(self.find(changed,ident))
        with self.assertRaises(AuthError): bell.mark_read(changed,dict(event_ids=[ident]))
        with self.assertRaises(AuthError): bell.inbox(dict(id='joy123',role='unknown'))

    def test_large_inbox_keeps_all_unread_and_only_recent_100_read(self):
        tag='bell-limit-'+str(uuid.uuid4())
        ids=[hashlib.sha256((tag+str(i)).encode()).hexdigest() for i in range(205)]
        job=hashlib.sha256(tag.encode()).hexdigest()[:32]
        now=time.time()
        with records.connect() as conn,conn.cursor() as cur:
            cur.execute('INSERT INTO gb_alert_jobs(job_id,username,kind,created_epoch) VALUES(%s,%s,%s,%s)',
                        (job,fixture.FIELD['id'],'approval_request',now))
            cur.executemany('INSERT INTO gb_alert_events(event_id,job_id,equipment_id,title,body,due_epoch) VALUES(%s,%s,%s,%s,%s,%s)',
                            [(ident,job,'EGF-01','격리 테스트 승인 요청','발송 없는 목록 크기 검증',now) for ident in ids])
            conn.commit()
        self.assertTrue(set(ids).issubset({r['id'] for r in bell.inbox(fixture.TEAM)['notifications']}))
        bell.mark_read(fixture.TEAM,dict(event_ids=ids[:105]))
        result=bell.inbox(fixture.TEAM)
        self.assertEqual(sum(not r['read'] for r in result['notifications']),result['unread_count'])
        self.assertEqual(sum(r['read'] for r in result['notifications']),100)
        self.assertTrue(set(ids[105:]).issubset({r['id'] for r in result['notifications']}))

    def test_all_read_does_not_affect_another_recipient_or_delivery(self):
        request=self.request()
        approvals.decide(fixture.TEAM,dict(request_id=request['request_id'],action='approve'))
        incoming=event_id(request,'approval_request')
        outcome=event_id(request,'approval_approved')
        with records.connect() as conn,conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_alert_deliveries'); before=cur.fetchone()['n']
        self.assertEqual(bell.mark_read(fixture.FIELD,dict(all=True))['unread_count'],0)
        self.assertTrue(self.find(fixture.FIELD,outcome)['read'])
        self.assertFalse(self.find(fixture.TEAM,incoming)['read'])
        with records.connect() as conn,conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_alert_deliveries'); self.assertEqual(cur.fetchone()['n'],before)

    def test_http_session_csrf_and_recipient_read_isolation(self):
        class QuietHandler(server.Handler):
            def log_message(self,*args): pass
        httpd=server.ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
        httpd.auth_store=roles.DemoRoleStore()
        worker=threading.Thread(target=httpd.serve_forever,daemon=True);worker.start()
        base='http://127.0.0.1:'+str(httpd.server_port)
        class Client:
            def __init__(self,username=None):
                self.http=build_opener(HTTPCookieProcessor(CookieJar()));self.csrf=''
                if username:self.csrf=self.call('/api/demo/select',dict(username=username))['csrf']
            def call(self,path,payload=None,status=200,csrf=True):
                headers={'Content-Type':'application/json','X-GB-Request':'1','Origin':os.environ['GB_PUBLIC_ORIGIN']}
                if csrf:headers['X-CSRF-Token']=self.csrf
                try:r=self.http.open(Request(base+path,headers=headers,data=None if payload is None else json.dumps(payload).encode()),timeout=15)
                except HTTPError as error:r=error
                data=json.load(r)
                assert r.status==status,(r.status,data)
                return data
        try:
            Client().call('/api/notifications/inbox',status=401)
            lead,field,other=Client('ksm123'),Client('joy123'),Client('kmj123')
            request=field.call('/api/approvals/submit',fixture.ApprovalTests().payload())['request']
            incoming=event_id(request,'approval_request')
            self.assertTrue(any(r['id']==incoming for r in lead.call('/api/notifications/inbox')['notifications']))
            field.call('/api/notifications/read',dict(event_ids=[incoming]),status=403)
            lead.call('/api/notifications/read',dict(event_ids=[incoming]),status=403,csrf=False)
            lead.call('/api/notifications/read',dict(event_ids=[incoming]))
            lead.call('/api/approvals/decide',dict(request_id=request['request_id'],action='approve'))
            outcome=event_id(request,'approval_approved')
            self.assertFalse(any(r['id']==outcome for r in other.call('/api/notifications/inbox')['notifications']))
            field.call('/api/notifications/read',dict(event_ids=[outcome,incoming]),status=403)
            row=next(r for r in field.call('/api/notifications/inbox')['notifications'] if r['id']==outcome)
            self.assertFalse(row['read'])
            field.call('/api/notifications/read',dict(event_ids=[outcome]))
            row=next(r for r in field.call('/api/notifications/inbox')['notifications'] if r['id']==outcome)
            self.assertTrue(row['read'])
        finally:
            httpd.shutdown();httpd.server_close();worker.join(timeout=5)


if __name__=='__main__': unittest.main()
