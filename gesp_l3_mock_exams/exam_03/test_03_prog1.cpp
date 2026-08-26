#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>

using namespace std;

// Reference solution for "密码生成器"
// Caesar cipher: shift letters by k positions (wrap around), digits and special chars unchanged
string referenceSolution(const string &s, int k) {
    k = ((k % 26) + 26) % 26; // normalize k
    string result = s;
    for (int i = 0; i < (int)result.size(); i++) {
        char c = result[i];
        if (c >= 'a' && c <= 'z') {
            result[i] = 'a' + (c - 'a' + k) % 26;
        } else if (c >= 'A' && c <= 'Z') {
            result[i] = 'A' + (c - 'A' + k) % 26;
        }
        // digits and special chars unchanged
    }
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        string input;
        int k;
        string expected;
    };

    TestCase tests[] = {
        {"abc", 3, ""},
        {"xyz", 3, ""},
        {"ABC", 1, ""},
        {"Hello", 5, ""},
        {"abcXYZ", 26, ""},
        {"a1b2c3", 1, ""},
        {"Test!123", 13, ""},
        {"ZZZZZ", 1, ""},
        {"aaaa", 25, ""},
        {"Pa$$w0rd", 7, ""},
        {"NoShift", 0, ""},
        {"Wrap around Z", 2, ""},
    };

    int numTests = 12;
    for (int i = 0; i < numTests; i++) {
        tests[i].expected = referenceSolution(tests[i].input, tests[i].k);
    }

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string inputFile = "/tmp/test_03_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_03_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].input << endl;
        fin << tests[i].k << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: \"" << tests[i].input << "\", k=" << tests[i].k << endl;
            cout << "  Expected: \"" << tests[i].expected << "\"" << endl;
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

        if (actual == tests[i].expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: \"" << tests[i].input << "\", k=" << tests[i].k << endl;
            cout << "  Expected: \"" << tests[i].expected << "\"" << endl;
            cout << "  Actual:   \"" << actual << "\"" << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
