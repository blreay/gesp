'use strict';
const express = require('express');
const router = express.Router();
const db = require('../services/db');
const qb = require('../services/questionbank');
const countdown = require('../services/countdown');
const statsService = require('../services/stats');
const examlog = require('../services/examlog');
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

// 角色视图过滤：普通用户拿不到参考答案（前端"正确答案"展示依赖这些数据，剥掉即自然不显示）。
// 客观题删 answer；编程题删参考代码/测试程序/题解（样例输入输出保留，属于题面）。
// 例外：编程题页（renderProg）的【题解信息】栏对所有登录用户可见，该页不走此剥离。
function stripQuestionForRole(q, user) {
  if (user && user.role === 'admin') return q;
  const copy = JSON.parse(JSON.stringify(q));
  delete copy.explanation; // 解析会透露正确答案，一并不下发
  if (copy.type === 'programming') {
    if (copy.answer) {
      delete copy.answer.reference_code;
      delete copy.answer.test_program;
      delete copy.answer.solution;
    }
  } else {
    delete copy.answer;
  }
  return copy;
}
function stripExamForRole(exam, user) {
  if (user && user.role === 'admin') return exam;
  const copy = JSON.parse(JSON.stringify(exam));
  for (const sec of copy.sections) {
    sec.questions = (sec.questions || []).map(q => stripQuestionForRole(q, user));
  }
  return copy;
}

// ---- 登录页 ----
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  const next = req.query.next && String(req.query.next).startsWith('/') ? String(req.query.next) : '/';
  res.render('login', { title: '登录', next });
});

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
    exam: stripExamForRole(exam, req.user), meta, page, mode, totalQuestions, renderStem
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
    // 只看本次 attempt 的提交，避免多用户/多次考试之间互相泄露代码
    if (att) {
      page.submissions = d.prepare('SELECT * FROM prog_submissions WHERE exam_id = ? AND question_id = ? AND attempt_id = ? ORDER BY id DESC LIMIT 100').all(examId, qid, att.id);
    } else {
      page.submissions = [];
    }
  } else {
    page.sessionId = req.query.session ? Number(req.query.session) : null;
    page.wrongId = req.query.wrong ? Number(req.query.wrong) : null;
    page.submissions = d.prepare('SELECT * FROM prog_submissions WHERE exam_id = ? AND question_id = ? ORDER BY id DESC LIMIT 50').all(examId, qid);
  }
  if (page.submissions.length) page.initialCode = page.submissions[0].code;
  // 【题解信息】栏（题解/参考代码/测试程序）对所有登录用户可见：编程题学习需要看题解。
  // 因此这里下发完整题目，不走 stripQuestionForRole（考试页/复习页的剥离逻辑不变）。
  res.render('prog', {
    title: hit.question.title, activeNav: 'exam',
    extraCss: ['/css/prog.css'], extraJs: ['/js/common.js', '/js/prog.js'],
    exam: stripExamForRole(exam, req.user), meta, question: hit.question,
    canSeeSolution: true, page, renderStem,
    backHref: mode === 'exam' ? '/exam/' + examId : '/review' + (page.sessionId ? '/session/' + page.sessionId : '')
  });
}

router.get('/editor-frame', (req, res) => res.render('editor_frame'));

router.get('/exam/:examId/prog/:qid', (req, res) => renderProg(req, res, 'exam'));
router.get('/prog/practice/:examId/:qid', (req, res) => renderProg(req, res, 'practice'));

// ---- 试卷提交历史（做题人/时间/分数/快照）：所有登录用户可见 ----
const examhistory = require('../services/examhistory');
function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

router.get('/exam/:id/history', (req, res) => {
  const meta = db.get().prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!meta) return res.status(404).send('试卷不存在');
  res.render('exam_history', {
    title: '历史记录 · ' + meta.title, activeNav: 'exam',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js'],
    meta, rows: examhistory.listForExam(req.params.id), fmtTs
  });
});

router.get('/exam/:id/history/:hid', (req, res) => {
  if (!Number.isInteger(Number(req.params.hid))) return res.status(404).send('记录不存在');
  const rec = examhistory.get(Number(req.params.hid));
  if (!rec || rec.exam_id !== req.params.id) return res.status(404).send('记录不存在');
  const snap = rec.snapshot || {};
  res.render('history_snapshot', {
    title: '答卷快照 · ' + rec.exam_title, activeNav: 'exam',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js'],
    rec, snap, results: new Map((snap.results || []).map(r => [r.qid, r])), fmtTs, renderStem
  });
});

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
    let type = 'unknown', stem = '（题目已不存在于题库）', options = null;
    if (hit) {
      type = hit.question.type;
      // 完整题干（含代码围栏），由模板经 renderStem 渲染为 <pre>/<code>，与考试页一致
      stem = String(hit.question.stem || hit.question.title || '');
      options = hit.question.type === 'choice' ? hit.question.options : null;
    }
    return { ...w, type, stem, options };
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
    const enriched = { ...it, question: stripQuestionForRole(hit.question, req.user) };
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
    prog: statsService.progStats(),
    examLog: examlog.list()
  };
  res.render('stats', {
    title: '数据统计', activeNav: 'stats',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js', '/vendor/chart.umd.js', '/js/stats.js'],
    data, o: data.overview
  });
});

router.get('/ai', (req, res) => {
  const settings = db.allSettings();
  res.render('ai', {
    title: 'AI问答', activeNav: 'ai',
    extraCss: ['/css/app.css'], extraJs: ['/js/common.js'],
    webuiUrl: settings.ai_webui_url
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
