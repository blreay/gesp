// =============================================================
// GESP C++ 一级 模拟卷 第 09 套 - 编程题 2《成绩等级》评测程序
//   g++ 你的代码.cpp -o my_answer
//   g++ 编程题2_成绩等级_测试程序.cpp -o judge2
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
static string solve(int s){ if(s>=90)return "A"; if(s>=80)return "B"; if(s>=70)return "C"; if(s>=60)return "D"; return "E"; }
int main(int argc,char**argv){
    if(argc<2){printf("用法: %s <考生可执行文件路径>\n",argv[0]);return 1;}
    string exe=argv[1];
    vector<int> ins={85,59,90,100,0,60,70,80,89,75};
    vector<Case> cs; for(int v:ins) cs.push_back({to_string(v)+"\n",solve(v)});
    int pass=0; vector<int> fl;
    for(size_t i=0;i<cs.size();i++){ if(normalize(runP(exe,cs[i].input))==normalize(cs[i].expected))pass++; else fl.push_back((int)i); }
    printf("\n======== 编程题2《成绩等级》评测结果 ========\n通过 %d / %d 个测试点\n\n",pass,(int)cs.size());
    if(fl.empty())printf("✅ ALL PASSED 全部通过！\n");
    else{ printf("❌ 以下测试点未通过，请核对：\n\n+------+----------------+----------------+----------------+\n| 用例 | 输入            | 实际输出        | 期望输出        |\n+------+----------------+----------------+----------------+\n");
        for(int idx:fl){ string g=runP(exe,cs[idx].input);
            printf("| %4d | %-14s | %-14s | %-14s |\n",idx+1,ol(cs[idx].input).substr(0,14).c_str(),ol(normalize(g)).substr(0,14).c_str(),ol(cs[idx].expected).substr(0,14).c_str()); }
        printf("+------+----------------+----------------+----------------+\n"); }
    return 0;
}
