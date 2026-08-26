#include <iostream>
#include <fstream>
#include <cstdlib>
#include <string>
#include <stack>

using namespace std;

// Reference solution for "括号匹配"
string referenceCheck(const string& s) {
    stack<char> st;
    for (int i = 0; i < (int)s.length(); i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') {
            st.push(c);
        } else {
            if (st.empty()) return "No";
            char top = st.top();
            if ((c == ')' && top == '(') || (c == ']' && top == '[') || (c == '}' && top == '{')) {
                st.pop();
            } else {
                return "No";
            }
        }
    }
    return st.empty() ? "Yes" : "No";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    string tests[] = {
        "{[()]}",
        "()",
        "[]{}()",
        "",
        "((()))",
        "([)]",
        "(((",
        ")))",
        "{[}]",
        "({[()]})",
        "(((((((((())))))))))",
        "()[]{}{[()]}",
        "(",
        ")",
        "{{{{}}}",
        "[](){}([{}])"
    };
    int numTests = 16;

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string expected = referenceCheck(tests[i]);

        string inputFile = "/tmp/test_10_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_10_prog2_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i] << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: \"" << tests[i] << "\"" << endl;
            cout << "  Expected: " << expected << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        string actual;
        getline(fout, actual);
        fout.close();

        // Trim trailing whitespace
        while (!actual.empty() && (actual.back() == '\n' || actual.back() == '\r' || actual.back() == ' '))
            actual.pop_back();

        if (actual == expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: \"" << tests[i] << "\"" << endl;
            cout << "  Expected: " << expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
