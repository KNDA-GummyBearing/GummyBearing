// [LOGIN CHANGE] 기존 저장 모듈: 서버 인증 필수, 계정별 초안, 서버가 부여한 기록 ID 반영.
// All maintenance writes require a server session. Never fall back on auth failure.
import { auth } from './auth.js';
const safeGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const safeDel = k => { try { localStorage.removeItem(k); } catch {} };
const keyOf = { inspections: 'inspection_id', maintenance_reviews: 'review_id', follow_ups: 'follow_up_id' };
const actorIdentity = () => JSON.stringify([auth.user?.id, auth.user?.role, auth.user?.process]);
let saving = false;
export const store = {
  playbackRevision: null,
  equipment: [], db: { inspections: [], maintenance_reviews: [], follow_ups: [], work_history: [] },
  get mode() { return 'mysql'; },
  get canReset() { return false; },
  async load() {
    const [eq, db, ts] = await Promise.all([
      auth.request('/api/equipment'), auth.request('/api/maintenance'),
      fetch('data/sensor_timeseries.csv', { credentials: 'same-origin', cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('진동 데이터를 읽지 못했습니다. 다시 로그인해 주세요.');
        this.playbackRevision = r.headers.get('X-GB-Data-Revision');
        return r.text();
      }),
    ]);
    this.equipment = eq.records;
    for (const k of Object.keys(this.db)) this.db[k] = db[k] || [];
    return ts;
  },
  async save(records, { operation = 'create' } = {}) {
    if (saving) throw new Error('저장 중입니다. 잠시 기다려 주세요.');
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request('/api/maintenance', { ...records, operation });
      if (actorIdentity() !== owner) return result;
      // Use the actual server-issued IDs, names and timestamps in the UI.
      for (const [table, rows] of Object.entries(result.records)) {
        for (let j = 0; j < rows.length; j++) {
          const rec = rows[j];
          Object.assign(records[table][j], rec);
          const i = this.db[table].findIndex(x => x[keyOf[table]] === rec[keyOf[table]]);
          if (i >= 0) this.db[table][i] = rec; else this.db[table].push(rec);
        }
      }
      if (result.warning) window.dispatchEvent(new CustomEvent('gb-save-warning', { detail: result.warning }));
      return result;
    } finally { saving = false; }
  },
  // Approval writes are atomic on the server. Only returned follow-ups become calendar schedules.
  mergeRecords(records = {}) {
    for (const [table, rows] of Object.entries(records)) {
      if (!this.db[table] || !keyOf[table]) continue;
      for (const rec of rows) {
        const index = this.db[table].findIndex(x => x[keyOf[table]] === rec[keyOf[table]]);
        if (index >= 0) this.db[table][index] = rec; else this.db[table].push(rec);
      }
    }
  },
  async refreshMaintenance() {
    const owner = actorIdentity();
    const db = await auth.request('/api/maintenance');
    if (actorIdentity() !== owner) return;
    for (const key of Object.keys(this.db)) this.db[key] = db[key] || [];
  },
  async submitApproval(payload) {
    if (saving) throw new Error('요청을 처리 중입니다. 잠시 기다려 주세요.');
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request('/api/approvals/submit', payload);
      if (actorIdentity() === owner) this.mergeRecords(result.records);
      return result;
    } finally { saving = false; }
  },
  async decideApproval(payload) {
    const owner = actorIdentity();
    const result = await auth.request('/api/approvals/decide', payload);
    if (actorIdentity() === owner) this.mergeRecords(result.records);
    return result;
  },
  async submitCompletion(payload) {
    if (saving) throw new Error('요청을 처리 중입니다. 잠시 기다려 주세요.');
    saving = true;
    const owner = actorIdentity();
    try {
      const result = await auth.request('/api/completions/submit', payload);
      if (actorIdentity() === owner) this.mergeRecords(result.records);
      return result;
    } finally { saving = false; }
  },
  async decideCompletion(payload) {
    const owner = actorIdentity();
    const result = await auth.request('/api/completions/decide', payload);
    if (actorIdentity() === owner) this.mergeRecords(result.records);
    return result;
  },
  async reset() {
    throw new Error('MySQL 기록 보호를 위해 초기화를 제공하지 않습니다.');
  },
  history(equipmentId) {
    const by = rows => rows.filter(r => r.equipment_id === equipmentId);
    return { inspections: by(this.db.inspections), reviews: by(this.db.maintenance_reviews),
      followUps: by(this.db.follow_ups), work: by(this.db.work_history) };
  },
  draft: {
    get: id => safeGet('gb.draft.' + auth.user?.id + '.' + id),
    set: (id, v) => safeSet('gb.draft.' + auth.user?.id + '.' + id, v),
    clear: id => safeDel('gb.draft.' + auth.user?.id + '.' + id),
  },
  pref: {
    get: (k, d) => safeGet('gb.pref.' + k) ?? d,
    set: (k, v) => safeSet('gb.pref.' + k, v),
  },
};
