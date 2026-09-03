'use strict';
const db = require('./db');
const qb = require('./questionbank');
const sessions = require('./examsessions');
const wrongbook = require('./wrongbook');

// 内置默认系统提示词（配置为空时回退）
const DEFAULT_AI_PROMPT = '这是考试错误的一个C++考试题，请详细解析相关的知识点，并给出防止再次出错的改进办法。尽量精简回答，把结果控制到2000字以内（代码除外）';

function tfText(v) { return v === true || v === 'true' ? '正确' : '错误'; }

function getSystemPrompt() {
  const p = db.getSetting('ai_system_prompt');
  return (p && p.trim()) ? p : DEFAULT_AI_PROMPT;
}

// 构建一道错题的 AI 解析首条消息。
// 成功返回 { message }；失败返回 { error: '非法的 ID' | '错题不存在' | '题目已不在题库' }。
function buildMessage(wrongId) {
  if (!Number.isInteger(Number(wrongId))) return { error: '非法的 ID' };
  const w = wrongbook.get(Number(wrongId));
  if (!w) return { error: '错题不存在' };
  const hit = qb.getQuestion(w.exam_id, w.question_id);
  if (!hit) return { error: '题目已不在题库' };
  const q = hit.question;

  let qBlock = q.stem || q.title || '';
  if (q.type === 'choice' && q.options) {
    for (const k of Object.keys(q.options)) qBlock += '\n' + k + '. ' + q.options[k];
  } else if (q.type === 'programming') {
    if (q.input_format) qBlock += '\n输入格式：' + q.input_format;
    if (q.output_format) qBlock += '\n输出格式：' + q.output_format;
  }

  let errBlock = '';
  const att = sessions.latestAttempt(w.exam_id);
  let userAns = null;
  if (att) {
    const row = db.get().prepare('SELECT answer FROM exam_answers WHERE attempt_id=? AND question_id=?')
      .get(att.id, w.question_id);
    userAns = row ? row.answer : null;
  }
  if (q.type === 'programming') {
    if (userAns) {
      const sub = db.get().prepare('SELECT code, result_summary FROM prog_submissions WHERE id=?').get(Number(userAns));
      if (sub) errBlock = '你最近的提交代码：\n```\n' + sub.code + '\n```\n判题结果：\n' + (sub.result_summary || '');
    }
    if (!errBlock) errBlock = '（未找到提交记录）';
  } else {
    if (userAns !== null && userAns !== undefined && userAns !== '') {
      const shown = q.type === 'tf' ? tfText(userAns) : userAns;
      errBlock += '你的答案：' + shown + '（错误）\n';
    }
    const correctShown = q.type === 'tf' ? tfText(q.answer) : q.answer;
    errBlock += '正确答案：' + correctShown;
    if (q.explanation) errBlock += '\n解析：' + q.explanation;
  }

  const message = getSystemPrompt() + '\n\n【题目】\n' + qBlock + '\n\n【出错信息】\n' + errBlock;
  return { message };
}

module.exports = { buildMessage, getSystemPrompt, DEFAULT_AI_PROMPT };
