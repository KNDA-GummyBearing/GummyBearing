"""No external delivery: exercise actual Web Push encryption with a fake provider."""
import base64, json, os, tempfile, unittest
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush
import requests
import notifications

class ProtocolTests(unittest.TestCase):
    def test_webpush_encrypts_before_provider(self):
        for endpoint in ('https://web.push.apple.com/gb-local-test', 'https://fcm.googleapis.com/fcm/send/gb-local-test'):
            with self.subTest(endpoint=endpoint):
                self.check_encrypted_delivery(endpoint)

    def check_encrypted_delivery(self, endpoint):
        receiver=ec.generate_private_key(ec.SECP256R1())
        public=receiver.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
        b64=lambda value:base64.urlsafe_b64encode(value).decode().rstrip('=')
        subscription={'endpoint':endpoint,'keys':{'p256dh':b64(public),'auth':b64(os.urandom(16))}}
        self.assertEqual(notifications.validate_subscription(subscription),subscription)
        private,_=notifications.vapid_keys()
        response=requests.Response();response.status_code=201;response._content=b''
        with patch('requests.post',return_value=response) as sender:
            webpush(subscription_info=subscription,data='{"title":"local-protocol-test"}',vapid_private_key=private,
                    vapid_claims={'sub':'mailto:gummybearing26@gmail.com'},timeout=20)
        self.assertEqual(sender.call_count,1)
        request=sender.call_args
        self.assertEqual(request.args[0], endpoint)
        self.assertNotIn(b'local-protocol-test',request.kwargs['data'])
        self.assertGreater(len(request.kwargs['data']),50)

    def test_endpoint_cannot_target_internal_network(self):
        for endpoint in ('http://127.0.0.1:3306','https://localhost/','https://push.apple.com.attacker.invalid/a','https://web.push.apple.com:443@127.0.0.1/', 'https://fcm.googleapis.com.attacker.invalid/a', 'https://fcm.googleapis.com:443@127.0.0.1/'):
            with self.assertRaises(ValueError): notifications.validate_subscription({'endpoint':endpoint,'keys':{}})

    def test_email_body_uses_equipment_id(self):
        with patch.dict(os.environ,{'GB_PUBLIC_ORIGIN':'https://example.invalid'}):
            message=notifications.Notifications.email_message(dict(title='[시연] 최초 경보',body='검증',destination='preview@example.invalid',equipment_id='EGF-01'))
        self.assertIn('https://example.invalid/#/equipment/EGF-01',message.get_content())
        self.assertNotIn('비밀번호',message.get_content())

if __name__=='__main__':unittest.main()
