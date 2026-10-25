// Browser-independent UI/API contract checks; screenshots and real DB flow are checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/approvals.js', import.meta.url), 'utf8');
const { mountApprovals, calendarApproved } = await import('../js/approvals.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class Element {
  constructor() { this.isConnected = true; this.events = {}; this.dataset = {}; this.innerHTML = ''; this.hidden = false; this.disabled = false; }
  setAttribute() {} addEventListener(event, handler) { this.events[event] = handler; }
  checkValidity() { return true; } reportValidity() {}
  querySelectorAll() { return []; }
}
const request = { request_id:'APR-1',equipment_id:'EGF-01',status:'pending',type:'재확인',due_date:'2026-11-04',assignee:'정온유',items:'베어링 재확인',requested_by:'joy123',requester_name:'정온유',requested_at:'2026-10-24T14:00',
  inspection:{inspector:'정온유',inspected_at:'2026-10-24T14:00',operation_state:'정상 운전',noise:'이상 없음',vibration:'이상 없음',heat:'이상 없음',decision:'계속 관찰',memo:'<script>안전하게 표시</script>'} };
function setup(role='supervisor', api = null, options = {}) {
  const fields = new Map(['#approvalTabs','#approvalList','#approvalError','#approvalRefresh'].map(k => [k,new Element()]));
  const form = new Element(); form.dataset.decide='APR-1'; form.dataset.requestKind=options.record?.request_kind || 'schedule';
  form.values=form.dataset.requestKind==='completion' ? {note:''} : {type:'재확인',due_date:'2026-11-05',assignee:'강민준',items:'조정한 일정 내용',note:''};
  form.elements={note:{focus(){form.noteFocused=true;}}}; const localError=new Element(); form.querySelector=()=>localError;
  const card = new Element(); card.dataset.request='APR-1'; card.focus=()=>{card.focused=true;}; card.scrollIntoView=()=>{card.scrolled=true;};
  fields.get('#approvalList').querySelectorAll=selector => selector==='[data-request]' ? [card] : selector==='[data-decide]' && fields.get('#approvalList').innerHTML.includes('data-decide=') ? [form] : [];
  const host = new Element(); host.querySelector=selector=>fields.get(selector); host.querySelectorAll=()=>[fields.get('#approvalRefresh')];
  let state={...request,...options.record}; const decisions=[], completionDecisions=[], messages=[];
  const auth={user:{id:role==='supervisor'?'ksm123':'joy123',role,process:role==='supervisor'?null:'sinter'},request:api || (async()=>({requests:[state]}))};
  const store={decideApproval:async payload=>{decisions.push(payload);state={...state,status:payload.action==='approve'?'approved':'rejected',...payload.schedule,note:payload.note};return {};},
    decideCompletion:async payload=>{completionDecisions.push(payload);state={...state,status:payload.action==='approve'?'approved':'rejected',note:payload.note};return {};},refreshMaintenance:async()=>{}};
  const previous=globalThis.FormData;
  globalThis.FormData=class { constructor(f){this.values=f.values;} *[Symbol.iterator](){yield* Object.entries(this.values);} };
  mountApprovals(host,{auth,store,esc,nameOf:()=> '배기가스 팬 01',toast:message=>messages.push(message),...options});
  return {host,fields,form,card,localError,auth,store,decisions,completionDecisions,messages,restore:()=>{globalThis.FormData=previous;}};
}
test('legacy and approved records are calendar-visible; pending/rejected are history only',()=>{
  assert.equal(calendarApproved({}),true);assert.equal(calendarApproved({approval_status:'approved'}),true);
  assert.equal(calendarApproved({approval_status:'pending'}),false);assert.equal(calendarApproved({approval_status:'rejected'}),false);
});
test('field manager sees inspection detail and status without approval actions',async()=>{
  const s=setup('field');try{await tick();const html=s.fields.get('#approvalList').innerHTML;
    assert.match(html,/현장 점검·정비 보고서/);assert.match(html,/승인 대기/);assert.doesNotMatch(html,/data-decide=/);
    assert.match(html,/<h3>.*계속 관찰<\/h3>/);assert.doesNotMatch(html,/<h3>.*재확인<\/h3>/);
    assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  }finally{s.restore();}
});
test('reject requires a reason and never sends an empty rejection',async()=>{
  const s=setup();try{await tick();await s.form.events.submit({preventDefault(){},currentTarget:s.form,submitter:{value:'reject'}});
    assert.equal(s.decisions.length,0);assert.equal(s.form.noteFocused,true);assert.match(s.localError.textContent,/반려 사유/);
    s.form.values.note='예정일 재확인 필요';await s.form.events.submit({preventDefault(){},currentTarget:s.form,submitter:{value:'reject'}});
    assert.deepEqual(s.decisions,[{request_id:'APR-1',action:'reject',note:'예정일 재확인 필요'}]);
  }finally{s.restore();}
});
test('supervisor sends edited schedule once even when approval is double-clicked',async()=>{
  const s=setup();try{await tick();let finish;const original=s.store.decideApproval;
    s.store.decideApproval=payload=>{const result=original(payload);return new Promise(resolve=>{finish=async()=>resolve(await result);});};
    const event={preventDefault(){},currentTarget:s.form,submitter:{value:'approve'}};
    const pending=s.form.events.submit(event);await s.form.events.submit(event);assert.equal(s.decisions.length,1);await finish();await pending;
    assert.deepEqual(s.decisions[0].schedule,{type:'재확인',due_date:'2026-11-05',assignee:'강민준',items:'조정한 일정 내용'});
    assert.match(s.fields.get('#approvalList').innerHTML,/승인 완료/);assert.match(s.messages[0],/캘린더에 일정/);
  }finally{s.restore();}
});
test('changing role while a request loads does not render the previous user data',async()=>{
  let resolve;const s=setup('field',()=>new Promise(r=>{resolve=r;}));try{
    s.auth.user={id:'kmj123',role:'field',process:'steel'};resolve({requests:[request]});await tick();
    assert.equal(s.fields.get('#approvalList').innerHTML,'');
  }finally{s.restore();}
});

test('decision notice opens the actual server status and focuses the matching request',async()=>{
  const s=setup('field',async()=>({requests:[{...request,status:'rejected',note:'재점검 필요'}]}),{initialStatus:'approved',requestId:'APR-1'});
  try {await tick();assert.match(s.fields.get('#approvalList').innerHTML,/재점검 필요/);
    assert.match(s.fields.get('#approvalTabs').innerHTML,/data-status="rejected" aria-pressed="true"/);
    assert.equal(s.card.focused,true);assert.equal(s.card.scrolled,true);
    s.card.focused=false; await s.fields.get('#approvalRefresh').events.click(); assert.equal(s.card.focused,false);
  } finally {s.restore();}
});

test('invalid notice status falls back to pending and absent request cannot select an unrelated item',async()=>{
  const s=setup('field',null,{initialStatus:'<script>',requestId:'unavailable'});
  try {await tick();assert.match(s.fields.get('#approvalTabs').innerHTML,/data-status="pending" aria-pressed="true"/);
    assert.equal(s.card.focused,undefined);
  } finally {s.restore();}
});

test('completion approval uses its endpoint without editable schedule fields or a schedule payload',async()=>{
  const s=setup('supervisor',null,{record:{request_kind:'completion'}});
  try {await tick();const html=s.fields.get('#approvalList').innerHTML;
    assert.match(html,/완료 처리/);assert.match(html,/승인 후 완료 처리/);assert.doesNotMatch(html,/name="due_date"|name="assignee"|name="items"/);
    await s.form.events.submit({preventDefault(){},currentTarget:s.form,submitter:{value:'approve'}});
    assert.deepEqual(s.completionDecisions,[{request_id:'APR-1',action:'approve',note:''}]);assert.equal(s.decisions.length,0);
    assert.match(s.messages[0],/캘린더에 완료/);assert.match(s.fields.get('#approvalList').innerHTML,/승인 완료/);
  } finally {s.restore();}
});

test('field completion pending keeps the existing calendar schedule and has no manager action',async()=>{
  const s=setup('field',null,{record:{request_kind:'completion'}});
  try {await tick();const html=s.fields.get('#approvalList').innerHTML;
    assert.match(html,/예정 상태로 유지/);assert.match(html,/완료 승인을 기다리고/);
    assert.doesNotMatch(html,/아직 캘린더에 등록되지|data-decide=/);
  } finally {s.restore();}
});

test('completion rejection requires a note, sends once and keeps the schedule pending',async()=>{
  const s=setup('supervisor',null,{record:{request_kind:'completion'}});
  try {await tick();const event={preventDefault(){},currentTarget:s.form,submitter:{value:'reject'}};
    await s.form.events.submit(event);assert.equal(s.completionDecisions.length,0);
    assert.match(s.localError.textContent,/반려 사유/);
    s.form.values.note='점검 결과를 보완해 주세요.';
    let finish;const original=s.store.decideCompletion;s.store.decideCompletion=payload=>{const result=original(payload);return new Promise(resolve=>{finish=async()=>resolve(await result);});};
    const pending=s.form.events.submit(event);await s.form.events.submit(event);
    assert.equal(s.completionDecisions.length,1);await finish();await pending;
    assert.deepEqual(s.completionDecisions[0],{request_id:'APR-1',action:'reject',note:'점검 결과를 보완해 주세요.'});
    assert.match(s.messages[0],/예정 상태로 유지/);assert.match(s.fields.get('#approvalList').innerHTML,/이 요청은 반려/);
  } finally {s.restore();}
});

test('schedule and completion requests remain together in status counts with different kind labels',async()=>{
  const s=setup('supervisor',async()=>({requests:[request,{...request,request_id:'COMP-1',request_kind:'completion'}]}));
  try {await tick();assert.match(s.fields.get('#approvalTabs').innerHTML,/승인 대기 2/);
    const html=s.fields.get('#approvalList').innerHTML;assert.match(html,/일정 등록/);assert.match(html,/완료 처리/);
  } finally {s.restore();}
});

test('historical completion rejection does not claim that a subsequently completed schedule is pending',async()=>{
  const s=setup('field',null,{initialStatus:'rejected',record:{request_kind:'completion',status:'rejected',follow_up:{status:'완료'}}});
  try {await tick();const html=s.fields.get('#approvalList').innerHTML;assert.match(html,/이 요청은 반려/);
    assert.doesNotMatch(html,/예정 상태로 유지/);assert.match(html,/이후 처리 결과는 캘린더/);
  } finally {s.restore();}
});
