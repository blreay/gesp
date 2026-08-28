'use strict';
// 判分（纯函数）。
// answers: { questionId: string }，choice 为选项字母；tf 为 'true'/'false'（也容忍布尔）；
//          programming 不参与 answers（由 progResults 决定）。
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

// 只判 choice/tf。返回 { results, choiceScore, choiceFull, tfScore, tfFull, unanswered }
function gradeObjective(exam, answers) {
  const results = [];
  let choiceScore = 0, choiceFull = 0, tfScore = 0, tfFull = 0;
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
      }
      if (entry.correct) entry.score = full;
      if (q.type === 'choice') choiceFull += full; else tfFull += full;
      results.push(entry);
    }
  }
  return { results, choiceScore, choiceFull, tfScore, tfFull, unanswered };
}

// 全卷判分（含编程）。返回 { choice, choiceFull, tf, tfFull, prog, progFull, total, full, results, unanswered }
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
  const total = obj.choiceScore + obj.tfScore + prog;
  const full = obj.choiceFull + obj.tfFull + progFull;
  return {
    choice: obj.choiceScore, choiceFull: obj.choiceFull,
    tf: obj.tfScore, tfFull: obj.tfFull,
    prog, progFull, total, full,
    results: obj.results, unanswered: obj.unanswered
  };
}

module.exports = { gradeObjective, gradeAttempt, normalizeTf };
