"""CPU/cache regressions; no DB connections, VAPID writes or external delivery."""
import io
import unittest
from unittest.mock import MagicMock, patch

import auth
import notifications
import server


class NotificationPollingTests(unittest.TestCase):
    def setUp(self):
        self.stack = []
        for target, value in [('alarm_indexes', {}), ('vapid_keys', ('unused', 'unused'))]:
            context = patch.object(notifications, target, return_value=value)
            context.start()
            self.addCleanup(context.stop)

    def empty_database(self):
        connection = MagicMock()
        cursor = connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = []
        return connection

    def test_server_store_is_reused_without_another_password_hash(self):
        store = MagicMock()
        with patch.object(auth, 'hash_password') as password_hash:
            worker = notifications.Notifications(role_store=store)
        self.assertIs(worker.role_store, store)
        password_hash.assert_not_called()

    def test_repeated_empty_polls_do_not_construct_or_hash_again(self):
        # The fallback still supports standalone callers, but only initializes once.
        with patch.object(auth, 'hash_password', return_value='unused') as password_hash, \
             patch.object(notifications.DemoRoleStore, 'profiles', return_value=[]) as profiles, \
             patch.object(notifications, 'read_tables', return_value={'equipment': []}), \
             patch.object(notifications, 'connect', return_value=self.empty_database()):
            worker = notifications.Notifications()
            initialized_calls = password_hash.call_count
            for _ in range(3):
                worker.enqueue()
        self.assertEqual(initialized_calls, 1)
        self.assertEqual(password_hash.call_count, 1)
        self.assertEqual(profiles.call_count, 3)

    def test_role_changes_are_read_each_poll_not_frozen_with_the_store(self):
        store = MagicMock()
        store.profiles.side_effect = [[], [dict(id='field', role='field', process='sinter')]]
        worker = notifications.Notifications(role_store=store)
        with patch.object(notifications, 'read_tables', return_value={'equipment': []}), \
             patch.object(notifications, 'connect', return_value=self.empty_database()):
            worker.enqueue()
            worker.enqueue()
        self.assertEqual(store.profiles.call_count, 2)


class PublicAssetCacheTests(unittest.TestCase):
    def cache_header(self, path, status=200, method='GET'):
        handler = server.Handler.__new__(server.Handler)
        handler.path = path
        handler.command = method
        handler.request_version = 'HTTP/1.1'
        handler._headers_buffer = []
        handler.wfile = io.BytesIO()
        handler.log_request = lambda *args: None
        handler.send_response(status)
        handler.end_headers()
        headers = handler.wfile.getvalue().decode('latin1').splitlines()
        return next(line.split(': ', 1)[1] for line in headers
                    if line.lower().startswith('cache-control:'))

    def test_team_and_experience_share_cache_policy_for_existing_public_assets(self):
        for prefix in ('', '/experience'):
            for asset in ('img/map_light.png', 'fonts/PretendardVariable.woff'):
                for status, method in ((200, 'GET'), (200, 'HEAD'), (304, 'GET')):
                    with self.subTest(prefix=prefix, asset=asset, status=status, method=method):
                        self.assertEqual(self.cache_header(prefix+'/assets/'+asset+'?v=check', status, method),
                                         'public, max-age=86400')

    def test_private_data_stays_no_store_and_code_revalidates(self):
        for prefix in ('', '/experience'):
            for path in ('/api/auth/session', '/api/maintenance', '/api/notifications/round',
                         '/data/sensor_timeseries.csv', '/sw.js', '/index.html'):
                with self.subTest(path=prefix+path):
                    self.assertEqual(self.cache_header(prefix+path), 'no-store')
            for path in ('/js/app.js', '/css/app.css'):
                self.assertEqual(self.cache_header(prefix+path), 'no-cache')

    def test_missing_assets_and_error_responses_are_not_publicly_cached(self):
        for prefix in ('', '/experience'):
            self.assertEqual(self.cache_header(prefix+'/assets/no-such-public-file.png', 404), 'no-store')
            self.assertEqual(self.cache_header(prefix+'/assets/img/map_light.png', 401), 'no-store')
            self.assertEqual(self.cache_header(prefix+'/assets/img/map_light.png', 500), 'no-store')
            self.assertEqual(self.cache_header(prefix+'/assets/../data/sensor_timeseries.csv'), 'no-store')


if __name__ == '__main__':
    unittest.main()
