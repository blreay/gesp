/*
 * GESP C++一级 模拟试卷(六) - 编程题2「区间内满足条件的数」测试程序
 *
 * 用法: g++ -o test_06_prog2 test_06_prog2.cpp && ./test_06_prog2 <考生程序路径>
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

// Reference implementation
pair<int,int> solve(int L, int R) {
    int cnt = 0, sum = 0;
    for (int i = L; i <= R; i++) {
        if (i % 3 == 0 && i % 5 != 0) {
            cnt++;
            sum += i;
        }
    }
    return {cnt, sum};
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    int testInputs[][2] = {
        // 样例
        {1, 15},
        {10, 30},
        {1, 1},
        // 单个满足的数
        {3, 3},
        {6, 6},
        {15, 15},   // 15 被5整除，不满足
        // 没有满足条件的数
        {1, 2},
        {4, 5},
        {14, 14},
        // 小范围
        {1, 30},
        {1, 100},
        // 边界
        {3, 15},
        {30, 30},   // 30 被5整除，不满足
        // 大范围
        {1, 1000},
        {100, 500},
        {1, 10000},
        // 特殊：只有一个数满足
        {3, 4},
    };

    vector<TestCase> tests;
    for (int i = 0; i < (int)(sizeof(testInputs)/sizeof(testInputs[0])); i++) {
        TestCase tc;
        tc.input = to_string(testInputs[i][0]) + " " + to_string(testInputs[i][1]) + "\n";
        auto res = solve(testInputs[i][0], testInputs[i][1]);
        tc.expected = to_string(res.first) + " " + to_string(res.second);
        tests.push_back(tc);
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「区间内满足条件的数」自动测试" << endl;
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
        printf("  %-6s | %-12s | %-15s | %-15s\n", "编号", "输入(L R)", "期望输出", "实际输出");
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
