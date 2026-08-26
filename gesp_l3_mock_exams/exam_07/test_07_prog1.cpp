#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

// Reference solution: GCD and LCM of N numbers
long long gcd(long long a, long long b) {
    while (b != 0) {
        long long t = b;
        b = a % b;
        a = t;
    }
    return a;
}

long long lcm(long long a, long long b) {
    return a / gcd(a, b) * b;
}

pair<long long, long long> referenceSolution(vector<long long>& nums) {
    long long g = nums[0], l = nums[0];
    for (int i = 1; i < (int)nums.size(); i++) {
        g = gcd(g, nums[i]);
        l = lcm(l, nums[i]);
    }
    return {g, l};
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        vector<long long> nums;
    };

    vector<TestCase> tests = {
        {{12, 18, 24}},
        {{7, 13}},
        {{6, 6, 6}},
        {{1, 100}},
        {{2, 3, 4, 5, 6}},
        {{100, 75, 50, 25}},
        {{17, 34, 51}},
        {{1000000, 999999}},
        {{48, 36, 24, 12}},
        {{7, 11, 13, 17}},
        {{15, 25, 35}},
        {{8, 12, 16, 20, 24}},
    };

    int passed = 0, failed = 0;
    int numTests = tests.size();

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_07_prog1_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_07_prog1_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << tests[t].nums.size() << endl;
        for (int i = 0; i < (int)tests[t].nums.size(); i++) {
            if (i > 0) fin << " ";
            fin << tests[t].nums[i];
        }
        fin << endl;
        fin.close();

        auto expected = referenceSolution(tests[t].nums);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: N=" << tests[t].nums.size() << ", nums=";
            for (auto x : tests[t].nums) cout << x << " ";
            cout << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        long long aGcd, aLcm;
        bool readOk = true;
        if (!(fout >> aGcd >> aLcm)) {
            readOk = false;
        }
        fout.close();

        if (readOk && aGcd == expected.first && aLcm == expected.second) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: N=" << tests[t].nums.size() << ", nums=";
            for (auto x : tests[t].nums) cout << x << " ";
            cout << endl;
            cout << "  Expected: " << expected.first << " " << expected.second << endl;
            if (readOk) {
                cout << "  Actual:   " << aGcd << " " << aLcm << endl;
            } else {
                cout << "  Actual:   (could not read output)" << endl;
            }
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
