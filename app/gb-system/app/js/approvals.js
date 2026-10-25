// [APPROVAL WORKFLOW] Pending submissions are history, not scheduled work.
// The server owns role/scope checks, idempotency and the final schedule creation.
import { renderReport } from './report-preview.js';
export const APPROVAL_LABELS = { pending: '승인 대기', approved: '승인 완료', rejected: '반려' };
export const approvalLabel = status => APPROVAL_LABELS[status] || '기존 기록';
export const calendarApproved = record => !record.approval_status || record.approval_status === 'approved';
export const requestKey = () => `APR-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const isCompletionRequest = request => request?.request_kind === 'completion';
export const isReportRequest = request => request?.submission_kind === 'report' || request?.request_kind === 'report';
export const approvalKindLabel = request => isCompletionRequest(request) ? '완료 처리' : isReportRequest(request) ? '점검 보고서' : '일정 등록';
export const approvalDueLabel = request => request?.due_date || (isReportRequest(request) && request.status === 'pending'
  ? '팀장 승인 시 지정' : isReportRequest(request) && request.status === 'rejected' ? '일정 미등록' : '-');

export function mountApprovals(host, { auth, store, esc, nameOf, equipmentOf = id => ({equipment_name:nameOf(id)}), toast, initialStatus = 'pending', requestId = '' }) {
  const manager = auth.user.role === 'supervisor';
  const identity = () => JSON.stringify([auth.user?.id, auth.user?.role, auth.user?.process]);
  const owner = identity();
  let requests = [], selected = Object.hasOwn(APPROVAL_LABELS, initialStatus) ? initialStatus : 'pending', loading = false, deciding = false;
  let focusRequest = String(requestId || '');
  host.innerHTML = `<div class="page approvals-page">
    <div class="page-head"><div><h2>${manager ? '일정 승인' : '내 승인 요청'}</h2>
      <p class="muted">일정 등록과 완료 처리는 설비 팀장의 승인 후 반영됩니다.</p></div>
      <button class="btn" id="approvalRefresh" type="button">새로고침</button></div>
    <p class="approval-intro">${manager ? '점검 보고서·일정 등록·완료 요청을 확인해 주세요. 보고서는 승인할 때 일정의 날짜·담당자·내용을 지정합니다.' : '승인 결과는 상단 알림에서 확인할 수 있습니다. 반려된 완료 요청은 캘린더에서 다시 요청해 주세요.'}</p>
    <div id="approvalTabs" class="seg approval-tabs" role="group" aria-label="승인 상태"></div>
    <p id="approvalError" class="my-error" role="alert" hidden></p>
    <div id="approvalList" class="approval-list" aria-live="polite"></div>
  </div>`;
  const tabs = host.querySelector('#approvalTabs'), list = host.querySelector('#approvalList');
  const error = host.querySelector('#approvalError'), refresh = host.querySelector('#approvalRefresh');
  const active = () => list.isConnected && identity() === owner;
  const date = value => esc(String(value || '-').replace('T', ' '));
  const value = text => esc(Array.isArray(text) ? text.join(', ') || '-' : text || '-');
  const definition = pairs => `<dl class="approval-details">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${value(v)}</dd></div>`).join('')}</dl>`;
  function details(r) {
    const i = r.inspection, v = r.review;
    if (isCompletionRequest(r)) return `<div class="approval-completion-summary">
      ${definition([['일정 예정일', r.due_date], ['담당자', r.assignee], ['완료 요청 메모', r.completion_note]])}
      <p>${r.status === 'approved' ? '승인된 일정은 캘린더에 완료로 표시됩니다.' : r.status === 'rejected' ? '이 요청은 반려되어 완료 처리되지 않았습니다. 이후 처리 결과는 캘린더에서 확인해 주세요.' : '승인 전까지 캘린더의 일정은 예정 상태로 유지됩니다.'}</p>
    </div>`;
    if (i) return renderReport({inspection:i,approval:r},equipmentOf(r.equipment_id),{embedded:true}) + (v ? `<h4>정비 검토 내용</h4>${definition([['정비 필요 여부',v.necessity],['정비 대상',v.target],['정비 내용',v.content],['작업 우선도',v.priority],['희망일',v.desired_date],['예상 작업 시간',v.estimated_hours],['작업 메모',v.work_memo]])}` : '');
    return `<details class="approval-inspection"><summary>일정 요청 내용 보기</summary><p>${value(r.items)}</p></details>`;
  }
  function render() {
    const statuses = ['pending', 'approved', 'rejected'];
    tabs.innerHTML = statuses.map(status => `<button type="button" data-status="${status}" aria-pressed="${status === selected}">${approvalLabel(status)} ${requests.filter(r => r.status === status).length}</button>`).join('');
    const rows = requests.filter(r => r.status === selected).sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
    list.innerHTML = rows.length ? rows.map(r => `<article class="card approval-card" data-request="${esc(r.request_id)}" tabindex="-1">
      <div class="approval-card-head"><div><div class="approval-card-labels"><span class="approval-kind${isCompletionRequest(r) ? ' approval-kind-completion' : ''}">${approvalKindLabel(r)}</span><span class="approval-status approval-${r.status}">${approvalLabel(r.status)}</span></div>
        <h3><a href="#/equipment/${encodeURIComponent(r.equipment_id)}">${esc(nameOf(r.equipment_id))}</a> · ${esc(!isCompletionRequest(r) && r.inspection ? r.inspection.decision || '점검 보고서' : r.type)}</h3></div>
        <p class="muted">요청자 ${esc(r.requester_name || r.requested_by)}<br>${date(r.requested_at)}</p></div>
      <p class="approval-summary">${esc(r.items)}</p>${details(r)}
      ${manager && r.status === 'pending' ? `<form class="approval-decision" data-decide="${esc(r.request_id)}" data-request-kind="${isCompletionRequest(r) ? 'completion' : isReportRequest(r) ? 'report' : 'schedule'}">
        <h4>${isCompletionRequest(r) ? '완료 승인' : isReportRequest(r) ? '보고서 승인 및 일정 등록' : '승인할 일정'}</h4><div class="approval-fields">
        ${isCompletionRequest(r) ? '' : `<label>일정 구분<select name="type" required>${['정기 점검', '재확인', '추가 점검', '정비'].map(type => `<option${type === r.type ? ' selected' : ''}>${type}</option>`).join('')}</select></label>
        <label>예정일<input name="due_date" type="date" value="${esc(r.due_date || '')}"${r.inspection?.inspected_at ? ` min="${esc(r.inspection.inspected_at.slice(0, 10))}"` : ''} required></label>
        <label>담당자<input name="assignee" value="${esc(r.assignee)}" required maxlength="100"></label>
        <label class="approval-wide">일정 내용<textarea name="items" required maxlength="4000">${esc(r.items)}</textarea></label>`}
        <label class="approval-wide">검토 의견 <span class="muted">(반려 시 필수)</span><textarea name="note" maxlength="2000" placeholder="승인 의견 또는 반려 사유를 적어 주세요."></textarea></label>
        </div><p class="my-error approval-local-error" role="alert" hidden></p>
        <div class="approval-actions"><button class="btn" type="submit" name="action" value="reject" formnovalidate>반려</button>
        <button class="btn primary" type="submit" name="action" value="approve">${isCompletionRequest(r) ? '승인 후 완료 처리' : '승인 후 일정 등록'}</button></div></form>`
        : `<div class="approval-result">${definition([['일정 예정일', approvalDueLabel(r)], [isReportRequest(r) && r.status !== 'approved' ? '제안 담당자' : '담당자', r.assignee]])}
          ${r.status !== 'pending' ? `<p>처리자 ${esc(r.reviewer_name || r.reviewed_by || '-')} · ${date(r.reviewed_at)}</p><p>검토 의견: ${value(r.note)}</p>`
          : `<p>${isCompletionRequest(r) ? '설비 팀장의 완료 승인을 기다리고 있습니다.' : isReportRequest(r) ? '설비 팀장이 보고서를 검토하고 일정의 날짜·담당자·내용을 지정합니다. 승인 전에는 캘린더에 표시되지 않습니다.' : '설비 팀장 확인을 기다리고 있습니다. 아직 캘린더에 등록되지 않았습니다.'}</p>`}
          ${r.status === 'approved' ? '<a class="btn sm" href="#/calendar">캘린더 보기</a>' : ''}</div>`}
    </article>`).join('') : `<div class="empty">${approvalLabel(selected)} 상태의 요청이 없습니다.</div>`;
    tabs.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => { if (deciding) return; selected = button.dataset.status; render(); }));
    list.querySelectorAll('[data-decide]').forEach(form => form.addEventListener('submit', submitDecision));
  }
  async function load() {
    if (loading || deciding) return;
    loading = true; refresh.disabled = true; list.setAttribute('aria-busy', 'true'); error.hidden = true;
    try {
      const result = await auth.request('/api/approvals');
      if (!active()) return;
      requests = result.requests || [];
      const target = focusRequest && requests.find(r => r.request_id === focusRequest);
      // A request can already have been reviewed since the notification was generated.
      if (target && Object.hasOwn(APPROVAL_LABELS, target.status)) selected = target.status;
      render();
      if (focusRequest) {
        const card = [...list.querySelectorAll('[data-request]')].find(node => node.dataset.request === focusRequest);
        if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'start' }); }
        focusRequest = '';
      }
    } catch (failure) { if (active()) { error.textContent = failure.message; error.hidden = false; } }
    finally { loading = false; if (active()) { refresh.disabled = false; list.setAttribute('aria-busy', 'false'); } }
  }
  async function submitDecision(event) {
    event.preventDefault();
    if (!active() || deciding || loading) return;
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    const completion = form.dataset.requestKind === 'completion';
    const action = event.submitter?.value;
    if (!['approve', 'reject'].includes(action)) return;
    const localError = form.querySelector('.approval-local-error');
    const note = String(values.note || '').trim();
    if (action === 'reject' && !note) { localError.textContent = '반려 사유를 입력해 주세요.'; localError.hidden = false; form.elements.note.focus(); return; }
    if (!completion && action === 'approve') {
      if (!String(values.assignee || '').trim() || !String(values.items || '').trim() || !values.due_date) {
        localError.textContent = '예정일·담당자·일정 내용을 입력해 주세요.'; localError.hidden = false; return;
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const inspectedDay = requests.find(request => request.request_id === form.dataset.decide)?.inspection?.inspected_at?.slice(0, 10);
      if (inspectedDay && values.due_date < inspectedDay) {
        localError.textContent = '일정 예정일은 점검일과 같거나 이후로 선택해 주세요.'; localError.hidden = false; form.elements.due_date.focus(); return;
      }
    }
    localError.hidden = true; deciding = true; refresh.disabled = true;
    host.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      if (completion) await store.decideCompletion({ request_id: form.dataset.decide, action, note });
      else await store.decideApproval({ request_id: form.dataset.decide, action, note,
        ...(action === 'approve' ? { schedule: { type: values.type, due_date: values.due_date, assignee: values.assignee.trim(), items: values.items.trim() } } : {}) });
      if (!active()) return;
      // Reload the source of truth so two tabs cannot leave an approved item pending locally.
      await store.refreshMaintenance().catch(() => {});
      if (!active()) return;
      selected = action === 'approve' ? 'approved' : 'rejected';
      toast(completion
        ? action === 'approve' ? '완료를 승인했습니다. 캘린더에 완료로 표시됩니다.' : '완료 요청을 반려했습니다. 일정은 예정 상태로 유지됩니다.'
        : action === 'approve' ? '승인했습니다. 캘린더에 일정이 등록되었습니다.' : '요청을 반려했습니다. 캘린더에 등록되지 않습니다.');
    } catch (failure) {
      if (active()) { localError.textContent = failure.message; localError.hidden = false; }
      // Preserve typed values on failure for a safe retry of the same decision.
      deciding = false; if (active()) { refresh.disabled = false; host.querySelectorAll('button').forEach(button => { button.disabled = false; }); } return;
    } finally { deciding = false; }
    if (active()) await load();
  }
  refresh.addEventListener('click', load);
  void load();
}
