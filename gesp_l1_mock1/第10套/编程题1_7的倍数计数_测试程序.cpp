// =============================================================
// GESP C++ 一级 模拟卷 第 10 套 - 编程题 1《区间内 7 的倍数计数》评测程序
//   g++ 你的代码.cpp -o my_answer
//   g++ 编程题1_7的倍数计数_测试程序.cpp -o judge
//   ./judge ./my_answer        (Windows: judge.exe my_answer.exe)
// 不通过的用例会用表格列出【输入 / 实际输出 / 期望输出】。
// =============================================================
#include <bits/stdc++.h>
using namespace std;
struct Case { string input, expected; };
static string normalize(const string& s){
    vector<string> L; string c;
    for(char ch:s){ if(ch=='\n'){L.push_back(c);c.clear();} else if(ch!='\r') c+=ch; }
    L.push_back(c);
    for(auto& l:L){ string t;bool sp=false; for(char ch:l){ if(ch==' '||ch=='\t')sp=true; else{if(sp&&!t.empty())t+=' ';sp=false;t+=ch;} } l=t; }
    while(!L.empty()&&L.back().empty())L.pop_back();
    string o; for(size_t i=0;i<L.size();i++){if(i)o+="\n";o+=L[i];} return o;
}
static string runP(const string& exe,const string& in){
    string fi="._in.txt",fo="._out.txt"; {ofstream f(fi);f<<in;}
    string cmd="\""+exe+"\" < "+fi+" > "+fo+" 2>/dev/null"; int rc=system(cmd.c_str());(void)rc;
    ifstream f(fo); stringstream ss; ss<<f.rdbuf(); remove(fi.c_str());remove(fo.c_str()); return ss.str();
}
static string ol(const string& s){string r;for(char c:s)r+=(c=='\n'?'|':c);return r;}
static string solve(long long a,long long b){
    long long lo=((a+6)/7)*7;          // >= a 的第一个 7 的倍数
    long long hi=(b/7)*7;              // <= b 的最后一个
    if(lo>hi) return "0 0";
    long long cnt=(hi-lo)/7+1;
    long long sum=(lo+hi)*cnt/2;
    return to_string(cnt)+" "+to_string(sum);
}
int main(int argc,char**argv){
    if(argc<2){printf("用法: %s <考生可执行文件路径>\n",argv[0]);return 1;}
    string exe=argv[1];
    vector<pair<long long,long long>> ins={{1,20},{7,7},{1,6},{1,1000000},{14,28},{8,13},{700,707},{1,7},{50,100},{999994,1000000}};
    vector<Case> cs; for(auto p:ins) cs.push_back({to_string(p.first)+" "+to_string(p.second)+"\n",solve(p.first,p.second)});
    int pass=0; vector<int> fl;
    for(size_t i=0;i<cs.size();i++){ if(normalize(runP(exe,cs[i].input))==normalize(cs[i].expected))pass++; else fl.push_back((int)i); }
    printf("\n======== 编程题1《区间内 7 的倍数计数》评测结果 ========\n通过 %d / %d 个测试点\n\n",pass,(int)cs.size());
    if(fl.empty())printf("✅ ALL PASSED 全部通过！\n");
    else{ printf("❌ 以下测试点未通过，请核对：\n\n+------+--------------------+--------------------+--------------------+\n| 用例 | 输入                | 实际输出            | 期望输出            |\n+------+--------------------+--------------------+--------------------+\n");
        for(int idx:fl){ string g=runP(exe,cs[idx].input);
            printf("| %4d | %-18s | %-18s | %-18s |\n",idx+1,ol(cs[idx].input).substr(0,18).c_str(),ol(normalize(g)).substr(0,18).c_str(),ol(cs[idx].expected).substr(0,18).c_str()); }
        printf("+------+--------------------+--------------------+--------------------+\n"); }
    return 0;
}
