// 진동 추이 그래프 (의존성 없는 SVG)
import { AXES, FEATURES, FEATURE, AXIS_LABEL, RULE } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const fmt = v => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3));

// Public replay starts with only one or two samples. Never label a sample twice.
export function experienceTimeTicks(start, end, width) {
  let intervals = Math.min(end - start, Math.max(1, Math.floor(width / 110)));
  if (intervals <= 0) return [start];
  while (intervals > 1) {
    const ticks = Array.from({ length: intervals + 1 }, (_, k) => Math.round(start + (end - start) * k / intervals));
    if (ticks.every((i, k) => k === 0 || (i - ticks[k - 1]) / (end - start) * width >= 75)) return ticks;
    intervals--;
  }
  return [start, end];
}

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/**
 * @param {HTMLElement} host
 * @param {{an:object, now:number, feature:string, range:string, timeOf:(i:number)=>Date, hhmm:(d:Date)=>string, hover:{index:number|null}}} o
 */
export function renderChart(host, o) {
  const { an, now, feature, range, timeOf, hhmm } = o;
  host.innerHTML = '';
  const W = Math.max(320, host.clientWidth);
  // Detail layout can size the plot without stretching the SVG or changing data.
  const layoutHeight = Number.parseFloat(getComputedStyle(host).getPropertyValue('--detail-chart-height'));
  const H = Number.isFinite(layoutHeight) ? Math.max(240, Math.min(460, layoutHeight)) : 300;
  const P = { l: 54, r: 18, t: 30, b: 34 };
  const start = range === 'all' ? 0 : Math.max(0, now - 179);
  // x축은 현재 측정 시점에서 끝난다 (미래 구간 없음)
  const end = now;
  const span = Math.max(1, end - start);
  const alarmed = an.firstAlarm >= 0 && an.firstAlarm <= now;
  const focus = alarmed ? an.alarmAxes : [];
  // 정상 기준 범위는 경보 후엔 최초 경보 축, 경보 전엔 최근 4회 초과 정도가 큰 축 기준으로 그린다
  const recentPct = a => [0, 1, 2, 3].reduce((s, d) => s + (an.pct[Math.max(0, now - d)][`${a}_${feature}`] || 0), 0);
  const bandAxis = focus[0] || (recentPct('v') > recentPct('h') ? 'v' : 'h');

  const vals = [];
  for (let i = start; i <= now; i++) for (const a of AXES) vals.push(an.series[i][`${a}_${feature}`]);
  const ths = AXES.map(a => an.th[`${a}_${feature}`]);
  let lo = Math.min(...vals, ...ths), hi = Math.max(...vals, ...ths);
  const pad = (hi - lo) * 0.1 || hi * 0.1;
  lo = Math.max(0, lo - pad); hi += pad;

  const x = i => P.l + (i - start) / span * (W - P.l - P.r);
  const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg', role: 'img',
    'aria-label': `${FEATURE[feature].name} 추이 그래프` });

  // 정상 기준 범위 (반투명 Green)
  const thB = an.th[`${bandAxis}_${feature}`];
  svg.append(el('rect', { x: P.l, y: y(thB), width: W - P.l - P.r, height: Math.max(0, y(lo) - y(thB)), class: 'c-band' }));

  // 그리드 + Y축
  for (const t of niceTicks(lo, hi)) {
    svg.append(el('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: 'c-grid' }));
    svg.append(el('text', { x: P.l - 8, y: y(t) + 4, class: 'c-tick', 'text-anchor': 'end' }, fmt(t)));
  }
  // X축 시간
  const nT = Math.max(2, Math.floor((W - P.l - P.r) / 110));
  const timeTicks = o.experience
    ? experienceTimeTicks(start, end, W - P.l - P.r)
    : Array.from({ length: nT + 1 }, (_, k) => Math.min(end, Math.round(start + span * k / nT)));
  timeTicks.forEach((i, k) => {
    svg.append(el('text', { x: x(i), y: H - 10, class: 'c-tick c-time-tick', 'text-anchor': k === 0 ? 'start' : k === timeTicks.length - 1 ? 'end' : 'middle' }, hhmm(timeOf(i))));
  });

  // 축별 정상 기준선
  for (const a of AXES) {
    const t = an.th[`${a}_${feature}`];
    const dim = alarmed && !focus.includes(a);
    svg.append(el('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: `c-th c-th-${a}${dim ? ' dim' : ''}` }));
    svg.append(el('text', { x: W - P.r - 4, y: y(t) - 5, class: `c-th-label c-${a}${dim ? ' dim' : ''}`, 'text-anchor': 'end' }, `${AXIS_LABEL[a]} 기준`));
  }

  // 최초 경보 시점 (Red dashed line)
  if (alarmed && an.firstAlarm >= start) {
    const fx = x(an.firstAlarm);
    svg.append(el('line', { x1: fx, x2: fx, y1: P.t - 6, y2: H - P.b, class: 'c-alarm-line' }));
    const anchor = fx > W - 140 ? 'end' : 'start';
    svg.append(el('text', { x: fx + (anchor === 'start' ? 6 : -6), y: P.t - 12, class: 'c-alarm-label', 'text-anchor': anchor }, `최초 경보 ${hhmm(timeOf(an.firstAlarm))}`));
  }

  // 진동 추이 라인 — 경보 전: 수평·수직 다른 색 / 경보 후: 최초 경보 축 진하게, 다른 축 옅게
  const order = [...AXES].sort((a, b) => (focus.includes(a) ? 1 : 0) - (focus.includes(b) ? 1 : 0));
  for (const a of order) {
    const pts = [];
    for (let i = start; i <= now; i++) pts.push(`${x(i).toFixed(1)},${y(an.series[i][`${a}_${feature}`]).toFixed(1)}`);
    const cls = !alarmed ? 'c-line' : focus.includes(a) ? 'c-line strong' : 'c-line dim';
    svg.append(el('polyline', { points: pts.join(' '), class: `${cls} c-line-${a}` }));
  }

  // 기준 초과했지만 경보 조건은 미충족한 지점 (Amber)
  const gEx = el('g', { class: 'c-exceed' });
  for (let i = Math.max(start, RULE.baselineN); i <= now; i++) {
    if (an.cond[i]) continue;
    for (const a of AXES) {
      if (!an.exceed[i][`${a}_${feature}`]) continue;
      const dim = alarmed && !focus.includes(a);
      gEx.append(el('circle', { cx: x(i), cy: y(an.series[i][`${a}_${feature}`]), r: 2.6, class: dim ? 'dim' : '' }));
    }
  }
  svg.append(gEx);

  // 경보 발생 마커
  const markAxis = focus[0] || 'h';
  for (const e of an.alarmEvents) {
    if (e < start || e > now) continue;
    svg.append(el('circle', { cx: x(e), cy: y(an.series[e][`${markAxis}_${feature}`]), r: e === an.firstAlarm ? 6 : 4.5, class: 'c-alarm-marker' }));
  }

  // 현재 데이터 위치
  const nx = x(now);
  svg.append(el('line', { x1: nx, x2: nx, y1: P.t, y2: H - P.b, class: 'c-now' }));
  svg.append(el('text', { x: nx - 6, y: H - P.b - 6, class: 'c-now-label', 'text-anchor': 'end' }, '현재'));
  for (const a of AXES) {
    const dim = alarmed && !focus.includes(a);
    svg.append(el('circle', { cx: nx, cy: y(an.series[now][`${a}_${feature}`]), r: 4, class: `c-now-dot c-fill-${a}${dim ? ' dim' : ''}` }));
  }

  // 마우스 오버: 해당 시점의 3가지 진동 특징 기준 통과 여부
  const cross = el('line', { y1: P.t, y2: H - P.b, class: 'c-cross', visibility: 'hidden' });
  svg.append(cross);
  const overlay = el('rect', { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: 'transparent' });
  svg.append(overlay);
  host.append(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.append(tip);

  const show = i => {
    const cx = x(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const p = an.series[i], ex = an.exceed[i];
    const state = i < RULE.baselineN ? ['base', '정상 기준 수집 구간']
      : an.cond[i] ? ['alarm', '경보 조건 충족']
      : Object.values(ex).some(Boolean) ? ['warn', '기준 초과 · 경보 조건 미충족'] : ['ok', '정상 범위'];
    const cell = (a, f) => i < RULE.baselineN ? '<td class="t-na">-</td>'
      : ex[`${a}_${f}`] ? `<td class="t-ng">초과<small>${an.run[i][`${a}_${f}`]}회 연속</small></td>` : '<td class="t-ok">통과</td>';
    tip.innerHTML = `
      <div class="t-time">${hhmm(timeOf(i))}${i === an.firstAlarm ? ' · <b class="t-alarm">최초 경보</b>' : an.alarmEvents.includes(i) ? ' · <b class="t-alarm">경보 발생</b>' : ''}</div>
      <div class="t-vals">${AXES.map(a => `<span><i class="dot c-fill-${a}"></i>${AXIS_LABEL[a]} ${fmt(p[`${a}_${feature}`])}</span>`).join('')}</div>
      <table><thead><tr><th>진동 특징</th><th>수평</th><th>수직</th></tr></thead>
      <tbody>${FEATURES.map(f => `<tr${f === feature ? ' class="t-cur"' : ''}><td>${FEATURE[f].name}</td>${cell('h', f)}${cell('v', f)}</tr>`).join('')}</tbody></table>
      <div class="t-state s-${state[0]}">${state[1]}</div>`;
    tip.hidden = false;
    const tw = tip.offsetWidth, hw = host.clientWidth;
    const left = cx + 14 + tw > hw ? cx - tw - 14 : cx + 14;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${P.t}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const pick = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    return Math.min(now, Math.max(start, Math.round(start + (px - P.l) / (W - P.l - P.r) * span)));
  };
  overlay.addEventListener('pointermove', ev => { o.hover.index = pick(ev); show(o.hover.index); });
  overlay.addEventListener('pointerleave', () => { o.hover.index = null; hide(); });
  if (o.hover.index != null && o.hover.index >= start && o.hover.index <= now) show(o.hover.index);
}
