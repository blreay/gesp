#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

// Reference solution for "成绩统计"
// Input N students, each with name and 3 scores
// Output rank, name, total sorted by total descending (stable)
struct Student {
    string name;
    int s1, s2, s3;
    int total;
    int order;
};

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    struct TestCase {
        int N;
        vector<Student> students;
    };

    vector<TestCase> tests;

    // Test 1: basic
    tests.push_back({3, {{"Alice",90,80,70,0,0}, {"Bob",80,90,85,0,0}, {"Charlie",70,60,50,0,0}}});

    // Test 2: same total
    tests.push_back({3, {{"A",80,80,80,0,0}, {"B",90,70,80,0,0}, {"C",70,90,80,0,0}}});

    // Test 3: single student
    tests.push_back({1, {{"Solo",100,100,100,0,0}}});

    // Test 4: two students reversed
    tests.push_back({2, {{"Low",50,50,50,0,0}, {"High",90,90,90,0,0}}});

    // Test 5: all same
    tests.push_back({4, {{"A",80,80,80,0,0}, {"B",80,80,80,0,0}, {"C",80,80,80,0,0}, {"D",80,80,80,0,0}}});

    // Test 6: larger
    tests.push_back({5, {{"Tom",95,88,92,0,0}, {"Jerry",78,85,90,0,0}, {"Spike",100,100,100,0,0}, {"Tyke",60,70,65,0,0}, {"Nibbles",88,88,88,0,0}}});

    // Test 7: min scores
    tests.push_back({2, {{"Zero",0,0,0,0,0}, {"One",1,0,0,0,0}}});

    // Test 8: max scores
    tests.push_back({2, {{"Max",100,100,100,0,0}, {"AlmostMax",99,100,100,0,0}}});

    // Test 9: descending input
    tests.push_back({3, {{"First",100,100,100,0,0}, {"Second",90,90,90,0,0}, {"Third",80,80,80,0,0}}});

    // Test 10: ascending input
    tests.push_back({3, {{"Third",80,80,80,0,0}, {"Second",90,90,90,0,0}, {"First",100,100,100,0,0}}});

    int passed = 0, failed = 0;

    for (int i = 0; i < (int)tests.size(); i++) {
        string inputFile = "/tmp/test02_prog2_input_" + to_string(i) + ".txt";
        string outputFile = "/tmp/test02_prog2_output_" + to_string(i) + ".txt";

        // Compute expected
        vector<Student> students = tests[i].students;
        for (int j = 0; j < (int)students.size(); j++) {
            students[j].total = students[j].s1 + students[j].s2 + students[j].s3;
            students[j].order = j;
        }
        stable_sort(students.begin(), students.end(), [](const Student& a, const Student& b) {
            return a.total > b.total;
        });

        // Write input
        ofstream fin(inputFile);
        fin << tests[i].N << endl;
        for (int j = 0; j < tests[i].N; j++) {
            fin << tests[i].students[j].name << " "
                << tests[i].students[j].s1 << " "
                << tests[i].students[j].s2 << " "
                << tests[i].students[j].s3 << endl;
        }
        fin.close();

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (i+1) << ": Program exited with error" << endl;
            failed++;
            continue;
        }

        // Read output and compare
        ifstream fout(outputFile);
        bool testPassed = true;
        for (int j = 0; j < (int)students.size(); j++) {
            int rank;
            string name;
            int total;
            if (!(fout >> rank >> name >> total)) {
                if (testPassed) {
                    cout << "[FAIL] Test " << (i+1) << ": Insufficient output lines" << endl;
                }
                testPassed = false;
                break;
            }
            if (rank != j+1 || name != students[j].name || total != students[j].total) {
                if (testPassed) {
                    cout << "[FAIL] Test " << (i+1) << ":" << endl;
                }
                cout << "  Line " << (j+1) << ": Expected \"" << (j+1) << " " << students[j].name << " " << students[j].total
                     << "\", Got \"" << rank << " " << name << " " << total << "\"" << endl;
                testPassed = false;
            }
        }
        fout.close();

        if (testPassed) {
            passed++;
        } else {
            if (!testPassed && failed == 0) {} // already printed
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << tests.size() << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
