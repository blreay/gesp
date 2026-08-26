#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <queue>
#include <sstream>

using namespace std;

// Reference BFS solution for maze shortest path
int referenceBFS(int maze[][105], int n, int m) {
    if (n == 1 && m == 1) return 0;
    int vis[105][105] = {};
    int dx[] = {0, 0, 1, -1};
    int dy[] = {1, -1, 0, 0};
    queue<pair<int,int>> q;
    q.push({0, 0});
    vis[0][0] = 1;
    int steps = 0;
    while (!q.empty()) {
        steps++;
        int sz = q.size();
        for (int k = 0; k < sz; k++) {
            auto pr = q.front(); q.pop();
            int x = pr.first, y = pr.second;
            for (int d = 0; d < 4; d++) {
                int nx = x + dx[d], ny = y + dy[d];
                if (nx >= 0 && nx < n && ny >= 0 && ny < m
                    && !vis[nx][ny] && maze[nx][ny] == 0) {
                    if (nx == n-1 && ny == m-1) return steps;
                    vis[nx][ny] = 1;
                    q.push({nx, ny});
                }
            }
        }
    }
    return -1;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test cases: {n, m, maze_data[], expected}
    struct TestCase {
        string input;
        int expected;
    };

    TestCase tests[] = {
        // Test 1: simple 3x3
        {"3 3\n0 0 0\n0 1 0\n0 0 0\n", 4},
        // Test 2: blocked
        {"3 3\n0 1 0\n1 1 0\n0 0 0\n", -1},
        // Test 3: 1x1
        {"1 1\n0\n", 0},
        // Test 4: straight path
        {"1 5\n0 0 0 0 0\n", 4},
        // Test 5: vertical path
        {"5 1\n0\n0\n0\n0\n0\n", 4},
        // Test 6: 4x4 with path
        {"4 4\n0 0 1 0\n1 0 1 0\n1 0 0 0\n1 1 1 0\n", 5},
        // Test 7: 4x4 blocked
        {"4 4\n0 0 1 0\n1 0 1 0\n1 0 0 1\n1 1 1 0\n", -1},
        // Test 8: 5x5 zigzag
        {"5 5\n0 1 0 0 0\n0 1 0 1 0\n0 0 0 1 0\n0 1 1 1 0\n0 0 0 0 0\n", 8},
        // Test 9: 2x2
        {"2 2\n0 0\n0 0\n", 2},
        // Test 10: 2x2 blocked
        {"2 2\n0 1\n1 0\n", -1},
        // Test 11: large open 5x5
        {"5 5\n0 0 0 0 0\n0 0 0 0 0\n0 0 0 0 0\n0 0 0 0 0\n0 0 0 0 0\n", 8},
        // Test 12: 3x4
        {"3 4\n0 0 0 0\n1 1 1 0\n0 0 0 0\n", 5},
    };

    int numTests = 12;
    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        string inputFile = "/tmp/test_09_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_09_prog2_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].input;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Expected: " << tests[i].expected << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        int actual = -999;
        fout >> actual;
        fout.close();

        if (actual == tests[i].expected) {
            cout << "[PASS] Test " << (i+1) << ": expected " << tests[i].expected << ", got " << actual << endl;
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Expected: " << tests[i].expected << endl;
            cout << "  Actual:   " << actual << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
