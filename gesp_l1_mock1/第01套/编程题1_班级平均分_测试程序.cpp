// =============================================================
// GESP C++ 一级 模拟卷 第 01 套 - 编程题 1《班级平均分》评测程序
// -------------------------------------------------------------
// 用途：自动校验考生编写的程序是否正确。
// 用法：
//   1. 考生先把自己的代码编译成可执行文件，例如：
//        g++ my_answer.cpp -o my_answer
//   2. 编译本评测程序：
//        g++ 第01套_编程题1_班级平均分_测试程序.cpp -o judge
//   3. 运行（参数为考生可执行文件路径）：
//        ./judge ./my_answer            (Linux/macOS)
//        judge.exe my_answer.exe        (Windows)
// 评测程序会喂入多组输入，比对实际输出与期望输出；不一致的用例
// 会用表格列出【输入 / 实际输出 / 期望输出】，方便人工核对。
// =============================================================
#include <bits/stdc++.h>
using namespace std;

struct Case { string input; string expected; };

// 去掉首尾空白，并把每行末尾空白与多余空行规整，便于宽松比较
static string normalize(const string& s) {
    // 按行处理，去掉每行右侧空白和制表符，去掉结尾多余的空行
    vector<string> lines;
    string cur;
    for (char c : s) {
        if (c == '\n') { lines.push_back(cur); cur.clear(); }
        else if (c != '\r') cur.push_back(c);
    }
    lines.push_back(cur);
    // 右裁剪每行
    for (auto& ln : lines) {
        size_t e = ln.find_last_not_of(" \t");
        ln = (e == string::npos) ? "" : ln.substr(0, e + 1);
    }
    // 去掉末尾空行
    while (!lines.empty() && lines.back().empty()) lines.pop_back();
    string out;
    for (size_t i = 0; i < lines.size(); i++) {
        if (i) out += "\n";
        out += lines[i];
    }
    return out;
}

// 运行考生程序，喂入 input，捕获 stdout
static string runProgram(const string& exe, const string& input) {
    string inFile = "._judge_in.txt";
    string outFile = "._judge_out.txt";
    { ofstream f(inFile); f << input; }
    string cmd = "\"" + exe + "\" < " + inFile + " > " + outFile + " 2>/dev/null";
    int rc = system(cmd.c_str());
    (void)rc;
    ifstream f(outFile);
    stringstream ss; ss << f.rdbuf();
    remove(inFile.c_str());
    remove(outFile.c_str());
    return ss.str();
}

static string oneLine(const string& s) {
    string r;
    for (char c : s) r += (c == '\n' ? '|' : c);
    return r;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        printf("用法: %s <考生可执行文件路径>\n", argv[0]);
        return 1;
    }
    string exe = argv[1];

    vector<Case> cases = {
        {"3\n80 90 100\n",        "90.00"},
        {"4\n60 75 88 91\n",      "78.50"},
        {"1\n100\n",              "100.00"},
        {"1\n0\n",                "0.00"},
        {"5\n100 100 100 100 100\n","100.00"},
        {"2\n0 1\n",              "0.50"},
        {"6\n10 20 30 40 50 60\n","35.00"},
        {"3\n1 1 2\n",            "1.33"},   // 4/3 = 1.333..., 保留两位 -> 1.33
        {"7\n95 88 76 100 64 73 89\n","83.57"}, // 585/7=83.571.. ->83.57
        {"10\n0 0 0 0 0 0 0 0 0 100\n","10.00"},
    };

    int pass = 0;
    vector<int> failed;
    for (size_t i = 0; i < cases.size(); i++) {
        string got = runProgram(exe, cases[i].input);
        string g = normalize(got), e = normalize(cases[i].expected);
        if (g == e) { pass++; }
        else {
            failed.push_back((int)i);
        }
    }

    printf("\n======== 编程题1《班级平均分》评测结果 ========\n");
    printf("通过 %d / %d 个测试点\n\n", pass, (int)cases.size());

    if (failed.empty()) {
        printf("✅ ALL PASSED 全部通过！\n");
    } else {
        printf("❌ 以下测试点未通过，请核对：\n\n");
        printf("+------+--------------------------+----------------+----------------+\n");
        printf("| 用例 | 输入(|表示换行)           | 实际输出        | 期望输出        |\n");
        printf("+------+--------------------------+----------------+----------------+\n");
        for (int idx : failed) {
            string got = runProgram(exe, cases[idx].input);
            printf("| %4d | %-24s | %-14s | %-14s |\n",
                   idx + 1,
                   oneLine(cases[idx].input).substr(0,24).c_str(),
                   oneLine(normalize(got)).substr(0,14).c_str(),
                   oneLine(cases[idx].expected).substr(0,14).c_str());
        }
        printf("+------+--------------------------+----------------+----------------+\n");
    }
    return 0;
}
