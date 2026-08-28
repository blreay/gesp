'use strict';
// 用每套卷的参考代码编译后运行自身测试程序，必须全过。
// 用法: node scripts/verify_bank.js [题库目录]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BANK = process.argv[2] || path.join(__dirname, '..', 'question_bank');
let fail = 0, total = 0, skipped = 0;

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

for (const cat of fs.readdirSync(BANK)) {
  const catDir = path.join(BANK, cat);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const f of fs.readdirSync(catDir).sort()) {
    if (!f.endsWith('.exam.json')) continue;
    const exam = JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf8'));
    for (const sec of exam.sections) {
      for (const q of sec.questions || []) {
        if (q.type !== 'programming') continue;

        // Skip placeholder test programs
        if (!q.answer.test_program || q.answer.test_program.includes('TESTER_PLACEHOLDER_SOURCE')) {
          skipped++;
          console.log(`⏭️ ${cat}/${f} ${q.id} ${q.title || '(untitled)'}（占位符测试程序，跳过）`);
          continue;
        }
        if (!q.answer.reference_code || q.answer.reference_code.trim() === '') {
          skipped++;
          console.log(`⏭️ ${cat}/${f} ${q.id} ${q.title || '(untitled)'}（无参考代码，跳过）`);
          continue;
        }

        total++;

        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
        try {
          fs.writeFileSync(path.join(work, 'ref.cpp'), q.answer.reference_code);
          fs.writeFileSync(path.join(work, 'test.cpp'), q.answer.test_program);
          run('g++', ['-O2', '-std=c++14', '-o', 'ref', 'ref.cpp'], { cwd: work });
          run('g++', ['-O2', '-std=c++14', '-o', 'tester', 'test.cpp'], { cwd: work });
          execFileSync('bash', ['-c', './tester ./ref'], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
          console.log(`OK ${cat}/${f} ${q.id} ${q.title}`);
        } catch (e) {
          fail++;
          const msg = (e.stderr || e.stdout || e.message || '').toString().slice(0, 1500);
          console.error(`FAIL ${cat}/${f} ${q.id} ${q.title}\n${msg}`);
        } finally {
          fs.rmSync(work, { recursive: true, force: true });
        }
      }
    }
  }
}

const passed = total - fail;
console.log(`\n验收完成：${passed}/${total} 通过` + (skipped ? `（跳过 ${skipped} 个）` : ''));
process.exit(fail ? 1 : 0);
