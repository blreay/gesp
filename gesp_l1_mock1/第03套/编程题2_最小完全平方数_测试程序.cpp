// =============================================================
// GESP C++ 一级 模拟卷 第 03 套 - 编程题 2《第一个完全平方数》评测程序
// -------------------------------------------------------------
//   g++ 你的代码.cpp -o my_answer
//   g++ 第03套_编程题2_最小完全平方数_测试程序.cpp -o judge2
//   ./judge2 ./my_answer
// 不通过的用例会用表格列出【输入 / 实际输出 / 期望输出】。
// =============================================================
#include <bits/stdc++.h>
using namespace std;
struct Case { string input; string expected; };

static string normalize(const string& s){
    vector<string> lines; string cur;
    for(char c:s){ if(c=='\n'){lines.push_back(cur);cur.clear();} else if(c!='\r') cur.push_back(c);}
    lines.push_back(cur);
    for(auto& ln:lines){size_t e=ln.find_last_not_of(" \t");ln=(e==string::npos)?"":ln.substr(0,e+1);}
    while(!lines.empty()&&lines.back().empty())lines.pop_back();
    string out; for(size_t i=0;i<lines.size();i++){if(i)out+="\n";out+=lines[i];} return out;
}
static string runProgram(const string& exe,const string& input){
    string in="._j32in.txt",out="._j32out.txt";
    {ofstream f(in);f<<input;}
    string cmd="\""+exe+"\" < "+in+" > "+out+" 2>/dev/null";
    int rc=system(cmd.c_str());(void)rc;
    ifstream f(out);stringstream ss;ss<<f.rdbuf();
    remove(in.c_str());remove(out.c_str());return ss.str();
}
static string oneLine(const string& s){string r;for(char c:s)r+=(c=='\n'?'|':c);return r;}

static string solve(long long N){
    long long i=1; while(i*i<N) i++; return to_string(i*i);
}

int main(int argc,char** argv){
    if(argc<2){printf("用法: %s <考生可执行文件路径>\n",argv[0]);return 1;}
    string exe=argv[1];
    vector<long long> ins={10,25,1,2,99,100,1000000,999999,50,17};
    vector<Case> cases;
    for(long long v:ins) cases.push_back({to_string(v)+"\n",solve(v)});

    int pass=0; vector<int> failed;
    for(size_t i=0;i<cases.size();i++){
        string got=runProgram(exe,cases[i].input);
        if(normalize(got)==normalize(cases[i].expected))pass++; else failed.push_back((int)i);
    }
    printf("\n======== 编程题2《第一个完全平方数》评测结果 ========\n");
    printf("通过 %d / %d 个测试点\n\n",pass,(int)cases.size());
    if(failed.empty()) printf("✅ ALL PASSED 全部通过！\n");
    else{
        printf("❌ 以下测试点未通过，请核对：\n\n");
        printf("+------+----------------+----------------+----------------+\n");
        printf("| 用例 | 输入            | 实际输出        | 期望输出        |\n");
        printf("+------+----------------+----------------+----------------+\n");
        for(int idx:failed){
            string got=runProgram(exe,cases[idx].input);
            printf("| %4d | %-14s | %-14s | %-14s |\n",idx+1,
                oneLine(cases[idx].input).substr(0,14).c_str(),
                oneLine(normalize(got)).substr(0,14).c_str(),
                oneLine(cases[idx].expected).substr(0,14).c_str());
        }
        printf("+------+----------------+----------------+----------------+\n");
    }
    return 0;
}
