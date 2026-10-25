import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/approval-inbox.js', import.meta.url), 'utf8');
const { createApprovalInbox } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const notice = (event_id, read = false) => ({ id:event_id, event_id, kind:'approval_request', title:'일정 승인 요청', read });
const response = (...notifications) => ({ notifications, unread_count:notifications.filter(n => !n.read).length });
const deferred = () => { let resolve, reject; const promise = new Promise((r,j) => { resolve=r; reject=j; }); return { promise,resolve,reject }; };
function fixture(request) {
  const auth = { user:{ id:'ksm123', role:'supervisor', process:null }, request };
  const changes=[], errors=[];
  const inbox=createApprovalInbox({ auth, onChange:state => changes.push(state), onError:(error,context) => errors.push({error,context}) });
  return {auth,inbox,changes,errors};
}

test('refreshes database read state and retains previous notices after failed polling', async () => {
  let result=response(notice('e1')), failure=false;
  const f=fixture(async()=>{if(failure)throw Error('offline');return result;});
  assert.equal(await f.inbox.refresh(),true); assert.equal(f.inbox.unreadCount,1);
  result=response(notice('e1',true)); await f.inbox.refresh(); assert.equal(f.inbox.items[0].read,true); assert.equal(f.inbox.unreadCount,0);
  failure=true; assert.equal(await f.inbox.refresh(),false); assert.equal(f.inbox.items.length,1); assert.equal(f.errors[0].context.operation,'refresh');
});

test('serializes a stale GET before mark-read and queues a fresh GET after it', async () => {
  const read=deferred(), calls=[]; let reads=0;
  const f=fixture((url,payload)=>{calls.push({url,payload}); if(url.endsWith('/inbox'))return ++reads===1 ? read.promise : Promise.resolve(response(notice('e1',true))); return Promise.resolve({ok:true,unread_count:0});});
  const first=f.inbox.refresh(), duplicate=f.inbox.refresh(); assert.equal(first,duplicate);
  await tick(); const mark=f.inbox.markRead(['e1','e1']), following=f.inbox.refresh();
  assert.equal(calls.length,1); read.resolve(response(notice('e1')));
  assert.equal(await first,true); assert.equal(await mark,true); assert.equal(await following,true);
  assert.deepEqual(calls.map(c=>c.url),['/api/notifications/inbox','/api/notifications/read','/api/notifications/inbox']);
  assert.deepEqual(calls[1].payload,{event_ids:['e1']}); assert.equal(f.inbox.items[0].read,true); assert.equal(f.inbox.unreadCount,0);
});

test('failed read does not clear unread state or prevent a retry', async () => {
  let fail=true;
  const f=fixture(async url=>{if(url.endsWith('/inbox'))return response(notice('e1'));if(fail)throw Error('offline');return {ok:true,unread_count:0};});
  await f.inbox.refresh(); assert.equal(await f.inbox.markRead(['e1']),false);
  assert.equal(f.inbox.items[0].read,false); assert.equal(f.inbox.unreadCount,1); assert.equal(f.errors[0].context.operation,'read');
  fail=false; assert.equal(await f.inbox.markRead(['e1']),true); assert.equal(f.inbox.unreadCount,0);
});

test('role changes discard previous responses and do not block the new role behind old network work', async () => {
  const old=deferred(); let calls=0;
  const f=fixture(()=>++calls===1?old.promise:Promise.resolve(response(notice('field-result'))));
  const pending=f.inbox.refresh(); await tick();
  f.auth.user={id:'joy123',role:'field',process:'sinter'};
  assert.equal(await f.inbox.refresh(),true); assert.equal(f.inbox.items[0].event_id,'field-result');
  old.resolve(response(notice('chief-only'))); assert.equal(await pending,false);
  assert.equal(f.inbox.items[0].event_id,'field-result');
});

test('role changes cancel queued read requests and same-user role changes also invalidate state', async () => {
  const old=deferred(), calls=[];
  const f=fixture((url,payload)=>{calls.push({url,payload});return old.promise;});
  const pending=f.inbox.refresh(); await tick(); const mark=f.inbox.markRead(['chief-only']);
  f.auth.user={id:'ksm123',role:'field',process:'steel'};
  old.resolve(response(notice('chief-only'))); assert.equal(await pending,false); assert.equal(await mark,false);
  assert.equal(calls.length,1); assert.deepEqual(f.inbox.items,[]); assert.equal(f.inbox.unreadCount,0);
});

test('stop/reset invalidate in-flight work while reset alone clears the visible list', async () => {
  const deferredRead=deferred(); let calls=0;
  const f=fixture(()=>++calls===1?Promise.resolve(response(notice('e1'))):deferredRead.promise);
  await f.inbox.refresh(); const pending=f.inbox.refresh(); await tick(); f.inbox.stop();
  deferredRead.resolve(response(notice('stale'))); assert.equal(await pending,false); assert.equal(f.inbox.items[0].event_id,'e1');
  f.inbox.reset(); assert.deepEqual(f.inbox.items,[]); assert.equal(f.inbox.unreadCount,0);
});

test('start polls every five seconds and refreshes on visibility return; stop removes both', async () => {
  const previous={document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
  const doc=new EventTarget(); doc.hidden=false;
  let poll, interval, removed=false, calls=0;
  globalThis.document=doc;
  globalThis.setInterval=(fn,ms)=>{poll=fn;interval=ms;return 42;};
  globalThis.clearInterval=id=>{assert.equal(id,42);removed=true;};
  const f=fixture(async()=>{calls++;return response();});
  try {
    f.inbox.start(); f.inbox.start(); await tick(); assert.equal(interval,5000); assert.equal(calls,1);
    poll(); await tick(); assert.equal(calls,2);
    doc.hidden=true; poll(); doc.dispatchEvent(new Event('visibilitychange')); await tick(); assert.equal(calls,2);
    doc.hidden=false; doc.dispatchEvent(new Event('visibilitychange')); await tick(); assert.equal(calls,3);
    f.inbox.stop(); assert.equal(removed,true); doc.dispatchEvent(new Event('visibilitychange')); await tick(); assert.equal(calls,3);
  } finally { f.inbox.stop(); Object.assign(globalThis,previous); }
});
