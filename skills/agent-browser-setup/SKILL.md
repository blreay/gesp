---
name: agent-browser-setup
description: 在被墙的国内 Linux 环境（Ubuntu 24.04 等）安装 agent-browser（Vercel 的浏览器自动化 CLI）及其依赖的 Chrome for Testing 浏览器，并验证安装。当用户提到「安装 agent-browser」「agent-browser 装不上」「agent-browser install 失败」「Chrome not found」「浏览器自动化 CLI」「无头浏览器跑不起来」「googlechromelabs 连接被重置」「agent-browser 打不开网页 / eval 返回空 / 会话不保持」，或需要让 AI Agent 用命令行驱动浏览器抓网页时，使用本 skill。即使用户只说「装一下那个浏览器自动化工具」也应触发。
---

# agent-browser 安装与验证（被墙环境）

## 何时使用本 Skill

- 要在国内 Linux 机器上安装 `agent-browser`（Vercel 的 "fast browser automation CLI for AI agents"）。
- `agent-browser install` 报 `Failed to fetch version info ... Connection reset by peer`。
- 运行 `agent-browser open` 报 `Chrome not found`。
- `npm install -g agent-browser` 报 `EACCES`（权限不足）。
- 装完后 `eval` 返回空、页面状态不保持、需要验证整条自动化链路是否通。

## 核心障碍（先理解，再动手）

`agent-browser` 只是「遥控器」，底层通过 CDP（Chrome DevTools Protocol）驱动一个真实 Chrome。它依赖 **Chrome for Testing（CfT）**——Google 发布的纯净、版本固定、可独立下载的 Chrome 分支。CfT 的分发分两部分，可达性不同：

| 部分 | 托管位置 | 国内可达性 |
|------|----------|-----------|
| **版本信息 JSON**（"最新版是哪个、下载地址") | `googlechromelabs.github.io` | ❌ 被墙（Connection reset） |
| **浏览器二进制本体**（几百 MB 压缩包） | `storage.googleapis.com` / `cdn.npmmirror.com` | ✅ 可达 |

`agent-browser install` 第一步就要读那个**被墙的版本 JSON**，所以必然失败。绕行思路：**不用它的内置下载器**，手动从 npmmirror（阿里云镜像）下载二进制，再用环境变量 `AGENT_BROWSER_EXECUTABLE_PATH` 指给 agent-browser。

此外还有两个常见坑：
- **全局安装 EACCES**：Node 常装在 root 名下（如 `/root/.nvm`），普通用户无法写全局目录 → 需 `sudo`，且必须 `env "PATH=$PATH"` 传递 PATH。
- **会话不保持**：agent-browser 每条命令默认是独立临时会话；`open` 后再 `eval` 会看到 `about:blank`。必须用同一 `--session` 名（或 `AGENT_BROWSER_SESSION` 环境变量）让命令复用同一浏览器。

## 快速安装（推荐）

两个脚本封装了全部步骤，幂等可重复执行：

```bash
SKILL=<本 skill 目录>/scripts

# 1. 安装（全局装 CLI + 下载 Chrome + 检查依赖 + 写 ~/.bashrc）
bash "$SKILL/install_agent_browser.sh"

# 2. 验证（5 项检查：CLI / 二进制 / 导航 / CDP / 会话保持）
bash "$SKILL/verify_agent_browser.sh"
```

`install_agent_browser.sh` 可选传参：`install_agent_browser.sh [CFT版本] [安装目录]`，默认 `149.0.7827.115` 和 `$HOME/.local/chrome-for-testing`。

验证脚本全部通过会输出 `✓ agent-browser 安装并验证成功`。

## 手动安装步骤（脚本失败时逐步排查用）

### 第一步：全局安装 agent-browser

```bash
sudo env "PATH=$PATH" npm install -g agent-browser
agent-browser --version   # 预期：agent-browser 0.x.x
```

`env "PATH=$PATH"` 不能省——否则 sudo 的精简 PATH 找不到 nvm 装的 npm/node。

### 第二步：从国内镜像下载 Chrome for Testing

可用版本目录（浏览器打开可看全部版本）：
`https://registry.npmmirror.com/-/binary/chrome-for-testing/`

```bash
DEST=$HOME/.local/chrome-for-testing
mkdir -p "$DEST" && cd "$DEST"

# -L 必须加：镜像会 302 跳到 cdn.npmmirror.com，不跟随只会下到 111 字节重定向页
curl -fSL -o chrome-linux64.zip \
  "https://registry.npmmirror.com/-/binary/chrome-for-testing/149.0.7827.115/linux64/chrome-linux64.zip"

unzip -oq chrome-linux64.zip
ls -lh "$DEST/chrome-linux64/chrome"   # 确认二进制存在（约 266MB）
```

> 不加 `-L` 解压会报 `End-of-central-directory signature not found`——那是因为下到的是重定向提示页而非真正的 zip。

### 第三步：检查共享库依赖

```bash
ldd $HOME/.local/chrome-for-testing/chrome-linux64/chrome | grep "not found"
```

无输出即依赖齐全。有缺失则安装：

```bash
sudo apt-get update && sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2
```

### 第四步：指定浏览器路径并持久化

```bash
echo '' >> ~/.bashrc
echo '# agent-browser: Chrome for Testing（从 npmmirror 下载，google 版本 JSON 被墙）' >> ~/.bashrc
echo "export AGENT_BROWSER_EXECUTABLE_PATH=$HOME/.local/chrome-for-testing/chrome-linux64/chrome" >> ~/.bashrc
source ~/.bashrc
```

## 验证清单（手动逐项确认）

用**同一个 session** 跑这几条，确认整条链路：

```bash
export AGENT_BROWSER_EXECUTABLE_PATH=$HOME/.local/chrome-for-testing/chrome-linux64/chrome
export AGENT_BROWSER_SESSION=ab-verify        # 关键：让多条命令复用同一浏览器

agent-browser open "https://example.com"      # 预期：✓ Example Domain
agent-browser eval "document.title"           # 预期：✓ "Example Domain"
agent-browser eval "location.href"            # 预期：仍是 example.com（证明会话保持）
agent-browser close --all                     # 清理
```

三条都符合预期即安装成功。`agent-browser doctor` 也可做一次官方自检（env / Chrome / daemon / 网络）。

## 排障

| 症状 | 原因 | 处理 |
|------|------|------|
| `EACCES ... mkdir /root/.nvm/...` | 全局目录属 root | 用 `sudo env "PATH=$PATH" npm install -g` |
| `Failed to fetch version info ... Connection reset` | 内置下载器访问被墙的版本 JSON | 不用 `agent-browser install`，按第二步手动下载 |
| `Chrome not found` | 未指定浏览器或路径错 | 设 `AGENT_BROWSER_EXECUTABLE_PATH` 指向 CfT 二进制 |
| 解压报 `End-of-central-directory signature not found` | curl 未加 `-L`，下到 111 字节重定向页 | 加 `-L` 重新下载 |
| `eval` 返回 `""` 或 `about:blank` | 每条命令是独立临时会话 | 用同一 `--session`/`AGENT_BROWSER_SESSION` |
| 启动报缺 `libXXX.so` | 系统缺共享库 | 按第三步 `apt-get install` 依赖 |
| 命令异常、daemon 卡死、升级后版本不一致 | 残留 daemon / 状态 | `agent-browser doctor`，必要时 `doctor --fix` |

## 入门 agent-browser 命令

CLI 自带版本匹配的技能文档，比猜 flag 更可靠：

```bash
agent-browser skills get core --full
```

## 相关文档

仓库内有同主题的科普向长文（前置知识 + 背景 + 一键脚本）：
`docs/install_agent_browser_ubuntu2404.md`
