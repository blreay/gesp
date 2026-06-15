/*
 * GESP C++一级 模拟试卷(五) - 编程题2「数字排列」测试程序
 *
 * 用法: g++ -o test_05_prog2 test_05_prog2.cpp && ./test_05_prog2 <考生程序路径>
 */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include <fstream>
#include <algorithm>

using namespace std;

struct TestCase {
    string input;
    string expected;
};

string trim(const string& s) {
    size_t start = s.find_first_not_of(" \t\r\n");
    if (start == string::npos) return "";
    size_t end = s.find_last_not_of(" \t\r\n");
    return s.substr(start, end - start + 1);
}

string runProgram(const string& progPath, const string& input) {
    string tmpIn = "/tmp/gesp_test_in.txt";
    string tmpOut = "/tmp/gesp_test_out.txt";
    ofstream fin(tmpIn);
    fin << input;
    fin.close();
    string cmd = progPath + " < " + tmpIn + " > " + tmpOut + " 2>&1";
    int ret = system(cmd.c_str());
    (void)ret;
    ifstream fout(tmpOut);
    string output((istreambuf_iterator<char>(fout)), istreambuf_iterator<char>());
    fout.close();
    return trim(output);
}

// Reference implementation
string sortDigits(int n) {
    int a = n / 100;
    int b = n / 10 % 10;
    int c = n % 10;
    int d[3] = {a, b, c};
    sort(d, d + 3);
    int result = d[0] * 100 + d[1] * 10 + d[2];
    return to_string(result);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    // Test inputs
    int inputs[] = {
        321,    // 样例1: -> 123
        502,    // 样例2: -> 025 -> 25
        111,    // 样例3: -> 111
        987,    // -> 789
        100,    // -> 001 -> 1
        201,    // -> 012 -> 12
        999,    // -> 999
        120,    // -> 012 -> 12
        531,    // -> 135
        909,    // -> 099 -> 99
        333,    // -> 333
        190,    // -> 019 -> 19
        248,    // -> 248
        862,    // -> 268
        510,    // -> 015 -> 15
        700,    // -> 007 -> 7
        101,    // -> 011 -> 11
    };

    vector<TestCase> tests;
    for (int i = 0; i < (int)(sizeof(inputs)/sizeof(inputs[0])); i++) {
        TestCase tc;
        tc.input = to_string(inputs[i]) + "\n";
        tc.expected = sortDigits(inputs[i]);
        tests.push_back(tc);
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「数字排列」自动测试" << endl;
    cout << "  考生程序: " << progPath << endl;
    cout << "========================================" << endl;
    cout << endl;

    for (int i = 0; i < (int)tests.size(); i++) {
        string actual = runProgram(progPath, tests[i].input);
        if (actual == tests[i].expected) {
            passed++;
            cout << "  测试 #" << (i+1) << ": ✅ 通过" << endl;
        } else {
            failed++;
            failIdx.push_back(i+1);
            failIn.push_back(trim(tests[i].input));
            failExp.push_back(tests[i].expected);
            failAct.push_back(actual);
            cout << "  测试 #" << (i+1) << ": ❌ 未通过" << endl;
        }
    }

    cout << endl;
    cout << "----------------------------------------" << endl;
    cout << "  总计: " << (int)tests.size() << " 个测试" << endl;
    cout << "  通过: " << passed << "  |  未通过: " << failed << endl;
    cout << "----------------------------------------" << endl;

    if (failed > 0) {
        cout << endl;
        cout << "  ❌ 未通过的测试用例详情:" << endl;
        cout << endl;
        printf("  %-6s | %-10s | %-10s | %-10s\n", "编号", "输入(N)", "期望输出", "实际输出");
        printf("  %s\n", "-------+------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-10s | %-10s | %-10s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
