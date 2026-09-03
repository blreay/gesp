# AI 解析后台自动化 设计

日期：2026-09-03
状态：已与用户确认口径与方案（进度推送采用前端轮询，即"方案 A"）

## 1. 目标

在现有 AI 解析（单题手动）基础上，增加后台自动化能力：

1. **系统提示词可配置**：把写死的系统提示词提炼为配置项，可在【系统配置】修改并存库。
2. **自动解析**：新增开关与并发数配置；开启后，每次判卷把本次新增错题自动后台 AI 解析并写入备注。错题复习页顶端显示进度提示条（完成数/总数）与【终止】按钮；任务全部完成后提示条与按钮消失；判卷进行中若有新考试提交，新任务并入队列、总数更新。
3. **全量 AI 解析**：【系统配置】新增按钮，后台按并发数把所有"备注为空"的错题解析并写入备注。
4. **优化默认提示词**：追加一句"尽量精简回答，把结果控制到2000字以内（代码除外）"。

## 2. 已确认的口径（来自用户）

| 项 | 口径 |
| --- | --- |
| 备注已有内容的错题 | **跳过**，不调用 AI、不改动备注（自动与全量统一：只解析空备注） |
| 全量解析进度呈现 | 点击后**跳转到错题复习页**，与自动解析共用同一条进度提示条 |
| 服务器重启 | 任务队列在**内存**，重启丢失（已写入备注不受影响）；不做持久化 |
| 进度推送 | 前端**轮询** `GET /api/ai-parse/status`（方案 A），约 1.5s 一次 |

## 3. 配置项（数据库兼容：不迁移、只加键）

在 `src/services/db.js` 的 `DEFAULT_SETTINGS` 新增 3 个键。种子化走现有 `INSERT OR IGNORE`（`open()` 每次打开执行），`SETTING_KEYS`（`Object.keys(DEFAULT_SETTINGS)`）自动纳入白名单。**不改表结构、不升 `schema_version`**，对老库完全兼容。

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `ai_system_prompt` | 见 §4 | 系统提示词（多行文本） |
| `ai_auto_parse` | `'0'` | 自动解析开关：`'1'` 开 / `'0'` 关 |
| `ai_parse_concurrency` | `'4'` | 后台并发数（前端 `min=1`；服务端 clamp 到 1..16） |

`ai_system_prompt` 默认值（= 当前写死提示词 + 新增精简要求）：

```
这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）
```

> 说明：`POST /settings` 对空值会跳过保存，因此把提示词"清空"不会写入空串；读取侧对空值一律回退到内置默认（§4），行为一致。

## 4. 系统提示词提炼与共享上下文构建

现状：`api.js` 顶部 `const AI_PREFIX = '...'`（约 276 行），仅被 `GET /wrong/:id/ai-context` 用于拼首条消息；题目块 `qBlock`、出错信息块 `errBlock`、`tfText()` 也内联在该端点。

改造：新增服务 `src/services/aicontext.js`，把拼装逻辑抽出，端点与后台任务共用，保证两条路径提示词一致：

```js
// 默认系统提示词（内置，供空值回退）
const DEFAULT_AI_PROMPT = '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）';

// 构建一道错题的 AI 解析首条消息。
// 返回 { message } 成功；{ error: '错题不存在' | '题目已不在题库' } 失败。
function buildMessage(wrongId) {
  // 1) wrongbook.get(wrongId) 不存在 → { error:'错题不存在' }
  // 2) qb.getQuestion(exam_id, question_id) 不存在 → { error:'题目已不在题库' }
  // 3) qBlock / errBlock：完全沿用现端点逻辑（choice 选项、programming 输入/输出格式、
  //    反查最近一次作答、编程题附最近提交代码与判题结果、客观题附你的答案/正确答案/解析）
  // 4) systemPrompt = db.getSetting('ai_system_prompt')；为空回退 DEFAULT_AI_PROMPT
  // 5) return { message: systemPrompt + '\n\n【题目】\n' + qBlock + '\n\n【出错信息】\n' + errBlock }
}
module.exports = { buildMessage, DEFAULT_AI_PROMPT };
```

`GET /wrong/:id/ai-context` 改为调用 `buildMessage(wrongId)`：`error` → `404 {error}`；成功 → `200 { message, config }`（`config` 仍含 `baseUrl/apiKey/model/showThinking`，不变）。删除原内联拼装与 `AI_PREFIX` 常量。

## 5. 后台解析服务 `src/services/aiparse.js`（核心）

内存任务队列 + 并发池。**单用户、秒级任务**，不引入外部依赖。

### 5.1 状态

```js
let queue = [];            // 待处理错题 id
let running = 0;           // 正在执行的任务数
let total = 0;             // 本批次累计任务数（新任务并入时增大）
let done = 0;              // 已处理（成功 + 跳过 + 失败）
let failed = 0;            // 失败数（done 的子集）
let abortFlag = false;
const inFlight = new Set(); // 在途请求的 AbortController
```

`status()` 返回 `{ active: queue.length>0 || running>0, total, done, failed }`。

### 5.2 主要函数

- **`enqueue(wrongIds)`**：入队前先过滤非法值。若当前空闲（`queue` 空且 `running===0`），重置 `total=done=failed=0`、`abortFlag=false`。`queue.push(...)`、`total += n`，随后 `pump()`。**已有任务在跑时继续入队，`total` 自动增大**（满足"新考试并入"）。
- **`pump()`**：循环条件 `running < concurrency() && queue.length && !abortFlag`；取队首 `wrongId`，`running++`，异步执行 `runOne(wrongId)`，`finally` 里 `running--` 并再次 `pump()`。
- **`concurrency()`**：`Math.min(16, Math.max(1, parseInt(db.getSetting('ai_parse_concurrency'),10) || 4))`（实时读取，运行中改配置即时生效）。
- **`runOne(wrongId)`**：
  1. `w = wrongbook.get(wrongId)`；不存在 → 跳过（`done++`，不计失败）。
  2. `w.note` 非空（`trim()` 后）→ 跳过（`done++`，不计失败）。【只解析空备注】
  3. `r = aicontext.buildMessage(wrongId)`；`r.error` → `failed++; done++`。
  4. 调 `callAi([{role:'user',content:r.message}])`（见 5.3），带在途 `AbortController`。
  5. 成功 → 写备注：`wrongbook.setNote(wrongId, '---\n【AI解析】\n' + answer, w.note_knowledge)`；`done++`。（与手动"复制到备注"格式一致；`note_knowledge` 不变。）
  6. 抛错 → 若 `abortFlag` 为真（用户主动终止）只 `done++` 不计失败；否则 `failed++; done++`，备注保持空（下次全量可重试）。
- **`abort()`**：`abortFlag=true`；`queue.length=0` 前先把 `total -= queue.length`（保持 done/total 自洽）；清空队列；对 `inFlight` 逐个 `controller.abort()`。
- **`callAi(messages)`**（非流式，供后台用）：读 `db.allSettings()`，`POST {ai_base_url}/v1/chat/completions`，`stream:false`、`chat_template_kwargs:{enable_thinking:false}`（后台只取干净的最终答案，不受 `ai_show_thinking` 显示开关影响）、`max_tokens` 取 `ai_max_tokens`。返回 `choices[0].message.content`；HTTP 非 200 或内容为空都抛错。**超时**：`AbortController` + `setTimeout` 180s，超时抛"AI 解析超时"。

### 5.3 可测性

`callAi` 作为可替换实现：模块内 `let aiCallImpl = callAi`，导出 `_setAiCall(fn)` / `_resetAiCall()`。测试注入假实现，不连真实模型。

## 6. API 端点（`src/routes/api.js` 追加）

- **`GET /api/ai-parse/status`** → `aiparse.status()`。
- **`POST /api/ai-parse/abort`** → `aiparse.abort()`，返回 `{ ok:true }`。
- **`POST /api/ai-parse/full`** → 查 `wrong_questions` 中 `TRIM(COALESCE(note,'')) = ''` 的全部错题，`enqueue` 其 id，返回 `{ queued: N }`。
- **判卷自动触发**（改 `POST /attempts/:attemptId/grade` 末尾）：`finalize()` 之后、`res.json` 之前，若 `settingsObj().ai_auto_parse === '1'` 且 `wrongAdded.length`，把 `wrongAdded` 反查成错题本 id（`wrongbook.getByQuestion(att.exam_id, qid).id`，过滤 null）后 `aiparse.enqueue(ids)`。

> 端点均同步返回（入队是内存操作，AI 调用在后台异步进行），判卷请求不会被 AI 拖慢。

## 7. 前端

### 7.1 错题复习页进度提示条（`review.ejs` + `review.js` + `app.css`）

`review.ejs`：`<main class="page-main">` 内、`page-head` 之前，插入：

```ejs
<div class="aiparse-banner" id="aiParseBanner" style="display:none">
  <span id="aiParseText"></span>
  <button class="btn btn-danger aiparse-abort" id="btnAiParseAbort">终止</button>
</div>
```

`review.js` 新增轮询逻辑：
- 页面加载即查一次 `GET /api/ai-parse/status`。
- `active===true`：显示提示条，文案 `自动AI解析任务进行中（done/total）`；`failed>0` 时追加 `，N 个失败`；1.5s 后再次轮询（保存定时器，避免重复）。
- `active===false`：隐藏提示条（按钮随之消失）、停止轮询。
- 【终止】点击 → `POST /api/ai-parse/abort` → 立即再查一次状态刷新。

`app.css` 追加 `.aiparse-banner` 样式（提示条横向布局，`aiparse-abort` 右对齐，与现有 `.btn-danger` 复用）。

### 7.2 系统配置页（`settings.ejs` + `settings.js`）

`settings.ejs`「AI 服务」卡片内新增：
- `ai_system_prompt`：`<textarea>`（多行，占满一行）。
- `ai_auto_parse`：`<select>` 关闭(`0`)/开启(`1`)。
- `ai_parse_concurrency`：`<input type="number" min="1">`。
- 【全量AI解析】按钮 `id="btnFullParse"`。

`settings.js`：`KEYS`/`DEFAULTS` 加入三键；`btnFullParse` 点击 → `POST /api/ai-parse/full` → 若 `queued>0` toast"已启动，共 N 题"并 `location.href='/review'`；否则 toast"没有需要解析的错题（备注都为空才解析）"。`btnSave`/`btnReset` 走现有通用逻辑（自动带上三键）。

## 8. 错误处理与边界

- 单任务失败（网络/超时/题目缺失/空回复）计 `failed`，不中断其它任务，备注保持空可重试。
- 用户【终止】：中止在途请求 + 清空队列；已写入备注保留。终止后 `active` 归假，提示条消失。
- 并发数实时读取，运行中调整即时生效（上限 16，下限 1）。
- 服务重启：内存队列清空，提示条因 `active` 为假自动不显示；已写备注不受影响。
- 只解析空备注：执行时再次检查（用户可能入队后手动加了备注），避免覆盖。
- 后台调用固定 `enable_thinking:false`，只取最终答案入备注（与"复制到备注仅最终答案"一致）。

## 9. 测试

- **服务层 `test/aiparse.test.js`**（注入假 `callAi`，不连真实模型）：
  - 入队多道空备注错题 → 全部写入 `---\n【AI解析】\n…`，`status` 达 `done===total`、`active` 归假。
  - 备注非空 → 跳过且备注不变。
  - 并发：`ai_parse_concurrency=2` + 慢假实现，验证同时在跑数 ≤2。
  - `abort()`：中止在途 + 清空队列，`active` 归假，已写备注保留。
  - 假实现抛错 → `failed` 计数、备注保持空、不中断后续。
  - 题目已不在题库 → `failed`，不崩溃。
  - 系统提示词生效：假实现捕获 `messages`，断言首条以配置的 `ai_system_prompt` 开头。
- **接口层 `test/api.test.js` 追加**：
  - `POST /api/ai-parse/full` 只入队空备注错题（返回 `queued` 正确）。
  - `GET /api/ai-parse/status` 结构；`POST /api/ai-parse/abort` 返回 `ok`。
  - 判卷前设 `ai_auto_parse='1'`，判卷后 `status.active===true`（注入假 `callAi` 避免真实请求）。
- **无头端到端 `/tmp/pwtest/verify_aiparse.js`**（用真实模型）：造 2 道空备注错题 → 触发全量 → 提示条出现且 `（0/2）→…→（2/2）` 推进 → 完成后提示条消失、备注含 `【AI解析】`；运行中验证【终止】按钮存在。

## 10. 不做（YAGNI）

- 不持久化任务队列/不做重启恢复（用户已选内存方案）。
- 不引入 SSE/WebSocket（轮询已满足，方案 A）。
- 不做单任务重试、不做逐任务详情/日志查看界面。
- 不改动现有单题手动 AI 解析的交互。
