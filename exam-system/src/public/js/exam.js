'use strict';
/* global App */
// window.EXAM: 试卷 JSON；window.PAGE: {mode, attemptId, deadlineAt, durationMs, savedAnswers, lastGrade, remind, progStatus}
(function () {
  const PAGE = window.PAGE;
  const EXAM = window.EXAM;
  const IS_ADMIN = !!(window.USER && window.USER.role === 'admin');
  const qEls = () => document.querySelectorAll('.question[data-qid]');
  const answers = Object.assign({}, PAGE.savedAnswers || {});
  let graded = false;
  let previewing = false;
  let handing = false;
  let reminderFired = new Set();
  let pendingSaves = new Set();

  // ---- 初始化 ----
  function init() {
    bindSelection();
    restoreSaved();
    // 所有模式（含 graded 讲评态）都可能点【重新考试】，必须在模式分支 return 之前绑定
    document.getElementById('btnRetake').addEventListener('click', doRetake);
    if (PAGE.mode === 'graded') {
      graded = true;
      lockAll();
      applyGradeView(PAGE.lastGrade, false);
      document.getElementById('btnGrade').style.display = 'none';
      document.getElementById('btnHandin').style.display = 'none';
      document.getElementById('btnRetake').style.display = '';
      document.getElementById('countdown').textContent = '已交卷';
      document.getElementById('countdown').classList.remove('warning', 'danger');
      renderProgStatus();
      return;
    }
    if (PAGE.mode === 'timeup') {
      // 时间到不自动交卷：仍可继续作答，客观题全部完成后手动交卷
      const el = document.getElementById('countdown');
      el.textContent = '时间已到';
      el.classList.add('danger');
      App.toast('⏰ 考试时间已到，不会自动交卷；完成全部客观题后请手动交卷', true);
      renderProgStatus();
      bindActions();
      updateHandinState();
      return;
    }
    document.getElementById('countdown').textContent = App.fmtCountdown(PAGE.durationMs);
    if (PAGE.mode === 'fresh') {
      document.getElementById('btnStart').addEventListener('click', startExam);
    } else {
      startTick();
      renderProgStatus();
    }
    bindActions();
    updateHandinState();
  }

  function bindActions() {
    // 预览判卷仅管理员可用（普通用户按钮已在服务端渲染为 disabled，接口也会 403）
    if (IS_ADMIN) document.getElementById('btnGrade').addEventListener('click', () => previewGrade(false));
    document.getElementById('btnHandin').addEventListener('click', () => handin());
    document.getElementById('btnGradeAnyway').addEventListener('click', () => { hideModal('missingModal'); previewGrade(true); });
    document.getElementById('btnBackToAnswer').addEventListener('click', () => hideModal('missingModal'));
  }

  // ---- 交卷门槛：客观题（选择/判断/填空）全部作答后才允许交卷，编程题不计入 ----
  function objectiveTotal() {
    let n = 0;
    for (const sec of EXAM.sections) for (const q of sec.questions) if (q.type !== 'programming') n++;
    return n;
  }
  function updateHandinState() {
    if (graded) return;
    const btn = document.getElementById('btnHandin');
    const pill = document.getElementById('objProgress');
    const missing = collectUnanswered();
    const total = objectiveTotal();
    if (pill) {
      pill.textContent = '客观题 ' + (total - missing.length) + ' / ' + total;
      pill.classList.toggle('done', missing.length === 0);
    }
    btn.disabled = !PAGE.attemptId || missing.length > 0;
    btn.title = !PAGE.attemptId ? '请先开始答题'
      : missing.length ? '还有 ' + missing.length + ' 道客观题未作答，不能交卷'
      : '交卷（最终判分）';
  }

  async function startExam() {
    try {
      const r = await App.postJSON('/api/exams/' + PAGE.examId + '/start', {});
      PAGE.attemptId = r.attemptId;
      PAGE.deadlineAt = r.deadlineAt;
      hideModal('startModal');
      startTick();
      updateHandinState();
      App.toast('考试开始，倒计时已启动');
    } catch (e) { App.toast('启动失败：' + e.message, true); }
  }

  // ---- 选择交互 ----
  function bindSelection() {
    document.querySelectorAll('.question[data-type="choice"]').forEach(q => {
      q.querySelectorAll('.opt').forEach(o => o.addEventListener('click', () => {
        if (graded) return;
        q.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
        o.classList.add('selected');
        saveAnswer(q.dataset.qid, o.dataset.val);
      }));
    });
    document.querySelectorAll('.question[data-type="tf"]').forEach(q => {
      q.querySelectorAll('.tf-opt').forEach(o => o.addEventListener('click', () => {
        if (graded) return;
        q.querySelectorAll('.tf-opt').forEach(x => x.classList.remove('selected'));
        o.classList.add('selected');
        saveAnswer(q.dataset.qid, o.dataset.val);
      }));
    });
    // 填空题：输入防抖保存 + 失焦立即保存
    document.querySelectorAll('.question[data-type="fill"]').forEach(q => {
      const inp = q.querySelector('.fill-input');
      if (!inp) return;
      let t = null;
      inp.addEventListener('input', () => {
        if (graded) return;
        clearTimeout(t);
        t = setTimeout(() => saveAnswer(q.dataset.qid, inp.value), 400);
      });
      inp.addEventListener('blur', () => {
        if (graded) return;
        clearTimeout(t);
        saveAnswer(q.dataset.qid, inp.value);
      });
    });
  }
  function restoreSaved() {
    for (const [qid, val] of Object.entries(answers)) {
      const q = document.querySelector(`.question[data-qid="${qid}"]`);
      if (!q) continue;
      if (q.dataset.type === 'fill') {
        const inp = q.querySelector('.fill-input');
        if (inp) inp.value = val;
        continue;
      }
      const el = q.querySelector(`[data-val="${val}"]`);
      if (el) el.classList.add('selected');
    }
  }
  function saveAnswer(qid, val) {
    answers[qid] = val;
    updateHandinState();
    // Re-answer clears preview marks
    const q = document.querySelector(`.question[data-qid="${qid}"]`);
    if (q && (q.classList.contains('wrong') || q.classList.contains('correct-graded'))) {
      q.classList.remove('wrong', 'correct-graded');
      const tag = q.querySelector('.correct-answer-tag');
      if (tag) { tag.style.display = 'none'; tag.textContent = ''; }
    }
    if (!PAGE.attemptId) return;
    const p = App.postJSON(`/api/attempts/${PAGE.attemptId}/answers`, { questionId: qid, answer: val }).catch(() => {});
    pendingSaves.add(p);
    p.finally(() => pendingSaves.delete(p));
  }

  // ---- 倒计时 ----
  let timer = null;
  function startTick() {
    if (timer) return;
    timer = setInterval(tick, 1000);
    tick();
  }
  function tick() {
    const remain = PAGE.deadlineAt - Date.now();
    const el = document.getElementById('countdown');
    el.textContent = App.fmtCountdown(remain);
    el.classList.toggle('warning', remain <= PAGE.remind.beforeMs * 2 && remain > PAGE.remind.beforeMs);
    el.classList.toggle('danger', remain <= PAGE.remind.beforeMs);
    // 提醒点
    if (remain > 0 && remain <= PAGE.remind.beforeMs && PAGE.remind.intervalMs > 0) {
      for (let t = PAGE.remind.beforeMs; t > 0; t -= PAGE.remind.intervalMs) {
        if (remain <= t && !reminderFired.has(t)) {
          reminderFired.add(t);
          App.toast('⏰ 距离考试结束还有 ' + Math.round(t / 60000) + ' 分钟，注意把握时间！', true);
          App.beep(880, 250);
        }
      }
    }
    if (remain <= 0) {
      clearInterval(timer); timer = null;
      // 时间到不自动交卷：仍可继续作答，客观题全部完成后手动交卷
      if (!graded) {
        el.textContent = '时间已到';
        el.classList.add('danger');
        App.toast('⏰ 时间已到，不会自动交卷；可继续作答，完成全部客观题后手动交卷', true);
      }
    }
  }

  // ---- 预览判卷（不终局） ----
  function collectUnanswered() {
    const missing = [];
    for (const sec of EXAM.sections) {
      sec.questions.forEach((q, qi) => {
        if (q.type === 'programming') return;
        const a = answers[q.id];
        if (a === undefined || a === '') {
          const label = q.type === 'choice' ? '选择题' : q.type === 'fill' ? '填空题' : '判断题';
          missing.push(label + ' 第 ' + (qi + 1) + ' 题');
        }
      });
    }
    return missing;
  }
  async function previewGrade(skipMissingCheck) {
    if (graded || previewing || handing) return;
    if (!PAGE.attemptId) { App.toast('请先开始答题', true); return; }
    const missing = collectUnanswered();
    if (missing.length && !skipMissingCheck) {
      document.getElementById('missingList').innerHTML = missing.join('<br>');
      showModal('missingModal');
      return;
    }
    if (pendingSaves.size) await Promise.allSettled([...pendingSaves]);
    const btn = document.getElementById('btnGrade');
    btn.textContent = '判卷中…';
    btn.disabled = true;
    previewing = true;
    try {
      const r = await App.postJSON(`/api/attempts/${PAGE.attemptId}/preview`, {});
      applyGradeView(r, true);
    } catch (e) {
      App.toast('判卷失败：' + e.message, true);
    } finally {
      previewing = false;
      btn.disabled = false;
      btn.textContent = '判 卷';
    }
  }

  // ---- 交卷（终局）----
  async function handin() {
    if (graded || handing) return;
    // 客观题未全部作答不允许交卷（按钮已置灰，这里再兜底一次；服务端同样校验）
    const missing = collectUnanswered();
    if (missing.length) { App.toast('还有 ' + missing.length + ' 道客观题未作答，不能交卷', true); return; }
    if (!confirm('交卷后将最终判分，不能再作答。确定交卷吗？')) return;
    if (!PAGE.attemptId) { App.toast('请先开始答题', true); return; }
    if (pendingSaves.size) await Promise.allSettled([...pendingSaves]);
    handing = true;
    const btnH = document.getElementById('btnHandin');
    const btnG = document.getElementById('btnGrade');
    btnH.textContent = '交卷判分中…';
    btnH.disabled = true;
    btnG.disabled = true;
    try {
      const r = await App.postJSON(`/api/attempts/${PAGE.attemptId}/grade`, { auto: false });
      graded = true;
      lockAll();
      applyGradeView(r, false);
      App.toast('已交卷');
      btnH.style.display = 'none';
      btnG.style.display = 'none';
      document.getElementById('objProgress').style.display = 'none';
      document.getElementById('btnRetake').style.display = '';
      const el = document.getElementById('countdown');
      el.textContent = '已交卷';
      el.classList.remove('warning', 'danger');
      if (timer) { clearInterval(timer); timer = null; }
    } catch (e) {
      App.toast('交卷失败：' + e.message, true);
    } finally {
      handing = false;
      if (!graded) {
        btnH.textContent = '交卷';
        btnG.disabled = !IS_ADMIN;
        updateHandinState();
      }
    }
  }

  // ---- 判卷结果展示 ----
  function applyGradeView(r, isPreview) {
    const s = r.scored;
    // 分项得分表
    EXAM.sections.forEach((sec, i) => {
      const el = document.getElementById('scoreSec' + i);
      if (!el) return;
      if (sec.question_type === 'choice') el.textContent = s.choice + ' / ' + s.choiceFull;
      else if (sec.question_type === 'tf') el.textContent = s.tf + ' / ' + s.tfFull;
      else if (sec.question_type === 'fill') el.textContent = (s.fill || 0) + ' / ' + (s.fillFull || 0);
      else el.textContent = s.prog + ' / ' + s.progFull;
    });
    document.getElementById('scoreTotal').textContent = s.total + ' / ' + s.full;
    const disp = document.getElementById('scoreDisplay');
    if (isPreview) {
      disp.innerHTML = '⚠️ 预览判分（可继续作答）：得分 <big>' + s.total + '</big> / ' + s.full + ' 分';
    } else {
      const emoji = s.total >= s.full * 0.8 ? '🎉' : s.total >= s.full * 0.6 ? '💪' : '📖';
      disp.innerHTML = emoji + ' 本次得分：<span class="big-score">' + s.total + '</span> / ' + s.full + ' 分' +
        (r.autoSubmitted ? '（时间到自动交卷）' : '');
    }
    disp.style.display = 'block';
    // 逐题标记
    for (const item of r.results) {
      const q = document.querySelector(`.question[data-qid="${item.qid}"]`);
      if (!q) continue;
      if (item.skipped) continue;
      q.classList.add(item.correct ? 'correct-graded' : 'wrong');
      if (!item.correct && item.type !== 'programming') {
        const tag = q.querySelector('.correct-answer-tag');
        const qData = findQuestion(item.qid);
        // 普通用户卷面数据不含 answer（服务端已剥离），只显示对错不显示正确答案
        if (tag && qData && qData.answer !== undefined && qData.answer !== null) {
          tag.style.display = '';
          if (item.type === 'choice') {
            const optText = qData.options[qData.answer] || '';
            tag.textContent = '✅ 正确答案：' + qData.answer + '. ' + optText;
          } else if (item.type === 'fill') {
            const alts = Array.isArray(qData.answer) ? qData.answer : [qData.answer];
            tag.textContent = '✅ 正确答案：' + alts.join(' 或 ');
          } else {
            tag.textContent = '✅ 正确答案：' + (qData.answer ? '正确 ✔' : '错误 ✘');
          }
        }
        const copyBtn = q.querySelector('.btn-copy');
        if (copyBtn && !copyBtn.dataset.bound) {
          copyBtn.dataset.bound = '1';
          copyBtn.addEventListener('click', () => copyQuestion(item.qid));
        }
      }
    }
    if (!isPreview) {
      lockAll();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function findQuestion(qid) {
    for (const sec of EXAM.sections) {
      const q = sec.questions.find(x => x.id === qid);
      if (q) return q;
    }
    return null;
  }
  function lockAll() {
    qEls().forEach(q => {
      q.classList.add('locked');
      const inp = q.querySelector('.fill-input');
      if (inp) inp.readOnly = true;
    });
  }

  // ---- 重新考试 ----
  function doRetake() {
    if (!confirm('重新考试将清空本次考试的全部结果（包括编程题提交）。确定吗？')) return;
    App.postJSON('/api/exams/' + PAGE.examId + '/retake', {})
      .then(() => location.reload())
      .catch(e => App.toast('重新考试失败：' + e.message, true));
  }

  // ---- 复制错题 ----
  function copyQuestion(qid) {
    const q = findQuestion(qid);
    if (!q) return;
    const typeLabel = q.type === 'choice' ? '单选题' : q.type === 'fill' ? '填空题' : '判断题';
    const lines = ['【' + EXAM.exam.title + ' · ' + typeLabel + '】'];
    q.stem.split('\n').forEach(l => lines.push(l));
    const hasAns = q.answer !== undefined && q.answer !== null; // 普通用户卷面无 answer
    if (q.type === 'choice') {
      for (const [k, v] of Object.entries(q.options)) lines.push(k + '. ' + v);
      lines.push('我的答案：' + (answers[qid] || '未作答') + ' ✗');
      if (hasAns) lines.push('正确答案：' + q.answer + ' ✓');
    } else if (q.type === 'fill') {
      lines.push('我的答案：' + (answers[qid] || '未作答') + ' ✗');
      if (hasAns) lines.push('正确答案：' + (Array.isArray(q.answer) ? q.answer.join(' 或 ') : q.answer) + ' ✓');
    } else {
      lines.push('我的答案：' + (answers[qid] === 'true' ? '正确 ✔' : answers[qid] === 'false' ? '错误 ✘' : '未作答') + ' ✗');
      if (hasAns) lines.push('正确答案：' + (q.answer ? '正确 ✔' : '错误 ✘') + ' ✓');
    }
    if (q.explanation) lines.push('解析：' + q.explanation);
    const text = lines.join('\n');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => App.toast('✅ 已复制，可粘贴到错题本')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); App.toast('✅ 已复制，可粘贴到错题本'); }
    catch (e) { App.toast('复制失败，请手动复制', true); }
    document.body.removeChild(ta);
  }

  // ---- 编程题状态徽章 ----
  function renderProgStatus() {
    const st = PAGE.progStatus || {};
    for (const sec of EXAM.sections) {
      for (const q of sec.questions) {
        if (q.type !== 'programming') continue;
        const el = document.getElementById('progStatus_' + q.id);
        if (!el) continue;
        const v = st[q.id];
        if (!v) { el.innerHTML = '<span style="color:#999">尚未提交</span>'; continue; }
        el.innerHTML = v.allPassed ? '<span class="ok">✅ 已通过全部测试</span>' : '<span class="bad">❌ 未通过全部测试</span>';
      }
    }
  }

  function showModal(id) { document.getElementById(id).classList.add('show'); }
  function hideModal(id) { document.getElementById(id).classList.remove('show'); }

  init();
})();
