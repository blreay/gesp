#!/usr/bin/env python3
"""
Restyle all GESP L3 mock exams (exam_01..exam_10) to match the reference
visual style used in mock_exams/exam_02/mock_exam_02.html, and fix grading
so that ungraded/unanswered questions no longer block grading (they show a
warning modal but the user can proceed and unanswered questions just score 0).

Parses the existing "question-card" style HTML (produced by generate_exam.py
and by the sub-agents, which all converged on the same DOM shape) and
re-emits it inside the reference layout/CSS/JS.
"""
import re
import os
import glob

EXAM_DIR = os.path.dirname(os.path.abspath(__file__))

CSS = """
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Microsoft YaHei", "SimSun", sans-serif;
            background: #f0f4f8;
            color: #333;
            line-height: 1.8;
        }
        .container {
            max-width: 850px;
            margin: 30px auto;
            background: #fff;
            padding: 50px 60px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
            border-radius: 8px;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #1a5276;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header .logo-line {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 15px;
            margin-bottom: 10px;
        }
        .header .logo-line .badge {
            display: inline-block;
            background: linear-gradient(135deg, #1a5276, #2980b9);
            color: #fff;
            font-size: 22px;
            font-weight: bold;
            padding: 8px 20px;
            border-radius: 6px;
            letter-spacing: 3px;
        }
        .header .subtitle {
            color: #666;
            font-size: 13px;
            letter-spacing: 1px;
        }
        .header h1 {
            font-size: 28px;
            margin: 15px 0 5px;
            color: #1a5276;
        }
        .header .exam-info-row {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin-top: 8px;
        }
        .header .exam-info {
            font-size: 15px;
            color: #555;
        }
        .btn-grade {
            background: linear-gradient(135deg, #c0392b, #e74c3c);
            color: #fff;
            border: none;
            padding: 8px 28px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 25px;
            cursor: pointer;
            letter-spacing: 2px;
            box-shadow: 0 3px 10px rgba(192,57,43,0.3);
            transition: all 0.2s;
        }
        .btn-grade:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(192,57,43,0.4);
        }
        .btn-grade:active { transform: translateY(0); }
        .score-display {
            display: none;
            margin-top: 12px;
            font-size: 22px;
            font-weight: bold;
            color: #c0392b;
            text-align: center;
            animation: scoreIn 0.5s ease;
        }
        .score-display .big-score {
            font-size: 48px;
            display: inline-block;
            margin: 0 5px;
            text-shadow: 1px 1px 3px rgba(192,57,43,0.2);
        }
        @keyframes scoreIn {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
        }
        .score-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0 30px;
            font-size: 14px;
        }
        .score-table th, .score-table td {
            border: 1px solid #ccc;
            padding: 8px 15px;
            text-align: center;
        }
        .score-table th {
            background: #eaf2f8;
            color: #1a5276;
            font-weight: bold;
        }
        .score-table td.scored {
            color: #c0392b;
            font-weight: bold;
            font-size: 18px;
        }
        .section-title {
            background: linear-gradient(90deg, #1a5276, #2980b9);
            color: #fff;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 18px;
            margin: 30px 0 20px;
            display: flex;
            justify-content: space-between;
        }
        .question {
            margin-bottom: 22px;
            padding: 15px 18px;
            background: #fafbfc;
            border-left: 4px solid #2980b9;
            border-radius: 0 6px 6px 0;
            position: relative;
            transition: all 0.3s;
        }
        .question:hover { background: #f0f6fb; }
        .question .q-text {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 15px;
        }
        .question .options { padding-left: 10px; }
        .question .options .opt {
            margin: 4px 0;
            font-size: 14px;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            border: 2px solid transparent;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .question .options .opt:hover {
            background: #e8f4fd;
        }
        .question .options .opt .radio-dot {
            display: inline-block;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 2px solid #aaa;
            flex-shrink: 0;
            position: relative;
            transition: all 0.15s;
        }
        .question .options .opt.selected {
            background: #dceefb;
            border-color: #2980b9;
            font-weight: bold;
        }
        .question .options .opt.selected .radio-dot {
            border-color: #2980b9;
        }
        .question .options .opt.selected .radio-dot::after {
            content: '';
            position: absolute;
            top: 3px; left: 3px;
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #2980b9;
        }
        .question.wrong {
            background: #fff0f0 !important;
            border-left-color: #e74c3c !important;
            box-shadow: 0 0 0 2px rgba(231,76,60,0.2);
        }
        .question.correct-graded {
            background: #f0fff0 !important;
            border-left-color: #27ae60 !important;
        }
        .question .correct-answer-tag {
            display: none;
            margin-top: 10px;
            padding: 6px 14px;
            background: #27ae60;
            color: #fff;
            border-radius: 5px;
            font-size: 14px;
            font-weight: bold;
        }
        .question.wrong .correct-answer-tag { display: inline-block; }
        .btn-copy {
            display: none;
            position: absolute;
            top: 12px;
            right: 12px;
            background: #e74c3c;
            color: #fff;
            border: none;
            padding: 4px 14px;
            font-size: 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.15s;
        }
        .btn-copy:hover { background: #c0392b; }
        .btn-copy.copied { background: #27ae60; }
        .question.wrong .btn-copy { display: block; }
        pre {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 5px;
            padding: 12px 16px;
            margin: 8px 0;
            font-family: "Consolas", "Courier New", monospace;
            font-size: 13px;
            overflow-x: auto;
            line-height: 1.6;
        }
        .tf-item {
            margin-bottom: 14px;
            padding: 10px 15px;
            background: #fafbfc;
            border-left: 4px solid #27ae60;
            border-radius: 0 6px 6px 0;
            position: relative;
            transition: all 0.3s;
        }
        .tf-item .tf-text { font-size: 14px; }
        .tf-item .tf-options {
            margin-top: 8px;
            display: flex;
            gap: 15px;
        }
        .tf-item .tf-options .tf-opt {
            padding: 5px 20px;
            border: 2px solid #ccc;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s;
            user-select: none;
        }
        .tf-item .tf-options .tf-opt:hover {
            border-color: #27ae60;
            background: #f0fff0;
        }
        .tf-item .tf-options .tf-opt.selected {
            border-color: #27ae60;
            background: #27ae60;
            color: #fff;
            font-weight: bold;
        }
        .tf-item.wrong {
            background: #fff0f0 !important;
            border-left-color: #e74c3c !important;
            box-shadow: 0 0 0 2px rgba(231,76,60,0.2);
        }
        .tf-item.correct-graded {
            background: #f0fff0 !important;
        }
        .tf-item .correct-answer-tag {
            display: none;
            margin-top: 8px;
            padding: 4px 12px;
            background: #27ae60;
            color: #fff;
            border-radius: 5px;
            font-size: 13px;
            font-weight: bold;
        }
        .tf-item.wrong .correct-answer-tag { display: inline-block; }
        .tf-item .btn-copy {
            display: none;
            position: absolute;
            top: 10px;
            right: 10px;
            background: #e74c3c;
            color: #fff;
            border: none;
            padding: 4px 14px;
            font-size: 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.15s;
        }
        .tf-item .btn-copy:hover { background: #c0392b; }
        .tf-item .btn-copy.copied { background: #27ae60; }
        .tf-item.wrong .btn-copy { display: block; }
        .prog-section {
            margin: 20px 0;
            padding: 20px;
            background: #fdf9f0;
            border: 1px solid #f0d9a0;
            border-radius: 8px;
        }
        .prog-section h3 {
            color: #b8860b;
            margin-bottom: 10px;
            font-size: 17px;
        }
        .prog-section .label {
            font-weight: bold;
            color: #8b6914;
            margin-top: 12px;
        }
        .sample-box {
            display: flex;
            gap: 40px;
            margin: 10px 0;
            flex-wrap: wrap;
        }
        .sample-box .sample {
            flex: 1;
            min-width: 200px;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 10px 15px;
        }
        .sample-box .sample h4 {
            font-size: 13px;
            color: #888;
            margin-bottom: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #eee;
            color: #999;
            font-size: 12px;
        }
        .blank { color: #c0392b; font-weight: bold; }
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        .modal-overlay.show { display: flex; }
        .modal-box {
            background: #fff;
            border-radius: 12px;
            padding: 30px 35px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            text-align: center;
            animation: modalIn 0.25s ease;
        }
        @keyframes modalIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        .modal-box h3 {
            font-size: 20px;
            color: #e67e22;
            margin-bottom: 15px;
        }
        .modal-box .missing-list {
            text-align: left;
            max-height: 200px;
            overflow-y: auto;
            background: #fdf6ec;
            padding: 10px 15px;
            border-radius: 6px;
            margin: 10px 0;
            font-size: 14px;
            color: #e67e22;
        }
        .modal-box .modal-note {
            font-size: 13px;
            color: #888;
            margin: 10px 0;
        }
        .modal-box button {
            background: linear-gradient(135deg, #e67e22, #f39c12);
            color: #fff;
            border: none;
            padding: 10px 40px;
            font-size: 15px;
            border-radius: 25px;
            cursor: pointer;
            margin-top: 10px;
            font-weight: bold;
        }
        .modal-box button:hover { opacity: 0.9; }
        .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: #fff;
            padding: 10px 25px;
            border-radius: 25px;
            font-size: 14px;
            z-index: 2000;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .toast.show { opacity: 1; }
"""

JS = """
// ========== Selection logic ==========
function selectOpt(el) {
    const siblings = el.parentElement.querySelectorAll('.opt');
    siblings.forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
}

function selectTF(el) {
    const siblings = el.parentElement.querySelectorAll('.tf-opt');
    siblings.forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
}

// ========== Get user answers ==========
function getUserAnswers() {
    const answers = {};
    document.querySelectorAll('.question[data-qtype="choice"]').forEach(q => {
        const num = q.dataset.qnum;
        const sel = q.querySelector('.opt.selected');
        answers[num] = sel ? sel.dataset.val : null;
    });
    document.querySelectorAll('.tf-item[data-qtype="tf"]').forEach(q => {
        const num = q.dataset.qnum;
        const sel = q.querySelector('.tf-opt.selected');
        answers[num] = sel ? sel.dataset.val : null;
    });
    return answers;
}

// ========== Grading ==========
let missingCallback = null;

function closeMissingModal(proceed) {
    document.getElementById('missingModal').classList.remove('show');
    if (proceed && missingCallback) missingCallback();
    missingCallback = null;
}

function gradeExam() {
    document.querySelectorAll('.question, .tf-item').forEach(el => {
        el.classList.remove('wrong', 'correct-graded');
    });

    const answers = getUserAnswers();

    const missing = [];
    document.querySelectorAll('.question[data-qtype="choice"]').forEach(q => {
        if (!answers[q.dataset.qnum]) missing.push('单选第 ' + q.dataset.qnum + ' 题');
    });
    document.querySelectorAll('.tf-item[data-qtype="tf"]').forEach((q, idx) => {
        if (!answers[q.dataset.qnum]) missing.push('判断第 ' + (idx + 1) + ' 题');
    });

    const doGrade = () => {
        let choiceScore = 0, tfScore = 0;

        document.querySelectorAll('.question[data-qtype="choice"]').forEach(q => {
            const num = q.dataset.qnum;
            const correct = q.dataset.answer;
            const user = answers[num];
            const tag = q.querySelector('.correct-answer-tag');
            if (user === null) {
                q.classList.add('wrong');
                const correctOpt = q.querySelector('.opt[data-val="'+correct+'"]');
                const correctText = correctOpt ? correctOpt.textContent.trim() : correct;
                tag.innerHTML = '✅ 正确答案：' + correct + '. ' + correctText.substring(correctText.indexOf('.')+1).trim() + '（未作答）';
                tag.style.display = 'inline-block';
                return;
            }
            if (user === correct) {
                choiceScore += 2;
                q.classList.add('correct-graded');
                tag.style.display = 'none';
            } else {
                q.classList.add('wrong');
                const correctOpt = q.querySelector('.opt[data-val="'+correct+'"]');
                const correctText = correctOpt ? correctOpt.textContent.trim() : correct;
                tag.innerHTML = '✅ 正确答案：' + correct + '. ' + correctText.substring(correctText.indexOf('.')+1).trim();
                tag.style.display = 'inline-block';
            }
        });

        document.querySelectorAll('.tf-item[data-qtype="tf"]').forEach(q => {
            const num = q.dataset.qnum;
            const correct = q.dataset.answer;
            const user = answers[num];
            const tag = q.querySelector('.correct-answer-tag');
            if (user === null) {
                q.classList.add('wrong');
                tag.innerHTML = '✅ 正确答案：' + (correct === 'A' ? '正确 ✔' : '错误 ✘') + '（未作答）';
                tag.style.display = 'inline-block';
                return;
            }
            if (user === correct) {
                tfScore += 2;
                q.classList.add('correct-graded');
                tag.style.display = 'none';
            } else {
                q.classList.add('wrong');
                tag.innerHTML = '✅ 正确答案：' + (correct === 'A' ? '正确 ✔' : '错误 ✘');
                tag.style.display = 'inline-block';
            }
        });

        const total = choiceScore + tfScore;

        document.getElementById('scoreChoice').textContent = choiceScore + ' 分';
        document.getElementById('scoreTF').textContent = tfScore + ' 分';
        document.getElementById('scoreProg').textContent = '—';
        document.getElementById('scoreTotal').textContent = total + ' / 50 分';

        const disp = document.getElementById('scoreDisplay');
        let emoji = total >= 40 ? '🎉' : total >= 25 ? '💪' : '📖';
        disp.innerHTML = emoji + ' 选择 + 判断得分：<span class="big-score">' + total + '</span> / 50 分（编程题需线下评测）';
        disp.style.display = 'block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (missing.length > 0) {
        document.getElementById('missingList').innerHTML =
            missing.map(m => '• ' + m).join('<br>');
        document.getElementById('missingModal').classList.add('show');
        missingCallback = doGrade;
    } else {
        doGrade();
    }
}

// ========== Copy to clipboard ==========
function copyQuestion(btn) {
    const container = btn.closest('.question') || btn.closest('.tf-item');
    if (!container) return;

    let text = '';
    const qtype = container.dataset.qtype;
    const correct = container.dataset.answer;

    if (qtype === 'choice') {
        const qText = container.querySelector('.q-text').textContent;
        text += qText + '\\n';
        const pre = container.querySelector('pre');
        if (pre) text += '\\n' + pre.textContent.trim() + '\\n';
        text += '\\n';
        container.querySelectorAll('.opt').forEach(opt => {
            const optText = opt.textContent.trim();
            const sel = opt.classList.contains('selected');
            text += (sel ? '→ ' : '  ') + optText + '\\n';
        });
        const userSel = container.querySelector('.opt.selected');
        const userAns = userSel ? userSel.dataset.val : '未作答';
        text += '\\n❌ 我的答案：' + userAns;
        const correctOpt = container.querySelector('.opt[data-val="'+correct+'"]');
        const correctLabel = correctOpt ? correctOpt.textContent.trim() : correct;
        text += '\\n✅ 正确答案：' + correctLabel + '\\n';
    } else {
        const tfText = container.querySelector('.tf-text').textContent;
        text += tfText + '\\n';
        const pre = container.querySelector('pre');
        if (pre) text += '\\n' + pre.textContent.trim() + '\\n';
        const userSel = container.querySelector('.tf-opt.selected');
        const userAns = userSel ? (userSel.dataset.val === 'A' ? '正确' : '错误') : '未作答';
        const correctAns = correct === 'A' ? '正确' : '错误';
        text += '\\n❌ 我的答案：' + userAns;
        text += '\\n✅ 正确答案：' + correctAns + '\\n';
    }

    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ 已复制';
        btn.classList.add('copied');
        showToast('已复制到剪贴板，可粘贴到错题本');
        setTimeout(() => {
            btn.textContent = '📋 复制到错题本';
            btn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '✅ 已复制';
        btn.classList.add('copied');
        showToast('已复制到剪贴板');
        setTimeout(() => {
            btn.textContent = '📋 复制到错题本';
            btn.classList.remove('copied');
        }, 2000);
    });
}

function showToast(msg) {
    const t = document.getElementById('copyToast');
    t.textContent = '✅ ' + msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}
"""


def extract_blocks(html, class_name):
    """Extract all <div class="CLASS" ...> ... </div> top-level blocks by
    balanced-brace scanning (divs can nest, e.g. question-card containing
    option divs)."""
    blocks = []
    pattern = re.compile(r'<div class="' + re.escape(class_name) + r'"[^>]*>')
    for m in pattern.finditer(html):
        start = m.start()
        # find matching closing div by counting nested <div and </div>
        depth = 0
        pos = m.end()
        # count the opening div itself
        depth = 1
        tag_re = re.compile(r'<div\b|</div>')
        for tm in tag_re.finditer(html, pos):
            if tm.group() == '</div>':
                depth -= 1
            else:
                depth += 1
            if depth == 0:
                blocks.append(html[start:tm.end()])
                break
    return blocks


def parse_choice_question(block, num):
    """block is a question-card div with data-qtype=choice"""
    answer = re.search(r'data-answer="([A-Z])"', block).group(1)
    qtext_m = re.search(r'<div class="q-text">(.*?)</div>\s*(?:<pre>(.*?)</pre>)?',
                         block, re.DOTALL)
    text_raw = qtext_m.group(1).strip()
    pre_raw = qtext_m.group(2)
    # strip leading "N. " numbering since template re-numbers
    text_raw = re.sub(r'^\d+\.\s*', '', text_raw).strip()

    options = re.findall(r'<div class="option"[^>]*>(.*?)</div>', block)
    return {
        'num': num,
        'text': text_raw,
        'pre': pre_raw,
        'options': options,  # each like "A. xxx"
        'answer': answer,
    }


def parse_tf_question(block, num):
    answer_raw = re.search(r'data-answer="([TF])"', block).group(1)
    answer = 'A' if answer_raw == 'T' else 'B'
    qtext_m = re.search(r'<div class="q-text">(.*?)</div>', block, re.DOTALL)
    text_raw = qtext_m.group(1).strip()
    text_raw = re.sub(r'^\d+\.\s*', '', text_raw).strip()
    return {'num': num, 'text': text_raw, 'answer': answer}


def render_choice(q, display_num):
    opt_html = []
    for opt in q['options']:
        m = re.match(r'^([A-D])\.\s*(.*)$', opt.strip(), re.DOTALL)
        val, label = m.group(1), m.group(2)
        opt_html.append(
            f'            <div class="opt" data-val="{val}" onclick="selectOpt(this)">'
            f'<span class="radio-dot"></span>{val}. {label}</div>'
        )
    pre_html = f'<pre>{q["pre"]}</pre>\n' if q.get('pre') else ''
    return f'''    <div class="question" data-qtype="choice" data-qnum="{display_num}" data-answer="{q['answer']}">
        <button class="btn-copy" onclick="copyQuestion(this)">📋 复制到错题本</button>
        <div class="q-text">{display_num}. {q['text']}</div>
{pre_html}        <div class="options">
{chr(10).join(opt_html)}
        </div>
            <div class="correct-answer-tag"></div>
    </div>
'''


def render_tf(q, display_num, seq_num):
    return f'''    <div class="tf-item" data-qtype="tf" data-qnum="{display_num}" data-answer="{q['answer']}">
        <button class="btn-copy" onclick="copyQuestion(this)">📋 复制到错题本</button>
        <div class="tf-text">{seq_num}. {q['text']}</div>
        <div class="tf-options">
            <div class="tf-opt" data-val="A" onclick="selectTF(this)">✔ 正确</div>
            <div class="tf-opt" data-val="B" onclick="selectTF(this)">✘ 错误</div>
        </div>
            <div class="correct-answer-tag"></div>
    </div>
'''


def convert_programming_blocks(html):
    """Extract the two programming question-card blocks (no data-qtype attr,
    identified by containing '编程题' in q-text) and wrap each into a
    .prog-section, converting internal <p><strong>样例输入N：</strong></p><pre>...
    pairs into sample-box layout where possible; otherwise keep simple."""
    blocks = extract_blocks(html, 'question-card')
    prog_blocks = [b for b in blocks if 'data-qtype' not in b]
    rendered = []
    for i, b in enumerate(prog_blocks, 1):
        title_m = re.search(r'<strong>(.*?)</strong>', b)
        title = title_m.group(1) if title_m else f'编程题{i}'
        title = re.sub(r'（\d+分）', '', title).strip()
        # strip any leading "编程题N：" / "编程题 N：" prefix so we don't duplicate it
        title = re.sub(r'^编程题\s*\d*[：:]\s*', '', title).strip()

        # grab inner content minus outer div and the title line
        inner = re.sub(r'^<div class="question-card">\s*<div class="q-text"><strong>.*?</strong></div>\s*', '', b, flags=re.DOTALL)
        inner = re.sub(r'</div>\s*$', '', inner.strip())

        # Try to pair up 样例输入/样例输出 into sample-box rows
        # Find all <p><strong>样例输入X：</strong></p><pre>...</pre> and
        # <p><strong>样例输出X：</strong></p><pre>...</pre>
        sample_pattern = re.compile(
            r'<p><strong>(样例输入\d*)：</strong></p>\s*<pre>(.*?)</pre>\s*'
            r'<p><strong>(样例输出\d*)：</strong></p>\s*<pre>(.*?)</pre>',
            re.DOTALL
        )

        def sample_repl(m):
            in_label, in_val, out_label, out_val = m.groups()
            return (f'<div class="sample-box">\n'
                     f'    <div class="sample"><h4>{in_label}</h4><pre>{in_val}</pre></div>\n'
                     f'    <div class="sample"><h4>{out_label}</h4><pre>{out_val}</pre></div>\n'
                     f'</div>')

        inner = sample_pattern.sub(sample_repl, inner)
        # Turn remaining <p><strong>X：</strong></p> into <p class="label">X：</p>
        inner = re.sub(r'<p><strong>(.*?：)</strong></p>', r'<p class="label">\1</p>', inner)

        rendered.append(f'''    <div class="prog-section">
        <h3>编程题 {i}：{title}</h3>
{inner}
    </div>
''')
    return rendered


def convert_exam(exam_num):
    outdir = os.path.join(EXAM_DIR, f'exam_{exam_num:02d}')
    infile = os.path.join(outdir, f'mock_exam_{exam_num:02d}.html')
    with open(infile, 'r', encoding='utf-8') as f:
        html = f.read()

    blocks = extract_blocks(html, 'question-card')
    choice_blocks = [b for b in blocks if 'data-qtype="choice"' in b]
    tf_blocks = [b for b in blocks if 'data-qtype="tf"' in b]

    choice_qs = [parse_choice_question(b, i + 1) for i, b in enumerate(choice_blocks)]
    tf_qs = [parse_tf_question(b, i + 1) for i, b in enumerate(tf_blocks)]

    prog_sections = convert_programming_blocks(html)

    # difficulty label, if present in original subtitle
    diff_m = re.search(r'难度：([^<]+)</p>', html)
    difficulty = diff_m.group(1).strip() if diff_m else '中等'

    choice_html = '\n'.join(render_choice(q, q['num']) for q in choice_qs)
    tf_html = '\n'.join(
        render_tf(q, q['num'] + 15, idx + 1) for idx, q in enumerate(tf_qs)
    )
    prog_html = '\n'.join(prog_sections)

    total_choice = len(choice_qs)
    total_tf = len(tf_qs)

    doc = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GESP C++三级模拟试卷（第{exam_num}套）</title>
    <style>{CSS}    </style>
</head>
<body>
<div class="container">

    <div class="header">
        <div class="logo-line">
            <span class="badge">GESP</span>
            <span style="font-size:16px; color:#1a5276; font-weight:bold;">CCF 编程能力等级认证</span>
        </div>
        <div class="subtitle">Grade Examination of Software Programming</div>
        <h1>C++ 三级 · 模拟试卷（第{exam_num}套）</h1>
        <div class="exam-info-row">
            <span class="exam-info">考试时间：90 分钟 &nbsp;|&nbsp; 满分：100 分 &nbsp;|&nbsp; 难度：{difficulty}</span>
            <button class="btn-grade" onclick="gradeExam()">📝 判 卷</button>
        </div>
        <div class="score-display" id="scoreDisplay"></div>
    </div>

    <table class="score-table">
        <tr><th>题型</th><th>单选题</th><th>判断题</th><th>编程题</th><th>总分</th></tr>
        <tr><td>分值</td><td>{total_choice*2} 分</td><td>{total_tf*2} 分</td><td>50 分</td><td>100 分</td></tr>
        <tr>
            <td>得分</td>
            <td id="scoreChoice" class="scored">—</td>
            <td id="scoreTF" class="scored">—</td>
            <td id="scoreProg" class="scored">—</td>
            <td id="scoreTotal" class="scored">—</td>
        </tr>
    </table>

    <div class="section-title">
        <span>一、单选题</span><span>（每题 2 分，共 {total_choice*2} 分）</span>
    </div>

{choice_html}

    <div class="section-title">
        <span>二、判断题</span><span>（每题 2 分，共 {total_tf*2} 分）</span>
    </div>

{tf_html}

    <div class="section-title">
        <span>三、编程题</span><span>（每题 25 分，共 50 分）</span>
    </div>

{prog_html}

    <div class="footer">
        GESP C++ 三级模拟试卷（第{exam_num}套） · 本试卷仅供练习使用
    </div>
</div>

<div class="modal-overlay" id="missingModal">
    <div class="modal-box">
        <h3>⚠️ 有题目未完成</h3>
        <div class="missing-list" id="missingList"></div>
        <div class="modal-note">未作答的题目将不计分，仅对已完成的题目判分。</div>
        <button onclick="closeMissingModal(true)">继续判卷</button>
        &nbsp;
        <button onclick="closeMissingModal(false)" style="background:linear-gradient(135deg,#95a5a6,#bdc3c7);">返回答题</button>
    </div>
</div>

<div class="toast" id="copyToast">✅ 已复制到剪贴板</div>

<script>{JS}</script>
</body>
</html>
'''
    with open(infile, 'w', encoding='utf-8') as f:
        f.write(doc)
    print(f'Restyled exam_{exam_num:02d}/mock_exam_{exam_num:02d}.html '
          f'({total_choice} choice, {total_tf} tf, {len(prog_sections)} prog)')


if __name__ == '__main__':
    for n in range(1, 11):
        convert_exam(n)
