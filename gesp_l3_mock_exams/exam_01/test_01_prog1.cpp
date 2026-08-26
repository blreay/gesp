#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>

using namespace std;

// Reference solution for "数位之和"
// Given N, repeatedly sum digits until single digit. Output the digit and number of operations.
void referenceSolution(long long N, int &result, int &steps) {
    steps = 0;
    long long cur = N;
    while (cur >= 10) {
        long long sum = 0;
        while (cur > 0) {
            sum += cur % 10;
            cur /= 10;
        }
        cur = sum;
        steps++;
    }
    result = (int)cur;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        long long input;
        int expectedResult;
        int expectedSteps;
    };

    // Generate test cases
    TestCase tests[15];
    long long inputs[] = {5, 10, 19, 99, 100, 12345, 999999, 1, 38, 199, 86, 7654321, 11111111, 9999999999LL, 123456789};
    for (int i = 0; i < 15; i++) {
        tests[i].input = inputs[i];
        referenceSolution(inputs[i], tests[i].expectedResult, tests[i].expectedSteps);
    }

    int passed = 0, failed = 0;

    for (int i = 0; i < 15; i++) {
        // Write input to temp file
        string inputFile = "/tmp/test_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].input << endl;
        fin.close();

        // Run student program
        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: " << tests[i].input << endl;
            cout << "  Expected: " << tests[i].expectedResult << " " << tests[i].expectedSteps << endl;
            failed++;
            continue;
        }

        // Read output
        ifstream fout(outputFile);
        int actualResult = -1, actualSteps = -1;
        fout >> actualResult >> actualSteps;
        fout.close();

        if (actualResult == tests[i].expectedResult && actualSteps == tests[i].expectedSteps) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: " << tests[i].input << endl;
            cout << "  Expected: " << tests[i].expectedResult << " " << tests[i].expectedSteps << endl;
            cout << "  Actual:   " << actualResult << " " << actualSteps << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of 15 tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
