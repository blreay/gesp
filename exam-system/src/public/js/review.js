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
  let aiAbort = null;           // AbortController，用于取消进行中的流
  let aiRun = 0;                // 代际守卫：防止旧流的回调污染新会话
  let aiShowThinking = true;    // 是否显示思考过程（来自配置，默认显示为折叠）

  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // 把 ``` 围栏转成 <pre>，其余转义
  function renderAiText(s) {
    return String(s).split('```').map((part, i) =>
      i % 2 === 1 ? '<pre>' + escHtml(part.replace(/^\n/, '')) + '</pre>' : escHtml(part)
    ).join('');
  }
  // 简单的 markdown 渲染器（先整体转义再注入受控标签，避免 XSS）。
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
  // 拆分"思考过程"与"最终答案"：模型的推理在开头，正式解析从第一个标题/分隔线开始。
  // 返回 { thinking, answer }；找不到分界则 thinking 为空、answer=全文。
  function splitThinking(text) {
    const m = String(text).match(/\n(---+|\s*#{1,6}\s)/);
    if (m) return { thinking: text.slice(0, m.index), answer: text.slice(m.index + 1) };
    return { thinking: '', answer: text };
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
    if (aiAbort) { try { aiAbort.abort(); } catch (e) {} }
    aiRun++;
    aiBusy = false; btnAiSend.disabled = false; btnAiSend.textContent = '发送';
    aiTarget = wrongId;
    document.getElementById('aiWrongId').textContent = '#' + wrongId;
    aiHistory.innerHTML = '';
    aiMessages = [];

    btnAiCopy.disabled = true;
    aiInput.value = '';
    aiInput.placeholder = '';
    aiModal.classList.add('show');
    // 若该错题已有备注：不再自动请求 AI，只把备注展示出来，等用户输入新问题再手动发送
    const card = document.querySelector('.wrong-card[data-id="' + wrongId + '"]');
    const existingNote = card ? (card.dataset.note || '').trim() : '';
    try {
      const ctx = await App.getJSON('/api/wrong/' + wrongId + '/ai-context');
      aiShowThinking = !!(ctx.config && ctx.config.showThinking);
      if (existingNote) {
        // 把"题目上下文 + 已有备注"作为会话种子（不显示成用户气泡），让追问有上下文
        aiMessages.push({ role: 'user', content: ctx.message + '\n\n该题已有如下备注：\n' + existingNote });
        addBubble('note',
          '<div class="note-ref-title">\u{1F4DD} 该题已有备注，未自动请求 AI；可在下方输入新问题：</div>' +
          '<div class="note-ref-body">' + renderMarkdown(existingNote) + '</div>', true);
        aiInput.placeholder = '输入新问题后点"发送"';
        aiInput.focus();
      } else {
        aiMessages.push({ role: 'user', content: ctx.message });
        addBubble('user', ctx.message, false);
        await streamAi();
      }
    } catch (e) {
      addBubble('err', '无法获取题目上下文：' + e.message, false);
    }
  }

  // 在 AI 气泡里创建"思考(可折叠) + 答案"结构，返回各子节点
  function buildAiBubble(bubble) {
    bubble.innerHTML =
      '<details class="ai-thinking"><summary>💭 思考过程</summary><div class="ai-thinking-body"></div></details>' +
      '<div class="ai-answer"></div>';
    return {
      details: bubble.querySelector('.ai-thinking'),
      thinkingBody: bubble.querySelector('.ai-thinking-body'),
      answerEl: bubble.querySelector('.ai-answer')
    };
  }

  async function streamAi() {
    const myRun = aiRun;
    aiBusy = true; btnAiSend.disabled = true; btnAiSend.textContent = 'AI 正在回答…';
    const controller = new AbortController();
    aiAbort = controller;
    const bubble = addBubble('ai', '', true);
    const parts = buildAiBubble(bubble);
    parts.details.open = false;   // 思考块默认折叠（"思考折叠"），用户可手动展开
    let acc = '';
    try {
      // 走同源后端代理，由后端转发到 liteLLM，避免 HTTPS 页面直连 HTTP 的混合内容拦截
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: aiMessages }),
        signal: controller.signal
      });
      if (!resp.ok) {
        let msg = 'AI 服务返回 HTTP ' + resp.status;
        try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) {}
        throw new Error(msg);
      }
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
          // 后端把上游错误统一包成 {type:'error'}；OpenAI 正常流为 {choices:[{delta:{content}}]}
          if (ev.type === 'error') throw new Error(ev.error || 'AI 服务返回错误');
          const delta = ev.choices && ev.choices[0] && ev.choices[0].delta;
          if (delta && delta.content) {
            acc += delta.content;
            // 仅在"显示思考"模式下拆分推理链并折叠；隐藏模式下模型已关闭思考，
            // 直接把全部内容作为最终答案展示（不出现思考块）。
            const split = aiShowThinking ? splitThinking(acc) : { thinking: '', answer: acc };
            parts.thinkingBody.innerHTML = renderAiText(split.thinking);
            parts.answerEl.innerHTML = renderAiText(split.answer);
            parts.details.style.display = (aiShowThinking && split.thinking.trim()) ? '' : 'none';
            aiHistory.scrollTop = aiHistory.scrollHeight;
          }
        }
      }
      if (!acc) throw new Error('AI 未返回内容');
      if (myRun !== aiRun) return;   // 已有更新的会话，丢弃本次结果
      aiMessages.push({ role: 'assistant', content: acc });
      btnAiCopy.disabled = false;
    } catch (e) {
      if (e.name === 'AbortError') return;
      bubble.remove();
      if (myRun === aiRun) addBubble('err', '无法连接 AI 服务：' + e.message + '。请检查系统配置里的 AI 设置或稍后再试。', false);
    } finally {
      if (myRun === aiRun) {
        aiAbort = null;
        aiBusy = false; btnAiSend.disabled = false; btnAiSend.textContent = '发送';
      }
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
      await streamAi();
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
    // 只复制最终答案（不含思考过程）
    const content = splitThinking(last.content).answer.replace(/\n{3,}/g, '\n\n').trim();
    const card = document.querySelector('.wrong-card[data-id="' + aiTarget + '"]');
    const existing = card ? (card.dataset.note || '') : '';
    const merged = (existing ? existing + '\n' : '') + '---\n【AI解析】\n' + content;
    try {
      await App.patchJSON('/api/wrong/' + aiTarget, { note: merged });
      if (card) card.dataset.note = merged;   // 同步 DOM，防止快速连续复制时丢失
      App.toast('AI 解析已追加到备注（仅最终答案）');
      setTimeout(() => location.reload(), 400);
    } catch (e) { App.toast('保存失败：' + e.message, true); }
  });

  function closeAi() {
    if (aiAbort) { try { aiAbort.abort(); } catch (e) {} }
    aiRun++;
    aiModal.classList.remove('show'); aiMessages = []; aiTarget = null;
  }
  document.getElementById('btnAiClose').addEventListener('click', closeAi);
  document.getElementById('btnAiCloseX').addEventListener('click', closeAi);
  aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAi(); });

  // --- Issue 3: floating note popover（可交互：鼠标移到弹窗上可复制/滚动，不自动消失）---
  const notePreview = document.createElement('div');
  notePreview.className = 'note-preview';
  notePreview.style.display = 'none';
  document.body.appendChild(notePreview);
  let noteHideTimer = null;
  const scheduleHidePreview = (delay) => {
    clearTimeout(noteHideTimer);
    noteHideTimer = setTimeout(() => { notePreview.style.display = 'none'; }, delay);
  };
  const cancelHidePreview = () => clearTimeout(noteHideTimer);
  // 指针是否落在当前已显示弹窗的矩形范围内（即便 DOM 目标是其下方的其它卡片）
  const overPreview = (x, y) => {
    if (notePreview.style.display === 'none') return false;
    const r = notePreview.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  // 鼠标在弹窗上时保持显示；移开延时隐藏（留出跨越间隙的时间）
  notePreview.addEventListener('mouseenter', cancelHidePreview);
  notePreview.addEventListener('mouseleave', () => scheduleHidePreview(250));

  const showNotePreview = (card) => {
    const note = card.dataset.note || '';
    if (!note.trim()) { notePreview.style.display = 'none'; return; }
    notePreview.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'note-preview-title';
    t.textContent = '\u{1F4DD} 备注' + (card.dataset.knowledge ? ' · ' + card.dataset.knowledge : '');
    const body = document.createElement('div');
    body.className = 'note-preview-body';
    body.innerHTML = renderMarkdown(note);   // AI 备注多为 markdown，按 markdown 渲染
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
  };

  listEl.addEventListener('mouseover', (e) => {
    // 指针仍在当前弹窗范围内：保持弹窗（供复制/滚动），不切换到其它题的备注
    if (overPreview(e.clientX, e.clientY)) return;
    const card = e.target.closest('.wrong-card');
    if (!card) return;
    cancelHidePreview();
    showNotePreview(card);
  });
  listEl.addEventListener('mouseleave', () => scheduleHidePreview(250));

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
