'use strict';
/* global App */
(function () {
  const KEYS = ['default_duration_minutes', 'remind_before_minutes', 'remind_interval_minutes', 'judge_compile_timeout_sec', 'judge_run_timeout_sec', 'ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model', 'ai_max_tokens', 'ai_show_thinking', 'ai_system_prompt', 'ai_auto_parse', 'ai_parse_concurrency'];
  const DEFAULTS = { default_duration_minutes: 120, remind_before_minutes: 30, remind_interval_minutes: 10, judge_compile_timeout_sec: 30, judge_run_timeout_sec: 60, ai_webui_url: 'http://121.40.190.90:3000/', ai_base_url: 'http://121.40.190.90:4000', ai_api_key: 'sk-vllm-aaa-bbb', ai_model: 'qwen-local', ai_max_tokens: 8192, ai_show_thinking: '0', ai_system_prompt: '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）', ai_auto_parse: '0', ai_parse_concurrency: '4' };

  document.getElementById('btnSave').addEventListener('click', async () => {
    const body = {};
    for (const k of KEYS) body[k] = document.getElementById(k).value;
    try {
      const r = await App.postJSON('/api/settings', body);
      App.toast('已保存 ' + r.changed + ' 项配置');
    } catch (e) { App.toast('保存失败：' + e.message, true); }
  });

  document.getElementById('btnReset').addEventListener('click', async () => {
    for (const k of KEYS) document.getElementById(k).value = DEFAULTS[k];
    try {
      await App.postJSON('/api/settings', DEFAULTS);
      App.toast('已恢复默认配置');
    } catch (e) { App.toast('恢复默认失败：' + e.message, true); }
  });

  document.getElementById('btnRescan').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/questionbank/rescan', {});
      App.toast('扫描完成：加载 ' + r.loaded + ' 套，失败 ' + r.failed + ' 个');
      setTimeout(() => location.reload(), 600);
    } catch (e) { App.toast('扫描失败：' + e.message, true); }
  });

  document.getElementById('btnFullParse').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/ai-parse/full', {});
      if (r.queued > 0) {
        App.toast('已启动全量AI解析，共 ' + r.queued + ' 题');
        setTimeout(() => { location.href = '/review'; }, 400);
      } else {
        App.toast('没有需要解析的错题（仅解析备注为空的错题）');
      }
    } catch (e) { App.toast('启动失败：' + e.message, true); }
  });
})();

// ===== 用户管理（仅管理员可见本页）=====
(function () {
  const tbody = document.getElementById('userTbody');
  if (!tbody) return;
  const ME = (window.USER && window.USER.username) || '';

  function fmtTs(ms) {
    if (!ms) return '-';
    const d = new Date(ms), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  async function delJSON(url) {
    const r = await fetch(url, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  async function loadUsers() {
    try {
      const r = await App.getJSON('/api/users');
      tbody.innerHTML = '';
      for (const u of r.users) {
        const tr = document.createElement('tr');
        const isSelf = u.username === ME;
        tr.innerHTML =
          '<td>' + u.id + '</td>' +
          '<td></td>' +
          '<td><span class="role-badge role-' + u.role + '">' + (u.role === 'admin' ? '管理员' : '普通用户') + '</span></td>' +
          '<td class="user-note-cell"></td>' +
          '<td>' + fmtTs(u.created_at) + '</td>' +
          '<td class="user-ops"></td>';
        tr.children[1].textContent = u.username + (isSelf ? '（我）' : '');
        tr.querySelector('.user-note-cell').textContent = u.note || '';
        const ops = tr.querySelector('.user-ops');
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-ghost btn-xs'; btnEdit.textContent = '✏️ 编辑';
        btnEdit.addEventListener('click', () => openEditModal(u));
        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-ghost btn-xs btn-danger'; btnDel.textContent = '🗑 删除';
        btnDel.disabled = isSelf;
        if (isSelf) btnDel.title = '不能删除当前登录的自己';
        btnDel.addEventListener('click', async () => {
          if (!confirm('确定删除用户「' + u.username + '」？该用户的登录会话将立即失效。')) return;
          try { await delJSON('/api/users/' + u.id); App.toast('已删除用户 ' + u.username); loadUsers(); }
          catch (e) { App.toast('删除失败：' + e.message, true); }
        });
        ops.appendChild(btnEdit); ops.appendChild(btnDel);
        tbody.appendChild(tr);
      }
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" class="user-loading">加载失败：' + e.message + '</td></tr>';
    }
  }

  function openEditModal(u) {
    const isSelf = u.username === ME;
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal-card">' +
      '  <h3>✏️ 编辑用户</h3>' +
      '  <div class="login-field"><label>用户名</label><input type="text" id="euName" disabled></div>' +
      '  <div class="login-field"><label>角色</label><select id="euRole">' +
      '    <option value="user">普通用户</option><option value="admin">管理员</option>' +
      '  </select></div>' +
      '  <div class="login-field"><label>备注</label><input type="text" id="euNote" maxlength="100"></div>' +
      '  <div class="login-field"><label>重置密码（留空则不修改）</label><input type="password" id="euPw" autocomplete="new-password" placeholder="至少 6 位"></div>' +
      '  <div class="login-err" id="euErr"></div>' +
      '  <div class="modal-actions">' +
      '    <button class="btn btn-ghost" id="euCancel" type="button">取消</button>' +
      '    <button class="btn btn-primary" id="euOk" type="button">保存</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('#euName').value = u.username + (isSelf ? '（我）' : '');
    const roleSel = mask.querySelector('#euRole');
    roleSel.value = u.role;
    if (isSelf) { roleSel.disabled = true; roleSel.title = '不能修改自己的角色'; }
    mask.querySelector('#euNote').value = u.note || '';
    const close = () => mask.remove();
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    mask.querySelector('#euCancel').addEventListener('click', close);
    mask.querySelector('#euOk').addEventListener('click', async () => {
      const errEl = mask.querySelector('#euErr');
      errEl.textContent = '';
      const body = { note: mask.querySelector('#euNote').value };
      if (!isSelf) body.role = roleSel.value;
      const pw = mask.querySelector('#euPw').value;
      if (pw !== '') {
        if (pw.length < 6) { errEl.textContent = '新密码至少 6 位'; return; }
        body.password = pw;
      }
      try {
        await App.patchJSON('/api/users/' + u.id, body);
        close(); App.toast('已保存'); loadUsers();
      } catch (e) { errEl.textContent = e.message || '保存失败'; }
    });
  }

  document.getElementById('btnAddUser').addEventListener('click', async () => {
    const username = document.getElementById('nuUsername').value.trim();
    const password = document.getElementById('nuPassword').value;
    const role = document.getElementById('nuRole').value;
    const note = document.getElementById('nuNote').value.trim();
    if (!username || !password) { App.toast('请填写用户名和密码', true); return; }
    try {
      await App.postJSON('/api/users', { username, password, role, note });
      App.toast('已添加用户 ' + username);
      document.getElementById('nuUsername').value = '';
      document.getElementById('nuPassword').value = '';
      document.getElementById('nuNote').value = '';
      loadUsers();
    } catch (e) { App.toast('添加失败：' + e.message, true); }
  });

  loadUsers();
})();
