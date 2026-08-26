#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

// Reference solution: Josephus problem
// N people in a circle, count to M, output elimination order
vector<int> josephus(int N, int M) {
    vector<int> people;
    for (int i = 1; i <= N; i++) people.push_back(i);

    vector<int> order;
    int idx = 0;
    while (!people.empty()) {
        idx = (idx + M - 1) % people.size();
        order.push_back(people[idx]);
        people.erase(people.begin() + idx);
        if (!people.empty() && idx >= (int)people.size()) idx = 0;
    }
    return order;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        int N, M;
    };

    TestCase tests[] = {
        {5, 2},    // classic small case
        {1, 1},    // single person
        {6, 3},    // another classic
        {10, 3},   // medium
        {7, 1},    // count by 1 (sequential)
        {10, 10},  // count equals size
        {3, 2},    // small
        {8, 4},    // medium
        {4, 3},    // small
        {12, 5},   // larger
        {10, 1},   // sequential elimination
        {5, 5},    // count equals size
    };

    int numTests = sizeof(tests) / sizeof(tests[0]);
    int passed = 0, failed = 0;

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_06_prog2_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_06_prog2_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << tests[t].N << " " << tests[t].M << endl;
        fin.close();

        vector<int> expected = josephus(tests[t].N, tests[t].M);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: N=" << tests[t].N << " M=" << tests[t].M << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        bool ok = true;
        for (int i = 0; i < (int)expected.size(); i++) {
            int val;
            if (!(fout >> val)) { ok = false; break; }
            if (val != expected[i]) { ok = false; break; }
        }
        fout.close();

        if (ok) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: N=" << tests[t].N << " M=" << tests[t].M << endl;
            cout << "  Expected: ";
            for (int i = 0; i < (int)expected.size(); i++) {
                if (i) cout << " ";
                cout << expected[i];
            }
            cout << endl;
            // Show actual
            ifstream fout2(outputFile);
            string line;
            cout << "  Actual: ";
            while (getline(fout2, line)) cout << line << " ";
            cout << endl;
            fout2.close();
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
