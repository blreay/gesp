// 测试程序：验证"安全的整数反转"(mock3 编程题2)考生程序的正确性
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
    std::string inFile = "/tmp/mock3_p2_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock3_p2_out_" + std::to_string(getpid()) + ".txt";
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
        {"123\n", "321"},
        {"1463847412\n", "2147483641"},
        {"1534236469\n", "0"},
        {"-123\n", "-321"},
        {"120\n", "21"},
        {"0\n", "0"},
        {"1000000000\n", "1"},
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

    printf("=== 安全的整数反转 测试结果：%d / %d 通过 ===\n", passed, total);
    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期：\n");
        printf("%-4s | %-14s | %-14s | %-14s\n", "#", "输入", "期望输出", "实际输出");
        printf("---------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = ' ';
            printf("%-4d | %-14s | %-14s | %-14s\n",
                   idx + 1, trim(in).c_str(), trim(cases[idx].expected).c_str(), actualOutputs[idx].c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }
    return failedIdx.empty() ? 0 : 1;
}
