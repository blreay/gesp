#include <iostream>
#include <fstream>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <cctype>
#include <vector>

using namespace std;

// Reference solution: Character statistics
// Count uppercase, lowercase, digits, spaces, other characters
// Find the most frequent letter (case-insensitive)
struct Stats {
    int upper, lower, digits, spaces, other;
    char mostFreqLetter; // uppercase version
};

Stats referenceSolution(const string& text) {
    Stats s = {0, 0, 0, 0, 0, 'A'};
    int freq[26] = {0};

    for (char c : text) {
        if (isupper(c)) {
            s.upper++;
            freq[c - 'A']++;
        } else if (islower(c)) {
            s.lower++;
            freq[c - 'a']++;
        } else if (isdigit(c)) {
            s.digits++;
        } else if (c == ' ') {
            s.spaces++;
        } else {
            s.other++;
        }
    }

    int maxFreq = 0;
    char bestLetter = 'A';
    for (int i = 0; i < 26; i++) {
        if (freq[i] > maxFreq) {
            maxFreq = freq[i];
            bestLetter = 'A' + i;
        }
    }
    s.mostFreqLetter = bestLetter;
    return s;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "Usage: " << argv[0] << " <executable_path>" << endl;
        return 1;
    }
    string exePath = argv[1];

    // Test inputs (multiline texts)
    vector<string> inputs = {
        "Hello World",
        "ABC abc 123",
        "   ",
        "a",
        "AAABBB",
        "Hello, World! 123",
        "The Quick Brown Fox Jumps Over The Lazy Dog.",
        "aAAaaa BBBb",
        "12345 67890",
        "!@#$%^&*()",
        "Programming is Fun! C++ is great.",
        "Line1\nLine2\nLine3",
    };

    int passed = 0, failed = 0;
    int numTests = inputs.size();

    for (int t = 0; t < numTests; t++) {
        string inputFile = "/tmp/test_06_prog1_input_" + to_string(t) + ".txt";
        string outputFile = "/tmp/test_06_prog1_output_" + to_string(t) + ".txt";

        ofstream fin(inputFile);
        fin << inputs[t];
        fin.close();

        Stats expected = referenceSolution(inputs[t]);

        string cmd = exePath + " < " + inputFile + " > " + outputFile + " 2>/dev/null";
        int ret = system(cmd.c_str());

        if (ret != 0) {
            cout << "[FAIL] Test " << (t+1) << ": Program exited with error" << endl;
            cout << "  Input: \"" << inputs[t] << "\"" << endl;
            failed++;
            continue;
        }

        ifstream fout(outputFile);
        int aUpper, aLower, aDigits, aSpaces, aOther;
        char aLetter;
        bool readOk = true;
        if (!(fout >> aUpper >> aLower >> aDigits >> aSpaces >> aOther >> aLetter)) {
            readOk = false;
        }
        fout.close();

        // Compare (convert letter to uppercase for comparison)
        if (readOk) aLetter = toupper(aLetter);

        if (readOk && aUpper == expected.upper && aLower == expected.lower &&
            aDigits == expected.digits && aSpaces == expected.spaces &&
            aOther == expected.other && aLetter == expected.mostFreqLetter) {
            passed++;
        } else {
            cout << "[FAIL] Test " << (t+1) << ":" << endl;
            cout << "  Input: \"" << inputs[t] << "\"" << endl;
            cout << "  Expected: " << expected.upper << " " << expected.lower << " "
                 << expected.digits << " " << expected.spaces << " " << expected.other
                 << " " << expected.mostFreqLetter << endl;
            if (readOk) {
                cout << "  Actual:   " << aUpper << " " << aLower << " "
                     << aDigits << " " << aSpaces << " " << aOther
                     << " " << aLetter << endl;
            } else {
                cout << "  Actual:   (could not read output)" << endl;
            }
            failed++;
        }
    }

    cout << "\n===== Results: " << passed << " passed, " << failed << " failed out of " << numTests << " tests =====" << endl;
    return failed > 0 ? 1 : 0;
}
