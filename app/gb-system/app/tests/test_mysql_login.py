"""[LOGIN ADD] Run ONLY against an isolated copy; GUMMY_TEST_ONLY=1 is required."""
import concurrent.futures
import copy
import http.client
import json
import os
from pathlib import Path
import sys
import time
import unittest
from urllib.parse import urlsplit

if os.getenv('GUMMY_TEST_ONLY')!='1':
    raise SystemExit('Refusing tests without GUMMY_TEST_ONLY=1. Use an isolated cloned database.')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import auth
import mysql_store as db
PASSWORD='Mysql-preview-test-only-4827!'
class LoginMySQLTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
    cls.store=auth.AuthStore()
    # Real demo setup is checked before assigning test-only passwords.
    cls.store.configure_team_demo_passwords()
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT username,password_hash FROM gb_users')
     assert all(auth.verify_password(r['username'],r['password_hash']) for r in cur.fetchall())
    for user,_ in auth.TEAM: cls.store.change_password(user,PASSWORD)
    with db.connect() as conn,conn.cursor() as cur:
     cls.original={}
     for table,key in db.KEYS.items():
      cur.execute('SELECT * FROM '+table)
      cls.original[table]={r[key]:r for r in cur.fetchall()}
    cls.seed=db.read_tables(['inspections','follow_ups','maintenance_reviews'])
 @classmethod
 def tearDownClass(cls):
    with db.connect() as conn,conn.cursor() as cur:
     for table,key in db.KEYS.items():
      for ident,original in cls.original[table].items():
       cur.execute('SELECT * FROM '+table+' WHERE '+key+'=%s',(ident,))
       assert cur.fetchone()==original,('Existing record changed',table,ident)
 @staticmethod
 def request(path,payload=None,session=None,headers=None):
    h={'Content-Type':'application/json','X-GB-Request':'1'}
    # [HTTP DEMO ADD] Exercise the real presentation origin in the isolated container.
    test_origin=os.getenv('GUMMY_TEST_HTTP_ORIGIN')
    if test_origin:h.update({'Host':urlsplit(test_origin).netloc,'Origin':test_origin})
    if session:h.update({'Cookie':session['cookie'],'X-CSRF-Token':session['csrf']})
    h.update(headers or {})
    c=http.client.HTTPConnection('127.0.0.1',8000,timeout=20)
    c.request('POST' if payload is not None else 'GET',path,
              json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None,h)
    r=c.getresponse();raw=r.read();code=r.status;meta=dict(r.getheaders());c.close()
    try: body=json.loads(raw)
    except ValueError:body=raw
    return code,body,meta
 def login(self,user='ksm123'):
    code,body,h=self.request('/api/auth/login',{'username':user,'password':PASSWORD})
    self.assertEqual(code,200,body)
    return {'cookie':h['Set-Cookie'].split(';')[0],'csrf':body['csrf'],'user':body['user']}
 def new_records(self):
    ins=copy.deepcopy(self.seed['inspections'][0])
    ins.update(inspection_id='new-ins',inspector='forged',inspector_user_id='lsm123')
    follow=copy.deepcopy(self.seed['follow_ups'][0])
    follow.update(follow_up_id='new-follow',inspection_id='new-ins',equipment_id=ins['equipment_id'],
                  status='예정',completed_by='forged',completed_by_user_id='lsm123',completed_at='2099-01-01')
    return ins,follow
 def create(self,session):
    ins,follow=self.new_records()
    code,body,_=self.request('/api/maintenance',{'inspections':[ins],'follow_ups':[follow]},session)
    self.assertEqual(code,200,body)
    return body['records']
 def test_10_mypage_is_account_scoped_and_not_name_scoped(self):
    a,b=self.login('ksm123'),self.login('kmj123')
    ra,rb=self.create(a),self.create(b)
    ident=ra['follow_ups'][0]['follow_up_id']
    self.assertEqual(self.request('/api/maintenance',{'operation':'update',
        'follow_ups':[{'follow_up_id':ident,'status':'완료'}]},b)[0],200)
    code,own,_=self.request('/api/me/activity?username=kmj123',session=a)
    self.assertEqual(code,200)
    self.assertEqual(own['user']['id'],'ksm123')
    own_ids={r['inspection_id'] for r in own['inspections']}
    self.assertIn(ra['inspections'][0]['inspection_id'],own_ids)
    self.assertNotIn(rb['inspections'][0]['inspection_id'],own_ids)
    legacy_ids={r['inspection_id'] for r in self.seed['inspections'] if not r['inspector_user_id']}
    self.assertTrue(own_ids.isdisjoint(legacy_ids))
    self.assertNotIn(ident,{r['follow_up_id'] for r in own['completions']})
    other=self.request('/api/me/activity',session=b)[1]
    self.assertIn(ident,{r['follow_up_id'] for r in other['completions']})
    self.assertTrue(all(r['completed_by_user_id']=='kmj123' for r in other['completions']))
    self.assertEqual(own['counts']['inspections'],len(own['inspections']))
    self.assertEqual(other['counts']['completions'],len(other['completions']))

 def test_11_mypage_requires_auth_and_has_no_profile_write(self):
    self.assertEqual(self.request('/api/me/activity')[0],401)
    s=self.login('ssy123')
    profile=self.request('/api/me/activity',session=s)[1]
    self.assertEqual(set(profile['user']),{'id','name','role','title'})
    self.assertNotIn('password_hash',json.dumps(profile))
    self.assertEqual(self.request('/api/me/activity',{'name':'Changed'},s)[0],404)
    self.assertEqual(self.request('/api/auth/session',session=s)[1]['user']['name'],'송상엽')

 def test_01_auth_and_same_permissions(self):
    self.assertEqual(self.request('/api/health')[0],200)
    for path in ('/api/equipment','/api/maintenance','/data/sensor_timeseries.csv'):
     self.assertEqual(self.request(path)[0],401)
    for username,name in auth.TEAM:
     s=self.login(username)
     self.assertEqual(s['user']['role'],'member')
     self.assertEqual(s['user']['name'],name)
     self.assertEqual(self.request('/api/maintenance',session=s)[0],200)
     self.assertEqual(self.request('/api/maintenance/reset',{},s)[0],405)
 def test_02_author_and_completion_and_csv_independence(self):
    a,b=self.login(),self.login('kmj123');r=self.create(a)
    self.assertEqual(r['inspections'][0]['inspector'],'김수민')
    self.assertEqual(r['inspections'][0]['inspector_user_id'],'ksm123')
    ident=r['follow_ups'][0]['follow_up_id']
    self.assertEqual(r['follow_ups'][0]['inspection_id'],r['inspections'][0]['inspection_id'])
    payload={'operation':'update','follow_ups':[{'follow_up_id':ident,'status':'완료'}]}
    code,done,_=self.request('/api/maintenance',payload,b);self.assertEqual(code,200,done)
    actor=done['records']['follow_ups'][0]
    self.assertEqual(actor['completed_by_user_id'],'kmj123')
    self.assertEqual(actor['completed_by'],'강민준')
    self.assertTrue(actor['completed_at'].endswith('+09:00'))
    self.assertEqual(self.request('/api/maintenance',payload,a)[1]['records']['follow_ups'][0],actor)
 def test_03_transaction_failure_rolls_back_both_tables(self):
    a=self.login()
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT COUNT(*) AS n FROM inspections');before=cur.fetchone()['n']
     cur.execute('SELECT COUNT(*) AS n FROM gb_inspection_authors');audit=cur.fetchone()['n']
    ins,follow=self.new_records();follow['equipment_id']='NO_SUCH'
    self.assertNotEqual(self.request('/api/maintenance',{'inspections':[ins],'follow_ups':[follow]},a)[0],200)
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT COUNT(*) AS n FROM inspections');self.assertEqual(cur.fetchone()['n'],before)
     cur.execute('SELECT COUNT(*) AS n FROM gb_inspection_authors');self.assertEqual(cur.fetchone()['n'],audit)
 def test_04_concurrent_completion(self):
    a,b=self.login(),self.login('ssy123');r=self.create(a);ident=r['follow_ups'][0]['follow_up_id']
    payload={'operation':'update','follow_ups':[{'follow_up_id':ident,'status':'완료'}]}
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
     responses=list(pool.map(lambda s:self.request('/api/maintenance',payload,s),[a,b]))
    self.assertTrue(all(x[0]==200 for x in responses),responses)
    self.assertEqual(responses[0][1]['records'],responses[1][1]['records'])
 def test_05_csrf_origin_and_logout(self):
    a=self.login()
    self.assertEqual(self.request('/api/maintenance',{'operation':'update'},a,{'X-CSRF-Token':'bad'})[0],403)
    self.assertEqual(self.request('/api/auth/login',{'username':'ksm123','password':PASSWORD},headers={'Origin':'https://other.example'})[0],403)
    self.assertEqual(self.request('/api/auth/logout',{},a)[0],200)
    self.assertEqual(self.request('/api/maintenance',session=a)[0],401)
 def test_06_no_self_password_or_registration_and_session_expiry(self):
    a,b=self.login('joy123'),self.login('joy123')
    for path in ('/api/auth/password','/api/auth/register','/api/auth/invitation'):
     self.assertEqual(self.request(path,{'current_password':PASSWORD,'new_password':'Other-test-password-124'},a)[0],404)
    self.assertEqual(self.request('/api/auth/session',session=b)[0],200)
    self.login('joy123')
    a=self.login('joy123')
    token=a['cookie'].split('=',1)[1]
    with db.connect() as conn,conn.cursor() as cur:
     # App may DELETE sessions but cannot arbitrary UPDATE them.
     cur.execute('DELETE FROM gb_sessions WHERE token_hash=%s',(auth.fingerprint(token),));conn.commit()
    self.assertIsNone(self.store.session(token))
 def test_12_demo_setup_is_idempotent_and_does_not_create_members(self):
    self.store.configure_team_demo_passwords()
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT username,password_hash FROM gb_users ORDER BY username');before=cur.fetchall()
    self.store.configure_team_demo_passwords()
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT username,password_hash FROM gb_users ORDER BY username');self.assertEqual(before,cur.fetchall())
    self.assertEqual(len(before),5)
    for username,_ in auth.TEAM:
     code,body,_=self.request('/api/auth/login',{'username':username,'password':username})
     self.assertEqual(code,200,body)
     self.assertEqual(body['user']['id'],username)
    # Restore test credentials for independent repeated runs and the preview login.
    for username,_ in auth.TEAM:self.store.change_password(username,PASSWORD)
 def test_07_rate_limit_hash_and_sql_permissions(self):
    for _ in range(8):self.assertEqual(self.request('/api/auth/login',{'username':'lsm123','password':'wrong'})[0],401)
    self.assertEqual(self.request('/api/auth/login',{'username':'lsm123','password':PASSWORD})[0],429)
    self.store.change_password('lsm123',PASSWORD);self.login('lsm123')
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT password_hash FROM gb_users')
     for row in cur.fetchall():
      self.assertNotIn(PASSWORD,row['password_hash'])
      self.assertTrue(row['password_hash'].startswith('pbkdf2_sha256$600000$'))
     with self.assertRaises(Exception):cur.execute('CREATE TABLE must_not_create(id INT)')
 def test_08_existing_legacy_unchanged_and_no_fabricated_actor(self):
    s=self.login();body=self.request('/api/maintenance',session=s)[1]
    previous_ins={r['inspection_id']:r for r in self.seed['inspections']}
    previous_follow={r['follow_up_id']:r for r in self.seed['follow_ups']}
    for r in body['inspections']:
     if r['inspection_id'] in previous_ins:self.assertEqual(r['inspector_user_id'],previous_ins[r['inspection_id']]['inspector_user_id'])
    for r in body['follow_ups']:
     if r['follow_up_id'] in previous_follow:
      self.assertEqual(r['completed_by'],previous_follow[r['follow_up_id']]['completed_by'])
      self.assertEqual(r['completed_at'],previous_follow[r['follow_up_id']]['completed_at'])
    for path in ('/auth.py','/mysql_store.py','/tools/manage_users.py','/.runtime/auth.sqlite3'):
     self.assertEqual(self.request(path,session=s)[0],404)
 def test_09_review_links_and_calendar_direct_create(self):
    a=self.login();r=self.create(a)
    review=copy.deepcopy(self.seed['maintenance_reviews'][0])
    review.update(review_id='new-review',inspection_id=r['inspections'][0]['inspection_id'],
                  equipment_id=r['inspections'][0]['equipment_id'],estimated_hours='0.5')
    code,body,_=self.request('/api/maintenance',{'maintenance_reviews':[review]},a)
    self.assertEqual(code,200,body)
    self.assertEqual(body['records']['maintenance_reviews'][0]['estimated_hours'],'0.5')
    _,follow=self.new_records();follow['inspection_id']=''
    code,body,_=self.request('/api/maintenance',{'follow_ups':[follow]},a)
    self.assertEqual(code,200,body)
    self.assertEqual(body['records']['follow_ups'][0]['inspection_id'],'')
 def test_13_http_demo_cookies_changed_ip_and_cross_origin(self):
    if not os.getenv('GUMMY_TEST_HTTP_ORIGIN'):self.skipTest('HTTP presentation mode only')
    payload={'username':'ksm123','password':PASSWORD}
    code,body,headers=self.request('/api/auth/login',payload,headers={
        'Host':'203.0.113.20:8080','Origin':'http://203.0.113.20:8080'})
    self.assertEqual(code,200,body)
    cookie=headers['Set-Cookie']
    self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Lax',cookie)
    self.assertNotIn('; Secure',cookie)
    self.assertEqual(self.request('/api/auth/login',payload,headers={
        'Host':'203.0.113.20:8080','Origin':'http://203.0.113.21:8080'})[0],403)
    self.assertEqual(self.request('/api/auth/login',payload,headers={
        'Host':'attacker.example:8080','Origin':'http://attacker.example:8080'})[0],403)
 def test_14_calendar_is_authored_by_login_not_assignee_and_not_double_counted(self):
    a,b=self.login('joy123'),self.login('kmj123')
    _,follow=self.new_records()
    follow.update(inspection_id='',assignee='강민준',items='calendar author isolation test',
                  created_by_user_id='kmj123',created_by='forged',creator_recorded_at='2099-01-01')
    before=self.request('/api/me/activity',session=a)[1]
    code,body,_=self.request('/api/maintenance',{'follow_ups':[follow]},a)
    self.assertEqual(code,200,body)
    record=body['records']['follow_ups'][0];ident=record['follow_up_id']
    self.assertEqual(record['created_by_user_id'],'joy123')
    self.assertEqual(record['created_by'],'정온유')
    own=self.request('/api/me/activity?username=kmj123',session=a)[1]
    other=self.request('/api/me/activity',session=b)[1]
    self.assertIn(ident,{x['follow_up_id'] for x in own['calendar_schedules']})
    self.assertNotIn(ident,{x['follow_up_id'] for x in other['calendar_schedules']})
    self.assertEqual(own['counts']['authored'],before['counts']['authored']+1)
    self.assertEqual(own['counts']['inspections'],before['counts']['inspections'])
    linked=self.create(a)
    own=self.request('/api/me/activity',session=a)[1]
    self.assertNotIn(linked['follow_ups'][0]['follow_up_id'],{x['follow_up_id'] for x in own['calendar_schedules']})
    self.assertEqual(own['counts']['authored'],before['counts']['authored']+2)
    self.assertEqual(self.request('/api/maintenance',{'operation':'update','follow_ups':[{'follow_up_id':ident,'status':'완료'}]},b)[0],200)
    own=self.request('/api/me/activity',session=a)[1]
    other=self.request('/api/me/activity',session=b)[1]
    self.assertEqual(next(x for x in own['calendar_schedules'] if x['follow_up_id']==ident)['status'],'완료')
    self.assertEqual(own['counts']['authored'],before['counts']['authored']+2)
    self.assertNotIn(ident,{x['follow_up_id'] for x in own['completions']})
    self.assertIn(ident,{x['follow_up_id'] for x in other['completions']})
 def test_15_calendar_transaction_failure_does_not_leave_partial_author(self):
    a=self.login('ssy123')
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT COUNT(*) AS n FROM gb_followup_authors');before=cur.fetchone()['n']
    _,first=self.new_records();first['inspection_id']=''
    second=copy.deepcopy(first);second.update(follow_up_id='second-calendar',equipment_id='NO_SUCH')
    self.assertNotEqual(self.request('/api/maintenance',{'follow_ups':[first,second]},a)[0],200)
    with db.connect() as conn,conn.cursor() as cur:
     cur.execute('SELECT COUNT(*) AS n FROM gb_followup_authors');self.assertEqual(before,cur.fetchone()['n'])
 def test_16_legacy_schedules_are_not_inferred_from_names(self):
    legacy={r['follow_up_id'] for r in self.seed['follow_ups'] if not r['created_by_user_id']}
    for username,_ in auth.TEAM:
     body=self.request('/api/me/activity',session=self.login(username))[1]
     self.assertTrue(legacy.isdisjoint({r['follow_up_id'] for r in body['calendar_schedules']}))
     self.assertEqual(body['counts']['authored'],len(body['inspections'])+len(body['calendar_schedules']))
if __name__=='__main__':unittest.main(verbosity=2)
