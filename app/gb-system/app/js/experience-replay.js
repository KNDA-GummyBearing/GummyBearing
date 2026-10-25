// Server-owned personal round; refreshing never creates an alarm round.
export function createExperienceReplay({userId, revision, request, read, write, onRound,
  onError = () => {}, storageNamespace = 'experience', randomId = () => crypto.randomUUID()}) {
  const resetKey = `${storageNamespace}.reset.${userId}.${revision}`;
  let current = null, refreshing = null, resetting = false, stopped = false, timer = null;
  function apply(round) {
    if (!round || typeof round.id !== 'string' || round.revision !== revision)
      throw Error('체험 데이터가 변경되었습니다. 새로고침해 주세요.');
    if (stopped || current?.id === round.id) return;
    current = round;
    onRound({...round});
  }
  async function refresh() {
    if (stopped || resetting) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try { apply(await request('/api/notifications/round')); }
      finally { refreshing = null; }
    })();
    return refreshing;
  }
  return {
    get round() { return current; },
    get busy() { return resetting; },
    async start() {
      await refresh();
      timer = setInterval(() => { void refresh().catch(onError); }, 5000);
    },
    refresh,
    async reset() {
      if (resetting || stopped) return;
      resetting = true;
      try {
        // Finish an older poll before reset so its result cannot roll the UI back.
        if (refreshing) await refreshing;
        if (!current) throw Error('체험 연결을 확인한 후 다시 시도해 주세요.');
        let attempt;
        try { attempt = read(resetKey); } catch {}
        if (!attempt || attempt.expected_round_id !== current.id)
          attempt = {expected_round_id: current.id, request_id: randomId()};
        try { write(resetKey, attempt); } catch {}
        const round = await request('/api/notifications/round/reset', attempt);
        apply(round);
        try { write(resetKey, null); } catch {}
        return round;
      } finally { resetting = false; }
    },
    stop() { stopped = true; if (timer !== null) clearInterval(timer); },
  };
}
