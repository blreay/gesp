'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
// 启动应用。默认用 admin/admin123 登录并返回会话 cookie（opts.login === false 可跳过）。
async function startApp(opts) {
  const { createApp } = require('../src/app');
  const app = createApp();
  const { server, base } = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: 'http://127.0.0.1:' + server.address().port });
    });
  });
  let cookie = '';
  if (!opts || opts.login !== false) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: opts && opts.username || 'admin', password: opts && opts.password || 'admin123' })
    });
    if (!r.ok) { server.close(); throw new Error('测试登录失败: HTTP ' + r.status); }
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')];
    cookie = String(sc && sc[0] || '').split(';')[0];
    if (!cookie) { server.close(); throw new Error('测试登录未返回会话 cookie'); }
  }
  return { server, base, cookie };
}

module.exports = { tmpDir, rmrf, startApp };
