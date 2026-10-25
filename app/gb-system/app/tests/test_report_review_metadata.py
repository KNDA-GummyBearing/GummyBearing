"""Read-only report decoration preserves scope, approval identity and Korea time."""
from contextlib import nullcontext
from datetime import datetime
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import approvals

class Cursor:
    def __init__(self): self.calls=[]
    def execute(self,sql,args): self.calls.append((sql,args))
    def fetchall(self):
        if 'inspection_id' in self.calls[-1][0]:
            return [dict(inspection_id='I1',equipment_id='E1',request_id='A1',status='approved',reviewer_name='팀장',reviewed_at=datetime(2026,10,26,17,42),note='승인 의견'),
                    dict(inspection_id='I2',equipment_id='OTHER',request_id='OTHER',status='approved')]
        return [dict(follow_up_id='F1',equipment_id='E1',request_id='A1',status='approved',reviewer_name='팀장',reviewed_at=datetime(2026,10,26,17,42),note='승인 의견')]

class ReviewMetadataTests(unittest.TestCase):
    def test_scope_exact_ids_and_review_audit(self):
        data={'inspections':[{'inspection_id':'I1','equipment_id':'E1'},{'inspection_id':'I2','equipment_id':'E1'},{'inspection_id':'I3','equipment_id':'E1'}],
              'follow_ups':[{'follow_up_id':'F1','equipment_id':'E1'}]}
        cur=Cursor()
        class Connection:
            def cursor(self): return nullcontext(cur)
        with patch.object(approvals.records,'connect',return_value=nullcontext(Connection())):
            result=approvals.decorate_report_reviews(data)
        self.assertIs(result,data)
        audit=data['inspections'][0]['report_approval']
        self.assertEqual(audit['note'],'승인 의견')
        self.assertEqual(audit['reviewed_at'],'2026-10-26T17:42:00+09:00')
        self.assertIsNone(data['inspections'][1]['report_approval'])
        self.assertIsNone(data['inspections'][2]['report_approval'])
        self.assertEqual(data['follow_ups'][0]['report_approval'],audit)
        self.assertEqual(len(cur.calls),2)
        self.assertTrue(all(sql.startswith('SELECT') for sql,args in cur.calls))
        self.assertEqual(cur.calls[0][1],['I1','I2','I3'])

if __name__=='__main__': unittest.main()
