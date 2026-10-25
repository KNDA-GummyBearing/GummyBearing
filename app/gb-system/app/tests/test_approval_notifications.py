"""Recipient isolation and approval deep links; no network calls or real sends."""
import os
import unittest
from unittest.mock import patch
from notifications import event_recipients, event_url, Notifications

PROFILES = [
    dict(id='ksm123', role='supervisor', process=None),
    dict(id='joy123', role='field', process='sinter'),
    dict(id='kmj123', role='field', process='steel'),
]

class ApprovalNotificationTests(unittest.TestCase):
    def recipients(self, kind, username='joy123', process='sinter'):
        return [u['id'] for u in event_recipients(dict(kind=kind, username=username), PROFILES, process)]

    def test_request_only_notifies_supervisor(self):
        self.assertEqual(self.recipients('approval_request'), ['ksm123'])
        self.assertEqual(self.recipients('approval_request', 'kmj123', 'steel'), ['ksm123'])

    def test_decision_only_notifies_requester(self):
        for kind in ('approval_approved', 'approval_rejected'):
            self.assertEqual(self.recipients(kind), ['joy123'])
            self.assertEqual(self.recipients(kind, 'kmj123', 'steel'), ['kmj123'])
            self.assertEqual(self.recipients(kind, 'kmj123', 'sinter'), [])

    def test_alarm_and_self_test_preserve_scope(self):
        self.assertEqual(self.recipients('playback'), ['joy123'])
        self.assertEqual(self.recipients('playback_round', 'ksm123'), ['ksm123'])
        self.assertEqual(self.recipients('test'), ['joy123'])

    def test_approval_push_and_email_open_approval_page(self):
        delivery = dict(kind='approval_request', equipment_id='EGF-01', title='승인 요청',
                        body='새 점검', destination='test@example.invalid')
        self.assertEqual(event_url(delivery), '/#/approvals')
        with patch.dict(os.environ, {'GB_PUBLIC_ORIGIN': 'https://example.invalid'}):
            content = Notifications.email_message(delivery).get_content()
        self.assertIn('https://example.invalid/#/approvals', content)
        self.assertNotIn('/#/equipment/', content)

if __name__ == '__main__':
    unittest.main()
