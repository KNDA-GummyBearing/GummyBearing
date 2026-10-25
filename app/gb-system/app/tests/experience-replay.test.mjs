import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceReplay } from '../js/experience-replay.js';
import { createAlarmReporter } from '../js/alarm-reporter.js';

test('refresh reuses server round; explicit reset is persisted and retries same uncertain request', async () => {
  const memory = new Map(), changes = [], resets = [];
  let server = {id:'one', revision:'csv'}, loseReply = true;
  const controller = createExperienceReplay({userId:'visitor', revision:'csv',
    read:k=>memory.get(k), write:(k,v)=>memory.set(k,v), randomId:()=> 'request-id-1', onRound:r=>changes.push(r.id),
    request:async (path, body) => {
      if (!body) return server;
      resets.push(body); server = {id:'two', revision:'csv'};
      if (loseReply) { loseReply=false; throw Error('lost reply'); }
      return server;
    }});
  await controller.start();
  try {
    await controller.refresh(); assert.deepEqual(changes,['one']);
    await assert.rejects(controller.reset(), /lost reply/);
    await controller.reset(); assert.deepEqual(resets[0],resets[1]);
    assert.deepEqual(changes,['one','two']);
    await controller.refresh(); assert.equal(changes.length,2);
  } finally { controller.stop(); }
});

test('remote reset is adopted once and no reset request is created by polling', async () => {
  let round = {id:'one', revision:'csv'}, reads=0;
  const changes=[];
  const c=createExperienceReplay({userId:'u',revision:'csv',read:()=>null,write:()=>{},onRound:r=>changes.push(r.id),
    request:async (_path, body)=>{ assert.equal(body,undefined); reads++; return round; }});
  await c.start();
  try { round={id:'two',revision:'csv'}; await c.refresh(); await c.refresh(); assert.deepEqual(changes,['one','two']); assert.equal(reads,3); }
  finally { c.stop(); }
});

test('old poll finishes before reset and cannot restore stale round after reset', async () => {
  let resolve, reads=0; const changes=[];
  const c=createExperienceReplay({userId:'u',revision:'csv',read:()=>null,write:()=>{},randomId:()=> 'reset',onRound:r=>changes.push(r.id),
    request:async (_path,body)=>body ? {id:'two',revision:'csv'} : ++reads===1 ? {id:'one',revision:'csv'} : new Promise(r=>resolve=r)});
  await c.start();
  try { const refresh=c.refresh(), reset=c.reset(); resolve({id:'one',revision:'csv'}); await refresh; await reset; assert.deepEqual(changes,['one','two']); }
  finally { c.stop(); }
});

test('report queue and dedup are separate per visitor and round, old reporter stops', async () => {
  const saved=new Map(), sent=[];
  const make=(userId,roundId)=>createAlarmReporter({userId,roundId,revision:'csv',equipmentIds:['EGF-01'],
    read:k=>saved.get(k),write:(k,v)=>saved.set(k,v),request:async (_path,body)=>sent.push(body)});
  let reporter=make('a','one'); reporter.capture('EGF-01',0,50,40); await reporter.flush();
  reporter=make('a','one'); reporter.capture('EGF-01',0,50,40); await reporter.flush(); assert.equal(sent.length,1);
  reporter.dispose(); reporter.capture('EGF-01',0,50,40); await reporter.flush(); assert.equal(sent.length,1);
  for (const [user,round] of [['a','two'],['b','one']]) { reporter=make(user,round); reporter.capture('EGF-01',0,50,40); await reporter.flush(); }
  assert.deepEqual(sent.map(x=>[x.actor_id,x.round_id]),[['a','one'],['a','two'],['b','one']]);
});
