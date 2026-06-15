/*
 * GESP C++一级 模拟试卷(五) - 编程题1「闰年统计」测试程序
 *
 * 用法: g++ -o test_05_prog1 test_05_prog1.cpp && ./test_05_prog1 <考生程序路径>
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
int countLeapYears(int y1, int y2) {
    int cnt = 0;
    for (int y = y1; y <= y2; y++) {
        if ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0)
            cnt++;
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
        {"2000 2020\n",   ""},
        {"1900 1900\n",   ""},
        {"1 10\n",        ""},
        // 单个年份
        {"2024 2024\n",   ""},   // 2024 is leap
        {"2023 2023\n",   ""},   // 2023 is not leap
        {"2100 2100\n",   ""},   // divisible by 100 but not 400
        {"2000 2000\n",   ""},   // divisible by 400
        {"400 400\n",     ""},
        // 小范围
        {"1 100\n",       ""},
        {"1 400\n",       ""},
        // 边界：全是闰年
        {"4 8\n",         ""},   // 4, 8 both leap
        // 没有闰年
        {"1 3\n",         ""},   // 1,2,3 none leap
        {"1901 1903\n",   ""},
        // 大范围
        {"1 1000\n",      ""},
        {"1 10000\n",     ""},
        // 世纪年特殊
        {"100 300\n",     ""},
        {"1600 2000\n",   ""},
    };

    // Calculate expected values using reference implementation
    int testInputs[][2] = {
        {2000,2020}, {1900,1900}, {1,10},
        {2024,2024}, {2023,2023}, {2100,2100}, {2000,2000}, {400,400},
        {1,100}, {1,400},
        {4,8}, {1,3}, {1901,1903},
        {1,1000}, {1,10000},
        {100,300}, {1600,2000}
    };
    for (int i = 0; i < (int)tests.size(); i++) {
        tests[i].expected = to_string(countLeapYears(testInputs[i][0], testInputs[i][1]));
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「闰年统计」自动测试" << endl;
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
        printf("  %-6s | %-15s | %-10s | %-10s\n", "编号", "输入(Y1 Y2)", "期望输出", "实际输出");
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
