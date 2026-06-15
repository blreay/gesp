/*
 * GESP C++一级 模拟试卷(八) - 编程题2「求最小公倍数」测试程序
 *
 * 用法: g++ -o test_08_prog2 test_08_prog2.cpp && ./test_08_prog2 <考生程序路径>
 */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include <fstream>

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

// Reference solution
int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

long long lcm(int a, int b) {
    return (long long)a / gcd(a, b) * b;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    int testPairs[][2] = {
        {12, 8},        // 24
        {7, 5},         // 35
        {6, 6},         // 6
        {1, 1},         // 1
        {1, 100},       // 100
        {100, 1},       // 100
        {2, 3},         // 6
        {4, 6},         // 12
        {15, 20},       // 60
        {24, 36},       // 72
        {100, 75},      // 300
        {97, 89},       // 8633 (both prime)
        {1000, 1000},   // 1000
        {9999, 3333},   // 9999
        {10000, 7},     // 70000
    };

    vector<TestCase> tests;
    for (auto& p : testPairs) {
        string input = to_string(p[0]) + " " + to_string(p[1]) + "\n";
        string expected = to_string(lcm(p[0], p[1]));
        tests.push_back({input, expected});
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「求最小公倍数」自动测试" << endl;
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
        printf("  %-6s | %-12s | %-15s | %-15s\n", "编号", "输入(a b)", "期望输出", "实际输出");
        printf("  %s\n", "-------+--------------+-----------------+----------------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-12s | %-15s | %-15s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
