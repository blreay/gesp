/*
 * GESP C++一级 模拟试卷(一) - 编程题1「小杨的零花钱」测试程序
 *
 * 用法: g++ -o test_01_prog1 test_01_prog1.cpp && ./test_01_prog1 <考生程序路径>
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

// 去除字符串首尾空白
string trim(const string& s) {
    size_t start = s.find_first_not_of(" \t\r\n");
    if (start == string::npos) return "";
    size_t end = s.find_last_not_of(" \t\r\n");
    return s.substr(start, end - start + 1);
}

// 运行考生程序，传入输入，获取输出
string runProgram(const string& progPath, const string& input) {
    // 写入临时输入文件
    string tmpIn = "/tmp/gesp_test_in.txt";
    string tmpOut = "/tmp/gesp_test_out.txt";
    ofstream fin(tmpIn);
    fin << input;
    fin.close();

    string cmd = progPath + " < " + tmpIn + " > " + tmpOut + " 2>&1";
    int ret = system(cmd.c_str());

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

    // 定义测试用例: 输入 -> 期望输出
    // 题意: p=玩具价格, m=每月零花钱, s=每月花费, 求至少几个月攒够
    vector<TestCase> tests = {
        // 基础样例
        {"100\n30\n10\n",   "5"},    // 每月存20, 100/20=5
        {"50\n15\n5\n",     "5"},    // 每月存10, 50/10=5
        {"70\n15\n5\n",     "7"},    // 每月存10, 70/10=7 (需向上取整)
        // 刚好整除
        {"60\n20\n10\n",    "6"},    // 每月存10, 60/10=6
        // 需要向上取整
        {"61\n20\n10\n",    "7"},    // 每月存10, 61/10=6.1 -> 7
        // 极端: p=1
        {"1\n100\n1\n",     "1"},    // 一个月就够
        // 每月只存1元
        {"10\n2\n1\n",      "10"},   // 每月存1, 10/1=10
        // 大数据
        {"100000\n1000\n1\n", "101"}, // 每月存999, 100000/999=100.1 -> 101
        // 每月存很多
        {"1\n1000\n999\n",  "1"},    // 每月存1, 1/1=1
        // p刚好等于一个月的存款
        {"20\n25\n5\n",     "1"},    // 每月存20, 20/20=1
        // p比一个月存款少
        {"5\n100\n10\n",    "1"},    // 每月存90, 一个月即够
    };

    int passed = 0;
    int failed = 0;
    vector<int> failIndices;
    vector<string> failInputs, failExpected, failActual;

    cout << "========================================" << endl;
    cout << "  编程题1「小杨的零花钱」自动测试" << endl;
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
            failInputs.push_back(tests[i].input);
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

        // 打印表格
        printf("  %-6s | %-20s | %-10s | %-10s\n", "编号", "输入(p,m,s)", "期望输出", "实际输出");
        printf("  %s\n", "-------+----------------------+------------+-----------");
        for (int i = 0; i < failed; i++) {
            // 把换行替换为逗号显示
            string inp = failInputs[i];
            for (char& c : inp) {
                if (c == '\n') c = ',';
            }
            // 去掉尾部逗号
            while (!inp.empty() && inp.back() == ',') inp.pop_back();

            printf("  #%-5d | %-20s | %-10s | %-10s\n",
                   failIndices[i],
                   inp.c_str(),
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
