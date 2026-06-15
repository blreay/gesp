/*
 * GESP C++一级 模拟试卷(二) - 编程题1「回文数判断」测试程序
 *
 * 用法: g++ -o test_02_prog1 test_02_prog1.cpp && ./test_02_prog1 <考生程序路径>
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

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"1 10\n",          "9"},     // 1-9 are palindromes
        {"100 200\n",       "10"},    // 101,111,...,191
        {"1 1\n",           "1"},
        // 单个数
        {"5 5\n",           "1"},
        {"10 10\n",         "0"},     // 10 is not palindrome
        {"11 11\n",         "1"},     // 11 is palindrome
        // 小范围
        {"1 100\n",         "18"},    // 1-9 (9个) + 11,22,33,...,99 (9个) = 18
        {"10 99\n",         "9"},     // 11,22,33,44,55,66,77,88,99
        // 三位数
        {"100 199\n",       "10"},    // 101,111,121,...,191
        {"990 999\n",       "1"},     // only 999
        // 大范围
        {"1 999\n",         "108"},   // 9 + 9 + 90 = 108
        // 四位数
        {"1000 1100\n",     "10"},    // 1001,1011,1021,1031,1041,1051,1061,1071,1081,1091
        // 五位数
        {"10000 10099\n",   "10"},    // 10001,10101 ... 只有10001,10101不在范围...
                                       // 10001(rev=10001 ✓), 10101不在范围(>10099)
                                       // 实际: 10001 only? Let me recalc
        // 全范围
        {"1 100000\n",      "1098"}, // known count of palindromes 1-100000
    };

    // 重新计算一些测试用例的期望值
    // 用正确算法验证
    auto countPalin = [](int L, int R) -> int {
        int cnt = 0;
        for (int n = L; n <= R; n++) {
            int temp = n, rev = 0;
            while (temp > 0) {
                rev = rev * 10 + temp % 10;
                temp /= 10;
            }
            if (rev == n) cnt++;
        }
        return cnt;
    };

    // Recalculate expected values to be sure
    tests[6].expected = to_string(countPalin(1, 100));
    tests[7].expected = to_string(countPalin(10, 99));
    tests[8].expected = to_string(countPalin(100, 199));
    tests[9].expected = to_string(countPalin(990, 999));
    tests[10].expected = to_string(countPalin(1, 999));
    tests[11].expected = to_string(countPalin(1000, 1100));
    tests[12].expected = to_string(countPalin(10000, 10099));
    tests[13].expected = to_string(countPalin(1, 100000));

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「回文数判断」自动测试" << endl;
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
        printf("  %-6s | %-15s | %-10s | %-10s\n", "编号", "输入(L R)", "期望输出", "实际输出");
        printf("  %s\n", "-------+-----------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-15s | %-10s | %-10s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
