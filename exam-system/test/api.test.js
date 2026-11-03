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
  const { server, base, cookie } = await startApp();
  COOKIE = cookie;
  return { dir, bank, db, server, base };
}
// 全站启用登录后，测试统一携带管理员会话 cookie
let COOKIE = '';
const authFetch = (url, opts) => fetch(url, Object.assign({}, opts, {
  headers: Object.assign({}, opts && opts.headers, COOKIE ? { Cookie: COOKIE } : {})
}));
const post = (base, url, body) =>
  authFetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json().then(d => ({ status: r.status, body: d })));
const get = (base, url) => authFetch(base + url).then(r => r.json().then(d => ({ status: r.status, body: d })));

// 创建普通用户 kid 并登录，返回带其会话的 POST 助手（用于角色相关断言，如交卷门槛）
async function kidSession(base) {
  await post(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' });
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kid', password: 'kid12345' })
  });
  const sc = lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')];
  const cookie = String((sc && sc[0]) || '').split(';')[0];
  return {
    cookie,
    post: (url, body) => fetch(base + url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body || {})
    }).then(r => r.json().then(d => ({ status: r.status, body: d })))
  };
}

test('api 考试流: start → 存答案 → 交卷门槛（普通用户客观题须全答）→ 判卷', async () => {
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

  // 普通用户：客观题未完成 → 拒绝交卷，返回缺失清单（管理员不受此门槛限制，见下）
  const kid = await kidSession(base);
  r = await kid.post('/api/attempts/1/grade', { auto: false });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('未作答'));
  assert.deepStrictEqual(r.body.missing, ['选择题 第 2 题', '判断题 第 1 题']);

  // 管理员预览判卷不受完成度限制，可列出未答题
  r = await post(base, '/api/attempts/1/preview', {});
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.unanswered, ['q2', 'q3']);
  assert.strictEqual(r.body.scored.choice, 20);

  // 补全全部客观题后才能交卷
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  r = await post(base, '/api/attempts/1/grade', { auto: false });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.unanswered, []);
  assert.strictEqual(r.body.scored.choice, 40);
  assert.strictEqual(r.body.scored.tf, 10);
  assert.strictEqual(r.body.scored.prog, 0);   // 编程未提交
  assert.strictEqual(r.body.scored.total, 50);
  assert.deepStrictEqual(r.body.wrongAdded, []);

  r = await get(base, '/api/exams/test_paper_01/state');
  assert.strictEqual(r.body.attempt.status, 'graded');
  assert.strictEqual(r.body.lastGrade.scored.total, 50);

  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 时间已到不自动交卷，仍可继续作答并交卷', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  // 把开始时间拨回 2 小时前（夹具卷时长 60 分钟）→ 已超时
  db.get().prepare('UPDATE exam_attempts SET started_at = ? WHERE id = 1').run(Date.now() - 2 * 3600 * 1000);
  // 超时后仍可存答案
  let r = await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  assert.strictEqual(r.status, 200);
  // 普通用户：客观题未答完 → 交卷仍被拒（门槛不因超时放开；管理员可随时交卷）
  const kid = await kidSession(base);
  r = await kid.post('/api/attempts/1/grade', {});
  assert.strictEqual(r.status, 400);
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  r = await post(base, '/api/attempts/1/grade', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.scored.total, 50);
  assert.strictEqual(r.body.autoSubmitted, false); // 超时交卷不算自动交卷
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 管理员可随时交卷——客观题未答完也能交，未答题按未作答计 0 分', async () => {
  const { dir, bank, db, server, base } = await setup();
  try {
    let r = await post(base, '/api/exams/test_paper_01/start');
    assert.strictEqual(r.status, 200);
    const attId = r.body.attemptId;
    await post(base, `/api/attempts/${attId}/answers`, { questionId: 'q1', answer: 'B' }); // 只答 1 题
    // 同样的状态普通用户会被 400 拦截（门槛仍在），管理员直接放行
    const kid = await kidSession(base);
    r = await kid.post(`/api/attempts/${attId}/grade`, {});
    assert.strictEqual(r.status, 400);
    r = await post(base, `/api/attempts/${attId}/grade`, {});
    assert.strictEqual(r.status, 200, '管理员交卷不受客观题门槛限制');
    assert.strictEqual(r.body.scored.total, 20);            // 仅 q1 得分
    assert.deepStrictEqual(r.body.unanswered, ['q2', 'q3']); // 未答题照常列出
    const byQid = Object.fromEntries(r.body.results.map(x => [x.qid, x]));
    assert.strictEqual(byQid.q2.skipped, true);
    assert.strictEqual(byQid.q3.skipped, true);
    assert.deepStrictEqual(r.body.wrongAdded, [], '未作答题不应计入错题');
    // 管理员提前交卷同样写入历史快照
    const html = await (await authFetch(base + '/exam/test_paper_01/history')).text();
    assert.ok(html.includes('共 1 条记录'), '交卷成功应生成历史记录');
  } finally {
    server.close(); db.close(); rmrf(dir); rmrf(bank);
  }
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
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
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

  let r = await authFetch(base + '/api/wrong/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '笔记内容', note_knowledge: '循环' }) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(wb.get(id).note, '笔记内容');

  r = await authFetch(base + '/api/wrong/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'mastered' }) });
  assert.strictEqual(wb.get(id).status, 'mastered');

  r = await authFetch(base + '/api/wrong/' + id, { method: 'DELETE' });
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
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/1/grade', {});              // 终局
  p = await post(base, '/api/attempts/1/preview', {});
  assert.strictEqual(p.status, 400);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api: 重新考试清空上一次结果', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
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

test('api 配置: 含 4 个 AI 键且可保存', async () => {
  const { dir, bank, db, server, base } = await setup();
  let r = await get(base, '/api/settings');
  assert.strictEqual(r.status, 200);
  for (const k of ['ai_webui_url', 'ai_base_url', 'ai_api_key', 'ai_model']) {
    assert.ok(k in r.body.settings, '应有 ' + k);
  }
  assert.strictEqual(r.body.settings.ai_webui_url, 'http://121.40.190.90:3000/');
  assert.strictEqual(r.body.settings.ai_base_url, 'http://121.40.190.90:4000');
  assert.strictEqual(r.body.settings.ai_model, 'qwen-local');
  assert.strictEqual(r.body.settings.ai_api_key, 'sk-vllm-aaa-bbb');

  r = await post(base, '/api/settings', { ai_base_url: 'http://example:9999' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(db.getSetting('ai_base_url'), 'http://example:9999');
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-context: 选择题返回固定前缀+题干+你的答案/正确答案', async () => {
  const { dir, bank, db, server, base } = await setup();
  // 造一场已答错的考试：q1 正确答案 B，故意答 A（其余答对，满足交卷门槛）
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/1/grade', {});   // q1 答错 → 进错题本
  const list = db.get().prepare("SELECT * FROM wrong_questions WHERE question_id='q1'").get();
  assert.ok(list, 'q1 应在错题本');

  const r = await get(base, '/api/wrong/' + list.id + '/ai-context');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.message.includes('这是考试错误的一个C++考试题'));
  assert.ok(r.body.message.includes('【题目】'));
  assert.ok(r.body.message.includes('你的答案：A'));
  assert.ok(r.body.message.includes('正确答案：B'));
  assert.strictEqual(r.body.config.baseUrl, 'http://121.40.190.90:4000');
  assert.strictEqual(r.body.config.model, 'qwen-local');
  assert.ok(r.body.config.apiKey);
  assert.strictEqual(r.body.config.showThinking, false);   // 默认 ai_show_thinking='0' → 关闭思考
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-context: 不存在的错题返回 404', async () => {
  const { dir, bank, db, server, base } = await setup();
  const r = await get(base, '/api/wrong/99999/ai-context');
  assert.strictEqual(r.status, 404);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai/chat: 空 messages 返回 400（同源代理端点参数校验）', async () => {
  const { dir, bank, db, server, base } = await setup();
  const r = await post(base, '/api/ai/chat', { messages: [] });
  assert.strictEqual(r.status, 400);
  const r2 = await post(base, '/api/ai/chat', {});
  assert.strictEqual(r2.status, 400);
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api exam-log: 判卷写日志；预览不写；retake 后 nth 递增；自动交卷标记', async () => {
  const { dir, bank, db, server, base } = await setup();

  // 第 1 场：客观题全答对 → 预览不记、判卷记
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  await post(base, '/api/attempts/1/preview', {});
  assert.strictEqual(db.get().prepare('SELECT COUNT(*) c FROM exam_log').get().c, 0); // 预览不写
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/1/grade', {});
  let logs = db.get().prepare('SELECT * FROM exam_log').all();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].nth, 1);
  assert.strictEqual(logs[0].exam_title, '测试卷');
  assert.strictEqual(logs[0].total_score, 50);
  assert.strictEqual(logs[0].all_done, 0);      // 编程题未提交 → 不算全部完成
  assert.strictEqual(logs[0].prog_total, 1);
  assert.strictEqual(logs[0].prog_submitted, 0);
  assert.strictEqual(logs[0].auto_submitted, 0);

  // 第 2 场：retake 后带 auto 标记交卷 → nth=2、auto_submitted=1（兼容历史数据）
  await post(base, '/api/exams/test_paper_01/retake', {});
  await post(base, '/api/attempts/2/answers', { questionId: 'q1', answer: 'B' });
  await post(base, '/api/attempts/2/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/2/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/2/grade', { auto: true });
  logs = db.get().prepare('SELECT * FROM exam_log ORDER BY id').all();
  assert.strictEqual(logs.length, 2);
  assert.strictEqual(logs[1].nth, 2);
  assert.strictEqual(logs[1].auto_submitted, 1);
  assert.strictEqual(logs[1].total_score, 50);

  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api exam-log: 统计页包含考试日志区', async () => {
  const { dir, bank, db, server, base } = await setup();
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/1/grade', {});
  const r = await authFetch(base + '/stats');
  const html = await r.text();
  assert.strictEqual(r.status, 200);
  assert.ok(html.includes('每日模拟考试日志'));
  assert.ok(html.includes('logGranularity'));
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-parse: full 只入队空备注错题；status/abort 可用', async () => {
  const { dir, bank, db, server, base } = await setup();
  const wb = require('../src/services/wrongbook');
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  aiparse._setAiCall(async () => 'x');     // 避免真实 AI 调用
  wb.recordWrong('test_paper_01', 'q1', Date.now());
  wb.recordWrong('test_paper_01', 'q3', Date.now());
  const w1 = wb.getByQuestion('test_paper_01', 'q1');
  wb.setNote(w1.id, '已有备注', '');         // q1 有备注，不应被全量解析

  const full = await post(base, '/api/ai-parse/full', {});
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.body.queued, 1);   // 只有 q3 空备注
  for (let i = 0; i < 100 && aiparse.status().active; i++) await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(wb.get(w1.id).note, '已有备注');   // 未被改动

  const st = await get(base, '/api/ai-parse/status');
  assert.strictEqual(st.status, 200);
  assert.ok(typeof st.body.total === 'number');
  const ab = await post(base, '/api/ai-parse/abort', {});
  assert.strictEqual(ab.body.ok, true);
  aiparse._resetAiCall();
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api ai-parse: ai_auto_parse 开启时判卷自动入队', async () => {
  const { dir, bank, db, server, base } = await setup();
  const aiparse = require('../src/services/aiparse');
  aiparse._reset();
  aiparse._setAiCall(async () => 'x');
  await post(base, '/api/settings', { ai_auto_parse: '1' });
  await post(base, '/api/exams/test_paper_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'q1', answer: 'A' });  // 错
  await post(base, '/api/attempts/1/answers', { questionId: 'q2', answer: 'B' });
  await post(base, '/api/attempts/1/answers', { questionId: 'q3', answer: 'true' });
  await post(base, '/api/attempts/1/grade', {});
  const st = aiparse.status();
  assert.ok(st.total >= 1 || st.active, '应已入队');
  for (let i = 0; i < 100 && aiparse.status().active; i++) await new Promise(r => setTimeout(r, 20));
  aiparse._resetAiCall();
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 配置: ai_system_prompt 可置空（回退内置默认）', async () => {
  const { dir, bank, db, server, base } = await setup();
  const aictx = require('../src/services/aicontext');
  await post(base, '/api/settings', { ai_system_prompt: '自定义提示词' });
  assert.strictEqual(db.getSetting('ai_system_prompt'), '自定义提示词');
  await post(base, '/api/settings', { ai_system_prompt: '' });
  assert.strictEqual(db.getSetting('ai_system_prompt'), '');
  assert.strictEqual(aictx.getSystemPrompt(), aictx.DEFAULT_AI_PROMPT); // 空 → 回退默认
  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('考试页和错题页: 多行选择题选项保留代码排版并转义 HTML', async () => {
  const dir = tmpDir('exam-db-');
  const bank = tmpDir('exam-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  const paper = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8')
    .replace('TESTER_PLACEHOLDER_SOURCE', 'int main(){}'));
  paper.sections[0].questions[0].options.A = '```\nif (x < 2) cout << x;\n<script>alert(1)</script>\n```';
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), JSON.stringify(paper));
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  require('../src/services/wrongbook').recordWrong('test_paper_01', 'q1', Date.now());
  const { server, base, cookie } = await startApp();
  COOKIE = cookie;
  try {
    const session = await post(base, '/api/review/sessions', { filter: { status: 'active' } });
    assert.strictEqual(session.status, 200);
    for (const route of ['/exam/test_paper_01', `/review/session/${session.body.sessionId}`]) {
      const res = await authFetch(base + route);
      const html = await res.text();
      assert.strictEqual(res.status, 200);
      assert.ok(html.includes('<div class="opt-text">A. <pre>if (x &lt; 2) cout &lt;&lt; x;'), route);
      assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert.ok(!html.includes('<script>alert(1)</script>'));
    }
  } finally {
    server.closeAllConnections(); server.close(); db.close(); rmrf(dir); rmrf(bank);
  }
});

test('review 页: 题干代码块用 <pre> 完整渲染（不再被摘要截掉）', async () => {
  const dir = tmpDir('exam-db-');
  const bank = tmpDir('exam-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  // 基于夹具造一份 q1 题干带代码围栏的试卷
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', 'int main(){}');
  const paper = JSON.parse(raw);
  paper.sections[0].questions[0].stem = '以下代码输出什么？\n```\nint a = 3;\ncout << a + 1;\n```';
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), JSON.stringify(paper));
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  require('../src/services/wrongbook').recordWrong('test_paper_01', 'q1', Date.now());
  const { server, base, cookie } = await startApp();
  COOKIE = cookie;
  try {
    const r = await authFetch(base + '/review');
    const html = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(html.includes('以下代码输出什么？'), '题干首行应在');
    assert.ok(html.includes('<pre>int a = 3;'), '代码块应渲染为 <pre>');
    assert.ok(html.includes('cout &lt;&lt; a + 1;'), '代码内容应转义后完整呈现');
    assert.ok(!html.includes('[代码]'), '不应再出现 [代码] 占位符');
  } finally {
    server.close(); db.close(); rmrf(dir); rmrf(bank);
  }
});

async function setupFill() {
  const dir = tmpDir('exam-db-');
  const bank = tmpDir('exam-bank-');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  let raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '测试卷.exam.json'), 'utf8');
  raw = raw.replace('TESTER_PLACEHOLDER_SOURCE', 'int main(){}');
  fs.writeFileSync(path.join(bank, '测试分类', '测试卷.exam.json'), raw);
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'bank', '测试分类', '填空测试卷.exam.json'),
    path.join(bank, '测试分类', '填空测试卷.exam.json'));
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  const { server, base, cookie } = await startApp();
  COOKIE = cookie;
  return { dir, bank, db, server, base };
}

test('api 填空题流: 存答案 → 预览 → 交卷门槛 → score_fill 落库；空串视为未答', async () => {
  const { dir, bank, db, server, base } = await setupFill();

  let r = await post(base, '/api/exams/test_fill_01/start');
  assert.strictEqual(r.status, 200);
  const attId = r.body.attemptId;

  await post(base, `/api/attempts/${attId}/answers`, { questionId: 'f1', answer: '1101' });
  await post(base, `/api/attempts/${attId}/answers`, { questionId: 'f2', answer: '　ｅ５　' }); // 全角+空白，归一化后应判对
  await post(base, `/api/attempts/${attId}/answers`, { questionId: 'f3', answer: '' });          // 空串=未答

  // 管理员预览不受完成度限制
  r = await post(base, `/api/attempts/${attId}/preview`, {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.scored.fill, 2);
  assert.strictEqual(r.body.scored.fillFull, 3);
  assert.strictEqual(r.body.scored.total, 2);
  assert.deepStrictEqual(r.body.unanswered, ['f3']);

  // 普通用户：f3 空串=未答 → 交卷被拒（管理员不受门槛限制，见专门用例）
  const kid = await kidSession(base);
  r = await kid.post(`/api/attempts/${attId}/grade`, { auto: false });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('未作答'));
  assert.deepStrictEqual(r.body.missing, ['填空题 第 3 题']);

  // 补答 f3 后交卷成功
  await post(base, `/api/attempts/${attId}/answers`, { questionId: 'f3', answer: '2, 1' });
  r = await post(base, `/api/attempts/${attId}/grade`, { auto: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.scored.fill, 3);
  assert.strictEqual(r.body.scored.total, 3);
  assert.deepStrictEqual(r.body.wrongAdded, []);
  const f2 = r.body.results.find(x => x.qid === 'f2');
  assert.ok(f2.correct);

  const row = db.get().prepare('SELECT score_choice, score_tf, score_fill, score_prog, total_score FROM exam_attempts WHERE id = ?').get(attId);
  assert.strictEqual(row.score_fill, 3);
  assert.strictEqual(row.score_choice, 0);
  assert.strictEqual(row.total_score, 3);

  // 考试页应渲染填空输入框
  const res = await authFetch(base + '/exam/test_fill_01');
  const html = await res.text();
  assert.ok(html.includes('data-type="fill"'));
  assert.ok(html.includes('class="fill-input"'));
  assert.ok(html.includes('填空题'));

  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('api 填空题判卷: 答错入错题本；复习会话重做判对后降级', async () => {
  const { dir, bank, db, server, base } = await setupFill();
  await post(base, '/api/exams/test_fill_01/start');
  await post(base, '/api/attempts/1/answers', { questionId: 'f1', answer: '1102' }); // 错
  await post(base, '/api/attempts/1/answers', { questionId: 'f2', answer: 'E5' });
  await post(base, '/api/attempts/1/answers', { questionId: 'f3', answer: '2, 1' });
  let r = await post(base, '/api/attempts/1/grade', {});
  assert.deepStrictEqual(r.body.wrongAdded, ['f1']);
  assert.strictEqual(r.body.scored.fill, 2);

  // 按题型筛选创建复习会话（只含填空题）
  r = await post(base, '/api/review/sessions', { filter: { status: 'active', type: 'fill' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.total, 1);
  assert.strictEqual(r.body.items[0].type, 'fill');
  assert.strictEqual(r.body.items[0].correctAnswer, '1101');
  const sid = r.body.sessionId, wid = r.body.items[0].wrongId;

  // 练习页应渲染填空输入框（带可接受答案，用于判分后展示）
  const res = await authFetch(base + `/review/session/${sid}`);
  const html = await res.text();
  assert.ok(html.includes('data-type="fill"'));
  assert.ok(html.includes('class="fill-input"'));
  assert.ok(html.includes('data-answer='));

  // 带首尾空白的正确答案也应判对，级别下降
  r = await post(base, `/api/review/sessions/${sid}/grade`, { answers: { [String(wid)]: ' 1101 ' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.correctCount, 1);
  assert.strictEqual(r.body.results[0].correct, true);
  assert.ok(r.body.results[0].newLevel < 2 || r.body.results[0].newStatus === 'mastered');

  // 复习页错题卡片应显示"填空"徽标
  const rv = await authFetch(base + '/review?type=fill');
  const rvHtml = await rv.text();
  assert.ok(rvHtml.includes('填空'));

  server.close(); db.close(); rmrf(dir); rmrf(bank);
});

test('试卷历史: 交卷生成做题人/得分/快照，重考保留多条，普通用户可见，旧记录回填', async () => {
  const { dir, bank, db, server, base } = await setup();
  try {
    // 第一次考试：客观题全对交卷（编程未提交）
    let r = await post(base, '/api/exams/test_paper_01/start');
    const att1 = r.body.attemptId;
    await post(base, `/api/attempts/${att1}/answers`, { questionId: 'q1', answer: 'B' });
    await post(base, `/api/attempts/${att1}/answers`, { questionId: 'q2', answer: 'B' });
    await post(base, `/api/attempts/${att1}/answers`, { questionId: 'q3', answer: 'true' });
    r = await post(base, `/api/attempts/${att1}/grade`, {});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.scored.total, 50);

    // 历史列表页：做题人 / 时间 / 得分 / 快照入口
    let page = await authFetch(base + '/exam/test_paper_01/history');
    assert.strictEqual(page.status, 200);
    let html = await page.text();
    assert.ok(html.includes('提交历史'), '应有提交历史标题');
    assert.ok(html.includes('<b>admin</b>'), '应显示做题人 admin');
    assert.ok(html.includes('查看快照'), '应有快照入口');
    const m = html.match(/\/exam\/test_paper_01\/history\/(\d+)/);
    assert.ok(m, '应有快照链接');
    const hid1 = m[1];

    // 快照页：完整试卷信息 + 当次作答 + 正确答案 + 解析
    page = await authFetch(base + `/exam/test_paper_01/history/${hid1}`);
    assert.strictEqual(page.status, 200);
    html = await page.text();
    assert.ok(html.includes('答卷快照'));
    assert.ok(html.includes('做题人：<b>admin</b>'));
    assert.ok(html.includes('<b class="snap-score">50</b>'), '应显示得分 50');
    assert.ok(html.includes('正确答案'), '应标注正确答案');
    assert.ok(html.includes('考生作答'), '应标注考生作答');
    assert.ok(html.includes('未提交'), '编程题未提交应显示');
    assert.ok(html.includes('解析'), '应包含题目解析');

    // 重考再交卷：旧 attempt 被删除，但历史保留两条
    r = await post(base, '/api/exams/test_paper_01/retake');
    const att2 = r.body.attemptId;
    await post(base, `/api/attempts/${att2}/answers`, { questionId: 'q1', answer: 'A' }); // 故意答错
    await post(base, `/api/attempts/${att2}/answers`, { questionId: 'q2', answer: 'B' });
    await post(base, `/api/attempts/${att2}/answers`, { questionId: 'q3', answer: 'false' }); // 故意答错
    r = await post(base, `/api/attempts/${att2}/grade`, {});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.scored.total, 20);
    html = await (await authFetch(base + '/exam/test_paper_01/history')).text();
    assert.ok(html.includes('共 2 条记录'), '重考后历史应保留两条');
    const ids = [...html.matchAll(/\/exam\/test_paper_01\/history\/(\d+)/g)].map(x => x[1]);
    assert.strictEqual(ids.length, 2);
    // 最新一条（列表第一条）快照反映第二次的错误作答
    const snap2 = await (await authFetch(base + `/exam/test_paper_01/history/${ids[0]}`)).text();
    assert.ok(snap2.includes('pick-wrong'), '第二次快照应标记答错的选择');
    assert.ok(snap2.includes('<b class="snap-score">20</b>'), '第二次快照得分 20');
    // 第一条快照仍在，内容不受重考影响
    const snap1 = await (await authFetch(base + `/exam/test_paper_01/history/${ids[1]}`)).text();
    assert.ok(snap1.includes('<b class="snap-score">50</b>'), '第一次快照应保持 50 分');

    // 普通用户也可以查看历史与快照
    r = await post(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' });
    assert.strictEqual(r.status, 200);
    const lr = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'kid', password: 'kid12345' })
    });
    const sc = lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')];
    const kidCookie = String((sc && sc[0]) || '').split(';')[0];
    page = await fetch(base + '/exam/test_paper_01/history', { headers: { Cookie: kidCookie } });
    assert.strictEqual(page.status, 200, '普通用户应可查看历史列表');
    assert.ok((await page.text()).includes('<b>admin</b>'));
    page = await fetch(base + `/exam/test_paper_01/history/${hid1}`, { headers: { Cookie: kidCookie } });
    assert.strictEqual(page.status, 200, '普通用户应可查看快照');
    assert.ok((await page.text()).includes('正确答案'));

    // 入口：考试页顶栏与首页卡片
    html = await (await authFetch(base + '/exam/test_paper_01')).text();
    assert.ok(html.includes('历史记录'), '考试页顶栏应有历史记录按钮');
    html = await (await authFetch(base + '/')).text();
    assert.ok(html.includes('card-hist'), '首页卡片应有历史入口');

    // 回填：手工造一条旧的 graded attempt（无做题人），启动回填应补出快照且幂等
    const d = db.get();
    const now = Date.now();
    const info = d.prepare(`INSERT INTO exam_attempts(exam_id, status, started_at, submitted_at, total_score, username)
      VALUES ('test_paper_01', 'graded', ?, ?, 0, '')`).run(now - 86400000, now - 80000000);
    const legacyId = Number(info.lastInsertRowid);
    d.prepare('INSERT INTO exam_answers(attempt_id, question_id, answer) VALUES (?, ?, ?)').run(legacyId, 'q1', 'B');
    const examhistory = require('../src/services/examhistory');
    let bf = examhistory.backfillIfNeeded();
    assert.strictEqual(bf.count, 1, '应回填一条旧记录');
    html = await (await authFetch(base + '/exam/test_paper_01/history')).text();
    assert.ok(html.includes('共 3 条记录'), '回填后应有三条');
    assert.ok(html.includes('历史记录'), '无做题人的旧记录应显示为历史记录');
    bf = examhistory.backfillIfNeeded();
    assert.strictEqual(bf.count, 0, '回填应幂等');

    // 不存在的试卷/记录 → 404
    assert.strictEqual((await authFetch(base + '/exam/no_such/history')).status, 404);
    assert.strictEqual((await authFetch(base + '/exam/test_paper_01/history/99999')).status, 404);
  } finally {
    server.close(); db.close(); rmrf(dir); rmrf(bank);
  }
});
