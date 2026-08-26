#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>
#include <vector>

using namespace std;

// Reference solution for "蛇形矩阵"
// Fill NxN matrix in spiral order (right->down->left->up) with 1..N*N
void referenceSolution(int n, vector<vector<int>> &mat) {
    mat.assign(n, vector<int>(n, 0));
    int top = 0, bottom = n-1, left = 0, right = n-1;
    int num = 1;
    while (num <= n*n) {
        // go right
        for (int j = left; j <= right && num <= n*n; j++)
            mat[top][j] = num++;
        top++;
        // go down
        for (int i = top; i <= bottom && num <= n*n; i++)
            mat[i][right] = num++;
        right--;
        // go left
        for (int j = right; j >= left && num <= n*n; j--)
            mat[bottom][j] = num++;
        bottom--;
        // go up
        for (int i = bottom; i >= top && num <= n*n; i--)
            mat[i][left] = num++;
        left++;
    }
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    int inputs[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    int numTests = 10;

    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        int n = inputs[i];
        vector<vector<int>> expected;
        referenceSolution(n, expected);

        string inputFile = "/tmp/test_04_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_04_prog2_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << n << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error (N=" << n << ")" << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        bool match = true;
        for (int r = 0; r < n && match; r++) {
            for (int c = 0; c < n && match; c++) {
                int val;
                if (!(fout >> val)) { match = false; break; }
                if (val != expected[r][c]) match = false;
            }
        }
        fout.close();

        if (match) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << " (N=" << n << "):" << endl;
            cout << "  Expected matrix:" << endl;
            for (int r = 0; r < n; r++) {
                cout << "    ";
                for (int c = 0; c < n; c++) cout << expected[r][c] << " ";
                cout << endl;
            }
            // Show actual
            ifstream fout2(outputFile);
            string line;
            cout << "  Actual output:" << endl;
            while (getline(fout2, line)) cout << "    " << line << endl;
            fout2.close();
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
