'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const db = require('./db');
const questionbank = require('./questionbank');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TMP_DIR = path.join(DATA_DIR, 'judge_tmp');
const CXX = process.env.CXX || 'g++';
const CXXFLAGS = ['-O2', '-std=c++14'];
// Fork-bomb 防护：取当前用户线程数 + 64 作为 RLIMIT_NPROC 上限
const NPROC_LIMIT = (() => {
  try {
    const n = parseInt(execSync('ls -d /proc/[0-9]*/task/[0-9]* 2>/dev/null | wc -l', { encoding: 'utf8' }).trim());
    return (n > 0 ? n : 200) + 64;
  } catch (e) { return 264; }
})();
// 单用户场景串行判题，避免多个测试程序并发写 /tmp 固定文件名互相踩踏
const MAX_CONCURRENCY = 1;
const MAX_KEPT_WORKDIRS = 20;

let running = 0;
const queue = [];
function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    running++;
    job.fn().then(
      v => { running--; job.resolve(v); pump(); },
      e => { running--; job.reject(e); pump(); }
    );
  }
}

const OUTPUT_CAP = 1024 * 1024; // 1 MB per stream

function runCmd(args, opts) {
  return new Promise(resolve => {
    const child = spawn(args[0], args.slice(1), { cwd: opts.cwd, detached: true });
    let stdout = '', stderr = '', killed = false, truncated = false;

    function killGroup() {
      killed = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { try { child.kill('SIGKILL'); } catch (e2) {} }
    }

    const timer = setTimeout(killGroup, opts.timeout);

    child.stdout.on('data', d => {
      if (truncated) return;
      stdout += d;
      if (stdout.length > OUTPUT_CAP) { truncated = true; stdout = stdout.slice(0, OUTPUT_CAP) + '\n[输出过长已截断]'; killGroup(); }
    });
    child.stderr.on('data', d => {
      if (truncated) return;
      stderr += d;
      if (stderr.length > OUTPUT_CAP) { truncated = true; stderr = stderr.slice(0, OUTPUT_CAP) + '\n[输出过长已截断]'; killGroup(); }
    });
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message, killed }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, killed }); });
  });
}

function cleanupWorkDirs() {
  if (!fs.existsSync(TMP_DIR)) return;
  const dirs = fs.readdirSync(TMP_DIR)
    .map(d => ({ d, t: fs.statSync(path.join(TMP_DIR, d)).mtimeMs }))
    .sort((a, b) => a.t - b.t);
  while (dirs.length > MAX_KEPT_WORKDIRS) {
    fs.rmSync(path.join(TMP_DIR, dirs.shift().d), { recursive: true, force: true });
  }
}

// 判题入口。返回 { status, allPassed, passed, total, detail, submissionId }
// status ∈ ALL_PASS | PARTIAL_PASS | COMPILE_ERROR | TESTER_BUILD_ERROR | RUNTIME_ERROR
function judge({ examId, questionId, attemptId, code }) {
  return enqueue(async () => {
    const hit = questionbank.getQuestion(examId, questionId);
    if (!hit || hit.question.type !== 'programming') throw new Error('题目不存在或不是编程题');
    const testProgram = hit.question.answer.test_program;
    const compileT = db.getSettingInt('judge_compile_timeout_sec') * 1000;
    const runT = db.getSettingInt('judge_run_timeout_sec');

    fs.mkdirSync(TMP_DIR, { recursive: true });
    const workDir = fs.mkdtempSync(path.join(TMP_DIR, 'sub_'));
    fs.writeFileSync(path.join(workDir, 'main.cpp'), code);
    fs.writeFileSync(path.join(workDir, 'test.cpp'), testProgram);

    let status = 'RUNTIME_ERROR', detail = '', allPassed = false;
    const logs = [];

    // 1. 编译学生代码
    let r = await runCmd([CXX, ...CXXFLAGS, '-lm', '-o', 'student', 'main.cpp'], { cwd: workDir, timeout: compileT });
    logs.push({ step: '编译学生代码', cmd: 'g++ -O2 -std=c++14 -lm -o student main.cpp', exitCode: r.code, killed: !!r.killed, output: ((r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '')).slice(0, 20000) });
    if (r.killed || r.code !== 0) {
      status = 'COMPILE_ERROR';
      detail = (r.stderr || r.stdout || '').slice(0, 8000);
      return finish();
    }
    // 2. 编译测试程序
    r = await runCmd([CXX, ...CXXFLAGS, '-o', 'tester', 'test.cpp'], { cwd: workDir, timeout: compileT });
    logs.push({ step: '编译测试程序', cmd: 'g++ -O2 -std=c++14 -o tester test.cpp', exitCode: r.code, killed: !!r.killed, output: ((r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '')).slice(0, 20000) });
    if (r.killed || r.code !== 0) {
      status = 'TESTER_BUILD_ERROR';
      detail = '题库中的测试程序编译失败，请修复试卷文件：\n' + (r.stderr || '').slice(0, 8000);
      return finish();
    }
    // 3. 运行评测（资源限制）
    r = await runCmd(['bash', '-c', 'ulimit -v 512000 -u ' + NPROC_LIMIT + ' -t ' + (runT + 5) + '; exec ./tester ./student'], {
      cwd: workDir, timeout: runT * 1000 + 5000
    });
    logs.push({ step: '运行测试程序', cmd: './tester ./student   (ulimit -v 512000 -u ' + NPROC_LIMIT + ' -t ' + (runT + 5) + ')', exitCode: r.code, killed: !!r.killed, output: ((r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '')).slice(0, 20000) });
    if (r.killed) {
      status = 'RUNTIME_ERROR';
      detail = '评测超时或资源超限。';
    } else if (r.code === 0) {
      status = 'ALL_PASS'; allPassed = true;
      detail = r.stdout || '全部通过';
    } else if (r.code === null || r.code < 0) {
      status = 'RUNTIME_ERROR';
      detail = '学生程序运行时崩溃。\n' + (r.stderr || '').slice(0, 4000);
    } else {
      status = 'PARTIAL_PASS';
      detail = r.stdout + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
    }
    return finish();

    function finish() {
      const REASONS = {
        ALL_PASS: '判定：通过。测试程序退出码为 0，全部用例通过。',
        PARTIAL_PASS: '判定：未通过。测试程序退出码非 0，存在失败用例（失败明细见"运行测试程序"输出）。',
        COMPILE_ERROR: '判定：编译失败。学生代码无法编译，未生成可执行程序，未能运行测试。',
        TESTER_BUILD_ERROR: '判定：题库测试程序编译失败（试卷文件问题），本次评测无效。',
        RUNTIME_ERROR: '判定：运行异常。评测超时或程序崩溃（被强制终止）。'
      };
      const reason = REASONS[status] || '';
      const info = db.get().prepare(`INSERT INTO prog_submissions
        (exam_id, question_id, attempt_id, code, compile_ok, all_passed, result_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        examId, questionId, attemptId || null, code,
        status === 'COMPILE_ERROR' ? 0 : 1,
        allPassed ? 1 : 0,
        (status + '\n' + detail).slice(0, 60000),
        Date.now()
      );
      const submissionId = Number(info.lastInsertRowid);
      if (attemptId) {
        db.get().prepare(`INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (?, ?, ?)
          ON CONFLICT(attempt_id, question_id) DO UPDATE SET answer = excluded.answer`)
          .run(attemptId, questionId, String(submissionId));
      }
      cleanupWorkDirs();
      return { status, allPassed, passed: null, total: null, detail, submissionId, logs, reason };
    }
  });
}

module.exports = { judge };
