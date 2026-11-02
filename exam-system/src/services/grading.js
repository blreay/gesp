'use strict';
// 判分（纯函数）。
// answers: { questionId: string }，choice 为选项字母；tf 为 'true'/'false'（也容忍布尔）；
//          fill 为填写文本；programming 不参与 answers（由 progResults 决定）。
// progResults: { questionId: { allPassed: boolean } }。

function normalizeTf(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true' || v === 'A') return true;
    if (s === 'false' || v === 'B') return false;
  }
  return null;
}

// 填空题答案归一化：全角→半角、连续空白折叠为单个空格、去首尾空白。
// 大小写敏感（C++ 代码类答案区分大小写；需要放宽时在题库 answer 数组中列出可接受写法）。
function normalizeFill(v) {
  return String(v)
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// answer 支持单个字符串或"可接受答案"数组；归一化后精确匹配（区分大小写）。
function matchFill(user, answer) {
  const u = normalizeFill(user);
  if (!u) return false;
  const alts = Array.isArray(answer) ? answer : [answer];
  return alts.some(a => a !== null && a !== undefined && normalizeFill(a) === u);
}

// 只判 choice/tf/fill。返回 { results, choiceScore, choiceFull, tfScore, tfFull, fillScore, fillFull, unanswered }
function gradeObjective(exam, answers) {
  const results = [];
  let choiceScore = 0, choiceFull = 0, tfScore = 0, tfFull = 0, fillScore = 0, fillFull = 0;
  const unanswered = [];
  for (const sec of exam.sections) {
    for (const q of sec.questions || []) {
      if (q.type === 'programming') continue;
      const full = sec.score_per_question;
      const user = answers[q.id];
      const entry = { qid: q.id, type: q.type, userAnswer: user ?? null, correct: false, skipped: false, score: 0, full };
      if (user === undefined || user === null || user === '') {
        entry.skipped = true;
        unanswered.push(q.id);
      } else if (q.type === 'choice') {
        entry.correct = user === q.answer;
        if (entry.correct) choiceScore += full;
      } else if (q.type === 'tf') {
        entry.correct = normalizeTf(user) === q.answer;
        if (entry.correct) tfScore += full;
      } else if (q.type === 'fill') {
        entry.correct = matchFill(user, q.answer);
        if (entry.correct) fillScore += full;
      }
      if (entry.correct) entry.score = full;
      if (q.type === 'choice') choiceFull += full;
      else if (q.type === 'fill') fillFull += full;
      else tfFull += full;
      results.push(entry);
    }
  }
  return { results, choiceScore, choiceFull, tfScore, tfFull, fillScore, fillFull, unanswered };
}

// 全卷判分（含编程）。返回 { choice, choiceFull, tf, tfFull, fill, fillFull, prog, progFull, total, full, results, unanswered }
function gradeAttempt(exam, answers, progResults) {
  const obj = gradeObjective(exam, answers);
  let prog = 0, progFull = 0;
  for (const sec of exam.sections) {
    for (const q of sec.questions || []) {
      if (q.type !== 'programming') continue;
      const full = sec.score_per_question;
      progFull += full;
      const verdict = progResults[q.id];
      const passed = !!(verdict && verdict.allPassed);
      if (passed) prog += full;
      obj.results.push({
        qid: q.id, type: 'programming', userAnswer: verdict ? 'submitted' : null,
        correct: passed, skipped: !verdict, score: passed ? full : 0, full
      });
    }
  }
  const total = obj.choiceScore + obj.tfScore + obj.fillScore + prog;
  const full = obj.choiceFull + obj.tfFull + obj.fillFull + progFull;
  return {
    choice: obj.choiceScore, choiceFull: obj.choiceFull,
    tf: obj.tfScore, tfFull: obj.tfFull,
    fill: obj.fillScore, fillFull: obj.fillFull,
    prog, progFull, total, full,
    results: obj.results, unanswered: obj.unanswered
  };
}

module.exports = { gradeObjective, gradeAttempt, normalizeTf, normalizeFill, matchFill };
