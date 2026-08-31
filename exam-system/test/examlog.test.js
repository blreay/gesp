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
