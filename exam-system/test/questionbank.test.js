'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

function freshBankFixture() {
  // 把夹具复制到临时目录，并注入真实的测试程序源码
  const bank = tmpDir('exam-bank-');
  const catDir = path.join(bank, '测试分类');
  fs.mkdirSync(catDir, { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(catDir, '测试卷.exam.json'), raw);
  return bank;
}

test('validateExam: 合法试卷无错误', () => {
  const qb = require('../src/services/questionbank');
  const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8'));
  obj.sections[2].questions[0].answer.test_program = 'int main(){}';
  assert.deepStrictEqual(qb.validateExam(obj), []);
});

test('validateExam: 各类非法情况都能报出', () => {
  const qb = require('../src/services/questionbank');
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8'));
  base.sections[2].questions[0].answer.test_program = 'x';

  let bad = JSON.parse(JSON.stringify(base));
  delete bad.exam.id;
  assert.ok(qb.validateExam(bad).some(e => e.includes('exam.id')));

  bad = JSON.parse(JSON.stringify(base));
  bad.sections[0].questions[0].answer = 'Z';
  assert.ok(qb.validateExam(bad).some(e => e.includes('answer 必须是选项之一')));

  bad = JSON.parse(JSON.stringify(base));
  bad.sections[1].questions[0].answer = 'true';
  assert.ok(qb.validateExam(bad).some(e => e.includes('布尔')));

  bad = JSON.parse(JSON.stringify(base));
  delete bad.sections[2].questions[0].answer.test_program;
  assert.ok(qb.validateExam(bad).some(e => e.includes('test_program')));

  bad = JSON.parse(JSON.stringify(base));
  bad.exam.total_score = 999;
  assert.ok(qb.validateExam(bad).some(e => e.includes('不等于')));
});

test('scan: 加载合法试卷、隔离坏文件、可取卷取题', () => {
  const db = require('../src/services/db');
  const qb = require('../src/services/questionbank');
  const dir = tmpDir('exam-db-');
  db.init(path.join(dir, 't.db'));

  const bank = freshBankFixture();
  // 追加一个坏文件
  fs.writeFileSync(path.join(bank, '测试分类', '坏卷.exam.json'), '{ 不是合法 JSON');

  const r = qb.scan(bank);
  assert.strictEqual(r.loaded.length, 1);
  assert.strictEqual(r.failed.length, 1);
  assert.ok(r.failed[0].file.includes('坏卷'));

  const exam = qb.getExam('test_paper_01');
  assert.strictEqual(exam.exam.title, '测试卷');
  assert.strictEqual(qb.getExam('test_paper_01').sections.length, 3);

  const hit = qb.getQuestion('test_paper_01', 'prog1');
  assert.strictEqual(hit.question.title, '两数之和');
  assert.strictEqual(hit.section.question_type, 'programming');
  assert.strictEqual(qb.getQuestion('test_paper_01', 'nope'), null);

  const list = qb.listExams();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].category, '测试分类');

  const health = qb.health();
  assert.strictEqual(health.loaded.length, 1);
  db.close(); rmrf(dir); rmrf(bank);
});

test('scan: 缺失 total_score 时自动求和兜底', () => {
  const db = require('../src/services/db');
  const qb = require('../src/services/questionbank');
  const dir = tmpDir('exam-db-');
  db.init(path.join(dir, 't.db'));

  // 构造一份没有 total_score 的试卷
  const bank = tmpDir('exam-bank-nots-');
  const catDir = path.join(bank, '测试分类');
  fs.mkdirSync(catDir, { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  const obj = JSON.parse(raw);
  delete obj.exam.total_score;
  fs.writeFileSync(path.join(catDir, '测试卷.exam.json'), JSON.stringify(obj));

  const r = qb.scan(bank);
  assert.strictEqual(r.loaded.length, 1);
  const list = qb.listExams();
  assert.strictEqual(list[0].total_score, 100);

  db.close(); rmrf(dir); rmrf(bank);
});
