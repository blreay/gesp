'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  file TEXT NOT NULL,
  duration_minutes INTEGER,
  total_score INTEGER NOT NULL,
  tags_json TEXT,
  loaded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  status TEXT NOT NULL CHECK (status IN ('in_progress','graded')),
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  auto_submitted INTEGER DEFAULT 0,
  score_choice INTEGER DEFAULT 0,
  score_tf INTEGER DEFAULT 0,
  score_prog INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts(exam_id);
CREATE TABLE IF NOT EXISTS exam_answers (
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id),
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);
CREATE TABLE IF NOT EXISTS wrong_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','mastered')),
  note TEXT DEFAULT '',
  note_knowledge TEXT DEFAULT '',
  times_wrong INTEGER DEFAULT 1,
  times_right INTEGER DEFAULT 0,
  first_wrong_at INTEGER NOT NULL,
  last_wrong_at INTEGER NOT NULL,
  UNIQUE (exam_id, question_id)
);
CREATE TABLE IF NOT EXISTS review_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  filter_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  correct_count INTEGER DEFAULT 0,
  finished INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS review_answers (
  session_id INTEGER NOT NULL REFERENCES review_sessions(id),
  wrong_id INTEGER NOT NULL REFERENCES wrong_questions(id),
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  PRIMARY KEY (session_id, wrong_id)
);
CREATE TABLE IF NOT EXISTS review_session_items (
  session_id INTEGER NOT NULL REFERENCES review_sessions(id),
  wrong_id INTEGER NOT NULL REFERENCES wrong_questions(id),
  PRIMARY KEY (session_id, wrong_id)
);
CREATE TABLE IF NOT EXISTS prog_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  attempt_id INTEGER,
  code TEXT NOT NULL,
  compile_ok INTEGER NOT NULL,
  all_passed INTEGER NOT NULL,
  result_summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progsub_q ON prog_submissions(exam_id, question_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  default_duration_minutes: '120',
  remind_before_minutes: '30',
  remind_interval_minutes: '10',
  judge_compile_timeout_sec: '30',
  judge_run_timeout_sec: '60',
  ai_webui_url: 'http://121.40.190.90:3000/',
  ai_base_url: 'http://121.40.190.90:4000',
  ai_api_key: 'sk-vllm-aaa-bbb',
  ai_model: 'qwen-local'
};

let _db = null;

function open(dbFile) {
  const file = dbFile || path.join(__dirname, '..', '..', 'data', 'exam.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  // better-sqlite3 v12 起 foreign_keys 默认 ON；本应用的题库重扫会对 exams 表
  // 做 DELETE/重建，而 exam_attempts 通过 exam_id 外键引用它，开启后重扫即报
  // SQLITE_CONSTRAINT_FOREIGNKEY。数据完整性由各服务逻辑保证，这里显式关闭。
  db.pragma('foreign_keys = OFF');
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

function init(dbFile) { if (_db) _db.close(); _db = open(dbFile); return _db; }
function get() { if (!_db) _db = open(); return _db; }
function close() { if (_db) { _db.close(); _db = null; } }
function getSetting(key) {
  const row = get().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function getSettingInt(key) {
  const v = getSetting(key);
  return v === null ? NaN : parseInt(v, 10);
}
function setSetting(key, value) {
  get().prepare(`INSERT INTO settings(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}
function allSettings() {
  return Object.fromEntries(get().prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
}

module.exports = { init, get, close, getSetting, getSettingInt, setSetting, allSettings, DEFAULT_SETTINGS };
