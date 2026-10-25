// 판정 엔진 — Baseline N=20 · B 방식 2/3 · 연속 4회
//
// 1) 정상 기준: 처음 20개 측정값의 평균 + 3σ (축·특징별)
// 2) 측정값이 기준을 넘으면 '기준 초과'
// 3) B 방식: 같은 축(수평 또는 수직)에서 4회 연속 기준을 초과한 특징이 3개 중 2개 이상이면 경보 조건 충족
// 4) 최초로 경보 조건을 충족한 시점 = 최초 경보. 이후에는 경보 상태를 유지하고 지속률을 계산한다.
// (원본 CSV의 최초경보 시점·지속률과 6개 설비 모두 일치하도록 검증함)

export const RULE = { baselineN: 20, need: 2, of: 3, consecutive: 4, method: 'B' };
export const AXES = ['h', 'v'];
export const FEATURES = ['rms', 'peak', 'kurtosis'];

export const AXIS_LABEL = { h: '수평', v: '수직' };
// 사용자 화면에는 지표명 대신 상세 화면 이름을 쓴다 (용어 설명표)
export const FEATURE = {
  rms: { name: '진동 크기(RMS)', short: '진동 크기', phrase: '전반적인 진동이 커졌음', desc: '측정 구간 전체에서 계산한 진동 크기가 기준을 넘었음' },
  peak: { name: '순간 최대 진동(Peak)', short: '순간 최대 진동', phrase: '순간적으로 큰 진동이 확인됨', desc: '측정 중 가장 큰 진동값이 기준을 넘었음' },
  kurtosis: { name: '충격성 지표(첨도)', short: '충격성 지표', phrase: '진동 패턴의 변화가 확인됨', desc: '전체 진동에 비해 유난히 큰 값이 두드러지는 정도가 기준을 넘었음' },
};

export const REASONS = {
  sustained: { title: '이상 진동 지속 확인', desc: '경보 이후에도 이상 진동이 계속 확인되고 있습니다.' },
  consecutive: { title: '이상 진동 연속 확인', desc: '이상 진동이 여러 측정 구간에서 연속적으로 확인되었습니다.' },
  multi: { title: '여러 진동 항목에서 이상 확인', desc: '여러 진동 항목에서 이상이 함께 확인되었습니다.' },
  unusual: { title: '평소와 다른 진동 감지', desc: '평소 운전 상태와 다른 진동 변화가 감지되었습니다.' },
};

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

export function parseTimeseries(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  const by = {};
  for (const line of lines) {
    const c = line.split(',');
    const id = c[0];
    (by[id] ||= []).push(Object.fromEntries(head.slice(2).map((k, i) => [k, +c[i + 2]])));
  }
  return by;
}

// 시계열 전체를 한 번 분석해 두고, 화면은 '현재 인덱스'까지만 잘라서 본다.
export function analyze(series) {
  const n = series.length;
  const N = RULE.baselineN;
  const th = {};
  for (const a of AXES) for (const f of FEATURES) {
    const base = series.slice(0, N).map(p => p[`${a}_${f}`]);
    th[`${a}_${f}`] = mean(base) + 3 * stdev(base);
  }
  const exceed = [], pct = [], run = [], axisMet = [], cond = [];
  const prevRun = Object.fromEntries(AXES.flatMap(a => FEATURES.map(f => [`${a}_${f}`, 0])));
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
    exceed.push(e); pct.push(p); run.push(r); axisMet.push(am);
    cond.push(AXES.some(a => am[a] >= RULE.need));
  }
  const firstAlarm = cond.indexOf(true);
  const alarmAxes = firstAlarm < 0 ? [] : AXES.filter(a => axisMet[firstAlarm][a] >= RULE.need);
  // 경보 발생 시점: 경보 조건이 끊겼다가 다시 충족된 시점 (최초 경보 포함)
  const alarmEvents = [];
  for (let i = 0; i < n; i++) if (cond[i] && (i === 0 || !cond[i - 1])) alarmEvents.push(i);
  // 누적 충족 횟수 (지속률 계산용)
  const condCum = [];
  cond.reduce((s, c, i) => (condCum[i] = s + (c ? 1 : 0)), 0);
  return { series, n, th, exceed, pct, run, axisMet, cond, firstAlarm, alarmAxes, alarmEvents, condCum };
}

const anyExceed = (an, i) => i >= 0 && Object.values(an.exceed[i]).some(Boolean);

// 현재 인덱스 기준 설비 상태 스냅샷
export function snapshot(an, now) {
  const i = Math.min(Math.max(now, 0), an.n - 1);
  const fa = an.firstAlarm;
  const alarmed = fa >= 0 && fa <= i;
  const recentExceed = [0, 1, 2, 3].some(d => anyExceed(an, i - d));

  let status = '정상';
  if (i < RULE.baselineN) status = '정상';
  else if (alarmed) status = '경보';
  else if (recentExceed) status = '주의';

  const ex = an.exceed[i];
  const exceedFeatures = FEATURES.filter(f => AXES.some(a => ex[`${a}_${f}`]));
  const multiAxis = AXES.filter(a => FEATURES.filter(f => ex[`${a}_${f}`]).length >= 2);
  const maxExceedPct = Math.max(0, ...Object.values(an.pct[i]));

  const sinceAlarm = alarmed ? i - fa : null;
  const persistCount = alarmed ? an.condCum[i] - an.condCum[fa] : 0; // 경보 이후 추가로 조건을 충족한 횟수
  const persistenceRate = alarmed ? (an.condCum[i] - (fa > 0 ? an.condCum[fa - 1] : 0)) / (i - fa + 1) * 100 : 0;
  const sustained = alarmed && i > fa && an.cond[i];
  const lastEvent = alarmed ? an.alarmEvents.filter(e => e <= i).pop() : null;
  let lastExceed = null;
  if (!alarmed) for (let k = i; k >= RULE.baselineN; k--) if (anyExceed(an, k)) { lastExceed = k; break; }

  const reasons = {
    sustained,
    consecutive: alarmed,
    multi: multiAxis.length > 0,
    unusual: exceedFeatures.length > 0 || (status === '주의' && recentExceed),
  };
  const shown = status === '정상' ? [] : Object.keys(REASONS).filter(k => reasons[k]);
  const mainReason = shown[0] || null;

  const focusAxis = alarmed ? an.alarmAxes : [];
  const metAxis = AXES.reduce((b, a) => (an.axisMet[i][a] > an.axisMet[i][b] ? a : b), focusAxis[0] || 'h');

  return {
    index: i, status, alarmed, recentExceed, exceedFeatures, multiAxis, maxExceedPct,
    firstAlarm: alarmed ? fa : null, sinceAlarm, persistCount, persistenceRate, sustained,
    lastEvent, lastExceed, reasons, shown, mainReason, focusAxis,
    featuresMet: an.axisMet[i][metAxis], metAxis,
    ended: now >= an.n - 1,
  };
}

// 우선 확인 순: 현재 상태 → 지속률 높은 순 → 정상 범위 초과 정도 큰 순 → 최근 경보 시점(최신) 순
const STATUS_RANK = { 경보: 0, 주의: 1, 정상: 2 };
export function priorityCompare(a, b) {
  const sa = a.snap, sb = b.snap;
  return (STATUS_RANK[sa.status] - STATUS_RANK[sb.status])
    || (sb.persistenceRate - sa.persistenceRate)
    || (sb.maxExceedPct - sa.maxExceedPct)
    || ((b.lastAlarmTime || 0) - (a.lastAlarmTime || 0));
}
// 최근 경보 순: 최근 경보가 발생한 설비부터 (경보가 없으면 뒤로, 그 안에서는 우선 확인 순)
export function recentAlarmCompare(a, b) {
  return ((b.lastAlarmTime || 0) - (a.lastAlarmTime || 0)) || priorityCompare(a, b);
}
