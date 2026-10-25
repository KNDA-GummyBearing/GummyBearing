// Ordinary CSV playback -> server -> every subscribed device in the process.
// The durable pending queue survives reloads; server IDs deduplicate concurrent PCs.
export function createAlarmReporter({ userId, revision, roundId = '', equipmentIds, request, read, write, now = Date.now }) {
  const key = `alarm-report.v1.${userId}.${revision}${roundId ? '.' + roundId : ''}`;
  const allowed = new Set(equipmentIds), pending = new Map(), sent = new Set();
  let busy = false, nextAttempt = 0, attempts = 0, blocked = '', lastError = '';
  let disposed = false, activeController = null;
  try {
    const saved = read(key);
    for (const id of saved?.sent || []) if (allowed.has(id)) sent.add(id);
    for (const row of saved?.pending || []) {
      if (allowed.has(row.equipment_id) && Number.isInteger(row.sample_index) && row.sample_index >= 0)
        pending.set(row.equipment_id, row.sample_index);
    }
  } catch { /* Storage can be disabled. In-memory delivery still works. */ }
  function save() {
    try { write(key, { sent: [...sent], pending: [...pending].map(([equipment_id, sample_index]) => ({equipment_id, sample_index})) }); }
    catch { /* Never stop monitoring because browser storage is full. */ }
  }
  return {
    capture(id, previous, current, firstAlarm) {
      // Opening/restoring an already-red page is not a new alarm. A speed jump
      // crossing the first alarm IS one, even if that exact sample was skipped.
      if (disposed || !revision || !allowed.has(id) || sent.has(id) || pending.has(id)) return;
      if (!Number.isInteger(previous) || firstAlarm < 0 || previous >= firstAlarm || current < firstAlarm) return;
      pending.set(id, firstAlarm); save();
    },
    async flush() {
      if (disposed || !revision || busy || blocked || !pending.size || now() < nextAttempt) return;
      busy = true;
      const [equipment_id, sample_index] = pending.entries().next().value;
      const controller = new AbortController();
      activeController = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        await request('/api/notifications/playback', { actor_id: userId, revision, equipment_id, sample_index,
          ...(roundId ? {round_id: roundId} : {}) }, {signal:controller.signal});
        if (disposed) return;
        pending.delete(equipment_id); sent.add(equipment_id); save();
        attempts = 0; nextAttempt = 0; lastError = '';
      } catch (error) {
        if (disposed) return;
        // An uncertain HTTP reply is safe to retry: the server event ID is stable.
        if ([400, 401, 403, 409].includes(error.status)) blocked = '담당자·데이터 상태를 확인하려면 새로고침해 주세요.';
        else { attempts++; nextAttempt = now() + Math.min(60000, 1000 * 2 ** Math.min(attempts, 6)); }
        lastError = '서버 연결을 기다리는 중입니다. 경보 전송을 다시 시도합니다.';
      } finally { clearTimeout(timeout); busy = false; activeController = null; }
    },
    dispose() { disposed = true; activeController?.abort(); },
    get status() {
      if (!revision) return '자동 경보 연결을 불러오지 못했습니다. 새로고침해 주세요.';
      if (blocked) return blocked;
      if (lastError) return `${lastError} (대기 ${pending.size}건)`;
      return pending.size ? `새 경보 ${pending.size}건을 서버로 전달 중입니다.` : '일반 데이터 재생의 새 경보를 서버로 자동 전달합니다.';
    },
  };
}
