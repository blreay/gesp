/*
 * GESP C++一级 模拟试卷(二) - 编程题2「水仙花数」测试程序
 *
 * 用法: g++ -o test_02_prog2 test_02_prog2.cpp && ./test_02_prog2 <考生程序路径>
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

    // 水仙花数只有4个: 153, 370, 371, 407
    vector<TestCase> tests = {
        // 样例
        {"100 400\n",   "153\n370\n371"},
        {"100 999\n",   "153\n370\n371\n407"},
        {"200 300\n",   "None"},
        // 精确包含单个水仙花数
        {"153 153\n",   "153"},
        {"370 370\n",   "370"},
        {"371 371\n",   "371"},
        {"407 407\n",   "407"},
        // 不包含任何水仙花数
        {"100 152\n",   "None"},
        {"154 369\n",   "None"},
        {"408 999\n",   "None"},
        // 刚好包含
        {"153 407\n",   "153\n370\n371\n407"},
        {"370 371\n",   "370\n371"},
        // 边界
        {"100 100\n",   "None"},
        {"999 999\n",   "None"},
        // 全范围
        {"100 999\n",   "153\n370\n371\n407"},
        // 刚好边界
        {"153 371\n",   "153\n370\n371"},
        {"371 407\n",   "371\n407"},
    };

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「水仙花数」自动测试" << endl;
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
        printf("  %-6s | %-12s | %-25s | %-25s\n", "编号", "输入(A B)", "期望输出", "实际输出");
        printf("  %s\n", "-------+--------------+---------------------------+--------------------------");
        for (int i = 0; i < failed; i++) {
            // 将换行替换为空格便于表格展示
            string expShow = failExp[i], actShow = failAct[i];
            for (char& c : expShow) if (c == '\n') c = ' ';
            for (char& c : actShow) if (c == '\n') c = ' ';
            printf("  #%-5d | %-12s | %-25s | %-25s\n",
                   failIdx[i], failIn[i].c_str(),
                   expShow.c_str(), actShow.c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
