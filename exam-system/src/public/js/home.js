'use strict';
// 分类过滤 + 考试中卡片剩余时间刷新
document.querySelectorAll('.cat-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat;
    document.querySelectorAll('.card').forEach(c => {
      c.style.display = (cat === 'all' || c.dataset.cat === cat) ? '' : 'none';
    });
  });
});

function tick() {
  document.querySelectorAll('.remain').forEach(el => {
    const remain = Number(el.dataset.deadline) - Date.now();
    el.textContent = remain > 0 ? App.fmtCountdown(remain) : '已到';
  });
}
tick();
setInterval(tick, 1000);
