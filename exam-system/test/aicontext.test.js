'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

function setup() {
  const dir = tmpDir('aictx-db-');
  const bank = tmpDir('aictx-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  return { db, dir, bank };
}

test('aicontext: buildMessage 用配置的系统提示词并含题目/正确答案', () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aictx = require('../src/services/aicontext');
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  const w = wb.getByQuestion('test_paper_01', 'q1');
  const r = aictx.buildMessage(w.id);
  assert.ok(!r.error, '不应出错');
  assert.ok(r.message.startsWith(db.getSetting('ai_system_prompt')));
  assert.ok(r.message.includes('【题目】'));
  assert.ok(r.message.includes('正确答案：B'));
  db.close(); rmrf(dir); rmrf(bank);
});

test('aicontext: 自定义系统提示词生效；空值回退默认', () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aictx = require('../src/services/aicontext');
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  const w = wb.getByQuestion('test_paper_01', 'q1');
  db.setSetting('ai_system_prompt', '自定义提示词');
  assert.ok(aictx.buildMessage(w.id).message.startsWith('自定义提示词'));
  db.setSetting('ai_system_prompt', '   ');   // 空白 → 回退默认
  assert.ok(aictx.buildMessage(w.id).message.startsWith(aictx.DEFAULT_AI_PROMPT));
  db.close(); rmrf(dir); rmrf(bank);
});

test('aicontext: 不存在的错题返回 error', () => {
  const { db, dir, bank } = setup();
  const aictx = require('../src/services/aicontext');
  assert.strictEqual(aictx.buildMessage(99999).error, '错题不存在');
  db.close(); rmrf(dir); rmrf(bank);
});
