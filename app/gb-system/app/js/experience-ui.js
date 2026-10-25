// Public experience: one entry point, in-page warnings only.
export const isExperience = location.pathname.startsWith('/experience/');
if (isExperience) {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = '/experience/manifest.webmanifest';
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/css/experience.css'; link.dataset.experienceStyle = '1';
  document.head.append(link);
}

export async function mountExperienceStart(host, {auth, esc, message = ''}) {
  if (!isExperience) return;
  if (!document.querySelector('link[data-experience-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/experience.css'; link.dataset.experienceStyle = '1';
    document.head.append(link);
  }
  host.setAttribute('aria-label', '설비 상태 체험 시작');
  host.innerHTML = `<main class="experience-start"><div class="experience-start-wrap">
    <a class="experience-brand" href="/experience/" aria-label="GB system 체험 시작"><img src="/assets/brand/pwa-user-v3-192.png" width="48" height="48" alt=""><span>GB system<small>설비 상태 체험</small></span></a>
    <button class="experience-scope-card" id="experienceBegin" type="button">
      <span class="experience-card-badge">전체 공정</span><strong>POSCO 포항 제철소</strong>
      <span>설비 상태를 살펴보고, 새롭게 발생한 경보를 확인해 보세요.</span>
      <b>체험 시작하기 <span aria-hidden="true">→</span></b>
    </button>
    <p class="experience-feedback" id="experienceStartMessage" role="status" aria-live="polite">${esc(message)}</p>
  </div></main>`;
  const button = host.querySelector('#experienceBegin');
  button.onclick = async () => {
    button.disabled = true;
    try {
      // Returning to the welcome card keeps the existing visitor session.
      if (!auth.user) {
        const result = await auth.request('/api/demo/select', {username:'all'});
        auth.user = result.user; auth.csrf = result.csrf;
      }
      history.replaceState(null, '', '/experience/#/');
      location.reload();
    } catch (error) {
      host.querySelector('#experienceStartMessage').textContent = error.message || '체험을 시작하지 못했습니다. 다시 시도해 주세요.';
      button.disabled = false;
    }
  };
}
