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

// 一次性把历史已判卷记录回填成日志。必须在题库扫描完成后调用（依赖 questionbank）。
// 以设置键 exam_log_backfilled 为闸门，只执行一次。被 retake 删除的历史无法恢复。
function backfillIfNeeded() {
  if (db.getSetting('exam_log_backfilled') === '1') return { backfilled: false, count: 0 };
  const questionbank = require('./questionbank');
  const sessions = require('./examsessions');
  const grading = require('./grading');
  const d = db.get();
  const rows = d.prepare("SELECT * FROM exam_attempts WHERE status = 'graded' ORDER BY exam_id, started_at, id").all();
  let count = 0;
  const run = d.transaction(() => {
    for (const att of rows) {
      const exam = questionbank.getExam(att.exam_id);
      let exam_title = att.exam_id, prog_total = 0, prog_submitted = 0, prog_passed = 0, all_done = 0;
      if (exam) {
        const answers = sessions.answersOf(att.id);
        const verdicts = sessions.progVerdicts(att.exam_id, att.id);
        const g = grading.gradeAttempt(exam, answers, verdicts);
        const prog = g.results.filter(r => r.type === 'programming');
        prog_total = prog.length;
        prog_submitted = prog.filter(r => r.userAnswer).length;
        prog_passed = prog.filter(r => r.correct).length;
        all_done = (g.unanswered.length === 0 && prog_submitted === prog_total) ? 1 : 0;
        exam_title = exam.exam.title;
      }
      const nth = d.prepare('SELECT COUNT(*) c FROM exam_log WHERE exam_id = ?').get(att.exam_id).c + 1;
      d.prepare(`INSERT INTO exam_log(exam_id, exam_title, nth, day, started_at, submitted_at, auto_submitted,
          total_score, prog_total, prog_submitted, prog_passed, all_done, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(att.exam_id, exam_title, nth, dayStr(att.started_at), att.started_at, att.submitted_at,
          att.auto_submitted ? 1 : 0, att.total_score, prog_total, prog_submitted, prog_passed, all_done, Date.now());
      count++;
    }
    db.setSetting('exam_log_backfilled', '1');
  });
  run();
  return { backfilled: true, count };
}

module.exports = { record, list, backfillIfNeeded, dayStr };
