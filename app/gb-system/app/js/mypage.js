// [ROLE PREVIEW] 선택한 역할의 담당 범위와 작성·완료 기록을 표시합니다.
import { approvalLabel, approvalKindLabel, approvalDueLabel } from './approvals.js';
export function mountMyPage(host, { auth, esc, nameOf }) {
  const user = auth.user;
  host.innerHTML = `
    <div class="page mypage">
      <section class="card my-profile" aria-labelledby="myProfileTitle">
        <span class="role-avatar avatar-${user.avatar}"><img src="assets/brand/role-people.png" alt=""></span>
        <h2 id="myProfileTitle">${esc(user.name)}님의 담당 현황</h2>
        <p class="muted">포스코 포항제철소</p>
        <dl class="my-fields">
          <div><dt>이름</dt><dd>${esc(user.name)}</dd></div>
          <div><dt>담당 범위</dt><dd>${esc(user.scope)}</dd></div>
          <div><dt>권한</dt><dd>${esc(user.title)}</dd></div>
        </dl>
        <p class="my-note">담당 공정에서 작성·완료한 기록을 확인합니다.</p>
        <!-- [MYPAGE CHANGE] 계정 화면 안에서 로그아웃. 기존 기록과 계정 설정은 유지. -->
        <button type="button" class="btn ghost my-logout" id="myLogout">관리자 바꾸기</button>
        <p class="my-error my-logout-error" id="myLogoutError" role="alert" hidden></p>
      </section>
      <div class="my-activity">
        <div class="my-activity-head"><div><h2>내 활동 기록</h2>
          <p class="muted">선택한 관리자로 작성한 기록을 모았습니다.</p></div>
          <button type="button" class="btn ghost" id="myRefresh">새로고침</button>
        </div>
        <div id="myActivity" aria-live="polite" aria-busy="true"><p>내 기록을 불러오는 중입니다.</p></div>
        <p class="my-note">등록 계정이 기록되기 전의 점검·일정은 이름이 같아도 내 기록에 자동 연결하지 않습니다.
          기존 기록은 <a href="#/maintenance">점검·정비 보고서</a>와 <a href="#/calendar">캘린더</a>에서 확인할 수 있습니다.</p>
      </div>
    </div>`;
  const target = host.querySelector('#myActivity');
  const refresh = host.querySelector('#myRefresh');
  // [MYPAGE CHANGE] 성공한 경우에만 새로고침. 실패하면 현재 화면에서 재시도 가능.
  const logout = host.querySelector('#myLogout');
  const logoutError = host.querySelector('#myLogoutError');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    logout.textContent = '선택 화면으로 이동 중…';
    logoutError.hidden = true;
    try {
      await auth.logout();
      window.location.reload();
    } catch (error) {
      if (!logout.isConnected) return;
      logoutError.textContent = error.message || '관리자 선택으로 돌아가지 못했습니다. 다시 시도해 주세요.';
      logoutError.hidden = false;
      logout.disabled = false;
      logout.textContent = '관리자 바꾸기';
    }
  });
  const date = value => esc(String(value || '-').replace('T', ' ').replace('+09:00', ' (한국 시각)'));
  const equipment = id => `<a href="#/equipment/${encodeURIComponent(id)}">${esc(nameOf(id))}</a>`;
  // Both presentations use the same escaped cells and row order. No data or workflow changes.
  const table = (heads, rows, empty) => {
    if (!rows.length) return `<p class="my-empty">${empty}</p>`;
    const equipmentIndex = heads.indexOf('설비');
    const categoryIndex = heads.findIndex(h => h === '구분' || h === '일정 종류');
    const wide = h => h === '내용' || h === '검토 의견';
    const cards = rows.map(cells => `<li class="my-record-card">
      <div class="my-record-head">${categoryIndex >= 0 ? `<span class="my-record-kind">${cells[categoryIndex]}</span>` : ''}
        <h4>${cells[equipmentIndex]}</h4></div>
      <dl class="my-record-fields">${cells.map((c, i) => i === equipmentIndex || i === categoryIndex ? '' :
        `<div class="${wide(heads[i]) ? 'my-record-wide' : ''}"><dt>${heads[i]}</dt><dd>${c}</dd></div>`).join('')}</dl>
      </li>`).join('');
    return `<div class="my-table-scroll"><table><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <ul class="my-record-cards">${cards}</ul>`;
  };

  async function load() {
    refresh.disabled = true;
    target.setAttribute('aria-busy', 'true');
    try {
      const [data, approvalData] = await Promise.all([auth.request('/api/me/activity'), auth.request('/api/approvals')]);
      // Navigating away or switching accounts cannot inject a stale response into a new page.
      if (!target.isConnected || data.user.id !== auth.user?.id) return;
      const authored = [
        ...data.inspections.map(r => ({ ...r, kind: '현장 점검', when: r.inspected_at, result: r.decision, content: r.memo })),
        ...data.calendar_schedules.map(r => ({ ...r, kind: '캘린더 일정', when: r.due_date, result: r.status, content: r.items })),
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.when).localeCompare(String(a.when)));
      const ownRequests = (approvalData.requests || []).filter(r => String(r.requested_by) === String(user.id))
        .sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
      target.innerHTML = `
        <div class="my-counts">
          <div class="card"><span>내가 작성한 점검</span><strong>${data.counts.authored}<small>건</small></strong></div>
          <div class="card"><span>내가 완료한 일정</span><strong>${data.counts.completions}<small>건</small></strong></div>
        </div>
        <section class="card my-records" aria-labelledby="myInspections">
          <h3 id="myInspections">내가 작성한 점검</h3>
          <p class="my-note">내가 작성한 현장 점검과 캘린더에서 직접 추가한 일정을 함께 표시합니다.</p>
          <p class="my-note">승인 대기·반려된 점검도 작성 기록에 남으며, 캘린더에는 승인 후 표시됩니다. <a href="#/approvals">승인 요청 확인</a></p>
          ${table(['구분', '점검 일시 / 일정 예정일', '설비', '대응 결정 / 상태', '일정 승인', '내용'], authored.map(r =>
            [esc(r.kind), date(r.when), equipment(r.equipment_id), esc(r.result), esc(approvalLabel(r.approval_status)), esc(r.content || '-')]),
            '아직 이 계정으로 작성한 점검이나 캘린더 일정이 없습니다.')}
        </section>
        <section class="card my-records" aria-labelledby="myApprovalRequests">
          <h3 id="myApprovalRequests">내 승인 요청</h3>
          <p class="my-note">대기 ${ownRequests.filter(r => r.status === 'pending').length}건 · 승인 ${ownRequests.filter(r => r.status === 'approved').length}건 · 반려 ${ownRequests.filter(r => r.status === 'rejected').length}건 · <a href="#/approvals">요청 내용과 검토 의견 보기</a></p>
          ${table(['구분', '요청 일시', '설비', '일정 예정일', '승인 상태', '내용', '검토 의견'], ownRequests.map(r =>
            [esc(approvalKindLabel(r)), date(r.requested_at), equipment(r.equipment_id), date(approvalDueLabel(r)), esc(approvalLabel(r.status)), esc(r.items), esc(r.note || '-')]),
            '아직 제출한 승인 요청이 없습니다.')}
        </section>
        <section class="card my-records" aria-labelledby="myCompletions">
          <h3 id="myCompletions">내가 완료 처리한 일정</h3>
          <p class="my-note">완료 시각은 실제 서버의 한국 시각이며, 화면의 시뮬레이션 날짜와 다를 수 있습니다.</p>
          ${table(['완료 시각', '설비', '일정 종류', '일정 담당자', '내용'], data.completions.map(r =>
            [date(r.completed_at), equipment(r.equipment_id), esc(r.type), esc(r.assignee), esc(r.items)]),
            '아직 이 계정으로 완료 처리한 일정이 없습니다.')}
        </section>`;
    } catch (error) {
      if (target.isConnected) target.innerHTML = `<p class="my-error" role="alert">${esc(error.message || '기록을 불러오지 못했습니다.')} 새로고침으로 다시 시도해 주세요.</p>`;
    } finally {
      if (target.isConnected) target.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', load);
  load();
}
