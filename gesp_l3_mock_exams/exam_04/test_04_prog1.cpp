#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>
#include <vector>

using namespace std;

// Reference solution for "质因数分解"
// Input N, output N=p1*p2*...*pk (prime factors in ascending order)
string referenceSolution(long long n) {
    ostringstream oss;
    oss << n << "=";
    bool first = true;
    for (long long i = 2; i * i <= n; i++) {
        while (n % i == 0) {
            if (!first) oss << "*";
            oss << i;
            first = false;
            n /= i;
        }
    }
    if (n > 1) {
        if (!first) oss << "*";
        oss << n;
    }
    return oss.str();
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    long long inputs[] = {2, 3, 4, 6, 12, 100, 97, 1000000, 999983, 360, 65536, 2310};
    int numTests = 12;

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string expected = referenceSolution(inputs[i]);

        string inputFile = "/tmp/test_04_prog1_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_04_prog1_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << inputs[i] << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: " << inputs[i] << endl;
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
            cout << "  Input: " << inputs[i] << endl;
            cout << "  Expected: " << expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
