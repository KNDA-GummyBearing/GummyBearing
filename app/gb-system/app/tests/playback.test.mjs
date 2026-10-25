// [V10.2 PLAYBACK PERSISTENCE] node --test app/tests/playback.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback, playbackDatasetId } from '../js/playback.js';

function fixture(initialSpeed = 10) {
  let time = 0, writes = 0;
  const db = new Map();
  return { db, advance: ms => { time += ms; }, writes: () => writes,
    clock: () => createPlayback({ now: () => time, initialSpeed,
      read: k => db.get(k), write: (k,v) => { writes++; db.set(k, structuredClone(v)); } }) };
}
test('refresh restores exact paused position and does not add time spent away', () => {
  const f = fixture(600), a = f.clock(); a.restore('user-a','data');
  f.advance(1250); a.setSpeed(0); const before = a.ms;
  f.advance(600000); const b = f.clock(); b.restore('user-a','data');
  assert.equal(b.ms, before); assert.equal(b.speed,0);
  f.advance(5000); b.advance(); assert.equal(b.ms,before);
});
test('playing refresh resumes from checkpoint with same speed and elapsed minute', () => {
  const f=fixture(600), a=f.clock(); a.restore('user-a','data');
  f.advance(4250); a.advance(); a.save(true);
  const b=f.clock(); b.restore('user-a','data');
  assert.equal(b.ms,2550000); assert.equal(Math.floor(b.ms/60000),42);
  f.advance(1000); b.advance(); assert.equal(b.ms,3150000); assert.equal(b.speed,600);
});
test('speed changes charge prior interval at old speed', () => {
  const f=fixture(10), a=f.clock(); a.restore('user-a','data');
  f.advance(1000); a.setSpeed(600); assert.equal(a.ms,10000);
  f.advance(1000); a.setSpeed(0); assert.equal(a.ms,610000);
});
test('explicit reset is saved and does not inherit old tick delta', () => {
  const f=fixture(600), a=f.clock(); a.restore('user-a','data');
  f.advance(10000); a.advance(); a.reset();
  const b=f.clock(); b.restore('user-a','data'); assert.equal(b.ms,0);
  f.advance(250); a.advance(); assert.equal(a.ms,150000);
});
test('checkpoints are isolated by user and ignored for replaced data', () => {
  const f=fixture(), a=f.clock(); a.restore('user-a','data');
  f.advance(1000); a.advance(); a.save(true);
  const b=f.clock(); b.restore('user-b','data'); assert.equal(b.ms,0);
  b.restore('user-a','new-data'); assert.equal(b.ms,0);
});
test('invalid saved state and unavailable storage cannot break startup', () => {
  for(const ms of [-1, NaN, Infinity, '60000', 9e15]) {
    const f=fixture(); f.db.set('playback.v1.user-a',{version:1,dataset:'data',ms,speed:600});
    const a=f.clock(); a.restore('user-a','data'); assert.equal(a.ms,0);
  }
  const a=createPlayback({now:()=>0,initialSpeed:Infinity,read:()=>{throw Error();},write:()=>{throw Error();}});
  a.restore('user-a','data'); a.save(true); assert.equal(a.speed,10);
});
test('periodic saves are throttled but final checkpoint preserves displayed value', () => {
  const f=fixture(600), a=f.clock(); a.restore('user-a','data');
  for(let i=0;i<8;i++){f.advance(250);a.advance();a.save();}
  assert.equal(f.writes(),2); a.save(true); assert.equal(f.writes(),3);
  const b=f.clock(); b.restore('user-a','data'); assert.equal(b.ms,a.ms);
});
test('data identity includes measurements and equipment start positions', () => {
  const e=[{equipment_id:'EGF-01',demo_start_index:20}];
  assert.equal(playbackDatasetId('abc',e,0),playbackDatasetId('abc',e,0));
  assert.notEqual(playbackDatasetId('abc',e,0),playbackDatasetId('abd',e,0));
  assert.notEqual(playbackDatasetId('abc',e,0),playbackDatasetId('abc',[{...e[0],demo_start_index:21}],0));
});

test('a new paired round saves the paused checkpoint even if its values equal the previous round', () => {
  const f = fixture(0), a = f.clock();
  a.restore('visitor.round-one', 'data'); a.save(true);
  a.restore('visitor.round-two', 'data'); a.save(true);
  assert.equal(f.db.get('playback.v1.visitor.round-two').speed, 0);
  const refreshed = createPlayback({ now: () => 0, initialSpeed: 10,
    read: key => f.db.get(key), write: () => {} });
  refreshed.restore('visitor.round-two', 'data');
  assert.equal(refreshed.speed, 0);
  assert.equal(refreshed.ms, 0);
});
