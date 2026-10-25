import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlarmReporter } from '../js/alarm-reporter.js';

function fixture() {
  const db = new Map(), calls = [];
  let time = 0, failure = null;
  return { db, calls, advance:ms=>time+=ms, fail:error=>failure=error,
    create:()=>createAlarmReporter({userId:'field',revision:'csv-a',equipmentIds:['EGF-01'],now:()=>time,
      read:k=>db.get(k),write:(k,v)=>db.set(k,structuredClone(v)),
      request:async (...args)=>{ calls.push(args); if(failure)throw failure; return {ok:true}; }}) };
}

test('new alarm reaches server even when fast playback skips the exact first sample',async()=>{
  const f=fixture(), r=f.create();
  r.capture('EGF-01',30,50,37); await r.flush();
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0][1],{actor_id:'field',revision:'csv-a',equipment_id:'EGF-01',sample_index:37});
});
test('normal/warning, initial red-page restore, other equipment and no-alarm CSV stay silent',async()=>{
  const f=fixture(),r=f.create();
  r.capture('EGF-01',1,35,37);r.capture('EGF-01',undefined,50,37);
  r.capture('EGF-01',50,51,37);r.capture('EGF-02',30,50,37);r.capture('EGF-01',0,50,-1);
  await r.flush(); assert.equal(f.calls.length,0);
});
test('offline alarm persists across refresh, backs off, retries while paused, and is acknowledged once',async()=>{
  const f=fixture(),r=f.create();f.fail(new Error('offline'));
  r.capture('EGF-01',30,50,37);await r.flush();await r.flush();assert.equal(f.calls.length,1);
  f.advance(2000);await r.flush();assert.equal(f.calls.length,2);
  const refreshed=f.create();f.fail(null);await refreshed.flush();assert.equal(f.calls.length,3);
  const reset=f.create();reset.capture('EGF-01',0,100,37);await reset.flush();assert.equal(f.calls.length,3);
});
test('changed session/data blocks repeated invalid requests and keeps pending evidence',async()=>{
  for(const status of [400,401,403,409]) {
    const f=fixture(),r=f.create();f.fail(Object.assign(Error(),{status}));
    r.capture('EGF-01',0,40,37);await r.flush();f.advance(120000);await r.flush();
    assert.equal(f.calls.length,1);assert.match(r.status,/새로고침/);
  }
});
test('single-flight sending prevents duplicate concurrent tick requests',async()=>{
  let release,calls=0;
  const r=createAlarmReporter({userId:'a',revision:'v',equipmentIds:['EGF-01'],read:()=>null,write:()=>{},
    request:()=>{calls++;return new Promise(resolve=>release=resolve);}});
  r.capture('EGF-01',0,40,37);const sending=r.flush();await r.flush();assert.equal(calls,1);
  release({ok:true});await sending;await r.flush();assert.equal(calls,1);
});
