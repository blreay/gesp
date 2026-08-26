#include <iostream>
#include <fstream>
#include <cstdlib>
#include <string>
#include <algorithm>

using namespace std;

// Reference solution for "大整数加法"
string bigAdd(string a, string b) {
    reverse(a.begin(), a.end());
    reverse(b.begin(), b.end());
    string result = "";
    int carry = 0;
    int maxLen = max(a.length(), b.length());
    for (int i = 0; i < maxLen; i++) {
        int da = (i < (int)a.length()) ? (a[i] - '0') : 0;
        int db = (i < (int)b.length()) ? (b[i] - '0') : 0;
        int sum = da + db + carry;
        result += (char)('0' + sum % 10);
        carry = sum / 10;
    }
    if (carry) result += '1';
    reverse(result.begin(), result.end());
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test cases: {a, b}
    string testA[] = {
        "0", "0",
        "1", "9",
        "123", "456",
        "999", "1",
        "999999999999999999999999", "1",
        "12345678901234567890", "98765432109876543210",
        "1", "99999999999999999999999999999999999999999999999999",
        "55555555555555555555", "44444444444444444444",
        "0", "123456789",
        "100000000000000000000", "200000000000000000000",
        "9", "9",
        "11111111111111111111111111111111111111111111111111", "88888888888888888888888888888888888888888888888888"
    };
    string testB[] = {
        "0", "0",
        "1", "9",
        "123", "456",
        "999", "1",
        "999999999999999999999999", "1",
        "12345678901234567890", "98765432109876543210",
        "1", "99999999999999999999999999999999999999999999999999",
        "55555555555555555555", "44444444444444444444",
        "0", "123456789",
        "100000000000000000000", "200000000000000000000",
        "9", "9",
        "11111111111111111111111111111111111111111111111111", "88888888888888888888888888888888888888888888888888"
    };

    // Properly structured test cases
    struct TestCase { string a, b; };
    TestCase tests[] = {
        {"0", "0"},
        {"1", "9"},
        {"123", "456"},
        {"999", "1"},
        {"999999999999999999999999", "1"},
        {"12345678901234567890", "98765432109876543210"},
        {"1", "99999999999999999999999999999999999999999999999999"},
        {"55555555555555555555", "44444444444444444444"},
        {"0", "123456789"},
        {"100000000000000000000", "200000000000000000000"},
        {"9", "9"},
        {"11111111111111111111111111111111111111111111111111", "88888888888888888888888888888888888888888888888888"}
    };
    int numTests = 12;

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string expected = bigAdd(tests[i].a, tests[i].b);

        string inputFile = "/tmp/test_10_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_10_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].a << endl << tests[i].b << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: " << tests[i].a << " + " << tests[i].b << endl;
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
            cout << "  Input: " << tests[i].a << " + " << tests[i].b << endl;
            cout << "  Expected: " << expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
