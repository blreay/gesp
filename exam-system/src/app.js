'use strict';
const express = require('express');
const path = require('path');

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  // 本环境 NODE_ENV=production 会开启 EJS 模板缓存，导致改模板不生效；固定关闭
  app.set('view cache', false);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/', require('./routes/pages'));
  app.use('/api', require('./routes/api'));

  app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack || err.message);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  });
  return app;
}

module.exports = { createApp };
