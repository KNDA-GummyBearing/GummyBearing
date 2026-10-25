// Approval inbox state is independent of CSV playback and push/email subscriptions.
export function createApprovalInbox({ auth, onChange = () => {}, onError = () => {} }) {
  let items = [], unreadCount = 0, owner = null, generation = 0;
  let tail = Promise.resolve(), refreshJob = null, timer = null, visibilityTarget = null;
  const identity = () => auth.user?.id
    ? JSON.stringify([auth.user.id, auth.user.role || '', auth.user.process || '']) : null;
  const publish = () => onChange({ items, unreadCount });
  function invalidate(clear = false) {
    generation += 1;
    tail = Promise.resolve();
    refreshJob = null;
    if (clear) { items = []; unreadCount = 0; publish(); }
  }
  function syncOwner() {
    const next = identity();
    if (next !== owner) { owner = next; invalidate(true); }
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
    // A failed poll or read must not block the following operations.
    tail = result.catch(() => false);
    return result;
  }
  const countOf = (value, fallback) => Number.isFinite(Number(value))
    ? Math.max(0, Math.trunc(Number(value))) : fallback;
  function refresh() {
    syncOwner();
    if (refreshJob) return refreshJob;
    const result = queue('refresh', async () => {
      const response = await auth.request('/api/notifications/inbox');
      if (!Array.isArray(response.notifications)) throw Error('승인 알림을 읽지 못했습니다. 다시 시도해 주세요.');
      const nextItems = response.notifications.map(item => ({ ...item }));
      const nextCount = countOf(response.unread_count, nextItems.filter(item => !item.read).length);
      return () => { items = nextItems; unreadCount = nextCount; };
    });
    refreshJob = result;
    result.finally(() => { if (refreshJob === result) refreshJob = null; });
    return result;
  }
  function markRead(eventIds) {
    syncOwner();
    const ids = [...new Set((eventIds || []).filter(id => typeof id === 'string' && id))];
    if (!ids.length) return Promise.resolve(true);
    // A refresh requested after this write must wait for its server result.
    refreshJob = null;
    return queue('read', async () => {
      const response = await auth.request('/api/notifications/read', { event_ids: ids });
      if (response.ok !== true) throw Error('알림을 읽음으로 표시하지 못했습니다. 다시 시도해 주세요.');
      return () => {
        const selected = new Set(ids);
        items = items.map(item => selected.has(item.event_id) ? { ...item, read: true } : item);
        unreadCount = countOf(response.unread_count, items.filter(item => !item.read).length);
      };
    });
  }
  const onVisibility = () => { if (!visibilityTarget?.hidden) void refresh(); };
  function start() {
    if (timer !== null) return;
    visibilityTarget = globalThis.document || null;
    visibilityTarget?.addEventListener('visibilitychange', onVisibility);
    timer = setInterval(() => { if (!visibilityTarget?.hidden) void refresh(); }, 5000);
    void refresh();
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    visibilityTarget?.removeEventListener('visibilitychange', onVisibility);
    visibilityTarget = null;
    invalidate();
  }
  function reset() { owner = identity(); invalidate(true); }
  return { get items() { return items; }, get unreadCount() { return unreadCount; }, refresh, markRead, start, stop, reset };
}
