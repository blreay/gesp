#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <sstream>

using namespace std;

// Reference solution for expression evaluation (no parentheses, + - * / with precedence)
int referenceEval(const string& expr) {
    vector<int> nums;
    vector<char> ops;
    int num = 0;
    for (int i = 0; i <= (int)expr.size(); i++) {
        if (i == (int)expr.size() || expr[i] == '+' || expr[i] == '-' ||
            expr[i] == '*' || expr[i] == '/') {
            nums.push_back(num);
            if (i < (int)expr.size()) ops.push_back(expr[i]);
            num = 0;
        } else {
            num = num * 10 + (expr[i] - '0');
        }
    }

    // Process * and /
    vector<int> nums2;
    vector<char> ops2;
    nums2.push_back(nums[0]);
    for (int i = 0; i < (int)ops.size(); i++) {
        if (ops[i] == '*') {
            nums2.back() *= nums[i+1];
        } else if (ops[i] == '/') {
            nums2.back() /= nums[i+1];
        } else {
            ops2.push_back(ops[i]);
            nums2.push_back(nums[i+1]);
        }
    }

    // Process + and -
    int result = nums2[0];
    for (int i = 0; i < (int)ops2.size(); i++) {
        if (ops2[i] == '+') result += nums2[i+1];
        else result -= nums2[i+1];
    }
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test cases
    string testInputs[] = {
        "3+2*4-6/3",
        "100-50*2+25",
        "1+1",
        "10",
        "2*3*4",
        "100/10/2",
        "1+2+3+4+5",
        "10-3-2-1",
        "2*3+4*5",
        "100-99*1",
        "7+3*6-2/1",
        "1000/10*2+500-100",
        "9*9*9",
        "1+2*3-4+5*6-7",
        "99/3+1*2-10"
    };

    int numTests = 15;
    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        int expected = referenceEval(testInputs[i]);

        string inputFile = "/tmp/test_09_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_09_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << testInputs[i] << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: " << testInputs[i] << endl;
            cout << "  Expected: " << expected << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        int actual = -999999;
        fout >> actual;
        fout.close();

        if (actual == expected) {
            cout << "[PASS] Test " << (i+1) << ": " << testInputs[i] << " = " << expected << endl;
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: " << testInputs[i] << endl;
            cout << "  Expected: " << expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
