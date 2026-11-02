'use strict';
// 认证与用户管理：口令校验、会话（存 SQLite，重启不掉线）、用户 CRUD。
// 角色只有 admin / user 两种；admin 可见系统配置与用户管理、判卷后可见正确答案。
const db = require('./db');
const { hashPassword, verifyPassword, randomToken } = require('./password');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天
const USERNAME_RE = /^[\w.\-一-龥]{2,32}$/u;

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role, note: row.note || '', created_at: row.created_at, updated_at: row.updated_at };
}

// ---- 会话 ----
function createSession(username) {
  const d = db.get();
  const token = randomToken();
  const now = Date.now();
  d.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now); // 顺手清理过期会话
  d.prepare('INSERT INTO auth_sessions(token, username, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, username, now, now + SESSION_TTL_MS);
  return token;
}

// 返回 { username, role, note } 或 null（会话不存在/过期/用户已删除）
function userByToken(token) {
  if (!token) return null;
  const d = db.get();
  const s = d.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    d.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }
  const u = d.prepare('SELECT * FROM users WHERE username = ?').get(s.username);
  if (!u) {
    d.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }
  return { username: u.username, role: u.role, note: u.note || '' };
}

function destroySession(token) {
  if (token) db.get().prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}

function destroyUserSessions(username, exceptToken) {
  if (exceptToken) {
    db.get().prepare('DELETE FROM auth_sessions WHERE username = ? AND token != ?').run(username, exceptToken);
  } else {
    db.get().prepare('DELETE FROM auth_sessions WHERE username = ?').run(username);
  }
}

// ---- 登录 / 改密 ----
// 返回 { ok, token, user } 或 { ok:false, error }
function login(username, password) {
  const u = db.get().prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!u || !verifyPassword(password, u.password_hash)) {
    return { ok: false, error: '用户名或密码错误' };
  }
  return { ok: true, token: createSession(u.username), user: publicUser(u) };
}

// 本人修改密码：需验证旧密码；成功后除当前会话外全部下线
function changePassword(username, oldPassword, newPassword, keepToken) {
  const u = db.get().prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u) return { ok: false, error: '用户不存在' };
  if (!verifyPassword(oldPassword, u.password_hash)) return { ok: false, error: '旧密码错误' };
  const err = validatePassword(newPassword);
  if (err) return { ok: false, error: err };
  db.get().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), Date.now(), u.id);
  destroyUserSessions(username, keepToken);
  return { ok: true };
}

// ---- 用户 CRUD（管理员）----
function listUsers() {
  return db.get().prepare('SELECT * FROM users ORDER BY id').all().map(publicUser);
}

function getUserByName(username) {
  return publicUser(db.get().prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim()));
}

function validateUsername(username) {
  const u = String(username || '').trim();
  if (!USERNAME_RE.test(u)) return '用户名须为 2-32 个字符（中英文、数字、_ . -）';
  return null;
}
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6 || pw.length > 64) return '密码长度须为 6-64 个字符';
  return null;
}
function validateRole(role) {
  if (role !== 'admin' && role !== 'user') return '角色只能是 admin 或 user';
  return null;
}

// 抛 Error（中文消息）表示失败
function createUser({ username, password, role, note }) {
  const u = String(username || '').trim();
  let err = validateUsername(u);
  if (err) throw new Error(err);
  err = validatePassword(password);
  if (err) throw new Error(err);
  const r = role || 'user';
  err = validateRole(r);
  if (err) throw new Error(err);
  if (db.get().prepare('SELECT id FROM users WHERE username = ?').get(u)) throw new Error('用户名已存在');
  const now = Date.now();
  const info = db.get().prepare('INSERT INTO users(username, password_hash, role, note, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(u, hashPassword(password), r, String(note || ''), now, now);
  return publicUser(db.get().prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)));
}

// fields: { password?, role?, note? }；actor 为当前管理员用户名。
// 规则：不能改自己的角色（防误操作锁死）；密码留空表示不修改。
function updateUser(id, fields, actor) {
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new Error('用户不存在');
  const sets = [], vals = [];
  if (fields.password !== undefined && String(fields.password) !== '') {
    const err = validatePassword(fields.password);
    if (err) throw new Error(err);
    sets.push('password_hash = ?'); vals.push(hashPassword(String(fields.password)));
  }
  if (fields.role !== undefined && fields.role !== u.role) {
    const err = validateRole(fields.role);
    if (err) throw new Error(err);
    if (u.username === actor) throw new Error('不能修改自己的角色');
    if (u.role === 'admin' && fields.role === 'user') {
      const admins = d.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
      if (admins <= 1) throw new Error('至少要保留一名管理员');
    }
    sets.push('role = ?'); vals.push(fields.role);
  }
  if (fields.note !== undefined) { sets.push('note = ?'); vals.push(String(fields.note)); }
  if (!sets.length) return publicUser(u);
  sets.push('updated_at = ?'); vals.push(Date.now(), u.id);
  d.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
  return publicUser(d.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
}

// 规则：不能删除自己；删除管理员前保证至少还剩一名管理员。删除后其会话全部失效。
function deleteUser(id, actor) {
  const d = db.get();
  const u = d.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new Error('用户不存在');
  if (u.username === actor) throw new Error('不能删除当前登录的自己');
  if (u.role === 'admin') {
    const admins = d.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
    if (admins <= 1) throw new Error('至少要保留一名管理员');
  }
  d.prepare('DELETE FROM auth_sessions WHERE username = ?').run(u.username);
  d.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  return { username: u.username };
}

module.exports = {
  SESSION_TTL_MS,
  createSession, userByToken, destroySession, destroyUserSessions,
  login, changePassword,
  listUsers, getUserByName, createUser, updateUser, deleteUser
};
