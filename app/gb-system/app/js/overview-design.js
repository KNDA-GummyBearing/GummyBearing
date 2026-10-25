// 2026-10-23: supplied 1920×1080 design. Only presentation examples live here.
// These values do not write to MySQL or affect the six monitored fans' alarm rules.
const PROCESS_EXAMPLE_COUNTS = Object.freeze({
  sinter: Object.freeze({ total: 2480, normal: 2108, warning: 298, alarm: 74 }),
  iron: Object.freeze({ total: 3200, normal: 3152, warning: 32, alarm: 16 }),
  steel: Object.freeze({ total: 2840, normal: 2556, warning: 199, alarm: 85 }),
  casting: Object.freeze({ total: 1860, normal: 1804, warning: 37, alarm: 19 }),
  rolling: Object.freeze({ total: 2100, normal: 1932, warning: 121, alarm: 47 }),
});
const OVERALL_EXAMPLE_COUNTS = Object.freeze(Object.values(PROCESS_EXAMPLE_COUNTS).reduce(
  (sum, counts) => Object.fromEntries(Object.keys(sum).map(key => [key, sum[key] + counts[key]])),
  { total: 0, normal: 0, warning: 0, alarm: 0 },
));
const formatCount = value => value.toLocaleString('ko-KR');
const countParts = counts => [counts.normal, counts.warning, counts.alarm];
export const DESIGN_EXAMPLE = Object.freeze({
  metrics: [
    ['전체 관리 설비', formatCount(OVERALL_EXAMPLE_COUNTS.total), '대'],
    ['정상 설비 수', formatCount(OVERALL_EXAMPLE_COUNTS.normal), '대'],
    ['주의 설비 수', formatCount(OVERALL_EXAMPLE_COUNTS.warning), '대'],
    ['경보 설비 수', formatCount(OVERALL_EXAMPLE_COUNTS.alarm), '대'],
  ],
  trend: [10, 55, 22, 98, 55, 40, 49, 20, 43, 39],
  processes: [['sinter', '소결'], ['iron', '제선'], ['steel', '제강'], ['casting', '연주'], ['rolling', '압연']],
  distribution: countParts(OVERALL_EXAMPLE_COUNTS),
  repairs: [['대기', 91], ['진행', 54], ['완료', 183]],
  overall: OVERALL_EXAMPLE_COUNTS,
  processCounts: PROCESS_EXAMPLE_COUNTS,
});

export const MAP_POSITIONS = Object.freeze({
  'EGF-01': [39.349, 47.546], 'EGF-02': [52.943, 28.472], 'EGF-03': [80.911, 45.787],
  'EGF-04': [52.109, 25.324], 'EGF-05': [61.224, 36.620], 'EGF-06': [66.849, 58.657],
});

// Additional positions from the supplied process mockups: 6 sinter / 13 steel in total.
// Presentation-only markers have no equipment ID, detail link, alarm event or DB record.
export const MAP_EXAMPLE_MARKERS = Object.freeze({
  sinter: [
    { x: 73.255, y: 55.880, status: '정상' },
    { x: 64.401, y: 65.139, status: '주의' },
    { x: 71.432, y: 74.120, status: '정상' },
  ],
  steel: [
    { x: 56.172, y: 30.139, status: '주의' },
    { x: 47.474, y: 37.269, status: '주의' },
    { x: 51.536, y: 42.083, status: '주의' },
    { x: 64.453, y: 39.491, status: '정상' },
    { x: 68.516, y: 43.472, status: '정상' },
    { x: 55.755, y: 46.157, status: '정상' },
    { x: 59.401, y: 50.324, status: '주의' },
    { x: 63.203, y: 54.491, status: '경보' },
    { x: 51.224, y: 65.139, status: '경보' },
    { x: 61.797, y: 75.787, status: '주의' },
  ],
});

const icon = paths => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${paths}</svg>`;
const chart = icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 17v-5M12 17V7M17 17v-8"/>');
const ring = icon('<path d="M12 3a9 9 0 1 1-3 .5M12 3v9"/>');
export const wrench = icon('<path d="M14.5 13.5a7 7 0 0 0-8-10.8L11 7l-4 4-4.3-4.5a7 7 0 0 0 10.8 8L20 21l2-2z"/>');
const warning = icon('<path d="M12 3 22 21H2zM12 9v5"/><path d="M12 17v.5"/>');
export const sectionTitle = (symbol, title) => `<h2 class="ov-heading">${symbol}<span>${title}</span></h2>`;
export const statusLegend = () => '<ul class="ov-legend"><li><i class="normal"></i>정상</li><li><i class="warning"></i>주의</li><li><i class="alarm"></i>경보</li></ul>';
export function designDonut(label, parts = DESIGN_EXAMPLE.distribution) {
  const total = parts.reduce((a, b) => a + b, 0) || 1;
  const a = parts[0] / total * 100, b = (parts[0] + parts[1]) / total * 100;
  return `<div class="ov-donut" style="--normal-end:${a}%;--warning-end:${b}%" role="img" aria-label="${label} 설비 현황 예시 · 정상 ${formatCount(parts[0])}대 · 주의 ${formatCount(parts[1])}대 · 경보 ${formatCount(parts[2])}대"><span>${label}</span></div>`;
}
// Every bar shares a 0–100% scale. The varied demonstration distributions
// reconcile to the same plant totals and never alter the six monitored fans.
export function processComparison() {
  const states = [['normal', '정상'], ['warning', '주의'], ['alarm', '경보']];
  return `<div class="ov-process-comparison" aria-label="공정별 정상·주의·경보 비율 비교">
    ${DESIGN_EXAMPLE.processes.map(([key, label]) => {
      const counts = DESIGN_EXAMPLE.processCounts[key];
      const description = states.map(([state, text]) => `${text} ${formatCount(counts[state])}대 (${(counts[state] / counts.total * 100).toFixed(1)}%)`).join(' · ');
      return `<a class="ov-process-row" href="#/process/${key}" aria-label="${label}공정 보기 · 전체 ${formatCount(counts.total)}대 · ${description}">
        <div class="ov-comparison-head"><strong>${label}공정</strong><span>전체 <b>${formatCount(counts.total)}</b>대 · 정상 <b class="ov-normal-ratio">${(counts.normal / counts.total * 100).toFixed(1)}%</b></span></div>
        <div class="ov-composition-bar" aria-hidden="true">${states.map(([state]) => `<span class="${state}" style="width:${counts[state] / counts.total * 100}%"></span>`).join('')}</div>
        <div class="ov-comparison-values">${states.map(([state, text]) => `<span><i class="${state}" aria-hidden="true"></i>${text} <b>${formatCount(counts[state])}</b><small>대</small></span>`).join('')}</div>
      </a>`;
    }).join('')}
  </div>`;
}
export const foldControl = () => '<button type="button" class="ov-fold" data-dashboard-toggle aria-label="현황 카드 접기" aria-expanded="true" aria-controls="overviewPanels"><svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>';

export function homeSummary() {
  const p = DESIGN_EXAMPLE;
  const states = ['total', 'normal', 'warning', 'alarm'];
  return `<section class="home-summary" aria-label="전체 제철소 설비 현황 예시">
    <div class="home-summary-title">${sectionTitle(chart, '전체 제철소 설비 현황')}
      <span class="home-example-label">예시 데이터</span><p>공정별 예시 통계를 합산한 수치입니다.</p>
    </div>
    <dl class="home-summary-metrics">${p.metrics.map(([label, value, unit], i) => `<div class="home-metric home-metric-${states[i]}"><dt>${label}</dt><dd>${value}<small>${unit}</small></dd></div>`).join('')}</dl>
  </section>`;
}

export function homePanels() {
  const p = DESIGN_EXAMPLE;
  const repairMax = Math.max(...p.repairs.map(([, value]) => value));
  return `<section class="ov-card ov-operations home-process-panel" aria-label="공정별 설비 현황 예시">
    ${sectionTitle(ring, '공정별 설비 현황')}
    <p class="ov-comparison-note">공정별 전체 설비를 100%로 비교한 예시 데이터입니다.</p>
    ${processComparison()}
    </section>
    <section class="ov-card home-repair-panel" aria-label="설비 수리 진행 현황 예시">
    <div class="ov-repairs">${sectionTitle(wrench, '설비 수리 진행 현황')}
      <p class="ov-comparison-note">대기·진행·완료 건수는 화면 시연용 예시입니다.</p>
      <dl>${p.repairs.map(([label, value], i) => `<div><dt>${label}</dt><dd><span class="ov-repair-track"><i class="repair-${i}" style="width:${value / repairMax * 100}%"></i></span><span>${value}건</span></dd></div>`).join('')}</dl>
    </div></section>`;
}

export function processSummary(name) {
  const key = DESIGN_EXAMPLE.processes.find(([, label]) => `${label}공정` === name)?.[0];
  const p = DESIGN_EXAMPLE.processCounts[key] || DESIGN_EXAMPLE.overall;
  const values = [p.total, p.normal, p.warning, p.alarm];
  return `<section class="ov-card ov-process-summary">${sectionTitle(icon('<path d="M3 21V10l6 4V9l6 4V3h5v18z"/>'), `${name} 설비 현황`)}
    <div class="ov-process-summary-body"><div>${designDonut(name.replace('공정',''), countParts(p))}${statusLegend()}</div>
    <dl class="ov-process-counts">${['전체 설비 수','정상 수','주의 수','경보 수'].map((label, i) => `<div><dt>${label}</dt><dd>${formatCount(values[i])}</dd></div>`).join('')}</dl></div>
</section>`;
}
export const inspectionHeading = () => sectionTitle(warning, '점검 필요 설비');
