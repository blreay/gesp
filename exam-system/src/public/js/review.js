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
