// js/overview-design.js
var PROCESS_EXAMPLE_COUNTS = Object.freeze({
  sinter: Object.freeze({ total: 2480, normal: 2108, warning: 298, alarm: 74 }),
  iron: Object.freeze({ total: 3200, normal: 3152, warning: 32, alarm: 16 }),
  steel: Object.freeze({ total: 2840, normal: 2556, warning: 199, alarm: 85 }),
  casting: Object.freeze({ total: 1860, normal: 1804, warning: 37, alarm: 19 }),
  rolling: Object.freeze({ total: 2100, normal: 1932, warning: 121, alarm: 47 })
});
var OVERALL_EXAMPLE_COUNTS = Object.freeze(Object.values(PROCESS_EXAMPLE_COUNTS).reduce(
  (sum, counts) => Object.fromEntries(Object.keys(sum).map((key) => [key, sum[key] + counts[key]])),
  { total: 0, normal: 0, warning: 0, alarm: 0 }
));
var formatCount = (value) => value.toLocaleString("ko-KR");
var countParts = (counts) => [counts.normal, counts.warning, counts.alarm];
var DESIGN_EXAMPLE = Object.freeze({
  metrics: [
    ["전체 관리 설비", formatCount(OVERALL_EXAMPLE_COUNTS.total), "대"],
    ["정상 설비 수", formatCount(OVERALL_EXAMPLE_COUNTS.normal), "대"],
    ["주의 설비 수", formatCount(OVERALL_EXAMPLE_COUNTS.warning), "대"],
    ["경보 설비 수", formatCount(OVERALL_EXAMPLE_COUNTS.alarm), "대"]
  ],
  trend: [10, 55, 22, 98, 55, 40, 49, 20, 43, 39],
  processes: [["sinter", "소결"], ["iron", "제선"], ["steel", "제강"], ["casting", "연주"], ["rolling", "압연"]],
  distribution: countParts(OVERALL_EXAMPLE_COUNTS),
  repairs: [["대기", 91], ["진행", 54], ["완료", 183]],
  overall: OVERALL_EXAMPLE_COUNTS,
  processCounts: PROCESS_EXAMPLE_COUNTS
});
var MAP_POSITIONS = Object.freeze({
  "EGF-01": [39.349, 47.546],
  "EGF-02": [52.943, 28.472],
  "EGF-03": [80.911, 45.787],
  "EGF-04": [52.109, 25.324],
  "EGF-05": [61.224, 36.62],
  "EGF-06": [66.849, 58.657]
});
var MAP_EXAMPLE_MARKERS = Object.freeze({
  sinter: [
    { x: 73.255, y: 55.88, status: "정상" },
    { x: 64.401, y: 65.139, status: "주의" },
    { x: 71.432, y: 74.12, status: "정상" }
  ],
  steel: [
    { x: 56.172, y: 30.139, status: "주의" },
    { x: 47.474, y: 37.269, status: "주의" },
    { x: 51.536, y: 42.083, status: "주의" },
    { x: 64.453, y: 39.491, status: "정상" },
    { x: 68.516, y: 43.472, status: "정상" },
    { x: 55.755, y: 46.157, status: "정상" },
    { x: 59.401, y: 50.324, status: "주의" },
    { x: 63.203, y: 54.491, status: "경보" },
    { x: 51.224, y: 65.139, status: "경보" },
    { x: 61.797, y: 75.787, status: "주의" }
  ]
});
var icon = (paths) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${paths}</svg>`;
var chart = icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 17v-5M12 17V7M17 17v-8"/>');
var ring = icon('<path d="M12 3a9 9 0 1 1-3 .5M12 3v9"/>');
var wrench = icon('<path d="M14.5 13.5a7 7 0 0 0-8-10.8L11 7l-4 4-4.3-4.5a7 7 0 0 0 10.8 8L20 21l2-2z"/>');
var warning = icon('<path d="M12 3 22 21H2zM12 9v5"/><path d="M12 17v.5"/>');
var sectionTitle = (symbol, title) => `<h2 class="ov-heading">${symbol}<span>${title}</span></h2>`;
var statusLegend = () => '<ul class="ov-legend"><li><i class="normal"></i>정상</li><li><i class="warning"></i>주의</li><li><i class="alarm"></i>경보</li></ul>';
function designDonut(label, parts = DESIGN_EXAMPLE.distribution) {
  const total = parts.reduce((a2, b2) => a2 + b2, 0) || 1;
  const a = parts[0] / total * 100, b = (parts[0] + parts[1]) / total * 100;
  return `<div class="ov-donut" style="--normal-end:${a}%;--warning-end:${b}%" role="img" aria-label="${label} 설비 현황 예시 · 정상 ${formatCount(parts[0])}대 · 주의 ${formatCount(parts[1])}대 · 경보 ${formatCount(parts[2])}대"><span>${label}</span></div>`;
}
function processComparison() {
  const states = [["normal", "정상"], ["warning", "주의"], ["alarm", "경보"]];
  return `<div class="ov-process-comparison" aria-label="공정별 정상·주의·경보 비율 비교">
    ${DESIGN_EXAMPLE.processes.map(([key, label]) => {
    const counts = DESIGN_EXAMPLE.processCounts[key];
    const description = states.map(([state, text]) => `${text} ${formatCount(counts[state])}대 (${(counts[state] / counts.total * 100).toFixed(1)}%)`).join(" · ");
    return `<a class="ov-process-row" href="#/process/${key}" aria-label="${label}공정 보기 · 전체 ${formatCount(counts.total)}대 · ${description}">
        <div class="ov-comparison-head"><strong>${label}공정</strong><span>전체 <b>${formatCount(counts.total)}</b>대 · 정상 <b class="ov-normal-ratio">${(counts.normal / counts.total * 100).toFixed(1)}%</b></span></div>
        <div class="ov-composition-bar" aria-hidden="true">${states.map(([state]) => `<span class="${state}" style="width:${counts[state] / counts.total * 100}%"></span>`).join("")}</div>
        <div class="ov-comparison-values">${states.map(([state, text]) => `<span><i class="${state}" aria-hidden="true"></i>${text} <b>${formatCount(counts[state])}</b><small>대</small></span>`).join("")}</div>
      </a>`;
  }).join("")}
  </div>`;
}
var foldControl = () => '<button type="button" class="ov-fold" data-dashboard-toggle aria-label="현황 카드 접기" aria-expanded="true" aria-controls="overviewPanels"><svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>';
function homeSummary() {
  const p = DESIGN_EXAMPLE;
  const states = ["total", "normal", "warning", "alarm"];
  return `<section class="home-summary" aria-label="전체 제철소 설비 현황 예시">
    <div class="home-summary-title">${sectionTitle(chart, "전체 제철소 설비 현황")}
      <span class="home-example-label">예시 데이터</span><p>공정별 예시 통계를 합산한 수치입니다.</p>
    </div>
    <dl class="home-summary-metrics">${p.metrics.map(([label, value, unit], i) => `<div class="home-metric home-metric-${states[i]}"><dt>${label}</dt><dd>${value}<small>${unit}</small></dd></div>`).join("")}</dl>
  </section>`;
}
function homePanels() {
  const p = DESIGN_EXAMPLE;
  const repairMax = Math.max(...p.repairs.map(([, value]) => value));
  return `<section class="ov-card ov-operations home-process-panel" aria-label="공정별 설비 현황 예시">
    ${sectionTitle(ring, "공정별 설비 현황")}
    <p class="ov-comparison-note">공정별 전체 설비를 100%로 비교한 예시 데이터입니다.</p>
    ${processComparison()}
    </section>
    <section class="ov-card home-repair-panel" aria-label="설비 수리 진행 현황 예시">
    <div class="ov-repairs">${sectionTitle(wrench, "설비 수리 진행 현황")}
      <p class="ov-comparison-note">대기·진행·완료 건수는 화면 시연용 예시입니다.</p>
      <dl>${p.repairs.map(([label, value], i) => `<div><dt>${label}</dt><dd><span class="ov-repair-track"><i class="repair-${i}" style="width:${value / repairMax * 100}%"></i></span><span>${value}건</span></dd></div>`).join("")}</dl>
    </div></section>`;
}
function processSummary(name) {
  const key = DESIGN_EXAMPLE.processes.find(([, label]) => `${label}공정` === name)?.[0];
  const p = DESIGN_EXAMPLE.processCounts[key] || DESIGN_EXAMPLE.overall;
  const values = [p.total, p.normal, p.warning, p.alarm];
  return `<section class="ov-card ov-process-summary">${sectionTitle(icon('<path d="M3 21V10l6 4V9l6 4V3h5v18z"/>'), `${name} 설비 현황`)}
    <div class="ov-process-summary-body"><div>${designDonut(name.replace("공정", ""), countParts(p))}${statusLegend()}</div>
    <dl class="ov-process-counts">${["전체 설비 수", "정상 수", "주의 수", "경보 수"].map((label, i) => `<div><dt>${label}</dt><dd>${formatCount(values[i])}</dd></div>`).join("")}</dl></div>
</section>`;
}
var inspectionHeading = () => sectionTitle(warning, "점검 필요 설비");

// js/engine.js
var RULE = { baselineN: 20, need: 2, of: 3, consecutive: 4, method: "B" };
var AXES = ["h", "v"];
var FEATURES = ["rms", "peak", "kurtosis"];
var AXIS_LABEL = { h: "수평", v: "수직" };
var FEATURE = {
  rms: { name: "진동 크기(RMS)", short: "진동 크기", phrase: "전반적인 진동이 커졌음", desc: "측정 구간 전체에서 계산한 진동 크기가 기준을 넘었음" },
  peak: { name: "순간 최대 진동(Peak)", short: "순간 최대 진동", phrase: "순간적으로 큰 진동이 확인됨", desc: "측정 중 가장 큰 진동값이 기준을 넘었음" },
  kurtosis: { name: "충격성 지표(첨도)", short: "충격성 지표", phrase: "진동 패턴의 변화가 확인됨", desc: "전체 진동에 비해 유난히 큰 값이 두드러지는 정도가 기준을 넘었음" }
};
var REASONS = {
  sustained: { title: "이상 진동 지속 확인", desc: "경보 이후에도 이상 진동이 계속 확인되고 있습니다." },
  consecutive: { title: "이상 진동 연속 확인", desc: "이상 진동이 여러 측정 구간에서 연속적으로 확인되었습니다." },
  multi: { title: "여러 진동 항목에서 이상 확인", desc: "여러 진동 항목에서 이상이 함께 확인되었습니다." },
  unusual: { title: "평소와 다른 진동 감지", desc: "평소 운전 상태와 다른 진동 변화가 감지되었습니다." }
};
var mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
var stdev = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
function parseTimeseries(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines.shift().split(",");
  const by = {};
  for (const line of lines) {
    const c = line.split(",");
    const id = c[0];
    (by[id] ||= []).push(Object.fromEntries(head.slice(2).map((k, i) => [k, +c[i + 2]])));
  }
  return by;
}
function analyze(series) {
  const n = series.length;
  const N = RULE.baselineN;
  const th = {};
  for (const a of AXES) for (const f of FEATURES) {
    const base = series.slice(0, N).map((p) => p[`${a}_${f}`]);
    th[`${a}_${f}`] = mean(base) + 3 * stdev(base);
  }
  const exceed = [], pct = [], run = [], axisMet = [], cond = [];
  const prevRun = Object.fromEntries(AXES.flatMap((a) => FEATURES.map((f) => [`${a}_${f}`, 0])));
  for (let i = 0; i < n; i++) {
    const e = {}, p = {}, r = {}, am = {};
    for (const a of AXES) {
      let met = 0;
      for (const f of FEATURES) {
        const k = `${a}_${f}`;
        const v = series[i][k];
        e[k] = i >= N && v > th[k];
        p[k] = i >= N ? Math.max(0, (v - th[k]) / th[k] * 100) : 0;
        r[k] = e[k] ? prevRun[k] + 1 : 0;
        prevRun[k] = r[k];
        if (r[k] >= RULE.consecutive) met++;
      }
      am[a] = met;
    }
    exceed.push(e);
    pct.push(p);
    run.push(r);
    axisMet.push(am);
    cond.push(AXES.some((a) => am[a] >= RULE.need));
  }
  const firstAlarm = cond.indexOf(true);
  const alarmAxes = firstAlarm < 0 ? [] : AXES.filter((a) => axisMet[firstAlarm][a] >= RULE.need);
  const alarmEvents = [];
  for (let i = 0; i < n; i++) if (cond[i] && (i === 0 || !cond[i - 1])) alarmEvents.push(i);
  const condCum = [];
  cond.reduce((s, c, i) => condCum[i] = s + (c ? 1 : 0), 0);
  return { series, n, th, exceed, pct, run, axisMet, cond, firstAlarm, alarmAxes, alarmEvents, condCum };
}
var anyExceed = (an, i) => i >= 0 && Object.values(an.exceed[i]).some(Boolean);
function snapshot(an, now) {
  const i = Math.min(Math.max(now, 0), an.n - 1);
  const fa = an.firstAlarm;
  const alarmed = fa >= 0 && fa <= i;
  const recentExceed = [0, 1, 2, 3].some((d) => anyExceed(an, i - d));
  let status = "정상";
  if (i < RULE.baselineN) status = "정상";
  else if (alarmed) status = "경보";
  else if (recentExceed) status = "주의";
  const ex = an.exceed[i];
  const exceedFeatures = FEATURES.filter((f) => AXES.some((a) => ex[`${a}_${f}`]));
  const multiAxis = AXES.filter((a) => FEATURES.filter((f) => ex[`${a}_${f}`]).length >= 2);
  const maxExceedPct = Math.max(0, ...Object.values(an.pct[i]));
  const sinceAlarm = alarmed ? i - fa : null;
  const persistCount = alarmed ? an.condCum[i] - an.condCum[fa] : 0;
  const persistenceRate = alarmed ? (an.condCum[i] - (fa > 0 ? an.condCum[fa - 1] : 0)) / (i - fa + 1) * 100 : 0;
  const sustained = alarmed && i > fa && an.cond[i];
  const lastEvent = alarmed ? an.alarmEvents.filter((e) => e <= i).pop() : null;
  let lastExceed = null;
  if (!alarmed) {
    for (let k = i; k >= RULE.baselineN; k--) if (anyExceed(an, k)) {
      lastExceed = k;
      break;
    }
  }
  const reasons = {
    sustained,
    consecutive: alarmed,
    multi: multiAxis.length > 0,
    unusual: exceedFeatures.length > 0 || status === "주의" && recentExceed
  };
  const shown2 = status === "정상" ? [] : Object.keys(REASONS).filter((k) => reasons[k]);
  const mainReason = shown2[0] || null;
  const focusAxis = alarmed ? an.alarmAxes : [];
  const metAxis = AXES.reduce((b, a) => an.axisMet[i][a] > an.axisMet[i][b] ? a : b, focusAxis[0] || "h");
  return {
    index: i,
    status,
    alarmed,
    recentExceed,
    exceedFeatures,
    multiAxis,
    maxExceedPct,
    firstAlarm: alarmed ? fa : null,
    sinceAlarm,
    persistCount,
    persistenceRate,
    sustained,
    lastEvent,
    lastExceed,
    reasons,
    shown: shown2,
    mainReason,
    focusAxis,
    featuresMet: an.axisMet[i][metAxis],
    metAxis,
    ended: now >= an.n - 1
  };
}
var STATUS_RANK = { 경보: 0, 주의: 1, 정상: 2 };
function priorityCompare(a, b) {
  const sa = a.snap, sb = b.snap;
  return STATUS_RANK[sa.status] - STATUS_RANK[sb.status] || sb.persistenceRate - sa.persistenceRate || sb.maxExceedPct - sa.maxExceedPct || (b.lastAlarmTime || 0) - (a.lastAlarmTime || 0);
}
function recentAlarmCompare(a, b) {
  return (b.lastAlarmTime || 0) - (a.lastAlarmTime || 0) || priorityCompare(a, b);
}

// js/chart.js
var NS = "http://www.w3.org/2000/svg";
var el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
var fmt = (v) => Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3);
function experienceTimeTicks(start, end, width) {
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
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function renderChart(host, o) {
  const { an, now, feature, range, timeOf: timeOf2, hhmm: hhmm2 } = o;
  host.innerHTML = "";
  const W = Math.max(320, host.clientWidth);
  const layoutHeight = Number.parseFloat(getComputedStyle(host).getPropertyValue("--detail-chart-height"));
  const H = Number.isFinite(layoutHeight) ? Math.max(240, Math.min(460, layoutHeight)) : 300;
  const P = { l: 54, r: 18, t: 30, b: 34 };
  const start = range === "all" ? 0 : Math.max(0, now - 179);
  const end = now;
  const span = Math.max(1, end - start);
  const alarmed = an.firstAlarm >= 0 && an.firstAlarm <= now;
  const focus = alarmed ? an.alarmAxes : [];
  const recentPct = (a) => [0, 1, 2, 3].reduce((s, d) => s + (an.pct[Math.max(0, now - d)][`${a}_${feature}`] || 0), 0);
  const bandAxis = focus[0] || (recentPct("v") > recentPct("h") ? "v" : "h");
  const vals = [];
  for (let i = start; i <= now; i++) for (const a of AXES) vals.push(an.series[i][`${a}_${feature}`]);
  const ths = AXES.map((a) => an.th[`${a}_${feature}`]);
  let lo = Math.min(...vals, ...ths), hi = Math.max(...vals, ...ths);
  const pad2 = (hi - lo) * 0.1 || hi * 0.1;
  lo = Math.max(0, lo - pad2);
  hi += pad2;
  const x = (i) => P.l + (i - start) / span * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const svg2 = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    class: "chart-svg",
    role: "img",
    "aria-label": `${FEATURE[feature].name} 추이 그래프`
  });
  const thB = an.th[`${bandAxis}_${feature}`];
  svg2.append(el("rect", { x: P.l, y: y(thB), width: W - P.l - P.r, height: Math.max(0, y(lo) - y(thB)), class: "c-band" }));
  for (const t of niceTicks(lo, hi)) {
    svg2.append(el("line", { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: "c-grid" }));
    svg2.append(el("text", { x: P.l - 8, y: y(t) + 4, class: "c-tick", "text-anchor": "end" }, fmt(t)));
  }
  const nT = Math.max(2, Math.floor((W - P.l - P.r) / 110));
  const timeTicks = o.experience ? experienceTimeTicks(start, end, W - P.l - P.r) : Array.from({ length: nT + 1 }, (_, k) => Math.min(end, Math.round(start + span * k / nT)));
  timeTicks.forEach((i, k) => {
    svg2.append(el("text", { x: x(i), y: H - 10, class: "c-tick c-time-tick", "text-anchor": k === 0 ? "start" : k === timeTicks.length - 1 ? "end" : "middle" }, hhmm2(timeOf2(i))));
  });
  for (const a of AXES) {
    const t = an.th[`${a}_${feature}`];
    const dim = alarmed && !focus.includes(a);
    svg2.append(el("line", { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: `c-th c-th-${a}${dim ? " dim" : ""}` }));
    svg2.append(el("text", { x: W - P.r - 4, y: y(t) - 5, class: `c-th-label c-${a}${dim ? " dim" : ""}`, "text-anchor": "end" }, `${AXIS_LABEL[a]} 기준`));
  }
  if (alarmed && an.firstAlarm >= start) {
    const fx = x(an.firstAlarm);
    svg2.append(el("line", { x1: fx, x2: fx, y1: P.t - 6, y2: H - P.b, class: "c-alarm-line" }));
    const anchor = fx > W - 140 ? "end" : "start";
    svg2.append(el("text", { x: fx + (anchor === "start" ? 6 : -6), y: P.t - 12, class: "c-alarm-label", "text-anchor": anchor }, `최초 경보 ${hhmm2(timeOf2(an.firstAlarm))}`));
  }
  const order = [...AXES].sort((a, b) => (focus.includes(a) ? 1 : 0) - (focus.includes(b) ? 1 : 0));
  for (const a of order) {
    const pts = [];
    for (let i = start; i <= now; i++) pts.push(`${x(i).toFixed(1)},${y(an.series[i][`${a}_${feature}`]).toFixed(1)}`);
    const cls = !alarmed ? "c-line" : focus.includes(a) ? "c-line strong" : "c-line dim";
    svg2.append(el("polyline", { points: pts.join(" "), class: `${cls} c-line-${a}` }));
  }
  const gEx = el("g", { class: "c-exceed" });
  for (let i = Math.max(start, RULE.baselineN); i <= now; i++) {
    if (an.cond[i]) continue;
    for (const a of AXES) {
      if (!an.exceed[i][`${a}_${feature}`]) continue;
      const dim = alarmed && !focus.includes(a);
      gEx.append(el("circle", { cx: x(i), cy: y(an.series[i][`${a}_${feature}`]), r: 2.6, class: dim ? "dim" : "" }));
    }
  }
  svg2.append(gEx);
  const markAxis = focus[0] || "h";
  for (const e of an.alarmEvents) {
    if (e < start || e > now) continue;
    svg2.append(el("circle", { cx: x(e), cy: y(an.series[e][`${markAxis}_${feature}`]), r: e === an.firstAlarm ? 6 : 4.5, class: "c-alarm-marker" }));
  }
  const nx = x(now);
  svg2.append(el("line", { x1: nx, x2: nx, y1: P.t, y2: H - P.b, class: "c-now" }));
  svg2.append(el("text", { x: nx - 6, y: H - P.b - 6, class: "c-now-label", "text-anchor": "end" }, "현재"));
  for (const a of AXES) {
    const dim = alarmed && !focus.includes(a);
    svg2.append(el("circle", { cx: nx, cy: y(an.series[now][`${a}_${feature}`]), r: 4, class: `c-now-dot c-fill-${a}${dim ? " dim" : ""}` }));
  }
  const cross = el("line", { y1: P.t, y2: H - P.b, class: "c-cross", visibility: "hidden" });
  svg2.append(cross);
  const overlay = el("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" });
  svg2.append(overlay);
  host.append(svg2);
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  host.append(tip);
  const show = (i) => {
    const cx = x(i);
    cross.setAttribute("x1", cx);
    cross.setAttribute("x2", cx);
    cross.setAttribute("visibility", "visible");
    const p = an.series[i], ex = an.exceed[i];
    const state = i < RULE.baselineN ? ["base", "정상 기준 수집 구간"] : an.cond[i] ? ["alarm", "경보 조건 충족"] : Object.values(ex).some(Boolean) ? ["warn", "기준 초과 · 경보 조건 미충족"] : ["ok", "정상 범위"];
    const cell = (a, f) => i < RULE.baselineN ? '<td class="t-na">-</td>' : ex[`${a}_${f}`] ? `<td class="t-ng">초과<small>${an.run[i][`${a}_${f}`]}회 연속</small></td>` : '<td class="t-ok">통과</td>';
    tip.innerHTML = `
      <div class="t-time">${hhmm2(timeOf2(i))}${i === an.firstAlarm ? ' · <b class="t-alarm">최초 경보</b>' : an.alarmEvents.includes(i) ? ' · <b class="t-alarm">경보 발생</b>' : ""}</div>
      <div class="t-vals">${AXES.map((a) => `<span><i class="dot c-fill-${a}"></i>${AXIS_LABEL[a]} ${fmt(p[`${a}_${feature}`])}</span>`).join("")}</div>
      <table><thead><tr><th>진동 특징</th><th>수평</th><th>수직</th></tr></thead>
      <tbody>${FEATURES.map((f) => `<tr${f === feature ? ' class="t-cur"' : ""}><td>${FEATURE[f].name}</td>${cell("h", f)}${cell("v", f)}</tr>`).join("")}</tbody></table>
      <div class="t-state s-${state[0]}">${state[1]}</div>`;
    tip.hidden = false;
    const tw = tip.offsetWidth, hw = host.clientWidth;
    const left = cx + 14 + tw > hw ? cx - tw - 14 : cx + 14;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${P.t}px`;
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  const pick = (ev) => {
    const r = svg2.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    return Math.min(now, Math.max(start, Math.round(start + (px - P.l) / (W - P.l - P.r) * span)));
  };
  overlay.addEventListener("pointermove", (ev) => {
    o.hover.index = pick(ev);
    show(o.hover.index);
  });
  overlay.addEventListener("pointerleave", () => {
    o.hover.index = null;
    hide();
  });
  if (o.hover.index != null && o.hover.index >= start && o.hover.index <= now) show(o.hover.index);
}

// js/auth.js
var auth = {
  experience: location.pathname.startsWith("/experience/"),
  user: null,
  csrf: "",
  async request(url, payload, { signal } = {}) {
    const headers = {};
    if (payload !== void 0) Object.assign(headers, {
      "Content-Type": "application/json",
      "X-GB-Request": "1",
      "X-CSRF-Token": this.csrf
    });
    const endpoint = this.experience && url.startsWith("/api/") ? "/experience" + url : url;
    const response = await fetch(endpoint, {
      method: payload === void 0 ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
      body: payload === void 0 ? void 0 : JSON.stringify(payload)
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("서버 응답을 읽지 못했습니다.");
    }
    if (!response.ok) {
      if (response.status === 401 && this.user && url !== "/api/auth/login") {
        this.user = null;
        this.csrf = "";
        window.dispatchEvent(new Event("gb-session-expired"));
      }
      const error = new Error(result.error || "요청을 처리하지 못했습니다.");
      error.status = response.status;
      throw error;
    }
    return result;
  },
  async session() {
    try {
      const result = await this.request("/api/auth/session");
      this.user = result.user;
      this.csrf = result.csrf;
      this.round = result.round;
      return this.user;
    } catch (error) {
      if (error.status === 401) {
        this.user = null;
        this.csrf = "";
        return null;
      }
      throw error;
    }
  },
  async selectProfile(username) {
    const result = await this.request("/api/demo/select", { username });
    this.user = result.user;
    this.csrf = result.csrf;
    this.round = result.round;
  },
  async login(username, password) {
    const result = await this.request("/api/auth/login", { username, password });
    this.user = result.user;
    this.csrf = result.csrf;
  },
  async logout() {
    await this.request("/api/auth/logout", {});
    this.user = null;
    this.csrf = "";
  }
};

// js/store.js
var safeGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
var safeSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
  }
};
var safeDel = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
  }
};
var keyOf = { inspections: "inspection_id", maintenance_reviews: "review_id", follow_ups: "follow_up_id" };
var actorIdentity = () => JSON.stringify([auth.user?.id, auth.user?.role, auth.user?.process]);
var saving = false;
var store = {
  playbackRevision: null,
  equipment: [],
  db: { inspections: [], maintenance_reviews: [], follow_ups: [], work_history: [] },
  get mode() {
    return "mysql";
  },
  get canReset() {
    return false;
  },
  async load() {
    const [eq, db, ts] = await Promise.all([
      auth.request("/api/equipment"),
      auth.request("/api/maintenance"),
      fetch("data/sensor_timeseries.csv", { credentials: "same-origin", cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error("진동 데이터를 읽지 못했습니다. 다시 로그인해 주세요.");
        this.playbackRevision = r.headers.get("X-GB-Data-Revision");
        return r.text();
      })
    ]);
    this.equipment = eq.records;
    for (const k of Object.keys(this.db)) this.db[k] = db[k] || [];
    return ts;
  },
  async save(records, { operation = "create" } = {}) {
    if (saving) throw new Error("저장 중입니다. 잠시 기다려 주세요.");
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request("/api/maintenance", { ...records, operation });
      if (actorIdentity() !== owner) return result;
      for (const [table, rows] of Object.entries(result.records)) {
        for (let j = 0; j < rows.length; j++) {
          const rec = rows[j];
          Object.assign(records[table][j], rec);
          const i = this.db[table].findIndex((x) => x[keyOf[table]] === rec[keyOf[table]]);
          if (i >= 0) this.db[table][i] = rec;
          else this.db[table].push(rec);
        }
      }
      if (result.warning) window.dispatchEvent(new CustomEvent("gb-save-warning", { detail: result.warning }));
      return result;
    } finally {
      saving = false;
    }
  },
  // Approval writes are atomic on the server. Only returned follow-ups become calendar schedules.
  mergeRecords(records = {}) {
    for (const [table, rows] of Object.entries(records)) {
      if (!this.db[table] || !keyOf[table]) continue;
      for (const rec of rows) {
        const index = this.db[table].findIndex((x) => x[keyOf[table]] === rec[keyOf[table]]);
        if (index >= 0) this.db[table][index] = rec;
        else this.db[table].push(rec);
      }
    }
  },
  async refreshMaintenance() {
    const owner = actorIdentity();
    const db = await auth.request("/api/maintenance");
    if (actorIdentity() !== owner) return;
    for (const key of Object.keys(this.db)) this.db[key] = db[key] || [];
  },
  async submitApproval(payload) {
    if (saving) throw new Error("요청을 처리 중입니다. 잠시 기다려 주세요.");
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request("/api/approvals/submit", payload);
      if (actorIdentity() === owner) this.mergeRecords(result.records);
      return result;
    } finally {
      saving = false;
    }
  },
  async decideApproval(payload) {
    const owner = actorIdentity();
    const result = await auth.request("/api/approvals/decide", payload);
    if (actorIdentity() === owner) this.mergeRecords(result.records);
    return result;
  },
  async submitCompletion(payload) {
    if (saving) throw new Error("요청을 처리 중입니다. 잠시 기다려 주세요.");
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request("/api/completions/submit", payload);
      if (actorIdentity() === owner) this.mergeRecords(result.records);
      return result;
    } finally {
      saving = false;
    }
  },
  async decideCompletion(payload) {
    const owner = actorIdentity();
    const result = await auth.request("/api/completions/decide", payload);
    if (actorIdentity() === owner) this.mergeRecords(result.records);
    return result;
  },
  async reset() {
    throw new Error("MySQL 기록 보호를 위해 초기화를 제공하지 않습니다.");
  },
  history(equipmentId) {
    const by = (rows) => rows.filter((r) => r.equipment_id === equipmentId);
    return {
      inspections: by(this.db.inspections),
      reviews: by(this.db.maintenance_reviews),
      followUps: by(this.db.follow_ups),
      work: by(this.db.work_history)
    };
  },
  draft: {
    get: (id) => safeGet("gb.draft." + auth.user?.id + "." + id),
    set: (id, v) => safeSet("gb.draft." + auth.user?.id + "." + id, v),
    clear: (id) => safeDel("gb.draft." + auth.user?.id + "." + id)
  },
  pref: {
    get: (k, d) => safeGet("gb.pref." + k) ?? d,
    set: (k, v) => safeSet("gb.pref." + k, v)
  }
};

// js/notifications.js
async function mountNotifications(host, { auth: auth2, esc: esc3, getPlaybackStatus = () => "" }) {
  host.innerHTML = '<div class="page">알림 설정을 불러오는 중입니다.</div>';
  let data;
  try {
    data = await auth2.request("/api/notifications");
  } catch (error) {
    host.textContent = error.message;
    return;
  }
  if (!host.isConnected) return;
  const supported = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const iphone = /iPhone|iPad/.test(navigator.userAgent);
  const android = /Android/i.test(navigator.userAgent);
  const canPush = supported && (!iphone || standalone);
  const installSteps = iphone ? "<li>iOS 16.4 이상에서 Safari로 HTTPS 주소 접속</li><li>공유 → 홈 화면에 추가</li><li>설치한 앱 열기 → 담당자 선택 → 푸시 연결</li>" : android ? "<li>Android Chrome에서 HTTPS 주소 접속</li><li>메뉴(⋮) → 홈 화면에 추가 → 설치</li><li>앱 열기 → 담당자 선택 → 푸시 연결 → 알림 허용</li>" : "<li>휴대폰에서 HTTPS 주소로 접속</li><li>아이폰: Safari 공유 → 홈 화면에 추가<br>안드로이드: Chrome 메뉴(⋮) → 홈 화면에 추가 → 설치</li><li>앱 열기 → 담당자 선택 → 푸시 연결 → 알림 허용</li>";
  const supportMessage = !window.isSecureContext ? "푸시 연결은 HTTPS 주소에서 이용해 주세요." : iphone && !standalone ? "아이폰에서는 홈 화면에 추가한 앱으로 열어 주세요." : !supported ? "이 브라우저에서는 푸시 연결을 지원하지 않습니다." : "이 브라우저는 푸시 연결을 지원합니다.";
  host.innerHTML = `<div class="page notice-page"><div class="notice-intro"><h2>현장을 벗어나도, 경보와 승인 요청을 확인하세요.</h2><p>${esc3(auth2.user.name)} · ${esc3(auth2.user.scope)}<br>서버가 최초 경보와 일정 승인 요청·결과를 앱 푸시로 전달합니다. 이메일은 발송 설정을 켠 경우에만 전송합니다.</p></div>
    <div class="notice-grid"><section class="card notice-card"><h3>휴대폰 푸시 알림</h3>
      <p>홈 화면에 설치한 웹앱에서 허용하면 앱을 닫거나 화면을 꺼도 알림을 받을 수 있습니다.</p>
      <ol>${installSteps}</ol>
      <p><b>${supportMessage}</b></p>
      <p>${data.push_live ? "실제 푸시 전송 켜짐" : "미리보기: 푸시 내용만 생성하며 실제 발송하지 않습니다."}</p>
      <div class="notice-actions"><button class="btn" id="pushConnect" ${canPush ? "" : "disabled"}>이 기기 푸시 연결</button><button class="btn ghost" id="pushOff">내 푸시 연결 해제</button></div>
      <p id="pushStatus">연결된 기기 ${data.subscriptions}개</p></section>
    <section class="card notice-card"><h3>이메일 알림</h3><p>최초 경보, 팀장의 일정 승인 요청, 요청자의 승인·반려 결과를 전달합니다. 같은 사건은 중복 발송하지 않습니다.</p>
      <form id="emailSettings"><label for="emailRecipient">${esc3(auth2.user.name)}의 수신 이메일</label><input type="email" id="emailRecipient" value="${esc3(data.email)}" placeholder="수신할 이메일 주소" maxlength="254">
      <label><input type="checkbox" id="emailEnabled" ${data.email_enabled ? "checked" : ""}> 담당 업무 이메일 알림 받기</label><div class="notice-actions"><button class="btn" type="submit">이메일 설정 저장</button></div></form>
      <p>${data.email_live ? "실제 이메일 전송 켜짐" : "현재 실제 이메일 발송은 꺼져 있습니다. 수신 주소를 저장해도 메일을 보내지 않습니다."}</p><p>이메일 전송을 켠 뒤 수신 주소와 알림 받기 설정을 저장하면 사용할 수 있습니다.</p></section></div>
    <section class="card notice-log"><h3>일정 승인 알림</h3><p>현장관리자가 점검·일정을 제출하면 설비 팀장에게 알립니다. 팀장이 승인하거나 반려하면 요청한 담당자에게 결과를 알립니다. 승인 대기 내역은 <a href="#/approvals">승인 화면</a>에서도 확인할 수 있습니다.</p><h3>데이터 재생 알림</h3>
    <p id="playbackLinkStatus" role="status">${esc3(getPlaybackStatus())}</p>
    <p>PC나 휴대폰에서 데이터를 재생하다가 최초 경보에 도달하면, 재생을 시작한 현재 계정의 이메일과 연결된 기기로만 알림을 보냅니다. 다른 담당자나 설비 팀장에게 함께 보내지 않습니다. PC의 브라우저 알림 허용 여부와는 관계없습니다.</p>
    <p>현재 데이터는 CSV 재생입니다. 같은 재생 회차에서는 설비별 최초 경보를 한 번만 전송합니다. 일시정지·새로고침은 같은 회차를 유지하며, 데이터 재생 메뉴의 ‘처음부터’를 누르면 새 회차에서 경보를 다시 받을 수 있습니다. 이미 경보인 위치에서 화면을 열면 과거 경보를 다시 보내지 않습니다.</p>
    <h3>서버 알림 시연</h3><p>아래 버튼은 별도의 테스트입니다. 버튼을 누른 뒤 화면을 닫아도 서버가 계속 처리하며 현재 계정에만 보냅니다.</p>
    <div class="notice-actions"><button class="btn" id="noticeTest">10초 후 내 알림 테스트</button>${auth2.user.role === "supervisor" ? '<button class="btn ghost" id="noticeCsv">CSV 경보 2분 요약 재생</button>' : ""}<button class="btn ghost" id="noticeRefresh">결과 새로고침</button></div>
    <p class="notice-result" id="noticeResult" role="status"></p><div class="scroll"><table><thead><tr><th>생성 시각</th><th>알림</th><th>방식</th><th>처리 결과</th></tr></thead><tbody>${data.deliveries.length ? data.deliveries.map((r) => `<tr><td>${esc3(r.created_at)}</td><td>${esc3(r.title)}</td><td>${r.channel === "push" ? "앱 푸시" : "이메일"}</td><td>${esc3({ dry_run: "미리보기 생성", sent: "제공자 수락", pending: "대기", sending: "전송 중", failed: "설정 확인 필요" }[r.status] || r.status)}</td></tr>`).join("") : '<tr><td colspan="4">아직 생성한 알림이 없습니다.</td></tr>'}</tbody></table></div>
    <p class="notice-foot">실제 푸시는 HTTPS·지원 브라우저·알림 허용·서버 전송 설정이 필요합니다. 아이폰은 홈 화면 설치도 필요합니다. 현재 역할 선택은 발표용이며 본인 인증 기능은 아닙니다.</p></section></div>`;
  const result = host.querySelector("#noticeResult");
  async function act(button, fn) {
    button.disabled = true;
    try {
      const response = await fn();
      result.textContent = response?.message || "설정을 저장했습니다.";
    } catch (error) {
      result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
  host.querySelector("#emailSettings").onsubmit = (event) => {
    event.preventDefault();
    act(event.submitter, () => auth2.request("/api/notifications/settings", { email: host.querySelector("#emailRecipient").value, enabled: host.querySelector("#emailEnabled").checked }));
  };
  host.querySelector("#noticeTest").onclick = (event) => act(event.currentTarget, () => auth2.request("/api/notifications/start", { kind: "test" }));
  host.querySelector("#noticeCsv")?.addEventListener("click", (event) => act(event.currentTarget, () => auth2.request("/api/notifications/start", { kind: "csv" })));
  host.querySelector("#noticeRefresh").onclick = () => mountNotifications(host, { auth: auth2, esc: esc3, getPlaybackStatus });
  host.querySelector("#pushOff").onclick = (event) => act(event.currentTarget, async () => {
    await auth2.request("/api/notifications/unsubscribe", {});
    const reg = await navigator.serviceWorker?.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
    host.querySelector("#pushStatus").textContent = "푸시 연결을 해제했습니다.";
  });
  host.querySelector("#pushConnect").onclick = (event) => act(event.currentTarget, async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw Error("기기 설정에서 알림을 허용해 주세요.");
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(data.public_key.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await auth2.request("/api/notifications/subscribe", { subscription: sub.toJSON() });
    host.querySelector("#pushStatus").textContent = "이 기기를 현재 담당자에게 연결했습니다.";
  });
}

// js/report-preview.js
var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var shown = (value) => Array.isArray(value) ? value.join(", ") || "해당 없음" : String(value ?? "").trim() || "미기록";
var reportLink = (kind, id, from = "maintenance") => `#/reports/${kind}/${encodeURIComponent(id)}?from=${from === "calendar" ? "calendar" : "maintenance"}`;
function resolveReport(db, kind, id) {
  const spec = { inspection: ["inspections", "inspection_id"], followup: ["follow_ups", "follow_up_id"], work: ["work_history", "work_id"] }[kind];
  if (!spec) return null;
  const record = (db[spec[0]] || []).find((row) => row[spec[1]] === id);
  if (!record) return null;
  const inspection = kind === "inspection" ? record : kind === "followup" && record.inspection_id ? (db.inspections || []).find((row) => row.inspection_id === record.inspection_id && row.equipment_id === record.equipment_id) : null;
  return {
    record,
    inspection: inspection || null,
    schedule: kind === "followup" ? record : null,
    work: kind === "work" ? record : null,
    approval: inspection?.report_approval || record.report_approval || null
  };
}
function reportDate(value) {
  if (!value) return "미기록";
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) ? value + "+09:00" : value);
  if (Number.isNaN(date.getTime())) return shown(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ". ") + ".";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
}
function reportSummary(model, equipment = {}) {
  const i = model.inspection, w = model.work, s = model.schedule;
  const fields = i ? [reportDate(i.inspected_at), equipment.equipment_name || i.equipment_id, i.inspector, i.model_status, i.operation_state, [i.noise, i.vibration, i.heat].map(shown).join(" / "), i.decision] : w ? [reportDate(w.work_date), equipment.equipment_name || w.equipment_id, w.worker, w.work_type, w.result] : [reportDate(s?.due_date), equipment.equipment_name || s?.equipment_id, s?.assignee, s?.type, s?.status || "점검 예정"];
  return `<div class="rp-summary" aria-label="보고서 요약">${fields.map((text) => `<span>${esc(shown(text))}</span>`).join("")}</div>`;
}
function renderReport(model, equipment = {}, { embedded = false } = {}) {
  const i = model.inspection, s = model.schedule, w = model.work, a = model.approval;
  const pending = !i && !w;
  const field2 = (label, value, extra = "") => `<div class="rp-field ${extra}"><dt>${label}</dt><dd>${esc(shown(value))}</dd></div>`;
  const equipmentField = `<div class="rp-field rp-equipment"><dt>설비명</dt><dd><strong>${esc(equipment.equipment_name || i?.equipment_id || s?.equipment_id || w?.equipment_id)}</strong><small>${esc([equipment.tag, equipment.location ? "위치 " + equipment.location : ""].filter(Boolean).join(" · "))}</small></dd></div>`;
  const author = i?.inspector || w?.worker || s?.assignee;
  const audit = a ? `<div class="rp-review"><strong>${a.status === "pending" ? "검토 상태" : "검토자"}${a.status === "pending" ? "" : " | " + esc(a.reviewer_name || "미기록")}</strong><div><p>${esc(a.status === "pending" ? "설비 팀장 승인 대기" : a.note || "검토 의견 미기록")}</p><span>${esc(a.status === "approved" ? "승인 완료" : a.status === "rejected" ? "반려" : "승인 대기")}${a.reviewed_at ? " · " + esc(reportDate(a.reviewed_at)) : ""}</span></div></div>` : `<div class="rp-review rp-review-empty"><strong>검토 이력</strong><div><p>${pending ? "점검 결과 보고서가 아직 작성되지 않았습니다." : "이 기록에 저장된 승인 이력이 없습니다."}</p></div></div>`;
  return `<article class="rp-report${embedded ? " rp-embedded" : ""}" aria-label="${w ? "정비 작업 보고서" : "현장 점검·정비 보고서"}">
    <header class="rp-heading"><h2>${w ? "정비 작업 보고서" : "현장 점검·정비 보고서"}</h2><strong>${pending ? "예정 담당자" : "작성자"} | ${esc(shown(author))}</strong>${pending ? '<span class="rp-pending">점검 예정 · 결과 미작성</span>' : ""}</header>
    <dl class="rp-row">${equipmentField}${field2(w ? "작업일" : pending ? "점검 예정일" : "점검 일시", reportDate(i?.inspected_at || w?.work_date || s?.due_date))}</dl>
    ${w ? `<dl class="rp-row">${field2("작업 구분", w.work_type)}${field2("작업 결과", w.result)}</dl><div class="rp-body"><dl>${field2("이상 내용", w.anomaly)}${field2("반복 이상", w.repeat_anomaly === "Y" ? "있음" : "없음")}${field2("작업 시간", w.downtime_h !== null && w.downtime_h !== void 0 && w.downtime_h !== "" ? w.downtime_h + "시간" : "")}</dl><dl>${field2("조치 내용", w.action, "rp-memo")}</dl></div>` : `<dl class="rp-row">${field2("운전 상태", i?.operation_state || "미작성")}${field2("추가 점검", i?.need_additional || "미작성")}</dl>
      <div class="rp-body"><dl>${field2("소음", i?.noise || "미작성")}${i?.noise_memo ? field2("소음 메모", i.noise_memo) : ""}${field2("진동", i?.vibration || "미작성")}${field2("발열", i?.heat || "미작성")}${field2("육안 상태", i ? [...Array.isArray(i.visual) ? i.visual : i.visual ? [i.visual] : [], i.visual_etc].filter(Boolean).join(", ") || "해당 없음" : "미작성")}</dl><dl>${field2(pending ? "예정 점검 내용" : "점검 메모", i ? i.memo : s?.items, "rp-memo")}</dl></div>
      ${i ? `<dl class="rp-row rp-decision">${field2("점검 후 대응", i.decision)}</dl>` : ""}`}
    ${s && i ? `<dl class="rp-row rp-schedule">${field2("후속 일정", `${s.type} · ${reportDate(s.due_date)} · ${s.assignee}`)}${field2("일정 내용", s.items)}</dl>` : ""}
    ${!pending ? '<p class="rp-declaration">위 내용과 같이 보고서를 제출합니다.</p>' : ""}${audit}
  </article>`;
}

// js/approvals.js
var APPROVAL_LABELS = { pending: "승인 대기", approved: "승인 완료", rejected: "반려" };
var approvalLabel = (status) => APPROVAL_LABELS[status] || "기존 기록";
var calendarApproved = (record) => !record.approval_status || record.approval_status === "approved";
var requestKey = () => `APR-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
var isCompletionRequest = (request) => request?.request_kind === "completion";
var isReportRequest = (request) => request?.submission_kind === "report" || request?.request_kind === "report";
var approvalKindLabel = (request) => isCompletionRequest(request) ? "완료 처리" : isReportRequest(request) ? "점검 보고서" : "일정 등록";
var approvalDueLabel = (request) => request?.due_date || (isReportRequest(request) && request.status === "pending" ? "팀장 승인 시 지정" : isReportRequest(request) && request.status === "rejected" ? "일정 미등록" : "-");
function mountApprovals(host, { auth: auth2, store: store2, esc: esc3, nameOf: nameOf2, equipmentOf = (id) => ({ equipment_name: nameOf2(id) }), toast: toast2, initialStatus = "pending", requestId = "" }) {
  const manager = auth2.user.role === "supervisor";
  const identity = () => JSON.stringify([auth2.user?.id, auth2.user?.role, auth2.user?.process]);
  const owner = identity();
  let requests = [], selected = Object.hasOwn(APPROVAL_LABELS, initialStatus) ? initialStatus : "pending", loading = false, deciding = false;
  let focusRequest = String(requestId || "");
  host.innerHTML = `<div class="page approvals-page">
    <div class="page-head"><div><h2>${manager ? "일정 승인" : "내 승인 요청"}</h2>
      <p class="muted">일정 등록과 완료 처리는 설비 팀장의 승인 후 반영됩니다.</p></div>
      <button class="btn" id="approvalRefresh" type="button">새로고침</button></div>
    <p class="approval-intro">${manager ? "점검 보고서·일정 등록·완료 요청을 확인해 주세요. 보고서는 승인할 때 일정의 날짜·담당자·내용을 지정합니다." : "승인 결과는 상단 알림에서 확인할 수 있습니다. 반려된 완료 요청은 캘린더에서 다시 요청해 주세요."}</p>
    <div id="approvalTabs" class="seg approval-tabs" role="group" aria-label="승인 상태"></div>
    <p id="approvalError" class="my-error" role="alert" hidden></p>
    <div id="approvalList" class="approval-list" aria-live="polite"></div>
  </div>`;
  const tabs = host.querySelector("#approvalTabs"), list = host.querySelector("#approvalList");
  const error = host.querySelector("#approvalError"), refresh = host.querySelector("#approvalRefresh");
  const active = () => list.isConnected && identity() === owner;
  const date = (value2) => esc3(String(value2 || "-").replace("T", " "));
  const value = (text) => esc3(Array.isArray(text) ? text.join(", ") || "-" : text || "-");
  const definition = (pairs) => `<dl class="approval-details">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${value(v)}</dd></div>`).join("")}</dl>`;
  function details(r) {
    const i = r.inspection, v = r.review;
    if (isCompletionRequest(r)) return `<div class="approval-completion-summary">
      ${definition([["일정 예정일", r.due_date], ["담당자", r.assignee], ["완료 요청 메모", r.completion_note]])}
      <p>${r.status === "approved" ? "승인된 일정은 캘린더에 완료로 표시됩니다." : r.status === "rejected" ? "이 요청은 반려되어 완료 처리되지 않았습니다. 이후 처리 결과는 캘린더에서 확인해 주세요." : "승인 전까지 캘린더의 일정은 예정 상태로 유지됩니다."}</p>
    </div>`;
    if (i) return renderReport({ inspection: i, approval: r }, equipmentOf(r.equipment_id), { embedded: true }) + (v ? `<h4>정비 검토 내용</h4>${definition([["정비 필요 여부", v.necessity], ["정비 대상", v.target], ["정비 내용", v.content], ["작업 우선도", v.priority], ["희망일", v.desired_date], ["예상 작업 시간", v.estimated_hours], ["작업 메모", v.work_memo]])}` : "");
    return `<details class="approval-inspection"><summary>일정 요청 내용 보기</summary><p>${value(r.items)}</p></details>`;
  }
  function render2() {
    const statuses = ["pending", "approved", "rejected"];
    tabs.innerHTML = statuses.map((status) => `<button type="button" data-status="${status}" aria-pressed="${status === selected}">${approvalLabel(status)} ${requests.filter((r) => r.status === status).length}</button>`).join("");
    const rows = requests.filter((r) => r.status === selected).sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
    list.innerHTML = rows.length ? rows.map((r) => `<article class="card approval-card" data-request="${esc3(r.request_id)}" tabindex="-1">
      <div class="approval-card-head"><div><div class="approval-card-labels"><span class="approval-kind${isCompletionRequest(r) ? " approval-kind-completion" : ""}">${approvalKindLabel(r)}</span><span class="approval-status approval-${r.status}">${approvalLabel(r.status)}</span></div>
        <h3><a href="#/equipment/${encodeURIComponent(r.equipment_id)}">${esc3(nameOf2(r.equipment_id))}</a> · ${esc3(!isCompletionRequest(r) && r.inspection ? r.inspection.decision || "점검 보고서" : r.type)}</h3></div>
        <p class="muted">요청자 ${esc3(r.requester_name || r.requested_by)}<br>${date(r.requested_at)}</p></div>
      <p class="approval-summary">${esc3(r.items)}</p>${details(r)}
      ${manager && r.status === "pending" ? `<form class="approval-decision" data-decide="${esc3(r.request_id)}" data-request-kind="${isCompletionRequest(r) ? "completion" : isReportRequest(r) ? "report" : "schedule"}">
        <h4>${isCompletionRequest(r) ? "완료 승인" : isReportRequest(r) ? "보고서 승인 및 일정 등록" : "승인할 일정"}</h4><div class="approval-fields">
        ${isCompletionRequest(r) ? "" : `<label>일정 구분<select name="type" required>${["정기 점검", "재확인", "추가 점검", "정비"].map((type) => `<option${type === r.type ? " selected" : ""}>${type}</option>`).join("")}</select></label>
        <label>예정일<input name="due_date" type="date" value="${esc3(r.due_date || "")}"${r.inspection?.inspected_at ? ` min="${esc3(r.inspection.inspected_at.slice(0, 10))}"` : ""} required></label>
        <label>담당자<input name="assignee" value="${esc3(r.assignee)}" required maxlength="100"></label>
        <label class="approval-wide">일정 내용<textarea name="items" required maxlength="4000">${esc3(r.items)}</textarea></label>`}
        <label class="approval-wide">검토 의견 <span class="muted">(반려 시 필수)</span><textarea name="note" maxlength="2000" placeholder="승인 의견 또는 반려 사유를 적어 주세요."></textarea></label>
        </div><p class="my-error approval-local-error" role="alert" hidden></p>
        <div class="approval-actions"><button class="btn" type="submit" name="action" value="reject" formnovalidate>반려</button>
        <button class="btn primary" type="submit" name="action" value="approve">${isCompletionRequest(r) ? "승인 후 완료 처리" : "승인 후 일정 등록"}</button></div></form>` : `<div class="approval-result">${definition([["일정 예정일", approvalDueLabel(r)], [isReportRequest(r) && r.status !== "approved" ? "제안 담당자" : "담당자", r.assignee]])}
          ${r.status !== "pending" ? `<p>처리자 ${esc3(r.reviewer_name || r.reviewed_by || "-")} · ${date(r.reviewed_at)}</p><p>검토 의견: ${value(r.note)}</p>` : `<p>${isCompletionRequest(r) ? "설비 팀장의 완료 승인을 기다리고 있습니다." : isReportRequest(r) ? "설비 팀장이 보고서를 검토하고 일정의 날짜·담당자·내용을 지정합니다. 승인 전에는 캘린더에 표시되지 않습니다." : "설비 팀장 확인을 기다리고 있습니다. 아직 캘린더에 등록되지 않았습니다."}</p>`}
          ${r.status === "approved" ? '<a class="btn sm" href="#/calendar">캘린더 보기</a>' : ""}</div>`}
    </article>`).join("") : `<div class="empty">${approvalLabel(selected)} 상태의 요청이 없습니다.</div>`;
    tabs.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
      if (deciding) return;
      selected = button.dataset.status;
      render2();
    }));
    list.querySelectorAll("[data-decide]").forEach((form2) => form2.addEventListener("submit", submitDecision));
  }
  async function load() {
    if (loading || deciding) return;
    loading = true;
    refresh.disabled = true;
    list.setAttribute("aria-busy", "true");
    error.hidden = true;
    try {
      const result = await auth2.request("/api/approvals");
      if (!active()) return;
      requests = result.requests || [];
      const target = focusRequest && requests.find((r) => r.request_id === focusRequest);
      if (target && Object.hasOwn(APPROVAL_LABELS, target.status)) selected = target.status;
      render2();
      if (focusRequest) {
        const card = [...list.querySelectorAll("[data-request]")].find((node) => node.dataset.request === focusRequest);
        if (card) {
          card.focus({ preventScroll: true });
          card.scrollIntoView({ block: "start" });
        }
        focusRequest = "";
      }
    } catch (failure) {
      if (active()) {
        error.textContent = failure.message;
        error.hidden = false;
      }
    } finally {
      loading = false;
      if (active()) {
        refresh.disabled = false;
        list.setAttribute("aria-busy", "false");
      }
    }
  }
  async function submitDecision(event) {
    event.preventDefault();
    if (!active() || deciding || loading) return;
    const form2 = event.currentTarget, values = Object.fromEntries(new FormData(form2));
    const completion = form2.dataset.requestKind === "completion";
    const action = event.submitter?.value;
    if (!["approve", "reject"].includes(action)) return;
    const localError = form2.querySelector(".approval-local-error");
    const note = String(values.note || "").trim();
    if (action === "reject" && !note) {
      localError.textContent = "반려 사유를 입력해 주세요.";
      localError.hidden = false;
      form2.elements.note.focus();
      return;
    }
    if (!completion && action === "approve") {
      if (!String(values.assignee || "").trim() || !String(values.items || "").trim() || !values.due_date) {
        localError.textContent = "예정일·담당자·일정 내용을 입력해 주세요.";
        localError.hidden = false;
        return;
      }
      if (!form2.checkValidity()) {
        form2.reportValidity();
        return;
      }
      const inspectedDay = requests.find((request) => request.request_id === form2.dataset.decide)?.inspection?.inspected_at?.slice(0, 10);
      if (inspectedDay && values.due_date < inspectedDay) {
        localError.textContent = "일정 예정일은 점검일과 같거나 이후로 선택해 주세요.";
        localError.hidden = false;
        form2.elements.due_date.focus();
        return;
      }
    }
    localError.hidden = true;
    deciding = true;
    refresh.disabled = true;
    host.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    try {
      if (completion) await store2.decideCompletion({ request_id: form2.dataset.decide, action, note });
      else await store2.decideApproval({
        request_id: form2.dataset.decide,
        action,
        note,
        ...action === "approve" ? { schedule: { type: values.type, due_date: values.due_date, assignee: values.assignee.trim(), items: values.items.trim() } } : {}
      });
      if (!active()) return;
      await store2.refreshMaintenance().catch(() => {
      });
      if (!active()) return;
      selected = action === "approve" ? "approved" : "rejected";
      toast2(completion ? action === "approve" ? "완료를 승인했습니다. 캘린더에 완료로 표시됩니다." : "완료 요청을 반려했습니다. 일정은 예정 상태로 유지됩니다." : action === "approve" ? "승인했습니다. 캘린더에 일정이 등록되었습니다." : "요청을 반려했습니다. 캘린더에 등록되지 않습니다.");
    } catch (failure) {
      if (active()) {
        localError.textContent = failure.message;
        localError.hidden = false;
      }
      deciding = false;
      if (active()) {
        refresh.disabled = false;
        host.querySelectorAll("button").forEach((button) => {
          button.disabled = false;
        });
      }
      return;
    } finally {
      deciding = false;
    }
    if (active()) await load();
  }
  refresh.addEventListener("click", load);
  void load();
}

// js/mypage.js
function mountMyPage(host, { auth: auth2, esc: esc3, nameOf: nameOf2 }) {
  const user = auth2.user;
  host.innerHTML = `
    <div class="page mypage">
      <section class="card my-profile" aria-labelledby="myProfileTitle">
        <span class="role-avatar avatar-${user.avatar}"><img src="assets/brand/role-people.png" alt=""></span>
        <h2 id="myProfileTitle">${esc3(user.name)}님의 담당 현황</h2>
        <p class="muted">포스코 포항제철소</p>
        <dl class="my-fields">
          <div><dt>이름</dt><dd>${esc3(user.name)}</dd></div>
          <div><dt>담당 범위</dt><dd>${esc3(user.scope)}</dd></div>
          <div><dt>권한</dt><dd>${esc3(user.title)}</dd></div>
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
  const target = host.querySelector("#myActivity");
  const refresh = host.querySelector("#myRefresh");
  const logout = host.querySelector("#myLogout");
  const logoutError = host.querySelector("#myLogoutError");
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    logout.textContent = "선택 화면으로 이동 중…";
    logoutError.hidden = true;
    try {
      await auth2.logout();
      window.location.reload();
    } catch (error) {
      if (!logout.isConnected) return;
      logoutError.textContent = error.message || "관리자 선택으로 돌아가지 못했습니다. 다시 시도해 주세요.";
      logoutError.hidden = false;
      logout.disabled = false;
      logout.textContent = "관리자 바꾸기";
    }
  });
  const date = (value) => esc3(String(value || "-").replace("T", " ").replace("+09:00", " (한국 시각)"));
  const equipment = (id) => `<a href="#/equipment/${encodeURIComponent(id)}">${esc3(nameOf2(id))}</a>`;
  const table = (heads, rows, empty) => {
    if (!rows.length) return `<p class="my-empty">${empty}</p>`;
    const equipmentIndex = heads.indexOf("설비");
    const categoryIndex = heads.findIndex((h) => h === "구분" || h === "일정 종류");
    const wide = (h) => h === "내용" || h === "검토 의견";
    const cards = rows.map((cells) => `<li class="my-record-card">
      <div class="my-record-head">${categoryIndex >= 0 ? `<span class="my-record-kind">${cells[categoryIndex]}</span>` : ""}
        <h4>${cells[equipmentIndex]}</h4></div>
      <dl class="my-record-fields">${cells.map((c, i) => i === equipmentIndex || i === categoryIndex ? "" : `<div class="${wide(heads[i]) ? "my-record-wide" : ""}"><dt>${heads[i]}</dt><dd>${c}</dd></div>`).join("")}</dl>
      </li>`).join("");
    return `<div class="my-table-scroll"><table><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <ul class="my-record-cards">${cards}</ul>`;
  };
  async function load() {
    refresh.disabled = true;
    target.setAttribute("aria-busy", "true");
    try {
      const [data, approvalData] = await Promise.all([auth2.request("/api/me/activity"), auth2.request("/api/approvals")]);
      if (!target.isConnected || data.user.id !== auth2.user?.id) return;
      const authored = [
        ...data.inspections.map((r) => ({ ...r, kind: "현장 점검", when: r.inspected_at, result: r.decision, content: r.memo })),
        ...data.calendar_schedules.map((r) => ({ ...r, kind: "캘린더 일정", when: r.due_date, result: r.status, content: r.items }))
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.when).localeCompare(String(a.when)));
      const ownRequests = (approvalData.requests || []).filter((r) => String(r.requested_by) === String(user.id)).sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)));
      target.innerHTML = `
        <div class="my-counts">
          <div class="card"><span>내가 작성한 점검</span><strong>${data.counts.authored}<small>건</small></strong></div>
          <div class="card"><span>내가 완료한 일정</span><strong>${data.counts.completions}<small>건</small></strong></div>
        </div>
        <section class="card my-records" aria-labelledby="myInspections">
          <h3 id="myInspections">내가 작성한 점검</h3>
          <p class="my-note">내가 작성한 현장 점검과 캘린더에서 직접 추가한 일정을 함께 표시합니다.</p>
          <p class="my-note">승인 대기·반려된 점검도 작성 기록에 남으며, 캘린더에는 승인 후 표시됩니다. <a href="#/approvals">승인 요청 확인</a></p>
          ${table(
        ["구분", "점검 일시 / 일정 예정일", "설비", "대응 결정 / 상태", "일정 승인", "내용"],
        authored.map((r) => [esc3(r.kind), date(r.when), equipment(r.equipment_id), esc3(r.result), esc3(approvalLabel(r.approval_status)), esc3(r.content || "-")]),
        "아직 이 계정으로 작성한 점검이나 캘린더 일정이 없습니다."
      )}
        </section>
        <section class="card my-records" aria-labelledby="myApprovalRequests">
          <h3 id="myApprovalRequests">내 승인 요청</h3>
          <p class="my-note">대기 ${ownRequests.filter((r) => r.status === "pending").length}건 · 승인 ${ownRequests.filter((r) => r.status === "approved").length}건 · 반려 ${ownRequests.filter((r) => r.status === "rejected").length}건 · <a href="#/approvals">요청 내용과 검토 의견 보기</a></p>
          ${table(
        ["구분", "요청 일시", "설비", "일정 예정일", "승인 상태", "내용", "검토 의견"],
        ownRequests.map((r) => [esc3(approvalKindLabel(r)), date(r.requested_at), equipment(r.equipment_id), date(approvalDueLabel(r)), esc3(approvalLabel(r.status)), esc3(r.items), esc3(r.note || "-")]),
        "아직 제출한 승인 요청이 없습니다."
      )}
        </section>
        <section class="card my-records" aria-labelledby="myCompletions">
          <h3 id="myCompletions">내가 완료 처리한 일정</h3>
          <p class="my-note">완료 시각은 실제 서버의 한국 시각이며, 화면의 시뮬레이션 날짜와 다를 수 있습니다.</p>
          ${table(
        ["완료 시각", "설비", "일정 종류", "일정 담당자", "내용"],
        data.completions.map((r) => [date(r.completed_at), equipment(r.equipment_id), esc3(r.type), esc3(r.assignee), esc3(r.items)]),
        "아직 이 계정으로 완료 처리한 일정이 없습니다."
      )}
        </section>`;
    } catch (error) {
      if (target.isConnected) target.innerHTML = `<p class="my-error" role="alert">${esc3(error.message || "기록을 불러오지 못했습니다.")} 새로고침으로 다시 시도해 주세요.</p>`;
    } finally {
      if (target.isConnected) target.setAttribute("aria-busy", "false");
      refresh.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  load();
}

// js/completions.js
var completionStatus = (record) => record?.status === "완료" ? "completed" : ["pending", "rejected"].includes(record?.completion_approval_status) ? record.completion_approval_status : "ready";
var completionLabel = (record) => ({ pending: "완료 승인 대기", rejected: "완료 요청 반려", completed: "완료", ready: "" })[completionStatus(record)];
var completionResultMessage = (request) => request?.status === "approved" ? "이미 완료 승인된 요청입니다. 캘린더에 완료로 표시됩니다." : request?.status === "rejected" ? "완료 요청이 반려되었습니다. 요청 결과를 확인한 뒤 다시 요청해 주세요." : "설비 팀장에게 완료 승인을 요청했습니다.";
function createCompletionActions({ store: store2, getUser, requestKey: requestKey2 }) {
  const attempts = /* @__PURE__ */ new Map(), busy = /* @__PURE__ */ new Set();
  const identity = () => JSON.stringify([getUser()?.id, getUser()?.role, getUser()?.process]);
  const token = (id) => `${identity()}:${id}`;
  return {
    isBusy: (id) => busy.has(token(id)),
    async complete(id) {
      const user = getUser(), owner = identity(), key = token(id);
      const record = store2.db.follow_ups.find((row) => row.follow_up_id === id);
      if (!user || !record) throw Error("일정을 찾지 못했습니다. 캘린더를 다시 열어 주세요.");
      if (busy.has(key)) return { ignored: true };
      if (completionStatus(record) === "completed") return { ignored: true };
      if (completionStatus(record) === "pending") throw Error("완료 승인을 기다리고 있습니다. 승인 요청에서 확인해 주세요.");
      busy.add(key);
      try {
        const requested2 = user.role !== "supervisor";
        let result;
        if (requested2) {
          const basis = JSON.stringify([record.completion_approval_request_id || "", record.completion_approval_status || ""]);
          if (attempts.get(key)?.basis !== basis) attempts.set(key, { basis, payload: { follow_up_id: id, request_key: requestKey2() } });
          result = await store2.submitCompletion(attempts.get(key).payload);
        } else {
          result = await store2.save({ follow_ups: [{ follow_up_id: id, status: "완료" }] }, { operation: "update" });
        }
        attempts.delete(key);
        return { requested: requested2, result, stale: identity() !== owner };
      } finally {
        busy.delete(key);
      }
    }
  };
}

// js/approval-inbox.js
function createApprovalInbox({ auth: auth2, onChange = () => {
}, onError = () => {
} }) {
  let items = [], unreadCount = 0, owner = null, generation = 0;
  let tail = Promise.resolve(), refreshJob = null, timer = null, visibilityTarget = null;
  const identity = () => auth2.user?.id ? JSON.stringify([auth2.user.id, auth2.user.role || "", auth2.user.process || ""]) : null;
  const publish = () => onChange({ items, unreadCount });
  function invalidate(clear = false) {
    generation += 1;
    tail = Promise.resolve();
    refreshJob = null;
    if (clear) {
      items = [];
      unreadCount = 0;
      publish();
    }
  }
  function syncOwner() {
    const next = identity();
    if (next !== owner) {
      owner = next;
      invalidate(true);
    }
    return next;
  }
  function current(epoch, key) {
    syncOwner();
    return generation === epoch && owner === key;
  }
  function queue(operation, work) {
    const key = syncOwner(), epoch = generation;
    if (!key) return Promise.resolve(false);
    const result = tail.then(async () => {
      if (!current(epoch, key)) return false;
      try {
        const apply = await work();
        if (!current(epoch, key)) return false;
        apply();
        publish();
        return true;
      } catch (error) {
        if (current(epoch, key)) onError(error, { operation });
        return false;
      }
    });
    tail = result.catch(() => false);
    return result;
  }
  const countOf = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback;
  function refresh() {
    syncOwner();
    if (refreshJob) return refreshJob;
    const result = queue("refresh", async () => {
      const response = await auth2.request("/api/notifications/inbox");
      if (!Array.isArray(response.notifications)) throw Error("승인 알림을 읽지 못했습니다. 다시 시도해 주세요.");
      const nextItems = response.notifications.map((item) => ({ ...item }));
      const nextCount = countOf(response.unread_count, nextItems.filter((item) => !item.read).length);
      return () => {
        items = nextItems;
        unreadCount = nextCount;
      };
    });
    refreshJob = result;
    result.finally(() => {
      if (refreshJob === result) refreshJob = null;
    });
    return result;
  }
  function markRead(eventIds) {
    syncOwner();
    const ids = [...new Set((eventIds || []).filter((id) => typeof id === "string" && id))];
    if (!ids.length) return Promise.resolve(true);
    refreshJob = null;
    return queue("read", async () => {
      const response = await auth2.request("/api/notifications/read", { event_ids: ids });
      if (response.ok !== true) throw Error("알림을 읽음으로 표시하지 못했습니다. 다시 시도해 주세요.");
      return () => {
        const selected = new Set(ids);
        items = items.map((item) => selected.has(item.event_id) ? { ...item, read: true } : item);
        unreadCount = countOf(response.unread_count, items.filter((item) => !item.read).length);
      };
    });
  }
  const onVisibility = () => {
    if (!visibilityTarget?.hidden) void refresh();
  };
  function start() {
    if (timer !== null) return;
    visibilityTarget = globalThis.document || null;
    visibilityTarget?.addEventListener("visibilitychange", onVisibility);
    timer = setInterval(() => {
      if (!visibilityTarget?.hidden) void refresh();
    }, 5e3);
    void refresh();
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    visibilityTarget?.removeEventListener("visibilitychange", onVisibility);
    visibilityTarget = null;
    invalidate();
  }
  function reset() {
    owner = identity();
    invalidate(true);
  }
  return { get items() {
    return items;
  }, get unreadCount() {
    return unreadCount;
  }, refresh, markRead, start, stop, reset };
}

// js/fan-images.js
var SETS = {
  sinter: { set: "01", DE: [78.1, 47.3], NDE: [41.9, 47.3] },
  steel: { set: "02", DE: [78.8, 57.9], NDE: [65.7, 57.2] }
};
var STATES = { 정상: "normal", 주의: "warning", 경보: "alarm" };
function getFanImage(equipment, mode, status) {
  const model = SETS[equipment.process];
  if (!model || !STATES[status] || !["light", "dark"].includes(mode)) {
    throw new Error("지원하지 않는 설비 이미지 조합입니다.");
  }
  return {
    ...model,
    ratio: "1672 / 941",
    src: `assets/fan-states/fan${model.set}_${mode}_${STATES[status]}.png`
  };
}
var requested = /* @__PURE__ */ new WeakMap();
function setFanImage(element, src) {
  if (requested.get(element) === src) return;
  requested.set(element, src);
  const image = new Image();
  image.src = src;
  const apply = () => {
    if (element.isConnected && requested.get(element) === src) element.src = src;
  };
  image.decode().then(apply, apply);
}

// js/playback.js
var SPEEDS = [0, 1, 10, 60, 120, 600];
var validSpeed = (value) => typeof value === "number" && SPEEDS.includes(value);
var validMs = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 8e15;
function playbackDatasetId(text, equipment, start) {
  let hash = 2166136261;
  const source = text + JSON.stringify(equipment.map((e) => [e.equipment_id, e.demo_start_index])) + start;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${source.length}:${hash >>> 0}`;
}
function createPlayback({ now, read, write, initialSpeed = 10 }) {
  let key = null, dataset = null, savedAt = -Infinity, savedValue = "";
  const state = {
    ms: 0,
    speed: validSpeed(initialSpeed) ? initialSpeed : 10,
    last: now(),
    restore(userId, datasetId) {
      key = `playback.v1.${userId}`;
      dataset = datasetId;
      savedAt = -Infinity;
      savedValue = "";
      let saved;
      try {
        saved = read(key);
      } catch {
      }
      state.ms = 0;
      if (saved?.version === 1 && saved.dataset === dataset && validMs(saved.ms) && validSpeed(saved.speed)) {
        state.ms = saved.ms;
        state.speed = saved.speed;
      }
      state.last = now();
    },
    advance() {
      const t = now();
      state.ms += Math.max(0, t - state.last) * state.speed;
      state.last = t;
    },
    setSpeed(speed) {
      if (!validSpeed(speed)) return;
      state.advance();
      state.speed = speed;
      state.save(true);
    },
    reset() {
      state.ms = 0;
      state.last = now();
      state.save(true);
    },
    save(force = false) {
      if (!key || !validMs(state.ms)) return;
      const t = now();
      if (!force && t - savedAt < 1e3) return;
      const value = { version: 1, dataset, ms: state.ms, speed: state.speed };
      const serialized = JSON.stringify(value);
      if (serialized === savedValue) return;
      try {
        write(key, value);
        savedAt = t;
        savedValue = serialized;
      } catch {
      }
    }
  };
  return state;
}

// js/alarm-reporter.js
function createAlarmReporter({ userId, revision, roundId = "", equipmentIds, request, read, write, now = Date.now }) {
  const key = `alarm-report.v1.${userId}.${revision}${roundId ? "." + roundId : ""}`;
  const allowed = new Set(equipmentIds), pending = /* @__PURE__ */ new Map(), sent = /* @__PURE__ */ new Set();
  let busy = false, nextAttempt = 0, attempts = 0, blocked = "", lastError = "";
  let disposed = false, activeController = null;
  try {
    const saved = read(key);
    for (const id of saved?.sent || []) if (allowed.has(id)) sent.add(id);
    for (const row of saved?.pending || []) {
      if (allowed.has(row.equipment_id) && Number.isInteger(row.sample_index) && row.sample_index >= 0)
        pending.set(row.equipment_id, row.sample_index);
    }
  } catch {
  }
  function save() {
    try {
      write(key, { sent: [...sent], pending: [...pending].map(([equipment_id, sample_index]) => ({ equipment_id, sample_index })) });
    } catch {
    }
  }
  return {
    capture(id, previous, current, firstAlarm) {
      if (disposed || !revision || !allowed.has(id) || sent.has(id) || pending.has(id)) return;
      if (!Number.isInteger(previous) || firstAlarm < 0 || previous >= firstAlarm || current < firstAlarm) return;
      pending.set(id, firstAlarm);
      save();
    },
    async flush() {
      if (disposed || !revision || busy || blocked || !pending.size || now() < nextAttempt) return;
      busy = true;
      const [equipment_id, sample_index] = pending.entries().next().value;
      const controller = new AbortController();
      activeController = controller;
      const timeout = setTimeout(() => controller.abort(), 15e3);
      try {
        await request("/api/notifications/playback", {
          actor_id: userId,
          revision,
          equipment_id,
          sample_index,
          ...roundId ? { round_id: roundId } : {}
        }, { signal: controller.signal });
        if (disposed) return;
        pending.delete(equipment_id);
        sent.add(equipment_id);
        save();
        attempts = 0;
        nextAttempt = 0;
        lastError = "";
      } catch (error) {
        if (disposed) return;
        if ([400, 401, 403, 409].includes(error.status)) blocked = "담당자·데이터 상태를 확인하려면 새로고침해 주세요.";
        else {
          attempts++;
          nextAttempt = now() + Math.min(6e4, 1e3 * 2 ** Math.min(attempts, 6));
        }
        lastError = "서버 연결을 기다리는 중입니다. 경보 전송을 다시 시도합니다.";
      } finally {
        clearTimeout(timeout);
        busy = false;
        activeController = null;
      }
    },
    dispose() {
      disposed = true;
      activeController?.abort();
    },
    get status() {
      if (!revision) return "자동 경보 연결을 불러오지 못했습니다. 새로고침해 주세요.";
      if (blocked) return blocked;
      if (lastError) return `${lastError} (대기 ${pending.size}건)`;
      return pending.size ? `새 경보 ${pending.size}건을 서버로 전달 중입니다.` : "일반 데이터 재생의 새 경보를 서버로 자동 전달합니다.";
    }
  };
}

// js/experience-replay.js
function createExperienceReplay({
  userId,
  revision,
  request,
  read,
  write,
  onRound,
  onError = () => {
  },
  storageNamespace = "experience",
  randomId = () => crypto.randomUUID()
}) {
  const resetKey = `${storageNamespace}.reset.${userId}.${revision}`;
  let current = null, refreshing = null, resetting = false, stopped = false, timer = null;
  function apply(round) {
    if (!round || typeof round.id !== "string" || round.revision !== revision)
      throw Error("체험 데이터가 변경되었습니다. 새로고침해 주세요.");
    if (stopped || current?.id === round.id) return;
    current = round;
    onRound({ ...round });
  }
  async function refresh() {
    if (stopped || resetting) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        apply(await request("/api/notifications/round"));
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }
  return {
    get round() {
      return current;
    },
    get busy() {
      return resetting;
    },
    async start() {
      await refresh();
      timer = setInterval(() => {
        void refresh().catch(onError);
      }, 5e3);
    },
    refresh,
    async reset() {
      if (resetting || stopped) return;
      resetting = true;
      try {
        if (refreshing) await refreshing;
        if (!current) throw Error("체험 연결을 확인한 후 다시 시도해 주세요.");
        let attempt;
        try {
          attempt = read(resetKey);
        } catch {
        }
        if (!attempt || attempt.expected_round_id !== current.id)
          attempt = { expected_round_id: current.id, request_id: randomId() };
        try {
          write(resetKey, attempt);
        } catch {
        }
        const round = await request("/api/notifications/round/reset", attempt);
        apply(round);
        try {
          write(resetKey, null);
        } catch {
        }
        return round;
      } finally {
        resetting = false;
      }
    },
    stop() {
      stopped = true;
      if (timer !== null) clearInterval(timer);
    }
  };
}

// js/experience-ui.js
var isExperience = location.pathname.startsWith("/experience/");
if (isExperience) {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = "/experience/manifest.webmanifest";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/experience.css";
  link.dataset.experienceStyle = "1";
  document.head.append(link);
}
async function mountExperienceStart(host, { auth: auth2, esc: esc3, message = "" }) {
  if (!isExperience) return;
  if (!document.querySelector("link[data-experience-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/experience.css";
    link.dataset.experienceStyle = "1";
    document.head.append(link);
  }
  host.setAttribute("aria-label", "설비 상태 체험 시작");
  host.innerHTML = `<main class="experience-start"><div class="experience-start-wrap">
    <a class="experience-brand" href="/experience/" aria-label="GB system 체험 시작"><img src="/assets/brand/pwa-user-v3-192.png" width="48" height="48" alt=""><span>GB system<small>설비 상태 체험</small></span></a>
    <button class="experience-scope-card" id="experienceBegin" type="button">
      <span class="experience-card-badge">전체 공정</span><strong>POSCO 포항 제철소</strong>
      <span>설비 상태를 살펴보고, 새롭게 발생한 경보를 확인해 보세요.</span>
      <b>체험 시작하기 <span aria-hidden="true">→</span></b>
    </button>
    <p class="experience-feedback" id="experienceStartMessage" role="status" aria-live="polite">${esc3(message)}</p>
  </div></main>`;
  const button = host.querySelector("#experienceBegin");
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (!auth2.user) {
        const result = await auth2.request("/api/demo/select", { username: "all" });
        auth2.user = result.user;
        auth2.csrf = result.csrf;
      }
      history.replaceState(null, "", "/experience/#/");
      location.reload();
    } catch (error) {
      host.querySelector("#experienceStartMessage").textContent = error.message || "체험을 시작하지 못했습니다. 다시 시도해 주세요.";
      button.disabled = false;
    }
  };
}

// js/app.js
var $ = (s, r = document) => r.querySelector(s);
var $$ = (s, r = document) => [...r.querySelectorAll(s)];
var esc2 = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var pad = (n) => String(n).padStart(2, "0");
var DOW = ["일", "월", "화", "수", "목", "금", "토"];
var hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
var ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
var ymdhm = (d) => `${ymd(d)} ${hhmm(d)}`;
var mdhm = (d) => `${pad(d.getMonth() + 1)}. ${pad(d.getDate())}.  ${hhmm(d)}`;
var toLocalInput = (d) => `${ymd(d)}T${hhmm(d)}`;
var clockText = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. (${DOW[d.getDay()]}) ${hhmm(d)}:${pad(d.getSeconds())}`;
var sameDay = (a, b) => ymd(a) === ymd(b);
var shortTime = (d) => sameDay(d, simNow()) ? hhmm(d) : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm(d)}`;
var fmtDate = (s) => s ? String(s).replace("T", " ") : "-";
var duration = (min) => {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return `${h}시간 ${m}분`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간`;
};
var idStamp = (d) => `${ymd(d).replace(/-/g, "")}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
var svg = (paths, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
var ICON = {
  // [UI UPDATE 2026-10-22] 헤더와 같은 사람 아이콘을 사이드바에서도 사용.
  user: '<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.2"/><circle cx="16" cy="12.6" r="4.8"/><path d="M7.4 25.6c1.9-3.9 5-5.9 8.6-5.9s6.7 2 8.6 5.9"/></svg>',
  home: svg('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'),
  factory: svg('<path d="M3 21V10.5l5 3.5v-3.5l5 3.5v-3.5l4 2.8V4h3.5v17z"/><path d="M6.5 17.5h2M11 17.5h2"/>'),
  chart: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 15l3-4 3 2 4-6"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  wrench,
  doc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', "chev"),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'),
  // 판단 근거 카드 아이콘 — 카드 내용에 맞춘 그림
  rSustained: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.6 1.6"/>', "r-ico"),
  rConsecutive: svg('<path d="M3 20h18"/><path d="M5.5 16v-3M9.5 16V9M13.5 16v-5M17.5 16V6"/><path d="M4 6.5l3-2 3 2"/>', "r-ico"),
  rMulti: svg('<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5 12 21l9-4.5"/>', "r-ico"),
  rUnusual: svg('<path d="M2 13h3l2-5 3.5 10 3-7 1.5 2H16"/><path d="M20 5v6"/><circle cx="20" cy="15" r=".6" fill="currentColor"/>', "r-ico"),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  prev: svg('<path d="M15 6l-6 6 6 6"/>'),
  next: svg('<path d="M9 6l6 6-6 6"/>'),
  siren: svg('<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14v3H5zM12 3V1.5M4.2 6.2 3 5M19.8 6.2 21 5"/>'),
  tri: '<svg class="tri" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1z" fill="currentColor"/><path d="M12 9v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.4" fill="#fff"/></svg>'
};
var REASON_ICON = { sustained: ICON.rSustained, consecutive: ICON.rConsecutive, multi: ICON.rMulti, unusual: ICON.rUnusual };
var STATUS_BADGE = { 경보: "우선 확인 필요", 주의: "상태 확인 필요", 정상: "정상 운전 중" };
var PROCESSES = [
  { key: "sinter", name: "소결공정" },
  { key: "iron", name: "제선공정" },
  { key: "steel", name: "제강공정" },
  { key: "casting", name: "연주공정" },
  { key: "rolling", name: "압연공정" }
];
var processName = (k) => PROCESSES.find((p) => p.key === k)?.name || "전체 제철소";
var HOME_MAP = { light: "assets/img/map_light.png", dark: "assets/img/map_dark.png" };
var PROC_IMG = {
  sinter: { light: "assets/img/plant_sinter_light.png", dark: "assets/img/plant_sinter_dark.png" },
  steel: { light: "assets/img/plant_steel_light.png", dark: "assets/img/plant_steel_dark.png" }
};
var procImg = (p) => (PROC_IMG[p] || HOME_MAP)[theme()];
var theme = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
function syncBrandIcons() {
  for (const icon2 of $$("link[data-brand-icon]")) icon2.href = "assets/brand/symbol-navy.png";
}
syncBrandIcons();
var ZONES = [
  { process: "sinter", plant: "소결공장", cx: 850, cy: 415, rx: 270, ry: 130, ax: 768, ay: 302 },
  { process: "steel", plant: "제강공장", cx: 1390, cy: 550, rx: 280, ry: 145, ax: 1344, ay: 464 }
];
var STATUS_RANK2 = { 정상: 0, 주의: 1, 경보: 2 };
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}
var SIM_START = new Date(2026, 9, 26, 14, 0, 0).getTime();
var sim = createPlayback({
  now: () => performance.now(),
  read: (key) => store.pref.get(key, null),
  write: (key, value) => store.pref.set(key, value),
  initialSpeed: auth.experience ? 0 : Number(store.pref.get("speed", 10))
});
sim.elapsed = 0;
window.addEventListener("pagehide", () => sim.save(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) sim.save(true);
});
var simNow = () => new Date(SIM_START + sim.ms);
var fans = [];
var alarmReporter = null;
var replayController = null, playbackDataId = null;
var fanById = (id) => fans.find((f) => f.eq.equipment_id === id);
var timeOf = (f, i) => new Date(SIM_START + (i - f.start) * 6e4);
var anyExceed2 = (an, i) => i >= RULE.baselineN && Object.values(an.exceed[i]).some(Boolean);
function updateFans() {
  for (const f of fans) {
    const prev = f.snap?.status;
    const nextIndex = Math.min(f.start + sim.elapsed, f.an.n - 1);
    if (f.snap && f.idx === nextIndex) continue;
    alarmReporter?.capture(f.eq.equipment_id, f.snap ? f.idx : void 0, nextIndex, f.an.firstAlarm);
    f.idx = nextIndex;
    f.snap = snapshot(f.an, f.idx);
    f.lastAlarmTime = f.snap.lastEvent != null ? timeOf(f, f.snap.lastEvent).getTime() : null;
    f.events = null;
    if (prev && STATUS_RANK2[f.snap.status] > STATUS_RANK2[prev]) pushAlarm(f, f.snap.status, timeOf(f, f.idx));
  }
}
var alarms = { list: [], seq: 0, browser: store.pref.get("notify", false) };
var approvalInbox = null, approvalInboxError = "";
function alarmText(f, type) {
  const r = reasonSummary(f);
  return {
    title: type === "경보" ? f.snap.sustained ? "이상 상태 지속" : "경보 발생" : "이상 상태 감지",
    note: r.sub || r.title
  };
}
var ALARM_MERGE_MIN = 60;
function pushAlarm(f, type, at, { silent = false } = {}) {
  const t = alarmText(f, type);
  const same = alarms.list.find((x) => x.eqId === f.eq.equipment_id && x.type === type && (at - x.at) / 6e4 <= ALARM_MERGE_MIN);
  if (same) {
    Object.assign(same, t, { at, count: (same.count || 1) + 1 });
    if (!same.read) {
      alarms.list.sort((x, y) => y.at - x.at);
      renderAlarmBadge();
      renderToasts();
    }
    return;
  }
  const a = { id: ++alarms.seq, eqId: f.eq.equipment_id, name: f.eq.equipment_name, location: f.eq.location, type, ...t, at, read: false, count: 1 };
  alarms.list.unshift(a);
  alarms.list.sort((x, y) => y.at - x.at);
  alarms.list = alarms.list.slice(0, 60);
  renderAlarmBadge();
  if (!silent) {
    showAlarmToast(a);
    notifyBrowser(a);
  }
}
function seedAlarms() {
  for (const f of fans) {
    const st = f.snap.status;
    if (st === "정상") continue;
    const onset = st === "경보" ? f.snap.firstAlarm : fanEvents(f).find((e) => e.type === "주의")?.i ?? f.idx;
    pushAlarm(f, st, timeOf(f, onset), { silent: true });
  }
}
function renderAlarmBadge() {
  const n = alarms.list.filter((a) => !a.read).length + (approvalInbox?.unreadCount || 0);
  const b = $("#alarmBadge");
  if (!b) return;
  b.textContent = n > 99 ? "99+" : String(n);
  b.hidden = n === 0;
  $("#alarmBtn").setAttribute("aria-label", `알림 · 안 읽음 ${n}건`);
  syncUserButton();
  if (!$("#alarmPop").hidden) renderAlarmPop();
}
function renderAlarmPop() {
  const popup = $("#alarmPop");
  const scrollTop = popup.querySelector(".ap-list")?.scrollTop || 0;
  const active = popup.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = active?.dataset.noticeId ? `[data-notice-id="${CSS.escape(active.dataset.noticeId)}"]` : active?.dataset.alarm ? `[data-alarm="${CSS.escape(active.dataset.alarm)}"]` : active?.id ? `#${CSS.escape(active.id)}` : null;
  const list = alarms.list;
  const notices = approvalInbox?.items || [];
  const unread = list.filter((a) => !a.read).length + (approvalInbox?.unreadCount || 0);
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const noticeLink = (n) => `#/approvals?status=${encodeURIComponent(n.approval_status || (n.kind === "approval_approved" ? "approved" : n.kind === "approval_rejected" ? "rejected" : "pending"))}&request=${encodeURIComponent(n.request_id || "")}`;
  const noticeIcon = (n) => n.kind === "approval_approved" ? ICON.check : n.kind === "approval_rejected" ? ICON.close : ICON.doc;
  const noticeBody = (n) => String(n.body || "").split("\n").filter((line) => line !== `요청 번호: ${n.request_id}`).join("\n");
  const noticeTime = (n) => String(n.created_at || "").replace("T", " ").replace(/\+09:00$/, "");
  const markup = `
    <div class="ap-head"><b>알림</b><span class="muted">안 읽음 ${unread}건</span>
      <button class="link-btn" type="button" id="alarmReadAll"${unread ? "" : " disabled"}>모두 읽음</button></div>
    ${auth.experience ? "" : `<label class="ap-opt"><input type="checkbox" id="alarmBrowser"${alarms.browser && perm === "granted" ? " checked" : ""}${perm === "unsupported" || perm === "denied" ? " disabled" : ""}>
      브라우저 알림도 받기${perm === "denied" ? " (브라우저에서 차단됨)" : ""}</label>`}
    <div class="ap-list">
      ${auth.experience ? "" : `<h3 class="ap-section-title">승인 업무 <span>${approvalInbox?.unreadCount || 0}</span></h3>
      ${approvalInboxError ? '<p class="ap-inbox-error" role="status">승인 알림을 갱신하지 못했습니다. 연결 후 다시 확인해 주세요.</p>' : ""}
      ${notices.length ? notices.map((n) => `<a class="ap-item ap-notice-item${n.read ? "" : " unread"}" href="${noticeLink(n)}" data-notice-id="${esc2(n.event_id || n.id)}">
        <span class="ap-notice-icon ${esc2(n.kind)}" aria-hidden="true">${noticeIcon(n)}</span>
        <span class="ap-body"><b>${esc2(n.title)}</b><span class="ap-notice-kind">${esc2(nameOf(n.equipment_id))}</span>
          <small class="ap-notice-message">${esc2(noticeBody(n))}</small><small>${esc2(noticeTime(n))} · 한국 시간</small></span></a>`).join("") : '<div class="ap-empty">승인 업무 알림이 없습니다.</div>'}`}
      <h3 class="ap-section-title">설비 경보 <span>${list.filter((a) => !a.read).length}</span></h3>
      ${list.length ? list.map((a) => `
      <a class="ap-item${a.read ? "" : " unread"}" href="#/equipment/${a.eqId}" data-alarm="${a.id}">
        <span class="sdot c-${a.type}"></span>
        <span class="ap-body"><b>${esc2(a.name)}</b><span class="c-${a.type}">${a.type} · ${esc2(a.title)}</span>
          <small>${mdhm(a.at)} · ${esc2(a.location)}${a.count > 1 ? ` · ${a.count}회 반복` : ""}</small><small>${esc2(a.note)}</small></span></a>`).join("") : '<div class="ap-empty">새 알람이 없습니다.</div>'}</div>
    <div class="ap-foot"><a href="#/approvals">${currentUser()?.role === "supervisor" ? "일정 승인" : "내 승인 요청"} 보기 →</a><a href="#/alarms">${esc2(currentUser()?.scope || "전체 제철소")} 경보 이력 보기 →</a></div>`;
  if (popup._renderedMarkup === markup) return;
  popup.innerHTML = markup;
  popup._renderedMarkup = markup;
  const scroller = popup.querySelector(".ap-list");
  if (scroller) scroller.scrollTop = scrollTop;
  if (focusKey) popup.querySelector(focusKey)?.focus({ preventScroll: true });
}
function readAlarm(id) {
  const a = alarms.list.find((x) => x.id === id);
  if (a) a.read = true;
  renderAlarmBadge();
  renderToasts();
}
var TOAST_MS = 3e3;
var pendingMobileToast = null;
function expireAlarmToast(el2) {
  if (!el2.isConnected) return;
  if (pointerBusy && window.matchMedia("(max-width: 900px)").matches) {
    setTimeout(() => expireAlarmToast(el2), 100);
    return;
  }
  el2.classList.add("out");
  setTimeout(() => {
    if (pointerBusy && window.matchMedia("(max-width: 900px)").matches) expireAlarmToast(el2);
    else el2.remove();
  }, 350);
}
function showAlarmToast(a) {
  const box = $("#alarmToasts");
  if (!box || !a) return;
  if (pointerBusy && window.matchMedia("(max-width: 900px)").matches) {
    pendingMobileToast = a;
    return;
  }
  const el2 = document.createElement("div");
  el2.className = `atoast t-${a.type}`;
  el2.dataset.id = a.id;
  el2.setAttribute("role", "alert");
  el2.title = `${mdhm(a.at)} · ${a.location} · ${a.title} · ${a.note}`;
  el2.innerHTML = `
    <span class="at-badge" aria-hidden="true">${ICON.tri}</span>
    <a class="at-main" href="#/equipment/${a.eqId}" data-alarm="${a.id}">
      <span class="at-kind">${a.type} 알람</span><span class="at-sep">|</span><b>${esc2(a.name)}</b>${ICON.chevron}</a>
    <button class="at-x" type="button" data-close-toast aria-label="알람 닫기">${ICON.close}</button>`;
  box.prepend(el2);
  const limit = window.matchMedia("(max-width: 900px)").matches ? 1 : 3;
  while (box.children.length > limit) box.lastElementChild.remove();
  setTimeout(() => expireAlarmToast(el2), TOAST_MS);
}
function renderToasts() {
}
function notifyBrowser(a) {
  if (auth.experience || !alarms.browser || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(`[${a.type}] ${a.name}`, { body: `${a.title} · ${a.location}
${a.note}`, tag: `gb-${a.eqId}` });
    n.onclick = () => {
      window.focus();
      location.hash = `#/equipment/${a.eqId}`;
      readAlarm(a.id);
    };
  } catch {
  }
}
function fanEvents(f) {
  if (f.events) return f.events;
  const an = f.an, ev = [];
  let warnNo = 0, alarmNo = 0;
  for (let i = RULE.baselineN; i <= f.idx; i++) {
    if (an.firstAlarm >= 0 && i >= an.firstAlarm) {
      if (an.cond[i] && !an.cond[i - 1]) {
        alarmNo++;
        ev.push({ f, i, type: "경보", no: alarmNo, first: i === an.firstAlarm });
      }
    } else if (anyExceed2(an, i) && ![1, 2, 3, 4].some((d) => anyExceed2(an, i - d))) {
      warnNo++;
      ev.push({ f, i, type: "주의", no: warnNo });
    }
  }
  f.events = ev.reverse();
  return f.events;
}
function eventText(e) {
  const an = e.f.an;
  if (e.type === "경보") {
    const s = snapshot(an, e.i);
    return { title: e.first ? "최초 경보 발생" : `경보 재확인 ${e.no - 1}차`, note: e.first ? `${an.alarmAxes.map((a) => AXIS_LABEL[a]).join("·")} 방향 ${RULE.consecutive}회 연속 확인` : `이상 지속률 ${Math.round(s.persistenceRate)}%` };
  }
  const feats = FEATURES.filter((k) => AXES.some((a) => an.exceed[e.i][`${a}_${k}`])).map((k) => FEATURE[k].short);
  return { title: `이상 징후 감지 ${e.no}차`, note: `${feats.join("·")} 기준 초과` };
}
var ui = {
  view: "overview",
  id: null,
  process: null,
  sort: store.pref.get("sort", "priority"),
  feature: "rms",
  range: "recent",
  hover: { index: null },
  listProcess: "all",
  alarmFilter: "all",
  histTab: "inspections",
  eqFilter: "all",
  calendarProcess: "all",
  maintenanceProcess: "all",
  critOpen: false
};
var badge = (s) => `<span class="badge st-${s}">${s}</span>`;
var sdot = (s) => `<span class="sdot c-${s}"></span>`;
function reasonSummary(f) {
  const s = f.snap;
  if (s.status === "정상") return { title: "정상 범위 유지", sub: "모든 진동 항목이 기준 이내" };
  const title = REASONS[s.mainReason].title;
  let sub = s.exceedFeatures.map((k) => FEATURE[k].phrase).join(" · ");
  if (!sub && s.alarmed) sub = `최근 측정은 경보 조건 미충족 · 이상 지속률 ${Math.round(s.persistenceRate)}%`;
  if (!sub && s.status === "주의") sub = "최근 4회 측정 중 기준 초과 확인";
  return { title, sub };
}
var lastExceedTime = (f) => f.snap.lastExceed != null ? timeOf(f, f.snap.lastExceed) : null;
var keyTime = (f) => f.lastAlarmTime ? new Date(f.lastAlarmTime) : lastExceedTime(f);
var inScope = (f, p) => !p || p === "all" || f.eq.process === p;
function actionNote(id) {
  const h = store.history(id);
  const pending = h.followUps.filter((x) => x.status === "예정").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  if (pending) return `후속 ${pending.type} 예정 ${pending.due_date.slice(5)}`;
  const reviewing = h.reviews.find((r) => r.review_status === "검토 중");
  if (reviewing) return `정비 검토 중 · 희망일 ${reviewing.desired_date ? reviewing.desired_date.slice(5) : "-"}`;
  const last = [...h.inspections].sort((a, b) => b.inspected_at.localeCompare(a.inspected_at))[0];
  if (last) return `최근 점검 ${last.inspected_at.slice(5, 10)} · ${last.decision}`;
  return "";
}
var appEl = () => $("#app");
function setSidebar(collapsed) {
  appEl().classList.toggle("sb-collapsed", collapsed);
  store.pref.set("sidebar", collapsed ? "collapsed" : "open");
  if (ui.view === "overview") requestAnimationFrame(layoutMap);
  if (ui.view === "detail") setTimeout(updateDetail, 50);
}
function renderSidebar() {
  const brand = $(".sb-logo");
  brand.href = currentUser()?.home || "#/";
  brand.title = currentUser()?.scope || "전체 제철소";
  brand.setAttribute("aria-label", `GB system · ${currentUser()?.scope || "전체 제철소"}`);
  const ctxProcess = ui.view === "overview" ? ui.process : ui.view === "list" ? ui.listProcess : ["detail", "inspect"].includes(ui.view) ? fanById(ui.id)?.eq.process : null;
  const item = (href, icon2, label, active, extra = "") => `<a class="sb-item${active ? " active" : ""}" href="${href}" title="${label}">${icon2}<span class="sb-label">${label}</span>${extra}</a>`;
  const proc = PROCESSES.filter((p) => (!auth.experience || ["sinter", "steel"].includes(p.key)) && (!currentUser()?.process || currentUser().process === p.key)).map((p) => {
    return `<div class="sb-process">
      <a href="#/process/${p.key}" class="${ctxProcess === p.key && ui.view !== "list" ? "active" : ""}">${p.name}</a>
      <a class="sb-machine${ui.view === "list" && ui.listProcess === p.key ? " active" : ""}" href="#/process/${p.key}/equipment" aria-label="${p.name} 기계설비">${ICON.chart}<span>기계설비</span></a>
    </div>`;
  }).join("");
  const nav = `
    ${item(currentUser()?.home || "#/", ICON.home, currentUser()?.process ? currentUser().scope : "전체 제철소", ui.view === "overview" && ui.process === (currentUser()?.process || null))}
    <button class="sb-item${ctxProcess ? " active-group" : ""}" type="button" id="sbProc" title="공정 현황">${ICON.factory}<span class="sb-label">공정 현황</span></button>
    <div class="sb-sub">${proc}</div>
    <div class="sb-sep"></div>
    ${item("#/alarms", ICON.bell, "경보 발생 이력", ui.view === "alarms")}
    ${item("#/maintenance", ICON.wrench, auth.experience ? "점검·정비 이력" : "점검·정비 보고서", ui.view === "maintenance" || ui.view === "report" && ui.reportFrom !== "calendar")}
    ${item("#/calendar", ICON.calendar, "정비 캘린더", ui.view === "calendar" || ui.view === "report" && ui.reportFrom === "calendar")}
    ${item("#/approvals", ICON.check, currentUser()?.role === "supervisor" ? "일정 승인" : "승인 요청", ui.view === "approvals", '<span id="approvalBadge" class="approval-nav-count" hidden></span>')}
    ${auth.experience ? "" : item("#/notifications", ICON.bell, "모바일·이메일 알림", ui.view === "notifications")}
    ${item("#/mypage", ICON.user, "마이페이지", ui.view === "mypage")}`;
  if ($("#sbNav").dataset.markup === nav) return;
  $("#sbNav").dataset.markup = nav;
  $("#sbNav").innerHTML = nav;
  $("#sbProc").addEventListener("click", () => {
    if (appEl().classList.contains("sb-collapsed")) setSidebar(false);
  });
  void updateApprovalBadge(true);
}
var lastApprovalBadgeRead = 0;
async function updateApprovalBadge(force = false) {
  if (auth.experience) return;
  if (!currentUser() || !force && Date.now() - lastApprovalBadgeRead < 3e4) return;
  lastApprovalBadgeRead = Date.now();
  const userId = currentUser().id;
  try {
    const response = await auth.request("/api/approvals");
    if (currentUser()?.id !== userId) return;
    const badge2 = $("#approvalBadge");
    if (badge2) {
      const count = response.counts?.pending ?? response.requests.filter((r) => r.status === "pending").length;
      badge2.textContent = count;
      badge2.hidden = count === 0;
    }
  } catch {
  }
}
function setHeader({ title, back = null }) {
  $("#hdTitle").textContent = title;
  $("#hdBack").hidden = !back;
  if (back) $("#hdBack").setAttribute("href", back);
  document.title = `${title} | GB system`;
  syncUserButton();
}
function userDestination() {
  return auth.experience ? "#/" : ui.view === "mypage" ? currentUser().home : "#/mypage";
}
function syncUserButton() {
  const label = auth.experience ? "사용자 메뉴" : ui.view === "mypage" ? `${currentUser()?.scope || "전체 제철소"} 현황으로 돌아가기` : "마이페이지로 이동";
  $("#userBtn").setAttribute("aria-label", `${currentUser()?.name || "관리자"} · ${label}`);
  $("#userBtn").title = label;
  if (auth.experience && !$("#experienceUserPop")) {
    const pop = document.createElement("div");
    pop.id = "experienceUserPop";
    pop.className = "experience-user-pop";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "사용자 메뉴");
    pop.innerHTML = `<button type="button" id="experienceHome">${ICON.home}<span>초기 화면으로 돌아가기</span>${ICON.chevron}</button>`;
    $("#userBtn").after(pop);
    $("#userBtn").setAttribute("aria-haspopup", "dialog");
    $("#userBtn").setAttribute("aria-controls", pop.id);
    $("#userBtn").setAttribute("aria-expanded", "false");
  }
}
function setExperienceUserOpen(open) {
  if (!auth.experience || !$("#experienceUserPop")) return;
  $("#experienceUserPop").hidden = !open;
  $("#userBtn").setAttribute("aria-expanded", String(open));
  if (open) {
    setAlarmOpen(false);
    $("#livePop").hidden = true;
    $("#liveBtn").setAttribute("aria-expanded", "false");
    $("#experienceHome").focus();
  }
}
function updateLive() {
  const paused = sim.speed === 0;
  document.body.dataset.markerPlayback = paused ? "paused" : "playing";
  $("#live").classList.toggle("paused", paused);
  $("#liveText").textContent = paused ? "데이터 재생 일시정지" : "실시간 데이터 송신중 …";
  $("#liveBtn").setAttribute("aria-label", `데이터 재생 설정 · ${paused ? "일시정지" : `×${sim.speed}`}`);
  $$("#speedOpts [data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === sim.speed)));
}
function tick() {
  if (replayController?.busy) {
    sim.last = performance.now();
    return;
  }
  if (started) void updateApprovalBadge();
  if (started) void alarmReporter?.flush();
  const linkStatus = $("#playbackLinkStatus");
  if (linkStatus && alarmReporter) linkStatus.textContent = alarmReporter.status;
  sim.advance();
  $("#hdClock").textContent = clockText(simNow());
  const e = Math.floor(sim.ms / 6e4);
  if (e !== sim.elapsed) {
    sim.elapsed = e;
    updateFans();
    onDataTick();
  }
  sim.save();
}
function route() {
  if (!currentUser()) return;
  setExperienceUserOpen(false);
  const [routePath, routeQuery = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const parts = (routePath || "").split("/").filter(Boolean);
  if (auth.experience && (["approvals", "mypage", "notifications"].includes(parts[0]) || parts[2] === "inspect" || parts[0] === "process" && !["sinter", "steel"].includes(parts[1]))) {
    location.replace("#/");
    return;
  }
  const routeParams = new URLSearchParams(routeQuery);
  ui.approvalStatus = routeParams.get("status");
  ui.approvalRequest = routeParams.get("request");
  const own = currentUser().process;
  if (own && (!parts.length || parts[0] === "process" && parts[1] !== own)) {
    location.replace(currentUser().home);
    return;
  }
  if (own) {
    ui.maintenanceProcess = own;
    ui.calendarProcess = own;
  }
  const prevView = ui.view, prevId = ui.id, prevProcess = ui.process;
  if (parts[0] === "equipment" && parts[1] && fanById(parts[1])) {
    ui.view = parts[2] === "inspect" ? "inspect" : "detail";
    if (prevId !== parts[1]) {
      ui.hover.index = null;
      ui.feature = "rms";
      ui.range = "recent";
    }
    ui.id = parts[1];
  } else if (parts[0] === "equipment") {
    ui.view = "list";
    ui.listProcess = currentUser()?.process || "all";
  } else if (parts[0] === "process" && PROCESSES.some((p) => p.key === parts[1])) {
    if (parts[2] === "equipment") {
      ui.view = "list";
      ui.listProcess = parts[1];
    } else {
      ui.view = "overview";
      ui.process = parts[1];
    }
  } else if (parts[0] === "history") {
    location.replace("#/maintenance");
    return;
  } else if (parts[0] === "reports" && !auth.experience) {
    ui.view = "report";
    ui.reportKind = parts[1];
    try {
      ui.reportId = decodeURIComponent(parts[2] || "");
    } catch {
      ui.reportId = "";
    }
    ui.reportFrom = routeParams.get("from") === "calendar" ? "calendar" : "maintenance";
  } else if (["alarms", "maintenance", "calendar", "mypage", "notifications", "approvals"].includes(parts[0])) ui.view = parts[0];
  else {
    ui.view = "overview";
    ui.process = currentUser()?.process || null;
  }
  if (["calendar", "maintenance"].includes(ui.view) && prevView !== ui.view && prevView !== "report") ui.eqFilter = "all";
  appEl().classList.remove("sb-mobile-open");
  setAlarmOpen(false);
  renderSidebar();
  render();
  if (["calendar", "maintenance"].includes(ui.view)) {
    const targetView = ui.view;
    store.refreshMaintenance().then(() => {
      if (ui.view === targetView && !$("#calForm")?.dataset.dirty) targetView === "calendar" ? renderCalendar() : renderMaintenance();
    }).catch((error) => {
      if (ui.view === targetView) toast(error.message);
    });
  }
  if (!(prevView === ui.view && ui.view === "overview" && prevProcess === ui.process)) $(".main-wrap").scrollTo(0, 0);
  $("#view").focus({ preventScroll: true });
}
function render() {
  const toastBox = $("#alarmToasts");
  if (toastBox && $("#view").contains(toastBox)) $(".header").after(toastBox);
  document.body.dataset.view = ui.view;
  document.body.dataset.overviewProcess = ui.process || "";
  const v = ui.view;
  if (v === "overview") renderOverview();
  else if (v === "list") renderList();
  else if (v === "detail") renderDetail();
  else if (v === "inspect") renderInspect();
  else if (v === "alarms") renderAlarms();
  else if (v === "maintenance") renderMaintenance();
  else if (v === "report") renderReportPreview();
  else if (v === "calendar") renderCalendar();
  else if (v === "approvals") {
    setHeader({ title: currentUser()?.role === "supervisor" ? "일정 승인" : "승인 요청" });
    mountApprovals($("#view"), {
      auth,
      store,
      esc: esc2,
      nameOf,
      equipmentOf: (id) => fanById(id)?.eq || {},
      initialStatus: ui.approvalStatus,
      requestId: ui.approvalRequest,
      toast: (message) => {
        toast(message);
        void updateApprovalBadge(true);
        void approvalInbox?.refresh();
      }
    });
  } else if (v === "notifications") {
    setHeader({ title: auth.experience ? "내 알림 체험" : "모바일·이메일 알림" });
    mountNotifications($("#view"), { auth, esc: esc2, getPlaybackStatus: () => alarmReporter?.status || "" });
  } else if (v === "mypage") {
    setHeader({ title: "마이페이지" });
    mountMyPage($("#view"), { auth, esc: esc2, nameOf });
  } else renderMaintenance();
  placeAlarmToasts();
}
function placeAlarmToasts() {
  const box = $("#alarmToasts");
  if (!box) return;
  const slot = window.matchMedia("(max-width: 900px)").matches && $("#homeAlarmSlot");
  if (slot) {
    if (box.parentElement !== slot) slot.append(box);
  } else {
    const header = $(".header");
    if (header.nextElementSibling !== box) header.after(box);
  }
}
var pointerBusy = false, deferredTick = false;
document.addEventListener("pointerdown", () => {
  pointerBusy = true;
}, { passive: true });
function releasePointer() {
  setTimeout(() => {
    pointerBusy = false;
    if (deferredTick) {
      deferredTick = false;
      onDataTick();
    }
    if (pendingMobileToast) {
      const latest = pendingMobileToast;
      pendingMobileToast = null;
      if ($("#alarmPop").hidden && !appEl().classList.contains("sb-mobile-open")) showAlarmToast(latest);
    }
  }, 0);
}
document.addEventListener("pointerup", releasePointer, { passive: true });
document.addEventListener("pointercancel", releasePointer, { passive: true });
window.addEventListener("blur", releasePointer);
function onDataTick() {
  if (pointerBusy) {
    deferredTick = true;
    return;
  }
  renderSidebar();
  const v = ui.view;
  if (v === "overview") updateOverview();
  else if (v === "list") renderList();
  else if (v === "detail") updateDetail();
  else if (v === "inspect") updateFormHead();
  else if (v === "alarms") renderAlarms();
}
function renderOverview() {
  return ui.process ? renderProcess() : renderHome();
}
function updateOverview() {
  return ui.process ? updateProcess() : updateHome();
}
function layoutMap() {
  const img = $("#mapImg");
  if (img) img.src = ui.process ? procImg(ui.process) : HOME_MAP[theme()];
  const wrap = $("#mapWrap"), stage = $("#mapStage");
  if (!wrap || !stage) return;
  const mobile = matchMedia("(max-width:900px)").matches;
  const w = mobile || !ui.process ? wrap.clientWidth : innerWidth;
  const h = mobile ? w * 9 / 16 : wrap.clientHeight;
  const scale = Math.max(w / 1920, h / 1080);
  Object.assign(stage.style, { width: `${1920 * scale}px`, height: `${1080 * scale}px`, left: `${(w - 1920 * scale) / 2}px`, top: `${(h - 1080 * scale) / 2}px` });
  stage.style.setProperty("--s", scale);
}
var layoutHomeMap = layoutMap;
var layoutProcessMap = layoutMap;
function statusCounts(list) {
  return { total: list.length, 정상: list.filter((f) => f.snap.status === "정상").length, 주의: list.filter((f) => f.snap.status === "주의").length, 경보: list.filter((f) => f.snap.status === "경보").length };
}
function overviewShell(process) {
  const name = process ? processName(process) : "POSCO 포항제철소";
  return `<section class="map-view ov-view ${process ? "proc-view" : "home-view"}" aria-label="${name} 배치도">
    <div class="map-wrap" id="mapWrap"><div class="map-stage" id="mapStage"><img id="mapImg" src="${process ? procImg(process) : HOME_MAP[theme()]}" alt="${name} 배치도" draggable="false"><div id="mapZones"></div><div id="mapMarkers"></div></div></div>
    <aside class="ov-panels ${process ? "ov-process-panels" : "ov-home-panels"}"><div id="overviewPanels" class="ov-panel-content"></div>${foldControl()}</aside>
    <aside id="overviewAlerts" class="ov-alerts" aria-label="현재 점검 필요 설비 알림"></aside>
    <div id="homeAlarmSlot" class="home-alarm-slot"></div></section>`;
}
function syncPanelFold() {
  const panels = $(".ov-panels"), content = $("#overviewPanels"), button = $("[data-dashboard-toggle]");
  if (!panels || !button) return;
  const folded = store.pref.get(`overview-fold-${ui.process || "home"}`, false);
  panels.classList.toggle("is-folded", folded);
  content.inert = folded && !matchMedia("(max-width:900px)").matches;
  button.setAttribute("aria-expanded", String(!folded));
  button.setAttribute("aria-label", `현황 카드 ${folded ? "펼치기" : "접기"}`);
}
function renderHome() {
  setHeader({ title: "POSCO 포항제철소" });
  $("#view").innerHTML = `<section class="map-view ov-view home-view" aria-label="전체 제철소 현황">
    <div class="home-hero" aria-label="POSCO 포항제철소 배치도">
      <div class="map-wrap" id="mapWrap"><div class="map-stage" id="mapStage"><img id="mapImg" src="${HOME_MAP[theme()]}" alt="POSCO 포항제철소 배치도" draggable="false"><div id="mapZones"></div><div id="mapMarkers"></div></div></div>
      <aside id="overviewAlerts" class="ov-alerts" aria-label="우선 확인할 설비 알림"></aside>
      ${homeSummary()}
    </div>
    <section class="home-details" aria-label="공정별 설비와 점검 필요 현황">
      <div class="home-detail-grid"><div id="overviewPanels" class="ov-panel-content">${homePanels()}</div><section id="homeChecks" class="ov-card ov-checks" aria-label="점검 필요 설비"></section></div>
    </section>
    <div id="homeAlarmSlot" class="home-alarm-slot"></div></section>`;
  layoutMap();
  updateHome();
}
function alarmCards(list, limit = 5) {
  const target = $("#overviewAlerts");
  if (!target) return;
  const shown2 = [...list].filter((f) => f.snap.status !== "정상").sort(priorityCompare).slice(0, limit);
  const markup = shown2.map((f) => {
    const s = f.snap.status, t = keyTime(f), r = reasonSummary(f);
    return `<a class="ov-alert state-${s}" href="#/equipment/${f.eq.equipment_id}"><span class="ov-alert-symbol">${ICON.tri}</span>
      <span class="ov-alert-body"><span class="ov-alert-title"><b>${esc2(f.eq.equipment_name)}</b><em>${s === "경보" ? "이상 상태 지속 확인" : "상태 확인 필요"}</em></span><small>${t ? `${mdhm(t)} | ` : ""}${esc2(f.eq.monitored_part)} | ${esc2(f.eq.location)}</small></span>${ICON.chevron}<span class="sr-only">${esc2(r.title)}</span></a>`;
  }).join("");
  if (target.dataset.markup !== markup) {
    target.dataset.markup = markup;
    target.innerHTML = markup;
  }
}
function inspectionChecksMarkup(items, { scopeCount, equipmentHref, showScopeNote = false }) {
  const status = items.some((f) => f.snap.status === "경보") ? "경보" : items.length ? "주의" : "정상";
  return `<div class="ov-check-header state-${status}${items.length ? "" : " is-empty"}">
      ${inspectionHeading()}<div class="ov-sort" role="group" aria-label="점검 필요 설비 정렬">
        <button type="button" data-sort="priority" aria-pressed="${ui.sort === "priority"}">우선 확인 순</button>
        <button type="button" data-sort="recent" aria-pressed="${ui.sort === "recent"}">최근 경보 순</button>
      </div></div>
    ${showScopeNote ? `<p class="home-check-note">연결 설비 ${scopeCount}대의 현재 데이터 기준</p>` : ""}
    ${items.length ? `<div class="ov-check-list">${items.map((f) => {
    const state = f.snap.status, reason = reasonSummary(f), time = keyTime(f);
    return `<a class="ov-check state-${state}" href="#/equipment/${f.eq.equipment_id}">
        <span class="ov-check-dot" role="img" aria-label="${esc2(state)}"></span>
        <div class="ov-check-copy"><div class="ov-check-lead"><h3>${esc2(f.eq.equipment_name)}</h3><strong>${esc2(reason.title)}</strong></div>
          <small>${time ? `${mdhm(time)} | ` : ""}${esc2(f.eq.monitored_part)} | ${esc2(f.eq.location)}</small></div>${ICON.chevron}</a>`;
  }).join("")}</div>` : `<p class="ov-empty">${scopeCount ? "이상 상태가 감지되지 않았습니다." : "등록된 모니터링 설비가 없습니다."}</p>`}
    <a class="ov-equipment-link${items.length ? "" : " is-empty-link"}" href="${esc2(equipmentHref)}">기계설비 전체 보기 ${ICON.chevron}</a>`;
}
function updateHome() {
  if (!$("#mapZones")) return;
  const markup = ZONES.map((z) => {
    const c = statusCounts(fans.filter((f) => f.eq.process === z.process));
    const state = c.경보 ? "경보" : c.주의 ? "주의" : "정상";
    const label = `${processName(z.process)} · 정상 ${c.정상} · 주의 ${c.주의} · 경보 ${c.경보}`;
    return `<a class="ov-zone state-${state}" href="#/process/${z.process}" aria-label="${label}" style="left:${(z.cx - z.rx) / 1920 * 100}%;top:${(z.cy - z.ry) / 1080 * 100}%;width:${z.rx * 2 / 1920 * 100}%;height:${z.ry * 2 / 1080 * 100}%"></a>
      <a class="ov-zone-pin state-${state}" href="#/process/${z.process}" style="left:${z.ax / 1920 * 100}%;top:${z.ay / 1080 * 100}%" aria-label="${label}"><span class="ov-zone-symbol">${state === "정상" ? "" : ICON.tri}</span><span class="ov-zone-label">${processName(z.process)}${state === "정상" ? "" : ` ${state} 발생`}</span></a>`;
  }).join("");
  if ($("#mapZones").dataset.markup !== markup) {
    $("#mapZones").dataset.markup = markup;
    $("#mapZones").innerHTML = markup;
  }
  alarmCards(fans, 2);
  const checks2 = $("#homeChecks");
  const sorted = [...fans].filter((f) => f.snap.status !== "정상").sort(ui.sort === "recent" ? recentAlarmCompare : priorityCompare);
  const checksMarkup = inspectionChecksMarkup(sorted, { scopeCount: fans.length, equipmentHref: "#/equipment", showScopeNote: true });
  if (checks2 && checks2.dataset.markup !== checksMarkup) {
    checks2.dataset.markup = checksMarkup;
    checks2.innerHTML = checksMarkup;
  }
}
function renderProcess() {
  setHeader({ title: processName(ui.process) });
  $("#view").innerHTML = overviewShell(ui.process);
  layoutMap();
  updateProcess();
  syncPanelFold();
}
function updateProcess() {
  const panel = $("#overviewPanels");
  if (!panel || !$("#mapMarkers")) return;
  const p = ui.process, scope = fans.filter((f) => f.eq.process === p);
  const sorted = [...scope].filter((f) => f.snap.status !== "정상").sort(ui.sort === "recent" ? recentAlarmCompare : priorityCompare);
  const markup = processSummary(processName(p), sorted.length > 0, scope.length > 0) + `<section class="ov-card ov-checks" aria-label="점검 필요 설비">${inspectionChecksMarkup(sorted.slice(0, 3), { scopeCount: scope.length, equipmentHref: `#/process/${p}/equipment` })}</section>`;
  if (panel.dataset.markup !== markup) {
    panel.dataset.markup = markup;
    panel.innerHTML = markup;
  }
  const pins = scope.map((f) => {
    const s = f.snap.status, pos = MAP_POSITIONS[f.eq.equipment_id] || [f.eq.map_x_pct, f.eq.map_y_pct];
    return `<a class="ov-pin state-${s}" data-marker-kind="connected" href="#/equipment/${f.eq.equipment_id}" style="left:${pos[0]}%;top:${pos[1]}%" aria-label="${esc2(f.eq.equipment_name)} ${s} 상세 보기"><span class="ov-pin-dot"></span><span class="ov-pin-label">${esc2(f.eq.equipment_name)}</span></a>`;
  }).join("") + (MAP_EXAMPLE_MARKERS[p] || []).map((m) => {
    return `<span class="ov-pin ov-pin-example state-정상" data-marker-kind="example" style="left:${m.x}%;top:${m.y}%" role="img" aria-label="${esc2(processName(p))} 시안 표시 · 정상 표시 · 데이터 미연결"><span class="ov-pin-dot" aria-hidden="true"></span></span>`;
  }).join("");
  if ($("#mapMarkers").dataset.markup !== pins) {
    $("#mapMarkers").dataset.markup = pins;
    $("#mapMarkers").innerHTML = pins;
  }
  alarmCards(scope);
}
function renderList() {
  setHeader({ title: "기계설비", back: ui.listProcess === "all" ? "#/" : `#/process/${ui.listProcess}` });
  const scope = fans.filter((f) => inScope(f, ui.listProcess));
  const count = (s) => scope.filter((f) => f.snap.status === s).length;
  const sorted = [...scope].sort(ui.sort === "recent" ? recentAlarmCompare : priorityCompare);
  const row = (f) => {
    const r = reasonSummary(f), note = actionNote(f.eq.equipment_id);
    return `
      <tr class="row-link" tabindex="0" data-go="${f.eq.equipment_id}">
        <td class="cell-name"><b>${esc2(f.eq.equipment_name)}</b><small>${esc2(f.eq.tag)}${note ? ` · ${esc2(note)}` : ""}</small></td>
        <td>${esc2(f.eq.location)}<small class="muted" style="display:block">${esc2(f.eq.process_name)}</small></td>
        <td>${esc2(f.eq.monitored_part)}<small class="muted" style="display:block">${esc2(f.eq.bearing_position)}</small></td>
        <td>${badge(f.snap.status)}</td>
        <td class="cell-reason"><b>${esc2(r.title)}</b><small>${esc2(r.sub)}</small></td>
        <td class="time">${f.lastAlarmTime ? shortTime(new Date(f.lastAlarmTime)) : '<span class="muted">-</span>'}</td>
        <td>${ICON.chevron}</td>
      </tr>`;
  };
  $("#view").innerHTML = `
    <div class="page">
      ${processTabs(ui.listProcess)}
      <nav class="crumb" aria-label="현재 위치">${processName(ui.listProcess)}<span>›</span>기계설비<span>›</span>팬<span>›</span>베어링 감시</nav>
      <div class="page-head">
        <div class="counts">
          <div class="count"><span>전체</span><b>${scope.length}</b></div>
          <div class="count k-정상"><span>정상</span><b>${count("정상")}</b></div>
          <div class="count k-주의"><span>주의</span><b>${count("주의")}</b></div>
          <div class="count k-경보"><span>경보</span><b>${count("경보")}</b></div>
        </div>
      </div>
      <section class="card table-card">
        <div class="table-tools">
          <div class="seg" role="group" aria-label="정렬">
            <button type="button" data-sort="priority" aria-pressed="${ui.sort === "priority"}">우선 확인 순</button>
            <button type="button" data-sort="recent" aria-pressed="${ui.sort === "recent"}">최근 경보 순</button>
          </div>
          <span class="hint">${ui.sort === "priority" ? "현재 상태 → 이상 지속률 → 정상 범위 초과 정도 → 최근 경보 시점 순 · 고장 위험도 순위가 아닙니다." : "최근 경보가 발생한 설비부터 정렬합니다. 경보가 없는 설비는 우선 확인 순으로 뒤에 표시합니다."}</span>
        </div>
        <div class="tablewrap"><table class="list">
          <thead><tr><th>설비명</th><th>위치</th><th>감시 부위</th><th>현재 상태</th><th>주요 판단 근거</th><th>최근 경보</th><th></th></tr></thead>
          <tbody>${sorted.length ? sorted.map(row).join("") : '<tr><td colspan="7" class="muted">해당 공정의 모니터링 대상이 없습니다.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>`;
}
function renderDetail() {
  const f = fanById(ui.id), eq = f.eq;
  setHeader({ title: eq.process_name, back: `#/process/${eq.process}` });
  $("#view").innerHTML = `
    <div class="detail detail-layout">
      <div class="hero">
        <section class="card hero-card">
          <h2 class="hero-name">${esc2(eq.equipment_name)}</h2>
          <div class="hero-sub">${esc2(eq.tag)} · 위치 ${esc2(eq.location)}</div>
          <div class="graph-sec">
            <div class="graph-head"><h3 id="dGraphTitle">진동 크기 변화</h3></div>
            <div class="graph-controls">
              <div class="graph-tabs" role="tablist" aria-label="진동 특징">
                ${FEATURES.map((k) => `<button type="button" role="tab" data-feature="${k}">${FEATURE[k].name}</button>`).join("")}
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
            <img id="dFanImg" src="" alt="${esc2(eq.equipment_name)} 설비 모형" decoding="async">
            <div class="hotspot" id="dSpot" tabindex="0" role="img" aria-label="${esc2(eq.monitored_part)} · ${esc2(eq.bearing_position)} · ${esc2(eq.bearing_type)}"><i></i>
              <div class="hs-label">${esc2(eq.monitored_part)}<small>${esc2(eq.bearing_position)} · ${esc2(eq.bearing_type)}</small></div></div>
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
            <dt>설비 번호</dt><dd>${esc2(eq.equipment_id)}</dd>
            <dt>태그</dt><dd>${esc2(eq.tag)}</dd>
            <dt>공정</dt><dd>${esc2(eq.process_name)}</dd>
            <dt>설비 종류</dt><dd>${esc2(eq.equipment_type)}</dd>
            <dt>베어링 위치</dt><dd>${esc2(eq.bearing_position)}</dd>
            <dt>베어링 형식</dt><dd>${esc2(eq.bearing_type)}</dd>
            <dt>정격 회전수</dt><dd>${eq.rated_rpm.toLocaleString()} rpm</dd>
            <dt>모터 출력</dt><dd>${eq.motor_kw.toLocaleString()} kW</dd>
            <dt>측정 축</dt><dd>수평 · 수직 (1분 주기)</dd>
            <dt>담당자</dt><dd>${esc2(eq.manager)}</dd>
            <dt>설치일</dt><dd>${esc2(eq.installed_on)}</dd>
          </dl>
        </aside>
      </div>
    </div>`;
  $("#dCriteria").addEventListener("toggle", (e) => {
    ui.critOpen = e.target.open;
  });
  if (ui.critOpen) $("#dCriteria").open = true;
  renderDetailHistory(f);
  updateDetail();
}
function updateDetail() {
  const f = fanById(ui.id);
  if (!f || !$("#dStatus")) return;
  const s = f.snap, eq = f.eq, an = f.an, i = s.index;
  const firstT = s.firstAlarm != null ? timeOf(f, s.firstAlarm) : null;
  const lastT = f.lastAlarmTime ? new Date(f.lastAlarmTime) : null;
  let desc;
  if (s.status === "경보") {
    if (s.sinceAlarm === 0) desc = `방금 경보 조건이 충족되었습니다. 이상 진동이 ${RULE.consecutive}회 연속 확인되었습니다.`;
    else if (s.sustained) desc = `경보 이후에도 이상 진동이 ${s.persistCount}회 계속 확인되고 있습니다.`;
    else desc = `경보 이후 이상 진동이 ${s.persistCount}회 확인되었고, 최근 측정에서는 경보 조건이 충족되지 않았습니다.`;
  } else if (s.status === "주의") desc = "평소 기준을 넘는 진동이 확인되었지만, 아직 경보 조건(연속 확인)은 충족되지 않았습니다.";
  else desc = "모든 진동 항목이 정상 기준 범위 안에 있습니다.";
  const facts = [["최근 경보 시점", lastT ? ymdhm(lastT) : "-", !!lastT]];
  if (firstT) facts.push(["최초 경보 후 경과", duration(s.sinceAlarm)], ["이상 지속률", `${Math.round(s.persistenceRate)}%`]);
  else {
    const le = lastExceedTime(f);
    facts.push(["최근 기준 초과", le ? ymdhm(le) : "-"], ["마지막 측정", ymdhm(timeOf(f, f.idx))]);
  }
  const evs = fanEvents(f).slice(0, 4);
  $("#dStatus").innerHTML = `
    <span class="detail-status-icon st-${s.status}" aria-hidden="true">${s.status === "정상" ? ICON.check : ICON.tri}</span>
    <div class="detail-status-copy" title="${esc2(desc)}${s.ended ? " 데이터 재생 종료 · 마지막 측정 기준" : ""}">
      <h3>현재 설비 상태 <span class="c-${s.status}">${s.status}</span></h3>
      <p class="status-desc">${s.status === "정상" ? "정상 기준 범위입니다" : "담당자의 확인이 필요합니다"}</p>
    </div>`;
  $("#dAlarmHistory").innerHTML = `
    <div class="detail-alarm-summary"><h3>경보 이력</h3>
      <dl class="facts">${facts.map(([k, v, red]) => `<div><span>${k}</span><b class="${red ? "red" : ""}">${v}</b></div>`).join("")}</dl>
    </div>
    ${evs.length ? `<ul class="events" aria-label="최근 이상 이벤트">${evs.map((e) => {
    const t = eventText(e);
    return `<li class="e-${e.type}"><span>${mdhm(timeOf(f, e.i))}</span><b>${t.title}</b><span>${esc2(t.note)}</span></li>`;
  }).join("")}</ul>` : '<p class="detail-events-empty">현재 시점까지 기록된 이상 이벤트가 없습니다.</p>'}
    <div class="events more"><a class="link-btn" href="#/alarms">경보 이력 전체 보기 →</a></div>`;
  const img = getFanImage(eq, theme(), s.status);
  const [sx, sy] = img[eq.bearing_position.includes("NDE") ? "NDE" : "DE"];
  $("#dFan").className = `fan-img s-${s.status} t-${theme()}`;
  $("#dFan").dataset.fanSet = img.set;
  $("#dFan").style.setProperty("--r", img.ratio);
  setFanImage($("#dFanImg"), img.src);
  Object.assign($("#dSpot").style, { left: `${sx}%`, top: `${sy}%` });
  $("#dSpot").dataset.bearingSide = eq.bearing_position.includes("NDE") ? "NDE" : "DE";
  $("#dSpot").className = `hotspot s-${s.status}`;
  const draft = store.draft.get(eq.equipment_id);
  $("#dCta").className = `card cta st-${s.status}`;
  $("#dCta").innerHTML = `
    <div class="detail-cta-copy"><h3>점검·정비 기록</h3>
    <p>담당자의 작성이 필요합니다</p>
    </div>
    <a class="btn primary" href="#/equipment/${eq.equipment_id}/inspect">점검 기록 작성하기</a>
    ${draft ? `<div class="draft-note">임시 저장된 점검 내용이 있습니다 (${esc2(draft.savedAt)})</div>` : ""}`;
  const detailOf = (k) => {
    if (k === "sustained") return `경보 후 ${s.sinceAlarm}회 측정 중 ${s.persistCount}회 경보 조건 충족`;
    if (k === "consecutive") return `최초 경보 ${hhmm(firstT)} · ${an.alarmAxes.map((a) => AXIS_LABEL[a]).join("·")} 방향에서 ${RULE.consecutive}회 연속 확인`;
    if (k === "multi") return s.multiAxis.map((a) => `${AXIS_LABEL[a]}: ${FEATURES.filter((x) => an.exceed[i][`${a}_${x}`]).map((x) => FEATURE[x].short).join(", ")}`).join(" / ");
    if (k === "unusual") return s.exceedFeatures.length ? s.exceedFeatures.map((x) => FEATURE[x].phrase).join(" · ") : "최근 4회 측정 중 기준 초과 확인";
    return "";
  };
  const reasonCaption = (k) => {
    if (k === "multi") return FEATURES.filter((x) => s.multiAxis.some((a) => an.exceed[i][`${a}_${x}`])).map((x) => FEATURE[x].short).join(", ");
    if (k === "consecutive") return `${an.alarmAxes.map((a) => AXIS_LABEL[a]).join("·")} 방향에서 ${RULE.consecutive}회 연속 확인`;
    if (k === "unusual" && s.exceedFeatures.length) return `${s.exceedFeatures.map((x) => FEATURE[x].short).join(", ")} 기준 초과`;
    return detailOf(k);
  };
  $("#dReasons").hidden = !s.shown.length;
  $("#dReasons").innerHTML = s.shown.map((k) => `<div class="reason">${REASON_ICON[k]}<h4>${k === "multi" ? "여러 항목에서 이상 확인" : REASONS[k].title}</h4><p>${REASONS[k].desc}</p>
        <div class="detail-line" title="${esc2(detailOf(k))}">${esc2(reasonCaption(k))}</div></div>`).join("");
  $("#dGraphTitle").textContent = `${FEATURE[ui.feature].short} 변화`;
  $$("[data-feature]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.feature === ui.feature));
    b.setAttribute("aria-selected", String(b.dataset.feature === ui.feature));
  });
  $$("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === ui.range)));
  renderChart($("#dChart"), { an, now: f.idx, feature: ui.feature, range: ui.range, timeOf: (k) => timeOf(f, k), hhmm, hover: ui.hover, experience: auth.experience });
  const focus = s.alarmed ? an.alarmAxes : [];
  const axisLg = (a) => `<span><i class="lg-line${s.alarmed && !focus.includes(a) ? " dim" : ""}" style="--c:var(--${a}-line)"></i>${AXIS_LABEL[a]}${focus.includes(a) ? "(최초 경보 축)" : ""}</span>`;
  $("#dLegend").innerHTML = `${AXES.map(axisLg).join("")}
    <span><i class="lg-band"></i>정상 기준 범위</span><span><i class="lg-dash"></i>최초 경보</span>
    <span><i class="lg-dot" style="--c:var(--alarm)"></i>경보 발생</span>
    <span><i class="lg-dot" style="--c:var(--warn)"></i>기준 초과(경보 조건 미충족)</span><span><i class="lg-now"></i>현재</span>`;
  $("#dCriteriaBody").innerHTML = `
    <div class="criteria">
      <div class="crit"><span>정상 기준 구간</span><b>N = ${RULE.baselineN}</b><small>처음 ${RULE.baselineN}회 측정의 평균 + 3σ</small></div>
      <div class="crit"><span>사용 특징</span><b>3개</b><small>${FEATURES.map((k) => FEATURE[k].short).join(" · ")}</small></div>
      <div class="crit"><span>경보 조건</span><b>${RULE.need}/${RULE.of}</b><small>같은 방향에서 3개 중 2개 이상</small></div>
      <div class="crit"><span>연속 확인</span><b>${RULE.consecutive}회</b><small>특징별 연속 기준 초과</small></div>
      <div class="crit"><span>분석 방식</span><b>${RULE.method} 방식</b><small>방향·특징별 연속 판정 후 2/3 적용</small></div>
      <div class="crit${s.featuresMet >= RULE.need ? " hl" : ""}"><span>현재 특징 충족</span><b>3개 중 ${s.featuresMet}개</b><small>${AXIS_LABEL[s.metAxis]} 방향 · ${RULE.consecutive}회 연속 초과 기준</small></div>
      <div class="crit${s.sustained ? " hl" : ""}"><span>추가 지속 확인</span><b>${s.alarmed ? s.sustained ? "확인됨" : "확인되지 않음" : "해당 없음"}</b><small>경보 이후에도 조건 충족 여부</small></div>
      <div class="crit"><span>이상 지속률</span><b>${s.alarmed ? `${Math.round(s.persistenceRate)}%` : "-"}</b><small>경보 이후 조건 충족 비율</small></div>
    </div>
    <div class="acc-sub">현재 측정값과 정상 기준 (${hhmm(timeOf(f, i))})</div>
    <div class="tablewrap"><table class="mini-table">
      <thead><tr><th>진동 특징</th><th>방향</th><th>현재값</th><th>정상 기준</th><th>판정</th><th>연속 초과</th></tr></thead>
      <tbody>${FEATURES.flatMap((k) => AXES.map((a) => {
    const key = `${a}_${k}`, ex = an.exceed[i][key];
    return `<tr><td>${FEATURE[k].name}</td><td>${AXIS_LABEL[a]}</td><td class="num">${an.series[i][key].toFixed(3)}</td>
          <td class="num">${an.th[key].toFixed(3)}</td><td class="${ex ? "ng" : "ok"}">${ex ? `초과 +${an.pct[i][key].toFixed(0)}%` : "통과"}</td>
          <td class="num">${an.run[i][key]}회</td></tr>`;
  })).join("")}</tbody></table></div>
    <div class="acc-sub">용어 설명</div>
    <div class="tablewrap"><table class="mini-table">
      <thead><tr><th>상세 화면 이름</th><th>기본 화면 문구</th><th>쉬운 설명</th></tr></thead>
      <tbody>${FEATURES.map((k) => `<tr><td><b>${FEATURE[k].name}</b></td><td>${FEATURE[k].phrase}</td><td>${FEATURE[k].desc}</td></tr>`).join("")}</tbody>
    </table></div>`;
}
function renderDetailHistory(f) {
  const h = store.history(f.eq.equipment_id);
  const today = ymd(simNow());
  const items = [
    ...h.inspections.map((r) => ({
      date: r.inspected_at,
      html: `<div class="tl-title">현장 점검 · ${esc2(r.decision)} ${r.model_status ? badge(r.model_status) : ""}${r.source === "app" ? '<span class="tag-new">NEW</span>' : ""}</div>
        <div class="tl-body">${esc2(r.memo || "메모 없음")}</div>
        <div class="tl-meta">점검자 ${esc2(r.inspector)} · 운전 ${esc2(r.operation_state)} · 소음 ${esc2(r.noise)} / 진동 ${esc2(r.vibration)} / 발열 ${esc2(r.heat)}${r.visual?.length ? ` · 육안 ${esc2([].concat(r.visual).join(", "))}` : ""}</div>`
    })),
    ...h.reviews.map((r) => ({
      date: r.registered_at,
      html: `<div class="tl-title">정비 검토 · ${esc2(r.necessity)} <span class="badge plain neutral">${esc2(r.review_status)}</span>${r.source === "app" ? '<span class="tag-new">NEW</span>' : ""}</div>
        <div class="tl-body">${esc2(r.target)} — ${esc2(r.content)}</div>
        <div class="tl-meta">작업 우선도 ${esc2(r.priority)} · 희망일 ${esc2(r.desired_date || "-")} · 예상 ${esc2(r.estimated_hours || "-")}시간</div>`
    })),
    ...h.work.map((r) => ({
      date: r.work_date,
      html: `<div class="tl-title">정비 작업 · ${esc2(r.work_type)} ${r.repeat_anomaly === "Y" ? '<span class="badge plain gold">반복 이상</span>' : ""}</div>
        <div class="tl-body">${esc2(r.anomaly)} → ${esc2(r.action)}</div>
        <div class="tl-meta">결과 ${esc2(r.result)} · ${esc2(r.worker)} · 정지 ${esc2(r.downtime_h)}시간</div>`
    }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pending = h.followUps.filter((x) => x.status === "예정");
  const anomalies = h.work.filter((w) => w.anomaly && w.anomaly !== "-").length;
  $("#dHistory").innerHTML = `
    <div class="info-row" style="margin-bottom:12px">
      <span class="chip">이상 조치 이력 <b>${anomalies}건</b></span><span class="chip">점검 기록 <b>${h.inspections.length}건</b></span>
      ${h.work.some((w) => w.repeat_anomaly === "Y") ? '<span class="badge plain gold">반복 이상 발생 이력 있음</span>' : ""}
    </div>
    ${pending.map((p) => `<div class="alert-line${p.due_date < today ? " red" : ""}">${ICON.clock}
      후속 ${esc2(p.type)} ${p.due_date < today ? "기한 지남" : "예정"} · ${esc2(p.due_date)} · ${esc2(p.items)} (${esc2(p.assignee)})</div>`).join("")}
    ${items.length ? `<ul class="timeline">${items.map((it) => `<li><div class="date">${esc2(fmtDate(it.date))}</div><div>${it.html}</div></li>`).join("")}</ul>` : '<div class="muted">등록된 점검·정비 이력이 없습니다.</div>'}`;
}
var form = { id: null, savedInspection: null, savedReview: null };
var OPTS = {
  operation_state: ["정상 운전", "이상 징후 있음", "운전 중지 상태", "확인 불가"],
  noise: ["이상 없음", "평소보다 증가", "이상 소음 확인", "확인 불가"],
  vibration: ["이상 없음", "평소보다 증가", "이상 진동 체감", "확인 불가"],
  heat: ["이상 없음", "온도 상승 확인", "심한 발열 확인", "확인 불가"],
  visual: ["누유", "풀림", "균열", "변형", "오염", "기타"],
  need_additional: ["필요 없음", "추가 점검 필요"],
  necessity: ["정비 필요", "추가 확인 후 결정", "현재 정비 불필요"],
  target: ["베어링", "축", "커플링", "윤활 계통", "팬 임펠러", "기타"],
  priority: ["일반", "우선 검토", "빠른 확인 필요"],
  est_hours: ["2", "4", "8", "직접 입력"]
};
var DECISIONS = [
  ["계속 관찰", "현재 상태를 기록하고 이후 진동 변화를 계속 관찰합니다."],
  ["추가 점검", "설비에 대한 추가 점검이 필요합니다."],
  ["정비 검토", "점검 결과를 바탕으로 정비 필요 여부와 일정을 검토합니다."]
];
var radios = (name, list, label = (v) => v) => `<div class="opts" role="radiogroup">${list.map((v) => `<label class="opt"><input type="radio" name="${name}" value="${esc2(v)}"><span>${esc2(label(v))}</span></label>`).join("")}</div>`;
var checks = (name, list) => `<div class="opts">${list.map((v) => `<label class="opt"><input type="checkbox" name="${name}" value="${esc2(v)}"><span>${esc2(v)}</span></label>`).join("")}</div>`;
var field = (name, label, inner, { req = false, full = false, help = "" } = {}) => `
  <div class="field${full ? " full" : ""}" data-field="${name}">
    <div class="flabel">${label}${req ? '<span class="req">*</span>' : ""}</div>
    ${inner}${help ? `<div class="help">${help}</div>` : ""}<div class="err" hidden></div>
  </div>`;
function renderInspect() {
  if (auth.experience || currentUser()?.role === "visitor") {
    location.replace("#/notifications");
    return;
  }
  const f = fanById(ui.id), eq = f.eq;
  const supervisor = currentUser()?.role === "supervisor";
  setHeader({ title: "점검·정비 작성", back: `#/equipment/${eq.equipment_id}` });
  form = { id: eq.equipment_id, savedInspection: null, savedReview: null, submitting: false, requestPayload: null, requestFingerprint: "", confirmedSchedule: null };
  $("#view").innerHTML = `
    <div class="form-wrap inspection-report-wrap">
      <div id="donePanel"></div>
      <form id="inspForm" class="card inspection-report" aria-labelledby="reportTitle" novalidate autocomplete="off">
        <div class="report-heading">
          <div><h2 id="reportTitle">현장 점검·정비 보고서</h2><p>설비 상태와 현장에서 확인한 내용을 기록해 주세요.</p></div>
          <div class="report-author">${field("inspector", "작성자", `<input type="text" name="inspector" readonly value="${esc2(currentUser()?.name || "")}" title="선택한 담당자 이름으로 서버에 기록됩니다.">`)}</div>
        </div>
        <fieldset id="fsInspect">
          <div class="report-row report-identity-row">
            <div class="report-equipment"><div class="report-label">설비명</div><div id="formHead" class="report-equipment-summary"></div></div>
            ${field("inspected_at", "점검 일시", '<input type="datetime-local" name="inspected_at">', { req: true })}
          </div>
          <div class="report-row report-operation-row">
            ${field("operation_state", "운전 상태", radios("operation_state", OPTS.operation_state), { req: true })}
            ${field("need_additional", "추가 점검 여부", radios("need_additional", OPTS.need_additional), { req: true })}
          </div>
          <div class="report-body">
            <div class="report-observations">
              ${field("noise", "소음", radios("noise", OPTS.noise), { req: true })}
              ${field("vibration", "진동", radios("vibration", OPTS.vibration), { req: true })}
              ${field("heat", "발열", radios("heat", OPTS.heat), { req: true })}
              ${field("visual", "육안 상태", `${checks("visual", OPTS.visual)}<input type="text" name="visual_etc" aria-label="기타 육안 상태" placeholder="기타 내용을 입력하세요" hidden>`, { help: "해당 사항이 없으면 선택하지 않아도 됩니다." })}
            </div>
            <div class="report-memo">${field("memo", "점검 메모", '<textarea name="memo" placeholder="현장에서 확인한 내용을 작성해 주세요."></textarea>')}</div>
          </div>
          <section class="report-followup" aria-label="점검 후 대응">
            ${field("decision", "점검 후 대응", radios("decision", DECISIONS.map(([value]) => value)), { req: true })}
          </section>
        </fieldset>
        <footer class="report-footer">
          <p class="report-declaration">위 내용과 같이 보고서를 제출합니다.</p>
          <p class="report-submit-help">${supervisor ? "설비 팀장은 제출 단계에서 일정을 지정하면 승인과 등록이 함께 완료됩니다." : "보고서를 제출하면 설비 팀장이 승인할 때 일정의 날짜·담당자·내용을 지정합니다."}</p>
          <div class="report-actions">
            <button class="btn" type="button" id="btnDraft">임시 저장</button>
            <button class="btn primary" type="button" id="btnComplete">${supervisor ? "점검 제출" : "점검 제출 · 승인 요청"}</button>
          </div>
          <p id="draftInfo" role="status"></p>
        </footer>
      </form>
      ${supervisor ? `<dialog id="reportScheduleDialog" class="report-schedule-dialog" aria-labelledby="reportScheduleTitle" aria-describedby="reportScheduleHelp">
        <form id="reportScheduleForm" novalidate>
          <h2 id="reportScheduleTitle">후속 일정 확인</h2>
          <p id="reportScheduleHelp">이 보고서는 제출과 함께 승인됩니다. 캘린더에 등록할 일정을 지정해 주세요.</p>
          <div class="report-schedule-fields">
            <label>일정 구분<select name="type" required>${["정기 점검", "재확인", "추가 점검", "정비"].map((type) => `<option>${type}</option>`).join("")}</select></label>
            <label>일정 예정일<input name="due_date" type="date" required></label>
            <label class="report-schedule-wide">담당자<input name="assignee" maxlength="100" required></label>
            <label class="report-schedule-wide">일정 내용<textarea name="items" maxlength="4000" required></textarea></label>
          </div>
          <p id="reportScheduleError" class="report-schedule-error" role="alert" hidden></p>
          <div class="report-schedule-actions"><button class="btn" id="reportScheduleCancel" type="button">돌아가기</button><button class="btn primary" type="submit">제출 · 승인 및 일정 등록</button></div>
        </form>
      </dialog>` : ""}
    </div>`;
  const fm = $("#inspForm");
  const draft = store.draft.get(eq.equipment_id);
  if (draft?.requestPayload?.submission_kind === "report") {
    form.requestPayload = draft.requestPayload;
    form.requestFingerprint = draft.requestFingerprint || "";
    form.confirmedSchedule = draft.requestPayload.schedule || null;
  }
  setFormValues(fm, draft ? draft.values : { inspected_at: toLocalInput(simNow()) });
  fm.elements.inspector.value = currentUser()?.name || "";
  if (draft) $("#draftInfo").textContent = `임시 저장본을 불러왔습니다 (${draft.savedAt})`;
  fm.addEventListener("input", (e) => {
    clearErr(e.target.name);
    syncForm();
  });
  fm.addEventListener("change", (e) => {
    clearErr(e.target.name);
    syncForm();
  });
  $("#btnDraft").addEventListener("click", saveDraft);
  $("#btnComplete").addEventListener("click", completeInspection);
  $$(".field", fm).forEach((fld) => {
    const label = $(".flabel", fld);
    if (!label) return;
    label.id = `report-label-${fld.dataset.field}`;
    $$('input:not([type="radio"]):not([type="checkbox"]),textarea,select,[role="radiogroup"]', fld).forEach((control) => {
      if (!control.hasAttribute("aria-label")) control.setAttribute("aria-labelledby", label.id);
    });
  });
  updateFormHead();
  syncForm();
}
function updateFormHead() {
  const f = fanById(ui.id);
  if (!f || !$("#formHead")) return;
  const eq = f.eq;
  $("#formHead").innerHTML = `
    <div class="report-equipment-name"><strong>${esc2(eq.equipment_name)}</strong></div>
    <span class="report-equipment-tag">${esc2(eq.tag)}</span><span class="report-equipment-location">${esc2(eq.location)}</span>`;
}
function getValues(fm) {
  const locked = $$("fieldset", fm).filter((x) => x.disabled);
  locked.forEach((x) => {
    x.disabled = false;
  });
  const fd = new FormData(fm);
  locked.forEach((x) => {
    x.disabled = true;
  });
  const v = {};
  for (const [k, val] of fd.entries()) {
    if (k === "visual") (v.visual ||= []).push(val);
    else v[k] = typeof val === "string" ? val.trim() : val;
  }
  v.visual ||= [];
  return v;
}
function setFormValues(fm, values) {
  for (const [k, val] of Object.entries(values || {})) {
    for (const el2 of $$(`[name="${k}"]`, fm)) {
      if (el2.type === "radio") el2.checked = el2.value === val;
      else if (el2.type === "checkbox") el2.checked = [].concat(val).includes(el2.value);
      else el2.value = val;
    }
  }
}
function syncForm() {
  const fm = $("#inspForm");
  if (!fm) return;
  const v = getValues(fm);
  $('[name="visual_etc"]', fm).hidden = !v.visual.includes("기타");
  $("#btnComplete").disabled = form.submitting || !!form.savedInspection;
  $("#btnDraft").disabled = form.submitting || !!form.savedInspection;
}
function clearErr(name) {
  const fld = name && $(`[data-field="${name === "est_hours_custom" ? "est_hours" : name}"]`);
  if (!fld) return;
  fld.classList.remove("invalid");
  const e = $(".err", fld);
  if (e) e.hidden = true;
}
function setErr(name, msg) {
  const fld = $(`[data-field="${name}"]`);
  if (!fld) return;
  fld.classList.add("invalid");
  const e = $(".err", fld);
  e.textContent = msg;
  e.hidden = false;
}
function validate(v) {
  const errs = [];
  const need = (key, message) => {
    if (!v[key]) errs.push([key, message]);
  };
  need("inspected_at", "점검 일시를 입력하세요.");
  need("inspector", "점검자를 입력하세요.");
  for (const [key, label] of [["operation_state", "설비 운전 상태"], ["noise", "소음 상태"], ["vibration", "진동 상태"], ["heat", "발열 상태"], ["need_additional", "추가 점검 필요 여부"]]) {
    if (!OPTS[key].includes(v[key])) errs.push([key, `${label}를 선택하세요.`]);
  }
  if (!DECISIONS.some(([value]) => value === v.decision)) errs.push(["decision", "대응 결정을 선택하세요."]);
  if ((v.visual || []).includes("기타") && !v.visual_etc) errs.push(["visual", "기타 육안 상태 내용을 입력하세요."]);
  return errs;
}
var reportScheduleType = (decision) => ({ "계속 관찰": "재확인", "추가 점검": "추가 점검", "정비 검토": "정비" })[decision];
var reportFingerprint = (values, schedule) => JSON.stringify({ submission_kind: "report", values, schedule: schedule || null });
function validateReportSchedule(schedule, inspectedAt) {
  if (!["정기 점검", "재확인", "추가 점검", "정비"].includes(schedule.type)) return ["type", "일정 구분을 선택해 주세요."];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.due_date || "")) return ["due_date", "일정 예정일을 지정해 주세요."];
  const parsed = /* @__PURE__ */ new Date(`${schedule.due_date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime()) || ymd(parsed) !== schedule.due_date) return ["due_date", "올바른 일정 예정일을 지정해 주세요."];
  if (inspectedAt && schedule.due_date < inspectedAt.slice(0, 10)) return ["due_date", "일정 예정일은 점검일과 같거나 이후로 선택해 주세요."];
  if (!String(schedule.assignee || "").trim()) return ["assignee", "일정 담당자를 입력해 주세요."];
  if (!String(schedule.items || "").trim()) return ["items", "일정 내용을 입력해 주세요."];
  return null;
}
function confirmReportSchedule(values, submittedForm, source, owner) {
  const dialog = $("#reportScheduleDialog"), scheduleForm = $("#reportScheduleForm");
  const prior = submittedForm.confirmedSchedule;
  setFormValues(scheduleForm, prior || { type: reportScheduleType(values.decision), due_date: "", assignee: values.inspector, items: values.memo || `현장 점검 · ${values.decision}` });
  scheduleForm.elements.due_date.min = values.inspected_at.slice(0, 10);
  const error = $("#reportScheduleError");
  error.hidden = true;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (schedule) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("hashchange", cancel);
      scheduleForm.onsubmit = null;
      dialog.oncancel = null;
      dialog.onclose = null;
      if (dialog.open) dialog.close();
      resolve(schedule);
    };
    const cancel = () => finish(null);
    $("#reportScheduleCancel").onclick = cancel;
    dialog.oncancel = (event) => {
      event.preventDefault();
      cancel();
    };
    dialog.onclose = cancel;
    window.addEventListener("hashchange", cancel, { once: true });
    scheduleForm.onsubmit = (event) => {
      event.preventDefault();
      if (!source.isConnected || form !== submittedForm || currentUser()?.id !== owner) return cancel();
      const fields = getValues(scheduleForm);
      const schedule = { equipment_id: submittedForm.id, type: fields.type, due_date: fields.due_date, assignee: fields.assignee, items: fields.items };
      const invalid = validateReportSchedule(schedule, values.inspected_at);
      if (invalid) {
        error.textContent = invalid[1];
        error.hidden = false;
        scheduleForm.elements[invalid[0]].focus();
        return;
      }
      finish(schedule);
    };
    dialog.showModal();
    scheduleForm.elements.due_date.focus();
  });
}
function showErrors(errs) {
  errs.forEach(([k, m]) => setErr(k, m));
  $(`[data-field="${errs[0][0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  toast("필수 항목을 확인해 주세요.");
}
function saveDraft() {
  const v = getValues($("#inspForm"));
  const savedAt = ymdhm(/* @__PURE__ */ new Date());
  store.draft.set(form.id, { values: v, savedAt, ...form.requestFingerprint === reportFingerprint(v, form.confirmedSchedule) ? { requestPayload: form.requestPayload, requestFingerprint: form.requestFingerprint } : {} });
  $("#draftInfo").textContent = `임시 저장됨 · ${savedAt}`;
  toast("작성 중인 내용을 임시 저장했습니다.");
}
function buildInspection(v) {
  const f = fanById(form.id), now = /* @__PURE__ */ new Date();
  return {
    inspection_id: `INS-${idStamp(now)}`,
    equipment_id: form.id,
    inspected_at: v.inspected_at,
    inspector: v.inspector,
    operation_state: v.operation_state,
    noise: v.noise,
    noise_memo: "",
    vibration: v.vibration,
    heat: v.heat,
    visual: v.visual,
    visual_etc: v.visual.includes("기타") ? v.visual_etc : "",
    need_additional: v.need_additional,
    memo: v.memo || "",
    model_status: f.snap.status,
    decision: v.decision,
    recheck_date: "",
    additional_items: "",
    additional_assignee: "",
    additional_due: "",
    created_at: toLocalInput(now)
  };
}
async function completeInspection() {
  await submitInspectionRequest();
}
async function submitInspectionRequest() {
  if (auth.experience || currentUser()?.role === "visitor" || form.submitting || form.savedInspection) return;
  const source = $("#inspForm");
  if (!source) return;
  const submittedForm = form, owner = currentUser()?.id;
  const supervisor = currentUser()?.role === "supervisor";
  const values = getValues(source), errs = validate(values);
  if (errs.length) return showErrors(errs);
  submittedForm.submitting = true;
  syncForm();
  $("#fsInspect").disabled = true;
  const active = () => source.isConnected && form === submittedForm && currentUser()?.id === owner;
  try {
    const schedule = supervisor ? await confirmReportSchedule(values, submittedForm, source, owner) : null;
    if (supervisor && !schedule || !active()) return;
    submittedForm.confirmedSchedule = schedule;
    const fingerprint = reportFingerprint(values, schedule);
    if (submittedForm.requestPayload?.submission_kind !== "report" || submittedForm.requestFingerprint !== fingerprint) {
      submittedForm.requestPayload = { request_key: requestKey(), submission_kind: "report", inspection: buildInspection(values), ...schedule ? { schedule } : {} };
      submittedForm.requestFingerprint = fingerprint;
    }
    store.draft.set(submittedForm.id, { values, savedAt: ymdhm(/* @__PURE__ */ new Date()), requestPayload: submittedForm.requestPayload, requestFingerprint: fingerprint });
    const result = await store.submitApproval(submittedForm.requestPayload);
    if (currentUser()?.id !== owner) return;
    store.draft.clear(submittedForm.id);
    void updateApprovalBadge(true);
    if (!active()) return;
    const status = result.request?.status || "pending";
    submittedForm.savedInspection = result.records?.inspections?.[0] || { ...submittedForm.requestPayload.inspection, approval_status: status };
    submittedForm.savedReview = null;
    $("#draftInfo").textContent = "";
    showDone(status === "approved" ? ["점검 보고서가 승인되고 지정한 일정이 캘린더에 등록되었습니다."] : status === "rejected" ? ["이 요청은 반려되었습니다. 승인 요청 화면에서 검토 의견을 확인해 주세요."] : ["점검 보고서를 제출하고 설비 팀장에게 승인 요청했습니다.", "설비 팀장이 승인할 때 날짜·담당자·내용을 지정하면 캘린더에 등록됩니다."], status);
  } catch (error) {
    if (active()) toast(error.message || "요청하지 못했습니다. 같은 내용으로 다시 시도해 주세요.");
  } finally {
    submittedForm.submitting = false;
    if (active()) {
      $("#fsInspect").disabled = !!submittedForm.savedInspection;
      syncForm();
    }
  }
}
function showDone(msgs, status) {
  const already = $$("#donePanel .msg").map((m) => m.textContent.trim());
  const all = [.../* @__PURE__ */ new Set([...already, ...msgs])];
  $("#donePanel").innerHTML = `
    <div class="done-panel">
      ${all.map((m) => `<div class="msg">${ICON.check}${m}</div>`).join("")}
      <div class="actions">
        <a class="btn primary" href="${status === "approved" ? "#/calendar" : "#/approvals"}">${status === "approved" ? "캘린더 확인" : "승인 요청 확인"}</a>
        <a class="btn" href="#/equipment/${form.id}">설비 상세로 돌아가기</a>
        <a class="btn" href="#/">설비 현황으로 돌아가기</a>
      </div>
    </div>`;
  $(".main-wrap").scrollTo({ top: 0, behavior: "smooth" });
  toast(msgs[msgs.length - 1]);
}
function renderAlarms() {
  setHeader({ title: "경보 발생 이력" });
  const all = fans.flatMap((f) => fanEvents(f)).filter((e) => ui.alarmFilter === "all" || e.type === ui.alarmFilter).sort((a, b) => timeOf(b.f, b.i) - timeOf(a.f, a.i)).slice(0, 80);
  const live = fans.filter((f) => f.snap.status === "경보").length;
  $("#view").innerHTML = `
    <div class="page"><div class="scope-label">조회 범위 · <b>${esc2(currentUser()?.scope || "전체 제철소")}</b></div>
      <div class="page-head">
        <div class="counts">
          <div class="count k-경보"><span>현재 경보</span><b>${live}</b></div>
          <div class="count k-주의"><span>현재 주의</span><b>${fans.filter((f) => f.snap.status === "주의").length}</b></div>
        </div>
        <div class="seg" role="group" aria-label="구분">
          <button type="button" data-afilter="all" aria-pressed="${ui.alarmFilter === "all"}">전체</button>
          <button type="button" data-afilter="경보" aria-pressed="${ui.alarmFilter === "경보"}">경보 발생</button>
          <button type="button" data-afilter="주의" aria-pressed="${ui.alarmFilter === "주의"}">이상 징후 감지</button>
        </div>
      </div>
      <section class="card table-card"><div class="tablewrap"><table class="list">
        <thead><tr><th>발생 시각</th><th>설비</th><th>위치</th><th>구분</th><th>내용</th><th>근거</th></tr></thead>
        <tbody>${all.length ? all.map((e) => {
    const t = eventText(e);
    return `<tr class="row-link" tabindex="0" data-go="${e.f.eq.equipment_id}">
            <td class="nw time">${ymdhm(timeOf(e.f, e.i))}</td><td class="nw"><b>${esc2(e.f.eq.equipment_name)}</b></td>
            <td class="nw">${esc2(e.f.eq.location)}</td><td>${badge(e.type)}</td><td class="nw"><b>${t.title}</b></td>
            <td>${esc2(t.note)}</td></tr>`;
  }).join("") : '<tr><td colspan="6" class="muted">표시할 이력이 없습니다.</td></tr>'}</tbody>
      </table></div></section>
      <p class="hint" style="margin-top:10px">최근 80건까지 표시합니다. 이상 징후 감지 = 기준을 넘었지만 경보 조건(같은 방향 2개 특징 4회 연속)은 충족하지 않은 시작 시점.</p>
    </div>`;
}
var nameOf = (id) => fanById(id)?.eq.equipment_name || id;
var recordProcess = () => ui.view === "calendar" ? ui.calendarProcess : ui.maintenanceProcess;
var scopedFans = () => fans.filter((f) => inScope(f, recordProcess()));
var matchesRecord = (id) => {
  const f = fanById(id);
  return Boolean(f && inScope(f, recordProcess()) && (ui.eqFilter === "all" || id === ui.eqFilter));
};
var processTabs = (selected) => `<div class="process-toolbar"><div class="process-tabs" role="group" aria-label="공정 선택">
  ${(auth.experience ? [{ key: "all", name: "전체 공정" }, ...PROCESSES.filter((p) => ["sinter", "steel"].includes(p.key))] : currentUser()?.process ? PROCESSES.filter((p) => p.key === currentUser().process) : [{ key: "all", name: "전체 제철소" }, ...PROCESSES]).map((p) => `<button type="button" data-process="${p.key}" aria-pressed="${selected === p.key}">${p.name}</button>`).join("")}
</div></div>`;
var eqSelect = () => `<label class="hint">설비 <select class="sel" id="eqFilter">
  <option value="all">전체 설비</option>
  ${scopedFans().map((f) => `<option value="${f.eq.equipment_id}"${ui.eqFilter === f.eq.equipment_id ? " selected" : ""}>${esc2(f.eq.equipment_name)}</option>`).join("")}
</select></label>`;
var flt = (rows) => rows.filter((r) => matchesRecord(r.equipment_id));
var tableHTML = (t, today) => `
  <div class="tablewrap"><table class="list">
    <thead><tr>${t.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.length ? t.rows.map((r) => `<tr class="row-link" tabindex="0" ${!auth.experience && t.reportKind ? `role="link" data-report-url="${esc2(reportLink(t.reportKind, r[t.reportKey]))}" aria-label="${esc2(nameOf(r.equipment_id))} 보고서 보기"` : `data-go="${r.equipment_id}"`}>${t.cells(r, today).map((c) => {
  const str = String(c ?? ""), html = str.startsWith("<span");
  return `<td class="${str.length > 18 && !html ? "wrap" : "nw"}">${html ? str : esc2(str)}</td>`;
}).join("")}</tr>`).join("") : `<tr><td colspan="${t.head.length}" class="muted">기록이 없습니다.</td></tr>`}</tbody>
  </table></div>`;
function renderMaintenance() {
  setHeader({ title: auth.experience ? "점검·정비 이력" : "점검·정비 보고서" });
  const db = store.db, today = ymd(simNow());
  const upcoming = db.follow_ups.filter((x) => x.status === "예정" && calendarApproved(x) && x.due_date >= today && matchesRecord(x.equipment_id)).sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.follow_up_id || "").localeCompare(String(b.follow_up_id || ""))).slice(0, 3).map((x) => ({ id: x.follow_up_id, date: x.due_date, eq: x.equipment_id, title: `후속 ${x.type}`, body: `${x.items} · ${x.assignee}${completionLabel(x) ? ` · ${completionLabel(x)}` : ""}` }));
  $("#view").innerHTML = `
    <div class="page maintenance-page">
      <div class="record-toolbar maintenance-toolbar" role="group" aria-label="점검·정비 보고서 공정·설비 필터">
        ${processTabs(ui.maintenanceProcess)}
        <div class="record-equipment-filter">${eqSelect()}</div>
        <a class="btn sm record-toolbar-action" href="${ui.maintenanceProcess === "all" ? "#/equipment" : `#/process/${ui.maintenanceProcess}/equipment`}">${ICON.pen}점검 작성할 설비 선택</a>
      </div>
      <div class="section-head" style="margin-top:0"><h2>다가오는 일정</h2><span class="hint">오늘 이후 예정된 일정 · 빠른 순 최대 3건</span></div>
      ${upcoming.length ? `<div class="upcoming">${upcoming.map((u) => `
        <a class="card up" href="${auth.experience ? `#/equipment/${u.eq}` : reportLink("followup", u.id)}">
          <div class="d">${esc2(u.date)}</div>
          <b>${esc2(nameOf(u.eq))} · ${esc2(u.title)}</b><span>${esc2(u.body)}</span></a>`).join("")}</div>` : '<div class="empty">선택한 공정·설비에 오늘 이후 예정된 일정이 없습니다.</div>'}
      <div class="section-head"><h2>${auth.experience ? "점검·정비 기록" : "보고서"}</h2><a class="btn sm" href="/api/export.xlsx?process=${encodeURIComponent(ui.maintenanceProcess)}&equipment=${encodeURIComponent(ui.eqFilter)}">엑셀파일로 내보내기</a></div>
      ${historyHTML()}
    </div>`;
}
function renderReportPreview() {
  const back = ui.reportFrom === "calendar" ? "#/calendar" : "#/maintenance";
  setHeader({ title: "점검·정비 보고서", back });
  const model = resolveReport(store.db, ui.reportKind, ui.reportId);
  const equipment = model && fanById(model.record.equipment_id)?.eq;
  if (!model || !equipment) {
    $("#view").innerHTML = `<div class="page"><section class="card rp-unavailable"><h2>보고서를 찾을 수 없습니다.</h2><p>담당 공정의 기록인지 확인해 주세요.</p><a class="btn" href="${back}">목록으로 돌아가기</a></section></div>`;
    return;
  }
  $("#view").innerHTML = `<div class="report-preview-page">${reportSummary(model, equipment)}${renderReport(model, equipment)}</div>`;
}
function historyHTML() {
  const db = store.db, today = ymd(simNow());
  const tabs = {
    inspections: {
      label: "점검 기록",
      reportKind: "inspection",
      reportKey: "inspection_id",
      rows: flt(db.inspections).sort((a, b) => b.inspected_at.localeCompare(a.inspected_at)),
      head: ["점검 일시", "설비", "점검자", "당시 상태", "운전 상태", "소음/진동/발열", "대응 결정", "일정 승인", "메모"],
      cells: (r) => [
        fmtDate(r.inspected_at),
        nameOf(r.equipment_id),
        r.inspector,
        r.model_status ? badge(r.model_status) : "-",
        r.operation_state,
        `${r.noise} / ${r.vibration} / ${r.heat}`,
        r.decision,
        approvalLabel(r.approval_status),
        r.memo
      ]
    },
    work: {
      label: auth.experience ? "정비 작업 이력" : "정비 작업 기록",
      reportKind: "work",
      reportKey: "work_id",
      rows: flt(db.work_history).sort((a, b) => b.work_date.localeCompare(a.work_date)),
      head: ["작업일", "설비", "작업 구분", "이상 내용", "조치", "결과", "반복 이상", "작업자"],
      cells: (r) => [
        r.work_date,
        nameOf(r.equipment_id),
        r.work_type,
        r.anomaly,
        r.action,
        r.result,
        r.repeat_anomaly === "Y" ? '<span class="badge plain gold">반복</span>' : "-",
        r.worker
      ]
    }
  };
  const cur = tabs[ui.histTab] ? ui.histTab : "inspections";
  return `
      <section class="card table-card">
        <div class="table-tools"><div class="seg" role="group" aria-label="기록 유형">
          ${Object.entries(tabs).map(([k, x]) => `<button type="button" data-htab="${k}" aria-pressed="${k === cur}">${x.label} ${x.rows.length}</button>`).join("")}
        </div></div>
        ${tableHTML(tabs[cur], today)}
      </section>
      <div class="files">
        저장 위치: ${store.mode === "mysql" ? "<b>서버 DB (MySQL)</b> — 점검·정비·일정을 함께 보관합니다. 다른 사용자의 새 기록은 새로고침하면 표시됩니다." : store.mode === "server" ? "<b>서버 DB</b> — <code>data/maintenance_db.json</code> 및 <code>data/maintenance_*.csv</code>에 바로 기록됩니다." : "<b>브라우저 저장</b> — <code>python3 server.py</code>로 실행하면 DB 파일에 기록됩니다."}
        ${store.mode === "mysql" ? "" : "· 설비 DB: <code>data/equipment_db.json</code> / <code>.csv</code>"}
      </div>`;
}
var cal = { y: null, m: null, sel: null, filters: { work: true, plan: true, completed: true, inspect: true } };
var completionActions = createCompletionActions({ store, getUser: () => currentUser(), requestKey });
function completionControl(record) {
  const status = completionStatus(record), pending = status === "pending", rejected = status === "rejected";
  const manager = currentUser()?.role === "supervisor";
  const busy = completionActions.isBusy(record.follow_up_id);
  return `<div class="completion-controls">
    ${pending || rejected ? `<span class="completion-state completion-${status}">${completionLabel(record)}</span>` : ""}
    ${record.completion_approval_request_id && (pending || rejected) ? `<a class="link-btn" href="#/approvals?status=${pending ? "pending" : "rejected"}&request=${encodeURIComponent(record.completion_approval_request_id)}">요청 ${pending ? "보기" : "결과 보기"}</a>` : ""}
    ${pending ? "" : `<button class="link-btn" type="button" data-done="${esc2(record.follow_up_id)}"${busy ? " disabled" : ""}>${busy ? "처리 중…" : manager ? "완료 처리" : rejected ? "완료 승인 다시 요청" : "완료 승인 요청"}</button>`}
  </div>${!manager && !pending ? '<p class="completion-help">설비 팀장이 승인하면 완료로 표시됩니다.</p>' : ""}`;
}
var CAL_KIND = {
  work: { label: "정비 작업", hint: "과거 정비 작업 이력" },
  plan: { label: "점검 일정", hint: "예정된 정기 점검·재확인·추가 점검" },
  completed: { label: "점검 완료", hint: "완료 처리한 점검 일정" },
  inspect: { label: "현장 점검", hint: "현장 점검 결과 기록" }
};
function calEvents() {
  const db = store.db, today = ymd(simNow()), ev = [];
  db.work_history.forEach((r) => ev.push({
    report: reportLink("work", r.work_id, "calendar"),
    date: r.work_date,
    kind: "work",
    eq: r.equipment_id,
    title: r.work_type,
    body: `${r.anomaly && r.anomaly !== "-" ? `${r.anomaly} → ` : ""}${r.action}`,
    meta: `${r.worker} · 결과 ${r.result}`,
    repeat: r.repeat_anomaly === "Y"
  }));
  db.follow_ups.forEach((r) => ev.push({
    report: reportLink("followup", r.follow_up_id, "calendar"),
    date: r.due_date,
    kind: r.status === "완료" ? "completed" : "plan",
    eq: r.equipment_id,
    title: r.type,
    body: r.items,
    meta: `담당 ${r.assignee} · ${completionLabel(r) || (r.status === "예정" && r.due_date < today ? "기한 지남" : r.status)}${r.status === "완료" ? " · 완료 처리: " + (r.completed_by || "기존 기록 · 미기록") + (r.completed_at ? " · " + fmtDate(r.completed_at) : "") : ""}`,
    overdue: r.status === "예정" && r.due_date < today,
    done: r.status === "완료",
    ref: r
  }));
  db.inspections.filter(calendarApproved).forEach((r) => ev.push({
    report: reportLink("inspection", r.inspection_id, "calendar"),
    date: String(r.inspected_at).slice(0, 10),
    kind: "inspect",
    eq: r.equipment_id,
    title: `현장 점검 · ${r.decision}`,
    body: r.memo || "메모 없음",
    meta: `점검자 ${r.inspector} · 당시 ${r.model_status || "-"}`
  }));
  return ev.filter((e) => e.date && matchesRecord(e.eq));
}
function renderCalendar() {
  setHeader({ title: "정비 캘린더" });
  const directSchedule = currentUser()?.role === "supervisor";
  const now = simNow(), today = ymd(now);
  if (cal.y == null) {
    cal.y = now.getFullYear();
    cal.m = now.getMonth();
    cal.sel = today;
  }
  const allEvents = calEvents();
  const ev = allEvents.filter((e) => cal.filters[e.kind]);
  const by = {};
  ev.forEach((e) => (by[e.date] ||= []).push(e));
  const first = new Date(cal.y, cal.m, 1);
  const start = new Date(cal.y, cal.m, 1 - first.getDay());
  const cells = [];
  for (let k = 0; k < 42; k++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + k));
  const monthEv = allEvents.filter((e) => e.date.startsWith(`${cal.y}-${pad(cal.m + 1)}`));
  const kindCount = (k) => monthEv.filter((e) => e.kind === k).length;
  const chip = (e) => `<span ${auth.experience ? "" : `data-report-url="${esc2(e.report)}"`} class="ev ev-${e.kind}${e.overdue ? " overdue" : ""}${e.done ? " done" : ""}" title="${esc2(nameOf(e.eq))} · ${esc2(e.title)}${e.kind === "completed" ? " · 점검 완료" : ""}">
    ${esc2(nameOf(e.eq).replace("배기가스 팬 ", "팬 "))} ${esc2(e.title)}${e.ref && completionStatus(e.ref) === "pending" ? " · 완료 승인 대기" : ""}</span>`;
  const selEv = (by[cal.sel] || []).sort((a, b) => a.kind.localeCompare(b.kind));
  const selD = /* @__PURE__ */ new Date(`${cal.sel}T00:00`);
  $("#view").innerHTML = `
    <div class="page cal-page">
      <div class="record-toolbar cal-tools cal-toolbar" role="group" aria-label="캘린더 공정·설비·기록 필터">
        ${processTabs(ui.calendarProcess)}
        <div class="record-equipment-filter cal-equipment-filter">${eqSelect()}</div>
        <div class="filters cal-event-filters" role="group" aria-label="표시할 기록 종류">
          ${Object.entries(CAL_KIND).map(([k, v]) => `<label class="cal-filter ev-${k}" title="${v.hint}">
            <input type="checkbox" data-calf="${k}"${cal.filters[k] ? " checked" : ""}><i></i>${v.label} <b>${kindCount(k)}</b></label>`).join("")}
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
          <div class="cal-grid cal-dow">${DOW.map((d, i) => `<div class="${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</div>`).join("")}</div>
          <div class="cal-grid cal-days">${cells.map((d) => {
    const key = ymd(d), list = by[key] || [];
    const out = d.getMonth() !== cal.m;
    return `<button type="button" class="cal-day${out ? " out" : ""}${key === today ? " today" : ""}${key === cal.sel ? " sel" : ""}${d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : ""}" data-day="${key}">
              <span class="dn">${d.getDate()}</span>
              <span class="evs">${list.slice(0, 3).map(chip).join("")}${list.length > 3 ? `<span class="ev-more">+${list.length - 3}건</span>` : ""}</span>
            </button>`;
  }).join("")}</div>
        </section>
        <aside class="card cal-side">
          <div class="cs-head"><h3>${selD.getMonth() + 1}월 ${selD.getDate()}일 (${DOW[selD.getDay()]})</h3>${cal.sel === today ? '<span class="badge info plain">오늘</span>' : ""}</div>
          <div class="cs-list">${selEv.length ? selEv.map((e) => `
            <div class="cs-item ev-${e.kind}${e.overdue ? " overdue" : ""}" ${auth.experience ? "" : `data-report-url="${esc2(e.report)}"`}>
              <div class="cs-top"><span class="ev-tag">${CAL_KIND[e.kind].label}</span>${e.overdue ? '<span class="badge plain st-경보">기한 지남</span>' : ""}${e.repeat ? '<span class="badge plain gold">반복 이상</span>' : ""}</div>
              <a href="${auth.experience ? `#/equipment/${e.eq}` : e.report}" class="cs-title">${esc2(nameOf(e.eq))} · ${esc2(e.title)}</a>
              <div class="cs-body">${esc2(e.body)}</div>
              <div class="cs-meta">${esc2(e.meta)}</div>
              ${e.kind === "plan" && e.ref && e.ref.status === "예정" ? completionControl(e.ref) : ""}
            </div>`).join("") : '<div class="muted cs-empty">이 날짜에 등록된 점검·정비 일정이 없습니다.</div>'}</div>
          <form class="cs-form" id="calForm" autocomplete="off">
            <h4>이 날짜에 점검 일정 ${directSchedule ? "추가" : "승인 요청"}</h4>
            ${directSchedule ? "" : '<p class="hint">설비 팀장이 승인하면 캘린더에 등록됩니다.</p>'}
            <select name="equipment_id" class="sel" required aria-label="설비">${scopedFans().map((f) => `<option value="${f.eq.equipment_id}"${ui.eqFilter === f.eq.equipment_id ? " selected" : ""}>${esc2(f.eq.equipment_name)} · ${esc2(f.eq.plant)}</option>`).join("")}</select>
            <select name="type" class="sel" aria-label="구분"><option>정기 점검</option><option>재확인</option><option>추가 점검</option></select>
            <input name="assignee" type="text" placeholder="담당자 (예: 홍길동)" required aria-label="담당자">
            <input name="items" type="text" placeholder="점검 내용 (예: 베어링 윤활 상태 확인)" required aria-label="점검 내용">
            <button class="btn primary sm" type="submit"${scopedFans().length ? "" : " disabled"}>${directSchedule ? "일정 추가" : "일정 승인 요청"}</button>
            ${scopedFans().length ? "" : '<p class="hint">이 공정에 등록된 기계설비가 없습니다.</p>'}
          </form>
        </aside>
      </div>
    </div>`;
  let calendarRequest = null, calendarFingerprint = "", calendarSaving = false;
  $("#calForm").addEventListener("input", (event) => {
    event.currentTarget.dataset.dirty = "1";
  });
  $("#calForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (calendarSaving) return;
    const fd = Object.fromEntries(new FormData(e.target).entries());
    if (!fd.assignee.trim() || !fd.items.trim()) return toast("담당자와 점검 내용을 입력해 주세요.");
    const nowR = /* @__PURE__ */ new Date();
    const rec = {
      follow_up_id: `FU-CAL-${idStamp(nowR)}`,
      equipment_id: fd.equipment_id,
      inspection_id: "",
      type: fd.type,
      due_date: cal.sel,
      assignee: fd.assignee.trim(),
      items: fd.items.trim(),
      status: "예정",
      created_at: toLocalInput(nowR)
    };
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
    } catch (error) {
      submit.disabled = false;
      calendarSaving = false;
      return toast(error.message || "요청하지 못했습니다. 다시 시도해 주세요.");
    }
    if (ui.view === "calendar" && source.isConnected) renderCalendar();
    if (!directSchedule) void updateApprovalBadge(true);
    toast(directSchedule ? "점검 일정이 추가되었습니다." : "설비 팀장에게 일정 승인을 요청했습니다. 승인 후 캘린더에 표시됩니다.");
  });
}
function searchMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return fans.filter((f) => [f.eq.equipment_name, f.eq.tag, f.eq.location, f.eq.process_name, f.eq.equipment_id].some((x) => String(x).toLowerCase().includes(q)));
}
function renderSearch() {
  const input = $("#searchInput"), pop = $("#searchPop");
  const res = searchMatches(input.value);
  if (!input.value.trim()) {
    pop.hidden = true;
    return;
  }
  pop.innerHTML = res.length ? res.map((f, i) => `<a href="#/equipment/${f.eq.equipment_id}" class="${i === 0 ? "focus" : ""}">
      <span><b>${esc2(f.eq.equipment_name)}</b><small>${esc2(f.eq.tag)} · ${esc2(f.eq.location)}</small></span>${badge(f.snap.status)}</a>`).join("") : '<div class="none">검색 결과가 없습니다.</div>';
  pop.hidden = false;
}
document.addEventListener("click", (e) => {
  const report = e.target.closest("[data-report-url]");
  if (report && !e.target.closest("a[href],button[data-done],.completion-controls")) {
    e.preventDefault();
    const day = report.closest("[data-day]");
    if (day) {
      cal.sel = day.dataset.day;
      const date = /* @__PURE__ */ new Date(`${cal.sel}T00:00`);
      cal.y = date.getFullYear();
      cal.m = date.getMonth();
    }
    location.hash = report.dataset.reportUrl;
    return;
  }
  const fold = e.target.closest("[data-dashboard-toggle]");
  if (fold) {
    const key = `overview-fold-${ui.process || "home"}`;
    store.pref.set(key, !store.pref.get(key, false));
    syncPanelFold();
    return;
  }
  const go = e.target.closest("[data-go]");
  if (go && !e.target.closest("a[href]")) {
    location.hash = `#/equipment/${go.dataset.go}`;
    return;
  }
  const sort = e.target.closest("[data-sort]");
  if (sort) {
    ui.sort = sort.dataset.sort;
    store.pref.set("sort", ui.sort);
    ui.view === "overview" ? updateOverview() : renderList();
    return;
  }
  const process = e.target.closest("[data-process]");
  if (process) {
    const key = process.dataset.process;
    if (!["all", ...PROCESSES.map((p) => p.key)].includes(key)) return;
    if (ui.view === "list") {
      location.hash = key === "all" ? "#/equipment" : `#/process/${key}/equipment`;
    } else {
      ui.eqFilter = "all";
      if (ui.view === "calendar") {
        ui.calendarProcess = key;
        renderCalendar();
      } else {
        ui.maintenanceProcess = key;
        renderMaintenance();
      }
    }
    return;
  }
  const ft = e.target.closest("[data-feature]");
  if (ft) {
    ui.feature = ft.dataset.feature;
    ui.hover.index = null;
    updateDetail();
    return;
  }
  const rg = e.target.closest("[data-range]");
  if (rg) {
    ui.range = rg.dataset.range;
    ui.hover.index = null;
    updateDetail();
    return;
  }
  const af = e.target.closest("[data-afilter]");
  if (af) {
    ui.alarmFilter = af.dataset.afilter;
    renderAlarms();
    return;
  }
  const ht = e.target.closest("[data-htab]");
  if (ht) {
    ui.histTab = ht.dataset.htab;
    renderMaintenance();
    return;
  }
  const cn = e.target.closest("[data-cal]");
  if (cn) {
    const k = cn.dataset.cal;
    if (k === "today") {
      const n = simNow();
      cal.y = n.getFullYear();
      cal.m = n.getMonth();
      cal.sel = ymd(n);
    } else {
      const d = new Date(cal.y, cal.m + (k === "next" ? 1 : -1), 1);
      cal.y = d.getFullYear();
      cal.m = d.getMonth();
      cal.sel = ymd(d);
    }
    renderCalendar();
    return;
  }
  const dd = e.target.closest("[data-day]");
  if (dd) {
    cal.sel = dd.dataset.day;
    const d = /* @__PURE__ */ new Date(`${cal.sel}T00:00`);
    if (d.getMonth() !== cal.m) {
      cal.y = d.getFullYear();
      cal.m = d.getMonth();
    }
    renderCalendar();
    return;
  }
  const dn = e.target.closest("[data-done]");
  if (dn) {
    if (dn.disabled || completionActions.isBusy(dn.dataset.done)) return;
    const previous = dn.textContent, owner = currentUser()?.id;
    dn.disabled = true;
    dn.textContent = "처리 중…";
    completionActions.complete(dn.dataset.done).then((result) => {
      if (result.stale) return;
      if (ui.view === "calendar") renderCalendar();
      if (result.ignored) return;
      if (result.requested) void updateApprovalBadge(true);
      toast(result.requested ? completionResultMessage(result.result?.request) : "완료로 처리했습니다.");
    }).catch(async (err) => {
      if (currentUser()?.id !== owner) return;
      if (dn.isConnected) {
        dn.disabled = false;
        dn.textContent = previous;
      }
      if (err.status === 409) {
        await store.refreshMaintenance().catch(() => {
        });
        if (currentUser()?.id !== owner) return;
        if (ui.view === "calendar" && !$("#calForm")?.dataset.dirty) renderCalendar();
      }
      toast(err.message || "요청하지 못했습니다. 다시 시도해 주세요.");
    });
    return;
  }
  const al = e.target.closest("[data-alarm]");
  if (al) {
    readAlarm(Number(al.dataset.alarm));
    setAlarmOpen(false);
    al.closest(".atoast")?.remove();
  }
  const notice = e.target.closest("[data-notice-id]");
  if (notice) {
    e.preventDefault();
    const destination = notice.getAttribute("href");
    void approvalInbox?.markRead([notice.dataset.noticeId]);
    setAlarmOpen(false);
    if (location.hash === destination) route();
    else location.hash = destination;
    return;
  }
  const ct = e.target.closest("[data-close-toast]");
  if (ct) {
    ct.closest(".atoast")?.remove();
    return;
  }
  if (e.target.closest("#alarmBtn")) {
    setExperienceUserOpen(false);
    setAlarmOpen($("#alarmPop").hidden);
    return;
  }
  if (e.target.closest("#userBtn")) {
    if (auth.experience) {
      setExperienceUserOpen($("#experienceUserPop").hidden);
      return;
    }
    setAlarmOpen(false);
    location.hash = userDestination();
    return;
  }
  if (auth.experience && e.target.closest("#experienceHome")) {
    setExperienceUserOpen(false);
    sim.setSpeed(0);
    history.replaceState(null, "", "/experience/#/start");
    location.reload();
    return;
  }
  if (!e.target.closest(".user-menu")) setExperienceUserOpen(false);
  if (e.target.id === "alarmReadAll") {
    const ids = (approvalInbox?.items || []).filter((n) => !n.read).map((n) => n.event_id || n.id);
    alarms.list.forEach((a) => {
      a.read = true;
    });
    renderAlarmBadge();
    renderToasts();
    if (ids.length) void approvalInbox.markRead(ids);
    return;
  }
  if (!e.target.closest(".alarm-menu")) setAlarmOpen(false);
  const sp = e.target.closest("[data-speed]");
  if (sp) {
    sim.setSpeed(Number(sp.dataset.speed));
    store.pref.set("speed", sim.speed);
    tick();
    updateLive();
    return;
  }
  if (!e.target.closest("#live")) {
    $("#livePop").hidden = true;
    $("#liveBtn").setAttribute("aria-expanded", "false");
  }
  if (!e.target.closest(".search")) $("#searchPop").hidden = true;
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "eqFilter") {
    ui.eqFilter = e.target.value;
    (ui.view === "calendar" ? renderCalendar : renderMaintenance)();
  }
  if (e.target.matches("[data-calf]")) {
    cal.filters[e.target.dataset.calf] = e.target.checked;
    renderCalendar();
  }
  if (e.target.id === "alarmBrowser") {
    if (e.target.checked && "Notification" in window && Notification.permission !== "granted") {
      const res = await Notification.requestPermission();
      if (res !== "granted") {
        e.target.checked = false;
        toast("브라우저 알림이 허용되지 않았습니다.");
      }
    }
    alarms.browser = e.target.checked;
    store.pref.set("notify", alarms.browser);
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-report-url][tabindex]")) {
    e.preventDefault();
    location.hash = e.target.dataset.reportUrl;
    return;
  }
  if (e.key === "Escape" && auth.experience && $("#experienceUserPop") && !$("#experienceUserPop").hidden) {
    setExperienceUserOpen(false);
    $("#userBtn").focus();
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-go][tabindex]")) {
    e.preventDefault();
    location.hash = `#/equipment/${e.target.dataset.go}`;
  }
  if (e.key === "Escape") {
    const wasOpen = !$("#alarmPop").hidden;
    setAlarmOpen(false);
    if (wasOpen) $("#alarmBtn").focus();
    $("#livePop").hidden = true;
    $("#searchPop").hidden = true;
    appEl().classList.remove("sb-mobile-open");
  }
});
$("#searchInput").addEventListener("input", renderSearch);
$("#searchInput").addEventListener("focus", renderSearch);
$("#searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = searchMatches(e.target.value)[0];
    if (first) {
      location.hash = `#/equipment/${first.eq.equipment_id}`;
      e.target.value = "";
      $("#searchPop").hidden = true;
      e.target.blur();
    }
  }
});
$("#searchPop").addEventListener("click", (e) => {
  if (e.target.closest("a")) {
    $("#searchInput").value = "";
    $("#searchPop").hidden = true;
  }
});
$("#liveBtn").addEventListener("click", () => {
  const pop = $("#livePop");
  pop.hidden = !pop.hidden;
  $("#liveBtn").setAttribute("aria-expanded", String(!pop.hidden));
});
async function restartPlayback() {
  if (!auth.experience) {
    try {
      const round = await replayController?.reset();
      if (round) {
        sim.setSpeed(10);
        updateLive();
        toast("새 재생 회차를 시작합니다. 최초 경보는 현재 계정의 이메일·휴대폰으로만 전달됩니다.");
      }
    } catch (error) {
      toast(error.message || "재생 회차를 바꾸지 못했습니다. 다시 시도해 주세요.");
    }
    return;
  }
  sim.reset();
  sim.setSpeed(10);
  sim.elapsed = 0;
  $("#hdClock").textContent = clockText(simNow());
  fans.forEach((f) => {
    f.snap = null;
  });
  alarms.list = [];
  renderAlarmBadge();
  renderToasts();
  updateFans();
  onDataTick();
  toast("처음 위치부터 다시 재생합니다.");
}
$("#simReset").addEventListener("click", restartPlayback);
document.addEventListener("gb-experience-reset", restartPlayback);
$("#themeToggle").addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  syncBrandIcons();
  if (ui.view === "overview") {
    layoutMap();
    updateOverview();
  }
  if (ui.view === "detail") updateDetail();
  $("#themeToggle").setAttribute("aria-label", t === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
});
$("#sbClose").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 900px)").matches) appEl().classList.remove("sb-mobile-open");
  else setSidebar(true);
});
$("#sbOpen").addEventListener("click", () => setSidebar(false));
$("#hdMenu").addEventListener("click", () => {
  setAlarmOpen(false);
  $("#alarmToasts").replaceChildren();
  appEl().classList.add("sb-mobile-open");
});
$("#scrim").addEventListener("click", () => appEl().classList.remove("sb-mobile-open"));
function syncHeaderBottom() {
  document.documentElement.style.setProperty("--header-bottom", `${Math.max(0, $(".header").getBoundingClientRect().bottom)}px`);
}
function setAlarmOpen(open) {
  $("#alarmPop").hidden = !open;
  $("#alarmBtn").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("alarm-open", open);
  if (open) {
    syncHeaderBottom();
    $("#alarmToasts").replaceChildren();
    renderAlarmPop();
    void approvalInbox?.refresh();
  }
}
if ("ResizeObserver" in window) new ResizeObserver(syncHeaderBottom).observe($(".header"));
var resizeTimer;
window.addEventListener("resize", () => {
  syncHeaderBottom();
  placeAlarmToasts();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (ui.view === "overview") {
      layoutMap();
      syncPanelFold();
    }
    if (ui.view === "detail") updateDetail();
  }, 100);
});
var currentUser = () => auth.user;
var started = false;
function passwordEye(visible) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${visible ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M3 9s3 6 9 6 9-6 9-6M5 12l-2 3m6-1-1 4m7-4 1 4m3-6 2 3"/>'}</svg>`;
}
function passwordField(id, name, label) {
  return `<label for="${id}">${label}</label><div class="password-field"><input id="${id}" name="${name}" type="password" autocomplete="current-password" maxlength="128" required><button type="button" class="password-toggle" data-password-toggle="${id}" data-password-label="${label}" aria-label="${label} 표시" title="${label} 표시" aria-controls="${id}" aria-pressed="false">${passwordEye(false)}</button></div>`;
}
function renderUserName() {
  $("#userName").textContent = currentUser()?.name || "관리자";
  renderAlarmBadge();
}
async function showStart(mode = "selection", message = "") {
  approvalInbox?.stop();
  approvalInbox?.reset();
  const el2 = $("#start");
  el2.hidden = false;
  document.body.classList.add("on-start");
  if (auth.experience) {
    document.body.classList.add("personal-experience");
    return mountExperienceStart(el2, { auth, esc: esc2, message });
  }
  el2.innerHTML = `<div class="st-bg" aria-hidden="true"><img src="${HOME_MAP[theme()]}" alt=""></div><div class="role-panel"><p>관리자 목록을 불러오는 중입니다.</p></div>`;
  try {
    const { profiles } = await auth.request("/api/demo/profiles");
    const card = (p) => `<button class="role-card" data-profile="${p.id}" aria-label="${p.name} ${p.title} ${p.scope} 선택">
      <span class="role-avatar avatar-${p.avatar}"><img src="assets/brand/role-people.png" alt=""></span>
      <strong>${esc2(p.name)}</strong><span class="role-title">${esc2(p.title)}</span><span>${esc2(p.scope)}</span></button>`;
    el2.innerHTML = `<div class="st-bg" aria-hidden="true"><img src="${HOME_MAP[theme()]}" alt=""></div>
      <section class="role-panel"><img class="role-logo" src="assets/brand/wordmark-navy.png" alt="GB system">
        <h1>POSCO 포항제철소</h1><p class="role-lead">담당 관리자를 선택해 설비 현황을 확인하세요.</p>
        <div class="role-groups"><section class="role-chief"><h2>설비 팀장</h2><p>전체 제철소 · 통합 관리</p>${profiles.filter((p) => !p.process).map(card).join("")}</section>
        <section class="role-fields"><h2>현장관리자</h2><p>담당 공정 · 현장 점검</p><div class="role-field-cards">${profiles.filter((p) => p.process).map(card).join("")}</div></section></div>
        <p id="roleError" role="alert">${esc2(message)}</p><p class="role-foot">발표용 역할 선택 · 선택한 관리자 이름으로 작성 이력이 기록됩니다.</p></section>`;
    el2.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", async () => {
      el2.querySelectorAll("[data-profile]").forEach((b) => b.disabled = true);
      try {
        await auth.selectProfile(button.dataset.profile);
        history.replaceState(null, "", auth.user.home);
        location.reload();
      } catch (error) {
        $("#roleError").textContent = error.message;
        el2.querySelectorAll("[data-profile]").forEach((b) => b.disabled = false);
      }
    }));
  } catch (error) {
    el2.querySelector(".role-panel").textContent = error.message;
  }
}
document.addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-password-toggle]");
  if (toggle) {
    const input = document.getElementById(toggle.dataset.passwordToggle);
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    toggle.innerHTML = passwordEye(visible);
    toggle.setAttribute("aria-pressed", String(visible));
    const label = `${toggle.dataset.passwordLabel} ${visible ? "숨기기" : "표시"}`;
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }
  if (event.target.id === "switchUser") {
    try {
      await auth.logout();
      location.reload();
    } catch (error) {
      toast(error.message || "로그아웃하지 못했습니다.");
    }
  }
  if (event.target.closest("[data-st-theme]")) {
    $("#themeToggle").click();
    const image = $(".st-bg img");
    if (image) image.src = HOME_MAP[theme()];
  }
});
window.addEventListener("gb-session-expired", () => location.reload());
window.addEventListener("gb-save-warning", (event) => toast(event.detail));
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !started) return;
  const identity = () => JSON.stringify([currentUser()?.id, currentUser()?.role, currentUser()?.process]);
  const previous = identity();
  approvalInbox?.stop();
  try {
    await auth.session();
    if (identity() !== previous) location.reload();
    else if (!auth.experience) {
      await replayController?.refresh();
      approvalInbox?.start();
    }
  } catch {
    toast("로그인 상태를 확인하지 못했습니다. 연결을 확인해 주세요.");
  }
});
(async function init() {
  if (document.documentElement.dataset.sb === "collapsed") appEl().classList.add("sb-collapsed");
  updateLive();
  try {
    let useRound = function(round = null) {
      alarmReporter?.dispose();
      alarmReporter = auth.experience ? null : createAlarmReporter({
        userId: user.id,
        revision: store.playbackRevision,
        roundId: round?.id || "",
        equipmentIds: store.equipment.map((eq) => eq.equipment_id),
        request: auth.request.bind(auth),
        read: (key) => store.pref.get(key, null),
        write: (key, value) => store.pref.set(key, value)
      });
      if (round || auth.experience) sim.speed = 0;
      sim.restore(round ? `${user.id}.${round.id}` : user.id, playbackDataId);
      sim.save(true);
      updateLive();
      sim.elapsed = Math.floor(sim.ms / 6e4);
      fans.forEach((f) => {
        f.snap = null;
      });
      alarms.list = [];
      if (started) {
        updateFans();
        seedAlarms();
        renderAlarmBadge();
        renderToasts();
        onDataTick();
      }
    };
    const user = await auth.session();
    if (!user || auth.experience && location.hash === "#/start") {
      showStart();
      return;
    }
    document.body.classList.toggle("personal-experience", auth.experience);
    approvalInbox = createApprovalInbox({
      auth,
      onChange: () => {
        approvalInboxError = "";
        renderAlarmBadge();
      },
      onError: (error, { operation }) => {
        approvalInboxError = error.message || "알림 연결 실패";
        if (operation === "read") toast("읽음 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        if (!$("#alarmPop").hidden) renderAlarmPop();
      }
    });
    if (!auth.experience && window.isSecureContext && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await auth.request("/api/notifications/subscribe", { subscription: subscription.toJSON() });
      } catch {
      }
    }
    const ts = await store.load();
    const by = parseTimeseries(ts);
    fans = store.equipment.map((eq) => ({ eq, an: analyze(by[eq.equipment_id]), start: eq.demo_start_index }));
    playbackDataId = playbackDatasetId(ts, store.equipment, SIM_START);
    if (!auth.experience) {
      replayController = createExperienceReplay({
        storageNamespace: "team",
        userId: user.id,
        revision: store.playbackRevision,
        request: auth.request.bind(auth),
        read: (key) => store.pref.get(key, null),
        write: (key, value) => store.pref.set(key, value),
        onRound: useRound,
        onError: () => {
        }
      });
      await replayController.start();
    } else useRound();
    sim.elapsed = Math.floor(sim.ms / 6e4);
    updateLive();
    updateFans();
    seedAlarms();
    $("#sbFoot").innerHTML = auth.experience ? "<b>설비 상태 체험</b><br>새 경보·주의 알림을 화면에서 확인합니다." : "저장: <b>서버 DB (MySQL)</b><br>작성자·완료 처리자 자동 기록";
    $("#hdClock").textContent = clockText(simNow());
    window.addEventListener("hashchange", route);
    started = true;
    sim.last = performance.now();
    document.body.classList.remove("on-start");
    $("#start").hidden = true;
    renderUserName();
    route();
    if (!auth.experience) approvalInbox.start();
    setInterval(tick, 250);
  } catch (error) {
    showStart("login", error.message || "서버에 연결하지 못했습니다.");
  }
})();
