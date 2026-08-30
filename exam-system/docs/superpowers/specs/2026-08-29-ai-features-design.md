# AI 功能（AI问答 + AI解析）设计文档

- 日期：2026-08-29
- 项目：`/home/admin/git/richie_gesp/exam-system`（GESP 在线模拟考试系统）
- 状态：已与用户逐节确认

## 1. 目标

为现有考试系统增加三块 AI 能力：

1. **AI问答板块**：导航新增板块，整页 iframe 嵌入可配置 URL 的 Open WebUI。
2. **AI解析按钮**：错题复习页每张错题卡片新增【AI解析】按钮，弹窗自动携带题目+出错信息+固定前缀，经 HTTP 直连 liteLLM 多轮流式对话。
3. **AI对话窗**：三区结构（聊天历史区 / 输入框 / 操作按钮行），支持多轮上下文、流式打字机、一键把 AI 回复整理后追加进错题备注。

技术基调沿用现有栈：Express + EJS 服务端渲染 + 原生 JS，**不引前端构建、不引重型依赖**。

## 2. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| AI 请求路径 | **前端直连** liteLLM（浏览器 `fetch` 直接打 `ai_base_url`），不经我们后端转发。前提：liteLLM 需对本源开启 CORS。 |
| API 格式 | **Anthropic Messages**：`POST {base}/v1/messages`，头 `x-api-key` + `anthropic-version: 2023-06-01`，体 `{model, max_tokens, messages:[{role,content}], stream:true}`。 |
| 回复展示 | **流式打字机**（`stream:true`，前端解析 SSE 累积 `delta.text`）。 |
| AI解析窗布局 | **方案B**：聊天历史区在上；输入框独占一行；发送/复制到备注/关闭三按钮并排沉底。 |
| 复制到备注 | **追加**到已有备注后，用分隔线隔开，不覆盖手写笔记。 |
| AI问答嵌入 | 整页 `<iframe>`，URL 可配置，默认 `http://121.40.190.90:3000/`。 |

## 3. 配置项（新增 4 个，进【系统配置】页）

| key | 默认值 | 用途 |
|---|---|---|
| `ai_webui_url` | `http://121.40.190.90:3000/` | AI问答 iframe 地址 |
| `ai_base_url` | `http://121.40.190.90:4000` | liteLLM 基础地址 |
| `ai_api_key` | `sk-vllm-aaa-bbb` | liteLLM 鉴权 |
| `ai_model` | `qwen-local` | 模型名 |

实现：`db.js` 的 `DEFAULT_SETTINGS` 追加这 4 键（自动进入 `SETTING_KEYS` 白名单并播种默认值）；`settings.ejs` 增"AI 服务"卡片组；`settings.js` 的 `KEYS`/`DEFAULTS` 同步。保存走现有 `POST /api/settings`，即时生效（每次读库）。

## 4. 功能① AI问答板块

- `nav.ejs`：在【数据统计】与【系统配置】之间插入 `<a href="/ai">AI问答</a>`（即"系统配置左边"）。
- `pages.js` 新增 `GET /ai`；新视图 `ai.ejs`：`<iframe src="<%= settings.ai_webui_url %>">` 撑满导航栏以下视口，无边框。
- 兜底：若目标站点禁止被嵌入（`X-Frame-Options`/`frame-ancestors`），iframe 空白——页面给一行友好提示（"若此处空白，可能是目标站点不允许被嵌入，请在新标签页打开：<URL>"）。

## 5. 功能②③ AI解析

### 5.1 新端点 `GET /api/wrong/:id/ai-context`

只负责组装首条提示词（真正 AI 调用由前端直连）。返回：
```
{ message, config: { baseUrl, apiKey, model } }
```
- `config` 从 `settings` 读 `ai_base_url/ai_api_key/ai_model`。
- `message` 为拼好的首条用户消息（见 5.2）。
- 错题不存在返回 404。

### 5.2 首条消息 `message` 拼装（后端完成，顺序固定）

```
这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法

【题目】
<题干，含代码块>
<选择题附选项 A/B/C/D>

【出错信息】
你的答案：C（错误）
正确答案：B
（若有解析则附：解析……）
```
- **固定前缀**（用户指定原句）作为第一行。
- 题目内容：题干（含 ``` 代码块原文）；选择题附选项。
- 出错信息按题型：
  - 选择/判断：按 `wrong_questions.exam_id` 找该卷**最近一次 attempt**，从 `exam_answers` 反查该题作答（选择题字母 / 判断题 `true`/`false`），写"你的答案：X（错误）/ 正确答案：Y"。反查不到则省略"你的答案"行。
  - 编程题：取最近一次提交的代码 + 判题失败输出，替换【出错信息】块。

### 5.3 多轮对话（前端维护 `messages` 数组）

1. 开窗 → `messages = [{role:'user', content: message}]`，立即发送。
2. 收到 AI 回复 → `push {role:'assistant', content}`。
3. 用户追问 → `push {role:'user', content}`，**把整个 `messages` 重发**（历史全量打包进 context，标准聊天模式）。
4. 循环。对话不持久化，关窗即弃。

### 5.4 流式

- 前端 `fetch(baseUrl + '/v1/messages', {method:'POST', headers:{'x-api-key':…, 'anthropic-version':'2023-06-01', 'content-type':'application/json'}, body: JSON.stringify({model, max_tokens, messages, stream:true})})`（`stream` 在**请求体**里，不是 fetch 选项）。
- `ReadableStream` 逐块解析 SSE，累积 `content_block_delta.delta.text`，打字机式追加到当前 AI 气泡。
- 期间【发送】置灰 + "AI 正在回答…"；结束/出错恢复。
- 结束信号：`message_stop` 事件（或流读完）。

### 5.5 窗口布局（方案B）

```
┌─ AI解析 · 错题 #12 ──────────────── ✕ ─┐
│ ① 聊天历史区（可滚动，约 50vh）          │
│   [我] 右对齐浅蓝气泡                   │
│   [AI] 左对齐浅灰气泡（代码块 <pre>）    │
│ ─────────────────────────────────────── │
│ ② [ 输入新消息…               ]         │
│    [发送]  [📋 复制到备注]  [关闭]       │
└───────────────────────────────────────┘
```
- 弹窗宽约 720px。
- 【发送】：处理中置灰"AI 正在回答…"；空输入不发。
- 【复制到备注】：**无任何 AI 回复时置灰**；有回复后复制最近一条。
- 【关闭】/ ✕ / 点遮罩：关窗。
- AI 回复中的 ``` 围栏转 `<pre>` 渲染。

### 5.6 复制到备注（追加）

- 取最近一条 AI 回复完整文本，去掉多余空行。
- 追加到该错题 `note` 末尾：`\n---\n【AI解析】\n<内容>`；`note_knowledge` 不动。
- 走现有 `PATCH /api/wrong/:id`；成功后刷新该卡片备注预览 + toast。

### 5.7 错误处理

- CORS 被拒 / 网络失败 / 非 200 / SSE 解析失败 → 聊天区显示红色错误气泡（如"无法连接 AI 服务，请检查系统配置里的 AI 设置或稍后再试"），不静默。

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/services/db.js` | `DEFAULT_SETTINGS` 增 4 键；新增 `schema_version` 版本标记 + `MIGRATIONS` 迁移钩子 + `backupDb()` 升级前备份（见 §8） |
| `src/routes/api.js` | 新增 `GET /api/wrong/:id/ai-context` |
| `src/routes/pages.js` | 新增 `GET /ai` |
| `src/views/nav.ejs` | 插【AI问答】导航项 |
| `src/views/ai.ejs` | 新建：整页 iframe + 兜底提示 |
| `src/views/review.ejs` | 卡片加【AI解析】按钮 + 页尾 AI 弹窗骨架 |
| `src/public/js/review.js` | AI 弹窗：取 context、流式、多轮、复制备注 |
| `src/public/css/app.css` | AI 弹窗/气泡/按钮态样式 |
| `src/views/settings.ejs` + `src/public/js/settings.js` | "AI 服务"配置组 + 4 键 |

## 7. 测试

- 后端可单测：`GET /api/wrong/:id/ai-context` 结构正确（含固定前缀、题干、"你的答案"反查）；`GET /api/settings` 含 4 新键；`ai-context` 对不存在错题返回 404。
- 迁移机制单测：全新库启动后 `schema_version=1`；预置 `schema_version=0/1` 的库再开不重复迁移；注入一条假 `MIGRATIONS[2]` 验证"先备份再迁移再升版"链路（备份文件生成、版本递增）。
- 流式/真实 AI 调用无法离线单测 → 归入手工验收清单（含 CORS 失败的错误气泡）。

## 8. 数据库兼容性与升级安全

本次 AI 功能对库是**纯增量**（只往 `settings` 加 4 键，不建/不改表），**已有数据 100% 保留**。为长远计，再引入**版本化迁移机制 + 升级前自动备份**，确保今后任何改表结构的升级都不丢数据。

### 8.1 版本标记 `schema_version`
- `db.js` 增常量 `CURRENT_SCHEMA_VERSION = 1`。
- `schema_version` 存于 `settings` 表，但**不进 `DEFAULT_SETTINGS`**（避免出现在配置页被误改），由迁移逻辑独占管理。
- 启动时 `db.exec(SCHEMA)`（幂等建表）后执行 `ensureMigrated()`：
  - 读已存 `schema_version`；
  - **缺失（=0，旧库升级或全新库）** → 直接写为 `CURRENT`（表已由幂等 SCHEMA 建好，无需迁移、无需备份）；
  - **已存 < CURRENT** → **先备份**，再按序执行 `MIGRATIONS[stored+1 .. CURRENT]`，最后更新版本号。

### 8.2 迁移钩子 `MIGRATIONS`
```js
const MIGRATIONS = {
  // 2: (db) => { /* 未来改表结构的迁移写这里 */ },
  // 3: ...
};
```
当前为空（v1 无结构变更）。以后真要改表结构时，新增对应版本的迁移函数并把 `CURRENT_SCHEMA_VERSION` +1，机制自动接管。

### 8.3 升级前自动备份 `backupDb()`
- 触发时机：仅当"已存版本 > 0 且 < 当前版本"（即真正要跑结构迁移）时。
- 动作：`PRAGMA wal_checkpoint(TRUNCATE)` 落盘 WAL → 复制 `exam.db` 为 `exam.db.bak-<时间戳>`。
- 任何一次结构性升级前自动留快照，可回滚。

### 8.4 本次 AI 升级的实际影响（对线上库）
- 现有库无 `schema_version` 键 → 首次启动被写为 1，**不触发迁移、不触发备份**（无结构变更）。
- `settings` 经 `INSERT OR IGNORE` 追加 4 个 AI 键；你已改过的 5 个旧配置**原样保留**。
- 97 作答 / 32 错题 / 36 提交 / 8 场考试等用户数据不受影响。
- 启动时 `scan()` 的 `DELETE FROM exams` 只重建题库元数据索引（非用户数据），`foreign_keys=OFF` 不级联、exam_id 不变，既有行为不变。
- **部署建议**：虽为纯增量，仍建议上线前手动留一份快照（`PRAGMA wal_checkpoint(TRUNCATE); cp exam.db exam.db.bak-$(date +%F)`）。

## 9. 非目标 / 限制

- 不做多用户、鉴权（单用户系统）。
- AI 对话历史不持久化（关窗即弃）。
- AI问答板块仅做 iframe 嵌入，不做深度集成/反向代理。
- 前端直连要求 liteLLM 开 CORS；未开则前端报错误气泡（设计上明确提示）。
