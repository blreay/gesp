#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>
#include <cmath>

using namespace std;

// Reference solution: N-digit narcissistic numbers in [L, R]
vector<long long> referenceSolution(long long L, long long R, int N) {
    vector<long long> result;
    for (long long num = L; num <= R; num++) {
        long long sum = 0, tmp = num;
        while (tmp > 0) {
            int d = tmp % 10;
            long long pw = 1;
            for (int i = 0; i < N; i++) pw *= d;
            sum += pw;
            tmp /= 10;
        }
        if (sum == num) {
            result.push_back(num);
        }
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
        long long L, R;
        int N;
    };

    vector<TestCase> tests = {
        {100, 999, 3},
        {200, 300, 3},
        {1, 9, 1},
        {10, 99, 2},
        {1000, 9999, 4},
        {100, 200, 3},
        {370, 410, 3},
        {8000, 9000, 4},
        {1000000, 9999999, 7},
        {150, 160, 3},
        {400, 500, 3},
        {9800, 9999, 4},
    };

    int passed = 0, failed = 0;
    int numTests = tests.size();

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_08_prog1_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_08_prog1_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << tests[t].L << " " << tests[t].R << " " << tests[t].N << endl;
        fin.close();

        vector<long long> expected = referenceSolution(tests[t].L, tests[t].R, tests[t].N);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: L=" << tests[t].L << " R=" << tests[t].R << " N=" << tests[t].N << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        vector<string> lines;
        string line;
        while (getline(fout, line)) {
            // trim
            while (!line.empty() && (line.back() == '\r' || line.back() == ' '))
                line.pop_back();
            if (!line.empty())
                lines.push_back(line);
        }
        fout.close();

        // Build expected output
        vector<string> expLines;
        if (expected.empty()) {
            expLines.push_back("None");
        } else {
            for (auto v : expected)
                expLines.push_back(to_string(v));
        }

        bool ok = (lines.size() == expLines.size());
        if (ok) {
            for (int i = 0; i < (int)lines.size(); i++) {
                if (lines[i] != expLines[i]) { ok = false; break; }
            }
        }

        if (ok) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: L=" << tests[t].L << " R=" << tests[t].R << " N=" << tests[t].N << endl;
            cout << "  Expected " << expLines.size() << " line(s): ";
            for (auto& s : expLines) cout << s << " ";
            cout << endl;
            cout << "  Actual " << lines.size() << " line(s): ";
            for (auto& s : lines) cout << s << " ";
            cout << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
