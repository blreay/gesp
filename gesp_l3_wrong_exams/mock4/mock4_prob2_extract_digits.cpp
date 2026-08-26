// 测试程序：验证"字符串数字提取"(mock4 编程题2)考生程序的正确性
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

static std::string runProgram(const std::string& exePath, const std::string& input) {
    std::string inFile = "/tmp/mock4_p2_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock4_p2_out_" + std::to_string(getpid()) + ".txt";
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
        {"a1b2c3\n", "123"},
        {"HelloWorld\n", "NONE"},
        {"2026GESP\n", "2026"},
        {"1a2b3c4d5e\n", "12345"},
        {"999\n", "999"},
    };

    int total = (int)cases.size(), passed = 0;
    std::vector<int> failedIdx;
    std::vector<std::string> actualOutputs(total);

    for (int i = 0; i < total; i++) {
        std::string actual = runProgram(exePath, cases[i].input);
        actualOutputs[i] = actual;
        if (actual == trim(cases[i].expected)) passed++;
        else failedIdx.push_back(i);
    }

    printf("=== 字符串数字提取 测试结果：%d / %d 通过 ===\n", passed, total);
    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期：\n");
        printf("%-4s | %-16s | %-14s | %-14s\n", "#", "输入", "期望输出", "实际输出");
        printf("---------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = ' ';
            printf("%-4d | %-16s | %-14s | %-14s\n",
                   idx + 1, trim(in).c_str(), trim(cases[idx].expected).c_str(), actualOutputs[idx].c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }
    return failedIdx.empty() ? 0 : 1;
}
