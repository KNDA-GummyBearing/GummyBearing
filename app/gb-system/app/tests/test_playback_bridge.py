"""Real MySQL + HTTP integration; run ONLY inside the isolated preview container.

No manual demo/start call. The production push/email adapters must be disabled.
Tests create only local alert jobs/events, never inspection or calendar records.
"""
import concurrent.futures
import json
import os
import time
import unittest
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError
from mysql_store import connect
from notifications import alarm_indexes

BASE = 'http://127.0.0.1:8000'
ORIGIN = 'http://127.0.0.1:18084'

class Client:
    def __init__(self, username):
        self.username, self.csrf = username, ''
        self.http = build_opener(HTTPCookieProcessor(CookieJar()))
        response = self.call('/api/demo/select', {'username':username})
        self.csrf = response['csrf']
        with self.http.open(BASE+'/data/sensor_timeseries.csv') as r:
            self.revision = r.headers['X-GB-Data-Revision']
    def call(self,path,payload=None,status=200,csrf=True):
        headers={'Origin':ORIGIN,'Content-Type':'application/json','X-GB-Request':'1'}
        if csrf: headers['X-CSRF-Token']=self.csrf
        try:
            response=self.http.open(Request(BASE+path,headers=headers,data=None if payload is None else json.dumps(payload).encode()),timeout=15)
        except HTTPError as e: response=e
        data=json.load(response)
        assert response.status==status,(path,response.status,data)
        return data
    def report(self,eq,index,**kwargs):
        return self.call('/api/notifications/playback',dict(actor_id=self.username,revision=self.revision,equipment_id=eq,sample_index=index),**kwargs)

class PlaybackBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.environ['GB_PUBLIC_ORIGIN']==ORIGIN
        assert os.environ.get('GB_PUSH_SEND')=='0' and os.environ.get('GB_EMAIL_SEND')=='0'
        cls.indexes=alarm_indexes()

    def test_role_validation_and_cross_device_delivery(self):
        admin,field,steel=Client('ksm123'),Client('joy123'),Client('kmj123')
        self.assertEqual(admin.revision,field.revision)
        field.report('EGF-01',0,status=400)
        field.report('EGF-04',self.indexes['EGF-04'],status=403)
        field.report('EGF-01',self.indexes['EGF-01'],status=403,csrf=False)
        field.call('/api/notifications/playback',dict(actor_id='ksm123',revision=field.revision,equipment_id='EGF-01',sample_index=self.indexes['EGF-01']),status=403)
        field.call('/api/notifications/playback',dict(actor_id=field.username,revision='old',equipment_id='EGF-01',sample_index=self.indexes['EGF-01']),status=409)

        # Two independently authenticated PCs reach the same alarm concurrently.
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results=list(pool.map(lambda c:c.report('EGF-01',self.indexes['EGF-01']),[admin,field]))
        self.assertEqual(results[0]['event_id'],results[1]['event_id'])
        self.assertLessEqual(sum(r['created'] for r in results),1)
        self.assertFalse(field.report('EGF-01',self.indexes['EGF-01'])['created'])
        steel_result=steel.report('EGF-06',self.indexes['EGF-06'])
        events=[results[0]['event_id'],steel_result['event_id']]
        deadline=time.time()+15
        while time.time()<deadline:
            with connect() as conn,conn.cursor() as cur:
                cur.execute('SELECT event_id,username,channel,status FROM gb_alert_deliveries WHERE event_id IN (%s,%s)',events)
                rows=cur.fetchall()
            if len(rows)==8 and all(r['status']=='dry_run' for r in rows): break
            time.sleep(.5)
        self.assertEqual(len(rows),8)
        self.assertTrue(all(r['status']=='dry_run' for r in rows))
        for event,recipients in zip(events,[{'ksm123','joy123'},{'ksm123','kmj123'}]):
            got=[r for r in rows if r['event_id']==event]
            self.assertEqual({r['username'] for r in got},recipients)
            self.assertEqual({r['channel'] for r in got},{'email','push'})
        with connect() as conn,conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) n FROM gb_alert_events WHERE event_id IN (%s,%s)',events)
            self.assertEqual(cur.fetchone()['n'],2)

if __name__=='__main__': unittest.main()
