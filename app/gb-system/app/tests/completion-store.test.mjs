import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/store.js',import.meta.url),'utf8');
let serial=0;
async function fixture(request) {
  const auth={user:{id:'joy123',role:'field',process:'sinter'},request};
  globalThis.__completionStoreAuth=auth;
  const adapted=source.replace("import { auth } from './auth.js';",'const auth = globalThis.__completionStoreAuth;')+`\n// test instance ${++serial}`;
  const {store}=await import('data:text/javascript;base64,'+Buffer.from(adapted).toString('base64'));
  delete globalThis.__completionStoreAuth;
  store.db.follow_ups=[{follow_up_id:'FU-1',status:'예정'}];
  return {auth,store};
}
const record=(status,approval)=>({follow_up_id:'FU-1',status,completion_approval_status:approval,completion_approval_request_id:'COMP-1'});
test('completion requests and decisions merge server-returned state via their distinct endpoints',async()=>{
  const calls=[];
  const f=await fixture(async(url,payload)=>{calls.push({url,payload});return {records:{follow_ups:[url.endsWith('/submit')?record('예정','pending'):record('완료','approved')]}};});
  await f.store.submitCompletion({follow_up_id:'FU-1',request_key:'KEY-1'});
  assert.equal(f.store.db.follow_ups.length,1);assert.equal(f.store.db.follow_ups[0].status,'예정');assert.equal(f.store.db.follow_ups[0].completion_approval_status,'pending');
  await f.store.decideCompletion({request_id:'COMP-1',action:'approve',note:''});
  assert.equal(f.store.db.follow_ups[0].status,'완료');assert.deepEqual(calls.map(c=>c.url),['/api/completions/submit','/api/completions/decide']);
});
test('failed completion request releases the save guard for retry',async()=>{
  let calls=0;const f=await fixture(async()=>{if(++calls===1)throw Error('offline');return {records:{follow_ups:[record('예정','pending')]}};});
  await assert.rejects(f.store.submitCompletion({}),/offline/);await f.store.submitCompletion({});
  assert.equal(calls,2);assert.equal(f.store.db.follow_ups[0].completion_approval_status,'pending');
});
test('role changes prevent both completion and direct-save responses from entering another role store',async()=>{
  for(const method of ['submitCompletion','decideCompletion','save']){
    let resolve;const f=await fixture(()=>new Promise(r=>{resolve=r;}));
    const pending=method==='save'?f.store.save({follow_ups:[{follow_up_id:'FU-1',status:'완료'}]},{operation:'update'}):f.store[method]({});
    f.auth.user={...f.auth.user,role:'supervisor',process:null};
    resolve({records:{follow_ups:[record('완료','approved')]}});await pending;
    assert.equal(f.store.db.follow_ups[0].status,'예정',method);
    assert.equal(f.store.db.follow_ups[0].completion_approval_status,undefined,method);
  }
});
