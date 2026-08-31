'use strict';
const path = require('path');
const { createApp } = require('./src/app');
const db = require('./src/services/db');
const qb = require('./src/services/questionbank');
const examlog = require('./src/services/examlog');

const PORT = parseInt(process.env.PORT || '8730', 10);
// 可用环境变量覆盖数据库与题库目录（便于测试/部署隔离）
const BANK_DIR = process.env.EXAM_BANK_DIR || path.join(__dirname, 'question_bank');

db.init(process.env.EXAM_DB || undefined);
const scan = qb.scan(BANK_DIR);
console.log(`题库扫描完成：加载 ${scan.loaded.length} 套，失败 ${scan.failed.length} 个文件`);
for (const f of scan.failed) console.warn('  [题库警告]', f.file, f.errors.join('；'));

try {
  const bf = examlog.backfillIfNeeded();
  if (bf.backfilled) console.log(`考试日志回填完成：${bf.count} 条历史记录`);
} catch (e) {
  console.error('考试日志回填失败（跳过，不影响使用）:', e.message);
}

createApp().listen(PORT, () => {
  console.log(`exam-system 已启动: http://localhost:${PORT}`);
});
