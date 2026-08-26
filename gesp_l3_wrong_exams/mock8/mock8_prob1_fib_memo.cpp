// 测试程序：验证"递归与迭代版斐波那契对比"(mock8 编程题1)考生程序的正确性
// 注意：本测试对每个样例设置了较短的超时时间，朴素O(2^n)递归在n较大时会超时失败
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>

struct Case { std::string input; std::string expected; };

static std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

// 带超时的运行：用 timeout 命令限制运行时间，避免朴素递归卡死测试程序本身
static std::string runProgram(const std::string& exePath, const std::string& input, int timeoutSec) {
    std::string inFile = "/tmp/mock8_p1_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock8_p1_out_" + std::to_string(getpid()) + ".txt";
    { std::ofstream fin(inFile); fin << input; }
    std::string cmd = "timeout " + std::to_string(timeoutSec) + " \"" + exePath + "\" < \"" + inFile + "\" > \"" + outFile + "\" 2>/dev/null";
    if (system(cmd.c_str()) != 0) { /* 超时或非零退出，输出可能为空 */ }
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
        {"0\n", "0"},
        {"1\n", "1"},
        {"10\n", "55"},
        {"20\n", "6765"},
        {"40\n", "102334155"},
    };

    int total = (int)cases.size(), passed = 0;
    std::vector<int> failedIdx;
    std::vector<std::string> actualOutputs(total);

    for (int i = 0; i < total; i++) {
        std::string actual = runProgram(exePath, cases[i].input, 2);
        actualOutputs[i] = actual;
        if (actual == trim(cases[i].expected)) passed++;
        else failedIdx.push_back(i);
    }

    printf("=== 递归与迭代版斐波那契对比 测试结果：%d / %d 通过 ===\n", passed, total);
    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期（超时也算作不符合预期，实际输出会显示为空）：\n");
        printf("%-4s | %-8s | %-14s | %-14s\n", "#", "输入", "期望输出", "实际输出");
        printf("---------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = ' ';
            printf("%-4d | %-8s | %-14s | %-14s\n",
                   idx + 1, trim(in).c_str(), trim(cases[idx].expected).c_str(), actualOutputs[idx].c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }
    return failedIdx.empty() ? 0 : 1;
}
