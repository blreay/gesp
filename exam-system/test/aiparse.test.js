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

async function waitIdle(timeoutMs) {
  const aiparse = require('../src/services/aiparse');
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 5000)) {
    if (!aiparse.status().active) return;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('aiparse 未在时限内空闲');
}

test('aiparse: 空备注错题被解析并写入备注，计数到位', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  aiparse._setAiCall(async () => 'AI生成的解析');
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  wb.recordWrong('test_paper_01', 'q2', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  const w2 = wb.getByQuestion('test_paper_01', 'q2');
  aiparse.enqueue([w1.id, w2.id]);
  await waitIdle();
  const st = aiparse.status();
  assert.strictEqual(st.active, false);
  assert.strictEqual(st.total, 2);
  assert.strictEqual(st.done, 2);
  assert.strictEqual(st.failed, 0);
  assert.strictEqual(wb.get(w1.id).note, '---\n【AI解析】\nAI生成的解析');
  assert.strictEqual(wb.get(w2.id).note, '---\n【AI解析】\nAI生成的解析');
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});

test('aiparse: 备注非空的错题被跳过、不改动', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  let called = 0;
  aiparse._setAiCall(async () => { called++; return 'x'; });
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  wb.setNote(w1.id, '已有备注', '');
  aiparse.enqueue([w1.id]);
  await waitIdle();
  assert.strictEqual(called, 0);
  assert.strictEqual(wb.get(w1.id).note, '已有备注');
  assert.strictEqual(aiparse.status().done, 1);
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});

test('aiparse: 并发数受 ai_parse_concurrency 限制', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  db.setSetting('ai_parse_concurrency', '2');
  let cur = 0, maxSeen = 0;
  aiparse._setAiCall(async () => {
    cur++; maxSeen = Math.max(maxSeen, cur);
    await new Promise(r => setTimeout(r, 40));
    cur--; return 'x';
  });
  for (const qid of ['q1', 'q2', 'q3', 'q1', 'q2']) wb.recordWrong('test_paper_01', qid, Date.now());
  const ids = ['q1', 'q2', 'q3'].map(qid => wb.getByQuestion('test_paper_01', qid).id);
  aiparse.enqueue(ids);
  await waitIdle();
  assert.strictEqual(maxSeen, 2, '同时在跑不应超过 2');
  assert.strictEqual(aiparse.status().done, 3);
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});

test('aiparse: AI 抛错计失败、备注保持空、不中断后续', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  let n = 0;
  aiparse._setAiCall(async () => { n++; if (n === 1) throw new Error('boom'); return 'ok'; });
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  wb.recordWrong('test_paper_01', 'q2', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  const w2 = wb.getByQuestion('test_paper_01', 'q2');
  db.setSetting('ai_parse_concurrency', '1');
  aiparse.enqueue([w1.id, w2.id]);
  await waitIdle();
  const st = aiparse.status();
  assert.strictEqual(st.failed, 1);
  assert.strictEqual(st.done, 2);
  assert.strictEqual(wb.get(w1.id).note, '');
  assert.strictEqual(wb.get(w2.id).note, '---\n【AI解析】\nok');
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});

test('aiparse: abort 中止在途与队列，已写备注保留', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  db.setSetting('ai_parse_concurrency', '1');
  let started = 0;
  aiparse._setAiCall(async (m, signal) => {
    started++;
    await new Promise((res, rej) => {
      const t = setTimeout(res, 4000);
      signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); });
    });
    return 'x';
  });
  const ids = [];
  for (const qid of ['q1', 'q2', 'q3']) { wb.recordWrong('test_paper_01', qid, Date.now()); ids.push(wb.getByQuestion('test_paper_01', qid).id); }
  aiparse.enqueue(ids);
  await new Promise(r => setTimeout(r, 60));   // 等第一个开跑
  aiparse.abort();
  await waitIdle();
  const st = aiparse.status();
  assert.strictEqual(st.active, false);
  assert.strictEqual(started, 1, '只有第一个任务开始');
  assert.strictEqual(st.failed, 0, '用户中止不计失败');
  assert.strictEqual(wb.get(ids[0]).note, '');
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});

test('aiparse: 系统提示词随配置生效', async () => {
  const { db, dir, bank } = setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  db.setSetting('ai_system_prompt', 'CUSTOM_PROMPT');
  let captured = null;
  aiparse._setAiCall(async (messages) => { captured = messages; return 'x'; });
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  aiparse.enqueue([w1.id]);
  await waitIdle();
  assert.ok(captured && captured[0].content.startsWith('CUSTOM_PROMPT'));
  aiparse._resetAiCall();
  db.close(); rmrf(dir); rmrf(bank);
});
