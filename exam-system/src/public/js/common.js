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
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // 简单的 markdown 渲染器（先整体转义再注入受控标签，避免 XSS）。复习页与考试讲评页共用。
  // 支持：#~###### 标题、**加粗**、*斜体*、`行内码`、``` 代码块、- / 1. 列表、> 引用、--- 分隔线、[文字](http链接)。
  function renderMarkdown(src) {
    const blocks = [];
    // 先把围栏代码块抽出来用占位符替代，避免被后续行级规则拆散
    let text = String(src).replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, code) => {
      blocks.push(code.replace(/\n$/, ''));
      return '\u0000CB' + (blocks.length - 1) + '\u0000';
    });
    text = escHtml(text);
    const inline = (s) => s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, url) =>
        /^https?:\/\//i.test(url) ? '<a href="' + url + '" target="_blank" rel="noopener">' + t + '</a>' : m);
    const out = [];
    let list = null; // 'ul' | 'ol'
    const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    for (const raw of text.split('\n')) {
      const cb = raw.match(/^\u0000CB(\d+)\u0000\s*$/);
      if (cb) { closeList(); out.push('<pre><code>' + escHtml(blocks[+cb[1]]) + '</code></pre>'); continue; }
      let m;
      if ((m = raw.match(/^(#{1,6})\s+(.+)$/))) { closeList(); out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); continue; }
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) { closeList(); out.push('<hr>'); continue; }
      if ((m = raw.match(/^&gt;\s?(.*)$/))) { closeList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      if ((m = raw.match(/^\s*[-*+]\s+(.+)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = raw.match(/^\s*\d+[.)]\s+(.+)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if (raw.trim() === '') { closeList(); continue; }
      closeList(); out.push('<p>' + inline(raw) + '</p>');
    }
    closeList();
    return out.join('\n');
  }
  // 把固定定位的悬浮面板停靠到页面左侧空白区：正好覆盖容器（.exam-main / .page-main）左边的全部空白，
  // 顶部贴住 sticky 导航栏下缘（可选 topAnchor：考试页的 sticky 顶栏，从其下缘开始）、底部贴住视口底。
  // 左侧空白不足（窄屏/分屏）时返回 false 并还原内联样式，由调用方回退到原来的"元素附近"定位。
  function dockLeft(panel, container, topAnchor) {
    panel.classList.remove('dock-left');
    panel.style.left = ''; panel.style.top = ''; panel.style.width = ''; panel.style.height = '';
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    const MIN_DOCK_WIDTH = 240; // 低于此宽度（窄屏/分屏）回退到"元素附近"的小窗定位
    if (rect.left < MIN_DOCK_WIDTH) return false;
    const nav = document.querySelector('.topnav');
    let top = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
    if (topAnchor) {
      const r2 = topAnchor.getBoundingClientRect();
      if (r2.bottom > top && r2.bottom < window.innerHeight) top = r2.bottom;
    }
    panel.classList.add('dock-left');
    panel.style.left = '0px';
    panel.style.top = top + 'px';
    panel.style.width = Math.floor(rect.left) + 'px';
    panel.style.height = Math.max(120, window.innerHeight - top) + 'px';
    return true;
  }
  return { toast, beep, fmtCountdown, postJSON, getJSON, patchJSON, escHtml, renderMarkdown, dockLeft };
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
