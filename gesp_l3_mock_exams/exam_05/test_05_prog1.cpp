#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>

using namespace std;

// Reference solution: convert decimal integer N to base B (2<=B<=16)
// Negative numbers output with '-' prefix. Hex uses uppercase A-F.
string referenceSolution(long long N, int B) {
    if (N == 0) return "0";
    string result = "";
    bool negative = false;
    if (N < 0) {
        negative = true;
        N = -N;
    }
    while (N > 0) {
        int rem = N % B;
        if (rem < 10)
            result = char('0' + rem) + result;
        else
            result = char('A' + rem - 10) + result;
        N /= B;
    }
    if (negative) result = "-" + result;
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        long long N;
        int B;
        string expected;
    };

    TestCase tests[] = {
        {10, 2, ""},
        {255, 16, ""},
        {0, 2, ""},
        {0, 16, ""},
        {-10, 2, ""},
        {-255, 16, ""},
        {100, 8, ""},
        {1024, 2, ""},
        {65535, 16, ""},
        {7, 7, ""},
        {15, 16, ""},
        {-1, 2, ""},
        {123456, 16, ""},
        {2147483647LL, 16, ""},
        {-2147483648LL, 16, ""},
    };

    int numTests = sizeof(tests) / sizeof(tests[0]);

    // Compute expected answers
    for (int i = 0; i < numTests; i++) {
        tests[i].expected = referenceSolution(tests[i].N, tests[i].B);
    }

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string inputFile = "/tmp/test_05_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_05_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].N << " " << tests[i].B << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: N=" << tests[i].N << " B=" << tests[i].B << endl;
            cout << "  Expected: " << tests[i].expected << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        string actual;
        fout >> actual;
        fout.close();

        if (actual == tests[i].expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: N=" << tests[i].N << " B=" << tests[i].B << endl;
            cout << "  Expected: " << tests[i].expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
