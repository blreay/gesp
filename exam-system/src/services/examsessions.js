'use strict';
const db = require('./db');
const grading = require('./grading');

function latestAttempt(examId) {
  return db.get().prepare('SELECT * FROM exam_attempts WHERE exam_id = ? ORDER BY id DESC LIMIT 1').get(examId) || null;
}
function answersOf(attemptId) {
  return Object.fromEntries(db.get().prepare('SELECT question_id, answer FROM exam_answers WHERE attempt_id = ?')
    .all(attemptId).map(r => [r.question_id, r.answer]));
}
function progVerdicts(examId, attemptId) {
  const out = {};
  const rows = db.get().prepare(`SELECT question_id, all_passed, compile_ok FROM prog_submissions s
    WHERE exam_id = ? AND attempt_id = ? AND id IN
      (SELECT MAX(id) FROM prog_submissions WHERE exam_id = ? AND attempt_id = ? GROUP BY question_id)`)
    .all(examId, attemptId, examId, attemptId);
  for (const r of rows) out[r.question_id] = { allPassed: !!r.all_passed, compileOk: !!r.compile_ok };
  return out;
}
function makeGradePayload(exam, attempt) {
  const answers = answersOf(attempt.id);
  const verdicts = progVerdicts(attempt.exam_id, attempt.id);
  const g = grading.gradeAttempt(exam, answers, verdicts);
  return {
    scored: { choice: g.choice, choiceFull: g.choiceFull, tf: g.tf, tfFull: g.tfFull, prog: g.prog, progFull: g.progFull, total: g.total, full: g.full },
    results: g.results, unanswered: g.unanswered
  };
}
module.exports = { latestAttempt, answersOf, progVerdicts, makeGradePayload };
