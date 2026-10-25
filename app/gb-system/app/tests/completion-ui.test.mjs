import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/completions.js', import.meta.url), 'utf8');
const { createCompletionActions, completionStatus, completionLabel, completionResultMessage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const deferred = () => { let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {resolve,reject,promise}; };
function fixture(role='field') {
  let user={id:role==='field'?'joy123':'ksm123',role,process:role==='field'?'sinter':null}, serial=0;
  const calls=[],row={follow_up_id:'FU-1',status:'예정',equipment_id:'EGF-01'};
  const store={db:{follow_ups:[row]},submitCompletion:async payload=>{calls.push({kind:'request',payload});return {request:{status:'pending'}};},save:async(records,options)=>{calls.push({kind:'direct',records,options});return {};}};
  const actions=createCompletionActions({store,getUser:()=>user,requestKey:()=>`KEY-${++serial}`});
  return {actions,store,row,calls,setUser:value=>{user=value;}};
}
test('completion state distinguishes pending, rejected and server-confirmed completed schedules',()=>{
  assert.equal(completionStatus({status:'예정'}),'ready');assert.equal(completionLabel({status:'예정'}),'');
  assert.equal(completionLabel({status:'예정',completion_approval_status:'pending'}),'완료 승인 대기');
  assert.equal(completionLabel({status:'예정',completion_approval_status:'rejected'}),'완료 요청 반려');
  assert.equal(completionStatus({status:'완료',completion_approval_status:'pending'}),'completed');
});
test('a safely retried request reports an already approved or rejected server outcome accurately',()=>{
  assert.match(completionResultMessage({status:'pending'}),/요청했습니다/);
  assert.match(completionResultMessage({status:'approved'}),/이미 완료 승인/);
  assert.match(completionResultMessage({status:'rejected'}),/반려되었습니다/);
});
test('field completion submits once while busy and never optimistically marks completed',async()=>{
  const f=fixture(),wait=deferred();f.store.submitCompletion=payload=>{f.calls.push(payload);return wait.promise;};
  const pending=f.actions.complete('FU-1');assert.equal(f.actions.isBusy('FU-1'),true);
  assert.deepEqual(await f.actions.complete('FU-1'),{ignored:true});assert.equal(f.calls.length,1);
  assert.equal(f.row.status,'예정');wait.resolve({request:{status:'pending'}});const result=await pending;
  assert.equal(result.requested,true);assert.equal(f.actions.isBusy('FU-1'),false);assert.equal(f.row.status,'예정');
});
test('a failed response retains the key, but a fresh rejection starts a new safely retryable request',async()=>{
  const f=fixture();let fail=true;
  f.store.submitCompletion=async payload=>{f.calls.push({...payload});if(fail)throw Error('response lost');return {};};
  await assert.rejects(f.actions.complete('FU-1'),/response lost/);await assert.rejects(f.actions.complete('FU-1'),/response lost/);
  assert.equal(f.calls[0].request_key,f.calls[1].request_key);
  Object.assign(f.row,{completion_approval_status:'rejected',completion_approval_request_id:'COMP-old'});
  await assert.rejects(f.actions.complete('FU-1'),/response lost/);await assert.rejects(f.actions.complete('FU-1'),/response lost/);
  assert.notEqual(f.calls[1].request_key,f.calls[2].request_key);assert.equal(f.calls[2].request_key,f.calls[3].request_key);
  fail=false;await f.actions.complete('FU-1');assert.equal(f.calls[3].request_key,f.calls[4].request_key);
  Object.assign(f.row,{completion_approval_status:'rejected',completion_approval_request_id:'COMP-new'});
  await f.actions.complete('FU-1');assert.notEqual(f.calls[4].request_key,f.calls[5].request_key);
});
test('pending blocks both roles; only supervisor can retain the existing direct-completion path',async()=>{
  for(const role of ['field','supervisor']){const f=fixture(role);f.row.completion_approval_status='pending';
    await assert.rejects(f.actions.complete('FU-1'),/완료 승인을 기다리고/);assert.equal(f.calls.length,0);}
  const f=fixture('supervisor');const result=await f.actions.complete('FU-1');assert.equal(result.requested,false);
  assert.deepEqual(f.calls,[{kind:'direct',records:{follow_ups:[{follow_up_id:'FU-1',status:'완료'}]},options:{operation:'update'}}]);
});
test('completed schedules are no-ops and a changed user invalidates the old request presentation',async()=>{
  const f=fixture();f.row.status='완료';assert.deepEqual(await f.actions.complete('FU-1'),{ignored:true});assert.equal(f.calls.length,0);
  f.row.status='예정';const wait=deferred();f.store.submitCompletion=()=>wait.promise;
  const pending=f.actions.complete('FU-1');f.setUser({id:'kmj123',role:'field',process:'steel'});wait.resolve({});
  assert.equal((await pending).stale,true);assert.equal(f.actions.isBusy('FU-1'),false);
});
