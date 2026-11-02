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

function fillFixtureExam() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '填空测试卷.exam.json'), 'utf8'));
}

test('normalizeFill/matchFill: 归一化、多可接受答案与大小写敏感', () => {
  const g = require('../src/services/grading');
  // 去首尾空白、折叠连续空白、全角→半角
  assert.strictEqual(g.normalizeFill('  E5  '), 'E5');
  assert.strictEqual(g.normalizeFill('2,   1'), '2, 1');
  assert.strictEqual(g.normalizeFill('Ｅ５'), 'E5');
  assert.strictEqual(g.normalizeFill('２，１'), '2,1');
  // 单个字符串答案
  assert.strictEqual(g.matchFill('1101', '1101'), true);
  assert.strictEqual(g.matchFill(' 1101 ', '1101'), true);
  assert.strictEqual(g.matchFill('1102', '1101'), false);
  // 可接受答案数组
  assert.strictEqual(g.matchFill('e5', ['E5', 'e5']), true);
  assert.strictEqual(g.matchFill('E6', ['E5', 'e5']), false);
  // 大小写敏感：answer 未列小写变体时不匹配
  assert.strictEqual(g.matchFill('e5', 'E5'), false);
  // 空/纯空白一律不判对
  assert.strictEqual(g.matchFill('', 'x'), false);
  assert.strictEqual(g.matchFill('   ', 'x'), false);
  assert.strictEqual(g.matchFill('　', ['x']), false);
});

test('gradeObjective: 填空题按 fill 桶计分，空串视为未答', () => {
  const g = require('../src/services/grading');
  const r = g.gradeObjective(fillFixtureExam(), { f1: '1101', f2: ' ｅ５ ', f3: '' });
  assert.strictEqual(r.fillScore, 2);
  assert.strictEqual(r.fillFull, 3);
  assert.strictEqual(r.choiceScore, 0);
  assert.strictEqual(r.tfScore, 0);
  assert.deepStrictEqual(r.unanswered, ['f3']);
  assert.ok(r.results.find(x => x.qid === 'f2').correct);
  assert.ok(r.results.find(x => x.qid === 'f3').skipped);
});

test('gradeAttempt: 填空题计入总分', () => {
  const g = require('../src/services/grading');
  const r = g.gradeAttempt(fillFixtureExam(), { f1: '1101', f2: 'E5', f3: '2,1' }, {});
  assert.strictEqual(r.fill, 3);
  assert.strictEqual(r.fillFull, 3);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.full, 3);
  const r2 = g.gradeAttempt(fillFixtureExam(), { f1: '0000' }, {});
  assert.strictEqual(r2.fill, 0);
  assert.strictEqual(r2.total, 0);
  assert.deepStrictEqual(r2.unanswered, ['f2', 'f3']);
});
