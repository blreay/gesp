'use strict';
const express = require('express');
const router = express.Router();
const db = require('../services/db');
const qb = require('../services/questionbank');
const countdown = require('../services/countdown');
const statsService = require('../services/stats');
const sessions = require('../services/examsessions');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// 题干渲染：``` 围栏 → <pre>；行内 `code` → <code>；其余转义后换行转 <br>
function renderStem(stem) {
  const parts = String(stem || '').split('```');
  return parts.map((p, i) => i % 2 === 1
    ? '<pre>' + esc(p.replace(/^\n/, '').replace(/\n$/, '')) + '</pre>'
    : esc(p).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>')).join('');
}
router.renderStem = renderStem;

router.get('/', (req, res) => {
  const s = db.allSettings();
  const exams = qb.listExams();
  const d = db.get();
  const latest = new Map();
  for (const r of d.prepare(`SELECT a.* FROM exam_attempts a
      JOIN (SELECT exam_id, MAX(id) mid FROM exam_attempts GROUP BY exam_id) m ON a.id = m.mid`).all()) {
    latest.set(r.exam_id, r);
  }
  const now = Date.now();
  const briefMap = new Map();
  for (const e of exams) {
    const x = qb.getExam(e.id);
    if (x && x.exam && x.exam.prog_brief) briefMap.set(e.id, x.exam.prog_brief);
  }
  const byCategory = new Map();
  exams.forEach((e, idx) => {
    const durMs = countdown.durationMs({ duration_minutes: e.duration_minutes }, s);
    const att = latest.get(e.id);
    let state = { status: 'not_started' };
    if (att && att.status === 'graded') state = { status: 'graded', score: att.total_score };
    else if (att && att.status === 'in_progress') {
      const remain = countdown.remainingMs(att, durMs, now);
      if (remain > 0) state = { status: 'in_progress', deadlineAt: countdown.deadlineAt(att, durMs) };
      else state = { status: 'timeup', deadlineAt: countdown.deadlineAt(att, durMs) };
    }
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category).push({ ...e, num: String(byCategory.get(e.category).length + 1).padStart(2, '0'), state, prog_brief: briefMap.get(e.id) || '' });
  });
  const grouped = [...byCategory.entries()].map(([category, list]) => ({ category, exams: list }));
  const overview = statsService.overview();
  let questionCount = 0;
  for (const e of exams) {
    const x = qb.getExam(e.id);
    if (x) questionCount += x.sections.reduce((n, sec) => n + sec.questions.length, 0);
  }
  res.render('index', {
    title: '模拟考试', activeNav: 'exam',
    extraCss: ['/css/home.css'], extraJs: ['/js/common.js', '/js/home.js'],
    grouped, categories: grouped.map(g => g.category), stats: overview, questionCount
  });
});

router.get('/exam/:id', (req, res) => {
  const exam = qb.getExam(req.params.id);
  if (!exam) return res.status(404).send('试卷不存在');
  const meta = db.get().prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  const s = db.allSettings();
  const durMs = countdown.durationMs(exam.exam, s);
  const att = sessions.latestAttempt(req.params.id);
  const now = Date.now();
  let mode = 'fresh', page = {
    examId: req.params.id, mode: 'fresh', attemptId: null, deadlineAt: null,
    durationMs: durMs, savedAnswers: {}, lastGrade: null, progStatus: {},
    remind: { beforeMs: parseInt(s.remind_before_minutes, 10) * 60000, intervalMs: parseInt(s.remind_interval_minutes, 10) * 60000 }
  };
  if (att && att.status === 'in_progress') {
    mode = countdown.remainingMs(att, durMs, now) > 0 ? 'resume' : 'timeup';
    page = { ...page, mode, attemptId: att.id, deadlineAt: countdown.deadlineAt(att, durMs), savedAnswers: sessions.answersOf(att.id), progStatus: sessions.progVerdicts(req.params.id, att.id) };
  } else if (att && att.status === 'graded') {
    mode = 'graded';
    // 讲评态也要展示编程题的最终判定（来自该 attempt 的提交记录），否则显示"尚未提交"
    page = { ...page, mode: 'graded', attemptId: att.id, deadlineAt: countdown.deadlineAt(att, durMs), savedAnswers: sessions.answersOf(att.id), lastGrade: sessions.makeGradePayload(exam, att), autoSubmitted: !!att.auto_submitted, progStatus: sessions.progVerdicts(req.params.id, att.id) };
  }
  const totalQuestions = exam.sections.reduce((n, sec) => n + sec.questions.length, 0);
  res.render('exam', {
    title: exam.exam.title, activeNav: 'exam',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/js/exam.js'],
    exam, meta, page, mode, totalQuestions, renderStem
  });
});

function renderProg(req, res, mode) {
  const examId = req.params.examId;
  const qid = req.params.qid;
  const exam = qb.getExam(examId);
  if (!exam) return res.status(404).send('试卷不存在');
  const hit = qb.getQuestion(examId, qid);
  if (!hit || hit.question.type !== 'programming') return res.status(404).send('编程题不存在');
  const meta = db.get().prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  const s = db.allSettings();
  const page = { mode, examId, qid, attemptId: null, deadlineAt: null, sessionId: null, wrongId: null, submissions: [], initialCode: '' };
  const d = db.get();
  if (mode === 'exam') {
    const att = sessions.latestAttempt(examId);
    if (att && att.status === 'in_progress') {
      page.attemptId = att.id;
      const durMs = countdown.durationMs(exam.exam, s);
      page.deadlineAt = countdown.deadlineAt(att, durMs);
    }
    page.submissions = d.prepare('SELECT * FROM prog_submissions WHERE exam_id = ? AND question_id = ? ORDER BY id DESC LIMIT 100').all(examId, qid);
  } else {
    page.sessionId = req.query.session ? Number(req.query.session) : null;
    page.wrongId = req.query.wrong ? Number(req.query.wrong) : null;
    page.submissions = d.prepare('SELECT * FROM prog_submissions WHERE exam_id = ? AND question_id = ? ORDER BY id DESC LIMIT 50').all(examId, qid);
  }
  if (page.submissions.length) page.initialCode = page.submissions[0].code;
  res.render('prog', {
    title: hit.question.title, activeNav: 'exam',
    extraCss: ['/css/prog.css'], extraJs: ['/js/common.js', '/js/prog.js'],
    exam, meta, question: hit.question, page, renderStem,
    backHref: mode === 'exam' ? '/exam/' + examId : '/review' + (page.sessionId ? '/session/' + page.sessionId : '')
  });
}

router.get('/editor-frame', (req, res) => res.render('editor_frame'));

router.get('/exam/:examId/prog/:qid', (req, res) => renderProg(req, res, 'exam'));
router.get('/prog/practice/:examId/:qid', (req, res) => renderProg(req, res, 'practice'));

const wrongbook = require('../services/wrongbook');

router.get('/review', (req, res) => {
  const filter = {
    level: req.query.level || 'all',
    status: req.query.status || 'active',
    category: req.query.category || '',
    keyword: req.query.keyword || '',
    type: req.query.type || 'all'
  };
  let rows = wrongbook.list(filter).map(w => {
    const hit = qb.getQuestion(w.exam_id, w.question_id);
    let type = 'unknown', excerpt = '（题目已不存在于题库）', options = null;
    if (hit) {
      type = hit.question.type;
      excerpt = String(hit.question.stem || hit.question.title || '').replace(/```[\s\S]*?```/g, '[代码]').split('\n')[0].slice(0, 90);
      options = hit.question.type === 'choice' ? hit.question.options : null;
    }
    return { ...w, type, excerpt, options };
  });
  if (filter.type !== 'all') rows = rows.filter(w => w.type === filter.type);
  const categories = [...new Set(qb.listExams().map(e => e.category))];
  res.render('review', {
    title: '错题复习', activeNav: 'review',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/js/review.js'],
    rows, filter, categories, renderStem
  });
});

router.get('/review/session/:id', (req, res) => {
  const d = db.get();
  const session = d.prepare('SELECT * FROM review_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).send('复习会话不存在');
  const items = d.prepare(`SELECT rsi.wrong_id, w.exam_id, w.question_id, w.level, w.status AS w_status,
      e.title AS exam_title FROM review_session_items rsi
    JOIN wrong_questions w ON w.id = rsi.wrong_id
    LEFT JOIN exams e ON e.id = w.exam_id
    WHERE rsi.session_id = ?`).all(session.id);
  const objective = [], prog = [];
  for (const it of items) {
    const hit = qb.getQuestion(it.exam_id, it.question_id);
    if (!hit) continue;
    const enriched = { ...it, question: hit.question };
    if (hit.question.type === 'programming') prog.push(enriched);
    else objective.push(enriched);
  }
  res.render('review_session', {
    title: '错题练习', activeNav: 'review',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/js/session.js'],
    session, objective, prog, renderStem
  });
});

router.get('/stats', (req, res) => {
  const data = {
    overview: statsService.overview(),
    trend: statsService.scoreTrend(),
    knowledge: statsService.knowledgeAccuracy(),
    types: statsService.typeBreakdown(),
    levels: statsService.levelDistribution(),
    prog: statsService.progStats()
  };
  res.render('stats', {
    title: '数据统计', activeNav: 'stats',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/vendor/chart.umd.js', '/js/stats.js'],
    data, o: data.overview
  });
});

router.get('/settings', (req, res) => {
  res.render('settings', {
    title: '系统配置', activeNav: 'settings',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/js/settings.js'],
    settings: db.allSettings(), health: qb.health(), examRows: qb.listExams()
  });
});

module.exports = router;
