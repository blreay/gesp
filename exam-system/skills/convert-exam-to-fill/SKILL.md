---
name: convert-exam-to-fill
description: "把选择题+判断题形式的试卷（PDF、网页、粘贴文本或系统内已有 JSON）转化为 exam-system question_bank 的填空改造卷：客观题考点重构为填空题、编程题保留并配判题程序，默认 50 填空×1 分 + 编程×25 分 = 总分 100。Use when 用户要求转化/改造真题或考题、把选择判断题变成填空题卷、批量导入试卷到 question_bank 分类目录。"
---

# convert-exam-to-fill — 试卷 → 填空改造卷转化流水线

## 是什么

把"可以蒙对"的选择/判断题试卷，按**考点重构**（不是文字替换）改造成必须产出结论的填空题卷，
输出为 `exam-system/question_bank/<目标目录>/*.exam.json`。核心原则：

- **每个填空都能溯源到原卷某道客观题的考点，零自编**（explanation 末尾的出处标注即映射证明）
- **一切可验证的答案必须实测**（C++ 求值/输出用 g++ -std=c++14；编程题参考代码必须过自写判题程序）
- **源卷不可盲信**：答案表要与独立分析双源核对，冲突以实测为准并标注"源卷疑似错误"

## Step 0 — 必需输入（缺一不可，未提供必须 AskUserQuestion 向用户收集，不得猜测）

| 参数 | 说明 |
|---|---|
| **来源** | PDF 路径/目录、网页 URL、粘贴文本、或系统内已有 choice/tf JSON 卷 |
| **目标目录** | `question_bank/` 下的分类目录名（**必须用户输入**；不得默认沿用旧目录，目录名即卷的 category） |
| 计分口径 | 默认：填空每空 1 分 + 编程每题 25 分，总分 100 → 填空数 = 100 − 25×编程题数（GESP 真题 2 道编程 → 恰 50 空）。用户可覆盖（总分/空数/分值），覆盖后 lint/e2e 参数同步。⚠️ 填空数须与源卷客观题规模匹配（每题 1~3 空）：默认口径装不下/装不满时（如源卷只有 6 道客观题），**主动向用户建议空数与分值**，不得为凑数自编考点 |
| 命名 | 文件名与 exam.id 前缀（建议 `gesp_<级别>_<标识>`，全库唯一），给用户确认 |

## 流水线（六步，顺序执行）

### 1. 源完整性核查（先做，别急着转化）
- 逐份源**通读到最后一页**：`pdfinfo` 数页数、`pdftotext -layout` 提全文，清点
  "单选 N 题 + 判断 M 题 + 编程 K 题 + 答案表"，列出清单后再动工。
  ⚠️ 基线教训：样题 PDF 第 2 道编程题在第 9 页，早期只读到第 8 页就断言"只有 1 道"，
  错误前提写进手册污染了整批任务。**编程题数、总分、答案表位置以逐页清点为准，不凭印象。**
- 答案表缺失 → 全部答案独立推导 + g++ 实测，报告中显著标注"无答案表，答案自定"。
- 网页源：WebFetch（或 curl + 浏览器 UA）；系统内 JSON 源：直接读卷。

### 2. 生成 fork 执行手册
复制 `templates/fork-manual.md`，替换其中 `{{占位符}}`（目标目录、计分口径、来源清单、
文件名/exam.id 对照表、范例卷路径），写到 `/tmp/<批次>_spec.md`。
手册是 fork 的唯一提示词，**红线、判分归一化规则、test_program 写法、自检命令都在里面，不要删减**。

### 3. 每份卷一个 fork 并行转化
- 用 Agent 工具、`subagent_type: "fork"`（继承父模型，满足"子 agent 与父同模型"约束），
  prompt = 手册路径 + 该 fork 分到的源文件与输出文件。
- fork 运行期间**不轮询、不重复其工作**，等 task-notification；同一 fork 可用 SendMessage 续派修错。
- 卷数多时分批派发，避免同时十几个重编译任务。

### 4. 中央三段验证（全部通过才算完）
```sh
export PATH="$HOME/.nvm/versions/node/v20.18.0/bin:$PATH"   # 本机 node 20.18.0
cd /home/admin/git/richie_gesp/exam-system
node <skill>/templates/lint.js --bank question_bank/<目标目录> [--fill-n 50] [--fill-score 1] [--prog-score 25]
node scripts/verify_bank.js <bank_root>       # bank_root 下只放目标目录（可 symlink），逐题必须显示 OK，不能只看总数
node <skill>/templates/e2e.js --app /tmp/e2e_<批次> --category <目标目录> [--fill-n 50]
```
- lint：结构/契约/独立性/答案泄露（"（填：A/B）"限定格式选项组属合法消歧设计，已豁免）。
- verify_bank：参考程序过样例 + 判题程序判参考全过。
- e2e：隔离应用副本 + 独立 DB，把每套卷**按内嵌答案完整做一遍**（客观题全对、总分=客观满分），
  另做一题故意答错的反向抽查。⚠️ node:test 断言失败会挂死 runner，隔离脚本一律 `process.exit`。
- 任一失败 → 定位到卷，SendMessage 续派对应 fork 修正，改完重跑三段。

### 5. 生产上线（三段验证全绿后）
```sh
# 1) DB 一致性备份（在线 backup API，含 WAL；不要只 cp .db 文件）
node -e "require('better-sqlite3')('data/exam.db').backup('/tmp/exam-db-backup-'+Date.now()+'.db').then(()=>console.log('OK'))"
# 2) 重启生产（启动即自动重扫题库；src/*.js 改动本来也必须重启）
kill $(ss -tlnp | grep ':8730' | grep -oP 'pid=\K[0-9]+') && sleep 1 && \
  NODE_ENV=production nohup node server.js > data/server-$(date +%Y%m%d).log 2>&1 &
# 3) 核对：日志"加载 N 套，失败 0"、exams 表新卷全部入索引、npm test 基线（当前 95/95）
```

### 6. 汇报与提交
- 交付清单表（每套：文件、validateExam、空数映射、tp 通过数、源卷错误）+ **源卷错误/歧义清单显著标注**。
- **等用户说 "commit and push" 才提交**；提交信息末尾加
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`；
  DB 快照（`data/exam.db`）checkpoint（`wal_checkpoint(TRUNCATE)`）后单独提交。

## 质量红线（fork 手册已含，此处为父会话抽检口径）

1. 填空数恰为口径值，id `f1..fN` 连续；编程题 id `prog1..progK`，**必须带 title（试题名称）与 source（来源+页码）**。
2. `total_score` = 各 section 分值和（validateExam 强制）；不写 category 字段（目录名即分类）。
3. 每题完全独立：禁"如上题/同第 N 题"；共享代码上下文重复贴进各自 stem。
4. 答案绝不原文抄进自己题干（"（填：A/B）"选项组除外）；同一考点两空不得互相泄露。
5. 填空判分是**归一化后精确匹配、区分大小写**（全角→半角、空白折叠、trim）：答案要短、确定，
   格式歧义在题干显式规定，合理变体放 answer 数组（"1,2"与"1 2"不等价，需要时都列）。
6. **编译中间产物只放 /tmp 自建目录，严禁写进仓库**（基线教训：曾有 fork 把 .cpp/可执行文件落在仓库根）。
7. 源卷错误的处理：能在转化中规避的规避（平台依赖输出、排印错误代码不主张选项字母）；
   判断题因表述不严谨产生歧义的，**拆成两空分别考实际内容**；
   编程题参考程序与样例冲突的，以能过样例/判题的版本为准并在报告说明。

## 基线失败 → 对策速查

| 实际发生过的失败 | 本 skill 的对策 |
|---|---|
| 计分口径中途变更，6 个文件推倒重做 | Step 0 先收齐口径/目标目录再动工 |
| PDF 未读完，漏第 9 页的第二道编程题 | Step 1 逐页清点清单制 |
| 编译产物写进仓库根 | 红线 6 + fork 报告须自证 git status 干净 |
| 编程题缺 title，verify_bank 显示 undefined | 红线 1 + lint 强制检查 |
| 源卷答案/参考程序本身有错 | 原则"双源核对" + 红线 7 |
| 泄露检查误杀（填：A/B）合法格式 | lint 已豁免限定格式选项组 |
| 直接改生产库做作答测试 | Step 4 隔离副本 + Step 5 先备份 |
