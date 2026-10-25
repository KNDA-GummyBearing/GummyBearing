// Simulated Android browser API contract. This is NOT a physical Android test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/notifications.js',import.meta.url),'utf8');
const {mountNotifications}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

async function setup({permission='granted',existing=false,secure=true}={}){
  const calls=[],fields=new Map(),button={disabled:false};let html='';
  const element=id=>{
    if(!fields.has(id))fields.set(id,{disabled:false,textContent:'',addEventListener:()=>{}});
    return fields.get(id);
  };
  const host={isConnected:true,set innerHTML(v){html=v},get innerHTML(){return html},querySelector:element};
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/mock',keys:{auth:'mock',p256dh:'mock'}};
  const sub={toJSON:()=>subscription};
  const reg={pushManager:{getSubscription:async()=>existing?sub:null,subscribe:async options=>{calls.push(['subscribe',options]);return sub}}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile',
    serviceWorker:{register:async path=>calls.push(['register',path]),ready:Promise.resolve(reg)}}});
  globalThis.Notification={requestPermission:async()=>{calls.push(['permission']);return permission}};
  globalThis.window={isSecureContext:secure,PushManager:function(){},Notification,matchMedia:()=>({matches:false})};
  const data={public_key:Buffer.alloc(65,4).toString('base64url'),email:'',email_enabled:false,push_live:true,email_live:false,subscriptions:0,deliveries:[]};
  const auth={user:{id:'joy123',name:'정온유',scope:'소결공정',role:'field'},request:async(path,payload)=>{
    calls.push(['api',path,payload]);return payload?{ok:true}:data;
  }};
  await mountNotifications(host,{auth,esc:s=>String(s)});
  return {host,calls,fields,button,subscription};
}
test('Android tap requests permission and sends a Chrome subscription to the selected-role API',async()=>{
  const s=await setup();assert.match(s.host.innerHTML,/Android Chrome/);
  assert.doesNotMatch(s.host.innerHTML,/id="pushConnect" disabled/);
  await s.fields.get('#pushConnect').onclick({currentTarget:s.button});
  assert.equal(s.calls.filter(c=>c[0]==='permission').length,1);
  assert.deepEqual(s.calls.find(c=>c[0]==='register'),['register','/sw.js']);
  assert.equal(s.calls.find(c=>c[0]==='subscribe')[1].userVisibleOnly,true);
  assert.equal(s.calls.find(c=>c[0]==='subscribe')[1].applicationServerKey.length,65);
  assert.deepEqual(s.calls.find(c=>c[1]==='/api/notifications/subscribe')[2],{subscription:s.subscription});
  assert.match(s.fields.get('#pushStatus').textContent,/현재 담당자/);
});
test('Android permission denial never registers a subscription',async()=>{
  const s=await setup({permission:'denied'});await s.fields.get('#pushConnect').onclick({currentTarget:s.button});
  assert.equal(s.calls.filter(c=>c[0]==='subscribe'||c[1]==='/api/notifications/subscribe').length,0);
  assert.match(s.fields.get('#noticeResult').textContent,/알림을 허용/);
});
test('existing Android subscription is reused across deployment',async()=>{
  const s=await setup({existing:true});await s.fields.get('#pushConnect').onclick({currentTarget:s.button});
  assert.equal(s.calls.filter(c=>c[0]==='subscribe').length,0);
  assert.equal(s.calls.filter(c=>c[1]==='/api/notifications/subscribe').length,1);
});
test('plain HTTP Android page explains HTTPS requirement and disables connect',async()=>{
  const s=await setup({secure:false});assert.match(s.host.innerHTML,/id="pushConnect" disabled/);
  assert.match(s.host.innerHTML,/HTTPS 주소에서 이용/);
});
