'use strict';
// convert-exam-to-fill 中央 lint：填空改造卷的结构/契约/独立性/泄露红线检查。
// 用法（node 20，在 exam-system 应用目录运行）：
//   node lint.js --bank question_bank/<目标目录> [--app <应用目录，默认 cwd>]
//                [--fill-n 50] [--fill-score 1] [--prog-score 25] [--prog-n K] [--id-prefix gesp_]
// 退出码：0 全过；1 有失败。
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const BANK = opt('bank');
if (!BANK) { console.error('缺少 --bank <目标目录>'); process.exit(2); }
const APP = path.resolve(opt('app', process.cwd()));
const FILL_N = parseInt(opt('fill-n', '50'), 10);
const FILL_SCORE = parseInt(opt('fill-score', '1'), 10);
const PROG_SCORE = parseInt(opt('prog-score', '25'), 10);
const PROG_N_EXPECT = opt('prog-n') === undefined ? null : parseInt(opt('prog-n'), 10);
const ID_PREFIX = opt('id-prefix', null);

const { validateExam } = require(path.join(APP, 'src/services/questionbank'));
const files = fs.readdirSync(BANK).filter(f => f.endsWith('.exam.json')).sort();
if (!files.length) { console.error('目录下没有 *.exam.json:', BANK); process.exit(2); }

const ids = new Set();
let bad = 0;
for (const f of files) {
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(BANK, f), 'utf8')); }
  catch (e) { console.log(f, 'FAIL 文件缺失/JSON坏:', e.message); bad++; continue; }
  const errs = validateExam(o);
  const sec = o.sections || [];
  const fill = sec[0], prog = sec[1];
  const progN = prog && Array.isArray(prog.questions) ? prog.questions.length : 0;
  const checks = {
    validate: errs.length === 0,
    noCategory: o.exam.category === undefined,
    idPrefix: !ID_PREFIX || String(o.exam.id).startsWith(ID_PREFIX),
    total: o.exam.total_score === FILL_N * FILL_SCORE + progN * PROG_SCORE,
    progNExpect: PROG_N_EXPECT === null || progN === PROG_N_EXPECT,
    twoSec: sec.length === 2,
    fillN: !!fill && fill.question_type === 'fill' && fill.score_per_question === FILL_SCORE && fill.questions.length === FILL_N,
    idsSeq: !!fill && fill.questions.every((q, k) => q.id === 'f' + (k + 1)),
    prog: !!prog && prog.question_type === 'programming' && prog.score_per_question === PROG_SCORE &&
      prog.questions.every((q, k) => q.id === 'prog' + (k + 1)),
    progFields: !!prog && prog.questions.every(q => q.title && q.source),   // title/source 必填（基线教训：曾缺 title）
    answers: !!fill && fill.questions.every(q => typeof q.answer === 'string' ? q.answer.trim() !== ''
      : Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every(a => typeof a === 'string' && a.trim() !== '')),
    knowledge: !!fill && fill.questions.every(q => Array.isArray(q.knowledge) && q.knowledge.length > 0),
    expl: !!fill && fill.questions.every(q => typeof q.explanation === 'string' && q.explanation.length > 10 && q.explanation.includes('原卷')),
    progAns: !!prog && prog.questions.every(q => q.answer && q.answer.reference_code && q.answer.test_program &&
      Array.isArray(q.samples) && q.samples.length > 0 && q.answer.solution),
    uniq: o.exam.id !== undefined && !ids.has(o.exam.id),
  };
  ids.add(o.exam.id);
  // 独立性启发式：题干不得引用其它题
  const crossRef = [];
  for (const q of (fill ? fill.questions : [])) {
    if (/如上题|上题|上述第|同第\s*\d+\s*题|见第\s*\d+\s*题|本题其他|前面.*题.*中/i.test(q.stem)) crossRef.push(q.id);
  }
  // 泄露红线：长答案原文不得出现在自己题干里。
  // 例外：代码块与"（填：A/B）"限定格式选项组——后者是认可的消歧设计，选项列出后仍须凭理解作答。
  const leaks = [];
  for (const q of (fill ? fill.questions : [])) {
    const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
    const stemProse = q.stem.replace(/```[\s\S]*?```/g, ' ').replace(/[（(]填[:：][^）)]*[）)]/g, ' ');
    for (const a of ans) if (a.length > 3 && stemProse.includes(a)) leaks.push(q.id + ':' + a.slice(0, 20));
  }
  const fails = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  if (errs.length) console.log(f, 'validateExam:', errs);
  if (crossRef.length) console.log(f, '⚠️疑似跨题引用:', crossRef.join(','));
  if (fails.length || leaks.length) bad++;
  console.log(f, fails.length ? 'FAIL ' + fails.join(',') : 'OK',
    leaks.length ? '⚠️疑似泄露:' + leaks.join('|') : '');
}
console.log(bad ? `LINT FAILURES: ${bad}` : `LINT ALL OK (${files.length}/${files.length})`);
process.exit(bad ? 1 : 0);
