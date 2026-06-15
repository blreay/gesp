/*
 * GESP C++一级 模拟试卷(九) - 编程题2「统计字符」测试程序
 *
 * 用法: g++ -o test_09_prog2 test_09_prog2.cpp && ./test_09_prog2 <考生程序路径>
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
        {"5\n1 -2 3 0 -5\n",           "2 2 1"},
        {"3\n0 0 0\n",                  "0 0 3"},
        {"4\n5 10 -3 7\n",             "3 1 0"},
        // 全正数
        {"5\n1 2 3 4 5\n",             "5 0 0"},
        // 全负数
        {"4\n-1 -2 -3 -4\n",           "0 4 0"},
        // 全零
        {"1\n0\n",                      "0 0 1"},
        // 单个正数
        {"1\n42\n",                     "1 0 0"},
        // 单个负数
        {"1\n-7\n",                     "0 1 0"},
        // 混合
        {"6\n-1 0 1 -2 0 2\n",         "2 2 2"},
        // 大数值
        {"3\n10000 -10000 0\n",         "1 1 1"},
        // 较多元素
        {"10\n1 -1 2 -2 3 -3 0 0 4 -4\n", "4 4 2"},
        // 全部相同正数
        {"5\n7 7 7 7 7\n",             "5 0 0"},
        // 交替
        {"6\n1 -1 1 -1 1 -1\n",        "3 3 0"},
        // 含大量零
        {"8\n0 0 0 1 0 0 0 -1\n",      "1 1 6"},
    };

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「统计字符」自动测试" << endl;
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
        printf("  %-6s | %-30s | %-12s | %-12s\n", "编号", "输入", "期望输出", "实际输出");
        printf("  %s\n", "-------+--------------------------------+--------------+-------------");
        for (int i = 0; i < failed; i++) {
            string inShow = failIn[i];
            for (char& c : inShow) if (c == '\n') c = ' ';
            printf("  #%-5d | %-30s | %-12s | %-12s\n",
                   failIdx[i], inShow.c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
