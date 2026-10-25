"""List-query regressions: bounded query count, scope, ordering and empty metadata."""
import copy
import os
import unittest
from unittest.mock import MagicMock, patch

import approvals
import mysql_store as records


class BatchReadTests(unittest.TestCase):
    def test_large_list_is_bounded_and_preserves_order(self):
        cur = MagicMock()
        cur.fetchall.return_value = []
        rows = [dict(inspection_id=f'I-{i}', equipment_id='EGF-01') for i in range(1201)]
        with patch.dict(os.environ, {'GB_DEMO_ROLE_SELECTION': '1'}):
            result = records.audit_records(cur, 'inspections', rows)
        self.assertEqual(cur.execute.call_count, 6)  # authors + approvals, 3 batches
        self.assertEqual([row['inspection_id'] for row in result], [row['inspection_id'] for row in rows])
        self.assertTrue(all(row['inspector_user_id'] == row['approval_status'] == '' for row in result))
        self.assertTrue(all(len(call.args[1]) <= 500 for call in cur.execute.call_args_list))

    def test_empty_lists_do_not_connect_or_query(self):
        cur = MagicMock()
        self.assertEqual(records.audit_records(cur, 'follow_ups', []), [])
        cur.execute.assert_not_called()
        with patch.object(records, 'connect') as connection:
            self.assertEqual(approvals.decorate_followups({'follow_ups': []}), {'follow_ups': []})
        connection.assert_not_called()

    def test_completion_metadata_uses_only_scoped_ids_and_newest_request(self):
        connection = MagicMock()
        cur = connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchall.return_value = [
            dict(follow_up_id='F-1', request_id='new', status='approved'),
            dict(follow_up_id='F-1', request_id='old', status='rejected'),
        ]
        data = {'follow_ups': [dict(follow_up_id='F-1'), dict(follow_up_id='F-2')],
                'calendar_schedules': [dict(follow_up_id='F-1')]}
        with patch.object(records, 'connect', return_value=connection):
            approvals.decorate_followups(data)
        sql, args = cur.execute.call_args.args
        self.assertEqual(args, ['F-1', 'F-2'])
        self.assertIn('ORDER BY requested_at DESC,request_id DESC', sql)
        cur.execute.assert_called_once()
        self.assertEqual(data['follow_ups'][0]['completion_approval_request_id'], 'new')
        self.assertEqual(data['calendar_schedules'][0]['completion_approval_status'], 'approved')
        self.assertEqual(data['follow_ups'][1]['completion_approval_status'], '')


class LocalDatabaseParityTests(unittest.TestCase):
    @unittest.skipUnless(os.getenv('GB_PUBLIC_ORIGIN') in (
        'http://127.0.0.1:18084', 'http://127.0.0.1:18087'), 'Local read-only parity check')
    def test_existing_rows_exactly_match_transactional_single_row_reader(self):
        self.assertEqual(os.environ.get('GB_EMAIL_SEND'), '0')
        self.assertEqual(os.environ.get('GB_PUSH_SEND'), '0')
        with records.connect() as conn, conn.cursor() as cur:
            for table, key in records.KEYS.items():
                cur.execute(f'SELECT * FROM `{table}` ORDER BY `{key}`')
                rows = cur.fetchall()
                expected = [records.audit_record(cur, table, row) for row in rows]
                actual = records.audit_records(cur, table, rows)
                self.assertEqual(actual, expected, table)
            cur.execute('SELECT * FROM follow_ups ORDER BY follow_up_id')
            followups = [records.serialize(row) for row in cur.fetchall()]
            expected = [approvals.completion_metadata(cur, copy.deepcopy(row)) for row in followups]
        actual = approvals.decorate_followups({'follow_ups': followups})['follow_ups']
        self.assertEqual(actual, expected)


if __name__ == '__main__':
    unittest.main()
