'use strict';
// 倒计时纯函数集合。倒计时以服务端 started_at + duration 为准，前端仅展示。

function durationMs(exam, settings) {
  const mins = (exam && Number.isFinite(exam.duration_minutes) && exam.duration_minutes > 0)
    ? exam.duration_minutes
    : (n => (Number.isFinite(n) && n > 0 ? n : 120))(parseInt((settings && settings.default_duration_minutes) || '120', 10));
  return mins * 60000;
}

function deadlineAt(attempt, durMs) {
  return attempt.started_at + durMs;
}

function remainingMs(attempt, durMs, now) {
  return Math.max(0, attempt.started_at + durMs - now);
}

// 返回需要提醒的"剩余时间点"（毫秒），例如提前30分钟、间隔10分钟 → [30m, 20m, 10m]。
// 前端每秒 tick，剩余时间跨过某个点且上次大于该点时触发一次提醒。
function reminderPoints(durMs, beforeMs, intervalMs) {
  if (!intervalMs || intervalMs <= 0 || !beforeMs || beforeMs <= 0) return [];
  const cap = Math.min(beforeMs, durMs);
  const pts = [];
  for (let t = Math.floor(cap / intervalMs) * intervalMs; t > 0; t -= intervalMs) pts.push(t);
  return pts;
}

function fmt(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const p = n => String(n).padStart(2, '0');
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
}

module.exports = { durationMs, deadlineAt, remainingMs, reminderPoints, fmt };
