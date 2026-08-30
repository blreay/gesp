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
