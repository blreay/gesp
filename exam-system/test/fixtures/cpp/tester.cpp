// 最小测试程序：argv[1] = 学生可执行文件。
// 两组用例：输入 "1 2" 期望 "3"；输入 "5 7" 期望 "12"。
#include <bits/stdc++.h>
using namespace std;
static string trim(const string& s) {
  size_t a = s.find_first_not_of(" \t\r\n");
  if (a == string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n");
  return s.substr(a, b - a + 1);
}
static string run(const string& prog, const string& input) {
  ofstream("/tmp/exam_t_in.txt") << input;
  system(("\"" + prog + "\" < /tmp/exam_t_in.txt > /tmp/exam_t_out.txt 2>&1").c_str());
  ifstream f("/tmp/exam_t_out.txt");
  string out((istreambuf_iterator<char>(f)), istreambuf_iterator<char>());
  return trim(out);
}
int main(int argc, char** argv) {
  if (argc < 2) { cout << "用法: " << argv[0] << " <学生程序>" << endl; return 2; }
  vector<pair<string, string>> tests = { {"1 2", "3"}, {"5 7", "12"} };
  int failed = 0;
  cout << "==== 测试开始 ====" << endl;
  for (size_t i = 0; i < tests.size(); i++) {
    string actual = run(argv[1], tests[i].first);
    if (actual == tests[i].second) {
      cout << "用例 " << (i + 1) << " 通过" << endl;
    } else {
      failed++;
      cout << "用例 " << (i + 1) << " 失败 | 输入: [" << tests[i].first
           << "] | 期望: [" << tests[i].second << "] | 实际: [" << actual << "]" << endl;
    }
  }
  if (failed == 0) { cout << "全部通过 (" << tests.size() << "/" << tests.size() << ")" << endl; return 0; }
  cout << "未全部通过 (" << (tests.size() - failed) << "/" << tests.size() << ")" << endl;
  return 1;
}
