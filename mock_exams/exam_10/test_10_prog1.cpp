/*
 * GESP C++一级 模拟试卷(十) - 编程题1「商店折扣」测试程序
 *
 * 用法: g++ -o test_10_prog1 test_10_prog1.cpp && ./test_10_prog1 <考生程序路径>
 */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
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
string solve(double p, int n) {
    double total = p * n;
    double pay;
    if (total <= 100)
        pay = total;
    else if (total <= 300)
        pay = total * 0.9;
    else
        pay = total * 0.8;
    char buf[64];
    sprintf(buf, "%.2f", pay);
    return string(buf);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"50 3\n",      "135.00"},
        {"10 5\n",      "50.00"},
        {"100 5\n",     "400.00"},
        // 边界：刚好100
        {"25 4\n",      "100.00"},
        // 刚超过100
        {"25.5 4\n",    ""},
        // 刚好300
        {"300 1\n",     "270.00"},
        // 刚超过300
        {"300.1 1\n",   ""},
        // 不打折小额
        {"0.5 1\n",     "0.50"},
        {"19.9 5\n",    ""},
        // 打9折
        {"33.5 2\n",    ""},
        {"100 1\n",     "100.00"},
        {"100.1 1\n",   ""},
        // 打8折
        {"50 10\n",     "400.00"},
        {"1000 1\n",    "800.00"},
        // 大数
        {"10000 1000\n", ""},
        // 小数精度
        {"3.33 10\n",   ""},
        {"99.99 1\n",   ""},
        {"1.01 100\n",  ""},
    };

    // Fill in computed expected values using reference solution
    for (auto& t : tests) {
        if (t.expected.empty()) {
            istringstream iss(t.input);
            double p; int n;
            iss >> p >> n;
            t.expected = solve(p, n);
        }
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「商店折扣」自动测试" << endl;
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
        printf("  %-6s | %-15s | %-15s | %-15s\n", "编号", "输入(p n)", "期望输出", "实际输出");
        printf("  %s\n", "-------+-----------------+-----------------+----------------");
        for (int i = 0; i < failed; i++) {
            printf("  #%-5d | %-15s | %-15s | %-15s\n",
                   failIdx[i], failIn[i].c_str(),
                   failExp[i].c_str(), failAct[i].c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
