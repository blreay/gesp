'use strict';
// 导入 GESP C++ 三级模拟卷（Source A）和错题卷（Source B）到题库。
// 用法: node scripts/import_sources.js
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { htmlToStem, stripNum, parseExamHtml, parseAnswers } = require('./migrate_legacy');

const TITLES = ['一','二','三','四','五','六','七','八','九','十'];

// --- Source A: L3 模拟卷 ---
const SRC_A = '/home/admin/git/richie_gesp/gesp_l3_mock_exams';
const OUT_A = path.join(__dirname, '..', 'question_bank', 'GESP_C++三级');
const CATEGORY_A = 'GESP C++ 三级';

// --- Source B: L3 错题卷 ---
const SRC_B = '/home/admin/git/richie_gesp/gesp_l3_wrong_exams';
const OUT_B = path.join(__dirname, '..', 'question_bank', 'GESP_C++三级错题卷');
const CATEGORY_B = 'GESP C++ 三级错题卷';

// Parse index.html for L3 mock exams (different structure from L1)
function parseL3IndexCards(file) {
  if (!fs.existsSync(file)) return {};
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const map = {};
  $('.card').each((_, el) => {
    const $c = $(el);
    const href = $c.find('a.btn-start').attr('href') || '';
    const m = href.match(/exam_(\d+)\//);
    if (!m) return;
    map['exam_' + m[1]] = {
      subtitle: $c.find('.subtitle').text().trim(),
      tags: $c.find('.tag').map((_, t) => $(t).text().trim()).get(),
      prog_brief: $c.find('.prog-item').map((_, t) => $(t).text().trim()).get().join('；')
    };
  });
  return map;
}

function importSourceA() {
  console.log('=== Source A: GESP C++ 三级模拟卷 ===');
  fs.mkdirSync(OUT_A, { recursive: true });
  const indexCards = parseL3IndexCards(path.join(SRC_A, 'index.html'));
  const report = [];

  for (let n = 1; n <= 10; n++) {
    const num = String(n).padStart(2, '0');
    const dir = path.join(SRC_A, 'exam_' + num);
    if (!fs.existsSync(dir)) { report.push(`exam_${num}: 目录不存在，跳过`); continue; }

    const parsed = parseExamHtml(path.join(dir, `mock_exam_${num}.html`));
    parseAnswers(path.join(dir, `mock_exam_${num}_answers.html`), parsed);

    // Load test programs
    parsed.prog.forEach((p, i) => {
      const testFile = path.join(dir, `test_${num}_prog${i + 1}.cpp`);
      if (fs.existsSync(testFile)) p.answer.test_program = fs.readFileSync(testFile, 'utf8');
    });

    const card = indexCards['exam_' + num] || {};
    const exam = {
      schema_version: 1,
      exam: {
        id: `gesp_l3_mock_${num}`,
        title: `模拟试卷（${TITLES[n - 1]}）`,
        subtitle: card.subtitle || '',
        category: CATEGORY_A,
        duration_minutes: 120,
        total_score: parsed.choice.length * 2 + parsed.tf.length * 2 + parsed.prog.length * 25,
        tags: card.tags || [],
        prog_brief: card.prog_brief || ''
      },
      sections: [
        { title: `一、单选题（每题 2 分，共 ${parsed.choice.length * 2} 分）`, question_type: 'choice', score_per_question: 2, questions: parsed.choice },
        { title: `二、判断题（每题 2 分，共 ${parsed.tf.length * 2} 分）`, question_type: 'tf', score_per_question: 2, questions: parsed.tf },
        { title: `三、编程题（每题 25 分，共 ${parsed.prog.length * 25} 分）`, question_type: 'programming', score_per_question: 25, questions: parsed.prog }
      ]
    };
    const out = path.join(OUT_A, `exam_${num}.exam.json`);
    fs.writeFileSync(out, JSON.stringify(exam, null, 2));
    report.push(`exam_${num}: 选择${parsed.choice.length} 判断${parsed.tf.length} 编程${parsed.prog.length} → ${out}`);
  }
  console.log(report.join('\n'));
  return OUT_A;
}

function importSourceB() {
  console.log('\n=== Source B: GESP C++ 三级错题卷 ===');
  fs.mkdirSync(OUT_B, { recursive: true });
  const report = [];

  for (let n = 1; n <= 10; n++) {
    const num = String(n).padStart(2, '0');
    const dir = path.join(SRC_B, `mock${n}`);
    if (!fs.existsSync(dir)) { report.push(`mock${n}: 目录不存在，跳过`); continue; }

    const htmlFile = path.join(dir, `mock${n}.html`);
    const parsed = parseExamHtml(htmlFile);

    // No answers file — explanations stay empty, no reference_code
    // Set reference_code and solution explicitly empty
    parsed.prog.forEach(p => {
      p.answer.reference_code = '';
      p.answer.solution = '';
    });

    // Load test programs: glob mockN_prob*.cpp sorted
    const testFiles = fs.readdirSync(dir)
      .filter(f => f.match(new RegExp(`^mock${n}_prob.*\\.cpp$`)))
      .sort();
    parsed.prog.forEach((p, i) => {
      if (testFiles[i]) {
        p.answer.test_program = fs.readFileSync(path.join(dir, testFiles[i]), 'utf8');
      }
    });

    // Get title from <title> tag
    const $ = cheerio.load(fs.readFileSync(htmlFile, 'utf8'));
    const htmlTitle = $('title').text().trim() || `错题强化卷 ${TITLES[n - 1]}`;

    const exam = {
      schema_version: 1,
      exam: {
        id: `gesp_l3_wrong_${num}`,
        title: htmlTitle,
        subtitle: `错题强化卷 ${TITLES[n - 1]}`,
        category: CATEGORY_B,
        total_score: parsed.choice.length * 2 + parsed.tf.length * 2 + parsed.prog.length * 25,
        tags: [],
        prog_brief: ''
      },
      sections: [
        { title: `一、单选题（每题 2 分，共 ${parsed.choice.length * 2} 分）`, question_type: 'choice', score_per_question: 2, questions: parsed.choice },
        { title: `二、判断题（每题 2 分，共 ${parsed.tf.length * 2} 分）`, question_type: 'tf', score_per_question: 2, questions: parsed.tf },
        { title: `三、编程题（每题 25 分，共 ${parsed.prog.length * 25} 分）`, question_type: 'programming', score_per_question: 25, questions: parsed.prog }
      ]
    };
    const out = path.join(OUT_B, `exam_${num}.exam.json`);
    fs.writeFileSync(out, JSON.stringify(exam, null, 2));
    report.push(`mock${n}: 选择${parsed.choice.length} 判断${parsed.tf.length} 编程${parsed.prog.length} → ${out}`);
  }
  console.log(report.join('\n'));
  return OUT_B;
}

function validate(outDir, label) {
  console.log(`\n--- 校验 ${label} ---`);
  const qb = require('../src/services/questionbank');
  let bad = 0, count = 0;
  for (const f of fs.readdirSync(outDir).sort()) {
    if (!f.endsWith('.exam.json')) continue;
    count++;
    const { errors } = qb.loadFile(path.join(outDir, f));
    if (errors.length) {
      bad++;
      console.error(`[校验失败] ${f}:\n  ${errors.join('\n  ')}`);
    }
  }
  console.log(`${label}: ${count - bad}/${count} 通过` + (bad ? ` (${bad} 失败)` : ''));
  return bad;
}

// Main
const outA = importSourceA();
const outB = importSourceB();
const badA = validate(outA, 'L3 模拟卷');
const badB = validate(outB, 'L3 错题卷');
const totalBad = badA + badB;
console.log(`\n总计: ${totalBad ? `${totalBad} 个文件校验失败` : '全部 20 套试卷通过校验'}`);
process.exit(totalBad ? 1 : 0);
