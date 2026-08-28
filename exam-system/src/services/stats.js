'use strict';
const db = require('./db');
const questionbank = require('./questionbank');

function overview() {
  const d = db.get();
  const attempts = d.prepare("SELECT total_score FROM exam_attempts WHERE status = 'graded'").all();
  const sum = attempts.reduce((s, r) => s + r.total_score, 0);
  const wrong = d.prepare("SELECT status, COUNT(*) c FROM wrong_questions GROUP BY status").all();
  const sub = d.prepare('SELECT COUNT(*) t, SUM(compile_ok) c, SUM(all_passed) p FROM prog_submissions').get();
  return {
    exams: d.prepare('SELECT COUNT(*) c FROM exams').get().c,
    attempts: attempts.length,
    avgScore: attempts.length ? Math.round(sum / attempts.length) : 0,
    maxScore: attempts.length ? attempts.reduce((m, r) => Math.max(m, r.total_score), 0) : 0,
    activeWrong: (wrong.find(w => w.status === 'active') || {}).c || 0,
    mastered: (wrong.find(w => w.status === 'mastered') || {}).c || 0,
    submissions: sub.t || 0,
    compiled: sub.c || 0,
    passed: sub.p || 0,
    submissionPassRate: sub.t ? Math.round((sub.p || 0) / sub.t * 100) : 0
  };
}

function scoreTrend() {
  return db.get().prepare(`SELECT a.id, a.exam_id, e.title AS exam_title, a.total_score,
      a.auto_submitted, a.submitted_at
    FROM exam_attempts a LEFT JOIN exams e ON e.id = a.exam_id
    WHERE a.status = 'graded' ORDER BY a.submitted_at`).all();
}

function levelDistribution() {
  return db.get().prepare(`SELECT level, COUNT(*) count FROM wrong_questions
    WHERE status = 'active' GROUP BY level ORDER BY level`).all();
}

function progStats() {
  const t = db.get().prepare('SELECT COUNT(*) t, SUM(compile_ok) c, SUM(all_passed) p FROM prog_submissions').get();
  const perQuestion = db.get().prepare(`SELECT exam_id, question_id, COUNT(*) n,
      SUM(all_passed) passed FROM prog_submissions GROUP BY exam_id, question_id`).all();
  return { total: t.t || 0, compiled: t.c || 0, passed: t.p || 0, perQuestion };
}

// 知识点正确率：聚合所有已判卷考试的客观题作答（按题目 knowledge 标签展开）
function knowledgeAccuracy() {
  const d = db.get();
  const attempts = d.prepare("SELECT * FROM exam_attempts WHERE status = 'graded'").all();
  const agg = new Map(); // knowledge -> {total, correct}
  for (const att of attempts) {
    const exam = questionbank.getExam(att.exam_id);
    if (!exam) continue;
    const answers = Object.fromEntries(
      d.prepare('SELECT question_id, answer FROM exam_answers WHERE attempt_id = ?').all(att.id)
        .map(r => [r.question_id, r.answer]));
    const graded = require('./grading').gradeObjective(exam, answers);
    const byQid = new Map(graded.results.map(r => [r.qid, r]));
    for (const sec of exam.sections) {
      for (const q of sec.questions || []) {
        if (q.type === 'programming' || !Array.isArray(q.knowledge)) continue;
        const r = byQid.get(q.id);
        if (!r || r.skipped) continue;
        for (const k of q.knowledge) {
          const item = agg.get(k) || { total: 0, correct: 0 };
          item.total++;
          if (r.correct) item.correct++;
          agg.set(k, item);
        }
      }
    }
  }
  return [...agg.entries()]
    .map(([knowledge, v]) => ({ knowledge, total: v.total, correct: v.correct, accuracy: Math.round(v.correct / v.total * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

// 题型对错统计（客观题来自已判卷作答；编程题来自提交记录）
function typeBreakdown() {
  const d = db.get();
  const attempts = d.prepare("SELECT * FROM exam_attempts WHERE status = 'graded'").all();
  const stat = { choice: { total: 0, correct: 0 }, tf: { total: 0, correct: 0 }, programming: { total: 0, correct: 0 } };
  for (const att of attempts) {
    const exam = questionbank.getExam(att.exam_id);
    if (!exam) continue;
    const answers = Object.fromEntries(
      d.prepare('SELECT question_id, answer FROM exam_answers WHERE attempt_id = ?').all(att.id)
        .map(r => [r.question_id, r.answer]));
    for (const r of require('./grading').gradeObjective(exam, answers).results) {
      if (r.skipped) continue;
      if (!stat[r.type]) continue;
      stat[r.type].total++;
      if (r.correct) stat[r.type].correct++;
    }
  }
  const sub = d.prepare('SELECT COUNT(*) t, SUM(all_passed) p FROM prog_submissions').get();
  stat.programming.total = sub.t || 0;
  stat.programming.correct = sub.p || 0;
  return stat;
}

module.exports = { overview, scoreTrend, levelDistribution, progStats, knowledgeAccuracy, typeBreakdown };
