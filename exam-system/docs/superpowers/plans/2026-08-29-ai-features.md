# AI 功能（AI问答 + AI解析）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给现有考试系统加三块 AI 能力：①导航"AI问答"整页 iframe；②错题卡片"AI解析"按钮；③AI 三区对话窗（流式/多轮/复制备注）；外加 4 个 AI 配置项与数据库版本化迁移+升级前备份。

**Architecture:** 沿用现有栈——Express + EJS 服务端渲染 + 原生 JS + better-sqlite3。AI 请求由**前端直连** liteLLM（Anthropic Messages，`stream:true` SSE），后端只新增一个 `GET /api/wrong/:id/ai-context` 端点负责组装首条提示词并回传 AI 配置。数据库改动纯增量（`settings` 加 4 键），并引入 `schema_version` 版本化迁移 + 升级前自动备份机制保障线上数据安全。

**Tech Stack:** Node 20 / Express / EJS / better-sqlite3 / 原生 fetch + ReadableStream（SSE 流式）。

**规格依据：** `docs/superpowers/specs/2026-08-29-ai-features-design.md`

**关键既有代码位置（实现时直接引用）：**
- 设置默认值与白名单源：`src/services/db.js` 的 `DEFAULT_SETTINGS`（`api.js` 的 `SETTING_KEYS = Object.keys(db.DEFAULT_SETTINGS)` 自动跟随）。
- 错题查询：`src/services/wrongbook.js` `get(id)`。
- 最近 attempt / 作答：`src/services/examsessions.js` `latestAttempt(examId)`；`db.get()` 查 `exam_answers` / `prog_submissions`。
- 取题目：`src/services/questionbank.js` `getQuestion(examId, questionId)` 返回 `{section, question, sectionIdx}`。
- 前端工具：`src/public/js/common.js` 的 `window.App`（`toast/postJSON/patchJSON/getJSON`）。
- 测试：`node --test test/`；`test/helpers.js` 提供 `tmpDir/rmrf/startApp`；`test/api.test.js` 的 `setup()`/`post`/`get` 范式。

---

## Task 1: 新增 4 个 AI 配置项（后端）

**Files:**
- Modify: `src/services/db.js`（`DEFAULT_SETTINGS`）
- Test: `test/api.test.js`（追加 1 个用例）

- [ ] **Step 1: 写失败测试**

在 `test/api.test.js` 末尾追加：

```js
test('api 配置: 含 4 个 AI 键且可保存', async () => {
  const { dir, bank, db, server, base } = await setup();
  let r = await get(base, '/api/settings');
  assert.strictEqual(r.status, 200);
  for (const k of ['ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model']) {
    assert.ok(k in r.body.settings, '应有 ' + k);
  }
  assert.strictEqual(r.body.settings.ai_webui_url, 'http://121.40.190.90:3000/');
  assert.strictEqual(r.body.settings.ai_base_url, 'http://121.40.190.90:4000');
  assert.strictEqual(r.body.settings.ai_model, 'qwen-local');

  r = await post(base, '/api/settings', { ai_base_url: 'http://example:9999' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(db.getSetting('ai_base_url'), 'http://example:9999');
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test 2>&1 | grep -E "AI 键|pass|fail"`
Expected: 该用例 FAIL（`ai_webui_url` 不存在），其余通过。

- [ ] **Step 3: 实现——给 `DEFAULT_SETTINGS` 追加 4 键**

修改 `src/services/db.js` 中 `DEFAULT_SETTINGS`（原 5 键后追加）：

```js
const DEFAULT_SETTINGS = {
  default_duration_minutes: '120',
  remind_before_minutes: '30',
  remind_interval_minutes: '10',
  judge_compile_timeout_sec: '30',
  judge_run_timeout_sec: '60',
  ai_webui_url: 'http://121.40.190.90:3000/',
  ai_base_url: 'http://121.40.190.90:4000',
  ai_api_key: 'sk-vllm-aaa-bbb',
  ai_model: 'qwen-local'
};
```

> 说明：`api.js` 的 `SETTING_KEYS = Object.keys(db.DEFAULT_SETTINGS)` 与启动播种 `INSERT OR IGNORE` 都会自动纳入新键；`INSERT OR IGNORE` 保证旧库已改过的值不被覆盖。

- [ ] **Step 4: 运行确认通过**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`，新用例通过。

- [ ] **Step 5: Commit**

```bash
git add src/services/db.js test/api.test.js
git commit -m "feat: 新增 AI 问答/解析 4 个配置项"
```

---

## Task 2: 数据库版本化迁移 + 升级前备份（后端）

**Files:**
- Modify: `src/services/db.js`（新增 `CURRENT_SCHEMA_VERSION` / `MIGRATIONS` / `backupDb` / `ensureMigrated`，并在 `open()` 调用）
- Test: `test/migrate.test.js`（新建）

- [ ] **Step 1: 写失败测试**

新建 `test/migrate.test.js`：

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

test('迁移: 全新库启动后 schema_version=当前版本, 不备份', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  assert.strictEqual(dbmod.getSetting('schema_version'), String(dbmod.CURRENT_SCHEMA_VERSION));
  const baks = fs.readdirSync(dir).filter(f => f.includes('.bak-'));
  assert.strictEqual(baks.length, 0);
  dbmod.close(); rmrf(dir);
});

test('迁移: 已是最新版本, 重复打开不迁移不备份', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  dbmod.close();
  dbmod.init(path.join(dir, 't.db')); // 再开一次
  assert.strictEqual(dbmod.getSetting('schema_version'), String(dbmod.CURRENT_SCHEMA_VERSION));
  assert.strictEqual(fs.readdirSync(dir).filter(f => f.includes('.bak-')).length, 0);
  dbmod.close(); rmrf(dir);
});

test('迁移: 旧版本升级 → 先备份、跑迁移、升版本', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  // 人为把版本压到 1（模拟旧库），并注入一个假的 2 号迁移
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','1')").run();
  let ran = false;
  const res = dbmod.ensureMigrated(dbmod.get(), { 2: (d) => { ran = true; } }, 2);
  assert.strictEqual(ran, true, '应执行 2 号迁移');
  assert.strictEqual(res.migrated, true);
  assert.ok(res.backup && fs.existsSync(res.backup), '应生成备份文件');
  assert.strictEqual(dbmod.get().prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '2');
  dbmod.close(); rmrf(dir);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test 2>&1 | grep -E "迁移|pass|fail"`
Expected: 3 个用例 FAIL（`CURRENT_SCHEMA_VERSION`/`ensureMigrated` 未定义）。

- [ ] **Step 3: 实现——给 `db.js` 增加迁移机制**

在 `src/services/db.js` 的 `DEFAULT_SETTINGS` 之后、`let _db = null;` 之前插入：

```js
// 数据库结构版本号。仅当未来需要"改表结构"时才 +1 并往 MIGRATIONS 加迁移函数。
// 本次 AI 功能是纯增量（只加 settings 键），不改表结构，故保持 1。
const CURRENT_SCHEMA_VERSION = 1;

// 迁移钩子：key=目标版本号，value=(db)=>{...}。当前为空。
const MIGRATIONS = {
  // 2: (db) => { /* 未来改表结构的迁移写这里 */ },
};

// 升级前备份：落盘 WAL 后复制主库为带时间戳快照。返回备份文件路径。
function backupDb(db) {
  const file = db.name;
  db.pragma('wal_checkpoint(TRUNCATE)');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = file + '.bak-' + ts;
  fs.copyFileSync(file, bak);
  return bak;
}

// 幂等迁移。返回 { migrated, backup }。
//   stored 缺失(=0) → 首次版本化，直接写为 current，不迁移不备份；
//   stored===current → 无需处理；
//   0<stored<current → 先备份，再按序跑 migrations[stored+1..current]，最后升版本。
function ensureMigrated(db, migrations, current) {
  migrations = migrations || MIGRATIONS;
  current = current || CURRENT_SCHEMA_VERSION;
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get('schema_version');
  const stored = row ? parseInt(row.value, 10) : 0;
  if (stored === current) return { migrated: false, backup: null };
  if (stored === 0) {
    db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('schema_version', String(current));
    return { migrated: false, backup: null };
  }
  const backup = backupDb(db);
  for (let v = stored + 1; v <= current; v++) {
    const fn = migrations[v];
    if (fn) fn(db);
  }
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('schema_version', String(current));
  return { migrated: true, backup };
}
```

在 `open()` 里、`db.exec(SCHEMA);` 之后、settings 播种之前插入一行：

```js
  db.exec(SCHEMA);
  ensureMigrated(db, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
```

并在 `module.exports` 追加导出：

```js
module.exports = { init, get, close, getSetting, getSettingInt, setSetting, allSettings, DEFAULT_SETTINGS, CURRENT_SCHEMA_VERSION, MIGRATIONS, ensureMigrated };
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`，`test/migrate.test.js` 3 用例通过。

- [ ] **Step 5: Commit**

```bash
git add src/services/db.js test/migrate.test.js
git commit -m "feat: 数据库 schema_version 版本化迁移 + 升级前自动备份"
```

---

## Task 3: 配置页增加"AI 服务"配置组（前端）

**Files:**
- Modify: `src/views/settings.ejs`（在"判题引擎"卡片后新增"AI 服务"卡片）
- Modify: `src/public/js/settings.js`（`KEYS`/`DEFAULTS` 追加 4 键）

- [ ] **Step 1: settings.ejs 增加"AI 服务"卡片**

在 `src/views/settings.ejs` 中，"判题引擎" `</div>`（第 19 行 `judge_run_timeout_sec` 那段的卡片结束处）之后、`<div style="margin-top:16px">` 保存按钮之前，插入一个新卡片。具体做法：把现有"判题引擎"卡片末尾到保存按钮之间的结构改为先闭合判题引擎卡片、新增 AI 卡片、再放保存按钮。

定位 `settings.ejs` 中这一段（约 15–23 行）：

```ejs
    <h3>判题引擎</h3>
    <div class="set-row"><label>编译超时（秒）</label>
      <input type="number" id="judge_compile_timeout_sec" value="<%= settings.judge_compile_timeout_sec %>" min="5"></div>
    <div class="set-row"><label>评测运行超时（秒）</label>
      <input type="number" id="judge_run_timeout_sec" value="<%= settings.judge_run_timeout_sec %>" min="5"></div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="btnSave">保存配置</button>
      <button class="btn btn-ghost" id="btnReset" style="margin-left:10px">恢复默认</button>
    </div>
  </div>
```

替换为：

```ejs
    <h3>判题引擎</h3>
    <div class="set-row"><label>编译超时（秒）</label>
      <input type="number" id="judge_compile_timeout_sec" value="<%= settings.judge_compile_timeout_sec %>" min="5"></div>
    <div class="set-row"><label>评测运行超时（秒）</label>
      <input type="number" id="judge_run_timeout_sec" value="<%= settings.judge_run_timeout_sec %>" min="5"></div>
  </div>

  <div class="settings-card">
    <h3>AI 服务</h3>
    <div class="set-row"><label>AI问答（Open WebUI）地址</label>
      <input type="text" id="ai_webui_url" value="<%= settings.ai_webui_url %>"></div>
    <div class="set-row"><label>liteLLM 基础地址（AI解析）</label>
      <input type="text" id="ai_base_url" value="<%= settings.ai_base_url %>"></div>
    <div class="set-row"><label>liteLLM API Key</label>
      <input type="text" id="ai_api_key" value="<%= settings.ai_api_key %>"></div>
    <div class="set-row"><label>模型名</label>
      <input type="text" id="ai_model" value="<%= settings.ai_model %>"></div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" id="btnSave">保存配置</button>
      <button class="btn btn-ghost" id="btnReset" style="margin-left:10px">恢复默认</button>
    </div>
  </div>
```

> 注意：保存/恢复按钮被移到 AI 卡片内（仍在页面里，`btnSave`/`btnReset` id 不变，`settings.js` 逻辑不动即可工作）。

- [ ] **Step 2: settings.js 追加 4 键**

修改 `src/public/js/settings.js` 顶部两个常量：

```js
  const KEYS = ['default_duration_minutes', 'remind_before_minutes', 'remind_interval_minutes', 'judge_compile_timeout_sec', 'judge_run_timeout_sec', 'ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model'];
  const DEFAULTS = { default_duration_minutes: 120, remind_before_minutes: 30, remind_interval_minutes: 10, judge_compile_timeout_sec: 30, judge_run_timeout_sec: 60, ai_webui_url: 'http://121.40.190.90:3000/', ai_base_url: 'http://121.40.190.90:4000', ai_api_key: 'sk-vllm-aaa-bbb', ai_model: 'qwen-local' };
```

- [ ] **Step 3: 手工验证**

```bash
node server.js &        # 若已在跑则先 kill
sleep 2
curl -s http://localhost:8730/settings | grep -c 'id="ai_base_url"'   # 期望 1
curl -s http://localhost:8730/settings | grep -c 'id="ai_model"'      # 期望 1
```
浏览器打开 `/settings`，能看到"AI 服务"卡片且 4 个输入框回填默认值；改一个值点保存后刷新仍在。

- [ ] **Step 4: Commit**

```bash
git add src/views/settings.ejs src/public/js/settings.js
git commit -m "feat: 配置页新增 AI 服务配置组"
```

---

## Task 4: AI问答板块（导航 + /ai 路由 + iframe 页）

**Files:**
- Modify: `src/views/partials/nav.ejs`
- Modify: `src/routes/pages.js`（新增 `GET /ai`）
- Create: `src/views/ai.ejs`

- [ ] **Step 1: nav.ejs 插入【AI问答】**

修改 `src/views/partials/nav.ejs`，在【数据统计】与【系统配置】之间插入一行：

```ejs
      <a href="/stats" class="<%= activeNav==='stats'?'active':'' %>">数据统计</a>
      <a href="/ai" class="<%= activeNav==='ai'?'active':'' %>">AI问答</a>
      <a href="/settings" class="<%= activeNav==='settings'?'active':'' %>">系统配置</a>
```

- [ ] **Step 2: pages.js 新增 `GET /ai`**

在 `src/routes/pages.js` 中，`router.get('/settings', ...)` 之前（或任意 router 定义处）插入：

```js
router.get('/ai', (req, res) => {
  const settings = db.allSettings();
  res.render('ai', {
    title: 'AI问答', activeNav: 'ai',
    extraCss: ['/css/app.css'], extraJs: [],
    webuiUrl: settings.ai_webui_url
  });
});
```

> 前提：`pages.js` 顶部已 `require` 了 `db`（已有）。若 `db` 未在该文件引入，则补 `const db = require('../services/db');`。

- [ ] **Step 3: 新建 `src/views/ai.ejs`**

```ejs
<%- include('partials/head', { title: title, extraCss: extraCss }) %>
<%- include('partials/nav', { activeNav: activeNav }) %>

<div class="ai-frame-wrap">
  <iframe id="aiFrame" src="<%= webuiUrl %>" title="AI问答"></iframe>
  <div class="ai-frame-fallback" id="aiFallback" style="display:none">
    若此处长时间空白，可能是目标站点不允许被嵌入（设置了 X-Frame-Options）。
    请 <a id="aiOpenNew" href="<%= webuiUrl %>" target="_blank" rel="noopener">在新标签页打开</a>。
  </div>
</div>
<script>
(function () {
  var fb = document.getElementById('aiFallback');
  var frame = document.getElementById('aiFrame');
  // iframe 加载失败（如被拒绝嵌入常表现为 onload 但内容空，或 onerror）时给提示。
  // 跨域无法探测内容，这里提供一个手动"显示提示"兜底入口。
  var t = setTimeout(function () { fb.style.display = 'block'; }, 4000);
  frame.addEventListener('load', function () { clearTimeout(t); });
  frame.addEventListener('error', function () { fb.style.display = 'block'; });
})();
</script>
<%- include('partials/foot', { extraJs: extraJs }) %>
```

- [ ] **Step 4: app.css 增加 AI 框架样式**

在 `src/public/css/app.css` 末尾追加：

```css
/* AI问答 整页 iframe */
.ai-frame-wrap { position: relative; height: calc(100vh - 60px); }
.ai-frame-wrap iframe { width: 100%; height: 100%; border: none; display: block; }
.ai-frame-fallback { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  background: #fff; border: 1px solid var(--neutral-150); border-radius: var(--r-md);
  padding: 18px 24px; font-size: 14px; color: var(--neutral-500); box-shadow: var(--shadow-md); max-width: 480px; }
.ai-frame-fallback a { color: var(--brand-500); }
```

> 注：`--neutral-500`/`--neutral-150`/`--r-md`/`--shadow-md`/`--brand-500` 均为 `app.css :root` 已有变量。

- [ ] **Step 5: 手工验证**

```bash
node server.js &   # 或重启
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8730/ai   # 期望 200
curl -s http://localhost:8730/ai | grep -c 'id="aiFrame"'           # 期望 1
curl -s http://localhost:8730/ | grep -c 'href="/ai"'               # 期望 1（导航有 AI问答）
```
浏览器：导航出现【AI问答】，点进去是整页 iframe（若目标不可嵌入则 4 秒后出现兜底提示与"新标签页打开"链接）。

- [ ] **Step 6: Commit**

```bash
git add src/views/partials/nav.ejs src/routes/pages.js src/views/ai.ejs src/public/css/app.css
git commit -m "feat: AI问答板块——导航 + /ai 整页 iframe 嵌入"
```

---

## Task 5: 后端端点 `GET /api/wrong/:id/ai-context`

**Files:**
- Modify: `src/routes/api.js`（新增端点）
- Test: `test/api.test.js`（追加用例）

- [ ] **Step 1: 写失败测试**

在 `test/api.test.js` 末尾追加：

```js
test('api ai-context: 选择题返回固定前缀+题干+你的答案/正确答案', async () => {
  const { dir, bank, db, server, base } = await setup();
  // 造一场已答错的考试：q1 正确答案 B，故意答 A
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });
  await post(base, '/api/attempts/1/grade', {});   // q1 答错 → 进错题本
  const list = db.get().prepare("SELECT * FROM wrong_questions WHERE question_id='q1'").get();
  assert.ok(list, 'q1 应在错题本');

  const r = await get(base, '/api/wrong/' + list.id + '/ai-context');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.message.includes('这是考试错误的一个C++考试题'));
  assert.ok(r.body.message.includes('【题目】'));
  assert.ok(r.body.message.includes('你的答案：A'));
  assert.ok(r.body.message.includes('正确答案：B'));
  assert.strictEqual(r.body.config.baseUrl, 'http://121.40.190.90:4000');
  assert.strictEqual(r.body.config.model, 'qwen-local');
  assert.ok(r.body.config.apiKey);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-context: 不存在的错题返回 404', async () => {
  const { dir, bank, db, server, base } = await setup();
  const r = await get(base, '/api/wrong/99999/ai-context');
  assert.strictEqual(r.status, 404);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test 2>&1 | grep -E "ai-context|pass|fail"`
Expected: 2 用例 FAIL（404，端点未实现）。

- [ ] **Step 3: 实现端点**

在 `src/routes/api.js` 中、`// ---- 配置 ----` 之前插入（`qb`/`db`/`wrongbook`/`sessions` 均已 require）：

```js
// ---- AI解析：组装首条提示词 ----
const AI_PREFIX = '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法';

function tfText(v) { return v === true || v === 'true' ? '正确' : '错误'; }

router.get('/wrong/:id/ai-context', asyncH(async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(400).json({ error: '非法的 ID' });
  const w = wrongbook.get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: '错题不存在' });
  const hit = qb.getQuestion(w.exam_id, w.question_id);
  if (!hit) return res.status(404).json({ error: '题目已不在题库' });
  const q = hit.question;

  // 题目块
  let qBlock = q.stem || q.title || '';
  if (q.type === 'choice' && q.options) {
    for (const k of Object.keys(q.options)) qBlock += '\n' + k + '. ' + q.options[k];
  } else if (q.type === 'programming') {
    if (q.input_format) qBlock += '\n输入格式：' + q.input_format;
    if (q.output_format) qBlock += '\n输出格式：' + q.output_format;
  }

  // 出错信息块：反查用户最近一次作答
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

  const message = AI_PREFIX + '\n\n【题目】\n' + qBlock + '\n\n【出错信息】\n' + errBlock;
  const s = db.allSettings();
  res.json({
    message,
    config: { baseUrl: s.ai_base_url, apiKey: s.ai_api_key, model: s.ai_model }
  });
}));
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`，2 个新用例通过。

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.js test/api.test.js
git commit -m "feat: 新增 /api/wrong/:id/ai-context 组装 AI 解析首条提示词"
```

---

## Task 6: 错题卡片加【AI解析】按钮 + AI 对话窗骨架（前端标记/样式）

**Files:**
- Modify: `src/views/review.ejs`（卡片按钮 + 页尾 AI 弹窗骨架）
- Modify: `src/public/css/app.css`（AI 弹窗/气泡/按钮态样式）

- [ ] **Step 1: review.ejs 卡片加【AI解析】按钮**

定位 `src/views/review.ejs` 的操作列（约 64–68 行）：

```ejs
      <div class="wc-actions">
        <button class="btn btn-ghost btn-note">添加备注</button>
        <% if (w.status === 'active') { %><button class="btn btn-ghost btn-master">标记掌握</button><% } %>
        <button class="btn btn-ghost btn-del">删除</button>
      </div>
```

替换为（在"添加备注"下新增"AI解析"）：

```ejs
      <div class="wc-actions">
        <button class="btn btn-ghost btn-note">添加备注</button>
        <button class="btn btn-ghost btn-ai">AI解析</button>
        <% if (w.status === 'active') { %><button class="btn btn-ghost btn-master">标记掌握</button><% } %>
        <button class="btn btn-ghost btn-del">删除</button>
      </div>
```

- [ ] **Step 2: review.ejs 页尾加 AI 对话窗骨架**

在 `src/views/review.ejs` 中、`<%- include('partials/foot', { extraJs: extraJs }) %>` 之前插入：

```ejs
<div class="modal-overlay" id="aiModal">
  <div class="modal-box ai-modal-box">
    <div class="ai-modal-head">
      <h3>🤖 AI解析 · 错题 <span id="aiWrongId"></span></h3>
      <button class="ai-x" id="btnAiCloseX" title="关闭">✕</button>
    </div>
    <div class="ai-history" id="aiHistory"></div>
    <textarea class="ai-input" id="aiInput" placeholder="输入追问…（Enter 发送）"></textarea>
    <div class="ai-actions">
      <button class="btn btn-primary" id="btnAiSend">发送</button>
      <button class="btn btn-ghost" id="btnAiCopy" disabled>📋 复制到备注</button>
      <button class="btn btn-ghost" id="btnAiClose">关闭</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: app.css 追加 AI 弹窗样式**

在 `src/public/css/app.css` 末尾追加：

```css
/* AI解析 对话窗 */
.ai-modal-box { max-width: 720px; width: 94%; display: flex; flex-direction: column; max-height: 86vh; }
.ai-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ai-modal-head h3 { margin: 0; font-size: 18px; color: var(--brand-800); }
.ai-x { background: transparent; border: none; font-size: 18px; color: var(--neutral-400); cursor: pointer; }
.ai-x:hover { color: var(--danger-600); }
.ai-history { flex: 1; overflow-y: auto; min-height: 40vh; max-height: 50vh; display: flex; flex-direction: column; gap: 10px;
  padding: 12px; background: var(--neutral-25); border-radius: var(--r-md); border: 1px solid var(--neutral-75); }
.ai-bubble { max-width: 82%; padding: 9px 13px; border-radius: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.ai-bubble.user { align-self: flex-end; background: #dceefb; color: #123; border-bottom-right-radius: 3px; }
.ai-bubble.ai { align-self: flex-start; background: #fff; border: 1px solid var(--neutral-75); color: #222; border-bottom-left-radius: 3px; }
.ai-bubble.err { align-self: flex-start; background: #fdecea; color: var(--danger-600); border: 1px solid #f5b7b1; }
.ai-bubble pre { background: #282c34; color: #abb2bf; padding: 8px 10px; border-radius: 6px; overflow-x: auto;
  font-family: var(--font-code); font-size: 12px; margin: 6px 0; white-space: pre; }
.ai-input { margin-top: 10px; min-height: 52px; resize: vertical; padding: 10px 12px; border: 1px solid var(--neutral-150);
  border-radius: var(--r-md); font-size: 14px; font-family: inherit; }
.ai-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.ai-actions .btn[disabled] { opacity: .5; cursor: not-allowed; }
```

- [ ] **Step 4: 手工验证（仅标记，逻辑下一任务）**

```bash
node server.js &   # 或重启
sleep 2
curl -s "http://localhost:8730/review" | grep -c 'btn-ai'        # 期望 >=1
curl -s "http://localhost:8730/review" | grep -c 'id="aiModal"'  # 期望 1
```
（此时点【AI解析】还没反应，逻辑在 Task 7 实现。）

- [ ] **Step 5: Commit**

```bash
git add src/views/review.ejs src/public/css/app.css
git commit -m "feat: 错题卡片加 AI解析按钮 + AI 对话窗骨架与样式"
```

---

## Task 7: AI 对话窗逻辑（流式 + 多轮 + 复制备注）

**Files:**
- Modify: `src/public/js/review.js`（新增 AI 弹窗逻辑）

- [ ] **Step 1: review.js 追加 AI 逻辑**

在 `src/public/js/review.js` 的 IIFE 内、`listEl.addEventListener('click', ...)` 委托里，`btn-note` 分支后新增 `btn-ai` 分支；并在 IIFE 末尾（`filterForm` 逻辑之前或之后均可）追加 AI 模块。

先在点击委托中、`} else if (e.target.classList.contains('btn-master')) {` 之前插入：

```js
    } else if (e.target.classList.contains('btn-ai')) {
      openAi(id);
```

> 注意：插入后确保 `if/else if` 链完整（`btn-note` → `btn-ai` → `btn-master` → `btn-del`）。

然后在 IIFE 内追加 AI 模块（放在 `notePreview` 那段之前）：

```js
  // ===== AI解析 对话窗 =====
  const aiModal = document.getElementById('aiModal');
  const aiHistory = document.getElementById('aiHistory');
  const aiInput = document.getElementById('aiInput');
  const btnAiSend = document.getElementById('btnAiSend');
  const btnAiCopy = document.getElementById('btnAiCopy');
  let aiMessages = [];          // [{role, content}]
  let aiBusy = false;
  let aiTarget = null;          // 当前错题 id

  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 把 ``` 围栏转成 <pre>，其余转义
  function renderAiText(s) {
    return String(s).split('```').map((part, i) =>
      i % 2 === 1 ? '<pre>' + escHtml(part.replace(/^\n/, '')) + '</pre>' : escHtml(part)
    ).join('');
  }
  function addBubble(role, html, isHtml) {
    const b = document.createElement('div');
    b.className = 'ai-bubble ' + role;
    if (isHtml) b.innerHTML = html; else b.textContent = html;
    aiHistory.appendChild(b);
    aiHistory.scrollTop = aiHistory.scrollHeight;
    return b;
  }

  async function openAi(wrongId) {
    aiTarget = wrongId;
    document.getElementById('aiWrongId').textContent = '#' + wrongId;
    aiHistory.innerHTML = '';
    aiMessages = [];
    btnAiCopy.disabled = true;
    aiInput.value = '';
    aiModal.classList.add('show');
    try {
      const ctx = await App.getJSON('/api/wrong/' + wrongId + '/ai-context');
      aiMessages.push({ role: 'user', content: ctx.message });
      addBubble('user', ctx.message, false);
      await streamAi(ctx.config);
    } catch (e) {
      addBubble('err', '无法获取题目上下文：' + e.message, false);
    }
  }

  async function streamAi(config) {
    aiBusy = true; btnAiSend.disabled = true; btnAiSend.textContent = 'AI 正在回答…';
    const bubble = addBubble('ai', '', true);
    let acc = '';
    try {
      const resp = await fetch(config.baseUrl.replace(/\/$/, '') + '/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model: config.model, max_tokens: 2048, messages: aiMessages, stream: true })
      });
      if (!resp.ok) throw new Error('AI 服务返回 HTTP ' + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) {
            acc += ev.delta.text;
            bubble.innerHTML = renderAiText(acc);
            aiHistory.scrollTop = aiHistory.scrollHeight;
          }
        }
      }
      if (!acc) throw new Error('AI 未返回内容');
      aiMessages.push({ role: 'assistant', content: acc });
      btnAiCopy.disabled = false;
    } catch (e) {
      bubble.remove();
      addBubble('err', '无法连接 AI 服务：' + e.message + '。请检查系统配置里的 AI 设置或稍后再试。', false);
    } finally {
      aiBusy = false; btnAiSend.disabled = false; btnAiSend.textContent = '发送';
    }
  }

  btnAiSend.addEventListener('click', async () => {
    if (aiBusy) return;
    const text = aiInput.value.trim();
    if (!text) return;
    aiInput.value = '';
    aiMessages.push({ role: 'user', content: text });
    addBubble('user', text, false);
    // config 可能已随首次 openAi 拿到；若没有则重新取
    try {
      const ctx = await App.getJSON('/api/wrong/' + aiTarget + '/ai-context');
      await streamAi(ctx.config);
    } catch (e) {
      addBubble('err', '无法连接 AI 服务：' + e.message, false);
    }
  });
  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnAiSend.click(); }
  });

  btnAiCopy.addEventListener('click', async () => {
    const last = [...aiMessages].reverse().find(m => m.role === 'assistant');
    if (!last) return;
    const content = last.content.replace(/\n{3,}/g, '\n\n').trim();
    const card = document.querySelector('.wrong-card[data-id="' + aiTarget + '"]');
    const existing = card ? (card.dataset.note || '') : '';
    const merged = (existing ? existing + '\n' : '') + '---\n【AI解析】\n' + content;
    try {
      await App.patchJSON('/api/wrong/' + aiTarget, { note: merged });
      App.toast('AI 解析已追加到备注');
      setTimeout(() => location.reload(), 400);
    } catch (e) { App.toast('保存失败：' + e.message, true); }
  });

  function closeAi() { aiModal.classList.remove('show'); aiMessages = []; aiTarget = null; }
  document.getElementById('btnAiClose').addEventListener('click', closeAi);
  document.getElementById('btnAiCloseX').addEventListener('click', closeAi);
  aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAi(); });
```

- [ ] **Step 2: 手工验证**

启动服务，浏览器打开 `/review`，对任一错题点【AI解析】：
- 弹窗出现，自动显示"我"的首条消息，随后 AI 流式打字回复。
- 追问一句，AI 再次回复（上下文带上历史）。
- 点【复制到备注】→ toast，刷新后备注里出现"【AI解析】"。
- 若 liteLLM 不可达/CORS 被拒，出现红色错误气泡（不静默）。

> 离线无法联调真实 AI 时，至少验证：弹窗打开、首条"我"气泡出现、AI 不可达时红色错误气泡。

- [ ] **Step 3: Commit**

```bash
git add src/public/js/review.js
git commit -m "feat: AI解析对话窗——流式多轮对话 + 复制到备注"
```

---

## Task 8: 集成验证与手工验收

**Files:** 无（验证）

- [ ] **Step 1: 全量单测**

Run: `npm test`
Expected: 全部通过（含新增的 AI 配置、迁移、ai-context 用例）。

- [ ] **Step 2: 手工验收清单**

- [ ] `/settings` 有"AI 服务"卡片，4 项可保存、刷新保留、"恢复默认"生效。
- [ ] 导航有【AI问答】，点进整页 iframe；目标不可嵌入时出现兜底提示与新标签页链接。
- [ ] `/review` 每题有【AI解析】；弹窗三区结构；流式打字机；追问多轮；【复制到备注】追加分隔；发送中按钮置灰；无回复时复制置灰。
- [ ] AI 不可达时出红色错误气泡。
- [ ] 已有线上数据完好（旧配置值、历史考试、错题、提交记录都在）。
- [ ] 重启服务后 `schema_version` 写入且无多余备份文件（纯增量不触发备份）。

- [ ] **Step 3: Commit（如有验收期微调）**

```bash
git add -A
git commit -m "chore: AI 功能集成验收"
```

---

## 自查记录（写计划者）

- **规格覆盖**：①AI问答→Task4；②AI解析按钮→Task6；③三区对话窗→Task6(骨架)+Task7(逻辑)；④4 配置项→Task1+Task3；⑤版本化迁移+备份→Task2；ai-context 端点→Task5；集成验收→Task8。规格 §8.4"本次升级不迁移不备份"由 Task2 的 `ensureMigrated`（stored=0 直接写版本、不备份）实现并有测试覆盖。
- **类型/命名一致**：`ai_webui_url/ai_base_url/ai_api_key/ai_model` 在 Task1/3/4/5 一致；`ensureMigrated/CURRENT_SCHEMA_VERSION/MIGRATIONS/backupDb` 在 Task2 内一致；`openAi/streamAi/aiMessages` 在 Task7 内一致；端点 `/api/wrong/:id/ai-context` 在 Task5/7 一致。
- **风险**：前端直连依赖 liteLLM 开 CORS（规格 §9 已声明为限制，错误气泡兜底）。
