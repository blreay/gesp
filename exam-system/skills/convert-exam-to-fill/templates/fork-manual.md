# 试卷 → 填空改造卷 fork 执行手册（批次：{{BATCH}}）

> 本手册由 convert-exam-to-fill skill 的 templates/fork-manual.md 生成。
> 你是被派来转化**一份**试卷的 fork。只做分给你的那一份，产出 + 自检 + 报告。

## 任务

把你分到的源试卷（{{SOURCE_DESC}}）转化为系统 JSON 试卷：
**{{N_OBJECTIVE}} 道客观题（{{N_CHOICE}} 单选 + {{N_TF}} 判断）的考点改造成恰好 {{FILL_N}} 道填空题
（每空 {{FILL_SCORE}} 分）+ {{PROG_N}} 道编程题原样保留（每题 {{PROG_SCORE}} 分）= 总分 {{TOTAL}}**。
输出到 `{{APP_DIR}}/question_bank/{{TARGET_DIR}}/{{OUT_FILE}}`。

目标（用户原话要点）：选择/判断可以蒙对，无法评估学生是否真掌握。改造不是文字替换——
必须先真正读懂每题、每个选择肢/判断点的意图与考点，再设计"迫使学生回忆/计算出关键结论"的填空。
**每个空都必须能在原卷某道客观题里找到对应考点（explanation 的出处标注即此映射）；
禁止引入原卷没有的知识点或自创新题。**

- 你分到的源文件：`{{SOURCE_FILE}}`
- 输出文件：`question_bank/{{TARGET_DIR}}/{{OUT_FILE}}`（exam.id = `{{EXAM_ID}}`，全库唯一）
- 源卷结构（父会话已逐页清点）：{{SOURCE_INVENTORY}}

## 先读范例（风格与字段以它们为准）

- `question_bank/新三级模考/exam_01_fill.exam.json`（填空改造卷先例：字段、出处标注、answer 变体写法）
- `question_bank/GESP_C++三级/real_2026_09_l3.exam.json`（**编程题字段与 test_program 写法唯一权威范例**，
  重点看 sections[2].questions[0].answer.test_program 的结构）

## 输出卷结构

```json
{
  "exam": {
    "id": "{{EXAM_ID}}",
    "title": "<源卷名>（填空改造卷）",
    "total_score": {{TOTAL}},
    "tags": []
    // 不写 category 字段（目录名"{{TARGET_DIR}}"即分类）；不写 duration_minutes（源卷无全卷时长时）
  },
  "sections": [
    { "title": "一、填空题（每题 {{FILL_SCORE}} 分，共 {{FILL_TOTAL}} 分）", "question_type": "fill",
      "score_per_question": {{FILL_SCORE}}, "questions": [ /* 恰好 {{FILL_N}} 题，id = f1..f{{FILL_N}} 连续 */ ] },
    { "title": "二、编程题（每题 {{PROG_SCORE}} 分，共 {{PROG_TOTAL}} 分）", "question_type": "programming",
      "score_per_question": {{PROG_SCORE}}, "questions": [ /* prog1..prog{{PROG_N}} */ ] }
  ]
}
```

## 填空题字段

```json
{ "id": "fN", "type": "fill", "knowledge": ["考点标签1","考点标签2"],
  "stem": "题干，空位用 ____ 表示；含代码用 ``` 围栏",
  "answer": "唯一答案" 或 ["可接受写法1","可接受写法2"],
  "explanation": "实质性解析。（原卷单选第 N 题，答案 X）/（原卷单选第 N 题 A 肢）/（原卷判断第 N 题）" }
```

- 源卷有**答案表**的以它为准，但你必须逐题独立分析核对；**冲突时以实测/独立推导为准**，
  并在该空 explanation 与最终报告中标注"源卷答案表疑似错误"。
- 无答案表 → 全部自定（能 g++ 验证的必须验证），报告显著标注。
- knowledge 补 1~3 个简短中文考点标签；explanation 必须实质性（源卷通常无解析，全部新写），末尾带出处标注。

## 改造方法

### 客观题 → 恰好 {{FILL_N}} 空（平均每题 {{FILL_N}}/{{N_OBJECTIVE}} 空；单题空数可浮动）
1. 读懂题干与**每一个选择肢**：正确肢考什么、每个错误肢踩什么坑；判断题找出它考的概念与关键结果。
2. 把考点改写成需要"产出结论"的填空，而不是识别选项。示例：
   - 原题：`8位二进制原码能表示的最小整数是：A.-127 B.-128 C.-255 D.-256`（答案 A）
     → "8 位二进制原码能表示的最小整数是 ____（填十进制整数）。" answer "-127"；
     → "8 位二进制补码能表示的最小整数是 ____（填十进制整数）。" answer "-128"
       （用补码对照挖掉原码/补码混淆这个干扰肢考点）
   - 代码填空型选择题（"横线处应填入"）：直接改成代码填空，answer 收关键表达式，允许等价写法变体。
   - 程序阅读/求值类：填空问输出或值；**必须 g++ 实测验证**。
3. 判断题：把"判断的关键点"改成填具体内容。示例（判断：×，"string 的 == 比较的是内存地址而非内容"）
   → "C++ 中 string 的 == 运算符比较的是两个字符串的 ____（填：内容/内存地址）。" answer "内容"
4. 判断题因表述不严谨有歧义的（如平台依赖、定义边界），**拆成两空分别考实际内容**，回避"判断歧义句"本身。
5. 拆分/合并自由：关联紧密的肢可合并为一空综合考查；重要考点可拆多空。总计**恰好 {{FILL_N}}**，
   且出处覆盖原卷**全部** {{N_OBJECTIVE}} 道客观题（每题至少 1 空）。

## 判分规则（决定答案怎么写，务必遵守）

系统对填空答案归一化后**精确匹配、区分大小写**：全角→半角、连续空白折叠为一个空格、去首尾空白。
- 答案要短、确定、可判：数字、单词、短表达式、短输出串。
- 有格式歧义时题干显式规定格式："写成 8 位二进制""只填运算符本身""（填：合法/非法）"等。
  "（填：A/B）"限定格式是合法且常用的消歧设计（选项列进题干不算泄露），放心用。
- 合理变体放 answer 数组：大小写、常见同义、空格差异（归一化已折叠空白，"1 2"与"1  2"等价，
  但"1,2"与"1 2"不等价——需要时都列上）。
- **绝不能把正确答案原文抄进题干**（限定格式选项组除外）；同一考点两空不得互相泄露答案。
- 每题**完全独立**：不得出现"如上题""同第 N 题""上述程序"等跨题引用；共享代码上下文重复贴进各自 stem。

## 编程题（保留 + 补判题件）

字段照抄 real_2026_09_l3 范例：id=prog1..progK、type、**title（试题名称，必填）**、knowledge（1~3 标签）、
**source（"{{SOURCE_NAME}}，第 X–Y 页"，必填）**、stem（题目描述，完整自含）、input_format、output_format、
constraints（数据范围+时限+内存限制；源卷未标时沿用范例口径并在报告说明）、
samples（源卷全部样例，input/output 原样）、answer={ reference_code, solution, test_program }。

- reference_code：优先用源卷"参考程序"（原样转录）；**必须 g++ 编译并跑全部 samples 比对输出**，
  不一致就修（并在报告说明——源卷参考程序确实可能印错）；源卷无参考程序则自写并验证。
- solution：几句话思路 + 复杂度。
- test_program：**严格模仿 real_2026_09_l3 的结构**——argv[1] 为考生可执行文件路径；
  用例 = 源卷样例 + 数据范围边界 + 若干随机压测（规模贴近上限）；期望值用独立实现的 expected() 算或硬编码；
  每个用例写输入文件→`system("\"exe\" < in > out 2>/dev/null")`→解析输出与期望比对（按 output_format 解析，
  多整数按空格/换行宽容读取）；失败打印 `[FAIL] case N: ...`；最后打印 `Results: X/Y passed`；
  全过 return 0 否则 return 1。临时文件名加本卷前缀避免冲突。

## 质量红线

- 恰好 {{FILL_N}} 填空（f1..f{{FILL_N}} 连续唯一）+ {{PROG_N}} 道编程题（prog1..prog{{PROG_N}}，带 title/source）；
  fill 的 score_per_question={{FILL_SCORE}}、programming={{PROG_SCORE}}；total_score={{TOTAL}}；无 choice/tf 节。
- 所有计算/程序阅读类答案自己算一遍；C++ 求值/输出/类型转换一律 g++（-std=c++14）实测：
  ```sh
  mkdir -p /tmp/progchk_{{EXAM_ID}} && cd /tmp/progchk_{{EXAM_ID}}
  cat > t.cpp <<'EOF'
  #include <iostream>
  using namespace std;
  int main(){ /* 片段 */ }
  EOF
  g++ -std=c++14 -o t t.cpp && ./t
  ```
  **编译中间产物只放 /tmp 下自建目录，严禁写进仓库目录**（结束前自查 `git status` 无你的残留）。
- 中文自然、无错别字；标点全/半角差异在 answer 变体中考虑。

## 写完后的自检（必须全过，输出留档进报告）

```sh
cd {{APP_DIR}}
export PATH="$HOME/.nvm/versions/node/v20.18.0/bin:$PATH"
node -e '
const {validateExam}=require("./src/services/questionbank");
const P="{{APP_DIR}}/question_bank/{{TARGET_DIR}}/{{OUT_FILE}}";
const o=require(P);
const errs=validateExam(o); console.log("validateExam:",errs.length?errs:"OK");
const f=o.sections[0], p=o.sections[1];
console.log("fillN:",f.questions.length==={{FILL_N}},"ids:",f.questions.every((q,i)=>q.id==="f"+(i+1)),
 "progN:",p.questions.length==={{PROG_N}}&&p.questions.every((q,i)=>q.id==="prog"+(i+1)),
 "scores:",f.score_per_question==={{FILL_SCORE}}&&p.score_per_question==={{PROG_SCORE}},
 "total:",o.exam.total_score==={{TOTAL}},
 "answers:",f.questions.every(q=>q.answer&&(typeof q.answer==="string"||Array.isArray(q.answer))),
 "knowledge:",f.questions.every(q=>Array.isArray(q.knowledge)&&q.knowledge.length>0),
 "expl:",f.questions.every(q=>typeof q.explanation==="string"&&q.explanation.length>10&&q.explanation.includes("原卷")),
 "progAns:",p.questions.every(q=>q.title&&q.source&&q.answer.reference_code&&q.answer.test_program&&q.samples&&q.samples.length));
'
# 编程题双验证：reference 过 samples；test_program 判 reference 全过
cd /tmp/progchk_{{EXAM_ID}}
node -e 'const o=require("{{APP_DIR}}/question_bank/{{TARGET_DIR}}/{{OUT_FILE}}");const fs=require("fs");o.sections[1].questions.forEach((q,i)=>{fs.writeFileSync("ref"+i+".cpp",q.answer.reference_code);fs.writeFileSync("tp"+i+".cpp",q.answer.test_program);});'
for i in $(seq 0 $(( {{PROG_N}} - 1 )) ); do g++ -std=c++14 -o ref$i ref$i.cpp && g++ -std=c++14 -o tp$i tp$i.cpp; done
for i in $(seq 0 $(( {{PROG_N}} - 1 )) ); do ./tp$i "$PWD/ref$i"; echo "tp$i rc=$?"; done   # 全部 rc=0 且 Results: N/N
```
（任何一项不过就修到全过。）

## 报告格式（fork 结束时返回）

- 输出文件路径、validateExam 结果、自检各布尔项
- {{FILL_N}} 空来源分布（单选→几空、判断→几空；逐题映射）
- g++ 验证了哪些填空（编号）；每道编程题 tp 的 rc 与 Results 行
- 源卷答案表与你的答案是否一致、**发现的源卷错误（如有，逐条列）**
- 拿不准的答案/歧义点（如有）
