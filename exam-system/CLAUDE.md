# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 运行与验证

- 这是单用户 Node.js/Express + EJS 应用。仓库没有 build 或 lint 脚本；页面、CSS 和浏览器 JS 直接从 `src/views/`、`src/public/` 提供。项目未声明 Node 版本；本机已用 Node 20.18.0 验证全套测试，默认的 Node 22 对 `node --test test/` 的处理曾导致 `npm test` 失败。编程判题及相关测试需要 `g++`（C++14）。
- 首次安装：`npm install`。`src/public/vendor/` 被忽略，初次启动或升级 Monaco/Chart.js 后按需复制静态资源：

  ```sh
  mkdir -p src/public/vendor/monaco
  cp -r node_modules/monaco-editor/min/vs src/public/vendor/monaco/vs
  cp node_modules/chart.js/dist/chart.umd.js src/public/vendor/chart.umd.js
  ```

- 启动：`npm start`（默认端口 8730）；`PORT=9000 npm start` 改端口；`npm run dev` 用 `LOG_LEVEL=debug` 启动。
- 全套测试：`npm test`（`node:test`）。单文件：`node --test test/api.test.js`。单用例：`node --test --test-name-pattern='考试页和错题页' test/api.test.js`。
- 验收题库参考程序与内嵌判题程序：`node scripts/verify_bank.js [题库目录]`。脚本会跳过缺少参考代码或使用占位测试程序的编程题，检查新题时必须确认其实际显示为 `OK`，不能只看总通过数。
- `npm run migrate` 是 README 所述的旧静态卷转题库迁移命令，不是日常启动步骤。

## 应用边界

- `server.js` 先初始化 SQLite、扫描 JSON 题库、补齐旧考试日志，再启动 `src/app.js` 的 Express 服务。`src/routes/pages.js` 渲染 EJS 页面，`src/routes/api.js` 提供考试、判题、复习、配置等接口；浏览器交互在 `src/public/js/`。编程编辑器在 Monaco iframe 内，通过 `postMessage` 与编程页通信。
- 完整题目以 `question_bank/<分类>/*.exam.json` 为准；格式契约在 `docs/superpowers/specs/2026-08-27-exam-system-design.md` 第 4 节。`src/services/questionbank.js` 校验、缓存试卷，并把元数据索引到 SQLite 的 `exams` 表。`scan()` **先删除再重建**索引，不是只读调用；卷内题目 ID 要唯一，试卷 ID 要在全库唯一。分类可由 JSON 中的 `exam.category` 指定。
- `src/services/db.js` 管理 SQLite schema、设置和迁移；默认数据库是 `data/exam.db`，使用 WAL。考试尝试、作答、编程提交、错题、复习会话、考试日志及提交历史快照（`exam_history`，schema v5，`exam_attempts` 同时新增 `username` 列记录做题人）保存在数据库，试题正文仍在 JSON 中。改动运行中的题库并重扫前，应对包含 WAL 中数据的数据库做一致性备份，而不是只复制 `.db` 文件。
- 考试流：开始/恢复 attempt → 保存客观题答案或提交编程代码 → 预览（不交卷）→ 正式判分。`src/services/examsessions.js` 汇集答案与每题最近一次编程判题结果，`src/services/grading.js` 按 section 分值计分；编程题只有全部测试通过才得分。正式交卷在 `src/routes/api.js` 重新判最新编程提交、更新错题并写入 `exam_log`；重考会删除上一次 attempt。倒计时以服务端开始时间为准，卷面没写时长时使用数据库设置的默认时长。**预览判卷（`/api/attempts/:id/preview`）仅管理员可用**（普通用户可对错题反复试错，页面判卷按钮同步置灰）；**交卷（`/attempts/:id/grade`）要求客观题（选择/判断/填空）全部作答**，编程题不计入门槛，服务端 400 校验并返回 `missing` 清单；**倒计时结束不自动交卷**，超时（timeup）后仍可继续存答案并交卷。正式交卷会在判分事务内写一条 `exam_history` 答卷快照（完整试卷 JSON + 客观题作答 + 每题编程最后一次提交 + 判分结果，`src/services/examhistory.js`）；`server.js` 启动时为旧的 graded attempt 幂等回填快照（UNIQUE(attempt_id)，被 retake 删除的历史无法恢复，老记录无做题人、页面显示"历史记录"）。历史列表页 `/exam/:id/history` 与快照页 `/exam/:id/history/:hid` 对**所有登录用户**可见（快照含正确答案与解析，属有意设计）；入口在考试页顶栏【历史记录】按钮与首页卡片【📜 历史】。
- `src/services/judge.js` 编译考生代码和题目内嵌的 `answer.test_program`，后者以 `argv[1]` 接收考生程序路径；判题串行执行，并限制时间/内存。README 明确说明它**不是安全沙箱**，仅适于单用户本机使用。题干和选项经 `pages.js` 的 `renderStem` 转义并渲染围栏代码块，避免在模板里直接信任 JSON 文本。
- 登录与用户管理（schema v4）：全站需登录，`src/app.js` 用 `exam_sid` HttpOnly cookie + SQLite `auth_sessions` 表做会话（30 天），`src/services/auth.js` 管用户 CRUD 与口令（`src/services/password.js` 的 scrypt+盐哈希）。users 表为空时 `db.js` 自动播种默认管理员 `admin/admin123`。角色只有 admin/user：系统配置页、AI问答页（`/ai`，导航标签也仅管理员可见）、`/api/settings`、`/api/users`、`/api/exams/:id/detail`、`/api/attempts/:id/preview`（预览判卷）、AI 解析相关接口仅 admin；**普通用户的卷面数据在服务端剥离 answer/explanation/参考代码/测试程序**（`pages.js` 的 `stripExamForRole`/`stripQuestionForRole`），判卷页因此只显示对错不显示正确答案，前端不做答案隐藏逻辑；例外：编程题页（`renderProg`，考试/练习两种模式）的【题解信息】栏（题解/参考代码/测试程序）对所有登录用户可见。考试/错题数据目前全局共享，不按用户隔离。测试基建 `test/helpers.js` 的 `startApp()` 默认以 admin 登录并返回 cookie。

## 隔离环境注意

`PORT`、`EXAM_DB`、`EXAM_BANK_DIR` 可在 `server.js` 启动时覆盖端口、数据库、题库；不要用正式数据库来做试卷作答测试。仅设置这些变量仍不足以完全隔离：`/api/questionbank/rescan` 使用 `src/routes/api.js` 中固定的应用目录 `question_bank`，而判题工作目录固定在该应用目录的 `data/judge_tmp`，与 `EXAM_DB` 无关。运行中的正式服务存在时，涉及判题或重扫的端到端验证应使用独立的应用目录副本、题库和数据库；独立副本还须保留 `question_bank` 路径供重扫相关测试使用。
