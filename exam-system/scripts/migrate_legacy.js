'use strict';
// 把 /home/admin/tools/richie/mock_exams/exam_01..10 的静态卷转成新题库格式。
// 用法: node scripts/migrate_legacy.js [源目录] [输出目录]
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SRC = process.argv[2] || '/home/admin/tools/richie/mock_exams';
const OUT = process.argv[3] || path.join(__dirname, '..', 'question_bank', 'GESP_C++一级');
const CATEGORY = 'GESP C++ 一级';
const DURATION = 120;

function htmlToStem($el, $) {
  // 把 HTML 题干转成纯文本 + ``` 围栏代码块
  let out = '';
  $el.contents().each((_, node) => {
    if (node.type === 'tag') {
      const $n = $(node);
      if (node.name === 'pre') out += '\n```\n' + $n.text().replace(/\n+$/, '') + '\n```\n';
      else if (node.name === 'code') out += '`' + $n.text() + '`';
      else if (node.name === 'br') out += '\n';
      else if (node.name === 'em' || node.name === 'i') out += $n.text();
      else if (node.name === 'strong' || node.name === 'b') out += $n.text();
      else out += htmlToStem($n, $);
    } else if (node.type === 'text') {
      out += node.data;
    }
  });
  return out.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripNum(s) { return String(s).replace(/^\s*\d+\s*[.．、]\s*/, '').trim(); }

function parseExamHtml(file) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const choice = [], tf = [], prog = [];

  $('.question[data-qtype="choice"]').each((_, el) => {
    const $q = $(el);
    const options = {};
    $q.find('.opt').each((_, o) => {
      const $o = $(o);
      const val = $o.attr('data-val');
      // Option text: remove the radio-dot span, then get text. Format: "A. text"
      const clone = $o.clone();
      clone.find('.radio-dot').remove();
      let optText = clone.text().trim();
      // Strip leading "A. " / "A．" prefix
      optText = optText.replace(/^[A-D]\s*[.．]\s*/, '').trim();
      options[val] = optText;
    });
    // Collect sibling <pre> between .q-text and .options
    let stem = stripNum(htmlToStem($q.find('.q-text').first(), $));
    let afterText = false;
    $q.children().each((_, child) => {
      const $c = $(child);
      if ($c.hasClass('q-text')) { afterText = true; return; }
      if ($c.hasClass('options')) return false; // stop
      if (afterText && child.name === 'pre') {
        stem += '\n```\n' + $c.text().replace(/\n+$/, '') + '\n```\n';
      }
    });
    stem = stem.replace(/\n{3,}/g, '\n\n').trim();
    choice.push({
      id: 'q' + $q.attr('data-qnum'),
      type: 'choice', knowledge: [],
      stem, options, answer: $q.attr('data-answer'), explanation: ''
    });
  });

  $('.tf-item[data-qtype="tf"]').each((_, el) => {
    const $q = $(el);
    // Collect sibling <pre> between .tf-text and .tf-options
    let stem = stripNum(htmlToStem($q.find('.tf-text').first(), $));
    let afterText = false;
    $q.children().each((_, child) => {
      const $c = $(child);
      if ($c.hasClass('tf-text')) { afterText = true; return; }
      if ($c.hasClass('tf-options')) return false; // stop
      if (afterText && child.name === 'pre') {
        stem += '\n```\n' + $c.text().replace(/\n+$/, '') + '\n```\n';
      }
    });
    stem = stem.replace(/\n{3,}/g, '\n\n').trim();
    tf.push({
      id: 'q' + $q.attr('data-qnum'),
      type: 'tf', knowledge: [],
      stem, answer: $q.attr('data-answer') === 'A', explanation: ''
    });
  });

  $('.prog-section').each((i, el) => {
    const $p = $(el);
    const h3text = ($p.find('h3').text() || '');
    const title = h3text.replace(/^编程题\s*\d+\s*[：:]\s*/, '').trim();

    // Grab content between labels
    const grab = label => {
      const parts = [];
      let on = false;
      $p.children().each((_, c) => {
        const $c = $(c);
        if ($c.hasClass('label')) {
          on = $c.text().trim().includes(label);
          return;
        }
        if (on) {
          if ($c.hasClass('sample-box') || (c.name === 'div' && $c.hasClass('sample-box'))) {
            on = false;
            return;
          }
          if (c.name === 'p' && !$c.hasClass('label')) {
            parts.push(htmlToStem($c, $));
          }
        }
      });
      return parts.join('\n').trim();
    };

    const samples = [];
    $p.find('.sample-box').each((_, sb) => {
      const ins = [], outs = [];
      $(sb).find('.sample').each((_, s) => {
        const h = $(s).find('h4').text();
        const pre = $(s).find('pre').text().replace(/\n+$/, '');
        if (h.includes('输入')) ins.push(pre); else outs.push(pre);
      });
      for (let k = 0; k < Math.max(ins.length, outs.length); k++) {
        samples.push({ input: ins[k] || '', output: outs[k] || '' });
      }
    });

    prog.push({
      id: 'prog' + (i + 1), type: 'programming', title, knowledge: [],
      stem: grab('问题描述') || grab('题目描述'), input_format: grab('输入格式') || grab('输入描述'),
      output_format: grab('输出格式') || grab('输出描述'), constraints: grab('数据范围') || grab('数据约束'),
      samples, answer: { reference_code: '', solution: '', test_program: '' }
    });
  });

  choice.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  tf.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  return { choice, tf, prog };
}

function parseAnswers(file, parsed) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  let section = 'choice';

  // Detect format: L1 uses .explain with <strong>, L3 uses .explanation with <h3>
  const isNewFormat = $('.explanation').length > 0;
  // L1 wraps in .container; L3 has content directly in <body>
  const $root = $('.container').length ? $('.container') : $('body');

  // First pass: collect explanations
  $root.children().each((_, el) => {
    const $e = $(el);
    if ($e.hasClass('section-title')) {
      const t = $e.text();
      section = t.includes('判断') ? 'tf' : t.includes('编程') ? 'prog' : 'choice';
      return;
    }
    if (!$e.hasClass('explain') && !$e.hasClass('explanation')) return;

    // Extract heading text from <h3> (L3) or <strong> (L1)
    const heading = $e.find('h3').first().text() || $e.find('strong').first().text() || '';

    // For programming section, grab solution text and reference code
    if (section === 'prog') {
      const m = heading.match(/编程题\s*(\d+)/);
      if (m && parsed.prog[Number(m[1]) - 1]) {
        const idx = Number(m[1]) - 1;
        // Get solution text (from <p> after heading, excluding <pre>)
        const clone = $e.clone();
        clone.find('strong').remove();
        clone.find('h3').remove();
        clone.find('pre').remove();
        const body = clone.html().replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/&emsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        parsed.prog[idx].answer.solution = body;

        // For new format: reference code is inside the <pre> within this div
        if (isNewFormat) {
          const pre = $e.find('pre').first();
          if (pre.length) {
            parsed.prog[idx].answer.reference_code = pre.text().replace(/\n+$/, '');
          }
        }
      }
      return;
    }

    // Choice/TF explanations
    const clone = $e.clone();
    clone.find('strong').remove();
    clone.find('h3').remove();
    const body = clone.html().replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&emsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (section === 'choice') {
      const m = heading.match(/第\s*(\d+)\s*题/);
      if (m) {
        const target = parsed.choice.find(q => q.id === 'q' + m[1]);
        if (target) target.explanation = body;
      }
    } else if (section === 'tf') {
      const m = heading.match(/第\s*(\d+)\s*题/);
      if (m) {
        let num = Number(m[1]);
        // TF questions in the answers page are numbered 1..10 but in the exam they start at 16
        // Map by finding the offset
        const tfStart = parsed.tf.length > 0 ? parseInt(parsed.tf[0].id.slice(1)) : 1;
        if (num < tfStart) {
          num = num + tfStart - 1;
        }
        const target = parsed.tf.find(q => q.id === 'q' + num);
        if (target) target.explanation = body;
      }
    }
  });

  // Second pass (L1 format only): grab reference code from <pre> after programming .explain blocks
  if (!isNewFormat) {
    let progIdx = -1;
    $root.children().each((_, el) => {
      const $e = $(el);
      if ($e.hasClass('section-title') && $e.text().includes('编程')) {
        progIdx = -1; // reset; we'll increment on explain blocks
        return;
      }
      if ($e.hasClass('explain') && $e.find('strong').text().includes('编程题')) {
        progIdx++;
      } else if (el.name === 'pre' && progIdx >= 0 && parsed.prog[progIdx]) {
        // Decode HTML entities in code
        let code = $e.text().replace(/\n+$/, '');
        parsed.prog[progIdx].answer.reference_code = code;
      }
    });
  }

  // Third pass (fallback): handle "raw" format where <h3>编程题N...</h3> followed by <pre>
  // directly in body without wrapper classes. Only fill if still empty.
  // Uses raw regex to avoid Cheerio eating unescaped angle brackets in <pre>.
  const hasEmpty = parsed.prog.some(p => !p.answer.reference_code);
  if (hasEmpty) {
    const rawHtml = fs.readFileSync(file, 'utf8');
    // Find the programming section: after a heading containing 编程题参考
    const progSectionMatch = rawHtml.match(/编程题参考[\s\S]*/);
    if (progSectionMatch) {
      const progSection = progSectionMatch[0];
      // Extract all <pre>...</pre> blocks with raw content
      const preBlocks = [...progSection.matchAll(/<pre>([\s\S]*?)<\/pre>/g)];
      // Find heading-to-pre associations by looking for 编程题N patterns
      const headings = [...progSection.matchAll(/<h3>[^<]*编程题\s*(\d+)[^<]*<\/h3>/g)];
      for (let i = 0; i < headings.length && i < preBlocks.length; i++) {
        const idx = Number(headings[i][1]) - 1;
        if (idx >= 0 && parsed.prog[idx] && !parsed.prog[idx].answer.reference_code) {
          // Decode basic HTML entities
          let code = preBlocks[i][1]
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\n+$/, '');
          parsed.prog[idx].answer.reference_code = code;
        }
      }
    }
  }
}

function parseIndexCards(file) {
  const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
  const map = {};
  $('.card').each((_, el) => {
    const $c = $(el);
    const href = $c.attr('onclick') || '';
    const m = href.match(/exam_(\d+)\//);
    if (!m) return;
    map['exam_' + m[1]] = {
      subtitle: $c.find('.card-subtitle').text().trim(),
      tags: $c.find('.tag').map((_, t) => $(t).text().trim()).get(),
      prog_brief: (() => {
        const footer = $c.find('.card-footer span').first().text() || '';
        return footer.replace(/^.*编程[：:]\s*/, '').trim();
      })()
    };
  });
  return map;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const indexCards = parseIndexCards(path.join(SRC, 'index.html'));
  const report = [];
  const TITLES = ['一','二','三','四','五','六','七','八','九','十'];

  for (let n = 1; n <= 10; n++) {
    const num = String(n).padStart(2, '0');
    const dir = path.join(SRC, 'exam_' + num);
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
        id: `gesp_l1_mock_${num}`,
        title: `模拟试卷（${TITLES[n - 1]}）`,
        subtitle: card.subtitle || '', category: CATEGORY,
        duration_minutes: DURATION,
        total_score: parsed.choice.length * 2 + parsed.tf.length * 2 + parsed.prog.length * 25,
        tags: card.tags || [], prog_brief: card.prog_brief || ''
      },
      sections: [
        { title: `一、单选题（每题 2 分，共 ${parsed.choice.length * 2} 分）`, question_type: 'choice', score_per_question: 2, questions: parsed.choice },
        { title: `二、判断题（每题 2 分，共 ${parsed.tf.length * 2} 分）`, question_type: 'tf', score_per_question: 2, questions: parsed.tf },
        { title: `三、编程题（每题 25 分，共 ${parsed.prog.length * 25} 分）`, question_type: 'programming', score_per_question: 25, questions: parsed.prog }
      ]
    };
    const out = path.join(OUT, `exam_${num}.exam.json`);
    fs.writeFileSync(out, JSON.stringify(exam, null, 2));
    report.push(`exam_${num}: 选择${parsed.choice.length} 判断${parsed.tf.length} 编程${parsed.prog.length} → ${out}`);
  }
  console.log(report.join('\n'));

  // 用题库校验器复检
  const qb = require('../src/services/questionbank');
  let bad = 0;
  for (const f of fs.readdirSync(OUT)) {
    if (!f.endsWith('.exam.json')) continue;
    const { errors } = qb.loadFile(path.join(OUT, f));
    if (errors.length) { bad++; console.error(`[校验失败] ${f}:\n  ${errors.join('\n  ')}`); }
  }
  console.log(bad ? `有 ${bad} 个文件校验失败，请检查！` : '全部文件通过模板校验');
  process.exit(bad ? 1 : 0);
}

// Export reusable functions for other import scripts
module.exports = { htmlToStem, stripNum, parseExamHtml, parseAnswers, parseIndexCards };

if (require.main === module) main();
