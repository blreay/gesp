/*
 * GESP C++一级 模拟试卷(七) - 编程题2「数字三角形」测试程序
 *
 * 用法: g++ -o test_07_prog2 test_07_prog2.cpp && ./test_07_prog2 <考生程序路径>
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
string solve(int n) {
    string result;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= i; j++) {
            if (j > 1) result += " ";
            result += to_string(i);
        }
        if (i < n) result += "\n";
    }
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "用法: " << argv[0] << " <考生程序路径>" << endl;
        return 1;
    }
    string progPath = argv[1];

    vector<TestCase> tests;
    // Test n = 1 to 10 + some larger values
    int testValues[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20};
    for (int v : testValues) {
        tests.push_back({to_string(v) + "\n", solve(v)});
    }

    int passed = 0, failed = 0;
    vector<int> failIdx;
    vector<string> failIn, failExp, failAct;

    cout << "========================================" << endl;
    cout << "  编程题2「数字三角形」自动测试" << endl;
    cout << "  考生程序: " << progPath << endl;
    cout << "========================================" << endl;
    cout << endl;

    for (int i = 0; i < (int)tests.size(); i++) {
        string actual = runProgram(progPath, tests[i].input);
        if (actual == tests[i].expected) {
            passed++;
            cout << "  测试 #" << (i+1) << ": ✅ 通过 (n=" << trim(tests[i].input) << ")" << endl;
        } else {
            failed++;
            failIdx.push_back(i+1);
            failIn.push_back(trim(tests[i].input));
            // Show first line of expected vs actual for readability
            failExp.push_back(tests[i].expected.substr(0, 40) + (tests[i].expected.size() > 40 ? "..." : ""));
            failAct.push_back(actual.substr(0, 40) + (actual.size() > 40 ? "..." : ""));
            cout << "  测试 #" << (i+1) << ": ❌ 未通过 (n=" << trim(tests[i].input) << ")" << endl;
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
        printf("  %-6s | %-5s | %-42s | %-42s\n", "编号", "输入n", "期望输出(截断)", "实际输出(截断)");
        printf("  %s\n", "-------+-------+--------------------------------------------+-------------------------------------------");
        for (int i = 0; i < failed; i++) {
            string expShow = failExp[i], actShow = failAct[i];
            for (char& c : expShow) if (c == '\n') c = '|';
            for (char& c : actShow) if (c == '\n') c = '|';
            printf("  #%-5d | %-5s | %-42s | %-42s\n",
                   failIdx[i], failIn[i].c_str(),
                   expShow.c_str(), actShow.c_str());
        }
        cout << endl;
    } else {
        cout << endl << "  🎉 全部测试通过！" << endl << endl;
    }

    return failed > 0 ? 1 : 0;
}
