'use strict';
/* global Chart */
(function () {
  const S = window.STATS;
  const fmt = ts => { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); };

  if (S.trend.length) {
    new Chart(document.getElementById('chartTrend'), {
      type: 'line',
      data: { labels: S.trend.map(t => fmt(t.submitted_at) + ' ' + t.exam_title),
        datasets: [{ label: '总分', data: S.trend.map(t => t.total_score), borderColor: '#2980b9',
          backgroundColor: 'rgba(41,128,185,.12)', fill: true, tension: .3,
          pointBackgroundColor: S.trend.map(t => t.auto_submitted ? '#e67e22' : '#2980b9') }] },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }

  if (S.knowledge.length) {
    new Chart(document.getElementById('chartKnowledge'), {
      type: 'bar',
      data: { labels: S.knowledge.map(k => k.knowledge),
        datasets: [{ label: '正确率%', data: S.knowledge.map(k => k.accuracy),
          backgroundColor: S.knowledge.map(k => k.accuracy < 60 ? '#e74c3c' : k.accuracy < 80 ? '#f39c12' : '#27ae60') }] },
      options: { indexAxis: 'y', scales: { x: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });
  }

  const t = S.types;
  new Chart(document.getElementById('chartTypes'), {
    type: 'bar',
    data: { labels: ['单选', '判断', '编程'],
      datasets: [
        { label: '对', data: [t.choice.correct, t.tf.correct, t.programming.correct], backgroundColor: '#27ae60' },
        { label: '错', data: [t.choice.total - t.choice.correct, t.tf.total - t.tf.correct, t.programming.total - t.programming.correct], backgroundColor: '#e74c3c' }
      ] },
    options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
  });

  if (S.levels.length) {
    new Chart(document.getElementById('chartLevels'), {
      type: 'doughnut',
      data: { labels: S.levels.map(l => 'L' + l.level),
        datasets: [{ data: S.levels.map(l => l.count),
          backgroundColor: ['#f39c12', '#e67e22', '#e74c3c', '#c0392b', '#7b241c'] }] }
    });
  }
})();

// ===== 每日模拟考试日志（内嵌数据 + 前端过滤）=====
(function () {
  const logs = (window.STATS && window.STATS.examLog) || [];
  const listEl = document.getElementById('logList');
  const granSel = document.getElementById('logGranularity');
  const periodSel = document.getElementById('logPeriod');
  if (!listEl || !granSel || !periodSel) return;

  const pad = n => String(n).padStart(2, '0');
  const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtMD = ts => { const d = new Date(ts); return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  // ISO 周（周一起）：'2026-08-31' -> '2026-W36'
  function isoWeek(dayStr) {
    const p = dayStr.split('-').map(Number);
    const date = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + pad(weekNo);
  }
  const periodOf = (log, gran) => gran === 'day' ? log.day : (gran === 'week' ? isoWeek(log.day) : log.day.slice(0, 7));
  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function logLine(l) {
    const sameDay = l.day === (function () { const d = new Date(l.submitted_at); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();
    const end = sameDay ? fmtTime(l.submitted_at) : fmtMD(l.submitted_at) + ' ' + fmtTime(l.submitted_at);
    let html = '<div class="examlog-row">' +
      '<span class="examlog-title">' + escHtml(l.exam_title) + '</span>' +
      '<span class="examlog-nth">第 ' + l.nth + ' 次</span>' +
      '<span class="examlog-time">' + fmtTime(l.started_at) + ' – ' + end + '</span>' +
      '<span class="examlog-score">' + l.total_score + ' 分</span>';
    if (l.prog_total > 0) html += '<span class="examlog-prog">编程 提交' + l.prog_submitted + '/共' + l.prog_total + ' · 通过' + l.prog_passed + '</span>';
    html += l.all_done ? '<span class="examlog-done ok">✔ 全部完成</span>' : '<span class="examlog-done bad">✘ 未完成</span>';
    if (l.auto_submitted) html += '<span class="examlog-auto">超时自动交卷</span>';
    return html + '</div>';
  }

  function render() {
    const gran = granSel.value, period = periodSel.value;
    const filtered = logs.filter(l => gran === 'all' || periodOf(l, gran) === period);
    if (!filtered.length) { listEl.innerHTML = '<div class="empty-tip">该时段无考试记录</div>'; return; }
    const groups = new Map();
    for (const l of filtered) { if (!groups.has(l.day)) groups.set(l.day, []); groups.get(l.day).push(l); }
    let html = '';
    for (const day of [...groups.keys()].sort().reverse()) {
      const items = groups.get(day);
      html += '<div class="examlog-day">' + day + ' · ' + items.length + ' 场</div>';
      for (const l of items) html += logLine(l);
    }
    listEl.innerHTML = html;
  }

  function fillPeriods() {
    const gran = granSel.value;
    if (gran === 'all') { periodSel.style.display = 'none'; render(); return; }
    const opts = [...new Set(logs.map(l => periodOf(l, gran)))].sort().reverse();
    periodSel.innerHTML = opts.map(o => '<option value="' + o + '">' + o + '</option>').join('');
    periodSel.style.display = '';
    render();
  }

  granSel.addEventListener('change', fillPeriods);
  periodSel.addEventListener('change', render);
  fillPeriods();
})();
