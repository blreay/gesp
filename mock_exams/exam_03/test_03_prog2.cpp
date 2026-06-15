/*
 * GESP C++一级 模拟试卷(三) - 编程题2「完全平方数统计」测试程序
 *
 * 用法: g++ -o test_03_prog2 test_03_prog2.cpp && ./test_03_prog2 <考生程序路径>
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
int countSquares(int L, int R) {
    int cnt = 0;
    for (int i = 1; i * i <= R; i++) {
        if (i * i >= L) cnt++;
    }
    return cnt;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"1 100\n",         ""},
        {"2 3\n",           ""},
        {"15 17\n",         ""},
        // 单个完全平方数
        {"1 1\n",           ""},
        {"4 4\n",           ""},
        {"100 100\n",       ""},
        // 非完全平方数
        {"2 2\n",           ""},
        {"5 8\n",           ""},
        // 较大范围
        {"1 10000\n",       ""},
        {"1 1000000\n",     ""},
        // 边界
        {"999999 1000000\n",""},
        {"1000000 1000000\n",""},
        // 中等范围
        {"50 100\n",        ""},
        {"100 200\n",       ""},
        {"10 50\n",         ""},
    };

    // Compute expected values
    int inputs[][2] = {
        {1,100}, {2,3}, {15,17},
        {1,1}, {4,4}, {100,100},
        {2,2}, {5,8},
        {1,10000}, {1,1000000},
        {999999,1000000}, {1000000,1000000},
        {50,100}, {100,200}, {10,50}
    };
    for (int i = 0; i < (int)tests.size(); i++) {
        tests[i].expected = to_string(countSquares(inputs[i][0], inputs[i][1]));
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「完全平方数统计」自动测试" << endl;
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
        printf("  %-6s | %-20s | %-10s | %-10s\n", "编号", "输入(L R)", "期望输出", "实际输出");
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
