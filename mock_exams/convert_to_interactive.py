#!/usr/bin/env python3
"""
Convert non-interactive GESP mock exam HTML files to interactive versions.

Reads exam_01/mock_exam_01.html as the reference (already converted),
extracts its CSS, JS, modal/toast HTML blocks, and uses them as templates
to convert exam_02 through exam_10.

For each exam:
  1. Parse the answers from exam_XX/mock_exam_XX_answers.html
  2. Transform exam_XX/mock_exam_XX.html into an interactive version
  3. Write back to the same file

Usage:
    python3 convert_to_interactive.py
"""

import os
import re
import sys
from bs4 import BeautifulSoup, Comment

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def extract_reference_blocks(ref_path):
    """Extract CSS, JS, modal, toast, and structural blocks from the reference exam_01."""
    with open(ref_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Extract the full <style>...</style> block
    style_match = re.search(r'<style>.*?</style>', html, re.DOTALL)
    style_block = style_match.group(0) if style_match else ''

    # Extract the full <script>...</script> block
    script_match = re.search(r'<script>.*?</script>', html, re.DOTALL)
    script_block = script_match.group(0) if script_match else ''

    # Extract modal HTML (from <!-- Missing-question modal --> to end of modal div)
    modal_match = re.search(
        r'<!-- Missing-question modal -->.*?</div>\s*</div>',
        html, re.DOTALL
    )
    modal_block = modal_match.group(0) if modal_match else ''

    # Extract toast HTML
    toast_match = re.search(
        r'<!-- Copy toast -->.*?</div>',
        html, re.DOTALL
    )
    toast_block = toast_match.group(0) if toast_match else ''

    return style_block, script_block, modal_block, toast_block


def extract_answers(answer_path):
    """
    Extract answers from the answer HTML file.
    Returns (choice_answers, tf_answers) where:
      - choice_answers is a list of 15 letters (A/B/C/D)
      - tf_answers is a list of 10 letters (A=correct, B=wrong)
    """
    with open(answer_path, 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table', class_='ans-table')

    if len(tables) < 2:
        raise ValueError(f"Expected at least 2 ans-table in {answer_path}, found {len(tables)}")

    # First table: choice answers
    choice_table = tables[0]
    choice_cells = choice_table.find_all('td', class_='ans')
    choice_answers = [cell.get_text(strip=True) for cell in choice_cells]

    # Second table: true/false answers
    tf_table = tables[1]
    tf_cells = tf_table.find_all('td', class_='ans')
    tf_answers_raw = [cell.get_text(strip=True) for cell in tf_cells]

    # Map checkmark/cross to A/B
    tf_answers = []
    for ans in tf_answers_raw:
        # Handle various representations of checkmark and cross
        if ans in ('✓', '✔', '√', '√'):  # checkmark variants
            tf_answers.append('A')
        elif ans in ('✗', '✘', '×', '×', '✖'):  # cross variants
            tf_answers.append('B')
        else:
            # Fallback: if it's already A or B
            tf_answers.append(ans)

    return choice_answers, tf_answers


def extract_opt_letter(opt_html):
    """
    Extract the option letter (A/B/C/D) from an option div's content.
    Handles cases like:
      "A. 1936"
      "A. <code>student_name</code>"
    """
    # Get the text content, stripping HTML tags
    text = re.sub(r'<[^>]+>', '', opt_html).strip()
    match = re.match(r'^([A-D])\.', text)
    if match:
        return match.group(1)
    return None


def convert_exam(exam_path, choice_answers, tf_answers,
                 style_block, script_block, modal_block, toast_block):
    """Convert a non-interactive exam HTML to interactive version."""
    with open(exam_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Step 1: Replace the entire <style>...</style> block
    html = re.sub(r'<style>.*?</style>', style_block, html, count=1, flags=re.DOTALL)

    # Step 2: Replace the header exam-info div with exam-info-row (with grade button)
    # The old format is:
    #   <div class="exam-info">...</div>
    # Replace with:
    #   <div class="exam-info-row">
    #       <span class="exam-info">...</span>
    #       <button class="btn-grade" onclick="gradeExam()">... 判 卷</button>
    #   </div>
    #   <div class="score-display" id="scoreDisplay"></div>
    def replace_exam_info(m):
        return (
            '<div class="exam-info-row">\n'
            '            <span class="exam-info">考试时间：90 分钟 &nbsp;|&nbsp; 满分：100 分</span>\n'
            '            <button class="btn-grade" onclick="gradeExam()">📝 判 卷</button>\n'
            '        </div>\n'
            '        <div class="score-display" id="scoreDisplay"></div>'
        )
    html = re.sub(
        r'<div class="exam-info">.*?</div>',
        replace_exam_info,
        html,
        count=1,
        flags=re.DOTALL
    )

    # Step 3: Fix the score table - add ids and class to the "得分" row cells
    # Old: <tr><td>得分</td><td></td><td></td><td></td><td></td></tr>
    # New: with id and class="scored" and default dash
    html = re.sub(
        r'<tr>\s*<td>得分</td>\s*<td></td>\s*<td></td>\s*<td></td>\s*<td></td>\s*</tr>',
        '        <tr>\n'
        '            <td>得分</td>\n'
        '            <td id="scoreChoice" class="scored">—</td>\n'
        '            <td id="scoreTF" class="scored">—</td>\n'
        '            <td id="scoreProg" class="scored">—</td>\n'
        '            <td id="scoreTotal" class="scored">—</td>\n'
        '        </tr>',
        html,
        count=1
    )

    # Step 4: Convert choice questions
    # Find each <div class="question"> block and transform it
    choice_num = [0]  # use list for closure mutability

    def convert_choice_question(m):
        full_match = m.group(0)
        choice_num[0] += 1
        qnum = choice_num[0]

        if qnum > len(choice_answers):
            return full_match

        answer = choice_answers[qnum - 1]

        # Add data attributes to the question div
        # Replace opening <div class="question"> with attributes
        result = full_match.replace(
            '<div class="question">',
            f'<div class="question" data-qtype="choice" data-qnum="{qnum}" data-answer="{answer}">',
            1
        )

        # Add the copy button right after the opening div tag
        result = result.replace(
            f'<div class="question" data-qtype="choice" data-qnum="{qnum}" data-answer="{answer}">',
            f'<div class="question" data-qtype="choice" data-qnum="{qnum}" data-answer="{answer}">\n'
            f'        <button class="btn-copy" onclick="copyQuestion(this)">📋 复制到错题本</button>',
            1
        )

        # Convert each option div: add radio-dot, data-val, onclick
        # Handle options like: <div class="opt">A. something</div>
        # or multi-line with <code> etc.
        def convert_opt(opt_m):
            opt_html = opt_m.group(0)
            # Extract the content between <div class="opt"> and </div>
            inner_match = re.search(r'<div class="opt">(.*?)</div>', opt_html, re.DOTALL)
            if not inner_match:
                return opt_html
            inner = inner_match.group(1).strip()
            letter = extract_opt_letter(inner)
            if not letter:
                return opt_html
            return (
                f'            <div class="opt" data-val="{letter}" onclick="selectOpt(this)">'
                f'<span class="radio-dot"></span>{inner}</div>'
            )

        result = re.sub(r'<div class="opt">.*?</div>', convert_opt, result, flags=re.DOTALL)

        # Remove the ::before CSS pseudo-element effect by noting the CSS is already replaced

        # Add correct-answer-tag div after the options div closes
        # Find the closing </div> of options and add after it
        result = re.sub(
            r'(</div>\s*)(</div>\s*$)',  # last two closing divs: options and question
            r'\1        <div class="correct-answer-tag"></div>\n    \2',
            result,
            flags=re.DOTALL
        )

        return result

    # We need to match each complete question div block.
    # A question div can contain nested divs (options, q-text) and pre blocks.
    # Use a more careful approach: find each question block by matching from
    # <div class="question"> to its closing </div>, accounting for nesting.

    def find_question_blocks(html_text):
        """Find all <div class="question">...</div> blocks, handling nesting."""
        pattern = r'<div class="question">'
        blocks = []
        for m in re.finditer(pattern, html_text):
            start = m.start()
            # Count div nesting to find the matching close
            depth = 0
            pos = start
            while pos < len(html_text):
                open_m = re.search(r'<div[\s>]', html_text[pos:])
                close_m = re.search(r'</div>', html_text[pos:])
                if not close_m:
                    break
                if open_m and open_m.start() < close_m.start():
                    depth += 1
                    pos += open_m.start() + 4
                else:
                    depth -= 1
                    pos += close_m.start() + 6
                    if depth == 0:
                        blocks.append((start, pos))
                        break
        return blocks

    # Convert choice questions
    question_blocks = find_question_blocks(html)
    # Process in reverse order to preserve positions
    for start, end in reversed(question_blocks):
        block = html[start:end]
        choice_num[0] = 0  # reset - we'll count differently

    # Actually, let's do a simpler approach: process sequentially
    choice_num[0] = 0
    new_html_parts = []
    last_end = 0
    for start, end in question_blocks:
        new_html_parts.append(html[last_end:start])
        block = html[start:end]
        choice_num[0] += 1
        qnum = choice_num[0]

        if qnum <= len(choice_answers):
            answer = choice_answers[qnum - 1]

            # Add data attributes
            block = block.replace(
                '<div class="question">',
                f'<div class="question" data-qtype="choice" data-qnum="{qnum}" data-answer="{answer}">',
                1
            )

            # Add copy button after opening tag
            block = re.sub(
                r'(<div class="question"[^>]*>)\n',
                r'\1\n        <button class="btn-copy" onclick="copyQuestion(this)">📋 复制到错题本</button>\n',
                block,
                count=1
            )

            # Convert option divs
            def convert_opt(opt_m):
                opt_html = opt_m.group(0)
                inner_match = re.search(r'<div class="opt">(.*?)</div>', opt_html, re.DOTALL)
                if not inner_match:
                    return opt_html
                inner = inner_match.group(1).strip()
                letter = extract_opt_letter(inner)
                if not letter:
                    return opt_html
                return (
                    f'<div class="opt" data-val="{letter}" onclick="selectOpt(this)">'
                    f'<span class="radio-dot"></span>{inner}</div>'
                )

            block = re.sub(r'<div class="opt">.*?</div>', convert_opt, block, flags=re.DOTALL)

            # Add correct-answer-tag before the final closing </div>
            # Find the last </div> which closes the question div
            last_close = block.rfind('</div>')
            if last_close >= 0:
                block = block[:last_close] + '        <div class="correct-answer-tag"></div>\n    </div>'

        new_html_parts.append(block)
        last_end = end

    new_html_parts.append(html[last_end:])
    html = ''.join(new_html_parts)

    # Step 5: Convert true/false questions
    def find_tf_blocks(html_text):
        """Find all <div class="tf-item"> blocks."""
        pattern = r'<div class="tf-item">'
        blocks = []
        for m in re.finditer(pattern, html_text):
            start = m.start()
            depth = 0
            pos = start
            while pos < len(html_text):
                open_m = re.search(r'<div[\s>]', html_text[pos:])
                close_m = re.search(r'</div>', html_text[pos:])
                if not close_m:
                    break
                if open_m and open_m.start() < close_m.start():
                    depth += 1
                    pos += open_m.start() + 4
                else:
                    depth -= 1
                    pos += close_m.start() + 6
                    if depth == 0:
                        blocks.append((start, pos))
                        break
        return blocks

    tf_blocks = find_tf_blocks(html)
    tf_num = 0
    new_html_parts = []
    last_end = 0

    for start, end in tf_blocks:
        new_html_parts.append(html[last_end:start])
        block = html[start:end]
        tf_num += 1
        qnum = 15 + tf_num  # TF questions numbered 16-25

        if tf_num <= len(tf_answers):
            answer = tf_answers[tf_num - 1]

            # Add data attributes
            block = block.replace(
                '<div class="tf-item">',
                f'<div class="tf-item" data-qtype="tf" data-qnum="{qnum}" data-answer="{answer}">',
                1
            )

            # Add copy button after opening tag
            block = re.sub(
                r'(<div class="tf-item"[^>]*>)\n',
                r'\1\n        <button class="btn-copy" onclick="copyQuestion(this)">📋 复制到错题本</button>\n',
                block,
                count=1
            )

            # Replace tf-choice with tf-options
            block = re.sub(
                r'<div class="tf-choice">.*?</div>',
                '<div class="tf-options">\n'
                '            <div class="tf-opt" data-val="A" onclick="selectTF(this)">✔ 正确</div>\n'
                '            <div class="tf-opt" data-val="B" onclick="selectTF(this)">✘ 错误</div>\n'
                '        </div>',
                block,
                flags=re.DOTALL
            )

            # Add correct-answer-tag before the final closing </div>
            last_close = block.rfind('</div>')
            if last_close >= 0:
                block = block[:last_close] + '        <div class="correct-answer-tag"></div>\n    </div>'

        new_html_parts.append(block)
        last_end = end

    new_html_parts.append(html[last_end:])
    html = ''.join(new_html_parts)

    # Step 6: Add modal, toast, and script before </body>
    # Insert before </body>
    insertion = f'\n{modal_block}\n\n{toast_block}\n\n{script_block}\n'
    html = html.replace('</body>', insertion + '</body>')

    return html


def main():
    ref_path = os.path.join(SCRIPT_DIR, 'exam_01', 'mock_exam_01.html')
    if not os.path.exists(ref_path):
        print(f"ERROR: Reference file not found: {ref_path}")
        sys.exit(1)

    print("Extracting reference blocks from exam_01...")
    style_block, script_block, modal_block, toast_block = extract_reference_blocks(ref_path)
    print(f"  Style block: {len(style_block)} chars")
    print(f"  Script block: {len(script_block)} chars")
    print(f"  Modal block: {len(modal_block)} chars")
    print(f"  Toast block: {len(toast_block)} chars")
    print()

    for exam_num in range(2, 11):
        exam_dir = os.path.join(SCRIPT_DIR, f'exam_{exam_num:02d}')
        exam_path = os.path.join(exam_dir, f'mock_exam_{exam_num:02d}.html')
        answer_path = os.path.join(exam_dir, f'mock_exam_{exam_num:02d}_answers.html')

        if not os.path.exists(exam_path):
            print(f"[SKIP] exam_{exam_num:02d}: exam file not found")
            continue
        if not os.path.exists(answer_path):
            print(f"[SKIP] exam_{exam_num:02d}: answer file not found")
            continue

        print(f"Processing exam_{exam_num:02d}...")

        try:
            # Extract answers
            choice_answers, tf_answers = extract_answers(answer_path)
            print(f"  Choice answers ({len(choice_answers)}): {' '.join(choice_answers)}")
            print(f"  TF answers ({len(tf_answers)}): {' '.join(tf_answers)}")

            # Convert exam
            result = convert_exam(
                exam_path, choice_answers, tf_answers,
                style_block, script_block, modal_block, toast_block
            )

            # Write back
            with open(exam_path, 'w', encoding='utf-8') as f:
                f.write(result)

            # Verify
            if 'gradeExam()' in result and 'data-answer=' in result:
                print(f"  [OK] Converted successfully")
            else:
                print(f"  [WARN] Conversion may be incomplete")

        except Exception as e:
            print(f"  [ERROR] {e}")
            import traceback
            traceback.print_exc()

        print()

    print("Done!")


if __name__ == '__main__':
    main()
