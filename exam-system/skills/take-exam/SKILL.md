---
name: take-exam
description: Automatically sit a mock exam on the GESP online exam system. Input is an exam title (e.g. "模拟试卷（五）" or "第五套"). Finds the exam by title, starts it, answers every question (choice/true-false/programming), submits, and reports the score. Use when asked to "take/run/sit an exam", "自动考试", "做一套卷子", or "跑一遍第N套".
---

# take-exam — 自动参加一次在线模拟考试

You are going to autonomously take a full mock exam against a running **GESP 在线模拟考试系统**.
Input: **试卷标题** (exam title). Everything else you discover via the HTTP API.

## Hard rules

- Answer honestly by default: read each question's stem and solve it with your own knowledge.
  The exam JSON contains reference `answer` / `reference_code` fields — **do not copy them blindly**.
  Only use them if the caller explicitly asks for a "verification / key-check run".
- Never skip a question. If unsure, pick your best answer; do not leave it unanswered.
- Finish all questions before grading. The server auto-grades at the deadline, but you should
  submit well before it.

---

## Step 0 — Bootstrap: make sure you can speak HTTP

You may be on a fresh machine. Establish ONE working way to make HTTP requests and parse JSON.
Probe in this order and use the first that works:

1. `command -v curl`  → use `curl`
2. `command -v wget`  → use `wget -qO-`
3. `command -v python3` → use `python3 -c 'import urllib.request...'`
4. `command -v node` → use `node -e 'fetch(...)'`
5. If none: install curl via the available package manager
   (`apt-get update && apt-get install -y curl` / `yum install -y curl` / `apk add curl` / `brew install curl`).

Set the server base URL:
- Default `BASE=http://localhost:8730`.
- Override with the caller-provided URL or env `EXAM_BASE_URL` if given.
- Sanity check: `GET $BASE/api/exams` must return a JSON array. If it fails, the server is not
  running there — ask the caller for the correct host/port before continuing.

Define two reusable request helpers (curl examples; adapt if you chose another tool):

```bash
# GET JSON
api_get()  { curl -fsS "$BASE$1"; }

# POST JSON body, returns response JSON
api_post() { curl -fsS -X POST -H 'Content-Type: application/json' -d "$2" "$BASE$1"; }
```

For JSON parsing, prefer `python3 -c` or `node -e` over jq (jq may be absent). Example:
```bash
api_get /api/exams | python3 -c 'import sys,json; [print(e["id"], e["title"]) for e in json.load(sys.stdin)]'
```

---

## Step 1 — Find the exam by title

`GET /api/exams` returns an array of `{id, title, subtitle, category, duration_minutes, total_score}`.

Match the caller's title against `title` (and `subtitle`/`category` as fallback):
- Exact or near-exact match → use it.
- Ordinal hints: 「第五套」「试卷五」「mock5」→ 「模拟试卷（五）」; map 一/二/三/…/十 ↔ 1..10.
- Multiple candidates or no match → list what exists and ask the caller to pick; do not guess silently.

Record the chosen `EXAM_ID`. Also fetch and remember `duration_minutes` so you know your time budget.

## Step 2 — Fetch the full paper

`GET /api/exams/$EXAM_ID/detail` returns the full paper:
```
{ exam: {...meta}, sections: [
    { title, question_type: "choice"|"tf"|"programming", score_per_question, questions: [ ... ] } ] }
```
Question shapes:
- choice: `{ id, stem, options:{A,B,C,D}, answer }`
- tf: `{ id, stem, answer: true|false }`
- programming: `{ id, title, stem, input_format, output_format, samples:[{input,output}], constraints, answer:{reference_code, test_program, solution} }`

Save this JSON locally (e.g. write to a temp file) so you can iterate without re-fetching.

## Step 3 — Start the exam

`POST /api/exams/$EXAM_ID/start` (empty body `{}`) → `{ attemptId, deadlineAt, durationMs, resumed }`.
- Record `ATTEMPT_ID`.
- If `resumed:true`, an attempt was already in progress. Ask the caller whether to continue it or
  retake. To force a fresh attempt, `POST /api/exams/$EXAM_ID/retake` then `start` again.

## Step 4 — Answer the objective questions (choice + tf)

For EVERY choice/tf question, decide the answer from the stem, then record it:

```
POST /api/attempts/$ATTEMPT_ID/answers
Body: { "questionId": "<qid>", "answer": "<A|B|C|D>" }      # choice
Body: { "questionId": "<qid>", "answer": "true" | "false" } # tf (string, not boolean)
```
- Send one request per question (or a small loop). Check each returns `{"ok":true}`.
- tf answers must be the strings `"true"` / `"false"`.
- Keep a local record of qid→your answer for the final report.

Work through all choice and tf questions before moving to programming.

## Step 5 — Programming questions (write, submit, iterate)

For EACH programming question:
1. Read `stem`, `input_format`, `output_format`, `samples`, `constraints`. Write a correct C++
   solution (read from `stdin`, write to `stdout`, match sample I/O exactly).
2. Submit:
   ```
   POST /api/judge
   Body: { "examId": "<EXAM_ID>", "questionId": "<qid>", "attemptId": <ATTEMPT_ID>, "code": "<full C++ source>" }
   ```
3. Response: `{ status, allPassed, detail, submissionId }` where status is one of
   `ALL_PASS | PARTIAL_PASS | COMPILE_ERROR | TESTER_BUILD_ERROR | RUNTIME_ERROR`.
   - `ALL_PASS` → done for this question.
   - `COMPILE_ERROR` → read `detail` (g++ errors), fix the code, resubmit.
   - `PARTIAL_PASS` → `detail` lists failing cases; fix the logic, resubmit.
   - `RUNTIME_ERROR` → likely timeout/crash (infinite loop, bad memory); fix, resubmit.
4. Iterate up to ~5 submissions per question. If still failing after honest effort, leave the best
   version submitted and move on (it still counts for partial credit only if ALL_PASS, so note it).

Escape the code properly inside the JSON body (newlines as `\n`, quote backslashes). Writing the body
via a temp file + `curl --data @file` avoids shell-escaping pain.

## Step 6 — Grade (交卷)

When all questions are answered/submitted:
```
POST /api/attempts/$ATTEMPT_ID/grade
Body: { "auto": false }
```
Response: `{ scored:{choice, choiceFull, tf, tfFull, prog, progFull, total, full}, wrongAdded:[qids], ... }`.

If you hit the deadline instead, the server auto-grades; then `GET /api/exams/$EXAM_ID/state`
returns the final `lastGrade`.

## Step 7 — Report

Give the caller a concise result:
- Exam title, total score `scored.total / scored.full`.
- Section breakdown (choice / tf / programming).
- Which questions were wrong (`wrongAdded`) and their correct answers if available.
- Programming questions: which passed all tests.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Connection refused on `$BASE` | Server not running there. Confirm host/port; default is `http://localhost:8730`. Ask caller if unsure. |
| `GET /api/exams` empty `[]` | No exams loaded. The server scanned an empty `question_bank/`. |
| `start` returns 404 | Wrong `EXAM_ID`; redo Step 1. |
| `start` returns `resumed:true` | Attempt already in progress; ask caller: continue or `retake`. |
| Judge `RUNTIME_ERROR` every time | Your code likely loops forever or crashes; add bounds/guards. |
| Judge very slow | Complex code near time limit; simplify or optimize. |
| tf answer rejected | You sent a boolean; send the string `"true"`/`"false"`. |

## API quick reference

| Method & path | Purpose |
|---|---|
| `GET /api/exams` | List exams (find by title) |
| `GET /api/exams/:id/detail` | Full paper incl. questions |
| `POST /api/exams/:id/start` | Start/resume → `attemptId` |
| `POST /api/exams/:id/retake` | Clear last attempt, allow fresh start |
| `POST /api/attempts/:aid/answers` | Record one answer `{questionId, answer}` |
| `POST /api/judge` | Submit code `{examId, questionId, attemptId, code}` |
| `POST /api/attempts/:aid/grade` | Final grade `{auto:false}` |
| `GET /api/exams/:id/state` | Current attempt state / final grade |
