# GESP 在线模拟考试系统

单用户在线考试系统：文件夹分类题库（JSON 试卷模板）、服务端模板渲染、倒计时自动交卷、
编程题 g++ 在线判题、错题分级复习、数据统计与系统配置。

## 安装与启动

    npm install
    # vendor 静态资源（首次或升级 monaco/chart.js 后）：
    mkdir -p src/public/vendor
    cp -r node_modules/monaco-editor/min/vs src/public/vendor/monaco/vs
    cp node_modules/chart.js/dist/chart.umd.js src/public/vendor/chart.umd.js

    npm start          # 默认 http://localhost:8730
    PORT=9000 npm start

## 题库

`question_bank/<分类文件夹>/*.exam.json`，每套试卷一个文件。模板契约见
`docs/superpowers/specs/2026-08-27-exam-system-design.md` 第 4 节。
修改后在【系统配置】页点"重新扫描题库"。

## 常用命令

    npm test           # 单元/集成测试（node:test）
    npm run migrate    # 把旧静态卷转换为新题库
    node scripts/verify_bank.js   # 参考代码 × 测试程序验收

## 限制

- 单用户本机使用，判题仅做超时与内存限制，非安全沙箱。
- 仅支持 C++（g++）判题。

## 设计文档与实施计划

- 规格：docs/superpowers/specs/2026-08-27-exam-system-design.md
- 计划：docs/superpowers/plans/2026-08-27-exam-system.md
