// [LOGIN ADD] 신규 파일: 인증 API 요청과 메모리 안의 계정/CSRF 상태 관리.
// Session token lives only in the HttpOnly cookie, never browser storage.
export const auth = {
  experience: location.pathname.startsWith('/experience/'),
  user: null, csrf: '',
  async request(url, payload, { signal } = {}) {
    const headers = {};
    if (payload !== undefined) Object.assign(headers, {
      'Content-Type': 'application/json', 'X-GB-Request': '1', 'X-CSRF-Token': this.csrf,
    });
    const endpoint = this.experience && url.startsWith('/api/') ? '/experience' + url : url;
    const response = await fetch(endpoint, { method: payload === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', headers, signal,
      body: payload === undefined ? undefined : JSON.stringify(payload) });
    let result;
    try { result = await response.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다.'); }
    if (!response.ok) {
      if (response.status === 401 && this.user && url !== '/api/auth/login') {
        this.user = null; this.csrf = '';
        window.dispatchEvent(new Event('gb-session-expired'));
      }
      const error = new Error(result.error || '요청을 처리하지 못했습니다.');
      error.status = response.status; throw error;
    }
    return result;
  },
  async session() {
    try {
      const result = await this.request('/api/auth/session');
      this.user = result.user; this.csrf = result.csrf;
      this.round = result.round;
      return this.user;
    } catch (error) {
      if (error.status === 401) { this.user = null; this.csrf = ''; return null; }
      throw error;
    }
  },
  async selectProfile(username) {
    const result = await this.request('/api/demo/select', {username});
    this.user=result.user; this.csrf=result.csrf;
    this.round = result.round;
  },
  async login(username, password) {
    const result = await this.request('/api/auth/login', { username, password });
    this.user = result.user; this.csrf = result.csrf;
  },
  async logout() {
    await this.request('/api/auth/logout', {});
    this.user = null; this.csrf = '';
  },

};
