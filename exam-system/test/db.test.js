'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

test('db: schema 初始化、默认配置、读写配置', () => {
  const dir = tmpDir('exam-db-');
  const dbPath = path.join(dir, 't.db');
  const db = require('../src/services/db');
  db.init(dbPath);

  // 默认设置就位
  assert.strictEqual(db.getSettingInt('default_duration_minutes'), 120);
  assert.strictEqual(db.getSettingInt('remind_before_minutes'), 30);
  assert.strictEqual(db.getSettingInt('remind_interval_minutes'), 10);
  assert.strictEqual(db.getSettingInt('judge_compile_timeout_sec'), 30);
  assert.strictEqual(db.getSettingInt('judge_run_timeout_sec'), 60);

  // 写入与读取
  db.setSetting('remind_interval_minutes', 5);
  assert.strictEqual(db.getSettingInt('remind_interval_minutes'), 5);
  assert.ok(db.allSettings()['default_duration_minutes']);

  // 核心表存在
  const tables = db.get().prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['exams','exam_attempts','exam_answers','wrong_questions','review_sessions','review_answers','prog_submissions','settings']) {
    assert.ok(tables.includes(t), '缺少表 ' + t);
  }
  db.close(); rmrf(dir);
});

test('db: 重复 init 幂等（默认值不覆盖已有设置）', () => {
  const dir = tmpDir('exam-db-');
  const dbPath = path.join(dir, 't.db');
  const db = require('../src/services/db');
  db.init(dbPath);
  db.setSetting('remind_interval_minutes', 3);
  db.close();
  db.init(dbPath);
  assert.strictEqual(db.getSettingInt('remind_interval_minutes'), 3);
  db.close(); rmrf(dir);
});
