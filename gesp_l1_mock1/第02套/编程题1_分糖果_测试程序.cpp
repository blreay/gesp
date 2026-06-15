// =============================================================
// GESP C++ 一级 模拟卷 第 02 套 - 编程题 1《分糖果》评测程序
// -------------------------------------------------------------
// 用法：
//   g++ 你的代码.cpp -o my_answer
//   g++ 第02套_编程题1_分糖果_测试程序.cpp -o judge
//   ./judge ./my_answer        (Linux/macOS)
//   judge.exe my_answer.exe    (Windows)
// 不通过的用例会用表格列出【输入 / 实际输出 / 期望输出】。
// 期望输出由内置标准答案自动计算，确保正确。
// =============================================================
#include <bits/stdc++.h>
using namespace std;

struct Case { string input; string expected; };

static string normalize(const string& s) {
    vector<string> lines; string cur;
    for (char c : s) {
        if (c == '\n') { lines.push_back(cur); cur.clear(); }
        else if (c != '\r') cur.push_back(c);
    }
    lines.push_back(cur);
    for (auto& ln : lines) {
        // 折叠多个空白为单个，便于比较；并裁剪首尾
        string t; bool sp = false;
        for (char c : ln) {
            if (c == ' ' || c == '\t') { sp = true; }
            else { if (sp && !t.empty()) t += ' '; sp = false; t += c; }
        }
        ln = t;
    }
    while (!lines.empty() && lines.back().empty()) lines.pop_back();
    string out;
    for (size_t i = 0; i < lines.size(); i++) { if (i) out += "\n"; out += lines[i]; }
    return out;
}

static string runProgram(const string& exe, const string& input) {
    string inFile = "._j1in.txt", outFile = "._j1out.txt";
    { ofstream f(inFile); f << input; }
    string cmd = "\"" + exe + "\" < " + inFile + " > " + outFile + " 2>/dev/null";
    int rc = system(cmd.c_str()); (void)rc;
    ifstream f(outFile); stringstream ss; ss << f.rdbuf();
    remove(inFile.c_str()); remove(outFile.c_str());
    return ss.str();
}
static string oneLine(const string& s){string r;for(char c:s)r+=(c=='\n'?'|':c);return r;}

// 标准答案
static string solve(long long m, long long n) {
    long long each = m / n, left = m % n;
    long long need = (left == 0) ? 0 : (n - left);
    return to_string(each) + " " + to_string(left) + " " + to_string(need);
}

int main(int argc, char** argv) {
    if (argc < 2) { printf("用法: %s <考生可执行文件路径>\n", argv[0]); return 1; }
    string exe = argv[1];

    vector<pair<long long,long long>> ins = {
        {20,6},{15,5},{1,1},{1000000,7},{100,100},
        {99,10},{7,3},{1000000,999999},{50,8},{1000000,1}
    };
    vector<Case> cases;
    for (auto& p : ins)
        cases.push_back({ to_string(p.first)+" "+to_string(p.second)+"\n", solve(p.first,p.second) });

    int pass = 0; vector<int> failed;
    for (size_t i = 0; i < cases.size(); i++) {
        string got = runProgram(exe, cases[i].input);
        if (normalize(got) == normalize(cases[i].expected)) pass++;
        else failed.push_back((int)i);
    }

    printf("\n======== 编程题1《分糖果》评测结果 ========\n");
    printf("通过 %d / %d 个测试点\n\n", pass, (int)cases.size());
    if (failed.empty()) printf("✅ ALL PASSED 全部通过！\n");
    else {
        printf("❌ 以下测试点未通过，请核对：\n\n");
        printf("+------+--------------------+--------------------+--------------------+\n");
        printf("| 用例 | 输入                | 实际输出            | 期望输出            |\n");
        printf("+------+--------------------+--------------------+--------------------+\n");
        for (int idx : failed) {
            string got = runProgram(exe, cases[idx].input);
            printf("| %4d | %-18s | %-18s | %-18s |\n",
                idx+1,
                oneLine(cases[idx].input).substr(0,18).c_str(),
                oneLine(normalize(got)).substr(0,18).c_str(),
                oneLine(cases[idx].expected).substr(0,18).c_str());
        }
        printf("+------+--------------------+--------------------+--------------------+\n");
    }
    return 0;
}
