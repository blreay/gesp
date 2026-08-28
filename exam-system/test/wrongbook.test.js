'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

function setup() {
  const dir = tmpDir('exam-db-');
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  db.get().prepare(`INSERT INTO exams(id, category, title, subtitle, file, duration_minutes, total_score, tags_json, loaded_at)
    VALUES ('e1', '分类甲', '试卷一', '', '/tmp/x.json', NULL, 100, '[]', ?)`).run(Date.now());
  return { db, dir };
}

test('错题生命周期：新建→升级→封顶→降级→掌握→复活', () => {
  const { db, dir } = setup();
  const wb = require('../src/services/wrongbook');
  const now = Date.now();

  wb.recordWrong('e1', 'q1', now);                       // level 1
  let w = wb.getByQuestion('e1', 'q1');
  assert.strictEqual(w.level, 1); assert.strictEqual(w.status, 'active');

  wb.recordWrong('e1', 'q1', now + 1);                   // level 2
  wb.recordWrong('e1', 'q1', now + 2);
  wb.recordWrong('e1', 'q1', now + 3);
  wb.recordWrong('e1', 'q1', now + 4);
  wb.recordWrong('e1', 'q1', now + 5);                   // 超上限仍为 5
  w = wb.getByQuestion('e1', 'q1');
  assert.strictEqual(w.level, 5);
  assert.strictEqual(w.times_wrong, 6);

  wb.recordRight(w.id, now + 6);  // 4
  wb.recordRight(w.id, now + 7);  // 3
  wb.recordRight(w.id, now + 8);  // 2
  wb.recordRight(w.id, now + 9);  // 1
  wb.recordRight(w.id, now + 10); // 0 → mastered
  w = wb.getByQuestion('e1', 'q1');
  assert.strictEqual(w.status, 'mastered');
  assert.strictEqual(w.times_right, 5);

  wb.recordWrong('e1', 'q1', now + 11);                  // 复活 → level 1
  w = wb.getByQuestion('e1', 'q1');
  assert.strictEqual(w.status, 'active');
  assert.strictEqual(w.level, 1);
  db.close(); rmrf(dir);
});

test('备注与手动状态', () => {
  const { db, dir } = setup();
  const wb = require('../src/services/wrongbook');
  wb.recordWrong('e1', 'q1', Date.now());
  const w = wb.getByQuestion('e1', 'q1');
  wb.setNote(w.id, '这里是笔记', '循环,取余');
  wb.setStatus(w.id, 'mastered');
  const w2 = wb.get(w.id);
  assert.strictEqual(w2.note, '这里是笔记');
  assert.strictEqual(w2.note_knowledge, '循环,取余');
  assert.strictEqual(w2.status, 'mastered');
  db.close(); rmrf(dir);
});

test('list 过滤：级别 / 状态 / 关键字', () => {
  const { db, dir } = setup();
  const wb = require('../src/services/wrongbook');
  const now = Date.now();
  wb.recordWrong('e1', 'q1', now);
  wb.recordWrong('e1', 'q2', now); wb.recordWrong('e1', 'q2', now); // level 2
  const w3id = wb.getByQuestion('e1', 'q2').id;
  wb.setNote(w3id, '特殊标记XYZ', '');
  wb.recordWrong('e1', 'q3', now);
  wb.setStatus(wb.getByQuestion('e1', 'q3').id, 'mastered');

  assert.strictEqual(wb.list({ status: 'active' }).length, 2);
  assert.strictEqual(wb.list({ level: '2' }).length, 1);
  assert.strictEqual(wb.list({ level: '3+' }).length, 0);
  assert.strictEqual(wb.list({ keyword: 'XYZ' }).length, 1);
  assert.strictEqual(wb.list({}).length, 3);
  db.close(); rmrf(dir);
});

test('recordRight 对已掌握/不存在的错题不生效', () => {
  const { db, dir } = setup();
  const wb = require('../src/services/wrongbook');
  const now = Date.now();
  assert.strictEqual(wb.recordRight(99999, now), null);
  wb.recordWrong('e1', 'q1', now);
  const w = wb.getByQuestion('e1', 'q1');
  wb.setStatus(w.id, 'mastered');
  const r = wb.recordRight(w.id, now + 1);
  assert.strictEqual(r.status, 'mastered');
  db.close(); rmrf(dir);
});
