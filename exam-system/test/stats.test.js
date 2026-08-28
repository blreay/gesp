'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

test('stats: 概览 / 趋势 / 知识点正确率 / 级别分布', () => {
  const dir = tmpDir('exam-db-');
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  const d = db.get();
  const stats = require('../src/services/stats');
  const now = Date.now();

  d.prepare(`INSERT INTO exams(id, category, title, subtitle, file, duration_minutes, total_score, tags_json, loaded_at)
    VALUES ('e1', '分类甲', '试卷一', '', '/tmp/x.json', NULL, 100, '[]', ?)`).run(now);

  // 两次考试：80 分、60 分
  d.prepare(`INSERT INTO exam_attempts(exam_id, status, started_at, submitted_at, auto_submitted, score_choice, score_tf, score_prog, total_score)
    VALUES ('e1', 'graded', ?, ?, 0, 30, 10, 40, 80)`).run(now - 7200000, now - 3600000);
  d.prepare(`INSERT INTO exam_attempts(exam_id, status, started_at, submitted_at, auto_submitted, score_choice, score_tf, score_prog, total_score)
    VALUES ('e1', 'graded', ?, ?, 1, 20, 10, 30, 60)`).run(now - 1800000, now - 60000);

  // 错题：2 道活跃（1级、3级），1 道掌握
  d.prepare(`INSERT INTO wrong_questions(exam_id, question_id, level, status, note, note_knowledge, times_wrong, times_right, first_wrong_at, last_wrong_at)
    VALUES ('e1', 'q1', 1, 'active', '', '', 1, 0, ?, ?)`).run(now, now);
  d.prepare(`INSERT INTO wrong_questions(exam_id, question_id, level, status, note, note_knowledge, times_wrong, times_right, first_wrong_at, last_wrong_at)
    VALUES ('e1', 'q2', 3, 'active', '', '', 3, 0, ?, ?)`).run(now, now);
  d.prepare(`INSERT INTO wrong_questions(exam_id, question_id, level, status, note, note_knowledge, times_wrong, times_right, first_wrong_at, last_wrong_at)
    VALUES ('e1', 'q3', 1, 'mastered', '', '', 2, 2, ?, ?)`).run(now, now);

  // 提交：3 次，2 次编译成功，1 次全过
  for (let i = 0; i < 3; i++) {
    d.prepare(`INSERT INTO prog_submissions(exam_id, question_id, attempt_id, code, compile_ok, all_passed, result_summary, created_at)
      VALUES ('e1', 'prog1', NULL, 'x', ?, ?, 's', ?)`).run(i < 2 ? 1 : 0, i === 0 ? 1 : 0, now);
  }

  const ov = stats.overview();
  assert.strictEqual(ov.exams, 1);
  assert.strictEqual(ov.attempts, 2);
  assert.strictEqual(ov.avgScore, 70);
  assert.strictEqual(ov.maxScore, 80);
  assert.strictEqual(ov.activeWrong, 2);
  assert.strictEqual(ov.mastered, 1);
  assert.strictEqual(ov.submissions, 3);
  assert.strictEqual(ov.submissionPassRate, Math.round(1 / 3 * 100));

  const trend = stats.scoreTrend();
  assert.strictEqual(trend.length, 2);
  assert.strictEqual(trend[0].total_score, 80);

  const levels = stats.levelDistribution();
  assert.deepStrictEqual(levels.find(x => x.level === 3).count, 1);

  const prog = stats.progStats();
  assert.strictEqual(prog.total, 3);
  assert.strictEqual(prog.compiled, 2);
  assert.strictEqual(prog.passed, 1);
  db.close(); rmrf(dir);
});

test('stats: 知识点正确率（聚合考试作答）', () => {
  const dir = tmpDir('exam-db-');
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  const d = db.get();
  const stats = require('../src/services/stats');
  const qb = require('../src/services/questionbank');
  const fs = require('fs');

  // 用真实夹具试卷（含 knowledge 字段）
  const bank = tmpDir('exam-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', 'int main(){}');
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  qb.scan(bank);

  const now = Date.now();
  d.prepare(`INSERT INTO exam_attempts(exam_id, status, started_at, submitted_at, auto_submitted, total_score)
    VALUES ('test_paper_01', 'graded', ?, ?, 0, 20)`).run(now - 1000, now);
  d.prepare('INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (1, ?, ?)').run('q1', 'B');  // 对（知识点：基础）
  d.prepare('INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (1, ?, ?)').run('q2', 'A');  // 错（基础）
  d.prepare('INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (1, ?, ?)').run('q3', 'true'); // 对（无知识点字段 → 不计）

  const acc = stats.knowledgeAccuracy();
  const basic = acc.find(x => x.knowledge === '基础');
  assert.ok(basic);
  assert.strictEqual(basic.total, 2);
  assert.strictEqual(basic.correct, 1);
  assert.strictEqual(basic.accuracy, 50);
  db.close(); rmrf(dir); rmrf(bank);
});
