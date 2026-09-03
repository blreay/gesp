# AI 解析后台自动化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 解析可后台自动化：系统提示词可配置、判卷后可按并发数自动解析本次错题写入备注、可一键全量解析所有空备注错题，错题复习页顶端显示可终止的进度条。

**Architecture:** 新增 3 个配置键（走 `DEFAULT_SETTINGS` 种子化，无 schema 迁移）；抽出共享提示词构建服务 `aicontext.js`；新增内存任务队列+并发池服务 `aiparse.js`（`enqueue/pump/status/abort`，AI 调用可注入）；加 3 个 API + 判卷钩子；错题复习页轮询 `status` 渲染进度条；系统配置页加 3 个配置项+全量按钮。进度用前端轮询（~1.5s）。

**Tech Stack:** Node.js 20 + Express + EJS + better-sqlite3 + 原生 JS；`node:test`；Chrome headless + playwright-core 端到端。

**代码库要点（实现者必读）：**
- 项目根 `/home/admin/git/richie_gesp`，系统在 `exam-system/`。所有命令在 `exam-system/` 下运行。
- 测试命令 `node --test test/xxx.test.js`；测试内用 `db.init(临时路径)` + `require('../src/services/xxx')`。
- 服务层单例读 `db.get()`；测试间 `db.init` 会切换当前库。
- 配置读取：`db.getSetting(key)`（字符串）；`db.setSetting(key, value)` 不受白名单限制（白名单只在 `POST /api/settings`）。
- `SETTING_KEYS` 由 `Object.keys(db.DEFAULT_SETTINGS)` 派生，`DEFAULT_SETTINGS` 的键在每次 `open()` 用 `INSERT OR IGNORE` 种子化 → **加配置键无需迁移**。
- 试卷对象形状：`qb.getExam(id)` → `{ exam:{title,...}, sections }`；`qb.getQuestion(examId,qid)` → `{ question }` 或 null。
- 错题：`wrongbook.get(id)`、`recordWrong(examId,qid,now)`、`setNote(id,note,knowledge)`、`getByQuestion(examId,qid)`。
- AI 调用（现有 `/api/ai/chat` 代理）走 `{ai_base_url}/v1/chat/completions`，用 `chat_template_kwargs.enable_thinking` 控制思考。
- 夹具：`test/fixtures/bank/测试分类/测试卷.exam.json`（含占位符 `TESTER_PLACEHOLDER_SOURCE`，需替换）；`test/fixtures/cpp/tester.cpp`。试卷 `test_paper_01`：choice q1/q2（答案 B）、tf q3（答案 true）、编程 prog1。
- 直接提交 main；**绝不提交** `data/exam.db`。

---

### Task 1: 配置键（db.js）+ 测试

**Files:**
- Modify: `exam-system/src/services/db.js`（`DEFAULT_SETTINGS`，约 107-119 行）
- Test: `exam-system/test/aiparse.test.js`（新建，本任务只放第一个用例）

- [ ] **Step 1: 写失败测试（新文件）**

创建 `exam-system/test/aiparse.test.js`：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/aiparse.test.js`
Expected: FAIL（`ai_auto_parse` 等为 null，断言失败）

- [ ] **Step 3: 实现配置键**

编辑 `exam-system/src/services/db.js`，把 `DEFAULT_SETTINGS` 中：

```js
  ai_show_thinking: '0',
  ai_max_tokens: '8192'
};
```

替换为：

```js
  ai_show_thinking: '0',
  ai_max_tokens: '8192',
  ai_system_prompt: '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）',
  ai_auto_parse: '0',
  ai_parse_concurrency: '4'
};
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/aiparse.test.js`
Expected: PASS（1 个用例）

- [ ] **Step 5: Commit**

```bash
git add exam-system/src/services/db.js exam-system/test/aiparse.test.js
git commit -m "feat(ai-auto): 新增 ai_system_prompt/ai_auto_parse/ai_parse_concurrency 配置键"
```

---

### Task 2: 共享提示词构建服务 aicontext.js + 重构 ai-context

**Files:**
- Create: `exam-system/src/services/aicontext.js`
- Modify: `exam-system/src/routes/api.js`（`ai-context` 端点约 275-328 行：删 `AI_PREFIX` 常量、改端点）
- Test: `exam-system/test/aicontext.test.js`（新建）

- [ ] **Step 1: 写失败测试**

创建 `exam-system/test/aicontext.test.js`：

```js
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

test('aicontext: 不存在的错题/题目返回 error', () => {
  const { db, dir, bank } = setup();
  const aictx = require('../src/services/aicontext');
  assert.strictEqual(aictx.buildMessage(99999).error, '错题不存在');
  db.close(); rmrf(dir); rmrf(bank);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/aicontext.test.js`
Expected: FAIL（Cannot find module '../src/services/aicontext'）

- [ ] **Step 3: 实现 aicontext.js**

创建 `exam-system/src/services/aicontext.js`：

```js
'use strict';
const db = require('./db');
const qb = require('./questionbank');
const sessions = require('./examsessions');
const wrongbook = require('./wrongbook');

// 内置默认系统提示词（配置为空时回退）
const DEFAULT_AI_PROMPT = '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）';

function tfText(v) { return v === true || v === 'true' ? '正确' : '错误'; }

function getSystemPrompt() {
  const p = db.getSetting('ai_system_prompt');
  return (p && p.trim()) ? p : DEFAULT_AI_PROMPT;
}

// 构建一道错题的 AI 解析首条消息。
// 成功返回 { message }；失败返回 { error: '非法的 ID' | '错题不存在' | '题目已不在题库' }。
function buildMessage(wrongId) {
  if (!Number.isInteger(Number(wrongId))) return { error: '非法的 ID' };
  const w = wrongbook.get(Number(wrongId));
  if (!w) return { error: '错题不存在' };
  const hit = qb.getQuestion(w.exam_id, w.question_id);
  if (!hit) return { error: '题目已不在题库' };
  const q = hit.question;

  let qBlock = q.stem || q.title || '';
  if (q.type === 'choice' && q.options) {
    for (const k of Object.keys(q.options)) qBlock += '\n' + k + '. ' + q.options[k];
  } else if (q.type === 'programming') {
    if (q.input_format) qBlock += '\n输入格式：' + q.input_format;
    if (q.output_format) qBlock += '\n输出格式：' + q.output_format;
  }

  let errBlock = '';
  const att = sessions.latestAttempt(w.exam_id);
  let userAns = null;
  if (att) {
    const row = db.get().prepare('SELECT answer FROM exam_answers WHERE attempt_id=? AND question_id=?')
      .get(att.id, w.question_id);
    userAns = row ? row.answer : null;
  }
  if (q.type === 'programming') {
    if (userAns) {
      const sub = db.get().prepare('SELECT code, result_summary FROM prog_submissions WHERE id=?').get(Number(userAns));
      if (sub) errBlock = '你最近的提交代码：\n```\n' + sub.code + '\n```\n判题结果：\n' + (sub.result_summary || '');
    }
    if (!errBlock) errBlock = '（未找到提交记录）';
  } else {
    if (userAns !== null && userAns !== undefined && userAns !== '') {
      const shown = q.type === 'tf' ? tfText(userAns) : userAns;
      errBlock += '你的答案：' + shown + '（错误）\n';
    }
    const correctShown = q.type === 'tf' ? tfText(q.answer) : q.answer;
    errBlock += '正确答案：' + correctShown;
    if (q.explanation) errBlock += '\n解析：' + q.explanation;
  }

  const message = getSystemPrompt() + '\n\n【题目】\n' + qBlock + '\n\n【出错信息】\n' + errBlock;
  return { message };
}

module.exports = { buildMessage, getSystemPrompt, DEFAULT_AI_PROMPT };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/aicontext.test.js`
Expected: PASS（3 个用例）

- [ ] **Step 5: 重构 api.js ai-context 端点**

编辑 `exam-system/src/routes/api.js`：

（a）顶部 imports 区（`const examlog = require('../services/examlog');` 之后）加：

```js
const aicontext = require('../services/aicontext');
```

（b）删除这两行（约 275-278 行）：

```js
// ---- AI解析：组装首条提示词 ----
const AI_PREFIX = '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法';

function tfText(v) { return v === true || v === 'true' ? '正确' : '错误'; }
```

（c）把整个 `router.get('/wrong/:id/ai-context', ...)`（约 280-328 行）替换为：

```js
// ---- AI解析：组装首条提示词（逻辑在 aicontext 服务，供端点与后台任务共用）----
router.get('/wrong/:id/ai-context', asyncH(async (req, res) => {
  const r = aicontext.buildMessage(req.params.id);
  if (r.error) {
    return res.status(r.error === '非法的 ID' ? 400 : 404).json({ error: r.error });
  }
  const s = db.allSettings();
  res.json({
    message: r.message,
    config: { baseUrl: s.ai_base_url, apiKey: s.ai_api_key, model: s.ai_model, showThinking: s.ai_show_thinking === '1' }
  });
}));
```

- [ ] **Step 6: 回归（确认原 ai-context 测试仍过）**

Run: `node --test test/aicontext.test.js test/api.test.js`
Expected: 全部 PASS（原 `api ai-context` 用例断言 `includes('这是考试错误的一个C++考试题')` 仍成立）

- [ ] **Step 7: Commit**

```bash
git add exam-system/src/services/aicontext.js exam-system/src/routes/api.js exam-system/test/aicontext.test.js
git commit -m "refactor(ai-auto): 抽出 aicontext 共享提示词构建服务并重构 ai-context 端点"
```

---

### Task 3: 后台解析服务 aiparse.js + 测试

**Files:**
- Create: `exam-system/src/services/aiparse.js`
- Test: `exam-system/test/aiparse.test.js`（追加）

- [ ] **Step 1: 写失败测试（追加到 test/aiparse.test.js）**

在 `setup()` 之后、文件末尾已有用例之后追加：

```js
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
  const ids = [];
  for (const qid of ['q1', 'q2', 'q3', 'q1', 'q2']) {
    wb.recordWrong('test_paper_01', qid, Date.now() + ids.length);
  }
  // 去重：q1/q2 会被 recordWrong 升级，实际错题只有 q1、q2、q3 三条
  for (const qid of ['q1', 'q2', 'q3']) ids.push(wb.getByQuestion('test_paper_01', qid).id);
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/aiparse.test.js`
Expected: FAIL（`aiparse._reset is not a function` 或 Cannot find module）

- [ ] **Step 3: 实现 aiparse.js**

创建 `exam-system/src/services/aiparse.js`：

```js
'use strict';
const db = require('./db');
const wrongbook = require('./wrongbook');
const aicontext = require('./aicontext');

const AI_PARSE_TIMEOUT_MS = 180000;

let queue = [];            // 待处理错题 id
let running = 0;           // 正在执行的任务数
let total = 0;             // 本批次累计任务数
let done = 0;              // 已处理（成功+跳过+失败）
let failed = 0;            // 失败数
let abortFlag = false;
const inFlight = new Set(); // 在途请求的 AbortController

function concurrency() {
  return Math.min(16, Math.max(1, parseInt(db.getSetting('ai_parse_concurrency'), 10) || 4));
}

function status() {
  return { active: queue.length > 0 || running > 0, total, done, failed };
}

// 默认非流式 AI 调用（后台解析用）：固定 enable_thinking=false 只取最终答案。
async function callAi(messages, signal) {
  const s = db.allSettings();
  const baseUrl = String(s.ai_base_url || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('未配置 ai_base_url');
  const resp = await fetch(baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (s.ai_api_key || '') },
    body: JSON.stringify({
      model: s.ai_model,
      max_tokens: parseInt(s.ai_max_tokens, 10) || 8192,
      messages,
      stream: false,
      chat_template_kwargs: { enable_thinking: false }
    }),
    signal
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error('AI 服务返回 HTTP ' + resp.status + (txt ? '：' + txt.slice(0, 200) : ''));
  }
  const j = await resp.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  if (!text.trim()) throw new Error('AI 未返回内容');
  return text;
}
let aiCallImpl = callAi;

async function runOne(wrongId) {
  const controller = new AbortController();
  inFlight.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, AI_PARSE_TIMEOUT_MS);
  try {
    const w = wrongbook.get(wrongId);
    if (!w) return;                       // 错题已删除 → 跳过
    if (w.note && w.note.trim()) return;  // 已有备注 → 跳过（只解析空备注）
    const r = aicontext.buildMessage(wrongId);
    if (r.error) { failed++; return; }    // 题目不在题库等
    const answer = await aiCallImpl([{ role: 'user', content: r.message }], controller.signal);
    wrongbook.setNote(wrongId, '---\n【AI解析】\n' + answer, w.note_knowledge);
  } catch (e) {
    // 超时 / 网络 / 空回复计失败；用户主动中止（abort）不计
    if (timedOut || !controller.signal.aborted) failed++;
  } finally {
    clearTimeout(timer);
    inFlight.delete(controller);
    done++;
  }
}

function pump() {
  while (running < concurrency() && queue.length > 0 && !abortFlag) {
    const wrongId = queue.shift();
    running++;
    runOne(wrongId).finally(() => { running--; pump(); });
  }
}

// 入队；空闲时重置计数开新批次。返回实际入队数。
function enqueue(wrongIds) {
  const ids = (wrongIds || []).filter(id => Number.isInteger(Number(id))).map(Number);
  if (!ids.length) return 0;
  if (queue.length === 0 && running === 0) { total = 0; done = 0; failed = 0; }
  queue.push(...ids);
  total += ids.length;
  abortFlag = false;
  pump();
  return ids.length;
}

// 终止：中止在途 + 清空队列；已写备注保留。
function abort() {
  abortFlag = true;
  total -= queue.length;
  queue = [];
  for (const c of inFlight) { try { c.abort(); } catch (e) {} }
}

// 测试钩子
function _setAiCall(fn) { aiCallImpl = fn; }
function _resetAiCall() { aiCallImpl = callAi; }
function _reset() {
  queue = []; running = 0; total = 0; done = 0; failed = 0; abortFlag = false; inFlight.clear();
}

module.exports = { enqueue, abort, status, _setAiCall, _resetAiCall, _reset };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/aiparse.test.js`
Expected: PASS（7 个用例）

- [ ] **Step 5: Commit**

```bash
git add exam-system/src/services/aiparse.js exam-system/test/aiparse.test.js
git commit -m "feat(ai-auto): aiparse 后台解析服务（内存队列+并发池+中止）"
```

---

### Task 4: API 端点（status/abort/full）+ 判卷自动触发 + 测试

**Files:**
- Modify: `exam-system/src/routes/api.js`（加 `aiparse` import、3 个端点、`grade` 末尾钩子）
- Test: `exam-system/test/api.test.js`（追加）

- [ ] **Step 1: 写失败测试（追加到 test/api.test.js 末尾）**

```js
test('api ai-parse: full 只入队空备注错题；status/abort 可用', async () => {
  const { dir, bank, db, server, base } = await setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  aiparse._setAiCall(async () => 'x');     // 避免真实 AI 调用
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  wb.recordWrong('test_paper_01', 'q3', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  wb.setNote(w1.id, '已有备注', '');         // q1 有备注，不应被全量解析

  const full = await post(base, '/api/ai-parse/full', {});
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.body.queued, 1);   // 只有 q3 空备注
  // 等后台跑完
  for (let i = 0; i < 100 && aiparse.status().active; i++) await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(wb.get(w1.id).note, '已有备注');   // 未被改动

  const st = await get(base, '/api/ai-parse/status');
  assert.strictEqual(st.status, 200);
  assert.ok(typeof st.body.total === 'number');
  const ab = await post(base, '/api/ai-parse/abort', {});
  assert.strictEqual(ab.body.ok, true);
  aiparse._resetAiCall();
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-parse: ai_auto_parse 开启时判卷自动入队', async () => {
  const { dir, bank, db, server, base } = await setup();
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  aiparse._setAiCall(async () => 'x');
  await post(base, '/api/settings', { ai_auto_parse: '1' });
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });  // 错
  await post(base, '/api/attempts/1/grade', {});
  const st = aiparse.status();
  assert.ok(st.total >= 1 || st.active, '应已入队');
  for (let i = 0; i < 100 && aiparse.status().active; i++) await new Promise(r => setTimeout(r, 20));
  aiparse._resetAiCall();
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/api.test.js`
Expected: FAIL（`/api/ai-parse/full` 404）

- [ ] **Step 3: 实现端点与钩子**

编辑 `exam-system/src/routes/api.js`：

（a）顶部（`const aicontext = require('../services/aicontext');` 之后）加：

```js
const aiparse = require('../services/aiparse');
```

（b）在 `// ---- 配置 ----`（`const SETTING_KEYS = ...`）之前，加入 3 个端点：

```js
// ---- AI 自动解析后台任务 ----
router.get('/ai-parse/status', asyncH(async (req, res) => {
  res.json(aiparse.status());
}));
router.post('/ai-parse/abort', asyncH(async (req, res) => {
  aiparse.abort();
  res.json({ ok: true });
}));
router.post('/ai-parse/full', asyncH(async (req, res) => {
  const rows = db.get().prepare("SELECT id FROM wrong_questions WHERE TRIM(COALESCE(note,'')) = ''").all();
  const queued = aiparse.enqueue(rows.map(r => r.id));
  res.json({ queued });
}));
```

（c）`grade` 端点里，`finalize();` 之后、`res.json(...)` 之前，插入：

```js
  const s = settingsObj();
  if (s.ai_auto_parse === '1' && wrongAdded.length) {
    const ids = wrongAdded.map(qid => wrongbook.getByQuestion(att.exam_id, qid)).filter(Boolean).map(w => w.id);
    aiparse.enqueue(ids);
  }
```

- [ ] **Step 4: 运行确认通过 + 回归**

Run: `node --test test/api.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add exam-system/src/routes/api.js exam-system/test/api.test.js
git commit -m "feat(ai-auto): ai-parse status/abort/full 端点 + 判卷自动触发"
```

---

### Task 5: 错题复习页进度提示条（review.ejs + review.js + app.css）

**Files:**
- Modify: `exam-system/src/views/review.ejs`（`<main class="page-main">` 后插入提示条）
- Modify: `exam-system/src/public/js/review.js`（IIFE 末尾加轮询）
- Modify: `exam-system/src/public/css/app.css`（文件末尾加样式）

- [ ] **Step 1: review.ejs 加提示条**

在 `exam-system/src/views/review.ejs` 的 `<main class="page-main">`（第 4 行）之后、`<div class="page-head">`（第 5 行）之前，插入：

```ejs
  <div class="aiparse-banner" id="aiParseBanner" style="display:none">
    <span id="aiParseText"></span>
    <button class="btn btn-danger aiparse-abort" id="btnAiParseAbort">终止</button>
  </div>
```

- [ ] **Step 2: review.js 加轮询逻辑**

在 `exam-system/src/public/js/review.js` 的 IIFE 末尾（最后的 `})();` 之前）追加：

```js
  // --- AI 自动解析进度提示条（轮询 /api/ai-parse/status）---
  const aiParseBanner = document.getElementById('aiParseBanner');
  const aiParseText = document.getElementById('aiParseText');
  const btnAiParseAbort = document.getElementById('btnAiParseAbort');
  let aiParseTimer = null;
  async function pollAiParse() {
    clearTimeout(aiParseTimer);
    let st = null;
    try { st = await App.getJSON('/api/ai-parse/status'); } catch (e) { st = null; }
    if (st && st.active) {
      let txt = '自动AI解析任务进行中（' + st.done + '/' + st.total + '）';
      if (st.failed > 0) txt += '，' + st.failed + ' 个失败';
      aiParseText.textContent = txt;
      aiParseBanner.style.display = '';
      aiParseTimer = setTimeout(pollAiParse, 1500);
    } else {
      aiParseBanner.style.display = 'none';
    }
  }
  btnAiParseAbort.addEventListener('click', async () => {
    try { await App.postJSON('/api/ai-parse/abort', {}); } catch (e) {}
    pollAiParse();
  });
  pollAiParse();
```

- [ ] **Step 3: app.css 加样式**

在 `exam-system/src/public/css/app.css` 文件末尾追加：

```css
/* ===== Review: AI 自动解析进度提示条 ===== */
.aiparse-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--warning-100); border: 1px solid var(--warning-400); color: var(--neutral-700);
  padding: 10px 16px; border-radius: var(--r-md); margin-bottom: 16px; font-size: 14px; }
.aiparse-banner .aiparse-abort { min-height: 32px; padding: 4px 14px; font-size: 13px; }
```

- [ ] **Step 4: 语法检查 + 无头验证（提示条存在且默认隐藏）**

Run: `node --check src/public/js/review.js`
Expected: 无输出（通过）

然后运行（该脚本在 Task 5 创建，见下）：

创建 `/tmp/pwtest/verify_aiparse_banner.js`：

```js
'use strict';
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const PROJ = '/home/admin/git/richie_gesp/exam-system';
const HS = '/tmp/chs/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8988, BASE = 'http://127.0.0.1:' + PORT;
const post = (u, b) => fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apb-'));
  const bank = path.join(tmp, 'bank'); fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const dbFile = path.join(tmp, 'v.db');
  const srv = spawn('node', ['server.js'], { cwd: PROJ, env: { ...process.env, PORT: String(PORT), EXAM_DB: dbFile, EXAM_BANK_DIR: bank }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write('[srv!] ' + d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/exams')).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 300)); }
  const br = await chromium.launch({ executablePath: HS, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const pg = await br.newPage(); pg.setDefaultTimeout(30000);
  pg.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
  await pg.goto(BASE + '/review', { waitUntil: 'networkidle' });
  const st = await pg.evaluate(() => {
    const b = document.getElementById('aiParseBanner');
    return { exists: !!b, display: b ? b.style.display : null, hasAbort: !!document.getElementById('btnAiParseAbort') };
  });
  console.log('提示条存在:', st.exists ? '✅' : '❌', '| 无任务时隐藏:', st.display === 'none' ? '✅' : '❌', '| 终止按钮存在:', st.hasAbort ? '✅' : '❌');
  await br.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
})();
```

Run: `cd /tmp/pwtest && node verify_aiparse_banner.js`
Expected: 三项均 ✅

- [ ] **Step 5: Commit**

```bash
git add exam-system/src/views/review.ejs exam-system/src/public/js/review.js exam-system/src/public/css/app.css
git commit -m "feat(ai-auto): 错题复习页 AI 自动解析进度提示条（轮询+终止）"
```

---

### Task 6: 系统配置页 UI（settings.ejs + settings.js + app.css）

**Files:**
- Modify: `exam-system/src/views/settings.ejs`（AI 服务卡片加 3 项 + 全量按钮）
- Modify: `exam-system/src/public/js/settings.js`（KEYS/DEFAULTS + btnFullParse）
- Modify: `exam-system/src/public/css/app.css`（`.set-block` 样式）

- [ ] **Step 1: settings.ejs 加配置项与按钮**

编辑 `exam-system/src/views/settings.ejs`。在「AI 服务」卡片内、现有 `ai_show_thinking` 那一段（`<div class="set-row"><label>AI 解析显示"思考过程"…</select></div>`，约 34-38 行）之后、`<div style="margin-top:16px">`（按钮行）之前，插入：

```ejs
    <div class="set-block"><label>AI 解析系统提示词（留空用内置默认）</label>
      <textarea id="ai_system_prompt"><%= settings.ai_system_prompt %></textarea></div>
    <div class="set-row"><label>自动 AI 解析（判卷后自动解析本次错题写入备注）</label>
      <select id="ai_auto_parse">
        <option value="0" <%= settings.ai_auto_parse === '0' ? 'selected' : '' %>>关闭</option>
        <option value="1" <%= settings.ai_auto_parse === '1' ? 'selected' : '' %>>开启</option>
      </select></div>
    <div class="set-row"><label>AI 解析后台任务并发数</label>
      <input type="number" id="ai_parse_concurrency" value="<%= settings.ai_parse_concurrency %>" min="1"></div>
```

然后把按钮行：

```ejs
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="btnSave">保存配置</button>
      <button class="btn btn-ghost" id="btnReset" style="margin-left:10px">恢复默认</button>
    </div>
```

替换为：

```ejs
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="btnSave">保存配置</button>
      <button class="btn btn-ghost" id="btnReset" style="margin-left:10px">恢复默认</button>
      <button class="btn btn-primary" id="btnFullParse" style="margin-left:10px">🤖 全量AI解析</button>
    </div>
```

- [ ] **Step 2: settings.js 更新 KEYS/DEFAULTS + 全量按钮处理**

编辑 `exam-system/src/public/js/settings.js`：

（a）`KEYS` 数组改为：

```js
  const KEYS = ['default_duration_minutes', 'remind_before_minutes', 'remind_interval_minutes', 'judge_compile_timeout_sec', 'judge_run_timeout_sec', 'ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model', 'ai_max_tokens', 'ai_show_thinking', 'ai_system_prompt', 'ai_auto_parse', 'ai_parse_concurrency'];
```

（b）`DEFAULTS` 对象末尾追加三键（在 `ai_show_thinking: '0'` 后）：

```js
  const DEFAULTS = { default_duration_minutes: 120, remind_before_minutes: 30, remind_interval_minutes: 10, judge_compile_timeout_sec: 30, judge_run_timeout_sec: 60, ai_webui_url: 'http://121.40.190.90:3000/', ai_base_url: 'http://121.40.190.90:4000', ai_api_key: 'sk-vllm-aaa-bbb', ai_model: 'qwen-local', ai_max_tokens: 8192, ai_show_thinking: '0', ai_system_prompt: '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）', ai_auto_parse: '0', ai_parse_concurrency: '4' };
```

（c）在 `btnRescan` 监听器之后、IIFE 末尾 `})();` 之前，追加：

```js
  document.getElementById('btnFullParse').addEventListener('click', async () => {
    try {
      const r = await App.postJSON('/api/ai-parse/full', {});
      if (r.queued > 0) {
        App.toast('已启动全量AI解析，共 ' + r.queued + ' 题');
        setTimeout(() => { location.href = '/review'; }, 400);
      } else {
        App.toast('没有需要解析的错题（仅解析备注为空的错题）');
      }
    } catch (e) { App.toast('启动失败：' + e.message, true); }
  });
```

- [ ] **Step 3: app.css 加 .set-block 样式**

在 `exam-system/src/public/css/app.css` 文件末尾追加：

```css
/* ===== Settings: 块状配置行（多行文本域）===== */
.set-block { padding: 10px 0; border-bottom: 1px dashed var(--neutral-50); }
.set-block label { display: block; font-size: 14px; color: var(--neutral-600); margin-bottom: 6px; }
.set-block textarea { width: 100%; min-height: 64px; padding: 8px 12px; border: 1px solid var(--neutral-100);
  border-radius: var(--r-md); font-size: 13px; font-family: inherit; resize: vertical; }
.set-row select { padding: 8px 12px; border: 1px solid var(--neutral-100); border-radius: var(--r-md);
  font-size: 14px; background: #fff; min-height: 38px; }
```

- [ ] **Step 4: 语法检查 + 无头验证**

Run: `node --check src/public/js/settings.js`
Expected: 通过

创建 `/tmp/pwtest/verify_settings_ui.js`：

```js
'use strict';
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const PROJ = '/home/admin/git/richie_gesp/exam-system';
const HS = '/tmp/chs/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8989, BASE = 'http://127.0.0.1:' + PORT;
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asu-'));
  const bank = path.join(tmp, 'bank'); fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const dbFile = path.join(tmp, 'v.db');
  const srv = spawn('node', ['server.js'], { cwd: PROJ, env: { ...process.env, PORT: String(PORT), EXAM_DB: dbFile, EXAM_BANK_DIR: bank }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/exams')).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 300)); }
  const br = await chromium.launch({ executablePath: HS, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const pg = await br.newPage(); pg.setDefaultTimeout(30000);
  pg.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
  await pg.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  const st = await pg.evaluate(() => ({
    prompt: !!document.getElementById('ai_system_prompt'),
    promptVal: (document.getElementById('ai_system_prompt') || {}).value || '',
    auto: !!document.getElementById('ai_auto_parse'),
    conc: (document.getElementById('ai_parse_concurrency') || {}).value,
    full: !!document.getElementById('btnFullParse')
  }));
  console.log('系统提示词域存在:', st.prompt ? '✅' : '❌', '| 含默认内容:', st.promptVal.includes('尽量精简回答') ? '✅' : '❌');
  console.log('自动解析下拉存在:', st.auto ? '✅' : '❌', '| 并发数默认 4:', st.conc === '4' ? '✅' : '❌', '| 全量按钮存在:', st.full ? '✅' : '❌');
  await br.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
})();
```

Run: `cd /tmp/pwtest && node verify_settings_ui.js`
Expected: 全部 ✅

- [ ] **Step 5: Commit**

```bash
git add exam-system/src/views/settings.ejs exam-system/src/public/js/settings.js exam-system/src/public/css/app.css
git commit -m "feat(ai-auto): 系统配置页新增提示词/自动解析/并发数与全量AI解析按钮"
```

---

### Task 7: 全量回归 + 真实模型端到端

**Files:** 无（验证）

- [ ] **Step 1: 全量单测**

Run: `cd /home/admin/git/richie_gesp/exam-system && node --test test/`
Expected: 全部 `# fail 0`（含 aiparse/aicontext 新增用例）

- [ ] **Step 2: 语法检查全部改动文件**

Run: `node --check src/services/aiparse.js && node --check src/services/aicontext.js && node --check src/routes/api.js && node --check src/public/js/review.js && node --check src/public/js/settings.js && echo ALL_OK`
Expected: `ALL_OK`

- [ ] **Step 3: 真实模型端到端（全量解析 2 道空备注错题）**

创建 `/tmp/pwtest/verify_aiparse_e2e.js`（用真实 liteLLM，约需 1-2 分钟）：

```js
'use strict';
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const PROJ = '/home/admin/git/richie_gesp/exam-system';
const Database = require(path.join(PROJ, 'node_modules', 'better-sqlite3'));
const HS = '/tmp/chs/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8990, BASE = 'http://127.0.0.1:' + PORT;
const post = (u, b) => fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ape-'));
  const bank = path.join(tmp, 'bank'); fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  const tester = fs.readFileSync(path.join(PROJ, 'test', 'fixtures', 'cpp', 'tester.cpp'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', JSON.stringify(tester).slice(1, -1));
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const dbFile = path.join(tmp, 'v.db');
  const srv = spawn('node', ['server.js'], { cwd: PROJ, env: { ...process.env, PORT: String(PORT), EXAM_DB: dbFile, EXAM_BANK_DIR: bank }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/exams')).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 300)); }

  // 造 2 道空备注错题（q1、q3 答错）
  await post('/api/exams/test_paper_01/start');
  await post('/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });
  await post('/api/attempts/1/answers', { questionId: 'q3', answer: 'false' });
  await post('/api/attempts/1/grade', {});

  const br = await chromium.launch({ executablePath: HS, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const pg = await br.newPage(); pg.setDefaultTimeout(60000);
  pg.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));

  // 触发全量解析并跳到复习页
  const full = await post('/api/ai-parse/full', {});
  console.log('全量入队数:', full.queued, full.queued === 2 ? '✅' : '❌');
  await pg.goto(BASE + '/review', { waitUntil: 'networkidle' });

  // 提示条应出现，等待完成（真实模型较慢，最多等 240s）
  let sawBanner = false, doneOk = false;
  for (let i = 0; i < 120; i++) {
    const st = await pg.evaluate(() => {
      const b = document.getElementById('aiParseBanner');
      return { visible: b && b.style.display !== 'none', text: b ? b.textContent : '', abort: !!document.getElementById('btnAiParseAbort') };
    });
    if (st.visible) { sawBanner = true; if (i === 0 || i % 10 === 0) console.log('  进度:', st.text, '| 终止按钮:', st.abort ? '有' : '无'); }
    else if (sawBanner) { doneOk = true; break; }   // 曾出现后又消失 → 完成
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('进度提示条出现:', sawBanner ? '✅' : '❌', '| 完成后消失:', doneOk ? '✅' : '❌');

  // 验证备注已写入【AI解析】
  const db2 = new Database(dbFile);
  const rows = db2.prepare("SELECT note FROM wrong_questions").all();
  const filled = rows.filter(r => r.note && r.note.includes('【AI解析】')).length;
  console.log('备注含【AI解析】条数:', filled + '/' + rows.length, filled === rows.length ? '✅' : '❌');
  console.log('  备注示例前 80 字:', JSON.stringify((rows[0].note || '').slice(0, 80)));
  db2.close();
  await br.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
})();
```

Run: `cd /tmp/pwtest && node verify_aiparse_e2e.js`
Expected: 全量入队数 2 ✅；提示条出现 ✅、完成后消失 ✅；备注含【AI解析】2/2 ✅

- [ ] **Step 4: 若有 ❌，定位修复后重跑（修复产品代码需重跑 Step 1 单测）**

- [ ] **Step 5: 确认工作区干净（无未提交产品代码改动）**

Run: `cd /home/admin/git/richie_gesp && git status --short`
Expected: 仅 `M exam-system/data/exam.db`（运行痕迹）与既有未跟踪文件；产品代码均已提交。

---

## 验收清单（对照 spec）

- [ ] 配置 3 键默认值正确、老库无需迁移（§3）
- [ ] 系统提示词可配置、空值回退默认、含"2000字"精简句（§3/§4）
- [ ] 手动 AI 解析提示词与后台一致（共享 aicontext，§4）
- [ ] 判卷开启自动解析时自动入队；运行中新判卷任务并入、总数更新（§5/§6）
- [ ] 只解析空备注；已有备注跳过不改动（§2/§5.2）
- [ ] 并发数受 `ai_parse_concurrency` 限制（1~16，实时生效）（§5.2）
- [ ] `status`/`abort`/`full` 端点；`full` 只入队空备注（§6）
- [ ] 复习页提示条显示（完成/总数）＋失败数＋【终止】；完成后整条消失（§7.1）
- [ ] 【终止】中止在途+队列，已写备注保留（§5.2/§8）
- [ ] 配置页【全量AI解析】→ 跳复习页看进度（§7.2）
- [ ] 后台固定 `enable_thinking:false` 只取最终答案入备注（§5.2/§8）
- [ ] 失败题备注保持空、下次全量可重试；服务重启队列清空不残留（§8）
- [ ] 全量单测通过；无头端到端（提示条+终止+全量）通过
