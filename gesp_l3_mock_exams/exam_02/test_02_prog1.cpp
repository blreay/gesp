#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <cctype>
#include <vector>

using namespace std;

// Reference solution for "回文判断"
// Ignore case, only consider alphanumeric characters
bool isPalindrome(const string& s) {
    string filtered;
    for (char c : s) {
        if (isalnum(c)) {
            filtered += tolower(c);
        }
    }
    int left = 0, right = (int)filtered.size() - 1;
    while (left < right) {
        if (filtered[left] != filtered[right]) return false;
        left++;
        right--;
    }
    return true;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test cases: each is a set of strings
    struct TestCase {
        vector<string> strings;
        vector<string> expected; // "Y" or "N" for each
    };

    vector<TestCase> tests;

    // Test 1: single palindrome
    tests.push_back({{"abcba"}, {"Y"}});

    // Test 2: single non-palindrome
    tests.push_back({{"hello"}, {"N"}});

    // Test 3: mixed case palindrome
    tests.push_back({{"AbBa"}, {"Y"}});

    // Test 4: with spaces and punctuation
    tests.push_back({{"A man, a plan, a canal: Panama"}, {"Y"}});

    // Test 5: empty after filtering - treat as palindrome
    tests.push_back({{",.!?"}, {"Y"}});

    // Test 6: single character
    tests.push_back({{"a"}, {"Y"}});

    // Test 7: numbers
    tests.push_back({{"12321"}, {"Y"}});

    // Test 8: numbers not palindrome
    tests.push_back({{"12345"}, {"N"}});

    // Test 9: mixed alphanumeric palindrome
    tests.push_back({{"1a2b2a1"}, {"Y"}});

    // Test 10: multiple strings
    tests.push_back({{"level", "hello", "RaceCar", "abc"}, {"Y", "N", "Y", "N"}});

    // Test 11: two char palindrome
    tests.push_back({{"aa"}, {"Y"}});

    // Test 12: two char non-palindrome
    tests.push_back({{"ab"}, {"N"}});

    int passed = 0, failed = 0;

    for (int i = 0; i < (int)tests.size(); i++) {
        string inputFile = "/tmp/test02_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test02_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].strings.size() << endl;
        for (const string& s : tests[i].strings) {
            fin << s << endl;
        }
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        bool testPassed = true;
        for (int j = 0; j < (int)tests[i].expected.size(); j++) {
            string actual;
            if (!(fout >> actual)) {
                actual = "(no output)";
            }
            // Normalize: accept "Y"/"y"/"Yes"/"yes" and "N"/"n"/"No"/"no"
            string normActual, normExpected;
            if (actual == "Y" || actual == "y" || actual == "Yes" || actual == "yes" || actual == "YES")
                normActual = "Y";
            else
                normActual = "N";
            normExpected = tests[i].expected[j];

            if (normActual != normExpected) {
                if (testPassed) {
                    cout << "[FAIL] Test " << (i+1) << ":" << endl;
                    cout << "  Input strings: ";
                    for (const string& s : tests[i].strings) cout << "\"" << s << "\" ";
                    cout << endl;
                }
                cout << "  String " << (j+1) << ": Expected " << normExpected << ", Got " << actual << endl;
                testPassed = false;
            }
        }
        fout.close();

        if (testPassed) {
            passed++;
        } else {
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << tests.size() << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
