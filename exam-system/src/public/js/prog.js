'use strict';
/* global App */
(function () {
  const PAGE = window.PAGE;
  const LS_KEY = 'exam_code_' + PAGE.examId + '_' + PAGE.qid;
  let submitting = false;

  // ---- tab 切换 ----
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ---- Monaco iframe bridge ----
  const DEFAULT_CODE = '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
  const frame = document.getElementById('editorFrame');
  let cachedCode = PAGE.initialCode || localStorage.getItem(LS_KEY) || DEFAULT_CODE;
  let frameReady = false;
  let saveTimer = null;

  const pendingInit = () => {
    if (frameReady) frame.contentWindow.postMessage({ type: 'monaco-init', code: cachedCode }, '*');
  };

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'monaco-ready') {
      frameReady = true;
      pendingInit();
      setTimeout(() => { if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'monaco-focus' }, '*'); }, 300);
    }
    else if (d.type === 'monaco-code') {
      cachedCode = d.code;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => localStorage.setItem(LS_KEY, cachedCode), 500);
    }
  });

  frame.addEventListener('load', pendingInit);

  window.addEventListener('focus', () => {
    if ((document.activeElement === document.body || document.activeElement === null) && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'monaco-focus' }, '*');
    }
  });

  function getCode() {
    return new Promise((resolve) => {
      let done = false;
      const onMsg = (e) => {
        const d = e.data || {};
        if (d.type === 'monaco-code') { done = true; window.removeEventListener('message', onMsg); resolve(d.code); }
      };
      window.addEventListener('message', onMsg);
      frame.contentWindow.postMessage({ type: 'monaco-get' }, '*');
      setTimeout(() => { if (!done) { window.removeEventListener('message', onMsg); resolve(cachedCode); } }, 1500);
    });
  }

  // ---- Refocus editor on mousedown in prog-right ----
  document.querySelector('.prog-right').addEventListener('mousedown', (e) => {
    if (!e.target.closest('button, a, input, .judge-log-panel, #resultPanel')) {
      setTimeout(() => frame.contentWindow && frame.contentWindow.postMessage({ type: 'monaco-focus' }, '*'), 0);
    }
  });

  // ---- 倒计时（考试模式） ----
  if (PAGE.mode === 'exam' && PAGE.deadlineAt) {
    const el = document.getElementById('countdown');
    const tick = () => {
      const remain = PAGE.deadlineAt - Date.now();
      el.textContent = App.fmtCountdown(remain);
      el.classList.toggle('danger', remain <= 5 * 60000);
      if (remain <= 0) {
        el.textContent = '时间已到';
        document.getElementById('btnSubmit').disabled = true;
        clearInterval(timer);
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  // ---- 提交判题 ----
  document.getElementById('btnSubmit').addEventListener('click', async () => {
    if (submitting) return;
    if (!frameReady) { App.toast('编辑器未加载，请刷新页面', true); return; }
    const code = await getCode();
    if (!code.trim()) { App.toast('请先输入代码', true); return; }
    submitting = true;
    const stateEl = document.getElementById('judgeState');
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true; stateEl.textContent = '编译评测中…';
    try {
      const r = await App.postJSON('/api/judge', { examId: PAGE.examId, questionId: PAGE.qid, attemptId: PAGE.attemptId, code });
      renderResult(r);
      renderLog(r);
      prependSub({ created_at: Date.now(), status: r.status, all_passed: r.allPassed ? 1 : 0, compile_ok: r.status === 'COMPILE_ERROR' ? 0 : 1, code });
      if (PAGE.mode === 'practice' && PAGE.sessionId && PAGE.wrongId) {
        try {
          const v = await App.postJSON('/api/review/sessions/' + PAGE.sessionId + '/prog', { wrongId: PAGE.wrongId, allPassed: r.allPassed });
          App.toast(r.allPassed ? '✅ 通过！该错题已处理（' + (v.newStatus === 'mastered' ? '已掌握' : '降至 ' + v.newLevel + ' 级') + '）'
            : '❌ 未全过，错题级别：' + v.newLevel, !r.allPassed);
        } catch (e2) {
          App.toast('判题成功，但复习记录同步失败：' + e2.message, true);
        }
      }
    } catch (e) {
      App.toast('判题失败：' + e.message, true);
    } finally {
      submitting = false; btn.disabled = false; stateEl.textContent = '';
    }
  });

  function renderResult(r) {
    const panel = document.getElementById('resultPanel');
    const content = document.getElementById('resultPanelContent');
    panel.style.display = 'block';
    panel.className = 'result-panel';
    if (r.status === 'ALL_PASS') {
      panel.classList.add('pass');
      content.textContent = '✅ 通过全部测试用例！';
    } else if (r.status === 'PARTIAL_PASS') {
      panel.classList.add('fail');
      content.textContent = '❌ 未通过全部测试：\n' + r.detail;
    } else if (r.status === 'COMPILE_ERROR') {
      panel.classList.add('ce');
      content.textContent = '⚠️ 编译错误：\n' + r.detail;
    } else if (r.status === 'TESTER_BUILD_ERROR') {
      panel.classList.add('ce');
      content.textContent = '⚠️ 题库测试程序错误：\n' + r.detail;
    } else {
      panel.classList.add('rt');
      content.textContent = '⚠️ 运行时错误/超时：\n' + r.detail;
    }
  }

  document.getElementById('resultPanelClose').addEventListener('click', () => {
    document.getElementById('resultPanel').style.display = 'none';
  });

  // ---- Judge Log Panel ----
  function renderLog(r) {
    if (!r.logs || !r.logs.length) return;
    let text = '';
    for (const l of r.logs) {
      text += '══ ' + l.step + ' ══\n$ ' + l.cmd + '\n';
      if (l.killed) text += '[超时/被终止]\n';
      else text += '退出码: ' + l.exitCode + '\n';
      text += (l.output.trim() ? l.output + '\n' : '(无输出)\n');
    }
    text += '\n' + (r.reason || '');
    document.getElementById('judgeLogContent').textContent = text;
    const panel = document.getElementById('judgeLogPanel');
    panel.style.display = 'flex';
    const saved = localStorage.getItem('judge_log_height');
    if (saved) panel.style.height = saved + 'px';
  }

  document.getElementById('judgeLogClose').addEventListener('click', () => {
    document.getElementById('judgeLogPanel').style.display = 'none';
  });

  // Judge log panel resize
  (function () {
    const handle = document.getElementById('judgeLogHandle');
    const panel = document.getElementById('judgeLogPanel');
    let startY, startHeight;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = panel.offsetHeight;
      document.body.style.userSelect = 'none';
      const onMove = (ev) => {
        const h = Math.min(Math.max(startHeight + (startY - ev.clientY), 100), window.innerHeight * 0.7);
        panel.style.height = h + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        localStorage.setItem('judge_log_height', panel.offsetHeight);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();

  // ---- Issue 3: draggable left/right splitter ----
  (function () {
    const splitter = document.getElementById('progSplitter');
    const leftEl = document.querySelector('.prog-left');
    const layout = document.querySelector('.prog-layout');
    const minW = 320, maxFrac = 0.72;

    function clampWidth(w) {
      return Math.min(Math.max(w, minW), window.innerWidth * maxFrac);
    }

    // Restore saved width
    const saved = localStorage.getItem('prog_left_width');
    if (saved) leftEl.style.width = clampWidth(Number(saved)) + 'px';

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.userSelect = 'none';
      splitter.classList.add('dragging');
      const layoutLeft = layout.getBoundingClientRect().left;
      const onMove = (ev) => {
        const w = clampWidth(ev.clientX - layoutLeft);
        leftEl.style.width = w + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        splitter.classList.remove('dragging');
        localStorage.setItem('prog_left_width', leftEl.offsetWidth);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    window.addEventListener('resize', () => {
      const cur = leftEl.offsetWidth;
      const clamped = clampWidth(cur);
      if (clamped !== cur) leftEl.style.width = clamped + 'px';
    });
  })();

  // ---- 提交记录 ----
  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function badge(sub) {
    if (!sub.compile_ok) return '<span class="sub-badge ce">编译错误</span>';
    return sub.all_passed ? '<span class="sub-badge pass">✅ 全部通过</span>' : '<span class="sub-badge fail">❌ 未通过</span>';
  }
  function prependSub(sub) {
    const empty = document.querySelector('#subList .empty-tip') || document.querySelector('#tab-history .empty-tip');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'sub-item';
    div.innerHTML = '<div class="sub-head"><span>' + fmtTime(sub.created_at) + '</span>' + badge(sub) + '</div>' +
      '<div class="sub-code"></div>';
    div.querySelector('.sub-code').textContent = sub.code;
    div.querySelector('.sub-head').addEventListener('click', () => div.classList.toggle('open'));
    document.getElementById('subList').prepend(div);
  }
  (window.PAGE.submissions || []).forEach(prependSub);

  // ---- Double-click solution header to toggle reference code ----
  const codeTitle = document.getElementById('solutionCodeTitle');
  const codeBlock = document.getElementById('solutionCodeBlock');
  const refCode = (document.getElementById('refCodeTpl') || {}).content
    ? document.getElementById('refCodeTpl').content.textContent : '';
  if (codeTitle && codeBlock) {
    const testProgramCode = codeBlock.textContent;
    codeTitle.addEventListener('dblclick', () => {
      if (codeBlock.dataset.mode === 'ref') {
        codeBlock.dataset.mode = 'test';
        codeTitle.textContent = '测试程序源码（判题依据）';
        codeBlock.textContent = testProgramCode;
      } else {
        codeBlock.dataset.mode = 'ref';
        codeTitle.textContent = '正确解题代码（参考）';
        codeBlock.textContent = refCode.trim() ? refCode : '（本题无参考代码）';
      }
    });
  }

  // ---- Copy current solution/test code to clipboard ----
  const codeCopyBtn = document.getElementById('solutionCodeCopy');
  if (codeCopyBtn && codeBlock) {
    codeCopyBtn.addEventListener('click', () => {
      const text = codeBlock.textContent;
      const done = () => {
        codeCopyBtn.textContent = '✓ 已复制';
        codeCopyBtn.classList.add('copied');
        setTimeout(() => { codeCopyBtn.textContent = '📋 复制代码'; codeCopyBtn.classList.remove('copied'); }, 1600);
      };
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { App.toast('复制失败，请手动选择复制', true); }
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else fallback();
    });
  }
})();
