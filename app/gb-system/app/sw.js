// [PWA] No API/data caching: role changes must never reveal another scope's records.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data;
  try { data=event.data.json(); } catch { data={title:'GummyBearing 알림',body:'설비 상태를 확인하세요.'}; }
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,tag:data.tag,
    icon:'/assets/brand/symbol-navy.png',data:{url:data.url || '/#/notifications'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url || '/#/notifications',self.location.origin);
  // Only navigate within this application, never trust arbitrary push links.
  if(target.origin!==self.location.origin)return;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    for(const client of windows){ if(!new URL(client.url).pathname.startsWith('/experience/') && 'navigate' in client){ await client.navigate(target.href); return client.focus(); } }
    return self.clients.openWindow(target.href);
  }));
});
