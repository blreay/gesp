'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf, startApp } = require('./helpers');

async function setup() {
  const dir = tmpDir('exam-db-');
  const bank = tmpDir('exam-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', 'int main(){}');
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  const { server, base } = await startApp();
  return { dir, bank, db, server, base };
}
const post = (base, url, body) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json().then(d => ({ status: r.status, body: d })));
const get = (base, url) => fetch(base + url).then(r => r.json().then(d => ({ status: r.status, body: d })));

test('api 考试流: start → 存答案 → 判卷（未答题列出、只计已答）', async () => {
  const { dir, bank, db, server, base } = await setup();

  let r = await post(base, '/api/exams/test_paper_01/start');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.attemptId >= 1);
  assert.strictEqual(r.body.durationMs, 60 * 60000); // 夹具卷自带 60 分钟

  r = await get(base, '/api/exams/test_paper_01/state');
  assert.strictEqual(r.body.attempt.status, 'in_progress');
  assert.ok(r.body.remainingMs > 0 && r.body.remainingMs <= 60 * 60000);
  assert.strictEqual(r.body.remind.beforeMs, 30 * 60000);

  r = await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  assert.strictEqual(r.body.ok, true);

  r = await post(base, '/api/attempts/1/grade', { auto: false });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.unanswered, ['q2', 'q3']);
  assert.strictEqual(r.body.scored.choice, 20);
  assert.strictEqual(r.body.scored.tf, 0);
  assert.strictEqual(r.body.scored.prog, 0);   // 编程未提交
  assert.strictEqual(r.body.scored.total, 20);
  assert.deepStrictEqual(r.body.wrongAdded, []); // q2/q3 未答不算错题

  r = await get(base, '/api/exams/test_paper_01/state');
  assert.strictEqual(r.body.attempt.status, 'graded');
  assert.strictEqual(r.body.lastGrade.scored.total, 20);

  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 考试流: 错题写入与升级；重复 start 返回原 attempt', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' }); // 错
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' }); // 对
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'false' }); // 错
  const g = await post(base, '/api/attempts/1/grade', {});
  assert.deepStrictEqual(g.body.wrongAdded.sort(), ['q1', 'q3']);
  assert.strictEqual(g.body.scored.total, 20);

  const again = await post(base, '/api/exams/test_paper_01/start'); // 已 graded → 新 attempt
  assert.strictEqual(again.body.attemptId, 2);

  const wb = require('../src/services/wrongbook');
  assert.strictEqual(wb.getByQuestion('test_paper_01', 'q1').level, 1);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 不存在的试卷 404；不存在的 attempt 404', async () => {
  const { dir, bank, db, server, base } = await setup();
  assert.strictEqual((await post(base, '/api/exams/nope/start')).status, 404);
  assert.strictEqual((await post(base, '/api/attempts/999/answers', { questionId: 'q1', answer: 'A' })).status, 404);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 已判卷的 attempt 不能重复判卷', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  const g1 = await post(base, '/api/attempts/1/grade', {});
  assert.strictEqual(g1.status, 200);
  const g2 = await post(base, '/api/attempts/1/grade', {});
  assert.strictEqual(g2.status, 400);
  const wb = require('../src/services/wrongbook');
  assert.strictEqual(wb.list({}).length, 0); // 重复判卷没有产生/升级错题
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api judge: 提交代码返回五态结果并记录', async () => {
  const { dir, bank, db, server, base } = await setup();
  const fs2 = require('fs');
  const code = fs2.readFileSync(path.join(__dirname, 'fixtures', 'cpp', 'ac.cpp'), 'utf8');
  const r = await post(base, '/api/judge', { examId: 'test_paper_01', questionId: 'prog1', code });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'ALL_PASS');
  assert.strictEqual(r.body.allPassed, true);
  assert.strictEqual(db.get().prepare('SELECT COUNT(*) c FROM prog_submissions').get().c, 1);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 复习: 建会话 → 判分 → 升级/降级生效', async () => {
  const { dir, bank, db, server, base } = await setup();
  const wb = require('../src/services/wrongbook');
  const now = Date.now();
  wb.recordWrong('test_paper_01', 'q1', now);   // level 1
  wb.recordWrong('test_paper_01', 'q2', now);   // level 1

  const s = await post(base, '/api/review/sessions', { filter: { status: 'active' } });
  assert.strictEqual(s.status, 200);
  assert.strictEqual(s.body.total, 2);
  const sid = s.body.sessionId;

  // 按 questionId 定位（items 顺序不稳定）：q1 做对 → 掌握；q2 做错 → 升 2 级
  const i1 = s.body.items.find(i => i.questionId === 'q1');
  const i2 = s.body.items.find(i => i.questionId === 'q2');
  const ans = {};
  ans[i1.wrongId] = i1.correctAnswer;                      // 做对
  ans[i2.wrongId] = i2.correctAnswer === 'A' ? 'B' : 'A';  // 做错
  const g = await post(base, `/api/review/sessions/${sid}/grade`, { answers: ans });
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.body.correctCount, 1);
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  const w2 = wb.getByQuestion('test_paper_01', 'q2');
  assert.strictEqual(w1.status, 'mastered');
  assert.strictEqual(w2.level, 2);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 错题管理: 备注、手动掌握、删除', async () => {
  const { dir, bank, db, server, base } = await setup();
  const wb = require('../src/services/wrongbook');
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  const id = wb.getByQuestion('test_paper_01', 'q1').id;

  let r = await fetch(base + '/api/wrong/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '笔记内容', note_knowledge: '循环' }) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(wb.get(id).note, '笔记内容');

  r = await fetch(base + '/api/wrong/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'mastered' }) });
  assert.strictEqual(wb.get(id).status, 'mastered');

  r = await fetch(base + '/api/wrong/' + id, { method: 'DELETE' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(wb.get(id), null);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 配置: 读取、修改、白名单校验；重扫题库', async () => {
  const { dir, bank, db, server, base } = await setup();
  let r = await get(base, '/api/settings');
  assert.strictEqual(r.body.settings.remind_before_minutes, '30');

  r = await post(base, '/api/settings', { remind_interval_minutes: 5, evil_key: 'x' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(db.getSettingInt('remind_interval_minutes'), 5);
  assert.strictEqual(db.getSetting('evil_key'), null); // 白名单外拒绝

  r = await post(base, '/api/questionbank/rescan', {});
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.loaded >= 1);   // 真实题库数量随迁移增长，不硬编码
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 复习: 编程错题走 /prog 端点即时升降级', async () => {
  const { dir, bank, db, server, base } = await setup();
  const wb = require('../src/services/wrongbook');
  wb.recordWrong('test_paper_01', 'prog1', Date.now());          // level 1
  wb.recordWrong('test_paper_01', 'prog1', Date.now() + 1);      // level 2
  const w = wb.getByQuestion('test_paper_01', 'prog1');
  const s = await post(base, '/api/review/sessions', { filter: { status: 'active' } });
  assert.strictEqual(s.body.total, 1);

  let r = await post(base, `/api/review/sessions/${s.body.sessionId}/prog`, { wrongId: w.id, allPassed: true });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(wb.get(w.id).level, 1);                     // 2 → 1

  r = await post(base, `/api/review/sessions/${s.body.sessionId}/prog`, { wrongId: w.id, allPassed: true });
  assert.strictEqual(wb.get(w.id).status, 'mastered');           // 1 → 掌握
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 预览判卷不终局、可重复，交卷后不能预览', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  let p = await post(base, '/api/attempts/1/preview', {});
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.body.scored.choice, 20);
  let st = await get(base, '/api/exams/test_paper_01/state');
  assert.strictEqual(st.body.attempt.status, 'in_progress'); // 未终局
  p = await post(base, '/api/attempts/1/preview', {});       // 可重复
  assert.strictEqual(p.status, 200);
  await post(base, '/api/attempts/1/grade', {});              // 终局
  p = await post(base, '/api/attempts/1/preview', {});
  assert.strictEqual(p.status, 400);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 重新考试清空上一次结果', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });
  db.get().prepare(`INSERT INTO prog_submissions(exam_id, question_id, attempt_id, code, compile_ok, all_passed, result_summary, created_at) VALUES ('test_paper_01', 'prog1', 1, 'x', 1, 1, 's', ?)`).run(Date.now());
  await post(base, '/api/attempts/1/grade', {});
  const r = await post(base, '/api/exams/test_paper_01/retake', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.cleared, true);
  assert.strictEqual(r.body.attemptId, 2);
  const st = await get(base, '/api/exams/test_paper_01/state');
  assert.strictEqual(st.body.attempt.status, 'in_progress');
  assert.deepStrictEqual(st.body.answers, {});               // 答案已清空
  assert.strictEqual(db.get().prepare('SELECT COUNT(*) c FROM prog_submissions WHERE attempt_id = 1').get().c, 0);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 试卷列表可按标题检索（供自动化代理）', async () => {
  const { dir, bank, db, server, base } = await setup();
  const r = await get(base, '/api/exams');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body));
  const hit = r.body.find(e => e.title === '测试卷');
  assert.ok(hit, '应能按标题找到试卷');
  assert.strictEqual(hit.id, 'test_paper_01');
  assert.strictEqual(hit.category, '测试分类');
  assert.strictEqual(hit.duration_minutes, 60);
  assert.strictEqual(hit.total_score, 100);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 试卷详情返回完整卷面（含各题型）', async () => {
  const { dir, bank, db, server, base } = await setup();
  const r = await get(base, '/api/exams/test_paper_01/detail');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.sections));
  const types = r.body.sections.map(s => s.question_type);
  assert.deepStrictEqual(types, ['choice', 'tf', 'programming']);
  const choice = r.body.sections[0].questions[0];
  assert.ok(choice.stem && choice.options, '选择题应有题干和选项');
  const detail404 = await get(base, '/api/exams/nope/detail');
  assert.strictEqual(detail404.status, 404);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});
