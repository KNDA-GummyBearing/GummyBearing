// [V10.2 PLAYBACK PERSISTENCE 2026-10-22]
// 재생 위치는 같은 브라우저·계정에 저장. 페이지가 닫힌 시간은 더하지 않는다.
const SPEEDS = [0, 1, 10, 60, 120, 600];
const validSpeed = value => typeof value === 'number' && SPEEDS.includes(value);
const validMs = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 8e15;

// 데이터가 교체되면 이전 데이터의 재생 위치를 적용하지 않는다. 보안용 해시가 아님.
export function playbackDatasetId(text, equipment, start) {
  let hash = 2166136261;
  const source = text + JSON.stringify(equipment.map(e => [e.equipment_id, e.demo_start_index])) + start;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${source.length}:${hash >>> 0}`;
}

export function createPlayback({ now, read, write, initialSpeed = 10 }) {
  let key = null, dataset = null, savedAt = -Infinity, savedValue = '';
  const state = {
    ms: 0, speed: validSpeed(initialSpeed) ? initialSpeed : 10, last: now(),
    restore(userId, datasetId) {
      key = `playback.v1.${userId}`;
      dataset = datasetId;
      savedAt = -Infinity; savedValue = '';
      let saved;
      try { saved = read(key); } catch { /* 저장 차단 시 현재 세션에서 재생 */ }
      state.ms = 0;
      if (saved?.version === 1 && saved.dataset === dataset && validMs(saved.ms) && validSpeed(saved.speed)) {
        state.ms = saved.ms;
        state.speed = saved.speed;
      }
      // performance.now는 새 문서마다 기준이 다름. 저장값/실제 시각으로 경과를 보정하지 않음.
      state.last = now();
    },
    advance() {
      const t = now();
      state.ms += Math.max(0, t - state.last) * state.speed;
      state.last = t;
    },
    setSpeed(speed) {
      if (!validSpeed(speed)) return;
      state.advance(); // 속도 변경 전까지의 시간은 이전 속도로 계산.
      state.speed = speed;
      state.save(true);
    },
    reset() {
      state.ms = 0;
      state.last = now();
      state.save(true); // 명시적인 '처음부터' 조작만 위치를 초기화.
    },
    save(force = false) {
      if (!key || !validMs(state.ms)) return;
      const t = now();
      if (!force && t - savedAt < 1000) return; // ×600에서도 초당 최대 1회 저장.
      const value = { version: 1, dataset, ms: state.ms, speed: state.speed };
      const serialized = JSON.stringify(value);
      if (serialized === savedValue) return;
      try { write(key, value); savedAt = t; savedValue = serialized; }
      catch { /* 브라우저 저장 제한으로 화면 재생이 중단되지 않도록 한다. */ }
    },
  };
  return state;
}
