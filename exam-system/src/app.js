'use strict';
const express = require('express');
const path = require('path');
const auth = require('./services/auth');

const COOKIE_NAME = 'exam_sid';

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of String(h).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* 忽略坏值 */ }
    }
  }
  return out;
}

// 仅管理员可访问的路径（在已登录前提下二次校验）
function isAdminApi(p) {
  return p === '/api/settings' || p.startsWith('/api/settings/') ||
    p === '/api/users' || p.startsWith('/api/users/') ||
    /^\/api\/exams\/[^/]+\/detail$/.test(p) ||
    p.startsWith('/api/ai-parse') ||
    p.endsWith('/ai-context');
}

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // 本环境 NODE_ENV=production 会开启 EJS 模板缓存，导致改模板不生效；固定关闭
  app.set('view cache', false);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public'))); // 静态资源不鉴权（登录页也要用）

  // 认证：解析会话 cookie，未登录只放行 /login 与登录/登出接口
  app.use((req, res, next) => {
    const token = parseCookies(req)[COOKIE_NAME] || '';
    req.sessionToken = token;
    req.user = token ? auth.userByToken(token) : null;
    res.locals.user = req.user; // 供所有 EJS 模板使用
    if (req.user) return next();
    const p = req.path;
    if (p === '/login' || p === '/api/auth/login' || p === '/api/auth/logout') return next();
    if (p.startsWith('/api/')) return res.status(401).json({ error: '未登录' });
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  });

  // 授权：系统配置页 / 配置与用户管理 API / 卷面源数据 / AI 解析 → 仅管理员
  app.use((req, res, next) => {
    const p = req.path;
    const needAdmin = p === '/settings' || isAdminApi(p);
    if (needAdmin && req.user && req.user.role !== 'admin') {
      if (p.startsWith('/api/')) return res.status(403).json({ error: '需要管理员权限' });
      return res.status(403).send('需要管理员权限');
    }
    next();
  });

  app.use('/', require('./routes/pages'));
  app.use('/api', require('./routes/api'));

  app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack || err.message);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  });
  return app;
}

module.exports = { createApp, COOKIE_NAME };
