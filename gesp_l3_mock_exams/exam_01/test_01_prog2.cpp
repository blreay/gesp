#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <vector>

using namespace std;

// Reference solution for "矩阵对角线"
// Given N×N matrix, output sum of main diagonal + anti-diagonal (overlap counted once)
long long referenceSolution(int N, vector<vector<int>>& matrix) {
    long long sum = 0;
    for (int i = 0; i < N; i++) {
        sum += matrix[i][i]; // main diagonal
        if (i != N - 1 - i) {
            sum += matrix[i][N - 1 - i]; // anti-diagonal (skip if same as main)
        }
    }
    return sum;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test cases
    struct TestCase {
        int N;
        vector<vector<int>> matrix;
        long long expected;
    };

    vector<TestCase> tests;

    // Test 1: 1x1
    tests.push_back({1, {{5}}, 5});

    // Test 2: 2x2
    tests.push_back({2, {{1,2},{3,4}}, 1+4+2+3}); // 10

    // Test 3: 3x3
    tests.push_back({3, {{1,2,3},{4,5,6},{7,8,9}}, 1+5+9+3+7}); // 25 (center 5 counted once)

    // Test 4: 4x4
    tests.push_back({4, {{1,2,3,4},{5,6,7,8},{9,10,11,12},{13,14,15,16}}, 1+6+11+16+4+7+10+13}); // 68

    // Test 5: 3x3 with negatives
    tests.push_back({3, {{-1,0,1},{0,0,0},{1,0,-1}}, -1+0+(-1)+1+1}); // 0

    // Test 6: 5x5
    tests.push_back({5, {
        {1,2,3,4,5},
        {6,7,8,9,10},
        {11,12,13,14,15},
        {16,17,18,19,20},
        {21,22,23,24,25}
    }, 0}); // will compute below

    // Compute test 6 expected
    tests[5].expected = referenceSolution(5, tests[5].matrix);

    // Test 7: 2x2 all same
    tests.push_back({2, {{7,7},{7,7}}, 28});

    // Test 8: 3x3 large values
    tests.push_back({3, {{1000,2000,3000},{4000,5000,6000},{7000,8000,9000}}, 1000+5000+9000+3000+7000}); // 25000

    // Test 9: 4x4 zeros
    tests.push_back({4, {{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0}}, 0});

    // Test 10: 1x1 negative
    tests.push_back({1, {{-99}}, -99});

    // Test 11: 5x5 identity-like
    vector<vector<int>> identity5(5, vector<int>(5, 0));
    for (int i = 0; i < 5; i++) identity5[i][i] = 1;
    tests.push_back({5, identity5, 0});
    tests[10].expected = referenceSolution(5, tests[10].matrix);

    // Test 12: 3x3
    tests.push_back({3, {{9,8,7},{6,5,4},{3,2,1}}, 9+5+1+7+3}); // 25

    int passed = 0, failed = 0;

    for (int i = 0; i < (int)tests.size(); i++) {
        string inputFile = "/tmp/test_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_prog2_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].N << endl;
        for (int r = 0; r < tests[i].N; r++) {
            for (int c = 0; c < tests[i].N; c++) {
                fin << tests[i].matrix[r][c];
                if (c < tests[i].N - 1) fin << " ";
            }
            fin << endl;
        }
        fin.close();

        // Recompute expected with reference
        long long expected = referenceSolution(tests[i].N, tests[i].matrix);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  N=" << tests[i].N << endl;
            cout << "  Expected: " << expected << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        long long actual;
        fout >> actual;
        fout.close();

        if (actual == expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  N=" << tests[i].N << endl;
            cout << "  Expected: " << expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << tests.size() << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
