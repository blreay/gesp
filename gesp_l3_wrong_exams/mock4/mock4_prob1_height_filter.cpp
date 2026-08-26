// 测试程序：验证"招募身高达标队员"(mock4 编程题1)考生程序的正确性
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <iostream>
#include <unistd.h>

struct Case { std::string input; std::string expected; };

static std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

static std::string normalize(const std::string& s) {
    // 折叠多余空白，方便宽松比较（每行内多空格视为等价）
    std::istringstream iss(s);
    std::string line, out;
    bool firstLine = true;
    while (std::getline(iss, line)) {
        std::istringstream lss(line);
        std::string tok, lineOut;
        bool first = true;
        while (lss >> tok) {
            if (!first) lineOut += " ";
            lineOut += tok;
            first = false;
        }
        if (!firstLine) out += "\n";
        out += lineOut;
        firstLine = false;
    }
    return out;
}

static std::string runProgram(const std::string& exePath, const std::string& input) {
    std::string inFile = "/tmp/mock4_p1_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock4_p1_out_" + std::to_string(getpid()) + ".txt";
    { std::ofstream fin(inFile); fin << input; }
    std::string cmd = "\"" + exePath + "\" < \"" + inFile + "\" > \"" + outFile + "\" 2>/dev/null";
    if (system(cmd.c_str()) != 0) { }
    std::ifstream fout(outFile);
    std::stringstream ss; ss << fout.rdbuf();
    std::remove(inFile.c_str());
    std::remove(outFile.c_str());
    return trim(ss.str());
}

int main(int argc, char** argv) {
    if (argc < 2) { std::cerr << "用法: " << argv[0] << " <考生二进制程序路径>\n"; return 1; }
    std::string exePath = argv[1];

    std::vector<Case> cases = {
        {"5\n120 140 135 150 136\n", "3\n2 4 5"},
        {"3\n100 110 120\n", "0\n"},
        {"4\n200 200 200 200\n", "4\n1 2 3 4"},
        {"1\n136\n", "1\n1"},
        {"6\n135 136 137 100 200 90\n", "3\n2 3 5"},
    };

    int total = (int)cases.size(), passed = 0;
    std::vector<int> failedIdx;
    std::vector<std::string> actualOutputs(total);

    for (int i = 0; i < total; i++) {
        std::string actual = runProgram(exePath, cases[i].input);
        actualOutputs[i] = actual;
        if (normalize(actual) == normalize(trim(cases[i].expected))) passed++;
        else failedIdx.push_back(i);
    }

    printf("=== 招募身高达标队员 测试结果：%d / %d 通过 ===\n", passed, total);
    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期：\n");
        printf("%-4s | %-32s | %-16s | %-16s\n", "#", "输入", "期望输出", "实际输出");
        printf("-----------------------------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = '|';
            std::string exp = cases[idx].expected;
            for (auto& c : exp) if (c == '\n') c = '|';
            std::string act = actualOutputs[idx];
            for (auto& c : act) if (c == '\n') c = '|';
            printf("%-4d | %-32s | %-16s | %-16s\n",
                   idx + 1, trim(in).c_str(), trim(exp).c_str(), act.c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }
    return failedIdx.empty() ? 0 : 1;
}
