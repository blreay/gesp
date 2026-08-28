'use strict';
const db = require('./db');

function getByQuestion(examId, questionId) {
  return db.get().prepare('SELECT * FROM wrong_questions WHERE exam_id = ? AND question_id = ?').get(examId, questionId) || null;
}
function get(id) {
  return db.get().prepare('SELECT * FROM wrong_questions WHERE id = ?').get(id) || null;
}

// 做错：新建 level=1；active → level+1（封顶5）；mastered → 复活 level=1
function recordWrong(examId, questionId, now) {
  const row = getByQuestion(examId, questionId);
  if (!row) {
    db.get().prepare(`INSERT INTO wrong_questions
      (exam_id, question_id, level, status, note, note_knowledge, times_wrong, times_right, first_wrong_at, last_wrong_at)
      VALUES (?, ?, 1, 'active', '', '', 1, 0, ?, ?)`).run(examId, questionId, now, now);
  } else if (row.status === 'mastered') {
    db.get().prepare(`UPDATE wrong_questions SET status = 'active', level = 1,
      times_wrong = times_wrong + 1, last_wrong_at = ? WHERE id = ?`).run(now, row.id);
  } else {
    db.get().prepare(`UPDATE wrong_questions SET level = MIN(level + 1, 5),
      times_wrong = times_wrong + 1, last_wrong_at = ? WHERE id = ?`).run(now, row.id);
  }
  return getByQuestion(examId, questionId);
}

// 复习做对：level-1；到 0 → mastered
function recordRight(wrongId, now) { // now 暂不使用：做对不更新 last_wrong_at
  const row = get(wrongId);
  if (!row || row.status !== 'active') return row;
  const newLevel = row.level - 1;
  if (newLevel <= 0) {
    db.get().prepare(`UPDATE wrong_questions SET status = 'mastered', level = 1,
      times_right = times_right + 1 WHERE id = ?`).run(wrongId);
  } else {
    db.get().prepare(`UPDATE wrong_questions SET level = ?,
      times_right = times_right + 1 WHERE id = ?`).run(newLevel, wrongId);
  }
  return get(wrongId);
}

function setNote(wrongId, note, noteKnowledge) {
  db.get().prepare('UPDATE wrong_questions SET note = ?, note_knowledge = ? WHERE id = ?')
    .run(note || '', noteKnowledge || '', wrongId);
}
function setStatus(wrongId, status) {
  db.get().prepare("UPDATE wrong_questions SET status = ? WHERE id = ?").run(status, wrongId);
}
function remove(wrongId) {
  db.get().prepare('DELETE FROM wrong_questions WHERE id = ?').run(wrongId);
}

// 过滤：level: 'all'|'1'..'5'|'3+'；status: 'active'|'mastered'|'all'；keyword 匹配备注
function list(filter) {
  filter = filter || {};
  const conds = [], params = [];
  if (filter.status === 'active') conds.push("status = 'active'");
  else if (filter.status === 'mastered') conds.push("status = 'mastered'");
  if (filter.category) { conds.push('exam_id IN (SELECT id FROM exams WHERE category = ?)'); params.push(filter.category); }
  if (filter.level && filter.level !== 'all') {
    if (filter.level.endsWith('+')) { conds.push('level >= ?'); params.push(parseInt(filter.level, 10)); }
    else { conds.push('level = ?'); params.push(parseInt(filter.level, 10)); }
  }
  if (filter.keyword) { conds.push('(note LIKE ? OR note_knowledge LIKE ?)'); params.push('%' + filter.keyword + '%', '%' + filter.keyword + '%'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return db.get().prepare(`SELECT w.*, e.title AS exam_title, e.category AS category
    FROM wrong_questions w LEFT JOIN exams e ON e.id = w.exam_id ${where}
    ORDER BY w.level DESC, w.last_wrong_at DESC`).all(...params);
}

module.exports = { get, getByQuestion, recordWrong, recordRight, setNote, setStatus, remove, list };
