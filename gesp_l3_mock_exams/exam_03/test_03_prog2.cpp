#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>
#include <vector>

using namespace std;

// Reference solution for "数组旋转"
// Rotate array right by K positions using three-reversal method
void referenceRotate(vector<int> &arr, int k) {
    int n = arr.size();
    if (n == 0) return;
    k = k % n;
    if (k == 0) return;
    // reverse entire array
    for (int i = 0, j = n-1; i < j; i++, j--) swap(arr[i], arr[j]);
    // reverse first k elements
    for (int i = 0, j = k-1; i < j; i++, j--) swap(arr[i], arr[j]);
    // reverse remaining
    for (int i = k, j = n-1; i < j; i++, j--) swap(arr[i], arr[j]);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        int n, k;
        vector<int> arr;
    };

    TestCase tests[] = {
        {5, 2, {1,2,3,4,5}},
        {7, 3, {1,2,3,4,5,6,7}},
        {4, 0, {1,2,3,4}},
        {4, 4, {1,2,3,4}},
        {4, 8, {1,2,3,4}},
        {1, 5, {42}},
        {6, 1, {10,20,30,40,50,60}},
        {5, 5, {1,2,3,4,5}},
        {3, 1, {100,200,300}},
        {8, 3, {1,2,3,4,5,6,7,8}},
        {10, 7, {1,2,3,4,5,6,7,8,9,10}},
        {2, 1, {99, 1}},
    };

    int numTests = 12;
    int passed = 0, failed = 0;

    for (int i = 0; i < numTests; i++) {
        // Compute expected
        vector<int> expected = tests[i].arr;
        referenceRotate(expected, tests[i].k);

        string inputFile = "/tmp/test_03_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test_03_prog2_output_" + to_string(i) + ".txt";

        ofstream fin(inputFile);
        fin << tests[i].n << " " << tests[i].k << endl;
        for (int j = 0; j < tests[i].n; j++) {
            if (j > 0) fin << " ";
            fin << tests[i].arr[j];
        }
        fin << endl;
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            cout << "  Input: N=" << tests[i].n << " K=" << tests[i].k << " arr=[";
            for (int j = 0; j < tests[i].n; j++) cout << (j?",":"") << tests[i].arr[j];
            cout << "]" << endl;
            cout << "  Expected: ";
            for (int j = 0; j < (int)expected.size(); j++) cout << (j?" ":"") << expected[j];
            cout << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        vector<int> actual;
        int val;
        while (fout >> val) actual.push_back(val);
        fout.close();

        if (actual == expected) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (i+1) << ":" << endl;
            cout << "  Input: N=" << tests[i].n << " K=" << tests[i].k << " arr=[";
            for (int j = 0; j < tests[i].n; j++) cout << (j?",":"") << tests[i].arr[j];
            cout << "]" << endl;
            cout << "  Expected: ";
            for (int j = 0; j < (int)expected.size(); j++) cout << (j?" ":"") << expected[j];
            cout << endl;
            cout << "  Actual:   ";
            for (int j = 0; j < (int)actual.size(); j++) cout << (j?" ":"") << actual[j];
            cout << endl;
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
