'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers');

test('迁移: 全新库启动后 schema_version=当前版本, 不备份', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  assert.strictEqual(dbmod.getSetting('schema_version'), String(dbmod.CURRENT_SCHEMA_VERSION));
  const baks = fs.readdirSync(dir).filter(f => f.includes('.bak-'));
  assert.strictEqual(baks.length, 0);
  dbmod.close(); rmrf(dir);
});

test('迁移: 已是最新版本, 重复打开不迁移不备份', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  dbmod.close();
  dbmod.init(path.join(dir, 't.db')); // 再开一次
  assert.strictEqual(dbmod.getSetting('schema_version'), String(dbmod.CURRENT_SCHEMA_VERSION));
  assert.strictEqual(fs.readdirSync(dir).filter(f => f.includes('.bak-')).length, 0);
  dbmod.close(); rmrf(dir);
});

test('迁移: 旧版本升级 → 先备份、跑迁移、升版本', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  // 人为把版本压到 1（模拟旧库），并注入一个假的 2 号迁移
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','1')").run();
  let ran = false;
  const res = dbmod.ensureMigrated(dbmod.get(), { 2: (d) => { ran = true; } }, 2);
  assert.strictEqual(ran, true, '应执行 2 号迁移');
  assert.strictEqual(res.migrated, true);
  assert.ok(res.backup && fs.existsSync(res.backup), '应生成备份文件');
  assert.strictEqual(dbmod.get().prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '2');
  dbmod.close(); rmrf(dir);
});

test('迁移: 迁移函数抛错时事务回滚, 版本不升级', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','1')").run();
  assert.throws(() => dbmod.ensureMigrated(dbmod.get(), { 2: () => { throw new Error('boom'); } }, 2), /boom/);
  assert.strictEqual(dbmod.get().prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '1');
  dbmod.close(); rmrf(dir);
});

test('迁移: 拒绝降级', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','5')").run();
  assert.throws(() => dbmod.ensureMigrated(dbmod.get(), {}, 1), /拒绝降级/);
  dbmod.close(); rmrf(dir);
});

test('迁移: 损坏的 schema_version 抛错', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  dbmod.init(path.join(dir, 't.db'));
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','garbage')").run();
  assert.throws(() => dbmod.ensureMigrated(dbmod.get(), {}, 1), /损坏/);
  dbmod.close(); rmrf(dir);
});

test('迁移: v2 旧库升级到当前版本自动补 score_fill 列并备份', () => {
  const dir = tmpDir('mig-');
  const dbmod = require('../src/services/db');
  const dbPath = path.join(dir, 't.db');
  dbmod.init(dbPath);
  // 模拟 v2 旧库：版本压到 2，去掉 v3 才有的 score_fill 列和 v4 才有的 users 表
  dbmod.get().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','2')").run();
  dbmod.get().exec('ALTER TABLE exam_attempts DROP COLUMN score_fill');
  dbmod.get().exec('DROP TABLE auth_sessions');
  dbmod.get().exec('DROP TABLE users');
  dbmod.close();

  dbmod.init(dbPath); // 重新打开 → 应自动执行 3、4 号迁移
  assert.strictEqual(dbmod.getSetting('schema_version'), String(dbmod.CURRENT_SCHEMA_VERSION));
  const cols = dbmod.get().prepare('PRAGMA table_info(exam_attempts)').all().map(c => c.name);
  assert.ok(cols.includes('score_fill'), 'score_fill 列应被迁移补上');
  const admin = dbmod.get().prepare("SELECT * FROM users WHERE username='admin'").get();
  assert.ok(admin, '迁移后应播种默认管理员');
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(fs.readdirSync(dir).filter(f => f.includes('.bak-')).length, 1, '升级前应生成备份');
  dbmod.close(); rmrf(dir);
});
