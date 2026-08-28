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
