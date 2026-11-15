'use strict';
// convert-exam-to-fill 隔离 E2E："把新卷完整做一遍"。
// 独立应用副本 + 独立 DB，不碰生产数据（改动运行中题库/判题的端到端验证必须隔离）。
// 用法（node 20）：
//   node e2e.js --app /tmp/e2e_<批次> --category <目标目录>
//               [--src-app <真实应用目录，默认 /home/admin/git/richie_gesp/exam-system>]
//               [--bank <题库根目录，默认 <src-app>/question_bank>]
//               [--fill-n 50] [--fill-score 1] [--prog-score 25]
// 流程：建副本 → scan（断言目标分类卷数=目录内文件数、0 失败）→ 逐卷 detail 取内嵌答案 →
//       start → 全部填空作答 → grade 断言满分 → 首卷反向抽查（故意错 1 空）。
// 退出码：0 全过；1 有失败；2 环境/参数错；3 意外异常。
// ⚠️ 不用 node:test（断言失败会挂死 runner），一律 process.exit。
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const APP = opt('app');
const CATEGORY = opt('category');
if (!APP || !CATEGORY) { console.error('缺少 --app 或 --category'); process.exit(2); }
const SRC_APP = path.resolve(opt('src-app', '/home/admin/git/richie_gesp/exam-system'));
const BANK = path.resolve(opt('bank', path.join(SRC_APP, 'question_bank')));
const FILL_N = parseInt(opt('fill-n', '50'), 10);
const FILL_SCORE = parseInt(opt('fill-score', '1'), 10);
const PROG_SCORE = parseInt(opt('prog-score', '25'), 10);

// ---- 建隔离副本（幂等）----
fs.mkdirSync(APP, { recursive: true });
for (const d of ['src', 'scripts']) {
  if (!fs.existsSync(path.join(APP, d))) fs.cpSync(path.join(SRC_APP, d), path.join(APP, d), { recursive: true });
}
if (!fs.existsSync(path.join(APP, 'package.json'))) fs.copyFileSync(path.join(SRC_APP, 'package.json'), path.join(APP, 'package.json'));
if (!fs.existsSync(path.join(APP, 'node_modules'))) fs.symlinkSync(path.join(SRC_APP, 'node_modules'), path.join(APP, 'node_modules'), 'dir');
const bankLink = path.join(APP, 'question_bank');
const bankSt = fs.lstatSync(bankLink, { throwIfNoEntry: false });
if (!bankSt) fs.symlinkSync(BANK, bankLink, 'dir');
else if (bankSt.isSymbolicLink() && path.resolve(APP, fs.readlinkSync(bankLink)) !== BANK) {
  fs.rmSync(bankLink, { force: true }); fs.symlinkSync(BANK, bankLink, 'dir');
}   // 已是真实目录（用户自备副本）则原样保留

const CAT_DIR = path.join(BANK, CATEGORY);
const expectFiles = fs.readdirSync(CAT_DIR).filter(f => f.endsWith('.exam.json'));
process.chdir(APP);
const db = require(path.join(APP, 'src/services/db'));
const qb = require(path.join(APP, 'src/services/questionbank'));
fs.mkdirSync(path.join(APP, 'data'), { recursive: true });
const DBF = path.join(APP, 'data', 'e2e.db');
for (const suf of ['', '-wal', '-shm']) fs.rmSync(DBF + suf, { force: true });
db.init(DBF);
const scan = qb.scan(path.join(APP, 'question_bank'));
if (scan.failed.length) {
  console.log('scan failed:');
  for (const f of scan.failed) console.log(' ', f.file, JSON.stringify(f.errors));
}
const loaded = scan.loaded.filter(l => l.category === CATEGORY);
console.log(`scan: loaded=${scan.loaded.length} failed=${scan.failed.length} ${CATEGORY}=${loaded.length}`);
if (loaded.length !== expectFiles.length) { console.error(`ABORT: ${CATEGORY} 加载数 != 目录文件数 ${expectFiles.length}`); process.exit(2); }

const { createApp } = require(path.join(APP, 'src/app'));

async function main() {
  const app = createApp();
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),   // 空库自动播种默认管理员
  });
  if (!lr.ok) throw new Error('login failed HTTP ' + lr.status);
  const sc = lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')];
  const cookie = String(sc[0]).split(';')[0];
  const J = async (url) => { const r = await fetch(base + url, { headers: { Cookie: cookie } }); if (!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.json(); };
  const P = async (url, body) => {
    const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error(url + ' HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  };
  const pick = (a) => Array.isArray(a) ? a[0] : a;
  const FILL_FULL = FILL_N * FILL_SCORE;

  let bad = 0;
  const ids = loaded.map(l => l.id).sort();
  for (const id of ids) {
    try {
      const exam = await J('/api/exams/' + encodeURIComponent(id) + '/detail');
      const fills = exam.sections[0].questions;
      const progN = exam.sections[1] ? exam.sections[1].questions.length : 0;
      const st = await P('/api/exams/' + encodeURIComponent(id) + '/start', {});
      for (const q of fills) await P(`/api/attempts/${st.attemptId}/answers`, { questionId: q.id, answer: pick(q.answer) });
      const g = await P(`/api/attempts/${st.attemptId}/grade`, { auto: false });
      const fillResults = g.results.filter(r => r.type === 'fill');
      const fullTotal = FILL_FULL + progN * PROG_SCORE;
      const ok = fills.length === FILL_N &&
        g.scored.fill === FILL_FULL && g.scored.fillFull === FILL_FULL &&
        g.scored.total === FILL_FULL && g.scored.full === fullTotal &&
        !(g.unanswered && g.unanswered.length) &&
        fillResults.length === FILL_N && fillResults.every(r => r.correct && !r.skipped);
      console.log(`${id}: fill=${g.scored.fill}/${g.scored.fillFull} total=${g.scored.total}/${g.scored.full} unanswered=${(g.unanswered || []).length} ${ok ? 'PASS' : 'FAIL'}`);
      if (!ok) {
        bad++;
        for (const r of fillResults.filter(r => !r.correct)) {
          const q = fills.find(x => x.id === r.qid);
          console.log('   ✗', r.qid, 'submitted=', JSON.stringify(r.userAnswer), 'key=', JSON.stringify(q && q.answer));
        }
      }
    } catch (e) { console.log(`${id}: FAIL ${e.message}`); bad++; }
  }
  // 反向抽查：首卷 f1 故意答错 → 少 fill-score 分且该题判错
  try {
    const id = ids[0];
    await P('/api/exams/' + encodeURIComponent(id) + '/retake', {});
    const exam = await J('/api/exams/' + encodeURIComponent(id) + '/detail');
    const st = await P('/api/exams/' + encodeURIComponent(id) + '/start', {});
    for (const q of exam.sections[0].questions) {
      const a = q.id === 'f1' ? '##故意错误##' : pick(q.answer);
      await P(`/api/attempts/${st.attemptId}/answers`, { questionId: q.id, answer: a });
    }
    const g = await P(`/api/attempts/${st.attemptId}/grade`, { auto: false });
    const ok = g.scored.fill === FILL_FULL - FILL_SCORE && g.results.find(r => r.qid === 'f1').correct === false;
    console.log(`negative-check ${id}: fill=${g.scored.fill}/${FILL_FULL} ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) bad++;
  } catch (e) { console.log('negative-check FAIL', e.message); bad++; }

  server.close();
  db.close();
  console.log(bad ? `E2E FAILURES: ${bad}` : 'E2E ALL PASS');
  process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(3); });
