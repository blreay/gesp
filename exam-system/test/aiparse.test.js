'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

const BANK_FIXTURE = path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json');
const TESTER = path.join(__dirname, 'fixtures', 'cpp', 'tester.cpp');

// 与 api.test.js 一致：建临时库 + 扫描替换过占位符的夹具题库
function setup() {
  const dir = tmpDir('aiparse-db-');
  const bank = tmpDir('aiparse-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(BANK_FIXTURE, 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(fs.readFileSync(TESTER, 'utf8')).slice(1, -1));
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  return { db, dir, bank };
}

test('aiparse 配置: 新增 3 个键且默认值正确', () => {
  const { db, dir, bank } = setup();
  assert.strictEqual(db.getSetting('ai_auto_parse'), '0');
  assert.strictEqual(db.getSetting('ai_parse_concurrency'), '4');
  assert.ok(String(db.getSetting('ai_system_prompt')).includes('这是考试错误的一个C++考试题'));
  assert.ok(String(db.getSetting('ai_system_prompt')).includes('尽量精简回答'));
  db.close(); rmrf(dir); rmrf(bank);
});
