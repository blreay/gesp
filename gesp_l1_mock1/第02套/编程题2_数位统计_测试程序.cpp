// =============================================================
// GESP C++ 一级 模拟卷 第 02 套 - 编程题 2《数位统计》评测程序
// -------------------------------------------------------------
// 用法：
//   g++ 你的代码.cpp -o my_answer
//   g++ 第02套_编程题2_数位统计_测试程序.cpp -o judge2
//   ./judge2 ./my_answer
// 不通过的用例会用表格列出【输入 / 实际输出 / 期望输出】。
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
        string t; bool sp = false;
        for (char c : ln) {
            if (c==' '||c=='\t') sp = true;
            else { if (sp && !t.empty()) t += ' '; sp = false; t += c; }
        }
        ln = t;
    }
    while (!lines.empty() && lines.back().empty()) lines.pop_back();
    string out;
    for (size_t i = 0; i < lines.size(); i++){ if(i) out+="\n"; out+=lines[i]; }
    return out;
}
static string runProgram(const string& exe, const string& input) {
    string inFile="._j2in.txt", outFile="._j2out.txt";
    { ofstream f(inFile); f << input; }
    string cmd = "\"" + exe + "\" < " + inFile + " > " + outFile + " 2>/dev/null";
    int rc = system(cmd.c_str()); (void)rc;
    ifstream f(outFile); stringstream ss; ss << f.rdbuf();
    remove(inFile.c_str()); remove(outFile.c_str());
    return ss.str();
}
static string oneLine(const string& s){string r;for(char c:s)r+=(c=='\n'?'|':c);return r;}

static string solve(long long N) {
    int total = 0, even = 0;
    while (N > 0) { int d = N % 10; total++; if (d % 2 == 0) even++; N /= 10; }
    return to_string(total) + " " + to_string(even);
}

int main(int argc, char** argv) {
    if (argc < 2) { printf("用法: %s <考生可执行文件路径>\n", argv[0]); return 1; }
    string exe = argv[1];

    vector<long long> ins = {12340, 7, 1, 2000000000LL, 2468, 13579, 1000000000LL, 86420, 5, 999999999LL};
    vector<Case> cases;
    for (long long v : ins) cases.push_back({ to_string(v)+"\n", solve(v) });

    int pass = 0; vector<int> failed;
    for (size_t i = 0; i < cases.size(); i++) {
        string got = runProgram(exe, cases[i].input);
        if (normalize(got) == normalize(cases[i].expected)) pass++;
        else failed.push_back((int)i);
    }

    printf("\n======== 编程题2《数位统计》评测结果 ========\n");
    printf("通过 %d / %d 个测试点\n\n", pass, (int)cases.size());
    if (failed.empty()) printf("✅ ALL PASSED 全部通过！\n");
    else {
        printf("❌ 以下测试点未通过，请核对：\n\n");
        printf("+------+----------------------+----------------+----------------+\n");
        printf("| 用例 | 输入                  | 实际输出        | 期望输出        |\n");
        printf("+------+----------------------+----------------+----------------+\n");
        for (int idx : failed) {
            string got = runProgram(exe, cases[idx].input);
            printf("| %4d | %-20s | %-14s | %-14s |\n",
                idx+1,
                oneLine(cases[idx].input).substr(0,20).c_str(),
                oneLine(normalize(got)).substr(0,14).c_str(),
                oneLine(cases[idx].expected).substr(0,14).c_str());
        }
        printf("+------+----------------------+----------------+----------------+\n");
    }
    return 0;
}
