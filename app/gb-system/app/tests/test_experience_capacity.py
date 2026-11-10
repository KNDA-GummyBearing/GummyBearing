"""Shared-Wi-Fi entry limits and trusted-proxy regression; no DB or network."""
from contextlib import contextmanager
from types import SimpleNamespace
import os
import unittest
from unittest.mock import patch

import experience
from auth import AuthError
from server import Handler


class MemoryCursor:
    """Small transaction adapter for the persistent fixed-window counter SQL."""
    def __init__(self):
        self.buckets = {}
        self.row = None
        self.visitors = 0

    def execute(self, sql, args):
        if sql.startswith('INSERT INTO gb_experience_limits'):
            key, reset, now, _, _ = args
            previous = self.buckets.get(key)
            self.buckets[key] = ({'attempts': 1, 'reset_epoch': reset}
                if previous is None or previous['reset_epoch'] <= now else
                {'attempts': previous['attempts'] + 1, 'reset_epoch': previous['reset_epoch']})
        elif sql.startswith('SELECT attempts,reset_epoch'):
            self.row = self.buckets[args[0]]
        elif sql.startswith('INSERT INTO gb_experience_visitors'):
            self.visitors += 1
        elif not sql.startswith(('INSERT INTO gb_experience_settings', 'INSERT INTO gb_experience_rounds')):
            raise AssertionError('Unexpected SQL: ' + sql)

    def fetchone(self):
        return dict(self.row)


class ExperienceCapacityTests(unittest.TestCase):
    def setUp(self):
        self.cursor = MemoryCursor()
        @contextmanager
        def transaction():
            yield self.cursor
        context = patch.object(experience, 'transaction', transaction)
        context.start()
        self.addCleanup(context.stop)
        self.service = experience.Experience(SimpleNamespace(revision='test'))
        self.service._new_session = lambda cur, visitor: ('test-token', experience.public_user(visitor))

    def start(self, ip='203.0.113.1'):
        return self.service.start({'username': 'all'}, ip)

    def test_150_attendees_can_start_on_shared_wifi(self):
        for _ in range(150):
            _, user = self.start()
            self.assertEqual(user['role'], 'visitor')
            self.assertFalse(user['capabilities']['business_write'])
            self.assertFalse(user['capabilities']['personal_notifications'])
        self.assertEqual(self.cursor.visitors, 150)

    def test_ip_budget_still_blocks_attempt_301(self):
        for _ in range(300):
            self.start()
        with self.assertRaises(AuthError) as caught:
            self.start()
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(self.cursor.visitors, 300)
        self.start('203.0.113.2')  # A different network is not blocked with this IP.

    def test_global_budget_still_blocks_attempt_1001(self):
        for network in range(4):
            for _ in range(250):
                self.start('203.0.113.' + str(network + 1))
        with self.assertRaises(AuthError) as caught:
            self.start('203.0.113.10')
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(self.cursor.visitors, 1000)

    def test_existing_counter_over_old_limit_is_admitted_without_reset(self):
        key = experience.digest('create-ip:' + experience.digest('203.0.113.1'))
        with patch.object(experience.time, 'time', return_value=100):
            self.cursor.buckets[key] = {'attempts': 12, 'reset_epoch': 3700}
            self.start()
            self.assertEqual(self.cursor.buckets[key], {'attempts': 13, 'reset_epoch': 3700})

    def test_limit_window_expires_after_one_hour(self):
        with patch.object(experience.time, 'time', return_value=100):
            for _ in range(300): self.start()
            with self.assertRaises(AuthError): self.start()
        with patch.object(experience.time, 'time', return_value=3700):
            self.start()
        self.assertEqual(self.cursor.visitors, 301)


class ProxyAddressTests(unittest.TestCase):
    def resolved(self, peer, forwarded, enabled):
        handler = object.__new__(Handler)
        handler.client_address = (peer, 12345)
        handler.headers = {'X-Forwarded-For': forwarded}
        with patch.dict(os.environ, {'GB_TRUST_PROXY_HEADERS': enabled}):
            return handler.experience_client_ip()

    def test_caddy_forwarded_visitors_are_counted_separately(self):
        first = self.resolved('172.19.0.4', '203.0.113.1', '1')
        second = self.resolved('172.19.0.4', '203.0.113.2', '1')
        self.assertNotEqual(first, second)
        self.assertEqual(first, '203.0.113.1')

    def test_headers_are_ignored_without_opt_in(self):
        self.assertEqual(self.resolved('172.19.0.4', '203.0.113.1', '0'), '172.19.0.4')

    def test_direct_public_peer_cannot_override_address(self):
        self.assertEqual(self.resolved('8.8.8.8', '203.0.113.1', '1'), '8.8.8.8')

    def test_invalid_forwarded_address_falls_back_to_peer(self):
        self.assertEqual(self.resolved('172.19.0.4', 'invalid', '1'), '172.19.0.4')


if __name__ == '__main__':
    unittest.main()
