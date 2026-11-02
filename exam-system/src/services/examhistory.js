'use strict';
const db = require('./db');

// 试卷提交历史：每次正式交卷写入一条记录 + 完整快照。
// 快照 = 判分时刻的完整试卷 JSON（含答案/解析/参考代码）+ 客观题作答
//        + 每道编程题的最后一次提交（代码/判定/结果摘要）+ 判分结果。
// retake 会删除上一次 attempt，因此快照必须在交卷时固化，事后无法重建。

// 组装快照。exam/payload 可为 null（老记录回填时试卷可能已不在题库）。
function buildSnapshot(examId, attemptId, exam, payload) {
  const d = db.get();
  const answers = {};
  for (const r of d.prepare('SELECT question_id, answer FROM exam_answers WHERE attempt_id = ?').all(attemptId)) {
    answers[r.question_id] = r.answer;
  }
  const prog = {};
  const rows = d.prepare(`SELECT * FROM prog_submissions WHERE exam_id = ? AND attempt_id = ? AND id IN
      (SELECT MAX(id) FROM prog_submissions WHERE exam_id = ? AND attempt_id = ? GROUP BY question_id)`)
    .all(examId, attemptId, examId, attemptId);
  for (const r of rows) {
    prog[r.question_id] = {
      code: r.code, compileOk: !!r.compile_ok, allPassed: !!r.all_passed,
      resultSummary: r.result_summary, submittedAt: r.created_at
    };
  }
  return {
    exam: exam || null,
    answers, prog,
    results: (payload && payload.results) || [],
    scored: (payload && payload.scored) || null,
    unanswered: (payload && payload.unanswered) || []
  };
}

// 正式交卷后写一条历史（应在判分事务内调用）。UNIQUE(attempt_id) + INSERT OR IGNORE 防重。
// att: exam_attempts 行；exam: 试卷对象；payload: makeGradePayload 结果；
// now: 交卷时间戳；autoSubmitted: bool；submitter: req.user（缺省回落到 attempt 上记录的做题人）。
function record(att, exam, payload, now, autoSubmitted, submitter) {
  const d = db.get();
  const scored = (payload && payload.scored) || { total: att.total_score || 0, full: 0 };
  const snapshot = buildSnapshot(att.exam_id, att.id, exam, payload);
  const username = (submitter && submitter.username) || att.username || '';
  d.prepare(`INSERT OR IGNORE INTO exam_history(exam_id, exam_title, attempt_id, username, started_at, submitted_at,
      auto_submitted, total_score, full_score, score_json, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(att.exam_id, (exam && exam.exam && exam.exam.title) || att.exam_id, att.id, username,
      att.started_at, now, autoSubmitted ? 1 : 0,
      scored.total || 0, scored.full || 0, JSON.stringify(scored), JSON.stringify(snapshot), Date.now());
}

// 某试卷的历史列表（不含快照大字段），按交卷时间倒序
function listForExam(examId) {
  return db.get().prepare(`SELECT id, exam_id, exam_title, attempt_id, username, started_at, submitted_at,
      auto_submitted, total_score, full_score, score_json FROM exam_history
    WHERE exam_id = ? ORDER BY submitted_at DESC, id DESC`).all(examId);
}

// 单条记录（含解析后的快照）
function get(id) {
  const row = db.get().prepare('SELECT * FROM exam_history WHERE id = ?').get(id);
  if (!row) return null;
  let snapshot = null;
  try { snapshot = JSON.parse(row.snapshot); } catch (e) { snapshot = null; }
  return { ...row, snapshot };
}

// 启动时为已存在的 graded attempt 补历史快照（幂等：UNIQUE(attempt_id) 只补一次）。
// 必须在题库扫描完成后调用；被 retake 删除的历史无法恢复（与 exam_log 回填口径一致）。
// 老记录没有做题人（username 列为空 → 页面显示"历史记录"）。
function backfillIfNeeded() {
  const questionbank = require('./questionbank');
  const sessions = require('./examsessions');
  const d = db.get();
  const rows = d.prepare("SELECT * FROM exam_attempts WHERE status = 'graded' ORDER BY started_at, id").all();
  let count = 0;
  const run = d.transaction(() => {
    for (const att of rows) {
      if (d.prepare('SELECT 1 FROM exam_history WHERE attempt_id = ?').get(att.id)) continue;
      const exam = questionbank.getExam(att.exam_id);
      const payload = exam ? sessions.makeGradePayload(exam, att) : null;
      record(att, exam, payload, att.submitted_at || att.started_at, !!att.auto_submitted, null);
      count++;
    }
  });
  run();
  return { backfilled: count > 0, count };
}

module.exports = { record, listForExam, get, backfillIfNeeded, buildSnapshot };
