'use strict';
const db = require('./db');

function dayStr(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 判卷完成后写一条日志。
// att: exam_attempts 行；exam: 试卷对象({exam:{title},sections})；
// payload: makeGradePayload 结果({scored,results,unanswered})；now: 提交时间戳；autoSubmitted: bool。
function record(att, exam, payload, now, autoSubmitted) {
  const d = db.get();
  const prog = payload.results.filter(r => r.type === 'programming');
  const prog_total = prog.length;
  const prog_submitted = prog.filter(r => r.userAnswer).length;
  const prog_passed = prog.filter(r => r.correct).length;
  const all_done = (payload.unanswered.length === 0 && prog_submitted === prog_total) ? 1 : 0;
  const nth = d.prepare('SELECT COUNT(*) c FROM exam_log WHERE exam_id = ?').get(att.exam_id).c + 1;
  d.prepare(`INSERT INTO exam_log(exam_id, exam_title, nth, day, started_at, submitted_at, auto_submitted,
      total_score, prog_total, prog_submitted, prog_passed, all_done, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(att.exam_id, exam.exam.title, nth, dayStr(att.started_at), att.started_at, now, autoSubmitted ? 1 : 0,
      payload.scored.total, prog_total, prog_submitted, prog_passed, all_done, Date.now());
  return nth;
}

function list() {
  return db.get().prepare('SELECT * FROM exam_log ORDER BY started_at DESC, id DESC').all();
}

module.exports = { record, list, dayStr };
