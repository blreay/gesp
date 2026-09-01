# GESP 在线模拟考试系统 — 新 ECS 部署指南

> 面向全新 Linux ECS 实例（Ubuntu 20.04+/Debian 11+ 验证；CentOS 命令等价替换）。
> 按顺序执行即可完成部署。所有路径以 `/opt/exam-system` 为例，可替换。

## 0. 环境要求

| 依赖 | 用途 | 最低版本 |
|---|---|---|
| Node.js | 运行服务 | **20+**（推荐 20/22，勿用奇数版本） |
| g++ | 编程题在线判题（编译学生代码+测试程序） | 任意现代版本 |
| python3 + make | better-sqlite3 原生模块编译 | 3.8+ |
| git | 拉取代码（方式 A） | 任意 |

## 1. 安装系统依赖

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential python3 git

# Node.js 20（NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应 >= v20
g++ --version
```

CentOS/Alibaba Linux：`sudo yum groupinstall -y "Development Tools" && sudo yum install -y python3 git`，Node 用 nvm 或 NodeSource rpm 源。

## 2. 获取代码

项目是一个独立 git 仓库（目录内已 `git init`），**没有远程仓库**。二选一：

### 方式 A：先推送到你的 git 远端，再在 ECS 上 clone（推荐）

```bash
# 在源代码机器上（/home/admin/tools/richie/exam-system）：
git remote add origin <你的仓库地址>   # 如内部 GitLab
git push -u origin master

# 在 ECS 上：
sudo mkdir -p /opt && sudo chown $USER /opt
git clone <你的仓库地址> /opt/exam-system
```

### 方式 B：打包传输（无 git 远端时）

```bash
# 在源代码机器上：
cd /home/admin/tools/richie
tar czf exam-system.tar.gz \
  --exclude='exam-system/node_modules' \
  --exclude='exam-system/data' \
  exam-system
scp exam-system.tar.gz <user>@<ECS公网IP>:~/

# 在 ECS 上：
sudo mkdir -p /opt && sudo chown $USER /opt
tar xzf ~/exam-system.tar.gz -C /opt/
```

> `node_modules` 与 `data/` 必须在 ECS 上重新生成（原生模块与运行数据不能跨机器搬运）。
> `question_bank/` 题库在 git 里，会随代码一起过来。

## 3. 安装依赖 + 构建前端静态资源（关键，勿跳过）

```bash
cd /opt/exam-system
npm install --no-audit --no-fund

# ⚠️ 编辑器与图表库被 .gitignore 排除，必须从 node_modules 复制到静态目录，
# 否则编程题页面编辑器一片空白（浏览器 404 找不到 loader.js）：
mkdir -p src/public/vendor
cp -r node_modules/monaco-editor/min/vs src/public/vendor/monaco/vs
cp node_modules/chart.js/dist/chart.umd.js src/public/vendor/chart.umd.js
```

`npm install` 会现场编译 better-sqlite3 原生模块，需要第 1 步的 build-essential + python3。
若报 node-gyp 错误：确认 `node -v` 与 `g++` 可用，然后 `npm rebuild better-sqlite3`。

## 4. 部署自检

```bash
cd /opt/exam-system
npm test                      # 期望: # fail 0（用例数随版本增长，当前 58）
node scripts/verify_bank.js   # 期望: 所有编程题 参考代码×测试程序 全部 ✅（无参考代码的错题卷会 ⏭️ 跳过）
```

## 5. 首次启动（手动验证）

```bash
cd /opt/exam-system
PORT=8730 node server.js
```

看到 `题库扫描完成：加载 N 套` 和 `exam-system 已启动: http://localhost:8730` 即成功。
另开终端冒烟：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8730/              # 期望 200
curl -s http://localhost:8730/ | grep -c "card-title"                          # 期望 = 试卷套数
curl -s http://localhost:8730/editor-frame | grep -c "delete window.EditContext"  # 期望 1
```

然后浏览器打开 `http://<ECS公网IP>:8730` 人工过一遍：首页卡片 → 开考 → 判卷 → 编程题页 → 错题复习。
`Ctrl+C` 停止手动进程。

## 6. 开放端口（必须，否则外网打不开）

1. **云平台安全组**：阿里云 ECS 控制台 → 实例 → 安全组 → 添加入方向规则：
   协议 TCP，端口 `8730/8730`，授权对象 `0.0.0.0/0`（或限定你的出口 IP，更安全）。
2. **系统防火墙**（若启用）：
   ```bash
   sudo ufw allow 8730/tcp        # Ubuntu ufw
   # 或 firewall-cmd --permanent --add-port=8730/tcp && firewall-cmd --reload
   ```

## 7. 注册为系统服务（推荐，开机自启+崩溃重启）

```bash
sudo tee /etc/systemd/system/exam-system.service > /dev/null <<'EOF'
[Unit]
Description=GESP Online Exam System
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/exam-system
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=8730
Restart=always
RestartSec=3
# 按实际运行用户修改（不要用 root 跑）：
User=www-data
# 判题会编译运行学生代码；如需收紧可加（注意目录权限）：
# ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /opt/exam-system/data && sudo chown -R www-data:www-data /opt/exam-system
sudo systemctl daemon-reload
sudo systemctl enable --now exam-system
systemctl status exam-system --no-pager   # active (running) 即成功
journalctl -u exam-system -f              # 看日志
```

> 用其他用户运行就把两处 `www-data` 换掉；关键是 `data/` 目录归运行用户所有（SQLite 要写）。

## 8. 日常运维

| 操作 | 命令 |
|---|---|
| 启动/停止/重启 | `sudo systemctl start/stop/restart exam-system` |
| 日志 | `journalctl -u exam-system -f` |
| 换端口 | 改 service 文件 `Environment=PORT=9000` → `daemon-reload` → restart（安全组同步放行） |
| 备份 | `tar czf exam-backup-$(date +%F).tar.gz -C /opt/exam-system data question_bank`（数据=SQLite+题库） |
| 清空考试数据 | 停服后删 `/opt/exam-system/data/exam.db*`，启动自动重建（题库与配置保留在文件中） |

## 9. 更新题库 / 升级系统

### 9.1 加新试卷（无需重启）

1. 把新试卷 `*.exam.json` 放进 `question_bank/<分类目录>/`（模板契约见 `docs/superpowers/specs/2026-08-27-exam-system-design.md` 第 4 节）。
2. 浏览器【系统配置】页点【重新扫描题库】；检查“题库健康”无校验失败。

### 9.2 升级代码（必须保留全部数据）

**升级铁律：只换代码，绝不动 `data/`。**
本系统全部用户数据（考试记录、作答、错题本与备注、练习会话、系统配置、考试日志等）都在 `data/exam.db` 这一个 SQLite 文件里。只要不删除、不覆盖它，升级后所有老数据原样保留。**任何升级（包括后续所有版本）都必须遵守本节流程。**

> ⚠️ **特别注意**：`data/exam.db` 被 git 跟踪（`.gitignore` 中 `!data/exam.db` 显式放行）。
> 因此在部署机上直接 `git pull` 可能因本地库与仓库版本不一致而冲突、甚至覆盖运行库。
> 下面的标准流程用「先备份 → 让工作区数据库回到仓库版本 → 拉代码 → 再还原真实数据」的方式彻底避开这个坑。

**数据是如何被保护的（执行升级的 AI/人理解机制即可，不要手动改库）：**

- `src/services/db.js` 维护 `schema_version`（settings 表）。表结构变更通过版本化迁移 `MIGRATIONS` 在**启动时自动、幂等、只执行一次**——无需手动建表改表，**更不要手动修改数据库**。
- 老版本库升级前，系统自动用 `VACUUM INTO` 生成原子快照 `data/exam.db.bak-<时间戳>`（双保险）。
- 拒绝降低 schema 版本（启动直接报错）。新版本有问题时，唯一正确的回退是**恢复升级前备份**。
- 新增配置键用 `INSERT OR IGNORE` 种子化，已有的自定义配置不受影响。

**标准升级步骤（systemd + git 部署）：**

```bash
cd /opt/exam-system
BK=~/exam-db-backup-$(date +%F-%H%M)

# 1) 停服（干净退出后 SQLite 的 WAL 会全部落盘）
sudo systemctl stop exam-system
sleep 2

# 2) 备份（必须！回退全靠它）
cp data/exam.db "$BK"

# 3) 让工作区数据库回到仓库版本（丢弃的只是本地副本，真实数据已在第 2 步备份），避免 pull 冲突
#    若此部署里 data/exam.db 未被 git 跟踪，checkout 会报 pathspec 不匹配，忽略即可（|| true）
git checkout -- data/exam.db 2>/dev/null || true
git pull --ff-only
# 若 pull 因与远端分叉而失败：先弄清原因（git status / git log），不要强制覆盖

# 4) 还原真实数据（保留全部数据的核心步骤）
cp "$BK" data/exam.db
rm -f data/exam.db-wal data/exam.db-shm      # 丢弃残留 WAL，以备份为准
sudo chown www-data:www-data data/exam.db    # 改成实际运行用户（见第 7 节）

# 5) 依赖与静态资源（有变化才需要）
git diff HEAD@{1} -- package.json package-lock.json | grep . && npm install --no-audit --no-fund
# 若 monaco-editor / chart.js 版本变化，重做第 3 节的两条 cp

# 6) 启动并看日志
sudo systemctl start exam-system
journalctl -u exam-system -n 40 --no-pager
```

**tar 包部署（方式 B）的升级**：打包时已排除 `data/`，解压覆盖代码不会碰数据库，天然安全。流程：停服 → 备份（上面 1、2 步）→ 解压覆盖 → 依赖与启动（上面 5、6 步）。无需第 3、4 步。注意：若你在服务器上手工加过试卷，解压前确认 tar 包里的 `question_bank/` 不会覆盖你改过的同名试卷（不在包里的文件不受影响）。

**升级后验证：**

- 日志出现 `题库扫描完成：加载 N 套` 与 `exam-system 已启动`。
- 若本版本含数据库结构迁移：老库启动时会自动生成 `data/exam.db.bak-*` 备份；若附带一次性数据处理，还会有相应日志（例如 v2 的 `考试日志回填完成：N 条历史记录`）。
- 冒烟：`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8730/` 输出 200；浏览器打开 /stats 与 /review，确认历史成绩、错题、备注等老数据都在。
- `npm test` 应 `# fail 0`。

**回退（仅当升级失败）：**

```bash
cd /opt/exam-system
sudo systemctl stop exam-system
rm -f data/exam.db-wal data/exam.db-shm
cp "$BK" data/exam.db            # $BK=升级前那份备份；若换了终端，用 ls ~/exam-db-backup-* 找到它
git checkout <旧版本提交>         # 或重新部署旧版本代码/tar 包（记得别覆盖 data/）
sudo systemctl start exam-system
```

**迁移记录（台账）：**

| 版本 | 日期 | 变更 | 说明 |
|---|---|---|---|
| v1 | 2026-08 | 初始 schema | — |
| v2 | 2026-08-31 | 新增 `exam_log` 表（每日考试日志） | 升级后首次启动自动一次性回填历史已判卷记录（`exam_log_backfilled` 闸门，幂等）；曾被“重新考试”清除的历史无法恢复 |

**升级纪律（后续所有升级必须遵守）：**

1. 先停服、备份 `data/exam.db`，再动任何代码。
2. 永不删除 `data/`；永不手动改库（结构或数据）。
3. 表结构变更一律走 `CURRENT_SCHEMA_VERSION` + `MIGRATIONS`（幂等、向后兼容、升级前自动备份）；禁止上线删表、清数据的代码。
4. 升级后验证老数据完整（成绩 / 错题 / 备注 / 配置）。
5. 出问题恢复备份，不要尝试降级。

## 10. 常见坑（都已在本项目代码里处理，列出供排障对照）

| 现象 | 原因 | 处置 |
|---|---|---|
| 编程题编辑器空白 | 没做第 3 步的 vendor 复制 | 补 `cp` 两条命令 |
| 启动报 `SQLITE_CONSTRAINT_FOREIGNKEY` | better-sqlite3 v12 默认开外键 | 代码已显式 `foreign_keys=OFF`；若你改过 db.js 注意保留 |
| 改了 EJS 模板不生效 | Express 视图缓存 | 代码已 `view cache false`；自定义部署时勿移除 |
| `npm install` 编译失败 | 缺 build-essential/python3 或 Node 版本不匹配 | 装依赖后 `npm rebuild better-sqlite3` |
| 外网打不开、内网 200 | 安全组没放行端口 | 第 6 步 |
| 端口被占用 | 其他进程占用 8730 | `ss -ltnp | grep 8730` 找到并处理，或换端口 |
| 判题卡死 | 学生代码死循环 | 判题有运行超时（默认 60s，【系统配置】可调） |
| 升级后数据没了 | `git pull`/解压覆盖或删了 `data/` | 还原升级前备份；以后严格按 9.2 先备份再升级 |
| 启动报"拒绝降级" | 用了比数据库 `schema_version` 更旧的代码 | 换回新版本代码，或恢复旧代码+旧备份；勿手改 `schema_version` |

## 11. （可选）域名 + HTTPS（nginx 反代）

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```
```nginx
server {
    server_name exam.example.com;
    location / {
        proxy_pass http://127.0.0.1:8730;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 4m;
    }
}
```
`sudo certbot --nginx -d exam.example.com` 申请证书。安全组放行 80/443。

## 12. 验收清单（部署完成判据）

- [ ] `npm test` `# fail 0`；`verify_bank.js` 参考代码全部通过
- [ ] 浏览器打开首页，所有分类试卷卡片可见、状态正确
- [ ] 任一选卷：开考→答题→判卷（错题高亮+复制）→重新考试 正常
- [ ] 编程题页：输入代码→提交→出现判题结果与执行日志；【复制代码】按钮可用
- [ ] 错题复习：过滤、备注弹窗、练习升降级 正常
- [ ] 统计页图表渲染，且页面底部出现【每日模拟考试日志】；配置页修改提醒参数立即生效
- [ ] （升级场景）老数据完整：历史成绩、错题本与备注、配置都在；见 9.2
- [ ] `systemctl restart` 后服务自动恢复；断电重启后开机自启
