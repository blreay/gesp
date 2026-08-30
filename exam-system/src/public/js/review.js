'use strict';
/* global App */
(function () {
  const listEl = document.getElementById('wrongList');
  const filter = JSON.parse(listEl.dataset.filter || '{}');
  let noteTarget = null;

  // 按钮事件委托
  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.wrong-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.classList.contains('btn-note')) {
      noteTarget = id;
      document.getElementById('noteKnowledge').value = card.dataset.knowledge || '';
      document.getElementById('noteText').value = card.dataset.note || '';
      document.getElementById('noteModal').classList.add('show');
    } else if (e.target.classList.contains('btn-ai')) {
      openAi(id);
    } else if (e.target.classList.contains('btn-master')) {
      try {
        await App.patchJSON('/api/wrong/' + id, { status: 'mastered' });
        App.toast('已标记掌握');
        setTimeout(() => location.reload(), 400);
      } catch (err) { App.toast('操作失败：' + err.message, true); }
    } else if (e.target.classList.contains('btn-del')) {
      if (!confirm('确定删除这道错题记录？')) return;
      try {
        const r = await fetch('/api/wrong/' + id, { method: 'DELETE' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        App.toast('已删除');
        setTimeout(() => location.reload(), 400);
      } catch (err) { App.toast('删除失败：' + err.message, true); }
    }
  });

  document.getElementById('btnSaveNote').addEventListener('click', async () => {
    if (!noteTarget) return;
    await App.patchJSON('/api/wrong/' + noteTarget, {
      note: document.getElementById('noteText').value,
      note_knowledge: document.getElementById('noteKnowledge').value
    });
    App.toast('备注已保存');
    document.getElementById('noteModal').classList.remove('show');
    setTimeout(() => location.reload(), 400);
  });
  document.getElementById('btnCancelNote').addEventListener('click', () => {
    document.getElementById('noteModal').classList.remove('show');
  });

  document.getElementById('btnPractice').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/review/sessions', { filter });
      location.href = '/review/session/' + r.sessionId;
    } catch (e) { App.toast(e.message, true); }
  });

  // ===== AI解析 对话窗 =====
  const aiModal = document.getElementById('aiModal');
  const aiHistory = document.getElementById('aiHistory');
  const aiInput = document.getElementById('aiInput');
  const btnAiSend = document.getElementById('btnAiSend');
  const btnAiCopy = document.getElementById('btnAiCopy');
  let aiMessages = [];          // [{role, content}]
  let aiBusy = false;
  let aiTarget = null;          // 当前错题 id
  let aiConfig = null;          // 首次 openAi 拿到的 config，供追问复用

  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 把 ``` 围栏转成 <pre>，其余转义
  function renderAiText(s) {
    return String(s).split('```').map((part, i) =>
      i % 2 === 1 ? '<pre>' + escHtml(part.replace(/^\n/, '')) + '</pre>' : escHtml(part)
    ).join('');
  }
  function addBubble(role, html, isHtml) {
    const b = document.createElement('div');
    b.className = 'ai-bubble ' + role;
    if (isHtml) b.innerHTML = html; else b.textContent = html;
    aiHistory.appendChild(b);
    aiHistory.scrollTop = aiHistory.scrollHeight;
    return b;
  }

  async function openAi(wrongId) {
    aiTarget = wrongId;
    document.getElementById('aiWrongId').textContent = '#' + wrongId;
    aiHistory.innerHTML = '';
    aiMessages = [];
    aiConfig = null;
    btnAiCopy.disabled = true;
    aiInput.value = '';
    aiModal.classList.add('show');
    try {
      const ctx = await App.getJSON('/api/wrong/' + wrongId + '/ai-context');
      aiConfig = ctx.config;
      aiMessages.push({ role: 'user', content: ctx.message });
      addBubble('user', ctx.message, false);
      await streamAi(aiConfig);
    } catch (e) {
      addBubble('err', '无法获取题目上下文：' + e.message, false);
    }
  }

  async function streamAi(config) {
    aiBusy = true; btnAiSend.disabled = true; btnAiSend.textContent = 'AI 正在回答…';
    const bubble = addBubble('ai', '', true);
    let acc = '';
    try {
      const resp = await fetch(config.baseUrl.replace(/\/$/, '') + '/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: config.model, max_tokens: 2048, messages: aiMessages, stream: true })
      });
      if (!resp.ok) throw new Error('AI 服务返回 HTTP ' + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) {
            acc += ev.delta.text;
            bubble.innerHTML = renderAiText(acc);
            aiHistory.scrollTop = aiHistory.scrollHeight;
          }
        }
      }
      if (!acc) throw new Error('AI 未返回内容');
      aiMessages.push({ role: 'assistant', content: acc });
      btnAiCopy.disabled = false;
    } catch (e) {
      bubble.remove();
      addBubble('err', '无法连接 AI 服务：' + e.message + '。请检查系统配置里的 AI 设置或稍后再试。', false);
    } finally {
      aiBusy = false; btnAiSend.disabled = false; btnAiSend.textContent = '发送';
    }
  }

  btnAiSend.addEventListener('click', async () => {
    if (aiBusy) return;
    const text = aiInput.value.trim();
    if (!text) return;
    aiInput.value = '';
    aiMessages.push({ role: 'user', content: text });
    addBubble('user', text, false);
    try {
      if (!aiConfig) {
        const ctx = await App.getJSON('/api/wrong/' + aiTarget + '/ai-context');
        aiConfig = ctx.config;
      }
      await streamAi(aiConfig);
    } catch (e) {
      addBubble('err', '无法连接 AI 服务：' + e.message, false);
    }
  });
  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnAiSend.click(); }
  });

  btnAiCopy.addEventListener('click', async () => {
    const last = [...aiMessages].reverse().find(m => m.role === 'assistant');
    if (!last) return;
    const content = last.content.replace(/\n{3,}/g, '\n\n').trim();
    const card = document.querySelector('.wrong-card[data-id="' + aiTarget + '"]');
    const existing = card ? (card.dataset.note || '') : '';
    const merged = (existing ? existing + '\n' : '') + '---\n【AI解析】\n' + content;
    try {
      await App.patchJSON('/api/wrong/' + aiTarget, { note: merged });
      App.toast('AI 解析已追加到备注');
      setTimeout(() => location.reload(), 400);
    } catch (e) { App.toast('保存失败：' + e.message, true); }
  });

  function closeAi() { aiModal.classList.remove('show'); aiMessages = []; aiTarget = null; aiConfig = null; }
  document.getElementById('btnAiClose').addEventListener('click', closeAi);
  document.getElementById('btnAiCloseX').addEventListener('click', closeAi);
  aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAi(); });

  // --- Issue 3: floating note popover ---
  const notePreview = document.createElement('div');
  notePreview.className = 'note-preview';
  notePreview.style.display = 'none';
  document.body.appendChild(notePreview);

  listEl.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.wrong-card');
    if (!card) return;
    const note = card.dataset.note || '';
    if (!note.trim()) { notePreview.style.display = 'none'; return; }
    notePreview.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'note-preview-title';
    t.textContent = '\u{1F4DD} 备注' + (card.dataset.knowledge ? ' · ' + card.dataset.knowledge : '');
    const body = document.createElement('div');
    body.textContent = note;
    notePreview.appendChild(t);
    notePreview.appendChild(body);
    const rect = card.getBoundingClientRect();
    notePreview.style.display = 'block';
    const pw = notePreview.offsetWidth, ph = notePreview.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - pw - 12);
    let top = rect.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 8);
    notePreview.style.left = Math.max(8, left) + 'px';
    notePreview.style.top = top + 'px';
  });
  listEl.addEventListener('mouseleave', () => { notePreview.style.display = 'none'; });

  // --- Issue 4: auto-apply filters on change ---
  const filterForm = document.querySelector('.filter-bar');
  document.querySelectorAll('.filter-bar select').forEach(s => {
    s.addEventListener('change', () => filterForm.requestSubmit());
  });
  const kwInput = document.querySelector('.filter-bar input[name="keyword"]');
  let kwTimer = null;
  kwInput.addEventListener('input', () => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => filterForm.requestSubmit(), 400);
  });
})();
