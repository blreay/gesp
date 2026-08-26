#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

// Reference solution: Matrix multiplication A(M x K) * B(K x N) = C(M x N)
vector<vector<long long>> matMul(const vector<vector<long long>>& A, const vector<vector<long long>>& B, int M, int K, int N) {
    vector<vector<long long>> C(M, vector<long long>(N, 0));
    for (int i = 0; i < M; i++)
        for (int j = 0; j < N; j++)
            for (int p = 0; p < K; p++)
                C[i][j] += A[i][p] * B[p][j];
    return C;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        int M, K, N;
        vector<vector<long long>> A;
        vector<vector<long long>> B;
    };

    vector<TestCase> tests = {
        // Test 1: 1x1 * 1x1
        {1, 1, 1, {{3}}, {{4}}},
        // Test 2: 2x2 * 2x2
        {2, 2, 2, {{1, 2}, {3, 4}}, {{5, 6}, {7, 8}}},
        // Test 3: 2x3 * 3x2
        {2, 3, 2, {{1, 2, 3}, {4, 5, 6}}, {{7, 8}, {9, 10}, {11, 12}}},
        // Test 4: 1x3 * 3x1
        {1, 3, 1, {{1, 2, 3}}, {{4}, {5}, {6}}},
        // Test 5: 3x1 * 1x3
        {3, 1, 3, {{1}, {2}, {3}}, {{4, 5, 6}}},
        // Test 6: Identity 3x3 * 3x3
        {3, 3, 3, {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}, {{5, 6, 7}, {8, 9, 10}, {11, 12, 13}}},
        // Test 7: Zero matrix
        {2, 2, 2, {{0, 0}, {0, 0}}, {{1, 2}, {3, 4}}},
        // Test 8: Negative values
        {2, 2, 2, {{-1, 2}, {3, -4}}, {{5, -6}, {-7, 8}}},
        // Test 9: 3x2 * 2x4
        {3, 2, 4, {{1, 2}, {3, 4}, {5, 6}}, {{1, 2, 3, 4}, {5, 6, 7, 8}}},
        // Test 10: Larger values
        {2, 2, 2, {{100, 200}, {300, 400}}, {{500, 600}, {700, 800}}},
        // Test 11: 4x3 * 3x2
        {4, 3, 2, {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}, {10, 11, 12}}, {{1, 2}, {3, 4}, {5, 6}}},
        // Test 12: Single row * single col yields 1x1
        {1, 4, 1, {{1, 2, 3, 4}}, {{1}, {1}, {1}, {1}}},
    };

    int passed = 0, failed = 0;
    int numTests = tests.size();

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_05_prog2_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_05_prog2_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << tests[t].M << " " << tests[t].K << " " << tests[t].N << endl;
        for (int i = 0; i < tests[t].M; i++) {
            for (int j = 0; j < tests[t].K; j++) {
                if (j) fin << " ";
                fin << tests[t].A[i][j];
            }
            fin << endl;
        }
        for (int i = 0; i < tests[t].K; i++) {
            for (int j = 0; j < tests[t].N; j++) {
                if (j) fin << " ";
                fin << tests[t].B[i][j];
            }
            fin << endl;
        }
        fin.close();

        // Compute expected
        vector<vector<long long>> expected = matMul(tests[t].A, tests[t].B, tests[t].M, tests[t].K, tests[t].N);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: M=" << tests[t].M << " K=" << tests[t].K << " N=" << tests[t].N << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        bool ok = true;
        for (int i = 0; i < tests[t].M && ok; i++) {
            for (int j = 0; j < tests[t].N && ok; j++) {
                long long val;
                if (!(fout >> val)) { ok = false; break; }
                if (val != expected[i][j]) ok = false;
            }
        }
        fout.close();

        if (ok) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: M=" << tests[t].M << " K=" << tests[t].K << " N=" << tests[t].N << endl;
            cout << "  Expected output:" << endl;
            for (int i = 0; i < tests[t].M; i++) {
                cout << "    ";
                for (int j = 0; j < tests[t].N; j++) {
                    if (j) cout << " ";
                    cout << expected[i][j];
                }
                cout << endl;
            }
            // Show actual
            ifstream fout2(outputFile);
            string line;
            cout << "  Actual output:" << endl;
            while (getline(fout2, line)) {
                cout << "    " << line << endl;
            }
            fout2.close();
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
