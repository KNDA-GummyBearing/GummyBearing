import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReport,renderReport,reportDate,reportLink} from '../js/report-preview.js';
const i={inspection_id:'I1',equipment_id:'E1',inspector:'실제 작성자',inspected_at:'2026-10-26T14:00',memo:'실제 기록',decision:'계속 관찰',visual:[],report_approval:{status:'approved',reviewer_name:'실제 검토자',note:'승인 의견',reviewed_at:'2026-10-26T16:00:00+09:00'}};
const db={inspections:[i],follow_ups:[{follow_up_id:'F1',equipment_id:'E1',inspection_id:'I1',type:'정기 점검',due_date:'2026-10-30',assignee:'담당자',items:'윤활 확인'},{follow_up_id:'F2',equipment_id:'E1',inspection_id:'',type:'정기 점검'},{follow_up_id:'F3',equipment_id:'E2',inspection_id:'I1'}],work_history:[{work_id:'W1',equipment_id:'E1',worker:'작업자',action:'정렬',result:'정상'}]};
test('a scheduled follow-up opens its exact source report and approval audit',()=>{
  const model=resolveReport(db,'followup','F1');assert.equal(model.inspection,i);assert.equal(model.approval,i.report_approval);
  const html=renderReport(model);for(const text of ['실제 작성자','실제 검토자','승인 의견','실제 기록','계속 관찰','윤활 확인'])assert.ok(html.includes(text));
});
test('missing report, invalid ID and cross-equipment link cannot resolve to another report',()=>{
  assert.equal(resolveReport(db,'inspection','unknown'),null);
  assert.equal(resolveReport(db,'followup','F3').inspection,null);
  const model=resolveReport(db,'followup','F2');assert.equal(model.inspection,null);
  const html=renderReport(model);assert.match(html,/결과 미작성/);assert.doesNotMatch(html,/실제 작성자|승인 완료|위 내용과 같이 보고서를 제출/);
});
test('pending and legacy reports never fabricate reviewer or approval',()=>{
  const model={inspection:{...i,report_approval:null},approval:{status:'pending'}};
  assert.match(renderReport(model),/설비 팀장 승인 대기/);assert.doesNotMatch(renderReport(model),/승인 완료/);
  model.approval=null;assert.match(renderReport(model),/저장된 승인 이력이 없습니다/);
});
test('report content is escaped and Korea time stays stable across browser zones',()=>{
  assert.match(renderReport({inspection:{...i,memo:'<script>alert(1)</script>'}}),/&lt;script&gt;/);
  assert.equal(reportDate('2026-10-26T14:00'),reportDate('2026-10-26T14:00:00+09:00'));
  assert.equal(reportLink('inspection','a/b','calendar'),'#/reports/inspection/a%2Fb?from=calendar');
});
test('maintenance work keeps its own action and result instead of invented inspection results',()=>{
  const html=renderReport(resolveReport(db,'work','W1'));assert.match(html,/정비 작업 보고서/);assert.match(html,/정렬/);assert.doesNotMatch(html,/소음|현장 점검·정비 보고서/);
});
test('empty inspection memo stays empty and zero work duration is preserved',()=>{
  const model=resolveReport(db,'followup','F1');
  model.inspection={...model.inspection,memo:''};
  const html=renderReport(model);
  assert.match(html,/점검 메모<\/dt><dd>미기록<\/dd>/);
  assert.match(renderReport({work:{equipment_id:'E1',downtime_h:0}}),/0시간/);
});
