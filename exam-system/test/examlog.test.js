'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

function setup() {
  const dir = tmpDir('examlog-');
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  return { db, dir };
}

test('examlog: 全新库自带 exam_log 表且版本为 2', () => {
  const { db, dir } = setup();
  const cols = db.get().prepare("PRAGMA table_info(exam_log)").all().map(c => c.name);
  for (const c of ['id', 'exam_id', 'exam_title', 'nth', 'day', 'started_at', 'submitted_at',
    'auto_submitted', 'total_score', 'prog_total', 'prog_submitted', 'prog_passed', 'all_done', 'created_at']) {
    assert.ok(cols.includes(c), '缺列: ' + c);
  }
  assert.strictEqual(db.getSetting('schema_version'), '2');
  db.close(); rmrf(dir);
});

function fakeAtt(examId, startTs) {
  return { id: 1, exam_id: examId, status: 'graded', started_at: startTs, submitted_at: null, auto_submitted: 0, total_score: 0 };
}
function fakeExamObj(title) { return { exam: { id: 'x', title }, sections: [] }; }
function expectedDay(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test('examlog.record: 字段计算与写入', () => {
  const { db, dir } = setup();
  const examlog = require('../src/services/examlog');
  const start = Date.parse('2026-08-31T09:00:00');
  const end = Date.parse('2026-08-31T10:30:00');
  const payload = {
    scored: { choice: 20, tf: 10, prog: 50, total: 80 },
    unanswered: [],
    results: [
      { qid: 'q1', type: 'choice', correct: true, skipped: false, userAnswer: 'B', score: 20, full: 20 },
      { qid: 'prog1', type: 'programming', correct: true, skipped: false, userAnswer: 'submitted', score: 50, full: 50 },
      { qid: 'prog2', type: 'programming', correct: false, skipped: true, userAnswer: null, score: 0, full: 50 }
    ]
  };
  examlog.record(fakeAtt('e1', start), fakeExamObj('试卷甲'), payload, end, false);
  const rows = db.get().prepare('SELECT * FROM exam_log').all();
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(r.exam_id, 'e1');
  assert.strictEqual(r.exam_title, '试卷甲');
  assert.strictEqual(r.nth, 1);
  assert.strictEqual(r.day, expectedDay(start));
  assert.strictEqual(r.started_at, start);
  assert.strictEqual(r.submitted_at, end);
  assert.strictEqual(r.auto_submitted, 0);
  assert.strictEqual(r.total_score, 80);
  assert.strictEqual(r.prog_total, 2);
  assert.strictEqual(r.prog_submitted, 1);
  assert.strictEqual(r.prog_passed, 1);
  // 客观题无未答，但编程题 2 道只提交 1 道（1 !== 2）→ 未完成
  assert.strictEqual(r.all_done, 0);
  db.close(); rmrf(dir);
});

test('examlog.record: nth 随同卷递增、跨卷独立；list 按开始时间倒序', () => {
  const { db, dir } = setup();
  const examlog = require('../src/services/examlog');
  const t0 = Date.parse('2026-08-01T09:00:00');
  const pEmpty = { scored: { total: 0 }, unanswered: ['q1'], results: [] };
  examlog.record(fakeAtt('e1', t0), fakeExamObj('卷一'), pEmpty, t0 + 3600000, false);
  examlog.record(fakeAtt('e1', t0 + 86400000), fakeExamObj('卷一'), pEmpty, t0 + 86400000 + 3600000, true);
  examlog.record(fakeAtt('e2', t0 + 2 * 86400000), fakeExamObj('卷二'), pEmpty, t0 + 2 * 86400000 + 3600000, false);
  const rows = db.get().prepare('SELECT exam_id, nth, auto_submitted FROM exam_log ORDER BY id').all();
  assert.deepStrictEqual(rows.map(r => [r.exam_id, r.nth]), [['e1', 1], ['e1', 2], ['e2', 1]]);
  assert.strictEqual(rows[1].auto_submitted, 1);
  const list = examlog.list();
  assert.deepStrictEqual(list.map(r => r.exam_id), ['e2', 'e1', 'e1']); // started_at 倒序
  db.close(); rmrf(dir);
});
