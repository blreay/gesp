'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function fixtureExam() {
  const obj = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8'));
  return obj;
}

test('gradeObjective: 全对', () => {
  const g = require('../src/services/grading');
  const r = g.gradeObjective(fixtureExam(), { q1: 'B', q2: 'B', q3: 'true' });
  assert.strictEqual(r.choiceScore, 40);
  assert.strictEqual(r.tfScore, 10);
  assert.deepStrictEqual(r.unanswered, []);
  assert.ok(r.results.every(x => x.correct));
  assert.strictEqual(r.results.find(x => x.qid === 'q1').score, 20);
});

test('gradeObjective: 错题与未答（未答跳过不计分）', () => {
  const g = require('../src/services/grading');
  const r = g.gradeObjective(fixtureExam(), { q1: 'A', q3: 'false' }); // q2 未答
  assert.strictEqual(r.choiceScore, 0);   // q1 错
  assert.strictEqual(r.tfScore, 0);       // q3 错
  assert.deepStrictEqual(r.unanswered, ['q2']);
  const q2 = r.results.find(x => x.qid === 'q2');
  assert.ok(q2.skipped && !q2.correct);
});

test('gradeAttempt: 编程题全过才得分', () => {
  const g = require('../src/services/grading');
  const exam = fixtureExam();

  let r = g.gradeAttempt(exam, { q1: 'B', q2: 'B', q3: 'true' }, { prog1: { allPassed: true } });
  assert.strictEqual(r.prog, 50);
  assert.strictEqual(r.total, 100);
  assert.strictEqual(r.full, 100);

  r = g.gradeAttempt(exam, { q1: 'B', q2: 'B', q3: 'true' }, { prog1: { allPassed: false } });
  assert.strictEqual(r.prog, 0);
  assert.strictEqual(r.total, 50);

  // 没有提交记录的编程题 = 0 分
  r = g.gradeAttempt(exam, { q1: 'B', q2: 'B', q3: 'true' }, {});
  assert.strictEqual(r.prog, 0);
});

test('gradeAttempt: tf 的字符串与布尔答案都能判', () => {
  const g = require('../src/services/grading');
  const r1 = g.gradeAttempt(fixtureExam(), { q1: 'B', q2: 'B', q3: true }, { prog1: { allPassed: true } });
  const r2 = g.gradeAttempt(fixtureExam(), { q1: 'B', q2: 'B', q3: 'true' }, { prog1: { allPassed: true } });
  assert.strictEqual(r1.total, 100);
  assert.strictEqual(r2.total, 100);
});

test('normalizeTf 边界', () => {
  const g = require('../src/services/grading');
  assert.strictEqual(g.normalizeTf(true), true);
  assert.strictEqual(g.normalizeTf('true'), true);
  assert.strictEqual(g.normalizeTf('TRUE'), true);
  assert.strictEqual(g.normalizeTf('A'), true);
  assert.strictEqual(g.normalizeTf(false), false);
  assert.strictEqual(g.normalizeTf('False'), false);
  assert.strictEqual(g.normalizeTf('B'), false);
  assert.strictEqual(g.normalizeTf(null), null);
  assert.strictEqual(g.normalizeTf(undefined), null);
  assert.strictEqual(g.normalizeTf('x'), null);
});
