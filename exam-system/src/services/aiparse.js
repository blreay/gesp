'use strict';
const db = require('./db');
const wrongbook = require('./wrongbook');
const aicontext = require('./aicontext');

const AI_PARSE_TIMEOUT_MS = 180000;

let queue = [];            // 待处理错题 id
let running = 0;           // 正在执行的任务数
let total = 0;             // 本批次累计任务数
let done = 0;              // 已处理（成功+跳过+失败）
let failed = 0;            // 失败数
let abortFlag = false;
const inFlight = new Set(); // 在途请求的 AbortController

function concurrency() {
  return Math.min(16, Math.max(1, parseInt(db.getSetting('ai_parse_concurrency'), 10) || 4));
}

function status() {
  return { active: queue.length > 0 || running > 0, total, done, failed };
}

// 默认非流式 AI 调用（后台解析用）：固定 enable_thinking=false 只取最终答案。
async function callAi(messages, signal) {
  const s = db.allSettings();
  const baseUrl = String(s.ai_base_url || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('未配置 ai_base_url');
  const resp = await fetch(baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (s.ai_api_key || '') },
    body: JSON.stringify({
      model: s.ai_model,
      max_tokens: parseInt(s.ai_max_tokens, 10) || 8192,
      messages,
      stream: false,
      chat_template_kwargs: { enable_thinking: false }
    }),
    signal
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error('AI 服务返回 HTTP ' + resp.status + (txt ? '：' + txt.slice(0, 200) : ''));
  }
  const j = await resp.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  if (!text.trim()) throw new Error('AI 未返回内容');
  return text;
}
let aiCallImpl = callAi;

async function runOne(wrongId) {
  const controller = new AbortController();
  inFlight.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, AI_PARSE_TIMEOUT_MS);
  try {
    const w = wrongbook.get(wrongId);
    if (!w) return;                       // 错题已删除 → 跳过
    if (w.note && w.note.trim()) return;  // 已有备注 → 跳过（只解析空备注）
    const r = aicontext.buildMessage(wrongId);
    if (r.error) { failed++; return; }    // 题目不在题库等
    const messages = [{ role: 'user', content: r.message }];
    const answer = await aiCallImpl(messages, controller.signal);
    wrongbook.setNote(wrongId, '---\n【AI解析】\n' + answer, w.note_knowledge);
  } catch (e) {
    // 超时 / 网络 / 空回复计失败；用户主动中止（abort）不计
    if (timedOut || !controller.signal.aborted) failed++;
  } finally {
    clearTimeout(timer);
    inFlight.delete(controller);
    done++;
  }
}

function pump() {
  while (running < concurrency() && queue.length > 0 && !abortFlag) {
    const wrongId = queue.shift();
    running++;
    runOne(wrongId).finally(() => { running--; pump(); });
  }
}

// 入队；空闲时重置计数开新批次。返回实际入队数。
function enqueue(wrongIds) {
  const ids = (wrongIds || []).filter(id => Number.isInteger(Number(id))).map(Number);
  if (!ids.length) return 0;
  if (queue.length === 0 && running === 0) { total = 0; done = 0; failed = 0; }
  queue.push(...ids);
  total += ids.length;
  abortFlag = false;
  pump();
  return ids.length;
}

// 终止：中止在途 + 清空队列；已写备注保留。
function abort() {
  abortFlag = true;
  total -= queue.length;
  queue = [];
  for (const c of inFlight) { try { c.abort(); } catch (e) {} }
}

// 测试钩子
function _setAiCall(fn) { aiCallImpl = fn; }
function _resetAiCall() { aiCallImpl = callAi; }
function _reset() {
  queue = []; running = 0; total = 0; done = 0; failed = 0; abortFlag = false; inFlight.clear();
}

module.exports = { enqueue, abort, status, _setAiCall, _resetAiCall, _reset };
