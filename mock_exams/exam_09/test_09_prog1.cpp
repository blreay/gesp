/*
 * GESP C++一级 模拟试卷(九) - 编程题1「鸡兔同笼」测试程序
 *
 * 用法: g++ -o test_09_prog1 test_09_prog1.cpp && ./test_09_prog1 <考生程序路径>
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
string solve(int h, int f) {
    int diff = f - 2 * h;
    if (diff < 0 || diff % 2 != 0) return "No Solution";
    int rabbit = diff / 2;
    int chicken = h - rabbit;
    if (chicken < 0) return "No Solution";
    return to_string(chicken) + " " + to_string(rabbit);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests = {
        // 样例
        {"10 28\n",     "6 4"},
        {"5 12\n",      "4 1"},
        {"10 19\n",     "No Solution"},
        // 全鸡
        {"10 20\n",     "10 0"},
        // 全兔
        {"10 40\n",     "0 10"},
        // 单只鸡
        {"1 2\n",       "1 0"},
        // 单只兔
        {"1 4\n",       "0 1"},
        // 零只
        {"0 0\n",       "0 0"},
        // 脚为奇数，无解
        {"3 7\n",       "No Solution"},
        // 脚太多，无解 (rabbit > h)
        {"10 50\n",     "No Solution"},
        // 脚太少，无解 (diff < 0)
        {"10 15\n",     "No Solution"},
        // 大数有解
        {"100 280\n",   ""},
        {"500 1200\n",  ""},
        // 边界：h=0, f>0 无解
        {"0 4\n",       "No Solution"},
        // h>0, f=0 无解 (diff = -2h < 0)
        {"5 0\n",       "No Solution"},
        // 刚好边界有解
        {"3 8\n",       "2 1"},
        // 大数有解
        {"1000 4000\n", "0 1000"},
        {"1000 2000\n", "1000 0"},
    };

    // Use reference solution to fill in computed expected values
    for (auto& t : tests) {
        if (t.expected.empty()) {
            istringstream iss(t.input);
            int h, f;
            iss >> h >> f;
            t.expected = solve(h, f);
        }
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题1「鸡兔同笼」自动测试" << endl;
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
        printf("  %-6s | %-15s | %-15s | %-15s\n", "编号", "输入(h f)", "期望输出", "实际输出");
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
