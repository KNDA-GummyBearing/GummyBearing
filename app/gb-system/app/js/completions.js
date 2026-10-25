// Completion requests keep schedules pending until the supervisor approves.
// Keep one key per attempted request so a lost response can be retried safely.
export const completionStatus = record => record?.status === '완료' ? 'completed'
  : ['pending', 'rejected'].includes(record?.completion_approval_status) ? record.completion_approval_status : 'ready';
export const completionLabel = record => ({ pending: '완료 승인 대기', rejected: '완료 요청 반려', completed: '완료', ready: '' })[completionStatus(record)];
export const completionResultMessage = request => request?.status === 'approved'
  ? '이미 완료 승인된 요청입니다. 캘린더에 완료로 표시됩니다.'
  : request?.status === 'rejected'
    ? '완료 요청이 반려되었습니다. 요청 결과를 확인한 뒤 다시 요청해 주세요.'
    : '설비 팀장에게 완료 승인을 요청했습니다.';

export function createCompletionActions({ store, getUser, requestKey }) {
  const attempts = new Map(), busy = new Set();
  const identity = () => JSON.stringify([getUser()?.id, getUser()?.role, getUser()?.process]);
  const token = id => `${identity()}:${id}`;
  return {
    isBusy: id => busy.has(token(id)),
    async complete(id) {
      const user = getUser(), owner = identity(), key = token(id);
      const record = store.db.follow_ups.find(row => row.follow_up_id === id);
      if (!user || !record) throw Error('일정을 찾지 못했습니다. 캘린더를 다시 열어 주세요.');
      if (busy.has(key)) return { ignored: true };
      if (completionStatus(record) === 'completed') return { ignored: true };
      if (completionStatus(record) === 'pending') throw Error('완료 승인을 기다리고 있습니다. 승인 요청에서 확인해 주세요.');
      busy.add(key);
      try {
        const requested = user.role !== 'supervisor';
        let result;
        if (requested) {
          // A refreshed rejection belongs to a finished request. Start a new key,
          // while retaining the key when the same new attempt merely lost its response.
          const basis = JSON.stringify([record.completion_approval_request_id || '', record.completion_approval_status || '']);
          if (attempts.get(key)?.basis !== basis) attempts.set(key, { basis, payload: { follow_up_id: id, request_key: requestKey() } });
          result = await store.submitCompletion(attempts.get(key).payload);
        } else {
          result = await store.save({ follow_ups: [{ follow_up_id: id, status: '완료' }] }, { operation: 'update' });
        }
        attempts.delete(key);
        return { requested, result, stale: identity() !== owner };
      } finally { busy.delete(key); }
    },
  };
}
