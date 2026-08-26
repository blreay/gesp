// 测试程序：验证"字符画像统计"(mock1 编程题1)考生程序的正确性
// 用法： g++ -O2 -o test1 mock1_prob1_char_profile.cpp
//        ./test1 <考生二进制程序路径>
// 原理：把每组样例输入写入临时文件，重定向给考生程序运行，捕获其标准输出并与期望结果比较。
// 不符合预期的样例会用表格打印 输入 / 期望输出 / 实际输出，方便人工核对正确性。
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <iostream>
#include <unistd.h>

struct Case {
    std::string input;
    std::string expected;
};

static std::string trim(const std::string& s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

static std::string runProgram(const std::string& exePath, const std::string& input) {
    std::string inFile = "/tmp/mock1_p1_in_" + std::to_string(getpid()) + ".txt";
    std::string outFile = "/tmp/mock1_p1_out_" + std::to_string(getpid()) + ".txt";
    {
        std::ofstream fin(inFile);
        fin << input;
    }
    std::string cmd = "\"" + exePath + "\" < \"" + inFile + "\" > \"" + outFile + "\" 2>/dev/null";
    int rc = system(cmd.c_str());
    (void)rc;
    std::ifstream fout(outFile);
    std::stringstream ss;
    ss << fout.rdbuf();
    std::remove(inFile.c_str());
    std::remove(outFile.c_str());
    return trim(ss.str());
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "用法: " << argv[0] << " <考生二进制程序路径>\n";
        return 1;
    }
    std::string exePath = argv[1];

    std::vector<Case> cases = {
        {"Gesp2026!\n", "1 3 4 601"},
        {"ABC\n", "3 0 0 198"},
        {"abc123\n", "0 3 3 444"},
        {"Hello World 2026\n", "2 8 4 1222"},
        {"!!!___\n", "0 0 0 0"},
    };

    int total = (int)cases.size();
    int passed = 0;
    std::vector<int> failedIdx;
    std::vector<std::string> actualOutputs(total);

    for (int i = 0; i < total; i++) {
        std::string actual = runProgram(exePath, cases[i].input);
        actualOutputs[i] = actual;
        if (actual == trim(cases[i].expected)) {
            passed++;
        } else {
            failedIdx.push_back(i);
        }
    }

    printf("=== 字符画像统计 测试结果：%d / %d 通过 ===\n", passed, total);

    if (!failedIdx.empty()) {
        printf("\n以下样例不符合预期：\n");
        printf("%-4s | %-24s | %-20s | %-20s\n", "#", "输入", "期望输出", "实际输出");
        printf("---------------------------------------------------------------------------\n");
        for (int idx : failedIdx) {
            std::string in = cases[idx].input;
            for (auto& c : in) if (c == '\n') c = ' ';
            printf("%-4d | %-24s | %-20s | %-20s\n",
                   idx + 1, trim(in).c_str(), trim(cases[idx].expected).c_str(), actualOutputs[idx].c_str());
        }
    } else {
        printf("全部样例通过！\n");
    }

    return failedIdx.empty() ? 0 : 1;
}
