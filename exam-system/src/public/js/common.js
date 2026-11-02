'use strict';
// 全局工具：toast、提示音、倒计时格式化、fetch JSON
window.App = (function () {
  function toast(msg, warn) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function beep(freq, ms) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq || 880; g.gain.value = 0.12;
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, ms || 250);
    } catch (e) { /* 忽略音频失败 */ }
  }
  function fmtCountdown(ms) {
    ms = Math.max(0, ms);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = n => String(n).padStart(2, '0');
    return p(h) + ':' + p(m) + ':' + p(ss);
  }
  async function postJSON(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  async function getJSON(url) {
    const r = await fetch(url); const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  async function patchJSON(url, body) {
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  return { toast, beep, fmtCountdown, postJSON, getJSON, patchJSON };
})();

// ===== 顶部用户菜单：下拉、修改密码、退出登录 =====
(function () {
  const btn = document.getElementById('userMenuBtn');
  if (!btn) return; // 登录页等无用户菜单的页面
  const dd = document.getElementById('userDropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dd.classList.toggle('open');
  });
  document.addEventListener('click', () => dd.classList.remove('open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.classList.remove('open'); });

  document.getElementById('udLogout').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* 忽略 */ }
    location.href = '/login';
  });

  document.getElementById('udChangePw').addEventListener('click', () => {
    dd.classList.remove('open');
    openPwModal();
  });

  function openPwModal() {
    if (document.getElementById('pwModalMask')) return;
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.id = 'pwModalMask';
    mask.innerHTML =
      '<div class="modal-card">' +
      '  <h3>🔑 修改密码</h3>' +
      '  <div class="login-field"><label>旧密码</label><input type="password" id="pwOld" autocomplete="current-password"></div>' +
      '  <div class="login-field"><label>新密码（至少 6 位）</label><input type="password" id="pwNew" autocomplete="new-password"></div>' +
      '  <div class="login-field"><label>确认新密码</label><input type="password" id="pwNew2" autocomplete="new-password"></div>' +
      '  <div class="login-err" id="pwErr"></div>' +
      '  <div class="modal-actions">' +
      '    <button class="btn btn-ghost" id="pwCancel" type="button">取消</button>' +
      '    <button class="btn btn-primary" id="pwOk" type="button">确认修改</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    document.getElementById('pwCancel').addEventListener('click', close);
    document.getElementById('pwErr').textContent = '';
    setTimeout(() => document.getElementById('pwOld').focus(), 50);

    const submit = async () => {
      const errEl = document.getElementById('pwErr');
      const oldPassword = document.getElementById('pwOld').value;
      const newPassword = document.getElementById('pwNew').value;
      const newPassword2 = document.getElementById('pwNew2').value;
      errEl.textContent = '';
      if (!oldPassword || !newPassword) { errEl.textContent = '请填写完整'; return; }
      if (newPassword.length < 6) { errEl.textContent = '新密码至少 6 位'; return; }
      if (newPassword !== newPassword2) { errEl.textContent = '两次输入的新密码不一致'; return; }
      try {
        await App.postJSON('/api/auth/password', { oldPassword, newPassword });
        close();
        App.toast('密码已修改，其他设备的登录已失效');
      } catch (e) {
        errEl.textContent = e.message || '修改失败';
      }
    };
    document.getElementById('pwOk').addEventListener('click', submit);
    mask.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }
})();
