#!/bin/bash
# verify_agent_browser.sh
# 验证 agent-browser + Chrome for Testing 是否安装成功、自动化链路是否完整。
#
# 逐项检查：
#   1. agent-browser CLI 可用
#   2. Chrome 二进制存在且无缺失共享库
#   3. 能启动浏览器并导航（open）
#   4. CDP 自动化链路完整（在页面里执行 JS 并取回结果）
#   5. 会话保持正常（同一 --session 下 open 的页面，后续命令仍可见）
#
# 关键点：agent-browser 每条命令默认是独立的临时会话，状态不保持。
# 必须用同一个 --session 名（或 AGENT_BROWSER_SESSION 环境变量）让多条命令复用同一浏览器。
set -uo pipefail

CHROME="${AGENT_BROWSER_EXECUTABLE_PATH:-$HOME/.local/chrome-for-testing/chrome-linux64/chrome}"
export AGENT_BROWSER_EXECUTABLE_PATH="$CHROME"
export AGENT_BROWSER_SESSION="ab-verify"

PASS=0
FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

cleanup() { agent-browser close --all >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "=== agent-browser 安装验证 ==="
echo "浏览器路径: $CHROME"
echo

# ── 1. CLI 可用 ──────────────────────────────────────────────────────────
echo "[1/5] agent-browser CLI"
if command -v agent-browser >/dev/null 2>&1; then
  ok "CLI 可用: $(agent-browser --version 2>&1)"
else
  bad "找不到 agent-browser，请先运行 install_agent_browser.sh"
  echo; echo "结果: $PASS 通过, $FAIL 失败"; exit 1
fi

# ── 2. Chrome 二进制与依赖 ───────────────────────────────────────────────
echo "[2/5] Chrome 二进制与共享库"
if [ -x "$CHROME" ]; then
  ok "二进制存在且可执行"
  MISSING="$(ldd "$CHROME" 2>/dev/null | grep 'not found' || true)"
  if [ -z "$MISSING" ]; then
    ok "无缺失共享库"
  else
    bad "缺失共享库: $(echo "$MISSING" | tr '\n' ' ')"
  fi
else
  bad "二进制不存在: $CHROME"
  echo; echo "结果: $PASS 通过, $FAIL 失败"; exit 1
fi

# ── 3. 启动并导航 ────────────────────────────────────────────────────────
echo "[3/5] 启动浏览器并导航 (example.com)"
cleanup
OPEN_OUT="$(timeout 90 agent-browser open "https://example.com" 2>&1)"
if echo "$OPEN_OUT" | grep -qi "example domain"; then
  ok "导航成功"
else
  bad "导航失败: $(echo "$OPEN_OUT" | head -2 | tr '\n' ' ')"
fi

# ── 4. CDP 自动化链路（执行 JS 取回结果）─────────────────────────────────
echo "[4/5] CDP 自动化链路 (eval document.title)"
sleep 2
TITLE="$(timeout 30 agent-browser eval "document.title" 2>&1)"
if echo "$TITLE" | grep -qi "example domain"; then
  ok "JS 执行并取回结果正常: $TITLE"
else
  bad "eval 异常（可能是会话未保持）: $TITLE"
fi

# ── 5. 会话保持 ──────────────────────────────────────────────────────────
echo "[5/5] 会话保持 (同一 session 下页面状态可见)"
STATE="$(timeout 30 agent-browser eval "JSON.stringify({url:location.href})" 2>&1)"
if echo "$STATE" | grep -qi "example.com"; then
  ok "会话保持正常: $STATE"
else
  bad "会话未保持（页面回到 about:blank）: $STATE"
fi

echo
echo "=== 验证结果: $PASS 通过, $FAIL 失败 ==="
[ "$FAIL" -eq 0 ] && echo "✓ agent-browser 安装并验证成功，可正常使用。" || echo "✗ 存在失败项，请参考 SKILL.md 排障章节。"
exit "$FAIL"
