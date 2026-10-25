import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/overview-design.js', import.meta.url), 'utf8');
const { DESIGN_EXAMPLE, processComparison, processSummary, homePanels } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const expected = {
  sinter: {total:2480,normal:2108,warning:298,alarm:74},
  iron: {total:3200,normal:3152,warning:32,alarm:16},
  steel: {total:2840,normal:2556,warning:199,alarm:85},
  casting: {total:1860,normal:1804,warning:37,alarm:19},
  rolling: {total:2100,normal:1932,warning:121,alarm:47},
};
test('comparison preserves the agreed example counts and reconciles all states to their totals', () => {
  assert.deepEqual(DESIGN_EXAMPLE.processCounts, expected);
  for (const row of Object.values(expected)) assert.equal(row.normal + row.warning + row.alarm, row.total);
  assert.deepEqual(DESIGN_EXAMPLE.overall, {total:12480,normal:11552,warning:687,alarm:241});
});
test('each process is a full-scale 100% bar with exact proportions, readable counts and its own link', () => {
  const html = processComparison();
  const rows = [...html.matchAll(/<a class="ov-process-row" href="#\/process\/([^"]+)"[\s\S]*?<\/a>/g)];
  assert.equal(rows.length, 5);
  for (const row of rows) {
    const counts = expected[row[1]];
    const widths = [...row[0].matchAll(/class="(normal|warning|alarm)" style="width:([\d.]+)%"/g)];
    assert.equal(widths.length, 3);
    for (const [, state, width] of widths) assert.ok(Math.abs(Number(width) - counts[state] / counts.total * 100) < 1e-10);
    assert.ok(Math.abs(widths.reduce((sum, match) => sum + Number(match[2]), 0) - 100) < 1e-10);
    for (const count of Object.values(counts)) assert.ok(row[0].includes(count.toLocaleString('ko-KR')));
  }
  assert.match(homePanels(), /100%로 비교한 예시 데이터/);
  assert.doesNotMatch(homePanels(), /class="ov-donuts"/);
});
test('individual process rings use the same data and proportions as their comparison rows', () => {
  for (const [key, name] of DESIGN_EXAMPLE.processes) {
    const html = processSummary(name + '공정'), counts = expected[key];
    const normal = Number(html.match(/--normal-end:([\d.]+)%/)[1]);
    const warning = Number(html.match(/--warning-end:([\d.]+)%/)[1]);
    assert.ok(Math.abs(normal - counts.normal / counts.total * 100) < 1e-10);
    assert.ok(Math.abs(warning - (counts.normal + counts.warning) / counts.total * 100) < 1e-10);
    assert.match(html, /class="ov-donut"/);
  }
});
test('all five demonstration distributions differ and show their normal percentages explicitly', () => {
  const percentages = Object.values(DESIGN_EXAMPLE.processCounts).map(row => (row.normal / row.total * 100).toFixed(1));
  assert.deepEqual(percentages, ['85.0', '98.5', '90.0', '97.0', '92.0']);
  assert.equal(new Set(percentages).size, 5);
  const shown = [...processComparison().matchAll(/class="ov-normal-ratio">([\d.]+)%/g)].map(match => match[1]);
  assert.deepEqual(shown, percentages);
  assert.deepEqual(DESIGN_EXAMPLE.overall, {total:12480,normal:11552,warning:687,alarm:241});
});
