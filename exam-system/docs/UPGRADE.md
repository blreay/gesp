# exam-system 手动升级指南（本机专用）

> 适用机器：本机（阿里云 ECS，部署目录 /opt/exam-system）。
> 本系统不是 git 部署，代码源在 /data/gesp/exam-system，升级 = 停服 → 备份 → 复制新代码 → 启动 → 验证。
> **升级铁律：只换代码，绝不动 `data/`。** 全部用户数据（考试记录、作答、错题本与备注、练习会话、配置、考试日志）都在 `/opt/exam-system/data/exam.db` 这一个 SQLite 文件里。

## 0. 本机布局速记

| 项 | 位置 |
|---|---|
| 部署目录（运行中） | `/opt/exam-system`（非 git 仓库） |
| 代码源（git 工作副本） | `/data/gesp/exam-system`（git 仓库根在 `/data/gesp`，origin 为 GitHub 镜像） |
| 系统服务 | `exam-system.service`（User=www-data，PORT=**8730 不变**） |
| 生产数据库 | `/opt/exam-system/data/exam.db`（WAL 模式；`-wal`/`-shm` 为临时文件） |
| 题库 | `/opt/exam-system/question_bank/`（**可能有手工修改的试卷**） |
| 前端静态资源 | `/opt/exam-system/src/public/vendor/`（monaco/chart.js，git 不跟踪，勿删） |
| 判题临时目录 | `/opt/exam-system/data/judge_tmp/`（临时，属主须为 www-data） |

## 1. 升级前准备

### 1.1 更新代码源，查看变更范围

```bash
cd /data/gesp
git pull --ff-only          # 失败就先 git status / git log 弄清原因，勿强制
# 把 <上次提交> 换成第 10 节台账里记录的上次升级 commit
git diff --stat <上次提交>..HEAD -- exam-system
```

重点看三处：

- **package.json / package-lock.json**：有变化才需要第 5 步（npm install）。
- **question_bank/**：新增/修改的试卷是否会覆盖服务器上手工改过的同名文件：

  ```bash
  git diff --name-only <上次提交>..HEAD -- exam-system/question_bank
  ```

  列出的每个文件都要确认服务器上是否有本地修改（见 1.2），有则升级后必须还原。
- **src/services/db.js**：`CURRENT_SCHEMA_VERSION` 是否提升。有结构迁移也无需手动——启动时自动、幂等迁移，**永远不要手动改库**。

### 1.2 盘点服务器上手工改过的文件（升级前必做）

部署目录不是 git，无法直接看 diff。方法与上次升级相同：用「上次升级 commit」的仓库快照对比部署目录，有差异的文件就是本地修改，**先备份**：

```bash
mkdir -p /tmp/dchk
git -C /data/gesp archive <上次提交> exam-system | tar -x -C /tmp/dchk
diff -r -q --exclude=data --exclude=node_modules --exclude=vendor /tmp/dchk/exam-system /opt/exam-system
# 逐个备份有差异的文件，例如：
NAME=$(date +%F)   # 手工修改文件的备份日期，升级当天记住它
cp "/opt/exam-system/question_bank/GESP_C++三级/exam_03.exam.json" /root/exam_03.exam.json.local-$NAME
```

> 已知本地修改（截至 2026-09-01）：`question_bank/GESP_C++三级/exam_03.exam.json`（测试程序输入顺序改为 k 在前，与题目一致；参考代码与之不符，属遗留待决策问题）。

### 1.3 记录数据基线（升级后核对用）

```bash
cd /opt/exam-system && node -e '
const Database=require("./node_modules/better-sqlite3");
const db=new Database("data/exam.db",{readonly:true});
for(const t of ["exams","exam_attempts","exam_answers","prog_submissions","wrong_questions","review_sessions","review_answers","review_session_items","settings","exam_log"])
  console.log(t, db.prepare("select count(*) c from "+t).get().c);
db.close();'
```

把输出记下来（升级后各项行数必须一致；settings 只增不减，新增配置键属正常）。

## 2. 停服 + 落盘 WAL（关键，勿跳）

```bash
systemctl stop exam-system
sleep 2
systemctl status exam-system --no-pager    # 应 inactive (dead)
```

⚠️ **本机实测的坑（2026-09-01 升级真实踩到）**：Node 收到 systemd 的 SIGTERM 后直接退出，**不会执行 SQLite 的关闭落盘**，`data/exam.db-wal` 可能仍带着最新数据留在磁盘上。此时直接 `cp exam.db` 会漏掉 WAL 里的全部新数据（备份变成旧库）。必须先手动合并：

```bash
cd /opt/exam-system && node -e '
const Database=require("./node_modules/better-sqlite3");
const db=new Database("data/exam.db");
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();'
ls -la data/    # 确认 exam.db-wal、exam.db-shm 已消失，只剩 exam.db
```

## 3. 备份（回退全靠它）

```bash
TS=$(date +%F-%H%M)
# 数据库单文件备份（回退主力）
cp /opt/exam-system/data/exam.db /root/exam-db-backup-$TS
# 整套备份：代码+数据+node_modules（本机磁盘充足；带上 node_modules 可整包完美回退）
tar czf /root/exam-system-full-backup-$TS.tar.gz -C /opt exam-system

# 校验备份可用：integrity ok 且行数与 1.3 基线一致
node -e '
const Database=require("/opt/exam-system/node_modules/better-sqlite3");
const db=new Database("/root/exam-db-backup-'$TS'",{readonly:true});
console.log("integrity:", db.pragma("integrity_check",{simple:true}));
for(const t of ["exams","exam_attempts","exam_answers","prog_submissions","wrong_questions","settings"])
  console.log(t, db.prepare("select count(*) c from "+t).get().c);
db.close();'
```

**记下 `$TS`**，升级全程会反复用到。

## 4. 覆盖新代码（不碰 data/、node_modules）

```bash
TS=<第3步的时间戳>
# 4.1 覆盖代码（无 --delete：保留 vendor/、data/、judge_tmp 等服务器本地内容）
rsync -a --exclude=data --exclude=node_modules /data/gesp/exam-system/ /opt/exam-system/

# 4.2 还原 1.2 里备份的手工修改文件（没有可跳过）
cp /root/exam_03.exam.json.local-$NAME "/opt/exam-system/question_bank/GESP_C++三级/exam_03.exam.json"   # $NAME 见 1.2

# 4.3 属主归运行用户（复制过来的新文件是 root 属主，www-data 跑不了）
chown -R www-data:www-data /opt/exam-system
```

> 注意：代码源 `/data/gesp/exam-system/data/exam.db` 是开发用库，**永远不要**把它复制到 /opt（上面的 rsync 已排除 `data`）。

## 5. 依赖（仅当 package.json / package-lock.json 有变化）

```bash
cd /opt/exam-system
sudo -u www-data npm install --no-audit --no-fund     # 用 www-data 跑，保持 node_modules 属主
# 若 monaco-editor 或 chart.js 版本变了，重新复制静态资源：
mkdir -p src/public/vendor
cp -r node_modules/monaco-editor/min/vs src/public/vendor/monaco/vs
cp node_modules/chart.js/dist/chart.umd.js src/public/vendor/chart.umd.js
chown -R www-data:www-data src/public/vendor
```

package.json 没变（大多数升级如此）则整步跳过。

## 6. 启动

```bash
systemctl start exam-system
sleep 3
journalctl -u exam-system -n 40 --no-pager
```

预期日志（随版本可能有增项）：

- `题库扫描完成：加载 N 套，失败 0 个文件`
- `考试日志回填完成：M 条历史记录`（仅首次升级到含 exam_log 的版本时出现一次，之后不再出现）
- `exam-system 已启动: http://localhost:8730` —— **端口必须是 8730**

看到 `SQLITE_CONSTRAINT`、`拒绝降级` 等报错时停手，按第 8 节回退。

## 7. 验证

```bash
# 7.1 端口
ss -ltnp | grep 8730

# 7.2 冒烟（应全部 200；/ai 为 2026-09 版本新增页）
for p in / /stats /review /settings /ai; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8730$p"
done
curl -s http://localhost:8730/ | grep -c card-title    # 应 = 试卷套数（当前 31）

# 7.3 老数据核对：与 1.3 基线逐行一致
cd /opt/exam-system && node -e '
const Database=require("./node_modules/better-sqlite3");
const db=new Database("data/exam.db",{readonly:true});
for(const t of ["exams","exam_attempts","exam_answers","prog_submissions","wrong_questions","review_sessions","review_answers","review_session_items","settings","exam_log"])
  console.log(t, db.prepare("select count(*) c from "+t).get().c);
console.log("schema_version", db.prepare("select value from settings where key=?").get("schema_version")?.value);
db.close();'

# 7.4 全量测试 + 题库验收（⚠️ 必须用 www-data 跑，原因见第 11 节）
cd /opt/exam-system
sudo -u www-data npm test                     # 期望 # fail 0（用例数随版本增长，当前 58）
sudo -u www-data node scripts/verify_bank.js  # 期望全部 OK，无参考代码/占位测试程序的 ⏭️ 跳过
```

7.5 浏览器人工过一遍：首页卡片 → /stats（历史成绩 + 每日模拟考试日志）→ /review（错题本与备注）→ 任做一套卷确认判分正常。

7.6 `systemctl restart exam-system` 确认重启后干净恢复（无重复回填、无报错）。

7.7 在 10 节台账追加一行（日期 / 旧 commit / 新 commit / 说明）。

## 8. 回退（仅当升级失败）

```bash
TS=<第3步的时间戳>
systemctl stop exam-system
# 恢复数据库（WAL 已合并，直接覆盖主库即可）
cp /root/exam-db-backup-$TS /opt/exam-system/data/exam.db
# 恢复旧代码（整包覆盖；新代码多出来的文件不会被引用，无害）
tar xzf /root/exam-system-full-backup-$TS.tar.gz -C /opt/
chown -R www-data:www-data /opt/exam-system
systemctl start exam-system
journalctl -u exam-system -n 20 --no-pager
```

> 若希望代码目录与旧版本完全一致（删掉新版多出的文件），可改为：先把 tar 解压到 `/tmp/restore`，再
> `rsync -a --delete --exclude=data --exclude=src/public/vendor /tmp/restore/exam-system/ /opt/exam-system/`。
> 数据库回退后如启动报“拒绝降级”，说明回退的代码比备份库更旧——此时不要硬上，用整包备份里的库+代码配对回退，或等代码修复。

## 9. 升级纪律（铁律）

1. 先停服 → 确认 WAL 落盘 → 备份，然后才允许动任何代码。
2. 永不删除/覆盖 `data/`；永不手动改库（表结构、数据、schema_version 一律不准手改）。
3. 表结构变更一律走代码里的 `CURRENT_SCHEMA_VERSION + MIGRATIONS`（启动自动、幂等）；禁止上线删表/清数据的代码。
4. 服务器上手工改过的文件：升级前备份、升级后还原（目前已知：`question_bank/GESP_C++三级/exam_03.exam.json`）。
5. 升级后必须核对老数据行数 = 升级前基线。
6. 出问题恢复备份回退，不要尝试降级代码去“配”新库。
7. `npm test` / `verify_bank.js` 一律 `sudo -u www-data` 运行，不要混用 root 和 www-data 跑测试。
8. 端口固定 8730，升级不得变更；变更端口须同步安全组，属独立运维操作。

## 10. 升级台账（本机）

| 日期 | 旧 commit | 新 commit | 说明 |
|---|---|---|---|
| 2026-08-28 | — | `98e6110` | 首次部署 |
| 2026-09-01 | `98e6110` | `4830129` | 考试日志（exam_log 迁移 v2 + 回填 9 条历史）、AI 问答/解析、备注 markdown；npm test 58/0，verify 39/40（1 个遗留试卷问题） |

## 11. 已知本机坑（排障对照）

| 现象 | 原因 | 处置 |
|---|---|---|
| 停服后 `data/` 里还有 `exam.db-wal` / `-shm` | Node 收 SIGTERM 直接退出，不做 SQLite 落盘 | 按第 2 步 `wal_checkpoint(TRUNCATE)`，确认文件消失再备份 |
| 备份的 exam.db 行数比运行中少 | 备份时 WAL 未合并 | 同上；发现后停服→落盘→重新备份 |
| `npm test` 以 www-data 跑时 judge 相关用例挂起或报 `EACCES: scandir .../judge_tmp/sub_*`、`PARTIAL_PASS` | 之前用 **root** 跑过测试，`data/judge_tmp/` 和 `/tmp`（exam_t_in/out.txt 等）留下 root 属主残留，www-data 无权扫描/覆盖 | 用 root 清理残留后重跑：`find /opt/exam-system/data/judge_tmp -user root -depth -delete`；`rm /tmp/exam_t_in.txt /tmp/exam_t_out.txt`（如有） |
| verify_bank 用 root 跑时大面积 FAIL（`cannot create /tmp/...: Permission denied`） | 本机 LSM 限制：root 无法覆盖 `/tmp` 中 www-data 属主的文件 | 用 `sudo -u www-data node scripts/verify_bank.js` |
| 编程题编辑器空白 | `src/public/vendor/` 缺失或被覆盖 | 重做第 5 步两条 cp |
| 启动报“拒绝降级” | 代码版本比数据库 schema_version 旧 | 换回新代码，或连库带码整包回退 |
| 外网打不开、内网 200 | 安全组未放行 | 8730/tcp（本机已放行，一般不用动） |
| `npm install` 编译失败 | Node 版本/g++ 异常 | `sudo -u www-data npm rebuild better-sqlite3` |
