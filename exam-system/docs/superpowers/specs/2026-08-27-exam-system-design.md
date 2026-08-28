# 在线模拟考试系统 设计文档

- 日期：2026-08-27
- 位置：`/home/admin/tools/richie/exam-system`（独立 git 仓库）
- 状态：已与用户逐节确认

## 1. 目标

用 Node.js 构建一个单用户在线模拟考试系统，替代现有静态 HTML 试卷体系：

1. 题库以**文件夹分类**组织，每套试卷一个 JSON 文件，内容与页面渲染格式分离；答案（含编程题完整 C++ 测试程序源码）内嵌在试卷文件中。题目模板可扩展，供外部 skill 批量生成。
2. 用统一模板渲染试卷，视觉参考现有 `mock_exams/exam_01/mock_exam_01.html` 与 `index.html`。
3. 错题自动记录进 SQLite，支持分级（1 级起，再错升级）、复习、备注。
4. 前端精美专业：首页用"深海渐变"风格（延续现有 index.html），答题等页面用"现代教育平台"明亮风格。
5. 首页顶部导航四个板块：模拟考试 / 错题复习 / 数据统计 / 系统配置。
6. 考试倒计时醒目展示，归零自动交卷；结束前可配置地周期性提醒。
7. 编程题提供 OJ 式判题页（左右分栏，gcc/g++ 编译 + 测试程序评测，全记录提交历史）。

## 2. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 旧卷处理 | 写迁移脚本把现有 10 套静态卷转成新格式导入 |
| 用户模型 | 单用户，无登录，无多租户 |
| 错题升降级 | 逐级降级：复习做对一次降一级，到 0 变"已掌握"；再错升级（上限 5） |
| 倒计时语义 | 点【开始答题】即开始倒计时；可配置总时长、提醒提前量（默认 30 分钟）、提醒间隔（默认 10 分钟） |
| 编程题计分 | 全部用例通过才得该题满分，否则 0 分；交卷判分时用最新提交自动再评一次 |
| 断点续考 | 答案实时存库；离开期间倒计时不暂停（服务端计时）；重进续答 |
| 项目位置 | `/home/admin/tools/richie/exam-system`，新 git 仓库 |
| 视觉风格 | 首页/导航 = 深海渐变（A）；答题/复习/统计/配置页 = 现代教育明亮风（B）；编程页编辑区深色 |
| 编程题测试数据 | 内嵌完整 C++ 测试程序源码（沿用现有约定：`argv[1]`=学生二进制，全过 exit 0） |
| 技术方案 | Express + better-sqlite3 + EJS 服务端渲染，无前端构建链 |

## 3. 系统架构

```
浏览器
  │ HTTP
Express 服务（node server.js，默认端口 8730）
  ├─ 页面路由（EJS 模板渲染题库数据）
  │    /                     模拟考试列表（首页）
  │    /exam/:id             答题页（倒计时 + 判卷）
  │    /exam/:id/prog/:qid   编程题 OJ 页
  │    /review               错题复习
  │    /stats                数据统计
  │    /settings             系统配置
  ├─ REST API /api/*
  │    保存作答 · 交卷判分 · 错题/备注 · 统计 · 配置
  │    POST /api/judge       编程题提交 → 判题引擎
  ├─ src/services/
  │    db.js · questionbank.js · grading.js · judge.js ·
  │    wrongbook.js · stats.js · settings.js
  └─ data/exam.db（SQLite）· data/judge_tmp/（判题工作区）

question_bank/            （题库，独立于代码目录，可整体替换）
  └─ <分类文件夹>/
       └─ *.exam.json     （每套试卷一个文件，文件夹名=分类名）
```

要点：

- 服务启动时扫描 `question_bank/` 建立试卷索引写入 `exams` 表；配置页提供【重新扫描题库】。
- **倒计时以服务端为准**：`exam_attempts.started_at + 试卷时长` 推算剩余时间，前端仅展示，刷新/关页/改本地时间均不影响。
- 依赖：`express`、`better-sqlite3`、`ejs`、`cheerio`（仅迁移脚本用）、`monaco-editor` 与 `chart.js`（复制发行版到 `src/public/vendor/`，不走 CDN）。

## 4. 题目模板（试卷 JSON 契约）

文件命名：`question_bank/<分类>/<试卷名>.exam.json`。生成试卷的 skill 以此为契约。

```json
{
  "schema_version": 1,
  "exam": {
    "id": "gesp_l1_mock_01",
    "title": "模拟试卷（一）",
    "subtitle": "基础入门",
    "category": "GESP C++ 一级",
    "duration_minutes": 120,
    "total_score": 100,
    "tags": ["变量命名", "整除取余", "for循环"],
    "prog_brief": "零花钱 · 数字之和"
  },
  "sections": [
    {
      "title": "一、单选题（每题 2 分，共 30 分）",
      "question_type": "choice",
      "score_per_question": 2,
      "questions": [
        {
          "id": "q1",
          "type": "choice",
          "knowledge": ["运算符优先级"],
          "difficulty": "easy",
          "stem": "表达式 1+2*3 的值是（ ）\n```\nint a = 1 + 2 * 3;\n```",
          "options": { "A": "9", "B": "7", "C": "8", "D": "6" },
          "answer": "B",
          "explanation": "先乘除后加减……"
        }
      ]
    },
    {
      "title": "二、判断题（每题 2 分，共 20 分）",
      "question_type": "tf",
      "score_per_question": 2,
      "questions": [
        {
          "id": "q16",
          "type": "tf",
          "knowledge": ["变量命名"],
          "stem": "C++ 中 2n 可以作为变量名。",
          "answer": false,
          "explanation": "变量名不能以数字开头"
        }
      ]
    },
    {
      "title": "三、编程题（每题 25 分，共 50 分）",
      "question_type": "programming",
      "score_per_question": 25,
      "questions": [
        {
          "id": "prog1",
          "type": "programming",
          "title": "小杨的零花钱",
          "knowledge": ["循环", "向上取整"],
          "difficulty": "medium",
          "stem": "……",
          "input_format": "三个整数 p, m, s",
          "output_format": "一个整数，表示攒够所需的月数",
          "samples": [ { "input": "100\n30\n10", "output": "5" } ],
          "constraints": "1 ≤ p ≤ 100000",
          "answer": {
            "reference_code": "#include <iostream>\n……",
            "solution": "题解：每月净存 m-s，答案 = ceil(p / (m-s))……",
            "test_program": "/* 完整 C++ 测试程序源码 */"
          }
        }
      ]
    }
  ]
}
```

### 模板规则与扩展性

- `exam.id` 全库唯一（含分类前缀更佳）；题目 `id` 在卷内唯一。
- `exam.category` 省略时用所在文件夹名；`duration_minutes` 省略时用系统配置默认时长（120）。
- 文本字段（`stem`/`explanation`/`solution` 等）为纯文本，可含 ``` 围栏代码块，**渲染时**才转成代码排版；试卷文件不含任何页面格式。
- 题型由 `type` 驱动：渲染器与判分器均为注册表模式（`choice` / `tf` / `programming`）。新增题型 = 新增一种 type 的渲染片段 + 判分函数，框架不动。
- 可选字段（`knowledge`/`difficulty`/`source`/`tags`…）按需出现；判分只依赖 `answer`。
- `sections` 数量与题型组合自由，不锁定 15+10+2 结构；分值 = `score_per_question`。
- `test_program` 约定（与现有测试程序一致）：接受 `argv[1]` 为学生可执行文件路径；全部用例通过时进程退出码为 0，存在失败用例时非 0，并在 stdout 打印失败用例表格（输入/期望/实际）。
- 加载校验：每个文件经模板校验器检查（必填字段、id 唯一、题型合法、选择题答案在选项内、判断题答案为布尔、编程题三要素齐全），失败文件进"题库健康"面板，不阻塞其他试卷。

## 5. 数据库设计（SQLite，`data/exam.db`，WAL 模式）

```sql
CREATE TABLE exams (
  id TEXT PRIMARY KEY,            -- exam.id
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  file TEXT NOT NULL,             -- 题库文件路径
  duration_minutes INTEGER,       -- NULL = 用系统默认
  total_score INTEGER NOT NULL,
  tags_json TEXT,                 -- ["tag1",...]
  loaded_at INTEGER NOT NULL
);

CREATE TABLE exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  status TEXT NOT NULL CHECK (status IN ('in_progress','graded')),
  started_at INTEGER NOT NULL,    -- epoch ms，倒计时基准
  submitted_at INTEGER,
  auto_submitted INTEGER DEFAULT 0,
  score_choice INTEGER DEFAULT 0,
  score_tf INTEGER DEFAULT 0,
  score_prog INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0
);
CREATE INDEX idx_attempts_exam ON exam_attempts(exam_id);

CREATE TABLE exam_answers (
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id),
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,           -- choice:"B"; tf:"true"; programming: 最新提交 id
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE wrong_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','mastered')),
  note TEXT DEFAULT '',             -- 备注正文
  note_knowledge TEXT DEFAULT '',   -- 备注的知识点标签
  times_wrong INTEGER DEFAULT 1,
  times_right INTEGER DEFAULT 0,
  first_wrong_at INTEGER NOT NULL,
  last_wrong_at INTEGER NOT NULL,
  UNIQUE (exam_id, question_id)
);

CREATE TABLE review_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  filter_json TEXT NOT NULL,       -- 本次复习的过滤条件
  total INTEGER NOT NULL,
  correct_count INTEGER DEFAULT 0,
  finished INTEGER DEFAULT 0
);

CREATE TABLE review_answers (
  session_id INTEGER NOT NULL REFERENCES review_sessions(id),
  wrong_id INTEGER NOT NULL REFERENCES wrong_questions(id),
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  PRIMARY KEY (session_id, wrong_id)
);

CREATE TABLE prog_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  attempt_id INTEGER,              -- NULL = 错题复习/独立练习中的提交
  code TEXT NOT NULL,
  compile_ok INTEGER NOT NULL,     -- 0/1
  all_passed INTEGER NOT NULL,     -- 0/1（编译失败时 0）
  result_summary TEXT NOT NULL,    -- 结果面板展示文本（含失败用例表格）
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_progsub_q ON prog_submissions(exam_id, question_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 错题升降级规则（服务端执行）

- 判卷/复习做错：无记录 → 插入 `level=1`；已有 `active` → `level+1`（上限 5）；已 `mastered` → 复活为 `active, level=1`。同时 `times_wrong+1`。
- 复习做对：`level-1`；`level` 到 0 → `status='mastered'`（记录保留，默认列表不显示）。`times_right+1`。
- 编程题对错判定：全部用例通过 = 对，否则 = 错；错题复习中的编程题进入独立练习判题页，复用判题引擎。

## 6. 页面与交互

### 6.0 全局

顶部固定深色导航条（风格 A）：Logo + `模拟考试 | 错题复习 | 数据统计 | 系统配置`，当前板块高亮。所有页面响应式适配 ≥1280px 为主、≥768px 可用。

### 6.1 首页 `/`（模拟考试 · 风格 A 深海渐变）

- Hero：badge（GESP）+ 大标题 + 说明文字 + 统计数字（试卷套数 / 题目总数 / 累计考试次数 / 平均分，金色数字）。
- 分类 tabs：`全部` + 各文件夹分类名。
- 试卷卡片网格（延续现有卡片设计）：彩色渐变编号、标题、副标题、知识点 tags、编程题名（`prog_brief`）。
- 状态徽章三态：
  - `未考试`（灰）— 按钮"开始答题 →"
  - `考试中`（橙）— 显示剩余时间（由服务端推算，前端秒级刷新），按钮"继续答题 →"
  - `已考试`（绿）— 显示最近得分，按钮"再次挑战 →"（新开一次 attempt）
- 点击卡片进入 `/exam/:id`。
- 底部红渐变横幅「🎯 错题强化训练」（显示活跃错题数）→ `/review`。

### 6.2 答题页 `/exam/:id`（风格 B 明亮）

- 进入规则（服务端按该卷最新 attempt 状态分派）：
  - 无任何 attempt：弹"开考确认"层，显示时长与规则 → 点【开始答题】创建 attempt、服务端记 `started_at`，立即开始倒计时。
  - 有 in_progress attempt：直接恢复已保存答案与剩余时间。若剩余 ≤0：显示"时间已到"并引导判卷。
  - 最新 attempt 已 graded：以**只读讲评态**展示该次判卷结果（作答 + 对错高亮 + 正确答案），倒计时不再运行；可点【再次挑战】新开 attempt 重考。
- 顶部吸附栏：试卷名 | **大号倒计时 `HH:MM:SS`**（剩余时间 ≤ 提醒提前量后变橙红 + 脉冲动画；此后每到一个提醒间隔点，toast + 提示音"快要到时间了，注意把握时间"）| 【交卷】按钮（点击需二次确认）。
- 判卷行：分值表（题型/题数/满分/得分）+「满分：X 分」行，**最右侧【判卷】按钮**。
- 题目渲染：
  - 选择题：全部选项可点击（圆形 radio 样式，选中高亮），点击即选中并即时存库。
  - 判断题：`正确 ✔` / `错误 ✘` 药丸按钮，点击即选中并即时存库。
  - 编程题：摘要卡片（题名、分值、最近提交结果徽章），【打开编程题 →】按钮（同页跳转 `/exam/:id/prog/:qid`）。
- 判卷流程（前端按钮触发，服务端判分）：
  1. 收集作答；存在未答的选择/判断题 → 弹窗列出未完成题号清单，【返回作答】/【仍要判卷】。
  2. 只给已答题计分：选择/判断精确匹配；编程题取该题最新提交**自动再运行一次判题**，全过 = 满分，否则 0；从未提交 = 0。
  3. 得分以大红色展示（含分项表）；答对题绿色描边，**错题强反差高亮**（浅红底 + 深红左边框 + 阴影），题后追加绿色"✅ 正确答案：…"标签与解析。
  4. 每个错题旁出现【复制】按钮：把题干 + 全部选项 + 我的答案（标 ✗）+ 正确答案（标 ✓）+ 解析组织成纯文本写入剪贴板，成功提示"已复制，可粘贴到错题本"；`navigator.clipboard` 不可用时降级 `document.execCommand('copy')`。
  5. 错题写入/升级 `wrong_questions`；attempt → `graded`，记录四项得分与 `auto_submitted` 标志。
  6. 判卷后页面顶部出现【查看错题】【返回首页】入口。
- 倒计时归零：自动执行上述判卷流程（`auto_submitted=1`），无需用户确认。

### 6.3 编程题页 `/exam/:id/prog/:qid`（同页跳转，参考有道 OJ 布局）

- 顶栏：【← 返回试卷】按钮 + 试卷名/题名 + 同步显示的倒计时（归零后禁止提交）。
- 左右分栏（约 45% / 55%，中线可拖拽调整）：
  - **左侧三个 tab**：
    - `题目信息`：题名、题干、输入格式、输出格式、样例（输入/输出对照块）、约束。
    - `题解信息`：题解文字 + 参考代码（代码高亮展示）。
    - `提交记录`：本题历史提交列表（时间 / 结果徽章 ✅全过 ❌未过 ⚠️编译错误），点击展开当时代码与结果详情。
  - **右侧**：Monaco 编辑器（C++，深色主题，自动恢复上次编辑内容）+【提交代码】按钮 + 结果面板：
    - `ALL_PASS`：绿色"✅ 通过全部 N 个测试用例"。
    - `PARTIAL_PASS`：红色"❌ 通过 X/N 个用例" + 失败用例表格（用例号 / 输入 / 期望输出 / 实际输出）。
    - `COMPILE_ERROR`：编译报错原文（等宽字体块）。
    - `RUNTIME_ERROR`：超时/运行时崩溃提示。
- 提交 → `POST /api/judge`，服务端判题（见第 7 节）；每次提交写入 `prog_submissions`，并同步 `exam_answers` 中该题最新提交。

### 6.4 错题复习 `/review`（风格 B）

- 过滤条：**级别**（全部 / 1级 / 2级 / 3级及以上）、分类、题型、状态（未掌握 / 已掌握 / 全部）、关键字（匹配题干与备注）。
- 列表模式：错题卡片 = 题型徽章 + 级别徽章（L1~L5，颜色随级别加深）+ 题干摘要 + 错误次数 + 备注预览。
  - **鼠标悬停浮出【添加备注】按钮** → 弹窗：知识点输入（逗号分隔）+ 笔记多行文本 → 保存至 `note` / `note_knowledge`。
  - 卡片操作：【标记已掌握】【删除】。
- 【开始练习】按钮：按当前过滤条件取题生成 `review_session`，进入复习答题页（复用答题渲染器，无倒计时，可整卷判分或逐题即时判分——采用整卷判分，判完逐题显示对错与升降级结果：做对降一级/掌握，做错升一级）。
- 复习中的编程错题：题目卡片【打开判题】→ 独立练习判题页（复用 6.3 页面，提交不挂 attempt）。判出全过/未过后立即更新该错题级别并记入本次 session 结果，无需再回列表操作。

### 6.5 数据统计 `/stats`（风格 B + chart.js）

- 概览卡片：累计考试次数 / 平均分 / 最高分 / 累计答题时长 / 活跃错题数 / 已掌握数。
- 成绩趋势折线图：按时间排列每次 attempt 的总分（区分手动交卷 / 自动交卷）。
- 知识点正确率条形图：按 `knowledge` 聚合所有作答（含考试与复习），正确率升序排列，低于 60% 标红——即薄弱知识点榜。
- 题型对错占比（选择/判断/编程分别统计）。
- 错题级别分布柱状图。
- 编程题统计：总提交数、编译通过率、全过率、每题提交次数与首次全过情况。

### 6.6 系统配置 `/settings`（风格 B）

- 可配置项（存 `settings` 表，保存即生效，另有【恢复默认】）：
  - `default_duration_minutes` 默认考试时长（试卷未指定时使用），默认 120
  - `remind_before_minutes` 倒计时提醒提前量，默认 30
  - `remind_interval_minutes` 提醒间隔，默认 10
  - `judge_compile_timeout_sec` 编译超时，默认 30
  - `judge_run_timeout_sec` 评测运行超时，默认 60
  - `server_port` 在启动参数/环境变量中配置，不在此列
- 「题库健康」面板：已加载试卷列表（分类/标题/题数/时长）；校验失败文件的错误明细；【重新扫描题库】按钮。

## 7. 判题引擎（`src/services/judge.js`）

工作目录：`data/judge_tmp/<submission_id>/`，用完即删（失败时保留供排查，上限 20 个）。

流程：

1. 写入学生代码 `main.cpp`，`g++ -O2 -std=c++14 -lm -o student main.cpp`，超时（可配，默认 30s）；失败 → `COMPILE_ERROR`，返回报错原文。
2. 从试卷文件取 `answer.test_program` 写入 `test.cpp`，同参数编译为 `tester`；失败 → `TESTER_BUILD_ERROR`（提示题库需修复）。
3. 运行 `bash -c 'ulimit -v 512000 -t <run_timeout+5>; exec ./tester ./student'`，运行超时（可配，默认 60s），捕获 stdout/stderr 与退出码；超时/被信号杀死 → `RUNTIME_ERROR`。
4. 退出码 0 → `ALL_PASS`；非 0 → `PARTIAL_PASS`，stdout 中的失败用例表格原样透传前端渲染。

并发与安全边界：判题队列最多 2 路并发；单用户本地场景，仅做超时 + 内存限制 + 独立工作目录，不做完整沙箱（文档中明确该限制）。

`POST /api/judge` 请求：`{ exam_id, question_id, attempt_id?, code }`；响应：`{ status: 'ALL_PASS'|'PARTIAL_PASS'|'COMPILE_ERROR'|'TESTER_BUILD_ERROR'|'RUNTIME_ERROR', passed, total, detail }`（`passed/total` 从 tester 输出解析，解析不到时只给文本）。

## 8. 旧卷迁移（`scripts/migrate_legacy.js`）

源：`/home/admin/tools/richie/mock_exams/`（exam_01~10）。

- `mock_exam_XX.html`（cheerio 解析）：题干、选项、`data-answer`、题号归属（选择 1-15 / 判断 16-25 / 编程题摘要卡）。
- `mock_exam_XX_answers.html`：每题解析、编程题参考代码与题解。
- `test_XX_progX.cpp`：整文件读入 `answer.test_program`。
- `index.html`：各卷副标题、知识点 tags、`prog_brief`。

输出 `question_bank/GESP_C++一级/exam_XX.exam.json`，并打印校验报告（每卷题数、分值合计、测试程序可编译性抽查）。迁移后跑验收：每卷用参考代码编译后执行自身测试程序必须全过。

## 9. 错误处理要点

- 判题五态分级展示（见 6.3），前端提交按钮防抖 + loading，服务端队列限并发。
- 题库文件逐个校验，坏文件不阻塞整体，只在配置页报错。
- 考试状态全量持久化：服务重启、浏览器关闭均无损；断线期间倒计时走完，重进显示"时间已到"并引导判卷。
- 判卷幂等：同一 attempt 重复判卷覆盖旧结果（错题记录按 `UNIQUE(exam_id, question_id)` upsert，不会重复）。
- 数据库：WAL + busy_timeout；关键操作失败记日志并向页面返回明确错误消息。
- 剪贴板：`navigator.clipboard` 优先，非安全上下文降级 `execCommand('copy')`。

## 10. 测试策略

- `npm test`（node 内置 `node:test`，无额外测试框架）：
  - 判分逻辑：选择/判断匹配、未答题跳过、编程题全过才得分。
  - 错题升降级：新建/升级/封顶/降级/掌握/复活全路径。
  - 倒计时：剩余时间计算、提醒触发点集合计算。
  - 模板校验器：合法样例通过；缺字段/答案越界等场景报错。
  - 判题引擎端到端：预置三份样例学生代码（AC / WA / 编译错误）对真实测试程序跑判题。
- 迁移验收：10 套卷全部加载成功；每卷参考代码对自身测试程序全过。
- 手工 E2E：完整走一遍 答题 → 判卷 → 错题复习（升降级 + 备注）→ 统计 → 配置修改生效。
- 调试：`LOG_LEVEL=debug` 输出带时间戳的详细日志。

## 11. 项目目录

```
/home/admin/tools/richie/exam-system/
├── server.js                    # 入口（端口、路由挂载、启动扫描题库）
├── package.json
├── src/
│   ├── routes/                  # pages.js · api.js · judge.js
│   ├── services/                # db.js · questionbank.js · grading.js · judge.js ·
│   │                            # wrongbook.js · stats.js · settings.js · countdown.js
│   ├── views/                   # EJS：layout.ejs · index.ejs · exam.ejs · prog.ejs ·
│   │                            # review.ejs · review_session.ejs · stats.ejs · settings.ejs · partials/
│   └── public/                  # css/ · js/ · vendor/（monaco、chart.js 发行版）
├── scripts/migrate_legacy.js
├── question_bank/               # 题库（git 管理，文件夹=分类）
│   └── GESP_C++一级/*.exam.json
├── data/                        # exam.db、judge_tmp/（.gitignore）
├── test/                        # node:test 单测 + 样例代码
└── docs/superpowers/specs/      # 本文档
```

## 12. 非目标 / 限制

- 不做用户系统、权限、多租户。
- 不做完整判题沙箱（单用户本机，超时 + 资源限制即可）。
- 不做试卷在线编辑器（试卷由外部 skill 生成 JSON 文件，系统只读）。
- 仅支持 g++（C++）判题；其他语言判题留待题型扩展机制未来承接。
- 页面以桌面浏览器为主（≥1280px 最佳），移动端仅保证可用。
