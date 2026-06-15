// =============================================================
// GESP C++ 一级 模拟卷 第 01 套 - 编程题 2《数字位数和》评测程序
// -------------------------------------------------------------
// 用法见同套编程题1测试程序顶部注释。
//   g++ 第01套_编程题2_数字位数和_测试程序.cpp -o judge2
//   ./judge2 ./my_answer
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
        size_t e = ln.find_last_not_of(" \t");
        ln = (e == string::npos) ? "" : ln.substr(0, e + 1);
    }
    while (!lines.empty() && lines.back().empty()) lines.pop_back();
    string out;
    for (size_t i = 0; i < lines.size(); i++) { if (i) out += "\n"; out += lines[i]; }
    return out;
}

static string runProgram(const string& exe, const string& input) {
    string inFile = "._judge_in2.txt", outFile = "._judge_out2.txt";
    { ofstream f(inFile); f << input; }
    string cmd = "\"" + exe + "\" < " + inFile + " > " + outFile + " 2>/dev/null";
    int rc = system(cmd.c_str()); (void)rc;
    ifstream f(outFile); stringstream ss; ss << f.rdbuf();
    remove(inFile.c_str()); remove(outFile.c_str());
    return ss.str();
}

static string oneLine(const string& s) {
    string r; for (char c : s) r += (c == '\n' ? '|' : c); return r;
}

// 标准答案（用于自动生成期望输出，保证一致）
static long long digitSum(long long n) {
    long long s = 0;
    while (n > 0) { s += n % 10; n /= 10; }
    return s;
}

int main(int argc, char** argv) {
    if (argc < 2) { printf("用法: %s <考生可执行文件路径>\n", argv[0]); return 1; }
    string exe = argv[1];

    vector<long long> ins = {1234, 9, 1, 1000000000LL, 100, 999999999LL, 5050, 70, 123456789LL, 88};
    vector<Case> cases;
    for (long long v : ins)
        cases.push_back({ to_string(v) + "\n", to_string(digitSum(v)) });

    int pass = 0; vector<int> failed;
    for (size_t i = 0; i < cases.size(); i++) {
        string got = runProgram(exe, cases[i].input);
        if (normalize(got) == normalize(cases[i].expected)) pass++;
        else failed.push_back((int)i);
    }

    printf("\n======== 编程题2《数字位数和》评测结果 ========\n");
    printf("通过 %d / %d 个测试点\n\n", pass, (int)cases.size());

    if (failed.empty()) {
        printf("✅ ALL PASSED 全部通过！\n");
    } else {
        printf("❌ 以下测试点未通过，请核对：\n\n");
        printf("+------+----------------------+----------------+----------------+\n");
        printf("| 用例 | 输入                  | 实际输出        | 期望输出        |\n");
        printf("+------+----------------------+----------------+----------------+\n");
        for (int idx : failed) {
            string got = runProgram(exe, cases[idx].input);
            printf("| %4d | %-20s | %-14s | %-14s |\n",
                   idx + 1,
                   oneLine(cases[idx].input).substr(0,20).c_str(),
                   oneLine(normalize(got)).substr(0,14).c_str(),
                   oneLine(cases[idx].expected).substr(0,14).c_str());
        }
        printf("+------+----------------------+----------------+----------------+\n");
    }
    return 0;
}
