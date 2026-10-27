#!/usr/bin/env python3
"""Insert a '配套测试程序' note with a link to the matching test_XX_progN.cpp
right before the closing </div> of each .prog-section block, for every exam."""
import re
import os

EXAM_DIR = os.path.dirname(os.path.abspath(__file__))

NOTE_TMPL = (
    '        <p class="test-note">🧪 配套测试程序：'
    '<a href="test_{exam:02d}_prog{n}.cpp">test_{exam:02d}_prog{n}.cpp</a>'
    '（编译考生程序后，运行 <code>./test_{exam:02d}_prog{n} 考生程序路径</code> 即可自动验证）</p>\n'
)

CSS_RULE = """
        .prog-section .test-note {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed #e0c98a;
            font-size: 13px;
            color: #8b6914;
        }
        .prog-section .test-note a {
            color: #b8860b;
            font-weight: bold;
            text-decoration: none;
        }
        .prog-section .test-note a:hover { text-decoration: underline; }
        .prog-section .test-note code {
            background: #fff8ea;
            padding: 1px 5px;
            border-radius: 3px;
        }
"""


def find_prog_sections(html):
    """Return list of (start, end) char spans for each top-level
    <div class="prog-section">...</div> block, via balanced-tag scan."""
    spans = []
    for m in re.finditer(r'<div class="prog-section">', html):
        start = m.start()
        depth = 1
        tag_re = re.compile(r'<div\b|</div>')
        for tm in tag_re.finditer(html, m.end()):
            if tm.group() == '</div>':
                depth -= 1
            else:
                depth += 1
            if depth == 0:
                spans.append((start, tm.end()))
                break
    return spans


def process_exam(exam_num):
    path = os.path.join(EXAM_DIR, f'exam_{exam_num:02d}', f'mock_exam_{exam_num:02d}.html')
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    if 'test-note' in html:
        print(f'exam_{exam_num:02d}: already has test-note, skipping')
        return

    spans = find_prog_sections(html)
    if len(spans) != 2:
        print(f'exam_{exam_num:02d}: expected 2 prog-sections, found {len(spans)} — skipping')
        return

    # Insert CSS rule before closing </style>
    html = html.replace('    </style>', CSS_RULE + '    </style>', 1)
    # recompute spans since html length changed due to CSS insertion (CSS is before all prog sections, offsets shift uniformly)
    shift = len(CSS_RULE)
    spans = [(s + shift, e + shift) for s, e in spans]

    # Insert notes from last to first so earlier offsets stay valid
    for n, (start, end) in reversed(list(enumerate(spans, 1))):
        note = NOTE_TMPL.format(exam=exam_num, n=n)
        insert_pos = end - len('</div>')
        html = html[:insert_pos] + note + '    ' + html[insert_pos:]

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'exam_{exam_num:02d}: inserted 2 test-note links')


if __name__ == '__main__':
    for n in range(1, 11):
        process_exam(n)
