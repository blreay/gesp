/*
 * GESP C++一级 模拟试卷(八) - 编程题1「时间转换」测试程序
 *
 * 用法: g++ -o test_08_prog1 test_08_prog1.cpp && ./test_08_prog1 <考生程序路径>
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
string solve(int t) {
    int h = t / 3600;
    int m = (t % 3600) / 60;
    int s = t % 60;
    return to_string(h) + ":" + to_string(m) + ":" + to_string(s);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    int testValues[] = {
        0,          // 0:0:0
        1,          // 0:0:1
        59,         // 0:0:59
        60,         // 0:1:0
        61,         // 0:1:1
        3599,       // 0:59:59
        3600,       // 1:0:0
        3661,       // 1:1:1
        7200,       // 2:0:0
        86399,      // 23:59:59
        86400,      // 24:0:0
        100000,     // 27:46:40
        45296,      // 12:34:56
        90061,      // 25:1:1
    };

    vector<TestCase> tests;
    for (int v : testValues) {
        tests.push_back({to_string(v) + "\n", solve(v)});
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「时间转换」自动测试" << endl;
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
        printf("  %-6s | %-10s | %-15s | %-15s\n", "编号", "输入(t)", "期望输出", "实际输出");
        printf("  %s\n", "-------+------------+-----------------+----------------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-10s | %-15s | %-15s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
