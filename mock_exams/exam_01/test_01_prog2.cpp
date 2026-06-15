/*
 * GESP C++一级 模拟试卷(一) - 编程题2「数字之和」测试程序
 *
 * 用法: g++ -o test_01_prog2 test_01_prog2.cpp && ./test_01_prog2 <考生程序路径>
 *
 * 本测试程序会运行考生编译好的二进制文件，传入多组测试数据，
 * 对比输出结果，并以表格形式展示不通过的用例。
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
        cout << "例如: " << argv[0] << " ./student_solution" << endl;
        return 1;
    }

    string progPath = argv[1];

    // 测试用例: 输入n -> 各位数字之和
    vector<TestCase> tests = {
        // 样例
        {"12345\n",  "15"},   // 1+2+3+4+5=15
        {"100\n",    "1"},    // 1+0+0=1
        {"99999\n",  "45"},   // 9*5=45
        // 单位数
        {"1\n",      "1"},
        {"9\n",      "9"},
        {"5\n",      "5"},
        // 两位数
        {"10\n",     "1"},    // 1+0=1
        {"99\n",     "18"},   // 9+9=18
        {"53\n",     "8"},    // 5+3=8
        // 三位数
        {"123\n",    "6"},    // 1+2+3=6
        {"999\n",    "27"},   // 9+9+9=27
        {"500\n",    "5"},    // 5+0+0=5
        // 四位数
        {"1000\n",   "1"},
        {"9999\n",   "36"},
        {"1234\n",   "10"},
        // 五位数
        {"10000\n",  "1"},
        {"100000\n", "1"},
        {"54321\n",  "15"},   // 5+4+3+2+1=15
        {"88888\n",  "40"},   // 8*5=40
    };

    int passed = 0;
    int failed = 0;
    vector<int> failIndices;
    vector<string> failInputs, failExpected, failActual;

    cout << "========================================" << endl;
    cout << "  编程题2「数字之和」自动测试" << endl;
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
            failIndices.push_back(i+1);
            failInputs.push_back(trim(tests[i].input));
            failExpected.push_back(tests[i].expected);
            failActual.push_back(actual);
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

        printf("  %-6s | %-12s | %-10s | %-10s\n", "编号", "输入(n)", "期望输出", "实际输出");
        printf("  %s\n", "-------+--------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-12s | %-10s | %-10s\n",
                   failIndices[i],
                   failInputs[i].c_str(),
                   failExpected[i].c_str(),
                   failActual[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl;
        cout << "  🎉 全部测试通过！" << endl;
        cout << endl;
    }

    return failed > 0 ? 1 : 0;
}
