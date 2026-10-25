// Read-only report presentation shared by history, calendar and approval review.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shown = value => Array.isArray(value) ? value.join(', ') || '해당 없음' : String(value ?? '').trim() || '미기록';
export const reportLink = (kind, id, from = 'maintenance') => `#/reports/${kind}/${encodeURIComponent(id)}?from=${from === 'calendar' ? 'calendar' : 'maintenance'}`;
export function resolveReport(db, kind, id) {
  const spec = {inspection:['inspections','inspection_id'], followup:['follow_ups','follow_up_id'], work:['work_history','work_id']}[kind];
  if (!spec) return null;
  const record = (db[spec[0]] || []).find(row => row[spec[1]] === id);
  if (!record) return null;
  const inspection = kind === 'inspection' ? record : kind === 'followup' && record.inspection_id
    ? (db.inspections || []).find(row => row.inspection_id === record.inspection_id && row.equipment_id === record.equipment_id) : null;
  return {record, inspection:inspection || null, schedule:kind === 'followup' ? record : null,
    work:kind === 'work' ? record : null, approval:inspection?.report_approval || record.report_approval || null};
}
export function reportDate(value) {
  if (!value) return '미기록';
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) ? value + '+09:00' : value);
  if (Number.isNaN(date.getTime())) return shown(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '. ') + '.';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true}).format(date);
}
export function reportSummary(model, equipment = {}) {
  const i=model.inspection, w=model.work, s=model.schedule;
  const fields = i ? [reportDate(i.inspected_at),equipment.equipment_name || i.equipment_id,i.inspector,i.model_status,i.operation_state,[i.noise,i.vibration,i.heat].map(shown).join(' / '),i.decision]
    : w ? [reportDate(w.work_date),equipment.equipment_name || w.equipment_id,w.worker,w.work_type,w.result]
    : [reportDate(s?.due_date),equipment.equipment_name || s?.equipment_id,s?.assignee,s?.type,s?.status || '점검 예정'];
  return `<div class="rp-summary" aria-label="보고서 요약">${fields.map(text=>`<span>${esc(shown(text))}</span>`).join('')}</div>`;
}
export function renderReport(model, equipment = {}, {embedded = false} = {}) {
  const i=model.inspection, s=model.schedule, w=model.work, a=model.approval;
  const pending = !i && !w;
  const field = (label,value,extra='') => `<div class="rp-field ${extra}"><dt>${label}</dt><dd>${esc(shown(value))}</dd></div>`;
  const equipmentField = `<div class="rp-field rp-equipment"><dt>설비명</dt><dd><strong>${esc(equipment.equipment_name || i?.equipment_id || s?.equipment_id || w?.equipment_id)}</strong><small>${esc([equipment.tag,equipment.location ? '위치 ' + equipment.location : ''].filter(Boolean).join(' · '))}</small></dd></div>`;
  const author = i?.inspector || w?.worker || s?.assignee;
  const audit = a ? `<div class="rp-review"><strong>${a.status === 'pending' ? '검토 상태' : '검토자'}${a.status === 'pending' ? '' : ' | ' + esc(a.reviewer_name || '미기록')}</strong><div><p>${esc(a.status === 'pending' ? '설비 팀장 승인 대기' : a.note || '검토 의견 미기록')}</p><span>${esc(a.status === 'approved' ? '승인 완료' : a.status === 'rejected' ? '반려' : '승인 대기')}${a.reviewed_at ? ' · ' + esc(reportDate(a.reviewed_at)) : ''}</span></div></div>`
    : `<div class="rp-review rp-review-empty"><strong>검토 이력</strong><div><p>${pending ? '점검 결과 보고서가 아직 작성되지 않았습니다.' : '이 기록에 저장된 승인 이력이 없습니다.'}</p></div></div>`;
  return `<article class="rp-report${embedded ? ' rp-embedded' : ''}" aria-label="${w ? '정비 작업 보고서' : '현장 점검·정비 보고서'}">
    <header class="rp-heading"><h2>${w ? '정비 작업 보고서' : '현장 점검·정비 보고서'}</h2><strong>${pending ? '예정 담당자' : '작성자'} | ${esc(shown(author))}</strong>${pending ? '<span class="rp-pending">점검 예정 · 결과 미작성</span>' : ''}</header>
    <dl class="rp-row">${equipmentField}${field(w ? '작업일' : pending ? '점검 예정일' : '점검 일시',reportDate(i?.inspected_at || w?.work_date || s?.due_date))}</dl>
    ${w ? `<dl class="rp-row">${field('작업 구분',w.work_type)}${field('작업 결과',w.result)}</dl><div class="rp-body"><dl>${field('이상 내용',w.anomaly)}${field('반복 이상',w.repeat_anomaly === 'Y' ? '있음' : '없음')}${field('작업 시간',w.downtime_h !== null && w.downtime_h !== undefined && w.downtime_h !== '' ? w.downtime_h + '시간' : '')}</dl><dl>${field('조치 내용',w.action,'rp-memo')}</dl></div>`
      : `<dl class="rp-row">${field('운전 상태',i?.operation_state || '미작성')}${field('추가 점검',i?.need_additional || '미작성')}</dl>
      <div class="rp-body"><dl>${field('소음',i?.noise || '미작성')}${i?.noise_memo ? field('소음 메모',i.noise_memo) : ''}${field('진동',i?.vibration || '미작성')}${field('발열',i?.heat || '미작성')}${field('육안 상태',i ? [...(Array.isArray(i.visual) ? i.visual : i.visual ? [i.visual] : []),i.visual_etc].filter(Boolean).join(', ') || '해당 없음' : '미작성')}</dl><dl>${field(pending ? '예정 점검 내용' : '점검 메모',i ? i.memo : s?.items,'rp-memo')}</dl></div>
      ${i ? `<dl class="rp-row rp-decision">${field('점검 후 대응',i.decision)}</dl>` : ''}`}
    ${s && i ? `<dl class="rp-row rp-schedule">${field('후속 일정',`${s.type} · ${reportDate(s.due_date)} · ${s.assignee}`)}${field('일정 내용',s.items)}</dl>` : ''}
    ${!pending ? '<p class="rp-declaration">위 내용과 같이 보고서를 제출합니다.</p>' : ''}${audit}
  </article>`;
}
