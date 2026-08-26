#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

using namespace std;

struct Triple {
    int row, col, val;
};

// Reference solution: Sparse matrix compression
vector<Triple> referenceSolution(vector<vector<int>>& mat) {
    vector<Triple> result;
    int M = mat.size(), N = mat[0].size();
    for (int i = 0; i < M; i++)
        for (int j = 0; j < N; j++)
            if (mat[i][j] != 0)
                result.push_back({i+1, j+1, mat[i][j]});
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        int M, N;
        vector<vector<int>> mat;
    };

    vector<TestCase> tests = {
        {3, 4, {{0,0,3,0},{0,0,0,0},{0,2,0,5}}},
        {1, 1, {{0}}},
        {1, 1, {{7}}},
        {2, 2, {{1,0},{0,1}}},
        {3, 3, {{0,0,0},{0,0,0},{0,0,0}}},
        {2, 3, {{1,2,3},{4,5,6}}},
        {4, 4, {{0,0,0,0},{0,5,0,0},{0,0,0,0},{0,0,0,9}}},
        {1, 5, {{0,0,3,0,0}}},
        {5, 1, {{1},{0},{2},{0},{3}}},
        {3, 3, {{-1,0,2},{0,-3,0},{4,0,-5}}},
        {2, 4, {{0,0,0,0},{0,0,0,0}}},
        {3, 3, {{1000,0,-1000},{0,999,0},{-999,0,1}}},
    };

    int passed = 0, failed = 0;
    int numTests = tests.size();

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_08_prog2_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_08_prog2_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << tests[t].M << " " << tests[t].N << endl;
        for (int i = 0; i < tests[t].M; i++) {
            for (int j = 0; j < tests[t].N; j++) {
                if (j > 0) fin << " ";
                fin << tests[t].mat[i][j];
            }
            fin << endl;
        }
        fin.close();

        vector<Triple> expected = referenceSolution(tests[t].mat);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: " << tests[t].M << "x" << tests[t].N << " matrix" << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        int k;
        bool readOk = true;
        if (!(fout >> k)) readOk = false;

        bool ok = true;
        if (!readOk || k != (int)expected.size()) {
            ok = false;
        } else {
            for (int i = 0; i < k; i++) {
                int r, c, v;
                if (!(fout >> r >> c >> v)) { ok = false; break; }
                if (r != expected[i].row || c != expected[i].col || v != expected[i].val) {
                    ok = false;
                    break;
                }
            }
        }
        fout.close();

        if (ok) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: " << tests[t].M << "x" << tests[t].N << " matrix" << endl;
            cout << "  Expected " << expected.size() << " triples" << endl;
            if (readOk) {
                cout << "  Actual k=" << k << endl;
            } else {
                cout << "  Actual: (could not read output)" << endl;
            }
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
