'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

// 构建临时题库：注入真实 tester 源码
function setup() {
  const dir = tmpDir('exam-db-');
  const bank = tmpDir('exam-bank-');
  const catDir = path.join(bank, '测试分类');
  fs.mkdirSync(catDir, { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(catDir, '测试卷.exam.json'), raw);

  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  const qb = require('../src/services/questionbank');
  qb.scan(bank);
  return { db, dir, bank };
}

test('judge: AC / WA / 编译错误 三态 + 提交记录', async () => {
  const { db, dir, bank } = setup();
  const judge = require('../src/services/judge');
  const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', n), 'utf8');

  const ok = await judge.judge({ examId: 'test_paper_01', questionId: 'prog1', attemptId: null, code: fixture('ac.cpp') });
  assert.strictEqual(ok.status, 'ALL_PASS');
  assert.strictEqual(ok.allPassed, true);
  assert.ok(Array.isArray(ok.logs) && ok.logs.length >= 3);
  assert.ok(ok.logs.every(l => l.step && l.cmd && typeof l.output === 'string'));
  assert.ok(String(ok.reason).includes('通过'));

  const bad = await judge.judge({ examId: 'test_paper_01', questionId: 'prog1', attemptId: null, code: fixture('wa.cpp') });
  assert.strictEqual(bad.status, 'PARTIAL_PASS');
  assert.ok(bad.detail.includes('失败'));   // tester 打印了失败用例表格

  const ce = await judge.judge({ examId: 'test_paper_01', questionId: 'prog1', attemptId: null, code: fixture('ce.cpp') });
  assert.strictEqual(ce.status, 'COMPILE_ERROR');
  assert.ok(ce.detail.length > 0);
  assert.ok(ce.logs.length >= 1 && String(ce.reason).includes('编译失败'));

  const rows = db.get().prepare('SELECT * FROM prog_submissions ORDER BY id').all();
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].all_passed, 1);
  assert.strictEqual(rows[1].all_passed, 0);
  assert.strictEqual(rows[2].compile_ok, 0);
  db.close(); rmrf(dir); rmrf(bank);
});

test('judge: 死循环 → RUNTIME_ERROR', async () => {
  const { db, dir, bank } = setup();
  db.setSetting('judge_run_timeout_sec', 2);
  const judge = require('../src/services/judge');
  const code = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'tle.cpp'), 'utf8');
  const r = await judge.judge({ examId: 'test_paper_01', questionId: 'prog1', attemptId: null, code });
  assert.strictEqual(r.status, 'RUNTIME_ERROR');
  db.close(); rmrf(dir); rmrf(bank);
});

test('judge: 带 attemptId 时同步 exam_answers', async () => {
  const { db, dir, bank } = setup();
  const judge = require('../src/services/judge');
  db.get().prepare(`INSERT INTO exam_attempts(exam_id, status, started_at) VALUES ('test_paper_01', 'in_progress', ?)`).run(Date.now());
  const code = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'ac.cpp'), 'utf8');
  const r = await judge.judge({ examId: 'test_paper_01', questionId: 'prog1', attemptId: 1, code });
  const ans = db.get().prepare('SELECT answer FROM exam_answers WHERE attempt_id = 1 AND question_id = ?').get('prog1');
  assert.strictEqual(ans.answer, String(r.submissionId));
  db.close(); rmrf(dir); rmrf(bank);
});
