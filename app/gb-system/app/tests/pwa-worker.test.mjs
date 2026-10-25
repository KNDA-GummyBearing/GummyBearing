// Browser API contract verification in a sandbox; no actual push subscription/send.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(windows=[]){
  const events={},shown=[],opened=[];
  const self={location:{origin:'https://example.invalid'},addEventListener:(k,f)=>events[k]=f,
    skipWaiting:()=>Promise.resolve(),registration:{showNotification:async(title,options)=>shown.push({title,options})},
    clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
  vm.runInNewContext(source,{self,URL});
  return {events,shown,opened};
}
test('push displays a persistent notification without any page client',async()=>{
  const w=worker();let pending;
  w.events.push({data:{json:()=>({title:'팬 01 최초 경보',body:'소결공정',tag:'event-1',url:'/#/equipment/EGF-01'})},waitUntil:p=>pending=p});
  await pending;
  assert.equal(w.shown.length,1);assert.equal(w.shown[0].options.tag,'event-1');
  assert.equal(w.shown[0].options.data.url,'/#/equipment/EGF-01');
});
test('malformed push still displays a fallback notification',async()=>{
  const w=worker();let pending;
  w.events.push({data:{json:()=>{throw Error('bad JSON')}},waitUntil:p=>pending=p});await pending;
  assert.equal(w.shown[0].title,'GummyBearing 알림');
});
test('notification tap opens the equipment when all app windows are closed',async()=>{
  const w=worker();let pending,closed=false;
  w.events.notificationclick({notification:{data:{url:'/#/equipment/EGF-04'},close:()=>closed=true},waitUntil:p=>pending=p});
  await pending;assert.equal(closed,true);assert.deepEqual(w.opened,['https://example.invalid/#/equipment/EGF-04']);
});
test('notification tap reuses an existing app window',async()=>{
  let navigated,focused=false,pending;
  const w=worker([{url:'https://example.invalid/',navigate:async url=>navigated=url,focus:async()=>focused=true}]);
  w.events.notificationclick({notification:{data:{url:'/#/equipment/EGF-02'},close:()=>{}},waitUntil:p=>pending=p});
  await pending;assert.equal(navigated,'https://example.invalid/#/equipment/EGF-02');assert.equal(focused,true);assert.equal(w.opened.length,0);
});

test('team notification does not reuse a personal-experience window',async()=>{
  let pending,navigated=false;
  const w=worker([{url:'https://example.invalid/experience/',navigate:async()=>{navigated=true;},focus:async()=>{}}]);
  w.events.notificationclick({notification:{data:{url:'/#/equipment/EGF-02'},close:()=>{}},waitUntil:p=>pending=p});
  await pending;assert.equal(navigated,false);assert.deepEqual(w.opened,['https://example.invalid/#/equipment/EGF-02']);
});
test('notification cannot navigate outside the application',()=>{
  const w=worker();let scheduled=false;
  w.events.notificationclick({notification:{data:{url:'https://untrusted.invalid/'},close:()=>{}},waitUntil:()=>scheduled=true});
  assert.equal(scheduled,false);assert.equal(w.opened.length,0);
});
