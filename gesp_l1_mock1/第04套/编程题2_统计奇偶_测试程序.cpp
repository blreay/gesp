// =============================================================
// GESP C++ 一级 模拟卷 第 04 套 - 编程题 2《统计奇偶》评测程序
//   g++ 你的代码.cpp -o my_answer
//   g++ 编程题2_统计奇偶_测试程序.cpp -o judge2
//   ./judge2 ./my_answer
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
    string fi="._in2.txt",fo="._out2.txt"; {ofstream f(fi);f<<in;}
    string cmd="\""+exe+"\" < "+fi+" > "+fo+" 2>/dev/null"; int rc=system(cmd.c_str());(void)rc;
    ifstream f(fo); stringstream ss; ss<<f.rdbuf(); remove(fi.c_str());remove(fo.c_str()); return ss.str();
}
static string ol(const string& s){string r;for(char c:s)r+=(c=='\n'?'|':c);return r;}
static string solve(vector<int>& a){
    int odd=0,even=0,sum=0;
    for(int x:a){ if(x%2!=0){odd++;sum+=x;} else even++; }
    return to_string(odd)+" "+to_string(even)+" "+to_string(sum);
}
static string mk(vector<int> a){ string s=to_string(a.size())+"\n"; for(size_t i=0;i<a.size();i++){ if(i)s+=" "; s+=to_string(a[i]); } s+="\n"; return s; }
int main(int argc,char**argv){
    if(argc<2){printf("用法: %s <考生可执行文件路径>\n",argv[0]);return 1;}
    string exe=argv[1];
    vector<vector<int>> data={
        {1,2,3,4,5},{2,4,6},{7},{-1,-2,-3},{0},
        {1,3,5,7,9},{2,2,2,2},{100,99,98,97},{-5,5,-4,4},{10000,-9999,1}
    };
    vector<Case> cs; for(auto v:data){ Case c; c.input=mk(v); c.expected=solve(v); cs.push_back(c); }
    int pass=0; vector<int> fl;
    for(size_t i=0;i<cs.size();i++){ if(normalize(runP(exe,cs[i].input))==normalize(cs[i].expected))pass++; else fl.push_back((int)i); }
    printf("\n======== 编程题2《统计奇偶》评测结果 ========\n通过 %d / %d 个测试点\n\n",pass,(int)cs.size());
    if(fl.empty())printf("✅ ALL PASSED 全部通过！\n");
    else{ printf("❌ 以下测试点未通过，请核对：\n\n+------+----------------------+----------------+----------------+\n| 用例 | 输入                  | 实际输出        | 期望输出        |\n+------+----------------------+----------------+----------------+\n");
        for(int idx:fl){ string g=runP(exe,cs[idx].input);
            printf("| %4d | %-20s | %-14s | %-14s |\n",idx+1,ol(cs[idx].input).substr(0,20).c_str(),ol(normalize(g)).substr(0,14).c_str(),ol(cs[idx].expected).substr(0,14).c_str()); }
        printf("+------+----------------------+----------------+----------------+\n"); }
    return 0;
}
