// 测试程序：验证"手写冒泡排序"(mock5 编程题2)考生程序的正确性
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
    std::string inFile = "/tmp/mock5_p2_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock5_p2_out_" + std::to_string(getpid()) + ".txt";
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
        {"6\n5 3 8 1 9 2\n", "1 2 3 5 8 9"},
        {"1\n42\n", "42"},
        {"5\n5 4 3 2 1\n", "1 2 3 4 5"},
        {"5\n1 1 1 1 1\n", "1 1 1 1 1"},
        {"8\n-3 5 0 -8 2 9 -1 4\n", "-8 -3 -1 0 2 4 5 9"},
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

    printf("=== 手写冒泡排序 测试结果：%d / %d 通过 ===\n", passed, total);
    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期：\n");
        printf("%-4s | %-24s | %-20s | %-20s\n", "#", "输入", "期望输出", "实际输出");
        printf("---------------------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = '|';
            printf("%-4d | %-24s | %-20s | %-20s\n",
                   idx + 1, trim(in).c_str(), trim(cases[idx].expected).c_str(), actualOutputs[idx].c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }
    return failedIdx.empty() ? 0 : 1;
}
