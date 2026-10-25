// Separate registration and client navigation for personal experience notifications.
// No fetch handler: API responses and other visitors' data are never cached here.
const EXPERIENCE_HOME = '/experience/';
const EXPERIENCE_NOTICE = '/experience/#/notifications';
function experienceTarget(value) {
  const fallback = new URL(EXPERIENCE_NOTICE, self.location.origin);
  try {
    const target = new URL(value || EXPERIENCE_NOTICE, self.location.origin);
    return target.origin === self.location.origin && target.pathname.startsWith(EXPERIENCE_HOME) ? target : fallback;
  } catch { return fallback; }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data;
  try { data = event.data.json(); } catch { data = {}; }
  if (!data || typeof data !== 'object') data = {};
  const target = experienceTarget(data.url);
  event.waitUntil(self.registration.showNotification(
    typeof data.title === 'string' ? data.title : 'GB 알림 체험',
    { body: typeof data.body === 'string' ? data.body : '내 체험의 설비 상태를 확인해 주세요.',
      tag: typeof data.tag === 'string' ? 'gb-experience:' + data.tag : undefined,
      icon: '/assets/brand/pwa-user-v3-192.png',
      data: { url: target.href } }
  ));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = experienceTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const eligible = windows.filter(client => {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin && url.pathname.startsWith(EXPERIENCE_HOME);
      } catch { return false; }
    }).sort((left, right) => Number(right.focused) - Number(left.focused));
    for (const client of eligible) {
      try {
        if (typeof client.navigate !== 'function') continue;
        const navigated = await client.navigate(target.href);
        if (navigated && typeof navigated.focus === 'function') return await navigated.focus();
        return await client.focus();
      } catch { /* The selected experience window may have closed meanwhile. */ }
    }
    return self.clients.openWindow(target.href);
  })());
});
