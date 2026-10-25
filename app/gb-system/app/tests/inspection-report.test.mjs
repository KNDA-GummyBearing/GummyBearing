import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('let form = {'), app.indexOf('function renderAlarms()'));
const baseValues = {
  inspected_at: '2026-10-26T14:00', inspector: '정온유', operation_state: '정상 운전',
  noise: '이상 없음', vibration: '이상 없음', heat: '이상 없음', visual: [],
  need_additional: '필요 없음', memo: '현장 확인', decision: '계속 관찰', recheck_date: '2026-10-27',
};
function fixture(values = {}, status = 'pending', role = status === 'approved' ? 'supervisor' : 'field') {
  const elements = new Map(['#inspForm', '#fsInspect', '#fsReview', '#draftInfo'].map(id => [id, { isConnected: true }]));
  const calls = [], results = [], errors = [], drafts = [], toasts = [];
  let serial = 0;
  const context = vm.createContext({
    values: { ...baseValues, ...values }, results, errors, console,
    auth: {experience:false}, currentUser: () => ({id:role==='supervisor'?'ksm123':'joy123',role}),
    confirmed: {equipment_id:'EGF-01',type:'재확인',due_date:'2026-10-29',assignee:'김수민',items:'승인 지정 점검'},
    $: selector => elements.get(selector),
    store: {
      draft: { set: (id, value) => drafts.push({ id, value }), clear: () => {} },
      submitApproval: async payload => { calls.push(payload); return { request: { status }, records: { inspections: [{ ...payload.inspection, approval_status: status }], maintenance_reviews: payload.review ? [payload.review] : [], follow_ups: [] } }; },
    },
    requestKey: () => `KEY-${++serial}`, idStamp: () => `INS-${serial}`,
    toLocalInput: date => date.toISOString().slice(0, 16), ymdhm: date => date.toISOString(),
    fanById: () => ({ snap: { status: '정상' } }), updateApprovalBadge: async () => {},
    toast: message => toasts.push(message),
  });
  vm.runInContext(source + `
    form = {id:'EGF-01', savedInspection:null, savedReview:null, submitting:false, requestPayload:null, requestFingerprint:''};
    getValues = () => values;
    syncForm = () => {};
    confirmReportSchedule = async () => confirmed;
    showErrors = value => errors.push(value);
    showDone = (messages, status) => results.push({messages, status});
  `, context);
  return { context, calls, results, errors, drafts, elements, toasts, submit: () => vm.runInContext('completeInspection()', context) };
}

test('all field report decisions submit for approval without a date or calendar schedule', async () => {
  for (const decision of ['계속 관찰','추가 점검','정비 검토']) {
    const f=fixture({decision,recheck_date:'',memo:'윤활 상태 확인'});await f.submit();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].submission_kind,'report');
    assert.equal(f.calls[0].inspection.decision,decision);assert.equal(f.calls[0].inspection.memo,'윤활 상태 확인');
    assert.equal(f.calls[0].schedule,undefined);assert.equal(f.calls[0].review,undefined);
    assert.equal(f.results[0].status,'pending');
  }
});

test('legacy draft follow-up inputs cannot create a schedule or maintenance review on report submission', async () => {
  const f = fixture({ decision: '정비 검토', necessity: '정비 필요', target: '베어링', desired_date: '2026-10-30', content: '윤활 보충', est_hours: '직접 입력', est_hours_custom: '3' });
  await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].review,undefined);assert.equal(f.calls[0].schedule,undefined);
  assert.equal(f.calls[0].inspection.recheck_date,'');assert.equal(f.calls[0].inspection.additional_due,'');
});

test('required inspection choices still block submission', async () => {
  for(const key of ['operation_state','noise','vibration','heat','need_additional','decision']) {
    const f=fixture({[key]:''});await f.submit();assert.equal(f.calls.length,0);
    assert.ok(f.errors[0].some(([name])=>name===key));
  }
});

test('server-approved team-lead submission reports immediate calendar registration without a second API call', async () => {
  const f = fixture({ inspector: '김수민' }, 'approved'); await f.submit();
  assert.equal(f.calls.length, 1); assert.equal(f.results[0].status, 'approved');
  assert.equal(f.calls[0].schedule.due_date,'2026-10-29');
  assert.match(f.results[0].messages[0], /캘린더에 등록되었습니다/);
  assert.doesNotMatch(f.results[0].messages.join(' '), /승인 요청했습니다|승인 후/);
});

test('cancelling team-lead schedule confirmation does not submit a report', async () => {
  const f=fixture({},'approved');f.context.confirmed=null;await f.submit();
  assert.equal(f.calls.length,0);assert.equal(f.elements.get('#fsInspect').disabled,false);
});

test('double-clicks are ignored and a failed report response retries the same idempotency key', async () => {
  const f = fixture(); let reject;
  f.context.store.submitApproval = payload => { f.calls.push(payload); return new Promise((resolve, fail) => { reject = fail; }); };
  const first = f.submit(); await f.submit(); assert.equal(f.calls.length, 1);
  reject(new Error('response lost')); await first;
  assert.equal(f.elements.get('#fsInspect').disabled, false);
  f.context.store.submitApproval = async payload => { f.calls.push(payload); return { request: { status: 'pending' }, records: {} }; };
  await f.submit();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].request_key, f.calls[1].request_key);
});
