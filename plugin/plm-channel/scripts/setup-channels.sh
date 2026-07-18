#!/usr/bin/env bash
# PLM-Hub 채널 활성화.
#
# Claude Code의 channelsEnabled/allowedChannelPlugins 정책은 **managed-settings 스코프 전용**이지만,
# 개인 Pro/Max 계정(조직 없음)은 이 정책 체크를 **건너뛴다** → sudo·managed-settings 없이 바로 채널 사용.
# 따라서 기본 동작은 안내만(sudo 없음). 조직 관리형(Team/Enterprise/관리 Console) 계정만
# `--policy`(또는 PLM_CH_POLICY=1)로 managed-settings에 allowlist를 sudo로 등록한다.
#
# 사용: bash setup-channels.sh            (개인 계정 — sudo 없음, 안내)
#       bash setup-channels.sh --policy   (조직 관리형 — managed-settings 등록, sudo)
#       PLM_CH_PLUGIN=... PLM_CH_MARKET=... 로 플러그인/마켓 변경
set -euo pipefail

PLUGIN="${PLM_CH_PLUGIN:-plm-channel}"
MARKET="${PLM_CH_MARKET:-jwk-platform}"
POLICY="${PLM_CH_POLICY:-0}"
[ "${1:-}" = "--policy" ] && POLICY=1

if [ "$POLICY" != "1" ]; then
  # 개인 Pro/Max: 정책 불필요 — sudo 없이 바로 사용.
  echo "-> 채널 사용 준비 (개인 Pro/Max 계정은 정책 설정 불필요 — sudo 없음)"
  echo "   바로 실행:  claude --channels plugin:${PLUGIN}@${MARKET}"
  echo "   → 웹 [Sync] 버튼이 이 세션으로 <channel> 메시지를 push 합니다."
  echo ""
  echo "   ※ 조직 관리형(Team/Enterprise/관리 Console) 계정만 managed-settings 등록이 필요합니다:"
  echo "       make channels-policy     (sudo 1회 — /etc/claude-code/managed-settings.json allowlist)"
  exit 0
fi

# ── --policy: 조직 관리형 — managed-settings(정책 스코프)에 멱등 등록 ──
# OS별 정책 파일 경로 + 권한 상승 방식. Windows(Git Bash/MSYS/Cygwin)는 sudo가 없으므로
# 관리자 권한 셸에서 직접 write(SUDO 빈값), Linux/macOS는 sudo.
SUDO="sudo"
# root(컨테이너/도커)면 sudo 불필요·부재 — 직접 write.
[ "$(id -u 2>/dev/null || echo 1)" = 0 ] && SUDO=""
case "$(uname -s)" in
  Linux)   DEST="/etc/claude-code/managed-settings.json" ;;
  Darwin)  DEST="/Library/Application Support/ClaudeCode/managed-settings.json" ;;
  MINGW*|MSYS*|CYGWIN*)
           # Windows v2.1.75+ 정식 경로. (구 ProgramData 경로는 지원 종료.)
           DEST="${PROGRAMFILES:-/c/Program Files}/ClaudeCode/managed-settings.json"
           SUDO=""  # 관리자 권한 셸 전제 — sudo 없음
           echo "   ※ Windows: 이 스크립트를 '관리자 권한' Git Bash에서 실행하세요(파일이 Program Files 하위)."
           ;;
  *)       echo "[X] 미지원 OS: $(uname -s). managed-settings 경로를 수동 설정하세요."; exit 1 ;;
esac
DIR="$(dirname "$DEST")"

echo "-> [조직 관리형] 채널 정책 병합: $DEST  (plugin=$PLUGIN marketplace=$MARKET)"

EXISTING='{}'
if $SUDO test -f "$DEST"; then
  EXISTING="$($SUDO cat "$DEST")"
fi

# JSON 병합 엔진: python3 우선, 없으면 node(설치기가 node를 보장) — 컨테이너/미니멀 환경 대응.
if command -v python3 >/dev/null 2>&1; then
  MERGED="$(PLM_EXISTING="$EXISTING" PLM_PLUGIN="$PLUGIN" PLM_MARKET="$MARKET" python3 - <<'PY'
import json, os, sys
try:
    cfg = json.loads(os.environ.get("PLM_EXISTING") or "{}")
    if not isinstance(cfg, dict):
        cfg = {}
except Exception:
    cfg = {}
cfg["channelsEnabled"] = True
lst = cfg.get("allowedChannelPlugins")
if not isinstance(lst, list):
    lst = []
entry = {"plugin": os.environ["PLM_PLUGIN"], "marketplace": os.environ["PLM_MARKET"]}
if not any(isinstance(e, dict) and e.get("plugin") == entry["plugin"]
           and e.get("marketplace") == entry["marketplace"] for e in lst):
    lst.append(entry)
cfg["allowedChannelPlugins"] = lst
print(json.dumps(cfg, indent=2, ensure_ascii=False))
PY
)"
  echo "$MERGED" | python3 -c 'import json,sys; json.load(sys.stdin)' || { echo "[X] 병합 JSON 무효 — 중단"; exit 1; }
elif command -v node >/dev/null 2>&1; then
  MERGED="$(PLM_EXISTING="$EXISTING" PLM_PLUGIN="$PLUGIN" PLM_MARKET="$MARKET" node -e '
let cfg = {};
try { const c = JSON.parse(process.env.PLM_EXISTING || "{}"); if (c && typeof c === "object" && !Array.isArray(c)) cfg = c; } catch {}
cfg.channelsEnabled = true;
let lst = Array.isArray(cfg.allowedChannelPlugins) ? cfg.allowedChannelPlugins : [];
const entry = { plugin: process.env.PLM_PLUGIN, marketplace: process.env.PLM_MARKET };
if (!lst.some(e => e && e.plugin === entry.plugin && e.marketplace === entry.marketplace)) lst.push(entry);
cfg.allowedChannelPlugins = lst;
console.log(JSON.stringify(cfg, null, 2));
')"
  echo "$MERGED" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' || { echo "[X] 병합 JSON 무효 — 중단"; exit 1; }
else
  echo "[X] python3/node 모두 없음 — JSON 병합 불가 (설치 후 재시도)"; exit 1
fi
$SUDO mkdir -p "$DIR"
printf '%s\n' "$MERGED" | $SUDO tee "$DEST" >/dev/null

echo "[OK] 채널 정책 활성화 완료:"
$SUDO cat "$DEST" | sed 's/^/    /'
echo ""
echo "   이제: claude --channels plugin:${PLUGIN}@${MARKET}  로 세션을 켜면"
echo "   웹 [Sync] 버튼이 이 세션으로 <channel> 메시지를 push 합니다."
