#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>
#include <iomanip>

using namespace std;

// Reference solution: Pascal's Triangle
string referenceSolution(int n) {
    int a[20][20] = {0};
    for (int i = 0; i < n; i++) {
        a[i][0] = 1;
        a[i][i] = 1;
        for (int j = 1; j < i; j++)
            a[i][j] = a[i-1][j-1] + a[i-1][j];
    }
    ostringstream oss;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j <= i; j++)
            oss << setw(4) << a[i][j];
        if (i < n - 1) oss << "\n";
    }
    return oss.str();
}

// Trim trailing whitespace from each line for comparison
string normalizeOutput(const string& s) {
    istringstream iss(s);
    string line, result;
    bool first = true;
    while (getline(iss, line)) {
        // Trim trailing spaces
        while (!line.empty() && (line.back() == ' ' || line.back() == '\r'))
            line.pop_back();
        if (line.empty() && iss.eof()) break;
        if (!first) result += "\n";
        result += line;
        first = false;
    }
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    vector<int> testInputs = {1, 2, 3, 4, 5, 6, 7, 10, 15, 20};

    int passed = 0, failed = 0;
    int numTests = testInputs.size();

    for (int t = 0; t < numTests; t++) {
        int n = testInputs[t];
        string inputFile = "/tmp/test_07_prog2_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_07_prog2_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << n << endl;
        fin.close();

        string expected = normalizeOutput(referenceSolution(n));

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << " (N=" << n << "): Program exited with error" << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        string actual((istreambuf_iterator<char>(fout)), istreambuf_iterator<char>());
        fout.close();
        actual = normalizeOutput(actual);

        if (actual == expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << " (N=" << n << "):" << endl;
            // Show first few lines of difference
            istringstream expStream(expected), actStream(actual);
            string expLine, actLine;
            int lineNum = 0;
            bool shown = false;
            while (getline(expStream, expLine)) {
                lineNum++;
                if (!getline(actStream, actLine)) actLine = "(missing)";
                if (expLine != actLine && !shown) {
                    cout << "  First difference at line " << lineNum << ":" << endl;
                    cout << "  Expected: \"" << expLine << "\"" << endl;
                    cout << "  Actual:   \"" << actLine << "\"" << endl;
                    shown = true;
                }
            }
            if (!shown) {
                cout << "  Output has extra lines or different line count" << endl;
            }
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
