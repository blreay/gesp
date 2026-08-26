#!/usr/bin/env python3
"""Generate GESP C++ Level 3 interactive HTML exam from JSON specification."""
import json
import sys
import os

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GESP C++ 三级模拟试卷（第{exam_num}套）</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Microsoft YaHei', sans-serif; background: #f5f7fa; padding: 20px; line-height: 1.6; }}
.header {{ background: linear-gradient(135deg, #1a237e, #7b1fa2); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; text-align: center; }}
.header h1 {{ font-size: 24px; margin-bottom: 10px; }}
.header p {{ font-size: 14px; opacity: 0.9; }}
.score-table {{ margin: 15px auto; border-collapse: collapse; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }}
.score-table th, .score-table td {{ padding: 8px 16px; border: 1px solid rgba(255,255,255,0.3); text-align: center; }}
.btn-grade {{ background: #ff9800; color: white; border: none; padding: 12px 36px; font-size: 18px; border-radius: 25px; cursor: pointer; margin-top: 15px; font-weight: bold; }}
.btn-grade:hover {{ background: #f57c00; }}
.section-title {{ background: #1a237e; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 18px; margin-top: 30px; }}
.question-card {{ background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }}
.question-card.correct {{ background: #e8f5e9; border-left: 4px solid #4caf50; }}
.question-card.wrong {{ background: #ffebee; border-left: 4px solid #f44336; }}
.q-text {{ font-size: 15px; margin-bottom: 12px; font-weight: 500; }}
pre, code {{ font-family: 'Courier New', Consolas, monospace; }}
pre {{ background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0; font-size: 13px; }}
.option {{ padding: 10px 15px; margin: 5px 0; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; transition: all 0.2s; }}
.option:hover {{ border-color: #7b1fa2; background: #f3e5f5; }}
.option.selected {{ border-color: #7b1fa2; background: #e8d5f5; font-weight: bold; }}
.tf-options {{ display: flex; gap: 15px; margin-top: 10px; }}
.tf-btn {{ padding: 10px 30px; border-radius: 25px; border: 2px solid #e0e0e0; cursor: pointer; font-size: 15px; transition: all 0.2s; }}
.tf-btn:hover {{ border-color: #1a237e; }}
.tf-btn.selected {{ background: #1a237e; color: white; border-color: #1a237e; }}
.correct-tag {{ display: none; margin-top: 10px; padding: 8px 12px; background: #4caf50; color: white; border-radius: 6px; font-size: 13px; }}
.btn-copy {{ display: none; margin-top: 8px; padding: 6px 16px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }}
.btn-copy:hover {{ background: #1976d2; }}
.score-display {{ display: none; text-align: center; font-size: 24px; margin: 20px 0; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }}
.toast {{ position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #333; color: white; padding: 12px 24px; border-radius: 25px; display: none; z-index: 9999; }}
</style>
</head>
<body>

<div class="header">
    <h1>GESP C++ 三级模拟试卷（第{exam_num}套）</h1>
    <p>满分：100分 | 考试时间：90分钟 | 难度：{difficulty}</p>
    <table class="score-table">
        <tr><th>题型</th><th>单选题</th><th>判断题</th><th>编程题</th><th>总分</th></tr>
        <tr><td>分值</td><td>15×2=30分</td><td>10×2=20分</td><td>2×25=50分</td><td>100分</td></tr>
    </table>
    <button class="btn-grade" onclick="gradeExam()">判 卷</button>
</div>

<div class="score-display" id="scoreDisplay"></div>

<!-- 单选题 -->
<div class="section-title">一、单选题（每题2分，共30分）</div>

{choice_questions}

<!-- 判断题 -->
<div class="section-title">二、判断题（每题2分，共20分）</div>

{tf_questions}

<!-- 编程题 -->
<div class="section-title">三、编程题（每题25分，共50分）</div>

{prog_questions}

<div class="toast" id="toast"></div>

<script>
function selectOpt(el) {{
    var siblings = el.parentElement.querySelectorAll('.option');
    siblings.forEach(function(s) {{ s.classList.remove('selected'); }});
    el.classList.add('selected');
}}

function selectTF(el) {{
    var siblings = el.parentElement.querySelectorAll('.tf-btn');
    siblings.forEach(function(s) {{ s.classList.remove('selected'); }});
    el.classList.add('selected');
}}

function gradeExam() {{
    var questions = document.querySelectorAll('.question-card[data-qnum]');
    var unanswered = [];
    questions.forEach(function(q) {{
        var qnum = q.getAttribute('data-qnum');
        var qtype = q.getAttribute('data-qtype');
        var answered = false;
        if (qtype === 'choice') {{
            answered = q.querySelector('.option.selected') !== null;
        }} else {{
            answered = q.querySelector('.tf-btn.selected') !== null;
        }}
        if (!answered) unanswered.push(qnum);
    }});

    if (unanswered.length > 0) {{
        alert('以下题目尚未作答：第 ' + unanswered.join(', ') + ' 题\\n请完成所有题目后再判卷。');
        return;
    }}

    var score = 0;
    questions.forEach(function(q) {{
        var qtype = q.getAttribute('data-qtype');
        var answer = q.getAttribute('data-answer');
        var userAnswer = '';

        if (qtype === 'choice') {{
            var sel = q.querySelector('.option.selected');
            if (sel) userAnswer = sel.textContent.charAt(0);
        }} else {{
            var sel = q.querySelector('.tf-btn.selected');
            if (sel) userAnswer = sel.textContent === '对' ? 'T' : 'F';
        }}

        var correct = (userAnswer === answer);
        if (correct) {{
            score += 2;
            q.classList.add('correct');
            q.classList.remove('wrong');
        }} else {{
            q.classList.add('wrong');
            q.classList.remove('correct');
            q.querySelector('.correct-tag').style.display = 'block';
            q.querySelector('.correct-tag').textContent = '正确答案：' + answer;
            q.querySelector('.btn-copy').style.display = 'inline-block';
        }}
    }});

    var display = document.getElementById('scoreDisplay');
    display.style.display = 'block';
    display.innerHTML = '<h2>选择题和判断题得分：' + score + ' / 50 分</h2><p>（编程题需另行评判，满分50分）</p>';
    display.scrollIntoView({{behavior: 'smooth'}});
}}

function copyQuestion(btn) {{
    var card = btn.closest('.question-card');
    var text = card.querySelector('.q-text').textContent;
    var options = card.querySelectorAll('.option');
    var tfBtns = card.querySelectorAll('.tf-btn');
    var copyText = text + '\\n';

    if (options.length > 0) {{
        options.forEach(function(o) {{ copyText += o.textContent + '\\n'; }});
        var sel = card.querySelector('.option.selected');
        copyText += '我的答案：' + (sel ? sel.textContent.charAt(0) : '未答') + '\\n';
    }} else if (tfBtns.length > 0) {{
        var sel = card.querySelector('.tf-btn.selected');
        copyText += '我的答案：' + (sel ? sel.textContent : '未答') + '\\n';
    }}
    copyText += '正确答案：' + card.getAttribute('data-answer') + '\\n';

    navigator.clipboard.writeText(copyText).then(function() {{
        showToast('已复制到剪贴板');
    }});
}}

function showToast(msg) {{
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(function() {{ toast.style.display = 'none'; }}, 2000);
}}
</script>
</body>
</html>'''

def generate_choice_html(questions):
    html = ""
    for i, q in enumerate(questions, 1):
        text = q["text"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if "code" in q:
            text += f'\n<pre>{q["code"]}</pre>'
        options_html = ""
        for opt in q["options"]:
            options_html += f'    <div class="option" onclick="selectOpt(this)">{opt}</div>\n'
        html += f'''<div class="question-card" data-qtype="choice" data-qnum="{i}" data-answer="{q['answer']}">
    <div class="q-text">{i}. {text}</div>
{options_html}    <div class="correct-tag"></div>
    <button class="btn-copy" onclick="copyQuestion(this)">复制到错题本</button>
</div>

'''
    return html

def generate_tf_html(questions, start_num=16):
    html = ""
    for i, q in enumerate(questions, start_num):
        text = q["text"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        html += f'''<div class="question-card" data-qtype="tf" data-qnum="{i}" data-answer="{q['answer']}">
    <div class="q-text">{i}. {text}</div>
    <div class="tf-options">
        <div class="tf-btn" onclick="selectTF(this)">对</div>
        <div class="tf-btn" onclick="selectTF(this)">错</div>
    </div>
    <div class="correct-tag"></div>
    <button class="btn-copy" onclick="copyQuestion(this)">复制到错题本</button>
</div>

'''
    return html

def generate_prog_html(problems):
    html = ""
    for i, p in enumerate(problems, 1):
        html += f'''<div class="question-card">
    <div class="q-text"><strong>编程题{i}：{p["title"]}（25分）</strong></div>
    <p><strong>题目描述：</strong></p>
    <p>{p["description"]}</p>
    <p><strong>输入格式：</strong></p>
    <p>{p["input_format"]}</p>
    <p><strong>输出格式：</strong></p>
    <p>{p["output_format"]}</p>
    <p><strong>样例输入：</strong></p>
    <pre>{p["sample_input"]}</pre>
    <p><strong>样例输出：</strong></p>
    <pre>{p["sample_output"]}</pre>
'''
        if "explanation" in p:
            html += f'    <p><strong>解释：</strong>{p["explanation"]}</p>\n'
        html += '</div>\n\n'
    return html

def generate_answers_html(exam_num, choice_qs, tf_qs, prog_solutions):
    choice_answers = "".join(f"<td>{q['answer']}</td>" for q in choice_qs)
    tf_answers = "".join(f"<td>{'√' if q['answer']=='T' else '×'}</td>" for q in tf_qs)

    explanations = ""
    for i, q in enumerate(choice_qs, 1):
        explanations += f"<p><strong>{i}.</strong> 答案{q['answer']}。{q.get('explanation','')}</p>\n"
    for i, q in enumerate(tf_qs, 16):
        ans = "对" if q['answer']=='T' else "错"
        explanations += f"<p><strong>{i}.</strong> {ans}。{q.get('explanation','')}</p>\n"

    prog_html = ""
    for i, sol in enumerate(prog_solutions, 1):
        prog_html += f"<h3>编程题{i}参考代码</h3>\n<pre>{sol}</pre>\n"

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>GESP C++ 三级模拟试卷（第{exam_num}套）- 参考答案</title>
<style>
body {{ font-family: 'Microsoft YaHei', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.8; }}
h1 {{ color: #1a237e; border-bottom: 2px solid #7b1fa2; padding-bottom: 10px; }}
table {{ border-collapse: collapse; margin: 15px 0; }}
th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: center; }}
th {{ background: #1a237e; color: white; }}
pre {{ background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 13px; }}
h2 {{ color: #7b1fa2; margin-top: 30px; }}
h3 {{ color: #1a237e; margin-top: 20px; }}
</style>
</head>
<body>
<h1>GESP C++ 三级模拟试卷（第{exam_num}套）- 参考答案</h1>

<h2>一、单选题答案</h2>
<table>
<tr><th>题号</th>{"".join(f"<th>{i}</th>" for i in range(1,16))}</tr>
<tr><td>答案</td>{choice_answers}</tr>
</table>

<h2>二、判断题答案</h2>
<table>
<tr><th>题号</th>{"".join(f"<th>{i}</th>" for i in range(1,11))}</tr>
<tr><td>答案</td>{tf_answers}</tr>
</table>

<h2>详细解析</h2>
{explanations}

<h2>三、编程题参考答案</h2>
{prog_html}
</body>
</html>'''

def generate_exam(spec_file):
    with open(spec_file, 'r', encoding='utf-8') as f:
        spec = json.load(f)

    exam_num = spec["exam_num"]
    difficulty = spec.get("difficulty", "中等偏上")

    choice_html = generate_choice_html(spec["choice_questions"])
    tf_html = generate_tf_html(spec["tf_questions"])
    prog_html = generate_prog_html(spec["programming"])

    exam_html = HTML_TEMPLATE.format(
        exam_num=exam_num,
        difficulty=difficulty,
        choice_questions=choice_html,
        tf_questions=tf_html,
        prog_questions=prog_html
    )

    outdir = f"exam_{exam_num:02d}"
    os.makedirs(outdir, exist_ok=True)

    with open(f"{outdir}/mock_exam_{exam_num:02d}.html", 'w', encoding='utf-8') as f:
        f.write(exam_html)

    answers_html = generate_answers_html(
        exam_num, spec["choice_questions"], spec["tf_questions"],
        spec.get("solutions", ["// 参考代码请见测试程序"] * 2)
    )
    with open(f"{outdir}/mock_exam_{exam_num:02d}_answers.html", 'w', encoding='utf-8') as f:
        f.write(answers_html)

    print(f"Generated exam_{exam_num:02d}/mock_exam_{exam_num:02d}.html")
    print(f"Generated exam_{exam_num:02d}/mock_exam_{exam_num:02d}_answers.html")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 generate_exam.py <spec.json>")
        sys.exit(1)
    generate_exam(sys.argv[1])
