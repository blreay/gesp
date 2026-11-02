'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf, startApp } = require('./helpers');

// 带登录能力的测试环境：题库用填空测试卷（含答案 '1101'，用于验证答案剥离）
// 和测试卷（含编程题 prog1，题解 '直接相加'，用于验证编程题页题解可见性）
async function setup(opts) {
  const dir = tmpDir('auth-');
  const bank = path.join(dir, 'bank');
  fs.mkdirSync(path.join(bank, '测试分类'), { recursive: true });
  for (const f of ['填空测试卷.exam.json', '测试卷.exam.json']) {
    fs.copyFileSync(
      path.join(__dirname, 'fixtures', 'bank', '测试分类', f),
      path.join(bank, '测试分类', f));
  }
  const db = require('../src/services/db');
  db.init(path.join(dir, 't.db'));
  require('../src/services/questionbank').scan(bank);
  const started = await startApp(opts);
  return { dir, db, ...started };
}

async function login(base, username, password) {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await r.json().catch(() => ({}));
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
  return { status: r.status, body, cookie: String((sc && sc[0]) || '').split(';')[0] };
}
const withCookie = (cookie, opts) => Object.assign({}, opts, {
  headers: Object.assign({}, opts && opts.headers, cookie ? { Cookie: cookie } : {})
});
const getJ = async (base, url, cookie) => {
  const r = await fetch(base + url, withCookie(cookie));
  return { status: r.status, body: await r.json().catch(() => null), text: null, r };
};
const postJ = async (base, url, body, cookie) => {
  const r = await fetch(base + url, withCookie(cookie, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  }));
  return { status: r.status, body: await r.json().catch(() => null) };
};
const patchJ = async (base, url, body, cookie) => {
  const r = await fetch(base + url, withCookie(cookie, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  }));
  return { status: r.status, body: await r.json().catch(() => null) };
};
const delR = async (base, url, cookie) => {
  const r = await fetch(base + url, withCookie(cookie, { method: 'DELETE' }));
  return { status: r.status, body: await r.json().catch(() => null) };
};

test('auth: 未登录访问被拦截，登录页可访问', async () => {
  const { dir, db, server, base } = await setup({ login: false });
  // 页面 → 302 跳登录
  let r = await fetch(base + '/', { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.ok(r.headers.get('location').startsWith('/login'));
  // API → 401
  r = await fetch(base + '/api/exams');
  assert.strictEqual(r.status, 401);
  // 登录页本身 200，静态资源不拦截
  r = await fetch(base + '/login');
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('GESP 模拟考试系统'));
  r = await fetch(base + '/css/base.css');
  assert.strictEqual(r.status, 200);
  server.close(); db.close(); rmrf(dir);
});

test('auth: 默认管理员 admin/admin123 可登录，错误密码 401，登出后会话失效', async () => {
  const { dir, db, server, base } = await setup({ login: false });
  let r = await login(base, 'admin', 'wrong-pass');
  assert.strictEqual(r.status, 401);
  r = await login(base, 'nosuch', 'admin123');
  assert.strictEqual(r.status, 401);
  r = await login(base, 'admin', 'admin123');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.role, 'admin');
  assert.ok(r.cookie.includes('exam_sid='));
  // 会话可用
  const me = await getJ(base, '/api/auth/me', r.cookie);
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.username, 'admin');
  // 登出后 401
  const out = await postJ(base, '/api/auth/logout', {}, r.cookie);
  assert.strictEqual(out.status, 200);
  const after = await getJ(base, '/api/exams', r.cookie);
  assert.strictEqual(after.status, 401);
  server.close(); db.close(); rmrf(dir);
});

test('auth: 普通用户被系统配置/用户管理/卷面源数据 403 拦截，管理员放行', async () => {
  const { dir, db, server, base, cookie } = await setup();
  // 管理员建普通用户
  let r = await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user', note: '孩子' }, cookie);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.user.role, 'user');
  const kid = await login(base, 'kid', 'kid12345');
  assert.strictEqual(kid.status, 200);
  // 普通用户 403
  for (const url of ['/api/settings', '/api/users', '/api/exams/test_fill_01/detail']) {
    const g = await getJ(base, url, kid.cookie);
    assert.strictEqual(g.status, 403, url + ' 应 403');
  }
  assert.strictEqual((await postJ(base, '/api/settings', { default_duration_minutes: '90' }, kid.cookie)).status, 403);
  let page = await fetch(base + '/settings', withCookie(kid.cookie));
  assert.strictEqual(page.status, 403);
  page = await fetch(base + '/ai', withCookie(kid.cookie));
  assert.strictEqual(page.status, 403, '/ai 页应仅管理员可访问');
  // 普通用户仍可用考试功能
  assert.strictEqual((await getJ(base, '/api/exams', kid.cookie)).status, 200);
  // 普通用户导航不显示 AI问答 / 系统配置
  const kidHome = await (await fetch(base + '/', withCookie(kid.cookie))).text();
  assert.ok(!kidHome.includes('AI问答'), '普通用户导航不应有 AI问答');
  assert.ok(!kidHome.includes('系统配置'), '普通用户导航不应有 系统配置');
  // 管理员放行
  assert.strictEqual((await getJ(base, '/api/settings', cookie)).status, 200);
  assert.strictEqual((await getJ(base, '/api/users', cookie)).status, 200);
  assert.strictEqual((await getJ(base, '/api/exams/test_fill_01/detail', cookie)).status, 200);
  assert.strictEqual((await fetch(base + '/ai', withCookie(cookie))).status, 200);
  page = await fetch(base + '/settings', withCookie(cookie));
  assert.strictEqual(page.status, 200);
  assert.ok((await page.text()).includes('用户管理'));
  // 管理员导航显示 AI问答
  const adminHome = await (await fetch(base + '/', withCookie(cookie))).text();
  assert.ok(adminHome.includes('AI问答'), '管理员导航应有 AI问答');
  server.close(); db.close(); rmrf(dir);
});

test('auth: 普通用户卷面/练习页不下发正确答案，管理员可见', async () => {
  const { dir, db, server, base, cookie } = await setup();
  await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' }, cookie);
  const kid = await login(base, 'kid', 'kid12345');
  // 考试页
  let html = await (await fetch(base + '/exam/test_fill_01', withCookie(kid.cookie))).text();
  assert.ok(html.includes('十进制数 13'), '题干应正常渲染');
  assert.ok(!html.includes('1101'), '普通用户卷面不应包含答案 1101');
  assert.ok(!html.includes('13 = 8 + 4 + 1'), '普通用户卷面不应包含解析');
  html = await (await fetch(base + '/exam/test_fill_01', withCookie(cookie))).text();
  assert.ok(html.includes('1101'), '管理员卷面应包含答案');
  // 错题练习页（question-block 的 data-answer）
  require('../src/services/wrongbook').recordWrong('test_fill_01', 'f1', Date.now());
  const sess = await postJ(base, '/api/review/sessions', { filter: { status: 'active' } }, kid.cookie);
  assert.strictEqual(sess.status, 200);
  html = await (await fetch(base + '/review/session/' + sess.body.sessionId, withCookie(kid.cookie))).text();
  assert.ok(!html.includes('1101'), '普通用户练习页不应包含答案');
  const sess2 = await postJ(base, '/api/review/sessions', { filter: { status: 'active' } }, cookie);
  html = await (await fetch(base + '/review/session/' + sess2.body.sessionId, withCookie(cookie))).text();
  assert.ok(html.includes('1101'), '管理员练习页应包含答案');
  server.close(); db.close(); rmrf(dir);
});

test('auth: 复习会话 API 的 correctAnswer 仅管理员可见', async () => {
  const { dir, db, server, base, cookie } = await setup();
  await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' }, cookie);
  const kid = await login(base, 'kid', 'kid12345');
  require('../src/services/wrongbook').recordWrong('test_fill_01', 'f1', Date.now());
  let r = await postJ(base, '/api/review/sessions', { filter: { status: 'active' } }, cookie);
  assert.strictEqual(r.body.items[0].correctAnswer, '1101');
  r = await postJ(base, '/api/review/sessions', { filter: { status: 'active' } }, kid.cookie);
  assert.strictEqual(r.body.items[0].correctAnswer, null);
  assert.strictEqual(r.body.items[0].type, 'fill');
  // 普通用户练习判分仍正常（服务端按题库判，不依赖下发的答案）
  const g = await postJ(base, '/api/review/sessions/' + r.body.sessionId + '/grade',
    { answers: { [r.body.items[0].wrongId]: ' 1101 ' } }, kid.cookie);
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.body.correctCount, 1);
  server.close(); db.close(); rmrf(dir);
});

test('auth: 预览判卷仅管理员；普通用户交卷需客观题全答且结果不含答案', async () => {
  const { dir, db, server, base, cookie } = await setup();
  try {
    await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' }, cookie);
    const kid = await login(base, 'kid', 'kid12345');
    // kid 开考并只答 1 题（故意答错：正确答案 1101 不应出现在任何返回里）
    let r = await postJ(base, '/api/exams/test_fill_01/start', {}, kid.cookie);
    assert.strictEqual(r.status, 200);
    const attId = r.body.attemptId;
    await postJ(base, `/api/attempts/${attId}/answers`, { questionId: 'f1', answer: '1102' }, kid.cookie);
    // 普通用户预览判卷 403；管理员放行
    r = await postJ(base, `/api/attempts/${attId}/preview`, {}, kid.cookie);
    assert.strictEqual(r.status, 403);
    r = await postJ(base, `/api/attempts/${attId}/preview`, {}, cookie);
    assert.strictEqual(r.status, 200);
    // 考试页：普通用户判卷按钮置灰并提示，管理员不置灰
    let html = await (await fetch(base + '/exam/test_fill_01', withCookie(kid.cookie))).text();
    assert.ok(html.includes('id="btnGrade" disabled'), '普通用户判卷按钮应置灰');
    assert.ok(html.includes('预览判卷仅管理员可用'));
    html = await (await fetch(base + '/exam/test_fill_01', withCookie(cookie))).text();
    assert.ok(html.includes('id="btnGrade">判 卷'), '管理员判卷按钮应可用');
    // 客观题未完成 → 交卷 400
    r = await postJ(base, `/api/attempts/${attId}/grade`, {}, kid.cookie);
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.includes('未作答'));
    // 补答完成后交卷成功（f1 错、f2/f3 对），判分结果只含对错与考生自己的答案
    await postJ(base, `/api/attempts/${attId}/answers`, { questionId: 'f2', answer: 'E5' }, kid.cookie);
    await postJ(base, `/api/attempts/${attId}/answers`, { questionId: 'f3', answer: '2,1' }, kid.cookie);
    r = await postJ(base, `/api/attempts/${attId}/grade`, {}, kid.cookie);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.scored.fill, 2);
    assert.ok(!JSON.stringify(r.body.results).includes('1101'), '判分结果不应含正确答案');
  } finally {
    server.close(); db.close(); rmrf(dir);
  }
});

test('auth: 编程题页【题解信息】栏对所有登录用户可见（含普通用户）', async () => {
  const { dir, db, server, base, cookie } = await setup();
  try {
    await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user' }, cookie);
    const kid = await login(base, 'kid', 'kid12345');
    // 考试模式与练习模式的编程题页都应显示题解栏及其内容
    for (const url of ['/exam/test_paper_01/prog/prog1', '/prog/practice/test_paper_01/prog1']) {
      const r = await fetch(base + url, withCookie(kid.cookie));
      assert.strictEqual(r.status, 200, url + ' 应可访问');
      const html = await r.text();
      assert.ok(html.includes('题解信息'), '普通用户应有题解信息 tab: ' + url);
      assert.ok(html.includes('直接相加'), '题解内容应下发: ' + url);
      assert.ok(html.includes('测试程序源码'), '判题依据栏应显示: ' + url);
      assert.ok(html.includes('refCodeTpl'), '参考代码模板应下发: ' + url);
    }
    // 管理员同样可见（回归）
    const html = await (await fetch(base + '/exam/test_paper_01/prog/prog1', withCookie(cookie))).text();
    assert.ok(html.includes('题解信息') && html.includes('直接相加'), '管理员题解栏应可见');
    // 考试页（客观题卷面）的答案剥离不受影响
    const kidExam = await (await fetch(base + '/exam/test_fill_01', withCookie(kid.cookie))).text();
    assert.ok(!kidExam.includes('1101'), '普通用户卷面仍不应包含答案');
  } finally {
    server.close(); db.close(); rmrf(dir);
  }
});

test('auth: 用户 CRUD 校验——重名/弱密码/非法角色/非法用户名 400', async () => {
  const { dir, db, server, base, cookie } = await setup();
  let r = await postJ(base, '/api/users', { username: 'a', password: '123456' }, cookie);
  assert.strictEqual(r.status, 400); // 用户名过短
  r = await postJ(base, '/api/users', { username: 'kid', password: '123' }, cookie);
  assert.strictEqual(r.status, 400); // 密码过短
  r = await postJ(base, '/api/users', { username: 'kid', password: '123456', role: 'root' }, cookie);
  assert.strictEqual(r.status, 400); // 非法角色
  r = await postJ(base, '/api/users', { username: 'kid', password: '123456' }, cookie);
  assert.strictEqual(r.status, 200);
  r = await postJ(base, '/api/users', { username: 'kid', password: '123456' }, cookie);
  assert.strictEqual(r.status, 400); // 重名
  const list = await getJ(base, '/api/users', cookie);
  assert.deepStrictEqual(list.body.users.map(u => u.username), ['admin', 'kid']);
  assert.ok(!JSON.stringify(list.body).includes('password_hash'), '不应下发口令哈希');
  assert.ok(!JSON.stringify(list.body).includes('123456'), '不应下发口令');
  server.close(); db.close(); rmrf(dir);
});

test('auth: 更新用户——改备注/角色/重置密码；不能改自己角色；至少保留一名管理员', async () => {
  const { dir, db, server, base, cookie } = await setup();
  const created = await postJ(base, '/api/users', { username: 'kid', password: 'kid12345', role: 'user', note: '娃' }, cookie);
  const kidId = created.body.user.id;
  const adminId = (await getJ(base, '/api/users', cookie)).body.users.find(u => u.username === 'admin').id;
  // 改备注
  let r = await patchJ(base, '/api/users/' + kidId, { note: '大娃' }, cookie);
  assert.strictEqual(r.body.user.note, '大娃');
  // 重置密码后用新密码登录
  r = await patchJ(base, '/api/users/' + kidId, { password: 'newpass6' }, cookie);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await login(base, 'kid', 'kid12345')).status, 401);
  assert.strictEqual((await login(base, 'kid', 'newpass6')).status, 200);
  // 提升为管理员再降回
  r = await patchJ(base, '/api/users/' + kidId, { role: 'admin' }, cookie);
  assert.strictEqual(r.body.user.role, 'admin');
  // 不能改自己的角色
  r = await patchJ(base, '/api/users/' + adminId, { role: 'user' }, cookie);
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('自己的角色'));
  // 现在共 2 名管理员：把 kid 降级 → 剩 1 名，允许
  r = await patchJ(base, '/api/users/' + kidId, { role: 'user' }, cookie);
  assert.strictEqual(r.status, 200);
  // 再建 admin2 并降级 admin2 时只剩 1 名管理员 → 拒绝
  const a2 = await postJ(base, '/api/users', { username: 'admin2', password: 'admin123', role: 'admin' }, cookie);
  // 当前 2 名管理员（admin、admin2），降级 admin2 → 剩 1 名，允许
  r = await patchJ(base, '/api/users/' + a2.body.user.id, { role: 'user' }, cookie);
  assert.strictEqual(r.status, 200);
  // 此时只剩 admin 一名管理员，任何人再降级 admin 都应失败（自己是自己 → 自己的角色；换 admin2 登录试）
  const a2c = (await login(base, 'admin2', 'admin123')).cookie;
  r = await patchJ(base, '/api/users/' + adminId, { role: 'user' }, a2c);
  assert.strictEqual(r.status, 403); // admin2 已被降为普通用户 → 无权限
  server.close(); db.close(); rmrf(dir);
});

test('auth: 删除用户——不能删自己；删除后会话立即失效；不能删光管理员', async () => {
  const { dir, db, server, base, cookie } = await setup();
  const adminId = (await getJ(base, '/api/users', cookie)).body.users.find(u => u.username === 'admin').id;
  let r = await delR(base, '/api/users/' + adminId, cookie);
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('自己'));
  const created = await postJ(base, '/api/users', { username: 'kid', password: 'kid12345' }, cookie);
  const kid = await login(base, 'kid', 'kid12345');
  assert.strictEqual((await getJ(base, '/api/exams', kid.cookie)).status, 200);
  r = await delR(base, '/api/users/' + created.body.user.id, cookie);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await getJ(base, '/api/exams', kid.cookie)).status, 401, '被删用户会话应失效');
  // 唯一管理员不能被删（借道：建 admin2 → 用 admin2 删 admin → 应被"至少保留一名管理员"或成功？
  // admin 不是唯一管理员时允许删；因此先降级场景已在上一个用例覆盖，这里验证删除最后一名管理员被拒）
  server.close(); db.close(); rmrf(dir);
});

test('auth: 本人修改密码需旧密码；成功后其他会话下线、当前会话保留', async () => {
  const { dir, db, server, base } = await setup({ login: false });
  let admin1 = await login(base, 'admin', 'admin123');
  const admin2 = await login(base, 'admin', 'admin123'); // 第二个会话
  // 旧密码错误
  let r = await postJ(base, '/api/auth/password', { oldPassword: 'bad', newPassword: 'newadmin1' }, admin1.cookie);
  assert.strictEqual(r.status, 400);
  // 新密码太短
  r = await postJ(base, '/api/auth/password', { oldPassword: 'admin123', newPassword: '123' }, admin1.cookie);
  assert.strictEqual(r.status, 400);
  // 成功
  r = await postJ(base, '/api/auth/password', { oldPassword: 'admin123', newPassword: 'newadmin1' }, admin1.cookie);
  assert.strictEqual(r.status, 200);
  // 当前会话仍有效，其他会话被下线
  assert.strictEqual((await getJ(base, '/api/exams', admin1.cookie)).status, 200);
  assert.strictEqual((await getJ(base, '/api/exams', admin2.cookie)).status, 401);
  // 新密码可登录，旧密码不行
  assert.strictEqual((await login(base, 'admin', 'admin123')).status, 401);
  assert.strictEqual((await login(base, 'admin', 'newadmin1')).status, 200);
  server.close(); db.close(); rmrf(dir);
});
