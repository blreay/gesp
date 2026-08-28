'use strict';
const fs = require('fs');
const path = require('path');
const db = require('./db');

const QUESTION_TYPES = new Set(['choice', 'tf', 'programming']);
let _cache = new Map();       // examId -> 解析后的试卷对象
let _health = { loaded: [], failed: [], scannedAt: null };

function validateExam(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['内容不是合法 JSON 对象'];
  const exam = obj.exam || {};
  if (!exam.id || typeof exam.id !== 'string') errors.push('exam.id 缺失');
  if (!exam.title) errors.push('exam.title 缺失');
  if (exam.total_score !== undefined && !Number.isFinite(exam.total_score)) errors.push('exam.total_score 必须是数字');
  if (exam.duration_minutes !== undefined && (!Number.isFinite(exam.duration_minutes) || exam.duration_minutes <= 0)) errors.push('exam.duration_minutes 必须是正数');
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    errors.push('sections 必须是非空数组');
    return errors;
  }
  const qids = new Set();
  let computed = 0;
  obj.sections.forEach((sec, si) => {
    const sw = `sections[${si}]`;
    if (!sec.title) errors.push(`${sw}.title 缺失`);
    if (!QUESTION_TYPES.has(sec.question_type)) errors.push(`${sw}.question_type 非法: ${sec.question_type}`);
    if (!Number.isFinite(sec.score_per_question) || sec.score_per_question <= 0) errors.push(`${sw}.score_per_question 非法`);
    if (!Array.isArray(sec.questions) || sec.questions.length === 0) { errors.push(`${sw}.questions 为空`); return; }
    computed += sec.score_per_question * sec.questions.length;
    sec.questions.forEach((q, qi) => {
      const where = `${sw}.questions[${qi}](${q.id || '?'})`;
      if (!q.id) { errors.push(`${where} 缺少 id`); return; }
      if (qids.has(q.id)) errors.push(`${where} id 重复`);
      qids.add(q.id);
      if (!QUESTION_TYPES.has(q.type)) errors.push(`${where}.type 非法`);
      if (!q.stem) errors.push(`${where}.stem 缺失`);
      if (q.knowledge && !Array.isArray(q.knowledge)) errors.push(`${where}.knowledge 必须是数组`);
      if (q.type === 'choice') {
        if (!q.options || typeof q.options !== 'object' || Object.keys(q.options).length < 2) errors.push(`${where}.options 至少 2 项`);
        if (!q.answer || !(q.answer in (q.options || {}))) errors.push(`${where}.answer 必须是选项之一`);
      } else if (q.type === 'tf') {
        if (typeof q.answer !== 'boolean') errors.push(`${where}.answer 必须是布尔值`);
      } else if (q.type === 'programming') {
        const a = q.answer || {};
        if (!a.test_program) errors.push(`${where}.answer.test_program 缺失`);
        if (!Array.isArray(q.samples) || q.samples.length === 0) errors.push(`${where}.samples 至少 1 组`);
      }
    });
  });
  if (Number.isFinite(exam.total_score) && exam.total_score !== computed) {
    errors.push(`exam.total_score(${exam.total_score}) 不等于各题分值之和(${computed})`);
  }
  return errors;
}

function loadFile(file) {
  let obj = null;
  try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { obj: null, errors: ['JSON 解析失败: ' + e.message] }; }
  const errors = validateExam(obj);
  return { obj: errors.length ? null : obj, errors };
}

// 扫描题库目录：一级子目录 = 分类；*.exam.json = 试卷
function scan(bankDir) {
  const d = db.get();
  d.prepare('DELETE FROM exams').run();
  _cache = new Map();
  const loaded = [], failed = [];
  const upsert = d.prepare(`INSERT OR REPLACE INTO exams
    (id, category, title, subtitle, file, duration_minutes, total_score, tags_json, loaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const secSum = (o) => o.sections.reduce((s, sec) => s + sec.score_per_question * sec.questions.length, 0);

  if (fs.existsSync(bankDir)) {
    for (const cat of fs.readdirSync(bankDir).sort()) {
      const catPath = path.join(bankDir, cat);
      if (!fs.statSync(catPath).isDirectory()) continue;
      for (const f of fs.readdirSync(catPath).sort()) {
        if (!f.endsWith('.exam.json')) continue;
        const file = path.join(catPath, f);
        const { obj, errors } = loadFile(file);
        if (!obj) { failed.push({ file, errors }); continue; }
        const exam = obj.exam;
        const category = exam.category || cat;
        const totalScore = Number.isFinite(exam.total_score) ? exam.total_score : secSum(obj);
        upsert.run(exam.id, category, exam.title, exam.subtitle || '', file,
          Number.isFinite(exam.duration_minutes) ? exam.duration_minutes : null,
          totalScore, JSON.stringify(exam.tags || []), Date.now());
        _cache.set(exam.id, obj);
        loaded.push({ id: exam.id, category, title: exam.title, file });
      }
    }
  }
  _health = { loaded, failed, scannedAt: Date.now(), bankDir };
  return { loaded, failed };
}

/** Returns the cached exam object (shared reference) — callers must NOT mutate it. */
function getExam(examId) {
  if (_cache.has(examId)) return _cache.get(examId);
  const row = db.get().prepare('SELECT file FROM exams WHERE id = ?').get(examId);
  if (!row || !fs.existsSync(row.file)) return null;
  const { obj } = loadFile(row.file);
  if (obj) _cache.set(examId, obj);
  return obj;
}

// 返回 { section, question, sectionIdx } 或 null
function getQuestion(examId, questionId) {
  const exam = getExam(examId);
  if (!exam) return null;
  for (let i = 0; i < exam.sections.length; i++) {
    const sec = exam.sections[i];
    const q = (sec.questions || []).find(x => x.id === questionId);
    if (q) return { section: sec, question: q, sectionIdx: i };
  }
  return null;
}

function listExams() {
  return db.get().prepare('SELECT * FROM exams ORDER BY category, id').all();
}

function health() { return _health; }

module.exports = { validateExam, loadFile, scan, getExam, getQuestion, listExams, health };
