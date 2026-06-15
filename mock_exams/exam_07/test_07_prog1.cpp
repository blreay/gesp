/*
 * GESP C++一级 模拟试卷(七) - 编程题1「小杨买书」测试程序
 *
 * 用法: g++ -o test_07_prog1 test_07_prog1.cpp && ./test_07_prog1 <考生程序路径>
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
string solve(int a, int b, int n) {
    if (a + b > n) return "0";
    int remain = n - a - b;
    int cheaper = a < b ? a : b;
    int total = 2 + remain / cheaper;
    return to_string(total);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"3 5 20\n",    ""},
        {"10 10 15\n",  ""},
        {"1 1 100\n",   ""},
        // 边界: a+b == n, 刚好只能各买1本
        {"5 5 10\n",    ""},
        // a+b > n
        {"50 60 100\n", ""},
        // a远小于b，尽量多买a
        {"1 100 200\n", ""},
        // b远小于a，尽量多买b
        {"100 1 200\n", ""},
        // 两者相同价格
        {"3 3 30\n",    ""},
        // 大数据
        {"1 1 100000\n", ""},
        // a=1, b=1000
        {"1 1000 2000\n", ""},
        // 刚好不够
        {"500 501 1000\n", ""},
        // 刚好够各买1本
        {"500 500 1000\n", ""},
        // n很大
        {"7 3 99999\n", ""},
        // a==b
        {"10 10 100\n", ""},
    };

    // Calculate expected values using reference solution
    int testParams[][3] = {
        {3,5,20}, {10,10,15}, {1,1,100}, {5,5,10}, {50,60,100},
        {1,100,200}, {100,1,200}, {3,3,30}, {1,1,100000}, {1,1000,2000},
        {500,501,1000}, {500,500,1000}, {7,3,99999}, {10,10,100}
    };
    for (int i = 0; i < (int)tests.size(); i++) {
        tests[i].expected = solve(testParams[i][0], testParams[i][1], testParams[i][2]);
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「小杨买书」自动测试" << endl;
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
        printf("  %-6s | %-18s | %-10s | %-10s\n", "编号", "输入(a b n)", "期望输出", "实际输出");
        printf("  %s\n", "-------+--------------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-18s | %-10s | %-10s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
