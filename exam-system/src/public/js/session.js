'use strict';
/* global App */
(function () {
  const answers = {};
  document.querySelectorAll('.question[data-type="choice"]').forEach(q => {
    q.querySelectorAll('.opt').forEach(o => o.addEventListener('click', () => {
      q.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
      o.classList.add('selected');
      answers[q.dataset.wrong] = o.dataset.val;
    }));
  });
  document.querySelectorAll('.question[data-type="tf"]').forEach(q => {
    q.querySelectorAll('.tf-opt').forEach(o => o.addEventListener('click', () => {
      q.querySelectorAll('.tf-opt').forEach(x => x.classList.remove('selected'));
      o.classList.add('selected');
      answers[q.dataset.wrong] = o.dataset.val;
    }));
  });

  document.getElementById('btnGrade').addEventListener('click', async () => {
    if (!Object.keys(answers).length) { App.toast('还没有作答任何客观题', true); return; }
    try {
      const r = await App.postJSON('/api/review/sessions/' + window.PAGE.sessionId + '/grade', { answers });
      let right = 0;
      for (const item of r.results) {
        const q = document.querySelector('.question[data-wrong="' + item.wrongId + '"]');
        if (!q) continue;
        q.classList.add(item.correct ? 'correct-graded' : 'wrong');
        const lr = q.querySelector('.level-result');
        if (lr) {
          lr.textContent = item.correct
            ? (item.newStatus === 'mastered' ? '🎉 做对了！该错题已掌握' : '🎉 做对了！级别降至 ' + item.newLevel + ' 级')
            : ('❌ 又错了，级别升至 ' + item.newLevel + ' 级');
          lr.className = 'level-result ' + (item.correct ? 'good' : 'bad');
        }
        if (item.correct) right++;
      }
      const disp = document.getElementById('scoreDisplay');
      disp.innerHTML = '本次练习：做对 <span class="big-score">' + r.correctCount + '</span> / ' + (r.results.length) + ' 题';
      disp.style.display = 'block';
      document.querySelectorAll('.question .opt, .question .tf-opt').forEach(el => el.style.pointerEvents = 'none');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { App.toast('判卷失败：' + e.message, true); }
  });
})();
