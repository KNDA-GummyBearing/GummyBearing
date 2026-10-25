import { DESIGN_EXAMPLE, homeSummary, homePanels, processSummary, foldControl, inspectionHeading, MAP_POSITIONS, MAP_EXAMPLE_MARKERS, wrench } from './overview-design.js';
// [LOGIN CHANGE] 기존 v8 화면 유지. 로그인 UI/작성자 고정/완료 처리자 표시 구간은 아래 LOGIN 태그 참조.
import {
  parseTimeseries, analyze, snapshot, priorityCompare, recentAlarmCompare,
  REASONS, FEATURE, FEATURES, AXES, AXIS_LABEL, RULE,
} from './engine.js';
import { renderChart } from './chart.js';
import { store } from './store.js';
// [LOGIN ADD] 로그인 상태는 이름 선택값이 아닌 서버 인증 응답을 사용.
import { auth } from './auth.js';
// [MYPAGE ADD] Account profile and authenticated personal activity.
import { mountNotifications } from './notifications.js';
import { mountMyPage } from './mypage.js';
import { mountApprovals, approvalLabel, calendarApproved, requestKey } from './approvals.js';
import { reportLink, resolveReport, renderReport, reportSummary } from './report-preview.js';
import { createCompletionActions, completionStatus, completionLabel, completionResultMessage } from './completions.js';
import { createApprovalInbox } from './approval-inbox.js';
// [V10 EQUIPMENT IMAGE FIX 2026-10-22] 공정별 고정 이미지 세트.
import { getFanImage, setFanImage } from './fan-images.js';
// [V10.2 PLAYBACK PERSISTENCE 2026-10-22] 새로고침 시 재생 위치·속도 복원.
import { createPlayback, playbackDatasetId } from './playback.js';
import { createAlarmReporter } from './alarm-reporter.js';
import { createExperienceReplay } from './experience-replay.js';
import { mountExperienceStart } from './experience-ui.js';

/* ---------- 유틸 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdhm = d => `${ymd(d)} ${hhmm(d)}`;
const mdhm = d => `${pad(d.getMonth() + 1)}. ${pad(d.getDate())}.  ${hhmm(d)}`;
const toLocalInput = d => `${ymd(d)}T${hhmm(d)}`;
const clockText = d => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. (${DOW[d.getDay()]}) ${hhmm(d)}:${pad(d.getSeconds())}`;
const sameDay = (a, b) => ymd(a) === ymd(b);
const shortTime = d => (sameDay(d, simNow()) ? hhmm(d) : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm(d)}`);
const fmtDate = s => (s ? String(s).replace('T', ' ') : '-');
const duration = min => {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return `${h}시간 ${m}분`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간`;
};
const idStamp = d => `${ymd(d).replace(/-/g, '')}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const svg = (paths, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICON = {
  // [UI UPDATE 2026-10-22] 헤더와 같은 사람 아이콘을 사이드바에서도 사용.
  user: '<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.2"/><circle cx="16" cy="12.6" r="4.8"/><path d="M7.4 25.6c1.9-3.9 5-5.9 8.6-5.9s6.7 2 8.6 5.9"/></svg>', 
  home: svg('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'),
  factory: svg('<path d="M3 21V10.5l5 3.5v-3.5l5 3.5v-3.5l4 2.8V4h3.5v17z"/><path d="M6.5 17.5h2M11 17.5h2"/>'),
  chart: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 15l3-4 3 2 4-6"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  wrench,
  doc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 'chev'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'),
  // 판단 근거 카드 아이콘 — 카드 내용에 맞춘 그림
  rSustained: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.6 1.6"/>', 'r-ico'),
  rConsecutive: svg('<path d="M3 20h18"/><path d="M5.5 16v-3M9.5 16V9M13.5 16v-5M17.5 16V6"/><path d="M4 6.5l3-2 3 2"/>', 'r-ico'),
  rMulti: svg('<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5 12 21l9-4.5"/>', 'r-ico'),
  rUnusual: svg('<path d="M2 13h3l2-5 3.5 10 3-7 1.5 2H16"/><path d="M20 5v6"/><circle cx="20" cy="15" r=".6" fill="currentColor"/>', 'r-ico'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  prev: svg('<path d="M15 6l-6 6 6 6"/>'),
  next: svg('<path d="M9 6l6 6-6 6"/>'),
  siren: svg('<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14v3H5zM12 3V1.5M4.2 6.2 3 5M19.8 6.2 21 5"/>'),
  tri: '<svg class="tri" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1z" fill="currentColor"/><path d="M12 9v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.4" fill="#fff"/></svg>',
};
const REASON_ICON = { sustained: ICON.rSustained, consecutive: ICON.rConsecutive, multi: ICON.rMulti, unusual: ICON.rUnusual };
const STATUS_BADGE = { 경보: '우선 확인 필요', 주의: '상태 확인 필요', 정상: '정상 운전 중' };
const PROCESSES = [
  { key: 'sinter', name: '소결공정' }, { key: 'iron', name: '제선공정' }, { key: 'steel', name: '제강공정' },
  { key: 'casting', name: '연주공정' }, { key: 'rolling', name: '압연공정' },
];
const processName = k => PROCESSES.find(p => p.key === k)?.name || '전체 제철소';
// Supplied 3840×2160 light/dark pairs, displayed on the same 1920×1080 coordinate grid.
const HOME_MAP = { light: 'assets/img/map_light.png', dark: 'assets/img/map_dark.png' };
const PROC_IMG = {
  sinter: { light: 'assets/img/plant_sinter_light.png', dark: 'assets/img/plant_sinter_dark.png' },
  steel: { light: 'assets/img/plant_steel_light.png', dark: 'assets/img/plant_steel_dark.png' },
};
// 설비가 없는 공정(제선·연주·압연)은 전체 배치도를 보여준다
const procImg = p => (PROC_IMG[p] || HOME_MAP)[theme()];
const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
// Browser tab uses the supplied plain G bearing symbol in both themes.
function syncBrandIcons() {
  for (const icon of $$('link[data-brand-icon]')) icon.href = 'assets/brand/symbol-navy.png';
}
syncBrandIcons();
// 공장 구역 (홈 배치도 px): 구역 중심 cx,cy / 반경 rx,ry / 알림 위치 ax,ay
const ZONES = [
  { process: 'sinter', plant: '소결공장', cx: 850, cy: 415, rx: 270, ry: 130, ax: 768, ay: 302 },
  { process: 'steel', plant: '제강공장', cx: 1390, cy: 550, rx: 280, ry: 145, ax: 1344, ay: 464 },
];
// [V10 EQUIPMENT IMAGE FIX 2026-10-22] 소결 01~03 → 이미지 01, 제강 04~06 → 이미지 02.
// 상태별 그림 경로와 동일 비율·표시 좌표는 fan-images.js에서 관리한다.
const STATUS_RANK = { 정상: 0, 주의: 1, 경보: 2 };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 데이터 재생(시뮬레이션) ---------- */
// 측정 데이터 1건 = 1분.
// 재생 0분 = 2026-10-26 14:00 (모든 설비가 측정 0분부터 시작)
const SIM_START = new Date(2026, 9, 26, 14, 0, 0).getTime();
const sim = createPlayback({ now: () => performance.now(),
  read: key => store.pref.get(key, null), write: (key, value) => store.pref.set(key, value),
  initialSpeed: auth.experience ? 0 : Number(store.pref.get('speed', 10)) });
sim.elapsed = 0;
// 저장 직전 표시하던 위치를 보존. 닫힌 동안의 시간을 더하지 않는다.
window.addEventListener('pagehide', () => sim.save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) sim.save(true); });
const simNow = () => new Date(SIM_START + sim.ms);
let fans = [];
let alarmReporter = null;
let replayController = null, playbackDataId = null;
const fanById = id => fans.find(f => f.eq.equipment_id === id);
const timeOf = (f, i) => new Date(SIM_START + (i - f.start) * 60000);
const anyExceed = (an, i) => i >= RULE.baselineN && Object.values(an.exceed[i]).some(Boolean);

function updateFans() {
  for (const f of fans) {
    const prev = f.snap?.status;
    const nextIndex = Math.min(f.start + sim.elapsed, f.an.n - 1);
    // [MOBILE BANNER FIX 2026-10-22] 측정 위치가 같거나 재생이 끝난 설비는 재계산하지 않음.
    if (f.snap && f.idx === nextIndex) continue;
    alarmReporter?.capture(f.eq.equipment_id, f.snap ? f.idx : undefined, nextIndex, f.an.firstAlarm);
    f.idx = nextIndex;
    f.snap = snapshot(f.an, f.idx);
    f.lastAlarmTime = f.snap.lastEvent != null ? timeOf(f, f.snap.lastEvent).getTime() : null;
    f.events = null; // 필요할 때 다시 계산
    // 새로 주의·경보 상태가 되면 실시간 알람을 보낸다
    if (prev && STATUS_RANK[f.snap.status] > STATUS_RANK[prev]) pushAlarm(f, f.snap.status, timeOf(f, f.idx));
  }
}

/* ---------- 실시간 알람 ---------- */
const alarms = { list: [], seq: 0, browser: store.pref.get('notify', false) };
// Approval notices belong to the recipient and use server read state. They must
// not be merged with simulated equipment alarms or cleared by playback reset.
let approvalInbox = null, approvalInboxError = '';
function alarmText(f, type) {
  const r = reasonSummary(f);
  return {
    title: type === '경보' ? (f.snap.sustained ? '이상 상태 지속' : '경보 발생') : '이상 상태 감지',
    note: r.sub || r.title,
  };
}
const ALARM_MERGE_MIN = 60; // 같은 설비·같은 등급 알람이 60분 안에 다시 오면 새로 만들지 않고 합친다
function pushAlarm(f, type, at, { silent = false } = {}) {
  const t = alarmText(f, type);
  const same = alarms.list.find(x => x.eqId === f.eq.equipment_id && x.type === type && (at - x.at) / 60000 <= ALARM_MERGE_MIN);
  if (same) {
    Object.assign(same, t, { at, count: (same.count || 1) + 1 });
    if (!same.read) { alarms.list.sort((x, y) => y.at - x.at); renderAlarmBadge(); renderToasts(); }
    return;
  }
  const a = { id: ++alarms.seq, eqId: f.eq.equipment_id, name: f.eq.equipment_name, location: f.eq.location, type, ...t, at, read: false, count: 1 };
  alarms.list.unshift(a);
  alarms.list.sort((x, y) => y.at - x.at);
  alarms.list = alarms.list.slice(0, 60);
  renderAlarmBadge();
  if (!silent) { showAlarmToast(a); notifyBrowser(a); }
}
function seedAlarms() {
  // 화면을 열었을 때 이미 주의·경보인 설비는 안 읽은 알람으로 올려 둔다
  for (const f of fans) {
    const st = f.snap.status;
    if (st === '정상') continue;
    const onset = st === '경보' ? f.snap.firstAlarm : (fanEvents(f).find(e => e.type === '주의')?.i ?? f.idx);
    pushAlarm(f, st, timeOf(f, onset), { silent: true });
  }
}
function renderAlarmBadge() {
  const n = alarms.list.filter(a => !a.read).length + (approvalInbox?.unreadCount || 0);
  const b = $('#alarmBadge');
  if (!b) return;
  b.textContent = n > 99 ? '99+' : String(n);
  b.hidden = n === 0;
  $('#alarmBtn').setAttribute('aria-label', `알림 · 안 읽음 ${n}건`);
  syncUserButton();
  if (!$('#alarmPop').hidden) renderAlarmPop();
}
function renderAlarmPop() {
  const popup = $('#alarmPop');
  const scrollTop = popup.querySelector('.ap-list')?.scrollTop || 0;
  const active = popup.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active?.dataset.noticeId ? `[data-notice-id="${CSS.escape(active.dataset.noticeId)}"]`
    : active?.dataset.alarm ? `[data-alarm="${CSS.escape(active.dataset.alarm)}"]`
    : active?.id ? `#${CSS.escape(active.id)}` : null;
  const list = alarms.list;
  const notices = approvalInbox?.items || [];
  const unread = list.filter(a => !a.read).length + (approvalInbox?.unreadCount || 0);
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const noticeLink = n => `#/approvals?status=${encodeURIComponent(n.approval_status || (n.kind === 'approval_approved' ? 'approved' : n.kind === 'approval_rejected' ? 'rejected' : 'pending'))}&request=${encodeURIComponent(n.request_id || '')}`;
  const noticeIcon = n => n.kind === 'approval_approved' ? ICON.check : n.kind === 'approval_rejected' ? ICON.close : ICON.doc;
  const noticeBody = n => String(n.body || '').split('\n').filter(line => line !== `요청 번호: ${n.request_id}`).join('\n');
  const noticeTime = n => String(n.created_at || '').replace('T', ' ').replace(/\+09:00$/, '');
  const markup = `
    <div class="ap-head"><b>알림</b><span class="muted">안 읽음 ${unread}건</span>
      <button class="link-btn" type="button" id="alarmReadAll"${unread ? '' : ' disabled'}>모두 읽음</button></div>
    ${auth.experience ? '' : `<label class="ap-opt"><input type="checkbox" id="alarmBrowser"${alarms.browser && perm === 'granted' ? ' checked' : ''}${perm === 'unsupported' || perm === 'denied' ? ' disabled' : ''}>
      브라우저 알림도 받기${perm === 'denied' ? ' (브라우저에서 차단됨)' : ''}</label>`}
    <div class="ap-list">
      ${auth.experience ? '' : `<h3 class="ap-section-title">승인 업무 <span>${approvalInbox?.unreadCount || 0}</span></h3>
      ${approvalInboxError ? '<p class="ap-inbox-error" role="status">승인 알림을 갱신하지 못했습니다. 연결 후 다시 확인해 주세요.</p>' : ''}
      ${notices.length ? notices.map(n => `<a class="ap-item ap-notice-item${n.read ? '' : ' unread'}" href="${noticeLink(n)}" data-notice-id="${esc(n.event_id || n.id)}">
        <span class="ap-notice-icon ${esc(n.kind)}" aria-hidden="true">${noticeIcon(n)}</span>
        <span class="ap-body"><b>${esc(n.title)}</b><span class="ap-notice-kind">${esc(nameOf(n.equipment_id))}</span>
          <small class="ap-notice-message">${esc(noticeBody(n))}</small><small>${esc(noticeTime(n))} · 한국 시간</small></span></a>`).join('')
        : '<div class="ap-empty">승인 업무 알림이 없습니다.</div>'}`}
      <h3 class="ap-section-title">설비 경보 <span>${list.filter(a => !a.read).length}</span></h3>
      ${list.length ? list.map(a => `
      <a class="ap-item${a.read ? '' : ' unread'}" href="#/equipment/${a.eqId}" data-alarm="${a.id}">
        <span class="sdot c-${a.type}"></span>
        <span class="ap-body"><b>${esc(a.name)}</b><span class="c-${a.type}">${a.type} · ${esc(a.title)}</span>
          <small>${mdhm(a.at)} · ${esc(a.location)}${a.count > 1 ? ` · ${a.count}회 반복` : ''}</small><small>${esc(a.note)}</small></span></a>`).join('')
      : '<div class="ap-empty">새 알람이 없습니다.</div>'}</div>
    <div class="ap-foot"><a href="#/approvals">${currentUser()?.role === 'supervisor' ? '일정 승인' : '내 승인 요청'} 보기 →</a><a href="#/alarms">${esc(currentUser()?.scope || '전체 제철소')} 경보 이력 보기 →</a></div>`;
  // Polling must not interrupt a person scrolling or using the keyboard.
  if (popup._renderedMarkup === markup) return;
  popup.innerHTML = markup;
  popup._renderedMarkup = markup;
  const scroller = popup.querySelector('.ap-list');
  if (scroller) scroller.scrollTop = scrollTop;
  if (focusKey) popup.querySelector(focusKey)?.focus({ preventScroll: true });
}
function readAlarm(id) {
  const a = alarms.list.find(x => x.id === id);
  if (a) a.read = true;
  renderAlarmBadge();
  renderToasts();
}
// 우측 상단 알람 카드 — 새 알람이 오면 3초 동안 보였다가 사라진다 (관리자 옆 숫자는 그대로 유지)
const TOAST_MS = 3000;
// [MOBILE BANNER FIX 2026-10-22] 터치 중 배너 추가/제거가 본문 버튼 위치를 바꾸지 않도록 연기.
let pendingMobileToast = null;
function expireAlarmToast(el) {
  if (!el.isConnected) return;
  if (pointerBusy && window.matchMedia('(max-width: 900px)').matches) {
    setTimeout(() => expireAlarmToast(el), 100);
    return;
  }
  el.classList.add('out');
  setTimeout(() => {
    if (pointerBusy && window.matchMedia('(max-width: 900px)').matches) expireAlarmToast(el);
    else el.remove();
  }, 350);
}
function showAlarmToast(a) {
  const box = $('#alarmToasts');
  if (!box || !a) return;
  if (pointerBusy && window.matchMedia('(max-width: 900px)').matches) { pendingMobileToast = a; return; }
  const el = document.createElement('div');
  el.className = `atoast t-${a.type}`;
  el.dataset.id = a.id;
  el.setAttribute('role', 'alert');
  el.title = `${mdhm(a.at)} · ${a.location} · ${a.title} · ${a.note}`;
  el.innerHTML = `
    <span class="at-badge" aria-hidden="true">${ICON.tri}</span>
    <a class="at-main" href="#/equipment/${a.eqId}" data-alarm="${a.id}">
      <span class="at-kind">${a.type} 알람</span><span class="at-sep">|</span><b>${esc(a.name)}</b>${ICON.chevron}</a>
    <button class="at-x" type="button" data-close-toast aria-label="알람 닫기">${ICON.close}</button>`;
  box.prepend(el);
  // [UI UPDATE 2026-10-22] 모바일은 새 알림 1개만 잠시 표시. 전체 목록은 종 버튼에서 확인.
  const limit = window.matchMedia('(max-width: 900px)').matches ? 1 : 3;
  while (box.children.length > limit) box.lastElementChild.remove();
  setTimeout(() => expireAlarmToast(el), TOAST_MS);
}
function renderToasts() { /* 3초 카드 방식에서는 별도 갱신이 필요 없다 */ }
function notifyBrowser(a) {
  if (auth.experience || !alarms.browser || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`[${a.type}] ${a.name}`, { body: `${a.title} · ${a.location}\n${a.note}`, tag: `gb-${a.eqId}` });
    n.onclick = () => { window.focus(); location.hash = `#/equipment/${a.eqId}`; readAlarm(a.id); };
  } catch { /* 일부 환경에서는 생성 불가 */ }
}

// 설비 이벤트: 경보 전 '이상 징후 감지'(기준 초과 시작) / 경보 발생(최초·재확인)
function fanEvents(f) {
  if (f.events) return f.events;
  const an = f.an, ev = [];
  let warnNo = 0, alarmNo = 0;
  for (let i = RULE.baselineN; i <= f.idx; i++) {
    if (an.firstAlarm >= 0 && i >= an.firstAlarm) {
      if (an.cond[i] && !an.cond[i - 1]) { alarmNo++; ev.push({ f, i, type: '경보', no: alarmNo, first: i === an.firstAlarm }); }
    } else if (anyExceed(an, i) && ![1, 2, 3, 4].some(d => anyExceed(an, i - d))) {
      warnNo++; ev.push({ f, i, type: '주의', no: warnNo });
    }
  }
  f.events = ev.reverse();
  return f.events;
}
function eventText(e) {
  const an = e.f.an;
  if (e.type === '경보') {
    const s = snapshot(an, e.i);
    return { title: e.first ? '최초 경보 발생' : `경보 재확인 ${e.no - 1}차`, note: e.first ? `${an.alarmAxes.map(a => AXIS_LABEL[a]).join('·')} 방향 ${RULE.consecutive}회 연속 확인` : `이상 지속률 ${Math.round(s.persistenceRate)}%` };
  }
  const feats = FEATURES.filter(k => AXES.some(a => an.exceed[e.i][`${a}_${k}`])).map(k => FEATURE[k].short);
  return { title: `이상 징후 감지 ${e.no}차`, note: `${feats.join('·')} 기준 초과` };
}

/* ---------- 상태 ---------- */
const ui = {
  view: 'overview', id: null, process: null,
  sort: store.pref.get('sort', 'priority'),
  feature: 'rms', range: 'recent', hover: { index: null },
  listProcess: 'all', alarmFilter: 'all',
  histTab: 'inspections', eqFilter: 'all',
  calendarProcess: 'all', maintenanceProcess: 'all',
  critOpen: false,
};

const badge = s => `<span class="badge st-${s}">${s}</span>`;
const sdot = s => `<span class="sdot c-${s}"></span>`;

function reasonSummary(f) {
  const s = f.snap;
  if (s.status === '정상') return { title: '정상 범위 유지', sub: '모든 진동 항목이 기준 이내' };
  const title = REASONS[s.mainReason].title;
  let sub = s.exceedFeatures.map(k => FEATURE[k].phrase).join(' · ');
  if (!sub && s.alarmed) sub = `최근 측정은 경보 조건 미충족 · 이상 지속률 ${Math.round(s.persistenceRate)}%`;
  if (!sub && s.status === '주의') sub = '최근 4회 측정 중 기준 초과 확인';
  return { title, sub };
}
const lastExceedTime = f => (f.snap.lastExceed != null ? timeOf(f, f.snap.lastExceed) : null);
const keyTime = f => (f.lastAlarmTime ? new Date(f.lastAlarmTime) : lastExceedTime(f));
const inScope = (f, p) => !p || p === 'all' || f.eq.process === p;

function actionNote(id) {
  const h = store.history(id);
  const pending = h.followUps.filter(x => x.status === '예정').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (pending) return `후속 ${pending.type} 예정 ${pending.due_date.slice(5)}`;
  const reviewing = h.reviews.find(r => r.review_status === '검토 중');
  if (reviewing) return `정비 검토 중 · 희망일 ${reviewing.desired_date ? reviewing.desired_date.slice(5) : '-'}`;
  const last = [...h.inspections].sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
  if (last) return `최근 점검 ${last.inspected_at.slice(5, 10)} · ${last.decision}`;
  return '';
}

/* ---------- 셸: 사이드바 / 헤더 ---------- */
const appEl = () => $('#app');
function setSidebar(collapsed) {
  appEl().classList.toggle('sb-collapsed', collapsed);
  store.pref.set('sidebar', collapsed ? 'collapsed' : 'open');
  if (ui.view === 'overview') requestAnimationFrame(layoutMap);
  if (ui.view === 'detail') setTimeout(updateDetail, 50);
}

// [UI UPDATE 2026-10-22] 공정 > 기계설비 메뉴. 같은 내용이면 노드를 유지해 클릭 도중 교체를 줄임.
function renderSidebar() {
  const brand = $('.sb-logo');
  brand.href = currentUser()?.home || '#/';
  brand.title = currentUser()?.scope || '전체 제철소';
  brand.setAttribute('aria-label', `GB system · ${currentUser()?.scope || '전체 제철소'}`);
  const ctxProcess = ui.view === 'overview' ? ui.process : ui.view === 'list' ? ui.listProcess : (['detail', 'inspect'].includes(ui.view) ? fanById(ui.id)?.eq.process : null);
  const item = (href, icon, label, active, extra = '') =>
    `<a class="sb-item${active ? ' active' : ''}" href="${href}" title="${label}">${icon}<span class="sb-label">${label}</span>${extra}</a>`;
  const proc = PROCESSES.filter(p => (!auth.experience || ['sinter','steel'].includes(p.key)) && (!currentUser()?.process || currentUser().process === p.key)).map(p => {
    return `<div class="sb-process">
      <a href="#/process/${p.key}" class="${ctxProcess === p.key && ui.view !== 'list' ? 'active' : ''}">${p.name}</a>
      <a class="sb-machine${ui.view === 'list' && ui.listProcess === p.key ? ' active' : ''}" href="#/process/${p.key}/equipment" aria-label="${p.name} 기계설비">${ICON.chart}<span>기계설비</span></a>
    </div>`;
  }).join('');
  const nav = `
    ${item(currentUser()?.home || '#/', ICON.home, currentUser()?.process ? currentUser().scope : '전체 제철소', ui.view === 'overview' && ui.process === (currentUser()?.process || null))}
    <button class="sb-item${ctxProcess ? ' active-group' : ''}" type="button" id="sbProc" title="공정 현황">${ICON.factory}<span class="sb-label">공정 현황</span></button>
    <div class="sb-sub">${proc}</div>
    <div class="sb-sep"></div>
    ${item('#/alarms', ICON.bell, '경보 발생 이력', ui.view === 'alarms')}
    ${item('#/maintenance', ICON.wrench, auth.experience ? '점검·정비 이력' : '점검·정비 보고서', ui.view === 'maintenance' || (ui.view === 'report' && ui.reportFrom !== 'calendar'))}
    ${item('#/calendar', ICON.calendar, '정비 캘린더', ui.view === 'calendar' || (ui.view === 'report' && ui.reportFrom === 'calendar'))}
    ${item('#/approvals', ICON.check, currentUser()?.role === 'supervisor' ? '일정 승인' : '승인 요청', ui.view === 'approvals', '<span id="approvalBadge" class="approval-nav-count" hidden></span>')}
    ${auth.experience ? '' : item('#/notifications', ICON.bell, '모바일·이메일 알림', ui.view === 'notifications')}
    ${item('#/mypage', ICON.user, '마이페이지', ui.view === 'mypage')}`;
  if ($('#sbNav').dataset.markup === nav) return;
  $('#sbNav').dataset.markup = nav;
  $('#sbNav').innerHTML = nav;
  $('#sbProc').addEventListener('click', () => { if (appEl().classList.contains('sb-collapsed')) setSidebar(false); });
  void updateApprovalBadge(true);
}

let lastApprovalBadgeRead = 0;
async function updateApprovalBadge(force = false) {
  if (auth.experience) return;
  if (!currentUser() || (!force && Date.now() - lastApprovalBadgeRead < 30000)) return;
  lastApprovalBadgeRead = Date.now();
  const userId = currentUser().id;
  try {
    const response = await auth.request('/api/approvals');
    if (currentUser()?.id !== userId) return;
    const badge = $('#approvalBadge');
    if (badge) { const count = response.counts?.pending ?? response.requests.filter(r => r.status === 'pending').length; badge.textContent = count; badge.hidden = count === 0; }
  } catch { /* Opening the approval page shows recoverable request errors. */ }
}

// [V10.1 HEADER CLEANUP 2026-10-22] 제목 아래 안내문을 제거해 상단 공간을 확보.
function setHeader({ title, back = null }) {
  $('#hdTitle').textContent = title;
  $('#hdBack').hidden = !back;
  if (back) $('#hdBack').setAttribute('href', back);
  // [V10 BRAND UPDATE 2026-10-22] 모든 화면의 탭 제목에 같은 브랜드명을 사용.
  document.title = `${title} | GB system`;
  syncUserButton();
}

// [V9.1 UI FIX 2026-10-22] 마이페이지에서는 같은 사용자 버튼으로 전체 제철소에 복귀.
// 화면 크기와 관계없이 동작·도움말을 일치시켜 휴대폰 회전 때도 목적지가 바뀌지 않음.
function userDestination() { return auth.experience ? '#/' : ui.view === 'mypage' ? currentUser().home : '#/mypage'; }
function syncUserButton() {
  const label = auth.experience ? '사용자 메뉴' : ui.view === 'mypage' ? `${currentUser()?.scope || '전체 제철소'} 현황으로 돌아가기` : '마이페이지로 이동';
  $('#userBtn').setAttribute('aria-label', `${currentUser()?.name || '관리자'} · ${label}`);
  $('#userBtn').title = label;
  if (auth.experience && !$('#experienceUserPop')) {
    const pop = document.createElement('div');
    pop.id = 'experienceUserPop'; pop.className = 'experience-user-pop'; pop.hidden = true;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '사용자 메뉴');
    pop.innerHTML = `<button type="button" id="experienceHome">${ICON.home}<span>초기 화면으로 돌아가기</span>${ICON.chevron}</button>`;
    $('#userBtn').after(pop);
    $('#userBtn').setAttribute('aria-haspopup', 'dialog');
    $('#userBtn').setAttribute('aria-controls', pop.id);
    $('#userBtn').setAttribute('aria-expanded', 'false');
  }
}
function setExperienceUserOpen(open) {
  if (!auth.experience || !$('#experienceUserPop')) return;
  $('#experienceUserPop').hidden = !open;
  $('#userBtn').setAttribute('aria-expanded', String(open));
  if (open) {
    setAlarmOpen(false); $('#livePop').hidden = true;
    $('#liveBtn').setAttribute('aria-expanded', 'false');
    $('#experienceHome').focus();
  }
}

function updateLive() {
  const paused = sim.speed === 0;
  // Map ripples follow the existing playback state without rebuilding markers.
  document.body.dataset.markerPlayback = paused ? 'paused' : 'playing';
  $('#live').classList.toggle('paused', paused);
  $('#liveText').textContent = paused ? '데이터 재생 일시정지' : '실시간 데이터 송신중 …';
  $('#liveBtn').setAttribute('aria-label', `데이터 재생 설정 · ${paused ? '일시정지' : `×${sim.speed}`}`);
  $$('#speedOpts [data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === sim.speed)));
}

function tick() {
  if (replayController?.busy) { sim.last = performance.now(); return; }
  if (started) void updateApprovalBadge();
  // Retries continue while playback is paused; no browser notification permission is required on the PC.
  if (started) void alarmReporter?.flush();
  const linkStatus = $('#playbackLinkStatus');
  if (linkStatus && alarmReporter) linkStatus.textContent = alarmReporter.status;
  sim.advance();
  $('#hdClock').textContent = clockText(simNow());
  const e = Math.floor(sim.ms / 60000);
  if (e !== sim.elapsed) {
    sim.elapsed = e;
    updateFans();
    onDataTick();
  }
  sim.save();
}

/* ---------- 라우팅 ---------- */
function route() {
  // [LOGIN ADD] 미로그인 상태에서는 상세 화면을 열지 않음.
  if (!currentUser()) return;
  setExperienceUserOpen(false);
  const [routePath, routeQuery = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = (routePath || '').split('/').filter(Boolean);
  if (auth.experience && (['approvals', 'mypage', 'notifications'].includes(parts[0]) || parts[2] === 'inspect' || (parts[0] === 'process' && !['sinter','steel'].includes(parts[1])))) {
    location.replace('#/'); return;
  }
  const routeParams = new URLSearchParams(routeQuery);
  ui.approvalStatus = routeParams.get('status');
  ui.approvalRequest = routeParams.get('request');
  // [ROLE] Navigation guard complements server-side read/write restrictions.
  const own = currentUser().process;
  if (own && (!parts.length || (parts[0] === 'process' && parts[1] !== own))) { location.replace(currentUser().home); return; }
  if (own) { ui.maintenanceProcess = own; ui.calendarProcess = own; }
  const prevView = ui.view, prevId = ui.id, prevProcess = ui.process;
  if (parts[0] === 'equipment' && parts[1] && fanById(parts[1])) {
    ui.view = parts[2] === 'inspect' ? 'inspect' : 'detail';
    if (prevId !== parts[1]) { ui.hover.index = null; ui.feature = 'rms'; ui.range = 'recent'; }
    ui.id = parts[1];
  } else if (parts[0] === 'equipment') { ui.view = 'list'; ui.listProcess = currentUser()?.process || 'all'; }
  else if (parts[0] === 'process' && PROCESSES.some(p => p.key === parts[1])) {
    if (parts[2] === 'equipment') { ui.view = 'list'; ui.listProcess = parts[1]; }
    else { ui.view = 'overview'; ui.process = parts[1]; }
  }
  // 기존 이력 링크도 통합 화면으로 연결하여 북마크가 깨지지 않음.
  else if (parts[0] === 'history') { location.replace('#/maintenance'); return; }
  else if (parts[0] === 'reports' && !auth.experience) {
    ui.view = 'report'; ui.reportKind = parts[1];
    try { ui.reportId = decodeURIComponent(parts[2] || ''); } catch { ui.reportId = ''; }
    ui.reportFrom = routeParams.get('from') === 'calendar' ? 'calendar' : 'maintenance';
  }
  else if (['alarms', 'maintenance', 'calendar', 'mypage', 'notifications', 'approvals'].includes(parts[0])) ui.view = parts[0];
  else { ui.view = 'overview'; ui.process = currentUser()?.process || null; }
  if (['calendar', 'maintenance'].includes(ui.view) && prevView !== ui.view && prevView !== 'report') ui.eqFilter = 'all';
  appEl().classList.remove('sb-mobile-open');
  setAlarmOpen(false);
  renderSidebar();
  render();
  // Other managers can approve in another browser; revisiting calendar/history refreshes DB rows.
  if (['calendar', 'maintenance'].includes(ui.view)) {
    const targetView = ui.view;
    store.refreshMaintenance().then(() => { if (ui.view === targetView && !$('#calForm')?.dataset.dirty) targetView === 'calendar' ? renderCalendar() : renderMaintenance(); })
      .catch(error => { if (ui.view === targetView) toast(error.message); });
  }
  // [SCROLL SHELL] Each page scrolls inside the main area beside the fixed-height sidebar.
  if (!(prevView === ui.view && ui.view === 'overview' && prevProcess === ui.process)) $('.main-wrap').scrollTo(0, 0);
  $('#view').focus({ preventScroll: true });
}

function render() {
  // [MOBILE BANNER FIX 2026-10-22] 화면 전환 시 본문과 함께 알림 노드가 삭제되지 않도록 보관.
  const toastBox = $('#alarmToasts');
  if (toastBox && $('#view').contains(toastBox)) $('.header').after(toastBox);
  document.body.dataset.view = ui.view;
  document.body.dataset.overviewProcess = ui.process || '';
  const v = ui.view;
  if (v === 'overview') renderOverview();
  else if (v === 'list') renderList();
  else if (v === 'detail') renderDetail();
  else if (v === 'inspect') renderInspect();
  else if (v === 'alarms') renderAlarms();
  else if (v === 'maintenance') renderMaintenance();
  else if (v === 'report') renderReportPreview();
  else if (v === 'calendar') renderCalendar();
  else if (v === 'approvals') {
    setHeader({ title: currentUser()?.role === 'supervisor' ? '일정 승인' : '승인 요청' });
    mountApprovals($('#view'), { auth, store, esc, nameOf, equipmentOf: id => fanById(id)?.eq || {}, initialStatus: ui.approvalStatus, requestId: ui.approvalRequest,
      toast: message => { toast(message); void updateApprovalBadge(true); void approvalInbox?.refresh(); } });
  }
  else if (v === 'notifications') {
    setHeader({title: auth.experience ? '내 알림 체험' : '모바일·이메일 알림'});
    mountNotifications($('#view'), {auth,esc,getPlaybackStatus:()=>alarmReporter?.status || ''});
  }
  else if (v === 'mypage') {
    // [MYPAGE ADD] Read-only account/activity page. No profile or password editing.
    setHeader({ title: '마이페이지' });
    mountMyPage($('#view'), { auth, esc, nameOf });
  }
  else renderMaintenance();
  placeAlarmToasts();
}

// [MOBILE BANNER FIX 2026-10-22] 모바일 홈은 현황 카드 아래 전용 공간에 표시.
// 다른 모바일 화면은 헤더 아래 일반 흐름, 데스크톱은 기존 고정 위치를 유지함.
function placeAlarmToasts() {
  const box = $('#alarmToasts');
  if (!box) return;
  const slot = window.matchMedia('(max-width: 900px)').matches && $('#homeAlarmSlot');
  if (slot) { if (box.parentElement !== slot) slot.append(box); }
  else { const header = $('.header'); if (header.nextElementSibling !== box) header.after(box); }
}

// [UI UPDATE 2026-10-22] 빠른 재생에서도 터치/클릭 도중 대상 DOM을 교체하지 않음.
// 데이터 계산은 계속하며 화면 갱신만 클릭 처리 다음에 수행함.
let pointerBusy = false, deferredTick = false;
document.addEventListener('pointerdown', () => { pointerBusy = true; }, { passive: true });
function releasePointer() {
  setTimeout(() => {
    pointerBusy = false;
    if (deferredTick) { deferredTick = false; onDataTick(); }
    if (pendingMobileToast) {
      const latest = pendingMobileToast; pendingMobileToast = null;
      if ($('#alarmPop').hidden && !appEl().classList.contains('sb-mobile-open')) showAlarmToast(latest);
    }
  }, 0);
}
document.addEventListener('pointerup', releasePointer, { passive: true });
document.addEventListener('pointercancel', releasePointer, { passive: true });
window.addEventListener('blur', releasePointer);
function onDataTick() {
  if (pointerBusy) { deferredTick = true; return; }
  renderSidebar();
  const v = ui.view;
  if (v === 'overview') updateOverview();
  else if (v === 'list') renderList();
  else if (v === 'detail') updateDetail();
  else if (v === 'inspect') updateFormHead();
  else if (v === 'alarms') renderAlarms();
}

/* =========================================================
   화면 1 — 홈(POSCO 포항제철소) / 공정 화면
   홈: 제철소 배치도 + 공장 구역 강조 + 전체 설비 현황
   공정: 근접 배치도 + 설비 마커 + 공정 설비 현황 + 점검 필요 설비
   ========================================================= */
/* 2026-10-23 reference-layout overview; backend and monitoring rules unchanged. */
function renderOverview() { return ui.process ? renderProcess() : renderHome(); }
function updateOverview() { return ui.process ? updateProcess() : updateHome(); }
function layoutMap() {
  const img = $('#mapImg');
  if (img) img.src = ui.process ? procImg(ui.process) : HOME_MAP[theme()];
  const wrap = $('#mapWrap'), stage = $('#mapStage');
  if (!wrap || !stage) return;
  const mobile = matchMedia('(max-width:900px)').matches;
  // The home map now occupies its own hero within the content column.
  // Process maps retain their existing full-window coordinate system.
  const w = mobile || !ui.process ? wrap.clientWidth : innerWidth;
  const h = mobile ? w * 9 / 16 : wrap.clientHeight;
  const scale = Math.max(w / 1920, h / 1080);
  Object.assign(stage.style, {width: `${1920 * scale}px`, height: `${1080 * scale}px`, left: `${(w - 1920 * scale) / 2}px`, top: `${(h - 1080 * scale) / 2}px`});
  stage.style.setProperty('--s', scale);
}
const layoutHomeMap = layoutMap;
const layoutProcessMap = layoutMap;
function statusCounts(list) {
  return { total: list.length, 정상: list.filter(f => f.snap.status === '정상').length, 주의: list.filter(f => f.snap.status === '주의').length, 경보: list.filter(f => f.snap.status === '경보').length };
}
function overviewShell(process) {
  const name = process ? processName(process) : 'POSCO 포항제철소';
  return `<section class="map-view ov-view ${process ? 'proc-view' : 'home-view'}" aria-label="${name} 배치도">
    <div class="map-wrap" id="mapWrap"><div class="map-stage" id="mapStage"><img id="mapImg" src="${process ? procImg(process) : HOME_MAP[theme()]}" alt="${name} 배치도" draggable="false"><div id="mapZones"></div><div id="mapMarkers"></div></div></div>
    <aside class="ov-panels ${process ? 'ov-process-panels' : 'ov-home-panels'}"><div id="overviewPanels" class="ov-panel-content"></div>${foldControl()}</aside>
    <aside id="overviewAlerts" class="ov-alerts" aria-label="현재 점검 필요 설비 알림"></aside>
    <div id="homeAlarmSlot" class="home-alarm-slot"></div></section>`;
}
function syncPanelFold() {
  const panels = $('.ov-panels'), content = $('#overviewPanels'), button = $('[data-dashboard-toggle]');
  if (!panels || !button) return;
  const folded = store.pref.get(`overview-fold-${ui.process || 'home'}`, false);
  panels.classList.toggle('is-folded', folded);
  content.inert = folded && !matchMedia('(max-width:900px)').matches;
  button.setAttribute('aria-expanded', String(!folded));
  button.setAttribute('aria-label', `현황 카드 ${folded ? '펼치기' : '접기'}`);
}
function renderHome() {
  setHeader({title: 'POSCO 포항제철소'});
  // Home has one page scroll: map and summary first, comparison and checks below.
  $('#view').innerHTML = `<section class="map-view ov-view home-view" aria-label="전체 제철소 현황">
    <div class="home-hero" aria-label="POSCO 포항제철소 배치도">
      <div class="map-wrap" id="mapWrap"><div class="map-stage" id="mapStage"><img id="mapImg" src="${HOME_MAP[theme()]}" alt="POSCO 포항제철소 배치도" draggable="false"><div id="mapZones"></div><div id="mapMarkers"></div></div></div>
      <aside id="overviewAlerts" class="ov-alerts" aria-label="우선 확인할 설비 알림"></aside>
      ${homeSummary()}
    </div>
    <section class="home-details" aria-label="공정별 설비와 점검 필요 현황">
      <div class="home-detail-grid"><div id="overviewPanels" class="ov-panel-content">${homePanels()}</div><section id="homeChecks" class="ov-card ov-checks" aria-label="점검 필요 설비"></section></div>
    </section>
    <div id="homeAlarmSlot" class="home-alarm-slot"></div></section>`;
  layoutMap(); updateHome();
}
function alarmCards(list, limit = 5) {
  const target = $('#overviewAlerts');
  if (!target) return;
  const shown = [...list].filter(f => f.snap.status !== '정상').sort(priorityCompare).slice(0, limit);
  const markup = shown.map(f => {
    const s = f.snap.status, t = keyTime(f), r = reasonSummary(f);
    return `<a class="ov-alert state-${s}" href="#/equipment/${f.eq.equipment_id}"><span class="ov-alert-symbol">${ICON.tri}</span>
      <span class="ov-alert-body"><span class="ov-alert-title"><b>${esc(f.eq.equipment_name)}</b><em>${s === '경보' ? '이상 상태 지속 확인' : '상태 확인 필요'}</em></span><small>${t ? `${mdhm(t)} | ` : ''}${esc(f.eq.monitored_part)} | ${esc(f.eq.location)}</small></span>${ICON.chevron}<span class="sr-only">${esc(r.title)}</span></a>`;
  }).join('');
  if (target.dataset.markup !== markup) { target.dataset.markup = markup; target.innerHTML = markup; }
}
// Shared presentation for home/process inspection queues; filtering, order and
// process limits stay at each caller so this layout never changes alarm logic.
function inspectionChecksMarkup(items, { scopeCount, equipmentHref, showScopeNote = false }) {
  const status = items.some(f => f.snap.status === '경보') ? '경보' : items.length ? '주의' : '정상';
  return `<div class="ov-check-header state-${status}${items.length ? '' : ' is-empty'}">
      ${inspectionHeading()}<div class="ov-sort" role="group" aria-label="점검 필요 설비 정렬">
        <button type="button" data-sort="priority" aria-pressed="${ui.sort === 'priority'}">우선 확인 순</button>
        <button type="button" data-sort="recent" aria-pressed="${ui.sort === 'recent'}">최근 경보 순</button>
      </div></div>
    ${showScopeNote ? `<p class="home-check-note">연결 설비 ${scopeCount}대의 현재 데이터 기준</p>` : ''}
    ${items.length ? `<div class="ov-check-list">${items.map(f => {
      const state = f.snap.status, reason = reasonSummary(f), time = keyTime(f);
      return `<a class="ov-check state-${state}" href="#/equipment/${f.eq.equipment_id}">
        <span class="ov-check-dot" role="img" aria-label="${esc(state)}"></span>
        <div class="ov-check-copy"><div class="ov-check-lead"><h3>${esc(f.eq.equipment_name)}</h3><strong>${esc(reason.title)}</strong></div>
          <small>${time ? `${mdhm(time)} | ` : ''}${esc(f.eq.monitored_part)} | ${esc(f.eq.location)}</small></div>${ICON.chevron}</a>`;
    }).join('')}</div>` : `<p class="ov-empty">${scopeCount ? '이상 상태가 감지되지 않았습니다.' : '등록된 모니터링 설비가 없습니다.'}</p>`}
    <a class="ov-equipment-link${items.length ? '' : ' is-empty-link'}" href="${esc(equipmentHref)}">기계설비 전체 보기 ${ICON.chevron}</a>`;
}
function updateHome() {
  if (!$('#mapZones')) return;
  const markup = ZONES.map(z => {
    const c = statusCounts(fans.filter(f => f.eq.process === z.process));
    const state = c.경보 ? '경보' : c.주의 ? '주의' : '정상';
    const label = `${processName(z.process)} · 정상 ${c.정상} · 주의 ${c.주의} · 경보 ${c.경보}`;
    return `<a class="ov-zone state-${state}" href="#/process/${z.process}" aria-label="${label}" style="left:${(z.cx-z.rx)/1920*100}%;top:${(z.cy-z.ry)/1080*100}%;width:${z.rx*2/1920*100}%;height:${z.ry*2/1080*100}%"></a>
      <a class="ov-zone-pin state-${state}" href="#/process/${z.process}" style="left:${z.ax/1920*100}%;top:${z.ay/1080*100}%" aria-label="${label}"><span class="ov-zone-symbol">${state === '정상' ? '' : ICON.tri}</span><span class="ov-zone-label">${processName(z.process)}${state === '정상' ? '' : ` ${state} 발생`}</span></a>`;
  }).join('');
  if ($('#mapZones').dataset.markup !== markup) { $('#mapZones').dataset.markup = markup; $('#mapZones').innerHTML = markup; }
  alarmCards(fans, 2);
  const checks = $('#homeChecks');
  const sorted = [...fans].filter(f => f.snap.status !== '정상').sort(ui.sort === 'recent' ? recentAlarmCompare : priorityCompare);
  const checksMarkup = inspectionChecksMarkup(sorted, { scopeCount: fans.length, equipmentHref: '#/equipment', showScopeNote: true });
  if (checks && checks.dataset.markup !== checksMarkup) { checks.dataset.markup = checksMarkup; checks.innerHTML = checksMarkup; }
}
function renderProcess() {
  setHeader({title: processName(ui.process)});
  $('#view').innerHTML = overviewShell(ui.process);
  layoutMap(); updateProcess(); syncPanelFold();
}
function updateProcess() {
  const panel = $('#overviewPanels');
  if (!panel || !$('#mapMarkers')) return;
  const p = ui.process, scope = fans.filter(f => f.eq.process === p);
  const sorted = [...scope].filter(f => f.snap.status !== '정상').sort(ui.sort === 'recent' ? recentAlarmCompare : priorityCompare);
  const markup = processSummary(processName(p), sorted.length > 0, scope.length > 0) +
    `<section class="ov-card ov-checks" aria-label="점검 필요 설비">${inspectionChecksMarkup(sorted.slice(0, 3), { scopeCount: scope.length, equipmentHref: `#/process/${p}/equipment` })}</section>`;
  if (panel.dataset.markup !== markup) { panel.dataset.markup = markup; panel.innerHTML = markup; }
  const pins = scope.map(f => {
    const s = f.snap.status, pos = MAP_POSITIONS[f.eq.equipment_id] || [f.eq.map_x_pct,f.eq.map_y_pct];
    return `<a class="ov-pin state-${s}" data-marker-kind="connected" href="#/equipment/${f.eq.equipment_id}" style="left:${pos[0]}%;top:${pos[1]}%" aria-label="${esc(f.eq.equipment_name)} ${s} 상세 보기"><span class="ov-pin-dot"></span><span class="ov-pin-label">${esc(f.eq.equipment_name)}</span></a>`;
  }).join('') + (MAP_EXAMPLE_MARKERS[p] || []).map(m => {
    // Unconnected design markers stay visually normal; only real fans use measured status.
    return `<span class="ov-pin ov-pin-example state-정상" data-marker-kind="example" style="left:${m.x}%;top:${m.y}%" role="img" aria-label="${esc(processName(p))} 시안 표시 · 정상 표시 · 데이터 미연결"><span class="ov-pin-dot" aria-hidden="true"></span></span>`;
  }).join('');
  if ($('#mapMarkers').dataset.markup !== pins) { $('#mapMarkers').dataset.markup = pins; $('#mapMarkers').innerHTML = pins; }
  alarmCards(scope);
}

/* =========================================================
   설비 현황 — 전체 설비 목록
   ========================================================= */
function renderList() {
  setHeader({ title: '기계설비', back: ui.listProcess === 'all' ? '#/' : `#/process/${ui.listProcess}` });
  const scope = fans.filter(f => inScope(f, ui.listProcess));
  const count = s => scope.filter(f => f.snap.status === s).length;
  const sorted = [...scope].sort(ui.sort === 'recent' ? recentAlarmCompare : priorityCompare);
  const row = f => {
    const r = reasonSummary(f), note = actionNote(f.eq.equipment_id);
    return `
      <tr class="row-link" tabindex="0" data-go="${f.eq.equipment_id}">
        <td class="cell-name"><b>${esc(f.eq.equipment_name)}</b><small>${esc(f.eq.tag)}${note ? ` · ${esc(note)}` : ''}</small></td>
        <td>${esc(f.eq.location)}<small class="muted" style="display:block">${esc(f.eq.process_name)}</small></td>
        <td>${esc(f.eq.monitored_part)}<small class="muted" style="display:block">${esc(f.eq.bearing_position)}</small></td>
        <td>${badge(f.snap.status)}</td>
        <td class="cell-reason"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></td>
        <td class="time">${f.lastAlarmTime ? shortTime(new Date(f.lastAlarmTime)) : '<span class="muted">-</span>'}</td>
        <td>${ICON.chevron}</td>
      </tr>`;
  };
  $('#view').innerHTML = `
    <div class="page">
      ${processTabs(ui.listProcess)}
      <nav class="crumb" aria-label="현재 위치">${processName(ui.listProcess)}<span>›</span>기계설비<span>›</span>팬<span>›</span>베어링 감시</nav>
      <div class="page-head">
        <div class="counts">
          <div class="count"><span>전체</span><b>${scope.length}</b></div>
          <div class="count k-정상"><span>정상</span><b>${count('정상')}</b></div>
          <div class="count k-주의"><span>주의</span><b>${count('주의')}</b></div>
          <div class="count k-경보"><span>경보</span><b>${count('경보')}</b></div>
        </div>
      </div>
      <section class="card table-card">
        <div class="table-tools">
          <div class="seg" role="group" aria-label="정렬">
            <button type="button" data-sort="priority" aria-pressed="${ui.sort === 'priority'}">우선 확인 순</button>
            <button type="button" data-sort="recent" aria-pressed="${ui.sort === 'recent'}">최근 경보 순</button>
          </div>
          <span class="hint">${ui.sort === 'priority'
            ? '현재 상태 → 이상 지속률 → 정상 범위 초과 정도 → 최근 경보 시점 순 · 고장 위험도 순위가 아닙니다.'
            : '최근 경보가 발생한 설비부터 정렬합니다. 경보가 없는 설비는 우선 확인 순으로 뒤에 표시합니다.'}</span>
        </div>
        <div class="tablewrap"><table class="list">
          <thead><tr><th>설비명</th><th>위치</th><th>감시 부위</th><th>현재 상태</th><th>주요 판단 근거</th><th>최근 경보</th><th></th></tr></thead>
          <tbody>${sorted.length ? sorted.map(row).join('') : '<tr><td colspan="7" class="muted">해당 공정의 모니터링 대상이 없습니다.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>`;
}

/* =========================================================
   화면 2 — 설비 상세
   ========================================================= */
function renderDetail() {
  const f = fanById(ui.id), eq = f.eq;
  setHeader({ title: eq.process_name, back: `#/process/${eq.process}` });
  $('#view').innerHTML = `
    <div class="detail detail-layout">
      <div class="hero">
        <section class="card hero-card">
          <h2 class="hero-name">${esc(eq.equipment_name)}</h2>
          <div class="hero-sub">${esc(eq.tag)} · 위치 ${esc(eq.location)}</div>
          <div class="graph-sec">
            <div class="graph-head"><h3 id="dGraphTitle">진동 크기 변화</h3></div>
            <div class="graph-controls">
              <div class="graph-tabs" role="tablist" aria-label="진동 특징">
                ${FEATURES.map(k => `<button type="button" role="tab" data-feature="${k}">${FEATURE[k].name}</button>`).join('')}
              </div>
              <div class="seg" role="group" aria-label="표시 구간">
                <button type="button" data-range="recent">최근 3시간</button>
                <button type="button" data-range="all">전체</button>
              </div>
            </div>
            <div class="legend" id="dLegend"></div>
            <div class="chart-host" id="dChart"></div>
            <div class="chart-note">현재 시점까지의 측정값만 표시합니다. 그래프 위에 마우스를 올리면 시점별 진동 특징의 기준 통과 여부를 볼 수 있습니다.</div>
          </div>
          <section class="detail-alarm-history" aria-label="설비 경보 이력">
            <div id="dAlarmHistory"></div>
          </section>
        </section>
        <div class="hero-visual">
          <!-- [DETAIL LAYOUT 2026-10-24] 원본 설비 그림/분석은 유지하고 상태·작성 안내만 상단으로 이동. -->
          <div class="detail-topline">
            <section class="card detail-status" id="dStatus" aria-label="현재 설비 상태"></section>
            <section class="card cta" id="dCta"></section>
          </div>
          <div class="fan-img" id="dFan"><div class="fan-stage">
            <img id="dFanImg" src="" alt="${esc(eq.equipment_name)} 설비 모형" decoding="async">
            <div class="hotspot" id="dSpot" tabindex="0" role="img" aria-label="${esc(eq.monitored_part)} · ${esc(eq.bearing_position)} · ${esc(eq.bearing_type)}"><i></i>
              <div class="hs-label">${esc(eq.monitored_part)}<small>${esc(eq.bearing_position)} · ${esc(eq.bearing_type)}</small></div></div>
          </div></div>
          <section class="reasons" id="dReasons" aria-label="판단 근거"></section>
        </div>
      </div>

      <div class="lower">
        <div>
          <details class="card accordion" id="dCriteria">
            <summary>분석 기준 보기</summary>
            <div class="acc-body" id="dCriteriaBody"></div>
          </details>
          <div class="section-head"><h2>점검·정비 이력</h2><span class="hint">과거 이상과 조치 사례, 후속 점검을 확인합니다.</span></div>
          <section class="card" id="dHistory"></section>
        </div>
        <aside class="card side-card">
          <h3>설비 정보</h3>
          <dl class="kv">
            <dt>설비 번호</dt><dd>${esc(eq.equipment_id)}</dd>
            <dt>태그</dt><dd>${esc(eq.tag)}</dd>
            <dt>공정</dt><dd>${esc(eq.process_name)}</dd>
            <dt>설비 종류</dt><dd>${esc(eq.equipment_type)}</dd>
            <dt>베어링 위치</dt><dd>${esc(eq.bearing_position)}</dd>
            <dt>베어링 형식</dt><dd>${esc(eq.bearing_type)}</dd>
            <dt>정격 회전수</dt><dd>${eq.rated_rpm.toLocaleString()} rpm</dd>
            <dt>모터 출력</dt><dd>${eq.motor_kw.toLocaleString()} kW</dd>
            <dt>측정 축</dt><dd>수평 · 수직 (1분 주기)</dd>
            <dt>담당자</dt><dd>${esc(eq.manager)}</dd>
            <dt>설치일</dt><dd>${esc(eq.installed_on)}</dd>
          </dl>
        </aside>
      </div>
    </div>`;
  $('#dCriteria').addEventListener('toggle', e => { ui.critOpen = e.target.open; });
  if (ui.critOpen) $('#dCriteria').open = true;
  renderDetailHistory(f);
  updateDetail();
}

function updateDetail() {
  const f = fanById(ui.id);
  if (!f || !$('#dStatus')) return;
  const s = f.snap, eq = f.eq, an = f.an, i = s.index;
  const firstT = s.firstAlarm != null ? timeOf(f, s.firstAlarm) : null;
  const lastT = f.lastAlarmTime ? new Date(f.lastAlarmTime) : null;

  let desc;
  if (s.status === '경보') {
    if (s.sinceAlarm === 0) desc = `방금 경보 조건이 충족되었습니다. 이상 진동이 ${RULE.consecutive}회 연속 확인되었습니다.`;
    else if (s.sustained) desc = `경보 이후에도 이상 진동이 ${s.persistCount}회 계속 확인되고 있습니다.`;
    else desc = `경보 이후 이상 진동이 ${s.persistCount}회 확인되었고, 최근 측정에서는 경보 조건이 충족되지 않았습니다.`;
  } else if (s.status === '주의') desc = '평소 기준을 넘는 진동이 확인되었지만, 아직 경보 조건(연속 확인)은 충족되지 않았습니다.';
  else desc = '모든 진동 항목이 정상 기준 범위 안에 있습니다.';

  const facts = [['최근 경보 시점', lastT ? ymdhm(lastT) : '-', !!lastT]];
  if (firstT) facts.push(['최초 경보 후 경과', duration(s.sinceAlarm)], ['이상 지속률', `${Math.round(s.persistenceRate)}%`]);
  else { const le = lastExceedTime(f); facts.push(['최근 기준 초과', le ? ymdhm(le) : '-'], ['마지막 측정', ymdhm(timeOf(f, f.idx))]); }

  const evs = fanEvents(f).slice(0, 4);
  // 같은 상태/사건을 각각 상단 상태 카드와 그래프 아래 이력에 배치한다.
  $('#dStatus').innerHTML = `
    <span class="detail-status-icon st-${s.status}" aria-hidden="true">${s.status === '정상' ? ICON.check : ICON.tri}</span>
    <div class="detail-status-copy" title="${esc(desc)}${s.ended ? ' 데이터 재생 종료 · 마지막 측정 기준' : ''}">
      <h3>현재 설비 상태 <span class="c-${s.status}">${s.status}</span></h3>
      <p class="status-desc">${s.status === '정상' ? '정상 기준 범위입니다' : '담당자의 확인이 필요합니다'}</p>
    </div>`;
  $('#dAlarmHistory').innerHTML = `
    <div class="detail-alarm-summary"><h3>경보 이력</h3>
      <dl class="facts">${facts.map(([k, v, red]) => `<div><span>${k}</span><b class="${red ? 'red' : ''}">${v}</b></div>`).join('')}</dl>
    </div>
    ${evs.length ? `<ul class="events" aria-label="최근 이상 이벤트">${evs.map(e => {
      const t = eventText(e);
      return `<li class="e-${e.type}"><span>${mdhm(timeOf(f, e.i))}</span><b>${t.title}</b><span>${esc(t.note)}</span></li>`;
    }).join('')}</ul>` : '<p class="detail-events-empty">현재 시점까지 기록된 이상 이벤트가 없습니다.</p>'}
    <div class="events more"><a class="link-btn" href="#/alarms">경보 이력 전체 보기 →</a></div>`;

  // [V10 EQUIPMENT IMAGE FIX 2026-10-22] 모양·좌표는 고정, 원본 상태별 PNG만 교체.
  const img = getFanImage(eq, theme(), s.status);
  const [sx, sy] = img[eq.bearing_position.includes('NDE') ? 'NDE' : 'DE'];
  $('#dFan').className = `fan-img s-${s.status} t-${theme()}`;
  $('#dFan').dataset.fanSet = img.set;
  $('#dFan').style.setProperty('--r', img.ratio);
  setFanImage($('#dFanImg'), img.src);
  Object.assign($('#dSpot').style, { left: `${sx}%`, top: `${sy}%` });
  $('#dSpot').dataset.bearingSide = eq.bearing_position.includes('NDE') ? 'NDE' : 'DE';
  $('#dSpot').className = `hotspot s-${s.status}`;

  const draft = store.draft.get(eq.equipment_id);
  $('#dCta').className = `card cta st-${s.status}`;
  $('#dCta').innerHTML = `
    <div class="detail-cta-copy"><h3>점검·정비 기록</h3>
    <p>담당자의 작성이 필요합니다</p>
    </div>
    <a class="btn primary" href="#/equipment/${eq.equipment_id}/inspect">점검 기록 작성하기</a>
    ${draft ? `<div class="draft-note">임시 저장된 점검 내용이 있습니다 (${esc(draft.savedAt)})</div>` : ''}`;

  // 판단 근거 카드 — 현재 상태에 필요한 카드만
  const detailOf = k => {
    if (k === 'sustained') return `경보 후 ${s.sinceAlarm}회 측정 중 ${s.persistCount}회 경보 조건 충족`;
    if (k === 'consecutive') return `최초 경보 ${hhmm(firstT)} · ${an.alarmAxes.map(a => AXIS_LABEL[a]).join('·')} 방향에서 ${RULE.consecutive}회 연속 확인`;
    if (k === 'multi') return s.multiAxis.map(a => `${AXIS_LABEL[a]}: ${FEATURES.filter(x => an.exceed[i][`${a}_${x}`]).map(x => FEATURE[x].short).join(', ')}`).join(' / ');
    if (k === 'unusual') return s.exceedFeatures.length ? s.exceedFeatures.map(x => FEATURE[x].phrase).join(' · ') : '최근 4회 측정 중 기준 초과 확인';
    return '';
  };
  const reasonCaption = k => {
    if (k === 'multi') return FEATURES.filter(x => s.multiAxis.some(a => an.exceed[i][`${a}_${x}`])).map(x => FEATURE[x].short).join(', ');
    if (k === 'consecutive') return `${an.alarmAxes.map(a => AXIS_LABEL[a]).join('·')} 방향에서 ${RULE.consecutive}회 연속 확인`;
    if (k === 'unusual' && s.exceedFeatures.length) return `${s.exceedFeatures.map(x => FEATURE[x].short).join(', ')} 기준 초과`;
    return detailOf(k);
  };
  // 정상일 때는 판단 근거 카드를 보이지 않는다
  $('#dReasons').hidden = !s.shown.length;
  $('#dReasons').innerHTML = s.shown.map(k => `<div class="reason">${REASON_ICON[k]}<h4>${k === 'multi' ? '여러 항목에서 이상 확인' : REASONS[k].title}</h4><p>${REASONS[k].desc}</p>
        <div class="detail-line" title="${esc(detailOf(k))}">${esc(reasonCaption(k))}</div></div>`).join('');

  // 그래프 — 현재 시점까지만
  $('#dGraphTitle').textContent = `${FEATURE[ui.feature].short} 변화`;
  $$('[data-feature]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.feature === ui.feature)); b.setAttribute('aria-selected', String(b.dataset.feature === ui.feature)); });
  $$('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === ui.range)));
  renderChart($('#dChart'), { an, now: f.idx, feature: ui.feature, range: ui.range, timeOf: k => timeOf(f, k), hhmm, hover: ui.hover, experience: auth.experience });
  const focus = s.alarmed ? an.alarmAxes : [];
  const axisLg = a => `<span><i class="lg-line${s.alarmed && !focus.includes(a) ? ' dim' : ''}" style="--c:var(--${a}-line)"></i>${AXIS_LABEL[a]}${focus.includes(a) ? '(최초 경보 축)' : ''}</span>`;
  $('#dLegend').innerHTML = `${AXES.map(axisLg).join('')}
    <span><i class="lg-band"></i>정상 기준 범위</span><span><i class="lg-dash"></i>최초 경보</span>
    <span><i class="lg-dot" style="--c:var(--alarm)"></i>경보 발생</span>
    <span><i class="lg-dot" style="--c:var(--warn)"></i>기준 초과(경보 조건 미충족)</span><span><i class="lg-now"></i>현재</span>`;

  // 분석 기준
  $('#dCriteriaBody').innerHTML = `
    <div class="criteria">
      <div class="crit"><span>정상 기준 구간</span><b>N = ${RULE.baselineN}</b><small>처음 ${RULE.baselineN}회 측정의 평균 + 3σ</small></div>
      <div class="crit"><span>사용 특징</span><b>3개</b><small>${FEATURES.map(k => FEATURE[k].short).join(' · ')}</small></div>
      <div class="crit"><span>경보 조건</span><b>${RULE.need}/${RULE.of}</b><small>같은 방향에서 3개 중 2개 이상</small></div>
      <div class="crit"><span>연속 확인</span><b>${RULE.consecutive}회</b><small>특징별 연속 기준 초과</small></div>
      <div class="crit"><span>분석 방식</span><b>${RULE.method} 방식</b><small>방향·특징별 연속 판정 후 2/3 적용</small></div>
      <div class="crit${s.featuresMet >= RULE.need ? ' hl' : ''}"><span>현재 특징 충족</span><b>3개 중 ${s.featuresMet}개</b><small>${AXIS_LABEL[s.metAxis]} 방향 · ${RULE.consecutive}회 연속 초과 기준</small></div>
      <div class="crit${s.sustained ? ' hl' : ''}"><span>추가 지속 확인</span><b>${s.alarmed ? (s.sustained ? '확인됨' : '확인되지 않음') : '해당 없음'}</b><small>경보 이후에도 조건 충족 여부</small></div>
      <div class="crit"><span>이상 지속률</span><b>${s.alarmed ? `${Math.round(s.persistenceRate)}%` : '-'}</b><small>경보 이후 조건 충족 비율</small></div>
    </div>
    <div class="acc-sub">현재 측정값과 정상 기준 (${hhmm(timeOf(f, i))})</div>
    <div class="tablewrap"><table class="mini-table">
      <thead><tr><th>진동 특징</th><th>방향</th><th>현재값</th><th>정상 기준</th><th>판정</th><th>연속 초과</th></tr></thead>
      <tbody>${FEATURES.flatMap(k => AXES.map(a => {
        const key = `${a}_${k}`, ex = an.exceed[i][key];
        return `<tr><td>${FEATURE[k].name}</td><td>${AXIS_LABEL[a]}</td><td class="num">${an.series[i][key].toFixed(3)}</td>
          <td class="num">${an.th[key].toFixed(3)}</td><td class="${ex ? 'ng' : 'ok'}">${ex ? `초과 +${an.pct[i][key].toFixed(0)}%` : '통과'}</td>
          <td class="num">${an.run[i][key]}회</td></tr>`;
      })).join('')}</tbody></table></div>
    <div class="acc-sub">용어 설명</div>
    <div class="tablewrap"><table class="mini-table">
      <thead><tr><th>상세 화면 이름</th><th>기본 화면 문구</th><th>쉬운 설명</th></tr></thead>
      <tbody>${FEATURES.map(k => `<tr><td><b>${FEATURE[k].name}</b></td><td>${FEATURE[k].phrase}</td><td>${FEATURE[k].desc}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

function renderDetailHistory(f) {
  const h = store.history(f.eq.equipment_id);
  const today = ymd(simNow());
  const items = [
    ...h.inspections.map(r => ({
      date: r.inspected_at,
      html: `<div class="tl-title">현장 점검 · ${esc(r.decision)} ${r.model_status ? badge(r.model_status) : ''}${r.source === 'app' ? '<span class="tag-new">NEW</span>' : ''}</div>
        <div class="tl-body">${esc(r.memo || '메모 없음')}</div>
        <div class="tl-meta">점검자 ${esc(r.inspector)} · 운전 ${esc(r.operation_state)} · 소음 ${esc(r.noise)} / 진동 ${esc(r.vibration)} / 발열 ${esc(r.heat)}${r.visual?.length ? ` · 육안 ${esc([].concat(r.visual).join(', '))}` : ''}</div>`,
    })),
    ...h.reviews.map(r => ({
      date: r.registered_at,
      html: `<div class="tl-title">정비 검토 · ${esc(r.necessity)} <span class="badge plain neutral">${esc(r.review_status)}</span>${r.source === 'app' ? '<span class="tag-new">NEW</span>' : ''}</div>
        <div class="tl-body">${esc(r.target)} — ${esc(r.content)}</div>
        <div class="tl-meta">작업 우선도 ${esc(r.priority)} · 희망일 ${esc(r.desired_date || '-')} · 예상 ${esc(r.estimated_hours || '-')}시간</div>`,
    })),
    ...h.work.map(r => ({
      date: r.work_date,
      html: `<div class="tl-title">정비 작업 · ${esc(r.work_type)} ${r.repeat_anomaly === 'Y' ? '<span class="badge plain gold">반복 이상</span>' : ''}</div>
        <div class="tl-body">${esc(r.anomaly)} → ${esc(r.action)}</div>
        <div class="tl-meta">결과 ${esc(r.result)} · ${esc(r.worker)} · 정지 ${esc(r.downtime_h)}시간</div>`,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pending = h.followUps.filter(x => x.status === '예정');
  const anomalies = h.work.filter(w => w.anomaly && w.anomaly !== '-').length;
  $('#dHistory').innerHTML = `
    <div class="info-row" style="margin-bottom:12px">
      <span class="chip">이상 조치 이력 <b>${anomalies}건</b></span><span class="chip">점검 기록 <b>${h.inspections.length}건</b></span>
      ${h.work.some(w => w.repeat_anomaly === 'Y') ? '<span class="badge plain gold">반복 이상 발생 이력 있음</span>' : ''}
    </div>
    ${pending.map(p => `<div class="alert-line${p.due_date < today ? ' red' : ''}">${ICON.clock}
      후속 ${esc(p.type)} ${p.due_date < today ? '기한 지남' : '예정'} · ${esc(p.due_date)} · ${esc(p.items)} (${esc(p.assignee)})</div>`).join('')}
    ${items.length ? `<ul class="timeline">${items.map(it => `<li><div class="date">${esc(fmtDate(it.date))}</div><div>${it.html}</div></li>`).join('')}</ul>`
      : '<div class="muted">등록된 점검·정비 이력이 없습니다.</div>'}`;
}

/* =========================================================
   화면 3 — 점검·정비 작성
   ========================================================= */
let form = { id: null, savedInspection: null, savedReview: null };
const OPTS = {
  operation_state: ['정상 운전', '이상 징후 있음', '운전 중지 상태', '확인 불가'],
  noise: ['이상 없음', '평소보다 증가', '이상 소음 확인', '확인 불가'],
  vibration: ['이상 없음', '평소보다 증가', '이상 진동 체감', '확인 불가'],
  heat: ['이상 없음', '온도 상승 확인', '심한 발열 확인', '확인 불가'],
  visual: ['누유', '풀림', '균열', '변형', '오염', '기타'],
  need_additional: ['필요 없음', '추가 점검 필요'],
  necessity: ['정비 필요', '추가 확인 후 결정', '현재 정비 불필요'],
  target: ['베어링', '축', '커플링', '윤활 계통', '팬 임펠러', '기타'],
  priority: ['일반', '우선 검토', '빠른 확인 필요'],
  est_hours: ['2', '4', '8', '직접 입력'],
};
const DECISIONS = [
  ['계속 관찰', '현재 상태를 기록하고 이후 진동 변화를 계속 관찰합니다.'],
  ['추가 점검', '설비에 대한 추가 점검이 필요합니다.'],
  ['정비 검토', '점검 결과를 바탕으로 정비 필요 여부와 일정을 검토합니다.'],
];
const radios = (name, list, label = v => v) => `<div class="opts" role="radiogroup">${list.map(v =>
  `<label class="opt"><input type="radio" name="${name}" value="${esc(v)}"><span>${esc(label(v))}</span></label>`).join('')}</div>`;
const checks = (name, list) => `<div class="opts">${list.map(v =>
  `<label class="opt"><input type="checkbox" name="${name}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('')}</div>`;
const field = (name, label, inner, { req = false, full = false, help = '' } = {}) => `
  <div class="field${full ? ' full' : ''}" data-field="${name}">
    <div class="flabel">${label}${req ? '<span class="req">*</span>' : ''}</div>
    ${inner}${help ? `<div class="help">${help}</div>` : ''}<div class="err" hidden></div>
  </div>`;

function renderInspect() {
  if (auth.experience || currentUser()?.role === 'visitor') { location.replace('#/notifications'); return; }
  const f = fanById(ui.id), eq = f.eq;
  const supervisor = currentUser()?.role === 'supervisor';
  setHeader({ title: '점검·정비 작성', back: `#/equipment/${eq.equipment_id}` });
  form = { id: eq.equipment_id, savedInspection: null, savedReview: null, submitting: false, requestPayload: null, requestFingerprint: '', confirmedSchedule: null };
  $('#view').innerHTML = `
    <div class="form-wrap inspection-report-wrap">
      <div id="donePanel"></div>
      <form id="inspForm" class="card inspection-report" aria-labelledby="reportTitle" novalidate autocomplete="off">
        <div class="report-heading">
          <div><h2 id="reportTitle">현장 점검·정비 보고서</h2><p>설비 상태와 현장에서 확인한 내용을 기록해 주세요.</p></div>
          <div class="report-author">${field('inspector', '작성자', `<input type="text" name="inspector" readonly value="${esc(currentUser()?.name || '')}" title="선택한 담당자 이름으로 서버에 기록됩니다.">`)}</div>
        </div>
        <fieldset id="fsInspect">
          <div class="report-row report-identity-row">
            <div class="report-equipment"><div class="report-label">설비명</div><div id="formHead" class="report-equipment-summary"></div></div>
            ${field('inspected_at', '점검 일시', '<input type="datetime-local" name="inspected_at">', { req: true })}
          </div>
          <div class="report-row report-operation-row">
            ${field('operation_state', '운전 상태', radios('operation_state', OPTS.operation_state), { req: true })}
            ${field('need_additional', '추가 점검 여부', radios('need_additional', OPTS.need_additional), { req: true })}
          </div>
          <div class="report-body">
            <div class="report-observations">
              ${field('noise', '소음', radios('noise', OPTS.noise), { req: true })}
              ${field('vibration', '진동', radios('vibration', OPTS.vibration), { req: true })}
              ${field('heat', '발열', radios('heat', OPTS.heat), { req: true })}
              ${field('visual', '육안 상태', `${checks('visual', OPTS.visual)}<input type="text" name="visual_etc" aria-label="기타 육안 상태" placeholder="기타 내용을 입력하세요" hidden>`, { help: '해당 사항이 없으면 선택하지 않아도 됩니다.' })}
            </div>
            <div class="report-memo">${field('memo', '점검 메모', '<textarea name="memo" placeholder="현장에서 확인한 내용을 작성해 주세요."></textarea>')}</div>
          </div>
          <section class="report-followup" aria-label="점검 후 대응">
            ${field('decision', '점검 후 대응', radios('decision', DECISIONS.map(([value]) => value)), { req: true })}
          </section>
        </fieldset>
        <footer class="report-footer">
          <p class="report-declaration">위 내용과 같이 보고서를 제출합니다.</p>
          <p class="report-submit-help">${supervisor ? '설비 팀장은 제출 단계에서 일정을 지정하면 승인과 등록이 함께 완료됩니다.' : '보고서를 제출하면 설비 팀장이 승인할 때 일정의 날짜·담당자·내용을 지정합니다.'}</p>
          <div class="report-actions">
            <button class="btn" type="button" id="btnDraft">임시 저장</button>
            <button class="btn primary" type="button" id="btnComplete">${supervisor ? '점검 제출' : '점검 제출 · 승인 요청'}</button>
          </div>
          <p id="draftInfo" role="status"></p>
        </footer>
      </form>
      ${supervisor ? `<dialog id="reportScheduleDialog" class="report-schedule-dialog" aria-labelledby="reportScheduleTitle" aria-describedby="reportScheduleHelp">
        <form id="reportScheduleForm" novalidate>
          <h2 id="reportScheduleTitle">후속 일정 확인</h2>
          <p id="reportScheduleHelp">이 보고서는 제출과 함께 승인됩니다. 캘린더에 등록할 일정을 지정해 주세요.</p>
          <div class="report-schedule-fields">
            <label>일정 구분<select name="type" required>${['정기 점검', '재확인', '추가 점검', '정비'].map(type => `<option>${type}</option>`).join('')}</select></label>
            <label>일정 예정일<input name="due_date" type="date" required></label>
            <label class="report-schedule-wide">담당자<input name="assignee" maxlength="100" required></label>
            <label class="report-schedule-wide">일정 내용<textarea name="items" maxlength="4000" required></textarea></label>
          </div>
          <p id="reportScheduleError" class="report-schedule-error" role="alert" hidden></p>
          <div class="report-schedule-actions"><button class="btn" id="reportScheduleCancel" type="button">돌아가기</button><button class="btn primary" type="submit">제출 · 승인 및 일정 등록</button></div>
        </form>
      </dialog>` : ''}
    </div>`;
  const fm = $('#inspForm');
  const draft = store.draft.get(eq.equipment_id);
  if (draft?.requestPayload?.submission_kind === 'report') { form.requestPayload = draft.requestPayload; form.requestFingerprint = draft.requestFingerprint || ''; form.confirmedSchedule = draft.requestPayload.schedule || null; }
  setFormValues(fm, draft ? draft.values : { inspected_at: toLocalInput(simNow()) });
  // [LOGIN CHANGE] 초안을 복원해도 점검자는 현재 로그인 계정으로 다시 고정.
  fm.elements.inspector.value = currentUser()?.name || '';
  if (draft) $('#draftInfo').textContent = `임시 저장본을 불러왔습니다 (${draft.savedAt})`;
  fm.addEventListener('input', e => { clearErr(e.target.name); syncForm(); });
  fm.addEventListener('change', e => { clearErr(e.target.name); syncForm(); });
  $('#btnDraft').addEventListener('click', saveDraft);
  $('#btnComplete').addEventListener('click', completeInspection);
  // Preserve the existing field names for drafts and API validation while naming every control.
  $$('.field', fm).forEach(fld => {
    const label = $('.flabel', fld);
    if (!label) return;
    label.id = `report-label-${fld.dataset.field}`;
    $$('input:not([type="radio"]):not([type="checkbox"]),textarea,select,[role="radiogroup"]', fld).forEach(control => {
      if (!control.hasAttribute('aria-label')) control.setAttribute('aria-labelledby', label.id);
    });
  });
  updateFormHead();
  syncForm();
}

function updateFormHead() {
  const f = fanById(ui.id);
  if (!f || !$('#formHead')) return;
  const eq = f.eq;
  $('#formHead').innerHTML = `
    <div class="report-equipment-name"><strong>${esc(eq.equipment_name)}</strong></div>
    <span class="report-equipment-tag">${esc(eq.tag)}</span><span class="report-equipment-location">${esc(eq.location)}</span>`;
}

function getValues(fm) {
  // 저장 후 잠근(disabled) 영역의 값도 읽을 수 있도록 잠시 풀었다가 되돌린다
  const locked = $$('fieldset', fm).filter(x => x.disabled);
  locked.forEach(x => { x.disabled = false; });
  const fd = new FormData(fm);
  locked.forEach(x => { x.disabled = true; });
  const v = {};
  for (const [k, val] of fd.entries()) {
    if (k === 'visual') (v.visual ||= []).push(val);
    else v[k] = typeof val === 'string' ? val.trim() : val;
  }
  v.visual ||= [];
  return v;
}
function setFormValues(fm, values) {
  for (const [k, val] of Object.entries(values || {})) {
    for (const el of $$(`[name="${k}"]`, fm)) {
      if (el.type === 'radio') el.checked = el.value === val;
      else if (el.type === 'checkbox') el.checked = [].concat(val).includes(el.value);
      else el.value = val;
    }
  }
}
function syncForm() {
  const fm = $('#inspForm');
  if (!fm) return;
  const v = getValues(fm);
  $('[name="visual_etc"]', fm).hidden = !v.visual.includes('기타');
  $('#btnComplete').disabled = form.submitting || !!form.savedInspection;
  $('#btnDraft').disabled = form.submitting || !!form.savedInspection;
}
function clearErr(name) {
  const fld = name && $(`[data-field="${name === 'est_hours_custom' ? 'est_hours' : name}"]`);
  if (!fld) return;
  fld.classList.remove('invalid');
  const e = $('.err', fld); if (e) e.hidden = true;
}
function setErr(name, msg) {
  const fld = $(`[data-field="${name}"]`);
  if (!fld) return;
  fld.classList.add('invalid');
  const e = $('.err', fld); e.textContent = msg; e.hidden = false;
}
function validate(v) {
  const errs = [];
  const need = (key, message) => { if (!v[key]) errs.push([key, message]); };
  need('inspected_at', '점검 일시를 입력하세요.');
  need('inspector', '점검자를 입력하세요.');
  for (const [key, label] of [['operation_state', '설비 운전 상태'], ['noise', '소음 상태'], ['vibration', '진동 상태'], ['heat', '발열 상태'], ['need_additional', '추가 점검 필요 여부']]) {
    if (!OPTS[key].includes(v[key])) errs.push([key, `${label}를 선택하세요.`]);
  }
  if (!DECISIONS.some(([value]) => value === v.decision)) errs.push(['decision', '대응 결정을 선택하세요.']);
  if ((v.visual || []).includes('기타') && !v.visual_etc) errs.push(['visual', '기타 육안 상태 내용을 입력하세요.']);
  return errs;
}
const reportScheduleType = decision => ({ '계속 관찰': '재확인', '추가 점검': '추가 점검', '정비 검토': '정비' }[decision]);
const reportFingerprint = (values, schedule) => JSON.stringify({ submission_kind: 'report', values, schedule: schedule || null });
function validateReportSchedule(schedule, inspectedAt) {
  if (!['정기 점검', '재확인', '추가 점검', '정비'].includes(schedule.type)) return ['type', '일정 구분을 선택해 주세요.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.due_date || '')) return ['due_date', '일정 예정일을 지정해 주세요.'];
  const parsed = new Date(`${schedule.due_date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime()) || ymd(parsed) !== schedule.due_date) return ['due_date', '올바른 일정 예정일을 지정해 주세요.'];
  if (inspectedAt && schedule.due_date < inspectedAt.slice(0, 10)) return ['due_date', '일정 예정일은 점검일과 같거나 이후로 선택해 주세요.'];
  if (!String(schedule.assignee || '').trim()) return ['assignee', '일정 담당자를 입력해 주세요.'];
  if (!String(schedule.items || '').trim()) return ['items', '일정 내용을 입력해 주세요.'];
  return null;
}
function confirmReportSchedule(values, submittedForm, source, owner) {
  const dialog = $('#reportScheduleDialog'), scheduleForm = $('#reportScheduleForm');
  const prior = submittedForm.confirmedSchedule;
  setFormValues(scheduleForm, prior || { type: reportScheduleType(values.decision), due_date: '', assignee: values.inspector, items: values.memo || `현장 점검 · ${values.decision}` });
  scheduleForm.elements.due_date.min = values.inspected_at.slice(0, 10);
  const error = $('#reportScheduleError'); error.hidden = true;
  return new Promise(resolve => {
    let finished = false;
    const finish = schedule => {
      if (finished) return;
      finished = true;
      window.removeEventListener('hashchange', cancel);
      scheduleForm.onsubmit = null; dialog.oncancel = null; dialog.onclose = null;
      if (dialog.open) dialog.close();
      resolve(schedule);
    };
    const cancel = () => finish(null);
    $('#reportScheduleCancel').onclick = cancel;
    dialog.oncancel = event => { event.preventDefault(); cancel(); };
    dialog.onclose = cancel;
    window.addEventListener('hashchange', cancel, { once: true });
    scheduleForm.onsubmit = event => {
      event.preventDefault();
      if (!source.isConnected || form !== submittedForm || currentUser()?.id !== owner) return cancel();
      const fields = getValues(scheduleForm);
      const schedule = { equipment_id: submittedForm.id, type: fields.type, due_date: fields.due_date, assignee: fields.assignee, items: fields.items };
      const invalid = validateReportSchedule(schedule, values.inspected_at);
      if (invalid) { error.textContent = invalid[1]; error.hidden = false; scheduleForm.elements[invalid[0]].focus(); return; }
      finish(schedule);
    };
    dialog.showModal();
    scheduleForm.elements.due_date.focus();
  });
}

function showErrors(errs) {
  errs.forEach(([k, m]) => setErr(k, m));
  $(`[data-field="${errs[0][0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('필수 항목을 확인해 주세요.');
}
function saveDraft() {
  const v = getValues($('#inspForm'));
  const savedAt = ymdhm(new Date());
  store.draft.set(form.id, { values: v, savedAt, ...(form.requestFingerprint === reportFingerprint(v, form.confirmedSchedule) ? { requestPayload: form.requestPayload, requestFingerprint: form.requestFingerprint } : {}) });
  $('#draftInfo').textContent = `임시 저장됨 · ${savedAt}`;
  toast('작성 중인 내용을 임시 저장했습니다.');
}
function buildInspection(v) {
  const f = fanById(form.id), now = new Date();
  return {
    inspection_id: `INS-${idStamp(now)}`, equipment_id: form.id, inspected_at: v.inspected_at,
    inspector: v.inspector, operation_state: v.operation_state, noise: v.noise, noise_memo: '',
    vibration: v.vibration, heat: v.heat, visual: v.visual, visual_etc: v.visual.includes('기타') ? v.visual_etc : '',
    need_additional: v.need_additional, memo: v.memo || '', model_status: f.snap.status, decision: v.decision,
    recheck_date: '', additional_items: '', additional_assignee: '', additional_due: '',
    created_at: toLocalInput(now),
  };
}
async function completeInspection() {
  await submitInspectionRequest();
}
async function submitInspectionRequest() {
  if (auth.experience || currentUser()?.role === 'visitor' || form.submitting || form.savedInspection) return;
  const source = $('#inspForm');
  if (!source) return;
  const submittedForm = form, owner = currentUser()?.id;
  const supervisor = currentUser()?.role === 'supervisor';
  const values = getValues(source), errs = validate(values);
  if (errs.length) return showErrors(errs);
  submittedForm.submitting = true;
  syncForm(); $('#fsInspect').disabled = true;
  const active = () => source.isConnected && form === submittedForm && currentUser()?.id === owner;
  try {
    const schedule = supervisor ? await confirmReportSchedule(values, submittedForm, source, owner) : null;
    if ((supervisor && !schedule) || !active()) return;
    submittedForm.confirmedSchedule = schedule;
    const fingerprint = reportFingerprint(values, schedule);
    // Reuse the exact request/key after uncertain network results and restored drafts.
    if (submittedForm.requestPayload?.submission_kind !== 'report' || submittedForm.requestFingerprint !== fingerprint) {
      submittedForm.requestPayload = { request_key: requestKey(), submission_kind: 'report', inspection: buildInspection(values), ...(schedule ? { schedule } : {}) };
      submittedForm.requestFingerprint = fingerprint;
    }
    store.draft.set(submittedForm.id, { values, savedAt: ymdhm(new Date()), requestPayload: submittedForm.requestPayload, requestFingerprint: fingerprint });
    const result = await store.submitApproval(submittedForm.requestPayload);
    if (currentUser()?.id !== owner) return;
    store.draft.clear(submittedForm.id);
    void updateApprovalBadge(true);
    if (!active()) return;
    const status = result.request?.status || 'pending';
    submittedForm.savedInspection = result.records?.inspections?.[0] || { ...submittedForm.requestPayload.inspection, approval_status: status };
    submittedForm.savedReview = null;
    $('#draftInfo').textContent = '';
    showDone(status === 'approved' ? ['점검 보고서가 승인되고 지정한 일정이 캘린더에 등록되었습니다.']
      : status === 'rejected' ? ['이 요청은 반려되었습니다. 승인 요청 화면에서 검토 의견을 확인해 주세요.']
      : ['점검 보고서를 제출하고 설비 팀장에게 승인 요청했습니다.', '설비 팀장이 승인할 때 날짜·담당자·내용을 지정하면 캘린더에 등록됩니다.'], status);
  } catch (error) {
    if (active()) toast(error.message || '요청하지 못했습니다. 같은 내용으로 다시 시도해 주세요.');
  } finally {
    submittedForm.submitting = false;
    if (active()) { $('#fsInspect').disabled = !!submittedForm.savedInspection; syncForm(); }
  }
}

function showDone(msgs, status) {
  const already = $$('#donePanel .msg').map(m => m.textContent.trim());
  const all = [...new Set([...already, ...msgs])];
  $('#donePanel').innerHTML = `
    <div class="done-panel">
      ${all.map(m => `<div class="msg">${ICON.check}${m}</div>`).join('')}
      <div class="actions">
        <a class="btn primary" href="${status === 'approved' ? '#/calendar' : '#/approvals'}">${status === 'approved' ? '캘린더 확인' : '승인 요청 확인'}</a>
        <a class="btn" href="#/equipment/${form.id}">설비 상세로 돌아가기</a>
        <a class="btn" href="#/">설비 현황으로 돌아가기</a>
      </div>
    </div>`;
  $('.main-wrap').scrollTo({ top: 0, behavior: 'smooth' });
  toast(msgs[msgs.length - 1]);
}

/* =========================================================
   경보 — 설비별 경보·이상 징후 이벤트
   ========================================================= */
function renderAlarms() {
  setHeader({ title: '경보 발생 이력' });
  const all = fans.flatMap(f => fanEvents(f)).filter(e => ui.alarmFilter === 'all' || e.type === ui.alarmFilter)
    .sort((a, b) => timeOf(b.f, b.i) - timeOf(a.f, a.i)).slice(0, 80);
  const live = fans.filter(f => f.snap.status === '경보').length;
  $('#view').innerHTML = `
    <div class="page"><div class="scope-label">조회 범위 · <b>${esc(currentUser()?.scope || '전체 제철소')}</b></div>
      <div class="page-head">
        <div class="counts">
          <div class="count k-경보"><span>현재 경보</span><b>${live}</b></div>
          <div class="count k-주의"><span>현재 주의</span><b>${fans.filter(f => f.snap.status === '주의').length}</b></div>
        </div>
        <div class="seg" role="group" aria-label="구분">
          <button type="button" data-afilter="all" aria-pressed="${ui.alarmFilter === 'all'}">전체</button>
          <button type="button" data-afilter="경보" aria-pressed="${ui.alarmFilter === '경보'}">경보 발생</button>
          <button type="button" data-afilter="주의" aria-pressed="${ui.alarmFilter === '주의'}">이상 징후 감지</button>
        </div>
      </div>
      <section class="card table-card"><div class="tablewrap"><table class="list">
        <thead><tr><th>발생 시각</th><th>설비</th><th>위치</th><th>구분</th><th>내용</th><th>근거</th></tr></thead>
        <tbody>${all.length ? all.map(e => {
          const t = eventText(e);
          return `<tr class="row-link" tabindex="0" data-go="${e.f.eq.equipment_id}">
            <td class="nw time">${ymdhm(timeOf(e.f, e.i))}</td><td class="nw"><b>${esc(e.f.eq.equipment_name)}</b></td>
            <td class="nw">${esc(e.f.eq.location)}</td><td>${badge(e.type)}</td><td class="nw"><b>${t.title}</b></td>
            <td>${esc(t.note)}</td></tr>`;
        }).join('') : '<tr><td colspan="6" class="muted">표시할 이력이 없습니다.</td></tr>'}</tbody>
      </table></div></section>
      <p class="hint" style="margin-top:10px">최근 80건까지 표시합니다. 이상 징후 감지 = 기준을 넘었지만 경보 조건(같은 방향 2개 특징 4회 연속)은 충족하지 않은 시작 시점.</p>
    </div>`;
}

/* =========================================================
   점검·정비 — 정비 일정 검토 / 이력
   ========================================================= */
const nameOf = id => fanById(id)?.eq.equipment_name || id;
// [UI UPDATE 2026-10-22] 화면별 공정 범위. 경보/MyPage는 공정 필터를 상속하지 않음.
const recordProcess = () => ui.view === 'calendar' ? ui.calendarProcess : ui.maintenanceProcess;
const scopedFans = () => fans.filter(f => inScope(f, recordProcess()));
const matchesRecord = id => {
  const f = fanById(id);
  return Boolean(f && inScope(f, recordProcess()) && (ui.eqFilter === 'all' || id === ui.eqFilter));
};
const processTabs = selected => `<div class="process-toolbar"><div class="process-tabs" role="group" aria-label="공정 선택">
  ${(auth.experience ? [{ key: 'all', name: '전체 공정' }, ...PROCESSES.filter(p => ['sinter', 'steel'].includes(p.key))] : currentUser()?.process ? PROCESSES.filter(p => p.key === currentUser().process) : [{ key: 'all', name: '전체 제철소' }, ...PROCESSES]).map(p => `<button type="button" data-process="${p.key}" aria-pressed="${selected === p.key}">${p.name}</button>`).join('')}
</div></div>`;
const eqSelect = () => `<label class="hint">설비 <select class="sel" id="eqFilter">
  <option value="all">전체 설비</option>
  ${scopedFans().map(f => `<option value="${f.eq.equipment_id}"${ui.eqFilter === f.eq.equipment_id ? ' selected' : ''}>${esc(f.eq.equipment_name)}</option>`).join('')}
</select></label>`;
const flt = rows => rows.filter(r => matchesRecord(r.equipment_id));
const tableHTML = (t, today) => `
  <div class="tablewrap"><table class="list">
    <thead><tr>${t.head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.length ? t.rows.map(r => `<tr class="row-link" tabindex="0" ${!auth.experience && t.reportKind ? `role="link" data-report-url="${esc(reportLink(t.reportKind, r[t.reportKey]))}" aria-label="${esc(nameOf(r.equipment_id))} 보고서 보기"` : `data-go="${r.equipment_id}"`}>${t.cells(r, today).map(c => {
      const str = String(c ?? ''), html = str.startsWith('<span');
      return `<td class="${str.length > 18 && !html ? 'wrap' : 'nw'}">${html ? str : esc(str)}</td>`;
    }).join('')}</tr>`).join('') : `<tr><td colspan="${t.head.length}" class="muted">기록이 없습니다.</td></tr>`}</tbody>
  </table></div>`;

// [UI UPDATE 2026-10-22] 다가오는 일정 아래에 기존 이력 화면의 두 탭을 통합.
function renderMaintenance() {
  setHeader({ title: auth.experience ? '점검·정비 이력' : '점검·정비 보고서' });
  const db = store.db, today = ymd(simNow());
  // Confirmed calendar schedules only; history and overdue work remain in their existing views.
  const upcoming = db.follow_ups
    .filter(x => x.status === '예정' && calendarApproved(x) && x.due_date >= today && matchesRecord(x.equipment_id))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.follow_up_id || '').localeCompare(String(b.follow_up_id || '')))
    .slice(0, 3)
    .map(x => ({ id:x.follow_up_id, date: x.due_date, eq: x.equipment_id, title: `후속 ${x.type}`, body: `${x.items} · ${x.assignee}${completionLabel(x) ? ` · ${completionLabel(x)}` : ''}` }));
  $('#view').innerHTML = `
    <div class="page maintenance-page">
      <div class="record-toolbar maintenance-toolbar" role="group" aria-label="점검·정비 보고서 공정·설비 필터">
        ${processTabs(ui.maintenanceProcess)}
        <div class="record-equipment-filter">${eqSelect()}</div>
        <a class="btn sm record-toolbar-action" href="${ui.maintenanceProcess === 'all' ? '#/equipment' : `#/process/${ui.maintenanceProcess}/equipment`}">${ICON.pen}점검 작성할 설비 선택</a>
      </div>
      <div class="section-head" style="margin-top:0"><h2>다가오는 일정</h2><span class="hint">오늘 이후 예정된 일정 · 빠른 순 최대 3건</span></div>
      ${upcoming.length ? `<div class="upcoming">${upcoming.map(u => `
        <a class="card up" href="${auth.experience ? `#/equipment/${u.eq}` : reportLink('followup',u.id)}">
          <div class="d">${esc(u.date)}</div>
          <b>${esc(nameOf(u.eq))} · ${esc(u.title)}</b><span>${esc(u.body)}</span></a>`).join('')}</div>`
        : '<div class="empty">선택한 공정·설비에 오늘 이후 예정된 일정이 없습니다.</div>'}
      <div class="section-head"><h2>${auth.experience ? '점검·정비 기록' : '보고서'}</h2><a class="btn sm" href="/api/export.xlsx?process=${encodeURIComponent(ui.maintenanceProcess)}&equipment=${encodeURIComponent(ui.eqFilter)}">엑셀파일로 내보내기</a></div>
      ${historyHTML()}
    </div>`;
}

function renderReportPreview() {
  const back = ui.reportFrom === 'calendar' ? '#/calendar' : '#/maintenance';
  setHeader({ title:'점검·정비 보고서', back });
  const model = resolveReport(store.db, ui.reportKind, ui.reportId);
  const equipment = model && fanById(model.record.equipment_id)?.eq;
  if (!model || !equipment) {
    $('#view').innerHTML = `<div class="page"><section class="card rp-unavailable"><h2>보고서를 찾을 수 없습니다.</h2><p>담당 공정의 기록인지 확인해 주세요.</p><a class="btn" href="${back}">목록으로 돌아가기</a></section></div>`;
    return;
  }
  $('#view').innerHTML = `<div class="report-preview-page">${reportSummary(model,equipment)}${renderReport(model,equipment)}</div>`;
}

function historyHTML() {
  const db = store.db, today = ymd(simNow());
  const tabs = {
    inspections: { label: '점검 기록', reportKind:'inspection', reportKey:'inspection_id', rows: flt(db.inspections).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at)),
      head: ['점검 일시', '설비', '점검자', '당시 상태', '운전 상태', '소음/진동/발열', '대응 결정', '일정 승인', '메모'],
      cells: r => [fmtDate(r.inspected_at), nameOf(r.equipment_id), r.inspector, r.model_status ? badge(r.model_status) : '-', r.operation_state,
        `${r.noise} / ${r.vibration} / ${r.heat}`, r.decision, approvalLabel(r.approval_status), r.memo] },
    work: { label: auth.experience ? '정비 작업 이력' : '정비 작업 기록', reportKind:'work', reportKey:'work_id', rows: flt(db.work_history).sort((a, b) => b.work_date.localeCompare(a.work_date)),
      head: ['작업일', '설비', '작업 구분', '이상 내용', '조치', '결과', '반복 이상', '작업자'],
      cells: r => [r.work_date, nameOf(r.equipment_id), r.work_type, r.anomaly, r.action, r.result,
        r.repeat_anomaly === 'Y' ? '<span class="badge plain gold">반복</span>' : '-', r.worker] },
  };
  const cur = tabs[ui.histTab] ? ui.histTab : 'inspections';
  return `
      <section class="card table-card">
        <div class="table-tools"><div class="seg" role="group" aria-label="기록 유형">
          ${Object.entries(tabs).map(([k, x]) => `<button type="button" data-htab="${k}" aria-pressed="${k === cur}">${x.label} ${x.rows.length}</button>`).join('')}
        </div></div>
        ${tableHTML(tabs[cur], today)}
      </section>
      <div class="files">
        저장 위치: ${store.mode === 'mysql'
          ? '<b>서버 DB (MySQL)</b> — 점검·정비·일정을 함께 보관합니다. 다른 사용자의 새 기록은 새로고침하면 표시됩니다.'
          : store.mode === 'server'
          ? '<b>서버 DB</b> — <code>data/maintenance_db.json</code> 및 <code>data/maintenance_*.csv</code>에 바로 기록됩니다.'
          : '<b>브라우저 저장</b> — <code>python3 server.py</code>로 실행하면 DB 파일에 기록됩니다.'}
        ${store.mode === 'mysql' ? '' : '· 설비 DB: <code>data/equipment_db.json</code> / <code>.csv</code>'}
      </div>`;
}

/* =========================================================
   캘린더 — 확정 일정과 점검·정비 이력. 요청 희망일은 승인 화면에서 확인.
   ========================================================= */
const cal = { y: null, m: null, sel: null, filters: { work: true, plan: true, completed: true, inspect: true } };
const completionActions = createCompletionActions({ store, getUser: () => currentUser(), requestKey });
function completionControl(record) {
  const status = completionStatus(record), pending = status === 'pending', rejected = status === 'rejected';
  const manager = currentUser()?.role === 'supervisor';
  const busy = completionActions.isBusy(record.follow_up_id);
  return `<div class="completion-controls">
    ${pending || rejected ? `<span class="completion-state completion-${status}">${completionLabel(record)}</span>` : ''}
    ${record.completion_approval_request_id && (pending || rejected) ? `<a class="link-btn" href="#/approvals?status=${pending ? 'pending' : 'rejected'}&request=${encodeURIComponent(record.completion_approval_request_id)}">요청 ${pending ? '보기' : '결과 보기'}</a>` : ''}
    ${pending ? '' : `<button class="link-btn" type="button" data-done="${esc(record.follow_up_id)}"${busy ? ' disabled' : ''}>${busy ? '처리 중…' : manager ? '완료 처리' : rejected ? '완료 승인 다시 요청' : '완료 승인 요청'}</button>`}
  </div>${!manager && !pending ? '<p class="completion-help">설비 팀장이 승인하면 완료로 표시됩니다.</p>' : ''}`;
}
const CAL_KIND = {
  work: { label: '정비 작업', hint: '과거 정비 작업 이력' },
  plan: { label: '점검 일정', hint: '예정된 정기 점검·재확인·추가 점검' },
  completed: { label: '점검 완료', hint: '완료 처리한 점검 일정' },
  inspect: { label: '현장 점검', hint: '현장 점검 결과 기록' },
};
function calEvents() {
  const db = store.db, today = ymd(simNow()), ev = [];
  db.work_history.forEach(r => ev.push({ report:reportLink('work',r.work_id,'calendar'), date: r.work_date, kind: 'work', eq: r.equipment_id, title: r.work_type,
    body: `${r.anomaly && r.anomaly !== '-' ? `${r.anomaly} → ` : ''}${r.action}`, meta: `${r.worker} · 결과 ${r.result}`, repeat: r.repeat_anomaly === 'Y' }));
  db.follow_ups.forEach(r => ev.push({ report:reportLink('followup',r.follow_up_id,'calendar'), date: r.due_date, kind: r.status === '완료' ? 'completed' : 'plan', eq: r.equipment_id, title: r.type, body: r.items,
    meta: `담당 ${r.assignee} · ${completionLabel(r) || (r.status === '예정' && r.due_date < today ? '기한 지남' : r.status)}${r.status === '완료' ? ' · 완료 처리: ' + (r.completed_by || '기존 기록 · 미기록') + (r.completed_at ? ' · ' + fmtDate(r.completed_at) : '') : ''}`,
    overdue: r.status === '예정' && r.due_date < today, done: r.status === '완료', ref: r }));
  // Requested dates remain in approval/review records; only approved follow-ups
  // become calendar schedules, so a request never looks like a confirmed date.
  db.inspections.filter(calendarApproved).forEach(r => ev.push({ report:reportLink('inspection',r.inspection_id,'calendar'), date: String(r.inspected_at).slice(0, 10), kind: 'inspect', eq: r.equipment_id,
    title: `현장 점검 · ${r.decision}`, body: r.memo || '메모 없음', meta: `점검자 ${r.inspector} · 당시 ${r.model_status || '-'}` }));
  return ev.filter(e => e.date && matchesRecord(e.eq));
}
function renderCalendar() {
  setHeader({ title: '정비 캘린더' });
  const directSchedule = currentUser()?.role === 'supervisor';
  const now = simNow(), today = ymd(now);
  if (cal.y == null) { cal.y = now.getFullYear(); cal.m = now.getMonth(); cal.sel = today; }
  const allEvents = calEvents();
  const ev = allEvents.filter(e => cal.filters[e.kind]);
  const by = {};
  ev.forEach(e => (by[e.date] ||= []).push(e));
  const first = new Date(cal.y, cal.m, 1);
  const start = new Date(cal.y, cal.m, 1 - first.getDay());
  const cells = [];
  for (let k = 0; k < 42; k++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + k));
  const monthEv = allEvents.filter(e => e.date.startsWith(`${cal.y}-${pad(cal.m + 1)}`));
  const kindCount = k => monthEv.filter(e => e.kind === k).length;
  const chip = e => `<span ${auth.experience ? '' : `data-report-url="${esc(e.report)}"`} class="ev ev-${e.kind}${e.overdue ? ' overdue' : ''}${e.done ? ' done' : ''}" title="${esc(nameOf(e.eq))} · ${esc(e.title)}${e.kind === 'completed' ? ' · 점검 완료' : ''}">
    ${esc(nameOf(e.eq).replace('배기가스 팬 ', '팬 '))} ${esc(e.title)}${e.ref && completionStatus(e.ref) === 'pending' ? ' · 완료 승인 대기' : ''}</span>`;
  const selEv = (by[cal.sel] || []).sort((a, b) => a.kind.localeCompare(b.kind));
  const selD = new Date(`${cal.sel}T00:00`);

  $('#view').innerHTML = `
    <div class="page cal-page">
      <div class="record-toolbar cal-tools cal-toolbar" role="group" aria-label="캘린더 공정·설비·기록 필터">
        ${processTabs(ui.calendarProcess)}
        <div class="record-equipment-filter cal-equipment-filter">${eqSelect()}</div>
        <div class="filters cal-event-filters" role="group" aria-label="표시할 기록 종류">
          ${Object.entries(CAL_KIND).map(([k, v]) => `<label class="cal-filter ev-${k}" title="${v.hint}">
            <input type="checkbox" data-calf="${k}"${cal.filters[k] ? ' checked' : ''}><i></i>${v.label} <b>${kindCount(k)}</b></label>`).join('')}
        </div>
      </div>
      <div class="cal-layout">
        <section class="card cal-card" aria-label="${cal.y}년 ${cal.m + 1}월 달력">
          <div class="cal-head">
            <div class="cal-nav">
              <button class="icon-btn" type="button" data-cal="prev" aria-label="이전 달">${ICON.prev}</button>
              <h2>${cal.y}년 ${cal.m + 1}월</h2>
              <button class="icon-btn" type="button" data-cal="next" aria-label="다음 달">${ICON.next}</button>
            </div>
            <button class="btn sm" type="button" data-cal="today">오늘</button>
          </div>
          <div class="cal-grid cal-dow">${DOW.map((d, i) => `<div class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('')}</div>
          <div class="cal-grid cal-days">${cells.map(d => {
            const key = ymd(d), list = by[key] || [];
            const out = d.getMonth() !== cal.m;
            return `<button type="button" class="cal-day${out ? ' out' : ''}${key === today ? ' today' : ''}${key === cal.sel ? ' sel' : ''}${d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : ''}" data-day="${key}">
              <span class="dn">${d.getDate()}</span>
              <span class="evs">${list.slice(0, 3).map(chip).join('')}${list.length > 3 ? `<span class="ev-more">+${list.length - 3}건</span>` : ''}</span>
            </button>`;
          }).join('')}</div>
        </section>
        <aside class="card cal-side">
          <div class="cs-head"><h3>${selD.getMonth() + 1}월 ${selD.getDate()}일 (${DOW[selD.getDay()]})</h3>${cal.sel === today ? '<span class="badge info plain">오늘</span>' : ''}</div>
          <div class="cs-list">${selEv.length ? selEv.map(e => `
            <div class="cs-item ev-${e.kind}${e.overdue ? ' overdue' : ''}" ${auth.experience ? '' : `data-report-url="${esc(e.report)}"`}>
              <div class="cs-top"><span class="ev-tag">${CAL_KIND[e.kind].label}</span>${e.overdue ? '<span class="badge plain st-경보">기한 지남</span>' : ''}${e.repeat ? '<span class="badge plain gold">반복 이상</span>' : ''}</div>
              <a href="${auth.experience ? `#/equipment/${e.eq}` : e.report}" class="cs-title">${esc(nameOf(e.eq))} · ${esc(e.title)}</a>
              <div class="cs-body">${esc(e.body)}</div>
              <div class="cs-meta">${esc(e.meta)}</div>
              ${e.kind === 'plan' && e.ref && e.ref.status === '예정' ? completionControl(e.ref) : ''}
            </div>`).join('') : '<div class="muted cs-empty">이 날짜에 등록된 점검·정비 일정이 없습니다.</div>'}</div>
          <form class="cs-form" id="calForm" autocomplete="off">
            <h4>이 날짜에 점검 일정 ${directSchedule ? '추가' : '승인 요청'}</h4>
            ${directSchedule ? '' : '<p class="hint">설비 팀장이 승인하면 캘린더에 등록됩니다.</p>'}
            <select name="equipment_id" class="sel" required aria-label="설비">${scopedFans().map(f => `<option value="${f.eq.equipment_id}"${ui.eqFilter === f.eq.equipment_id ? ' selected' : ''}>${esc(f.eq.equipment_name)} · ${esc(f.eq.plant)}</option>`).join('')}</select>
            <select name="type" class="sel" aria-label="구분"><option>정기 점검</option><option>재확인</option><option>추가 점검</option></select>
            <input name="assignee" type="text" placeholder="담당자 (예: 홍길동)" required aria-label="담당자">
            <input name="items" type="text" placeholder="점검 내용 (예: 베어링 윤활 상태 확인)" required aria-label="점검 내용">
            <button class="btn primary sm" type="submit"${scopedFans().length ? '' : ' disabled'}>${directSchedule ? '일정 추가' : '일정 승인 요청'}</button>
            ${scopedFans().length ? '' : '<p class="hint">이 공정에 등록된 기계설비가 없습니다.</p>'}
          </form>
        </aside>
      </div>
    </div>`;

  let calendarRequest = null, calendarFingerprint = '', calendarSaving = false;
  $('#calForm').addEventListener('input', event => { event.currentTarget.dataset.dirty = '1'; });
  $('#calForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (calendarSaving) return;
    const fd = Object.fromEntries(new FormData(e.target).entries());
    if (!fd.assignee.trim() || !fd.items.trim()) return toast('담당자와 점검 내용을 입력해 주세요.');
    const nowR = new Date();
    const rec = { follow_up_id: `FU-CAL-${idStamp(nowR)}`, equipment_id: fd.equipment_id, inspection_id: '', type: fd.type,
      due_date: cal.sel, assignee: fd.assignee.trim(), items: fd.items.trim(), status: '예정', created_at: toLocalInput(nowR) };
    // [UI UPDATE 2026-10-22] 중복 제출 방지. 저장 중 다른 화면으로 이동해도 덮어쓰지 않음.
    const submit = e.target.querySelector('[type="submit"]');
    const source = e.target;
    calendarSaving = true;
    submit.disabled = true;
    const fingerprint = JSON.stringify({ ...fd, due_date: cal.sel });
    if (!calendarRequest || calendarFingerprint !== fingerprint) {
      calendarRequest = { request_key: requestKey(), schedule: { equipment_id: rec.equipment_id, type: rec.type, due_date: rec.due_date, assignee: rec.assignee, items: rec.items } };
      calendarFingerprint = fingerprint;
    }
    try {
      if (directSchedule) await store.save({ follow_ups: [rec] });
      else await store.submitApproval(calendarRequest);
    } catch (error) { submit.disabled = false; calendarSaving = false; return toast(error.message || '요청하지 못했습니다. 다시 시도해 주세요.'); }
    if (ui.view === 'calendar' && source.isConnected) renderCalendar();
    if (!directSchedule) void updateApprovalBadge(true);
    toast(directSchedule ? '점검 일정이 추가되었습니다.' : '설비 팀장에게 일정 승인을 요청했습니다. 승인 후 캘린더에 표시됩니다.');
  });
}

/* ---------- 검색 ---------- */
function searchMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return fans.filter(f => [f.eq.equipment_name, f.eq.tag, f.eq.location, f.eq.process_name, f.eq.equipment_id]
    .some(x => String(x).toLowerCase().includes(q)));
}
function renderSearch() {
  const input = $('#searchInput'), pop = $('#searchPop');
  const res = searchMatches(input.value);
  if (!input.value.trim()) { pop.hidden = true; return; }
  pop.innerHTML = res.length ? res.map((f, i) => `<a href="#/equipment/${f.eq.equipment_id}" class="${i === 0 ? 'focus' : ''}">
      <span><b>${esc(f.eq.equipment_name)}</b><small>${esc(f.eq.tag)} · ${esc(f.eq.location)}</small></span>${badge(f.snap.status)}</a>`).join('')
    : '<div class="none">검색 결과가 없습니다.</div>';
  pop.hidden = false;
}

/* ---------- 이벤트 ---------- */
document.addEventListener('click', e => {
  const report = e.target.closest('[data-report-url]');
  if (report && !e.target.closest('a[href],button[data-done],.completion-controls')) {
    e.preventDefault();
    const day = report.closest('[data-day]');
    if (day) {
      cal.sel = day.dataset.day;
      const date = new Date(`${cal.sel}T00:00`);
      cal.y = date.getFullYear(); cal.m = date.getMonth();
    }
    location.hash = report.dataset.reportUrl; return;
  }
  const fold = e.target.closest('[data-dashboard-toggle]');
  if (fold) { const key = `overview-fold-${ui.process || 'home'}`; store.pref.set(key, !store.pref.get(key, false)); syncPanelFold(); return; }
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a[href]')) { location.hash = `#/equipment/${go.dataset.go}`; return; }
  const sort = e.target.closest('[data-sort]');
  if (sort) { ui.sort = sort.dataset.sort; store.pref.set('sort', ui.sort); ui.view === 'overview' ? updateOverview() : renderList(); return; }
  // [UI UPDATE 2026-10-22] 실제 등록 설비/기록에 공정 필터를 적용.
  const process = e.target.closest('[data-process]');
  if (process) {
    const key = process.dataset.process;
    if (!['all', ...PROCESSES.map(p => p.key)].includes(key)) return;
    if (ui.view === 'list') { location.hash = key === 'all' ? '#/equipment' : `#/process/${key}/equipment`; }
    else {
      ui.eqFilter = 'all';
      if (ui.view === 'calendar') { ui.calendarProcess = key; renderCalendar(); }
      else { ui.maintenanceProcess = key; renderMaintenance(); }
    }
    return;
  }
  const ft = e.target.closest('[data-feature]');
  if (ft) { ui.feature = ft.dataset.feature; ui.hover.index = null; updateDetail(); return; }
  const rg = e.target.closest('[data-range]');
  if (rg) { ui.range = rg.dataset.range; ui.hover.index = null; updateDetail(); return; }
  const af = e.target.closest('[data-afilter]');
  if (af) { ui.alarmFilter = af.dataset.afilter; renderAlarms(); return; }
  const ht = e.target.closest('[data-htab]');
  if (ht) { ui.histTab = ht.dataset.htab; renderMaintenance(); return; }
  const cn = e.target.closest('[data-cal]');
  if (cn) {
    const k = cn.dataset.cal;
    if (k === 'today') { const n = simNow(); cal.y = n.getFullYear(); cal.m = n.getMonth(); cal.sel = ymd(n); }
    else { const d = new Date(cal.y, cal.m + (k === 'next' ? 1 : -1), 1); cal.y = d.getFullYear(); cal.m = d.getMonth(); cal.sel = ymd(d); }
    renderCalendar(); return;
  }
  const dd = e.target.closest('[data-day]');
  if (dd) {
    cal.sel = dd.dataset.day;
    const d = new Date(`${cal.sel}T00:00`);
    if (d.getMonth() !== cal.m) { cal.y = d.getFullYear(); cal.m = d.getMonth(); }
    renderCalendar(); return;
  }
  const dn = e.target.closest('[data-done]');
  if (dn) {
    if (dn.disabled || completionActions.isBusy(dn.dataset.done)) return;
    const previous = dn.textContent, owner = currentUser()?.id;
    dn.disabled = true; dn.textContent = '처리 중…';
    // The server keeps a field manager's schedule pending until supervisor approval.
    completionActions.complete(dn.dataset.done).then(result => {
      if (result.stale) return;
      if (ui.view === 'calendar') renderCalendar();
      if (result.ignored) return;
      if (result.requested) void updateApprovalBadge(true);
      toast(result.requested ? completionResultMessage(result.result?.request) : '완료로 처리했습니다.');
    }).catch(async err => {
      if (currentUser()?.id !== owner) return;
      if (dn.isConnected) { dn.disabled = false; dn.textContent = previous; }
      if (err.status === 409) {
        await store.refreshMaintenance().catch(() => {});
        if (currentUser()?.id !== owner) return;
        if (ui.view === 'calendar' && !$('#calForm')?.dataset.dirty) renderCalendar();
      }
      toast(err.message || '요청하지 못했습니다. 다시 시도해 주세요.');
    });
    return;
  }
  const al = e.target.closest('[data-alarm]');
  if (al) { readAlarm(Number(al.dataset.alarm)); setAlarmOpen(false); al.closest('.atoast')?.remove(); }
  const notice = e.target.closest('[data-notice-id]');
  if (notice) {
    e.preventDefault();
    const destination = notice.getAttribute('href');
    void approvalInbox?.markRead([notice.dataset.noticeId]);
    setAlarmOpen(false);
    if (location.hash === destination) route(); else location.hash = destination;
    return;
  }
  const ct = e.target.closest('[data-close-toast]');
  if (ct) { ct.closest('.atoast')?.remove(); return; }
  // [V9.1 UI FIX 2026-10-22] 종 = 경보 목록 / 사람 = 마이페이지 ↔ 전체 제철소.
  if (e.target.closest('#alarmBtn')) { setExperienceUserOpen(false); setAlarmOpen($('#alarmPop').hidden); return; }
  if (e.target.closest('#userBtn')) {
    if (auth.experience) { setExperienceUserOpen($('#experienceUserPop').hidden); return; }
    setAlarmOpen(false); location.hash = userDestination(); return;
  }
  if (auth.experience && e.target.closest('#experienceHome')) {
    setExperienceUserOpen(false);
    sim.setSpeed(0);
    history.replaceState(null, '', '/experience/#/start');
    location.reload();
    return;
  }
  if (!e.target.closest('.user-menu')) setExperienceUserOpen(false);
  if (e.target.id === 'alarmReadAll') {
    const ids = (approvalInbox?.items || []).filter(n => !n.read).map(n => n.event_id || n.id);
    alarms.list.forEach(a => { a.read = true; });
    renderAlarmBadge(); renderToasts();
    if (ids.length) void approvalInbox.markRead(ids);
    return;
  }
  if (!e.target.closest('.alarm-menu')) setAlarmOpen(false);
  const sp = e.target.closest('[data-speed]');
  if (sp) {
    sim.setSpeed(Number(sp.dataset.speed));
    store.pref.set('speed', sim.speed);
    tick(); updateLive(); return;
  }
  if (!e.target.closest('#live')) { $('#livePop').hidden = true; $('#liveBtn').setAttribute('aria-expanded', 'false'); }
  if (!e.target.closest('.search')) $('#searchPop').hidden = true;
});
document.addEventListener('change', async e => {
  if (e.target.id === 'eqFilter') {
    ui.eqFilter = e.target.value;
    (ui.view === 'calendar' ? renderCalendar : renderMaintenance)();
  }
  if (e.target.matches('[data-calf]')) { cal.filters[e.target.dataset.calf] = e.target.checked; renderCalendar(); }
  if (e.target.id === 'alarmBrowser') {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') { e.target.checked = false; toast('브라우저 알림이 허용되지 않았습니다.'); }
    }
    alarms.browser = e.target.checked; store.pref.set('notify', alarms.browser);
  }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-report-url][tabindex]')) { e.preventDefault(); location.hash = e.target.dataset.reportUrl; return; }
  if (e.key === 'Escape' && auth.experience && $('#experienceUserPop') && !$('#experienceUserPop').hidden) {
    setExperienceUserOpen(false); $('#userBtn').focus(); return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-go][tabindex]')) { e.preventDefault(); location.hash = `#/equipment/${e.target.dataset.go}`; }
  if (e.key === 'Escape') { const wasOpen = !$('#alarmPop').hidden; setAlarmOpen(false); if (wasOpen) $('#alarmBtn').focus(); $('#livePop').hidden = true; $('#searchPop').hidden = true; appEl().classList.remove('sb-mobile-open'); }
});
$('#searchInput').addEventListener('input', renderSearch);
$('#searchInput').addEventListener('focus', renderSearch);
$('#searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = searchMatches(e.target.value)[0];
    if (first) { location.hash = `#/equipment/${first.eq.equipment_id}`; e.target.value = ''; $('#searchPop').hidden = true; e.target.blur(); }
  }
});
$('#searchPop').addEventListener('click', e => { if (e.target.closest('a')) { $('#searchInput').value = ''; $('#searchPop').hidden = true; } });
$('#liveBtn').addEventListener('click', () => {
  const pop = $('#livePop'); pop.hidden = !pop.hidden;
  $('#liveBtn').setAttribute('aria-expanded', String(!pop.hidden));
});
async function restartPlayback() {
  if (!auth.experience) {
    try {
      const round = await replayController?.reset();
      if (round) { sim.setSpeed(10); updateLive(); toast('새 재생 회차를 시작합니다. 최초 경보는 현재 계정의 이메일·휴대폰으로만 전달됩니다.'); }
    }
    catch (error) { toast(error.message || '재생 회차를 바꾸지 못했습니다. 다시 시도해 주세요.'); }
    return;
  }
  sim.reset(); sim.setSpeed(10); sim.elapsed = 0;
  $('#hdClock').textContent = clockText(simNow());
  fans.forEach(f => { f.snap = null; });
  alarms.list = []; renderAlarmBadge(); renderToasts();
  updateFans(); onDataTick();
  toast('처음 위치부터 다시 재생합니다.');
}
$('#simReset').addEventListener('click', restartPlayback);
document.addEventListener('gb-experience-reset', restartPlayback);
$('#themeToggle').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  // 테마 전환은 현재 페이지에서만 유지한다. 새 접속·새로고침은 다크로 시작한다.
  document.documentElement.dataset.theme = t;
  syncBrandIcons();
  if (ui.view === 'overview') { layoutMap(); updateOverview(); }
  if (ui.view === 'detail') updateDetail();
  $('#themeToggle').setAttribute('aria-label', t === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
});
$('#sbClose').addEventListener('click', () => {
  if (window.matchMedia('(max-width: 900px)').matches) appEl().classList.remove('sb-mobile-open');
  else setSidebar(true);
});
$('#sbOpen').addEventListener('click', () => setSidebar(false));
$('#hdMenu').addEventListener('click', () => { setAlarmOpen(false); $('#alarmToasts').replaceChildren(); appEl().classList.add('sb-mobile-open'); });
$('#scrim').addEventListener('click', () => appEl().classList.remove('sb-mobile-open'));
// [UI UPDATE 2026-10-22] 실제 헤더 높이를 기준으로 모바일 팝업/알림 위치 계산.
function syncHeaderBottom() {
  document.documentElement.style.setProperty('--header-bottom', `${Math.max(0, $('.header').getBoundingClientRect().bottom)}px`);
}
function setAlarmOpen(open) {
  $('#alarmPop').hidden = !open;
  $('#alarmBtn').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('alarm-open', open);
  if (open) { syncHeaderBottom(); $('#alarmToasts').replaceChildren(); renderAlarmPop(); void approvalInbox?.refresh(); }
}
if ('ResizeObserver' in window) new ResizeObserver(syncHeaderBottom).observe($('.header'));
let resizeTimer;
window.addEventListener('resize', () => {
  syncHeaderBottom();
  placeAlarmToasts();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ui.view === 'overview') { layoutMap(); syncPanelFold(); } if (ui.view === 'detail') updateDetail(); }, 100);
});

/* [LOGIN ADD START] 로그인/로그아웃/눈 버튼 UI. 가입·비밀번호 변경 화면은 제공하지 않음. */
const currentUser = () => auth.user;
let started = false;
// 감은 눈 = 가려짐, 뜬 눈 = 글자 표시. 각 입력란이 독립적으로 전환된다.
function passwordEye(visible) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${visible
    ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M3 9s3 6 9 6 9-6 9-6M5 12l-2 3m6-1-1 4m7-4 1 4m3-6 2 3"/>'}</svg>`;
}
function passwordField(id, name, label) {
  return `<label for="${id}">${label}</label><div class="password-field"><input id="${id}" name="${name}" type="password" autocomplete="current-password" maxlength="128" required><button type="button" class="password-toggle" data-password-toggle="${id}" data-password-label="${label}" aria-label="${label} 표시" title="${label} 표시" aria-controls="${id}" aria-pressed="false">${passwordEye(false)}</button></div>`;
}
function renderUserName() {
  $('#userName').textContent = currentUser()?.name || '관리자';
  renderAlarmBadge();
}
// [ROLE PICKER] Three server-owned demo profiles; no password form.
async function showStart(mode = 'selection', message = '') {
  approvalInbox?.stop(); approvalInbox?.reset();
  const el = $('#start');
  el.hidden=false; document.body.classList.add('on-start');
  if (auth.experience) {
    document.body.classList.add('personal-experience');
    return mountExperienceStart(el, {auth, esc, message});
  }
  el.innerHTML=`<div class="st-bg" aria-hidden="true"><img src="${HOME_MAP[theme()]}" alt=""></div><div class="role-panel"><p>관리자 목록을 불러오는 중입니다.</p></div>`;
  try {
    const {profiles} = await auth.request('/api/demo/profiles');
    const card = p => `<button class="role-card" data-profile="${p.id}" aria-label="${p.name} ${p.title} ${p.scope} 선택">
      <span class="role-avatar avatar-${p.avatar}"><img src="assets/brand/role-people.png" alt=""></span>
      <strong>${esc(p.name)}</strong><span class="role-title">${esc(p.title)}</span><span>${esc(p.scope)}</span></button>`;
    el.innerHTML=`<div class="st-bg" aria-hidden="true"><img src="${HOME_MAP[theme()]}" alt=""></div>
      <section class="role-panel"><img class="role-logo" src="assets/brand/wordmark-navy.png" alt="GB system">
        <h1>POSCO 포항제철소</h1><p class="role-lead">담당 관리자를 선택해 설비 현황을 확인하세요.</p>
        <div class="role-groups"><section class="role-chief"><h2>설비 팀장</h2><p>전체 제철소 · 통합 관리</p>${profiles.filter(p=>!p.process).map(card).join('')}</section>
        <section class="role-fields"><h2>현장관리자</h2><p>담당 공정 · 현장 점검</p><div class="role-field-cards">${profiles.filter(p=>p.process).map(card).join('')}</div></section></div>
        <p id="roleError" role="alert">${esc(message)}</p><p class="role-foot">발표용 역할 선택 · 선택한 관리자 이름으로 작성 이력이 기록됩니다.</p></section>`;
    el.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',async()=>{
      el.querySelectorAll('[data-profile]').forEach(b=>b.disabled=true);
      try { await auth.selectProfile(button.dataset.profile); history.replaceState(null,'',auth.user.home); location.reload(); }
      catch(error) { $('#roleError').textContent=error.message; el.querySelectorAll('[data-profile]').forEach(b=>b.disabled=false); }
    }));
  } catch(error) { el.querySelector('.role-panel').textContent=error.message; }
}

document.addEventListener('click', async event => {
  const toggle = event.target.closest('[data-password-toggle]');
  if (toggle) {
    const input = document.getElementById(toggle.dataset.passwordToggle);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.innerHTML = passwordEye(visible);
    toggle.setAttribute('aria-pressed', String(visible));
    const label = `${toggle.dataset.passwordLabel} ${visible ? '숨기기' : '표시'}`;
    toggle.setAttribute('aria-label', label); toggle.title = label;
  }
  if (event.target.id === 'switchUser') {
    try { await auth.logout(); location.reload(); }
    catch (error) { toast(error.message || '로그아웃하지 못했습니다.'); }
  }
  if (event.target.closest('[data-st-theme]')) {
    $('#themeToggle').click(); const image = $('.st-bg img'); if (image) image.src = HOME_MAP[theme()];
  }
});
window.addEventListener('gb-session-expired', () => location.reload());
window.addEventListener('gb-save-warning', event => toast(event.detail));
// A login/logout in another tab must not silently change the visible author.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !started) return;
  const identity = () => JSON.stringify([currentUser()?.id, currentUser()?.role, currentUser()?.process]);
  const previous = identity();
  // Validate a cookie changed in another tab before requesting this inbox.
  approvalInbox?.stop();
  try {
    await auth.session();
    if (identity() !== previous) location.reload();
    else if (!auth.experience) { await replayController?.refresh(); approvalInbox?.start(); }
  }
  catch { toast('로그인 상태를 확인하지 못했습니다. 연결을 확인해 주세요.'); }
});

/* [LOGIN ADD END] */
/* [LOGIN CHANGE] 시작: 인증 확인 후에만 기존 데이터 로딩 및 판정 엔진 실행. */
(async function init() {
  if (document.documentElement.dataset.sb === 'collapsed') appEl().classList.add('sb-collapsed');
  updateLive();
  try {
    const user = await auth.session();
    if (!user || (auth.experience && location.hash === '#/start')) { showStart(); return; }
    document.body.classList.toggle('personal-experience', auth.experience);
    approvalInbox = createApprovalInbox({ auth,
      onChange: () => { approvalInboxError = ''; renderAlarmBadge(); },
      onError: (error, { operation }) => {
        approvalInboxError = error.message || '알림 연결 실패';
        if (operation === 'read') toast('읽음 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        if (!$('#alarmPop').hidden) renderAlarmPop();
      } });
    // [PUSH ROLE] Rebind an already opted-in device when the selected role changes.
    // Never ask for notification permission automatically.
    if (!auth.experience && window.isSecureContext && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await auth.request('/api/notifications/subscribe', {subscription:subscription.toJSON()});
      } catch { /* Permission/connectivity can be reviewed on the notifications page. */ }
    }
    const ts = await store.load();
    const by = parseTimeseries(ts);
    fans = store.equipment.map(eq => ({ eq, an: analyze(by[eq.equipment_id]), start: eq.demo_start_index }));
    playbackDataId = playbackDatasetId(ts, store.equipment, SIM_START);
    function useRound(round = null) {
      alarmReporter?.dispose();
      alarmReporter = auth.experience ? null : createAlarmReporter({ userId:user.id, revision:store.playbackRevision, roundId:round?.id || '',
        equipmentIds:store.equipment.map(eq=>eq.equipment_id), request:auth.request.bind(auth),
        read:key=>store.pref.get(key,null), write:(key,value)=>store.pref.set(key,value) });
      // A newly paired phone is a receiver until its owner explicitly plays.
      // This prevents setup time consuming alarms before mail/push is enabled.
      if (round || auth.experience) sim.speed = 0;
      sim.restore(round ? `${user.id}.${round.id}` : user.id, playbackDataId);
      sim.save(true); updateLive();
      sim.elapsed = Math.floor(sim.ms / 60000);
      fans.forEach(f => { f.snap = null; });
      alarms.list = [];
      if (started) { updateFans(); seedAlarms(); renderAlarmBadge(); renderToasts(); onDataTick(); }
    }
    if (!auth.experience) {
      replayController = createExperienceReplay({storageNamespace: 'team',userId:user.id, revision:store.playbackRevision,
        request:auth.request.bind(auth), read:key=>store.pref.get(key,null), write:(key,value)=>store.pref.set(key,value),
        onRound:useRound, onError:() => { /* The reporter retains pending alarms while offline. */ }});
      await replayController.start();
    } else useRound();
    sim.elapsed = Math.floor(sim.ms / 60000);
    updateLive();
    updateFans(); seedAlarms();
    $('#sbFoot').innerHTML = auth.experience ? '<b>설비 상태 체험</b><br>새 경보·주의 알림을 화면에서 확인합니다.' : '저장: <b>서버 DB (MySQL)</b><br>작성자·완료 처리자 자동 기록';
    $('#hdClock').textContent = clockText(simNow());
    window.addEventListener('hashchange', route);
    started = true; sim.last = performance.now();
    document.body.classList.remove('on-start');
    $('#start').hidden = true;
    renderUserName(); route(); if (!auth.experience) approvalInbox.start(); setInterval(tick, 250);
  } catch (error) { showStart('login', error.message || '서버에 연결하지 못했습니다.'); }
})();
