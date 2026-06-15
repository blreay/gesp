/*
 * GESP C++一级 模拟试卷(四) - 编程题1「最大公约数」测试程序
 *
 * 用法: g++ -o test_04_prog1 test_04_prog1.cpp && ./test_04_prog1 <考生程序路径>
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
int gcd(int a, int b) {
    while (b != 0) {
        int t = b;
        b = a % b;
        a = t;
    }
    return a;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"12 8\n",          ""},
        {"7 3\n",           ""},
        {"100 25\n",        ""},
        // 相等
        {"17 17\n",         ""},
        {"1 1\n",           ""},
        // 互质
        {"13 7\n",          ""},
        {"97 89\n",         ""},
        // 一个是另一个的倍数
        {"1000 500\n",      ""},
        {"36 12\n",         ""},
        // 大数
        {"1000000 999999\n",""},
        {"999999 3\n",      ""},
        // 1 和任何数
        {"1 1000000\n",     ""},
        {"1000000 1\n",     ""},
        // 顺序不同
        {"8 12\n",          ""},
        {"3 7\n",           ""},
    };

    // Compute expected values
    int inputs[][2] = {
        {12,8}, {7,3}, {100,25},
        {17,17}, {1,1},
        {13,7}, {97,89},
        {1000,500}, {36,12},
        {1000000,999999}, {999999,3},
        {1,1000000}, {1000000,1},
        {8,12}, {3,7}
    };
    for (int i = 0; i < (int)tests.size(); i++) {
        tests[i].expected = to_string(gcd(inputs[i][0], inputs[i][1]));
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「最大公约数」自动测试" << endl;
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
        printf("  %-6s | %-20s | %-10s | %-10s\n", "编号", "输入(A B)", "期望输出", "实际输出");
        printf("  %s\n", "-------+----------------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-20s | %-10s | %-10s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
