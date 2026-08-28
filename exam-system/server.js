'use strict';
const path = require('path');
const { createApp } = require('./src/app');
const db = require('./src/services/db');
const qb = require('./src/services/questionbank');

const PORT = parseInt(process.env.PORT || '8730', 10);
const BANK_DIR = path.join(__dirname, 'question_bank');

db.init();
const scan = qb.scan(BANK_DIR);
console.log(`题库扫描完成：加载 ${scan.loaded.length} 套，失败 ${scan.failed.length} 个文件`);
for (const f of scan.failed) console.warn('  [题库警告]', f.file, f.errors.join('；'));

createApp().listen(PORT, () => {
  console.log(`exam-system 已启动: http://localhost:${PORT}`);
});
