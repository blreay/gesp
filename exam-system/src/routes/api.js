'use strict';
const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../services/db');
const qb = require('../services/questionbank');
const countdown = require('../services/countdown');
const grading = require('../services/grading');
const wrongbook = require('../services/wrongbook');
const judge = require('../services/judge');
const sessions = require('../services/examsessions');

const BANK_DIR = path.join(__dirname, '..', '..', 'question_bank');
const asyncH = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function settingsObj() { return db.allSettings(); }

// ---- 试卷列表（供自动化代理按标题检索试卷）----
router.get('/exams', asyncH(async (req, res) => {
  const rows = qb.listExams();
  const s = settingsObj();
  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    category: r.category,
    duration_minutes: r.duration_minutes || parseInt(s.default_duration_minutes, 10),
    total_score: r.total_score,
  })));
}));

// ---- 试卷详情（完整卷面，供自动化代理读取题目）----
// 注意：返回的 JSON 含 answer/reference_code 等参考字段，是题库源数据。
// 代理若以"真实应试"为目的，应仅依据题干作答，不要直接照抄参考字段。
router.get('/exams/:examId/detail', asyncH(async (req, res) => {
  const exam = qb.getExam(req.params.examId);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  res.json(exam);
}));

// ---- 考试流 ----
router.post('/exams/:examId/start', asyncH(async (req, res) => {
  const exam = qb.getExam(req.params.examId);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  const existing = sessions.latestAttempt(req.params.examId);
  const durMs = countdown.durationMs(exam.exam, settingsObj());
  if (existing && existing.status === 'in_progress') {
    return res.json({ attemptId: existing.id, deadlineAt: countdown.deadlineAt(existing, durMs), durationMs: durMs, resumed: true });
  }
  const now = Date.now();
  const info = db.get().prepare(`INSERT INTO exam_attempts(exam_id, status, started_at) VALUES (?, 'in_progress', ?)`)
    .run(req.params.examId, now);
  res.json({ attemptId: Number(info.lastInsertRowid), deadlineAt: now + durMs, durationMs: durMs, resumed: false });
}));

router.get('/exams/:examId/state', asyncH(async (req, res) => {
  const exam = qb.getExam(req.params.examId);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  const s = settingsObj();
  const durMs = countdown.durationMs(exam.exam, s);
  const att = sessions.latestAttempt(req.params.examId);
  const now = Date.now();
  const payload = {
    attempt: null, deadlineAt: null, durationMs: durMs, remainingMs: durMs,
    answers: {}, lastGrade: null,
    remind: { beforeMs: parseInt(s.remind_before_minutes, 10) * 60000, intervalMs: parseInt(s.remind_interval_minutes, 10) * 60000 }
  };
  if (!att) return res.json(payload);
  payload.attempt = { id: att.id, status: att.status, startedAt: att.started_at, submittedAt: att.submitted_at, autoSubmitted: !!att.auto_submitted, totalScore: att.total_score };
  payload.deadlineAt = countdown.deadlineAt(att, durMs);
  payload.remainingMs = countdown.remainingMs(att, durMs, now);
  payload.answers = sessions.answersOf(att.id);
  if (att.status === 'graded') payload.lastGrade = sessions.makeGradePayload(exam, att);
  if (att && att.status === 'in_progress') {
    payload.progStatus = sessions.progVerdicts(req.params.examId, att.id);
  }
  res.json(payload);
}));

router.post('/attempts/:attemptId/answers', asyncH(async (req, res) => {
  const att = db.get().prepare('SELECT * FROM exam_attempts WHERE id = ?').get(req.params.attemptId);
  if (!att) return res.status(404).json({ error: '考试不存在' });
  if (att.status !== 'in_progress') return res.status(400).json({ error: '考试已结束，不能继续作答' });
  const { questionId, answer } = req.body || {};
  if (!questionId || answer === undefined || answer === null) return res.status(400).json({ error: '参数缺失' });
  db.get().prepare(`INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (?, ?, ?)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET answer = excluded.answer`)
    .run(att.id, String(questionId), String(answer));
  res.json({ ok: true });
}));

router.post('/attempts/:attemptId/grade', asyncH(async (req, res) => {
  const att = db.get().prepare('SELECT * FROM exam_attempts WHERE id = ?').get(req.params.attemptId);
  if (!att) return res.status(404).json({ error: '考试不存在' });
  if (att.status === 'graded') return res.status(400).json({ error: '该考试已判分，不能重复判卷' });
  const exam = qb.getExam(att.exam_id);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });

  // 编程题：用该 attempt 每题最新提交再评一次
  // 注意：串行重判可能耗时较长（每题编译+运行上限约 1 分多钟）。
  // 单用户场景可接受；Node 18+ 默认请求超时 5 分钟，足以覆盖两道编程题。
  const d = db.get();
  const progQs = [];
  for (const sec of exam.sections) for (const q of sec.questions || []) if (q.type === 'programming') progQs.push(q);
  for (const q of progQs) {
    const sub = d.prepare(`SELECT * FROM prog_submissions WHERE exam_id = ? AND question_id = ? AND attempt_id = ?
      ORDER BY id DESC LIMIT 1`).get(att.exam_id, q.id, att.id);
    if (sub) await judge.judge({ examId: att.exam_id, questionId: q.id, attemptId: att.id, code: sub.code });
  }

  const payload = sessions.makeGradePayload(exam, att);
  const now = Date.now();
  const wrongAdded = [];
  for (const r of payload.results) {
    if (!r.skipped && !r.correct) { wrongbook.recordWrong(att.exam_id, r.qid, now); wrongAdded.push(r.qid); }
  }
  d.prepare(`UPDATE exam_attempts SET status = 'graded', submitted_at = ?, auto_submitted = ?,
    score_choice = ?, score_tf = ?, score_prog = ?, total_score = ? WHERE id = ?`)
    .run(now, req.body && req.body.auto ? 1 : 0,
      payload.scored.choice, payload.scored.tf, payload.scored.prog, payload.scored.total, att.id);
  res.json({ ...payload, wrongAdded, autoSubmitted: !!(req.body && req.body.auto) });
}));

// ---- 预览判卷（不终局） ----
router.post('/attempts/:attemptId/preview', asyncH(async (req, res) => {
  const att = db.get().prepare('SELECT * FROM exam_attempts WHERE id = ?').get(req.params.attemptId);
  if (!att) return res.status(404).json({ error: '考试不存在' });
  if (att.status === 'graded') return res.status(400).json({ error: '已交卷，无需预览判分' });
  const exam = qb.getExam(att.exam_id);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  const payload = sessions.makeGradePayload(exam, att);
  res.json({ ...payload, preview: true });
}));

// ---- 重新考试 ----
router.post('/exams/:examId/retake', asyncH(async (req, res) => {
  const exam = qb.getExam(req.params.examId);
  if (!exam) return res.status(404).json({ error: '试卷不存在' });
  const att = sessions.latestAttempt(req.params.examId);
  const d = db.get();
  if (att) {
    d.prepare('DELETE FROM exam_answers WHERE attempt_id = ?').run(att.id);
    d.prepare('DELETE FROM prog_submissions WHERE attempt_id = ?').run(att.id);
    d.prepare('DELETE FROM exam_attempts WHERE id = ?').run(att.id);
  }
  const durMs = countdown.durationMs(exam.exam, settingsObj());
  const now = Date.now();
  const info = d.prepare(`INSERT INTO exam_attempts(exam_id, status, started_at) VALUES (?, 'in_progress', ?)`)
    .run(req.params.examId, now);
  res.json({ attemptId: Number(info.lastInsertRowid), deadlineAt: now + durMs, durationMs: durMs, resumed: false, cleared: !!att });
}));

// ---- 判题 ----
router.post('/judge', asyncH(async (req, res) => {
  const { examId, questionId, attemptId, code } = req.body || {};
  if (!examId || !questionId || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: '参数缺失：examId / questionId / code' });
  }
  if (code.length > 200000) return res.status(400).json({ error: '代码过长' });
  const r = await judge.judge({ examId, questionId, attemptId: attemptId || null, code });
  res.json(r);
}));

// ---- 错题复习 ----
const ALLOWED_SESSION_FILTER_KEYS = ['level', 'status', 'category', 'keyword', 'type'];

router.post('/review/sessions', asyncH(async (req, res) => {
  const filter = {};
  for (const k of ALLOWED_SESSION_FILTER_KEYS) if (req.body && req.body.filter && req.body.filter[k]) filter[k] = req.body.filter[k];
  if (!filter.status) filter.status = 'active';
  const rows = wrongbook.list(filter);
  if (rows.length === 0) return res.status(400).json({ error: '当前筛选条件下没有错题' });
  const items = rows.map(w => {
    const hit = qb.getQuestion(w.exam_id, w.question_id);
    const q = hit ? hit.question : null;
    let type = 'unknown', correctAnswer = null;
    if (q) {
      type = q.type;
      if (q.type === 'choice') correctAnswer = q.answer;
      else if (q.type === 'tf') correctAnswer = String(q.answer);
    }
    return { wrongId: w.id, examId: w.exam_id, questionId: w.question_id, type, level: w.level, correctAnswer };
  });
  let finalItems = items;
  if (filter.type && filter.type !== 'all') finalItems = items.filter(i => i.type === filter.type);
  if (finalItems.length === 0) return res.status(400).json({ error: '当前筛选条件下没有错题' });
  const now = Date.now();
  const info = db.get().prepare('INSERT INTO review_sessions(created_at, filter_json, total) VALUES (?, ?, ?)')
    .run(now, JSON.stringify(filter), finalItems.length);
  const sessionId = Number(info.lastInsertRowid);
  const insItem = db.get().prepare('INSERT OR IGNORE INTO review_session_items(session_id, wrong_id) VALUES (?, ?)');
  for (const it of finalItems) insItem.run(sessionId, it.wrongId);
  res.json({ sessionId, total: finalItems.length, items: finalItems });
}));

// 客观题批量判分（编程题走 /review/sessions/:id/prog 单独记录）
router.post('/review/sessions/:id/grade', asyncH(async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: '非法的 ID' });
  const session = db.get().prepare('SELECT * FROM review_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: '复习会话不存在' });
  const answers = (req.body && req.body.answers) || {};
  const d = db.get();
  const itemRows = d.prepare(`SELECT rsi.wrong_id, w.exam_id, w.question_id FROM review_session_items rsi
    JOIN wrong_questions w ON w.id = rsi.wrong_id WHERE rsi.session_id = ?`).all(session.id);
  const now = Date.now();
  const results = [];
  let correctCount = 0;
  const upAns = d.prepare(`INSERT INTO review_answers(session_id, wrong_id, answer, correct) VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, wrong_id) DO UPDATE SET answer = excluded.answer, correct = excluded.correct`);
  for (const it of itemRows) {
    if (!(String(it.wrong_id) in answers)) continue; // 未答跳过
    const hit = qb.getQuestion(it.exam_id, it.question_id);
    if (!hit) continue;
    const q = hit.question;
    if (q.type === 'programming') continue; // 编程题走单独端点
    const user = String(answers[String(it.wrong_id)]);
    const correct = q.type === 'choice' ? user === q.answer : grading.normalizeTf(user) === q.answer;
    upAns.run(session.id, it.wrong_id, String(user), correct ? 1 : 0);
    const updated = correct ? wrongbook.recordRight(it.wrong_id, now) : wrongbook.recordWrong(it.exam_id, it.question_id, now);
    if (correct) correctCount++;
    results.push({ wrongId: it.wrong_id, correct, newLevel: updated.level, newStatus: updated.status });
  }
  const done = d.prepare('SELECT COUNT(*) c FROM review_answers WHERE session_id = ?').get(session.id).c;
  d.prepare(`UPDATE review_sessions SET correct_count = (SELECT COUNT(*) FROM review_answers WHERE session_id = ? AND correct = 1), finished = ? WHERE id = ?`)
    .run(session.id, done >= session.total ? 1 : 0, session.id);
  res.json({ correctCount, results });
}));

// 复习中编程题判出结果后调用
router.post('/review/sessions/:id/prog', asyncH(async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: '非法的 ID' });
  const session = db.get().prepare('SELECT * FROM review_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: '复习会话不存在' });
  const { wrongId, allPassed } = req.body || {};
  const passed = allPassed === true;
  const w = wrongbook.get(Number(wrongId));
  if (!w) return res.status(404).json({ error: '错题不存在' });
  const now = Date.now();
  db.get().prepare(`INSERT INTO review_answers(session_id, wrong_id, answer, correct) VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, wrong_id) DO UPDATE SET answer = excluded.answer, correct = excluded.correct`)
    .run(session.id, w.id, 'prog:' + (passed ? 'pass' : 'fail'), passed ? 1 : 0);
  const updated = passed ? wrongbook.recordRight(w.id, now) : wrongbook.recordWrong(w.exam_id, w.question_id, now);
  const done = db.get().prepare('SELECT COUNT(*) c FROM review_answers WHERE session_id = ?').get(session.id).c;
  db.get().prepare(`UPDATE review_sessions SET correct_count = (SELECT COUNT(*) FROM review_answers WHERE session_id = ? AND correct = 1), finished = ? WHERE id = ?`)
    .run(session.id, done >= session.total ? 1 : 0, session.id);
  res.json({ ok: true, newLevel: updated.level, newStatus: updated.status });
}));

// ---- 错题管理 ----
router.patch('/wrong/:id', asyncH(async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: '非法的 ID' });
  const w = wrongbook.get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: '错题不存在' });
  const b = req.body || {};
  if (b.note !== undefined || b.note_knowledge !== undefined) {
    wrongbook.setNote(w.id, b.note !== undefined ? b.note : w.note, b.note_knowledge !== undefined ? b.note_knowledge : w.note_knowledge);
  }
  if (b.status === 'mastered' || b.status === 'active') wrongbook.setStatus(w.id, b.status);
  res.json({ ok: true });
}));

router.delete('/wrong/:id', asyncH(async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: '非法的 ID' });
  const w = wrongbook.get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: '错题不存在' });
  wrongbook.remove(w.id);
  res.json({ ok: true });
}));

// ---- 配置 ----
const SETTING_KEYS = Object.keys(db.DEFAULT_SETTINGS);

router.get('/settings', asyncH(async (req, res) => {
  res.json({ settings: db.allSettings(), allowedKeys: SETTING_KEYS });
}));

router.post('/settings', asyncH(async (req, res) => {
  const b = req.body || {};
  let changed = 0;
  for (const k of SETTING_KEYS) {
    if (k in b && String(b[k]).trim() !== '') { db.setSetting(k, String(b[k]).trim()); changed++; }
  }
  res.json({ ok: true, changed });
}));

// ---- 题库重扫 ----
router.post('/questionbank/rescan', asyncH(async (req, res) => {
  const r = qb.scan(BANK_DIR);
  res.json({ loaded: r.loaded.length, failed: r.failed.length, failedFiles: r.failed.map(f => ({ file: f.file, errors: f.errors })) });
}));

module.exports = router;
module.exports.BANK_DIR = BANK_DIR;
