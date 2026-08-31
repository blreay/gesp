# 在线模拟考试系统 · 测试报告

- 日期：2026-08-31
- 被测系统：`/home/admin/git/richie_gesp/exam-system`（Express + EJS + better-sqlite3）
- 测试方式：① 自动化单测（`node --test`）② 无头浏览器（Chrome for Testing 152 + Playwright）端到端 ③ 接口探活
- 测试环境：容器内起服务，临时库 + 临时题库（不碰生产数据）；另对生产库做只读验证

---

## 一、测试总览

| 层级 | 手段 | 结果 |
|---|---|---|
| 单元/集成测试 | `npm test`（node --test） | **49 / 49 通过** |
| 端到端（无头浏览器） | Playwright 全流程 | **主流程 28/29**（唯一未过项见"已知限制"） |
| 补充验证（判卷预览/错题选项/筛选/讲评态） | Playwright | **11 / 11 通过** |
| 编程判题 | 真实 g++ 编译 + 测试程序 | AC/WA/编译错误 三态均正确 |
| 数据库 | 版本化迁移 + 升级前备份 | 单测覆盖，回滚/降级/损坏均正确处理 |

---

## 二、功能测试结果（逐项，对应用户报告）

### 编程题
| 报告项 | 结果 | 证据 |
|---|---|---|
| 提交记录持久化，第二次打开仍在 | ✅ 通过 | 提交后离开再进入，提交记录仍在（不限 attempt） |
| 判题显示服务端执行日志（g++ 命令、输出、判错原因），可关闭、可上下调高度 | ✅ 通过 | 日志面板展示 `══ 编译学生代码 ══ $ g++ -O2 -std=c++…`；有关闭按钮；高度可拖拽并记忆 |
| 左右窗口拖拽分割线调整大小 | ✅ 通过 | 分割线存在，拖拽逻辑 + 宽度记忆（`prog_left_width`） |
| 编辑器按键不触发浏览器插件（Vimium C） | ✅ 已隔离 | Monaco 置于独立 `iframe`（`/editor-frame`），按键隔离在框架内；并做了失焦自动回焦 |

### 模拟考试页
| 报告项 | 结果 | 证据 |
|---|---|---|
| 已交卷后右上角【重新考试】 | ✅ 通过 | 讲评态显示【重新考试】，点击清空本次结果并重开 |
| 判卷后可继续作答，交卷后锁定 | ✅ 通过 | **判卷=预览**（不锁、可继续、考试仍 in_progress）；**交卷=终局**（锁定、重判编程、记错题） |
| 未答题判卷弹窗提示 | ✅ 通过 | 点判卷若有未答题弹"未完成"提示，可选"继续判卷" |
| 选择题含代码的题干正常显示代码 | ✅ 通过 | 题库 234 道代码跟踪题：191 道围栏代码块 + 43 道行内代码，渲染为 `<pre>`/`<code>` 正常 |

### 错题复习页
| 报告项 | 结果 | 证据 |
|---|---|---|
| 选择题显示选项 | ✅ 通过 | 错题卡片渲染全部选项（A/B/C/D） |
| 练习会话页返回按钮 | ✅ 通过 | `/review/session/:id` 有返回错题复习按钮 |
| 错题悬停弹出备注（含原始格式） | ✅ 通过 | 悬停错题卡片显示备注浮层（`pre-wrap` 保留换行） |
| 筛选自动触发 | ✅ 通过 | 级别/题型/分类/状态下拉改变即刷新，关键字 400ms 防抖 |

### AI 功能
| 功能 | 结果 | 证据 |
|---|---|---|
| AI问答板块（整页 iframe） | ✅ 通过 | `/ai` 渲染 `iframe` 指向 `ai_webui_url`（默认 121.40.190.90:3000，实测 200） |
| AI解析按钮 + 对话窗 | ✅ 通过 | 错题卡片【AI解析】→ 弹窗，自动带题目+出错信息+固定前缀 |
| AI 流式回复（多轮） | ⚠️ 功能正常，模型响应慢 | 前端 SSE 解析正确；实测 liteLLM 首 token 约 150–200 秒（见"已知限制"） |
| 复制到备注（追加） | ✅ 通过 | 取最近一条 AI 回复，以 `---\n【AI解析】` 追加到备注 |
| 4 个 AI 配置项 | ✅ 通过 | 配置页"AI 服务"组，保存/恢复默认正常 |

---

## 三、发现并修复的问题（本轮）

| # | 问题 | 修复 |
|---|---|---|
| 0 | **AI解析报"无法连接 AI 服务：Failed to fetch"（URL/key 都对）** | **根因=混合内容拦截**：页面走 HTTPS（公网代理），前端直连 `http://...:4000` 的 liteLLM 被浏览器按 Mixed Content 拦截（无头浏览器控制台复现：`Mixed Content ... blocked`）。**修复**：前端改调同源 `POST /api/ai/chat`，后端转发 liteLLM 并以 SSE 流式回传。已验证：前端调 `/api/ai/chat`（1 次）、直连 liteLLM 0 次 |
| 1 | AI 对话窗：流式进行中关窗/切换题目会污染状态 | 加 `AbortController` 取消 + 代际守卫（`aiRun`），旧流回调丢弃 |
| 2 | AI问答 iframe 晚加载时兜底提示不消失 | `load` 事件里同时隐藏兜底 |
| 3 | AI 弹窗 CSS 特异性依赖源码顺序 | 提升选择器特异性 + 追问输入加 `aria-label` |
| 4 | 迁移机制：降级静默改版本、迁移无事务、损坏版本放行、备份非原子 | 拒绝降级；迁移包事务（失败回滚）；校验 `NaN`/负数；改用 `VACUUM INTO` 原子备份 |
| 5 | `server.js` 库路径/题库目录不可配 | 支持 `EXAM_DB`/`EXAM_BANK_DIR` 环境变量 |

> 说明：编程页的"提交记录持久化、判题日志、拖拽分割线"经核查在拷贝基线（提交 `98e6110`）中已实现，本轮经无头浏览器逐项验证均可用，非新增。

---

## 四、从老版本升级到新版本（重要）

本版本（AI 功能）**不改表结构**，属纯增量升级，升级安全。升级依赖已内置的**版本化迁移 + 升级前备份**机制。

### 升级步骤
```bash
cd <项目目录>                       # 如 /home/admin/git/richie_gesp/exam-system

# 1.（推荐）先手动留一份数据库快照
sqlite3 data/exam.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp data/exam.db data/exam.db.bak-$(date +%F)

# 2. 更新代码
git pull                            # 或同步新代码

# 3. 依赖有变时重装（本版本无新增运行时依赖，可跳过；若 monaco/chart 版本变了需重拷 vendor）
npm install --no-audit --no-fund
# 若 monaco/chart.js 有更新：
#   cp -r node_modules/monaco-editor/min/vs src/public/vendor/monaco/vs
#   cp node_modules/chart.js/dist/chart.umd.js src/public/vendor/chart.umd.js

# 4. 重启服务
#   （先停旧进程）pkill -f "node server.js"
node server.js                      # 或 PORT=8730 node server.js
```

### 启动时数据库自动处理逻辑（`db.js`）
服务启动执行 `ensureMigrated()`，按 `settings.schema_version` 分支：

| 情况 | 行为 |
|---|---|
| 无 `schema_version`（老库，未版本化） | 直接写为当前版本；**不迁移、不备份**（本次无结构变更） |
| 已存版本 = 当前版本 | 无需处理 |
| 已存版本 < 当前版本 | **先 `VACUUM INTO` 备份** → 事务内按序跑 `MIGRATIONS[stored+1..current]` → 升版本；任一迁移失败则整体回滚、版本不变 |
| 已存版本 > 当前版本 | **拒绝降级**（抛错，防止误用旧代码覆盖新库） |

### 配置兼容性
- 新增的 4 个 AI 配置项通过 `INSERT OR IGNORE` 自动播种默认值；**已自定义过的其它配置不会被覆盖**。
- 本次新增配置默认值：`ai_webui_url=http://121.40.190.90:3000/`、`ai_base_url=http://121.40.190.90:4000`、`ai_api_key=sk-vllm-aaa-bbb`、`ai_model=qwen-local`。

### 升级后验证
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8730/        # 期望 200
curl -s http://localhost:8730/api/exams | head -c 200                    # 试卷列表非空
sqlite3 data/exam.db "SELECT value FROM settings WHERE key='schema_version';"  # 当前版本
```

---

## 五、已知限制

1. **AI 模型响应慢**：`ai_base_url`（qwen-local）实测首 token 约 **150–200 秒**（`message_start` 1s 内返回，之后长时间仅 `ping` 保活）。前端流式逻辑正确、会持续等待并显示打字机效果，但用户需等待较久。这是 AI 后端性能问题，非本系统代码问题。建议：换更快的模型，或在前端增加"预计耗时较长"提示。
2. **单用户、无鉴权**：本系统为单用户本地工具，无登录/多租户。
3. **判题非完全沙箱**：仅做超时 + 资源限制（`ulimit`），非完整沙箱。
4. **AI 请求走同源后端代理**：前端不再直连 liteLLM（避免 HTTPS→HTTP 混合内容拦截），改为 `POST /api/ai/chat` 由后端转发；`ai_api_key` 留在服务端，不再暴露给浏览器。

---

## 六、复现测试的方法

```bash
cd /home/admin/git/richie_gesp/exam-system
npm test                                    # 49 项单测
node scripts/verify_bank.js                 # 题库参考代码 × 测试程序验收
# 端到端（需先准备 chrome-headless-shell）：
#   node /tmp/pwtest/e2e.js                 # 全流程
#   node /tmp/pwtest/verify_remaining.js    # 错题/筛选/讲评态
#   node /tmp/pwtest/verify_preview.js      # 判卷预览可继续作答
```
