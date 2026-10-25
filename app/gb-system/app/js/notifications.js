// [NOTIFICATIONS] Shared server events; device-specific install help and send status.
export async function mountNotifications(host,{auth,esc,getPlaybackStatus=()=>''}) {
  host.innerHTML='<div class="page">알림 설정을 불러오는 중입니다.</div>';
  let data;
  try{data=await auth.request('/api/notifications');}catch(error){host.textContent=error.message;return;}
  if(!host.isConnected)return;
  const supported=window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const iphone=/iPhone|iPad/.test(navigator.userAgent);
  const android=/Android/i.test(navigator.userAgent);
  const canPush=supported && (!iphone || standalone);
  // Installation guidance changes with the device; the Web Push connection is shared.
  const installSteps=iphone
    ? '<li>iOS 16.4 이상에서 Safari로 HTTPS 주소 접속</li><li>공유 → 홈 화면에 추가</li><li>설치한 앱 열기 → 담당자 선택 → 푸시 연결</li>'
    : android
      ? '<li>Android Chrome에서 HTTPS 주소 접속</li><li>메뉴(⋮) → 홈 화면에 추가 → 설치</li><li>앱 열기 → 담당자 선택 → 푸시 연결 → 알림 허용</li>'
      : '<li>휴대폰에서 HTTPS 주소로 접속</li><li>아이폰: Safari 공유 → 홈 화면에 추가<br>안드로이드: Chrome 메뉴(⋮) → 홈 화면에 추가 → 설치</li><li>앱 열기 → 담당자 선택 → 푸시 연결 → 알림 허용</li>';
  const supportMessage=!window.isSecureContext?'푸시 연결은 HTTPS 주소에서 이용해 주세요.'
    : iphone && !standalone?'아이폰에서는 홈 화면에 추가한 앱으로 열어 주세요.'
    : !supported?'이 브라우저에서는 푸시 연결을 지원하지 않습니다.'
    : '이 브라우저는 푸시 연결을 지원합니다.';
  host.innerHTML=`<div class="page notice-page"><div class="notice-intro"><h2>현장을 벗어나도, 경보와 승인 요청을 확인하세요.</h2><p>${esc(auth.user.name)} · ${esc(auth.user.scope)}<br>서버가 최초 경보와 일정 승인 요청·결과를 앱 푸시로 전달합니다. 이메일은 발송 설정을 켠 경우에만 전송합니다.</p></div>
    <div class="notice-grid"><section class="card notice-card"><h3>휴대폰 푸시 알림</h3>
      <p>홈 화면에 설치한 웹앱에서 허용하면 앱을 닫거나 화면을 꺼도 알림을 받을 수 있습니다.</p>
      <ol>${installSteps}</ol>
      <p><b>${supportMessage}</b></p>
      <p>${data.push_live?'실제 푸시 전송 켜짐':'미리보기: 푸시 내용만 생성하며 실제 발송하지 않습니다.'}</p>
      <div class="notice-actions"><button class="btn" id="pushConnect" ${canPush?'':'disabled'}>이 기기 푸시 연결</button><button class="btn ghost" id="pushOff">내 푸시 연결 해제</button></div>
      <p id="pushStatus">연결된 기기 ${data.subscriptions}개</p></section>
    <section class="card notice-card"><h3>이메일 알림</h3><p>최초 경보, 팀장의 일정 승인 요청, 요청자의 승인·반려 결과를 전달합니다. 같은 사건은 중복 발송하지 않습니다.</p>
      <form id="emailSettings"><label for="emailRecipient">${esc(auth.user.name)}의 수신 이메일</label><input type="email" id="emailRecipient" value="${esc(data.email)}" placeholder="수신할 이메일 주소" maxlength="254">
      <label><input type="checkbox" id="emailEnabled" ${data.email_enabled?'checked':''}> 담당 업무 이메일 알림 받기</label><div class="notice-actions"><button class="btn" type="submit">이메일 설정 저장</button></div></form>
      <p>${data.email_live?'실제 이메일 전송 켜짐':'현재 실제 이메일 발송은 꺼져 있습니다. 수신 주소를 저장해도 메일을 보내지 않습니다.'}</p><p>이메일 전송을 켠 뒤 수신 주소와 알림 받기 설정을 저장하면 사용할 수 있습니다.</p></section></div>
    <section class="card notice-log"><h3>일정 승인 알림</h3><p>현장관리자가 점검·일정을 제출하면 설비 팀장에게 알립니다. 팀장이 승인하거나 반려하면 요청한 담당자에게 결과를 알립니다. 승인 대기 내역은 <a href="#/approvals">승인 화면</a>에서도 확인할 수 있습니다.</p><h3>데이터 재생 알림</h3>
    <p id="playbackLinkStatus" role="status">${esc(getPlaybackStatus())}</p>
    <p>PC나 휴대폰에서 데이터를 재생하다가 최초 경보에 도달하면, 재생을 시작한 현재 계정의 이메일과 연결된 기기로만 알림을 보냅니다. 다른 담당자나 설비 팀장에게 함께 보내지 않습니다. PC의 브라우저 알림 허용 여부와는 관계없습니다.</p>
    <p>현재 데이터는 CSV 재생입니다. 같은 재생 회차에서는 설비별 최초 경보를 한 번만 전송합니다. 일시정지·새로고침은 같은 회차를 유지하며, 데이터 재생 메뉴의 ‘처음부터’를 누르면 새 회차에서 경보를 다시 받을 수 있습니다. 이미 경보인 위치에서 화면을 열면 과거 경보를 다시 보내지 않습니다.</p>
    <h3>서버 알림 시연</h3><p>아래 버튼은 별도의 테스트입니다. 버튼을 누른 뒤 화면을 닫아도 서버가 계속 처리하며 현재 계정에만 보냅니다.</p>
    <div class="notice-actions"><button class="btn" id="noticeTest">10초 후 내 알림 테스트</button>${auth.user.role==='supervisor'?'<button class="btn ghost" id="noticeCsv">CSV 경보 2분 요약 재생</button>':''}<button class="btn ghost" id="noticeRefresh">결과 새로고침</button></div>
    <p class="notice-result" id="noticeResult" role="status"></p><div class="scroll"><table><thead><tr><th>생성 시각</th><th>알림</th><th>방식</th><th>처리 결과</th></tr></thead><tbody>${data.deliveries.length?data.deliveries.map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(r.title)}</td><td>${r.channel==='push'?'앱 푸시':'이메일'}</td><td>${esc(({dry_run:'미리보기 생성',sent:'제공자 수락',pending:'대기',sending:'전송 중',failed:'설정 확인 필요'})[r.status] || r.status)}</td></tr>`).join(''):'<tr><td colspan="4">아직 생성한 알림이 없습니다.</td></tr>'}</tbody></table></div>
    <p class="notice-foot">실제 푸시는 HTTPS·지원 브라우저·알림 허용·서버 전송 설정이 필요합니다. 아이폰은 홈 화면 설치도 필요합니다. 현재 역할 선택은 발표용이며 본인 인증 기능은 아닙니다.</p></section></div>`;
  const result=host.querySelector('#noticeResult');
  async function act(button,fn){button.disabled=true;try{const response=await fn();result.textContent=response?.message || '설정을 저장했습니다.';}catch(error){result.textContent=error.message;}finally{button.disabled=false;}}
  host.querySelector('#emailSettings').onsubmit=event=>{event.preventDefault();act(event.submitter,()=>auth.request('/api/notifications/settings',{email:host.querySelector('#emailRecipient').value,enabled:host.querySelector('#emailEnabled').checked}));};
  host.querySelector('#noticeTest').onclick=event=>act(event.currentTarget,()=>auth.request('/api/notifications/start',{kind:'test'}));
  host.querySelector('#noticeCsv')?.addEventListener('click',event=>act(event.currentTarget,()=>auth.request('/api/notifications/start',{kind:'csv'})));
  host.querySelector('#noticeRefresh').onclick=()=>mountNotifications(host,{auth,esc,getPlaybackStatus});
  host.querySelector('#pushOff').onclick=event=>act(event.currentTarget,async()=>{await auth.request('/api/notifications/unsubscribe',{});const reg=await navigator.serviceWorker?.getRegistration();await (await reg?.pushManager.getSubscription())?.unsubscribe();host.querySelector('#pushStatus').textContent='푸시 연결을 해제했습니다.';});
  host.querySelector('#pushConnect').onclick=event=>act(event.currentTarget,async()=>{
    // Permission request is directly triggered by the user's tap (required on iOS).
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('기기 설정에서 알림을 허용해 주세요.');
    await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
    const key=Uint8Array.from(atob(data.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const sub=await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await auth.request('/api/notifications/subscribe',{subscription:sub.toJSON()});host.querySelector('#pushStatus').textContent='이 기기를 현재 담당자에게 연결했습니다.';
  });
}
