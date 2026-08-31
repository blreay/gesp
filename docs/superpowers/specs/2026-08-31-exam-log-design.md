# 每日模拟考试日志（统计页）设计

日期：2026-08-31
状态：已与用户确认口径与方案（方案 A）

## 1. 目标

在【数据统计】页面（`/stats`）底部新增【每日模拟考试日志】区域：

- 按天展示每天考了几场、都是哪些试卷。
- 每场考试显示：试卷名、本试卷第几次考、开始时间、结束时间、得分、编程题完成情况（提交X/共Y·通过Z）、是否全部完成、是否超时自动交卷。
- 提供「全部 / 日 / 周 / 月」粒度选择器 + 具体周期选择器，用于过滤日志。

## 2. 已确认的口径（来自用户）

| 项 | 口径 |
| --- | --- |
| 编程题完成 | 记录并展示「提交X/共Y，通过Z」三个数 |
| 是否全部完成 | 所有题都作答/提交（不看对错）：客观题无未答 且 每道编程题都有提交 |
| 过滤器 | 粒度（全部/日/周/月）+ 具体周期选择器 |
| 历史数据 | 升级时回填现有已判卷记录（能恢复多少算多少） |
| 写入时机 | 仅判卷完成后记录（含手动交卷与超时自动交卷）；未交卷不记录 |

## 3. 为什么用新表而不是从现有表推导

`POST /exams/:examId/retake` 会 **删除** 上一次 `exam_attempts` 记录（及其作答、提交），
因此「本试卷第几次考」无法从 `exam_attempts` 可靠推导（历史被清掉）。
新增一张只增不改的 `exam_log` 日志表：历史不被覆盖、试卷标题以快照保存（题库重扫/删除后仍可显示）、第几次考连续递增。

## 4. 数据模型

新表 `exam_log`（schema 版本 1 → 2）：

```sql
CREATE TABLE IF NOT EXISTS exam_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  exam_title TEXT NOT NULL DEFAULT '',
  nth INTEGER NOT NULL DEFAULT 1,          -- 本试卷第几次考
  day TEXT NOT NULL,                        -- 考试日：本地时区 YYYY-MM-DD（按 started_at）
  started_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  auto_submitted INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  prog_total INTEGER NOT NULL DEFAULT 0,     -- 编程题总数
  prog_submitted INTEGER NOT NULL DEFAULT 0, -- 有提交的编程题数
  prog_passed INTEGER NOT NULL DEFAULT 0,    -- 全部测试通过的编程题数
  all_done INTEGER NOT NULL DEFAULT 0,       -- 1=全部作答/提交
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_examlog_day ON exam_log(day);
CREATE INDEX IF NOT EXISTS idx_examlog_exam ON exam_log(exam_id);
```

字段计算口径（判卷时刻）：

- `day`：`started_at` 的本地日期字符串（跨零点的考试归入开考日）。
- `nth`：`COUNT(*) FROM exam_log WHERE exam_id = ? + 1`（写入前的计数 +1；回填后仍连续）。
- `prog_total`：试卷中 `type === 'programming'` 的题目数。
- `prog_submitted`：判卷结果 `results` 中 `type==='programming'` 且 `userAnswer`（有提交判定）的条数。
- `prog_passed`：`results` 中 `type==='programming'` 且 `correct`（all_passed）的条数。
- `all_done`：`unanswered.length === 0 && prog_submitted === prog_total` → 1，否则 0。

## 5. 迁移与回填

执行顺序约束：`server.js` 中 `db.init()`（触发迁移）**先于** `qb.scan()`，迁移阶段题库尚不可用。因此：

1. **`MIGRATIONS[2]`（在 `db.js`）**：仅创建 `exam_log` 表与索引（不依赖题库）。`CURRENT_SCHEMA_VERSION` 1 → 2；升级前由既有 `ensureMigrated` 自动 `VACUUM INTO` 备份。
2. **回填（在新服务 `src/services/examlog.js` 的 `backfillIfNeeded()`）**：
   - 由 `server.js` 在 `qb.scan()` 成功后调用（测试中可显式调用）。
   - 以设置键 `exam_log_backfilled === '1'` 为闸门，只跑一次；成功后写入该键。
     （该键为内部键，直接用 `db.setSetting` 写入，不经过 `/api/settings` 的白名单，也不加入 `DEFAULT_SETTINGS`。）
   - 逻辑：`SELECT * FROM exam_attempts WHERE status='graded' ORDER BY exam_id, started_at, id`；
     对每条：取 `exam = questionbank.getExam(exam_id)`；有则用 `answersOf/progVerdicts/grading.gradeAttempt`
     计算 `prog_*` 与 `all_done`；题库已无此卷则兜底 `prog_total=prog_submitted=prog_passed=0, all_done=0, exam_title=exam_id`。
     `nth` 按写入顺序计数。逐条插入。
   - 被 `retake` 删除的历史无法恢复（作答/提交/attempt 均已删），接受此限制。

## 6. 写入路径

`POST /attempts/:attemptId/grade`（`src/routes/api.js`）在判卷成功后：

- 现有 `UPDATE exam_attempts ...` 与新的 `INSERT INTO exam_log ...` 放入同一个 `db.transaction`，保证一致。
- 字段来源：`att`（started_at/submitted_at=now/auto_submitted/total_score=payload.scored.total）、`exam`（title、prog_total）、`payload`（results、unanswered → prog_submitted/prog_passed/all_done）。
- `POST /attempts/:attemptId/preview` 不写日志（非终局）。
- 超时自动交卷同样走 grade（`auto: true`），以 `auto_submitted=1` 区分。

## 7. 读取与展示

- `src/services/examlog.js` 提供：
  - `record(att, exam, payload, now)`：计算字段并插入（供 grade 调用）。
  - `backfillIfNeeded()`：见第 5 节。
  - `list()`：`SELECT * FROM exam_log ORDER BY started_at DESC, id DESC`，返回全部（单用户量小）。
- `src/routes/pages.js` `/stats`：`data.examLog = examlog.list()`，随 `window.STATS` 下发。
- 前端不新增接口；过滤与分组全部在客户端完成（沿用统计页现有内嵌数据模式）。

## 8. 前端（统计页底部新区域）

`src/views/stats.ejs`（`</main>` 前）新增卡片：

- 头部：标题「每日模拟考试日志」+ 过滤控件：
  - 粒度 `#logGranularity`：全部 / 按日 / 按周 / 按月。
  - 周期 `#logPeriod`：根据粒度动态填充可选项（可选项来自已有日志数据）；粒度=全部时隐藏。
- 主体 `#logList`：按日分组渲染。每天一组：「2026-08-31 · 2 场」；每场一行/一卡显示：
  - 试卷名、第 N 次、开始–结束时间、得分。
    - 时间默认显示 `HH:MM`；若结束时间与开始时间不在同一天（跨零点），则结束时间显示为 `MM-DD HH:MM`。
  - 编程：`提交X/共Y · 通过Z`（无编程题则不显示）。
  - 是否全部完成：`✔ 全部完成` / `✘ 未完成`。
  - `auto_submitted=1` 时显示「超时自动交卷」标记。
- 空态：该时段无记录时显示提示文案。
- 样式沿用现有 `.settings-card` / `.chart-card` / `.mini-table` 风格，追加少量 `.examlog-*` CSS 至 `app.css`。
- 逻辑在 `src/public/js/stats.js`：`renderExamLog()`（分组、过滤、渲染）+ 粒度/周期联动。

### 8.1 周期定义

- 日：`YYYY-MM-DD`（与 `day` 字段一致）。
- 周：ISO 周（周一为一周首日），格式 `YYYY-Www`（如 `2026-W35`）；某条日志所属周由其 `day` 计算。
- 月：`YYYY-MM`。
- 「全部」：不过滤。

## 9. 错误处理与边界

- 判卷的成绩更新与日志插入放在同一个数据库事务中：要么都成功，要么都回滚，保证「有成绩必有日志」。
  若日志插入异常，则整场判卷对外返回失败（这几乎不会发生；一致性优先）。重试判卷即可恢复。
- 回填幂等（闸门键 + 固定排序），重复启动不会重复回填。
- 题库缺卷的回填兜底见第 5 节。
- 前端对空数据、无编程题试卷做兼容显示。

## 10. 测试

- **服务层（新增 `test/examlog.test.js`）**：
  - record 生成正确字段（prog_total/submitted/passed、all_done、day、nth）。
  - nth 随同卷多次判卷递增；不同卷互不影响。
  - backfillIfNeeded 从已有已判卷记录回填；重跑不重复（闸门）；缺题库兜底。
- **接口层（`test/api.test.js` 增补）**：
  - 判卷后 `GET /stats` 数据含对应日志；preview 不产生日志。
  - retake 再判卷 → 第 2 次（nth=2）。
- **前端（无头浏览器）**：日志区渲染、按日分组、粒度/周期过滤生效、空态提示。

## 11. 不做（YAGNI）

- 不做日志的编辑/删除界面（只增不改）。
- 不做导出、分页、单条详情钻取。
- 不新增独立 `/api/exam-log` 接口（统计页内嵌 + 前端过滤已足够）。
