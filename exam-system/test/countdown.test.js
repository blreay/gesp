'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cd = require('../src/services/countdown');

const SETTINGS = { default_duration_minutes: '120', remind_before_minutes: '30', remind_interval_minutes: '10' };

test('durationMs: 试卷自带时长优先于默认配置', () => {
  assert.strictEqual(cd.durationMs({ duration_minutes: 60 }, SETTINGS), 60 * 60000);
  assert.strictEqual(cd.durationMs({}, SETTINGS), 120 * 60000);
  assert.strictEqual(cd.durationMs({ duration_minutes: -5 }, SETTINGS), 120 * 60000);
  assert.strictEqual(cd.durationMs({}, { default_duration_minutes: 'abc' }), 120 * 60000);
});

test('remainingMs 与 deadlineAt', () => {
  const attempt = { started_at: 1000000 };
  const dur = 60 * 60000;
  assert.strictEqual(cd.deadlineAt(attempt, dur), 1000000 + dur);
  assert.strictEqual(cd.remainingMs(attempt, dur, 1000000 + 10 * 60000), 50 * 60000);
  assert.strictEqual(cd.remainingMs(attempt, dur, 1000000 + dur + 5000), 0); // 结束不为负
});

test('reminderPoints: 提前 30 分钟、每 10 分钟 → [30,20,10] 分钟', () => {
  const dur = 120 * 60000;
  const pts = cd.reminderPoints(dur, 30 * 60000, 10 * 60000);
  assert.deepStrictEqual(pts, [30 * 60000, 20 * 60000, 10 * 60000]);
});

test('reminderPoints: 提前量大于总时长按总时长截断', () => {
  const dur = 25 * 60000;
  const pts = cd.reminderPoints(dur, 30 * 60000, 10 * 60000);
  assert.deepStrictEqual(pts, [20 * 60000, 10 * 60000]);
});

test('reminderPoints: 间隔为 0 或负数返回空', () => {
  assert.deepStrictEqual(cd.reminderPoints(60 * 60000, 30 * 60000, 0), []);
});

test('fmt: HH:MM:SS', () => {
  assert.strictEqual(cd.fmt(0), '00:00:00');
  assert.strictEqual(cd.fmt(3661000), '01:01:01');
  assert.strictEqual(cd.fmt(-5), '00:00:00');
});
