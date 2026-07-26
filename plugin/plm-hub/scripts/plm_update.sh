#!/usr/bin/env bash
# /plm-hub:update — 우리가 관리하는 모든 워크플로우 플러그인(plan·code·plm-hub·plm-channel)을
#   **서버에 배포된 최신 버전**으로 일괄 업데이트. git 없이도 동작(universal).
#
# 왜 필요한가: jwk-platform 마켓플레이스는 **로컬 저장소**(설치 시 `claude plugin marketplace add <dir>`)를
#   소스로 한다. 따라서 `claude plugin update`만으론 옛 로컬 파일을 재읽어 "이미 최신"으로 정체된다.
#   실제 최신 = 서버 `/template/download`(배포 스냅샷·바이너리에 baked). 이 스크립트가:
#     ① 그 번들을 받아 로컬 마켓플레이스 소스(plugin/·marketplace.json)만 덮어써 최신화(사용자 config·docs 불변)
#     ② claude plugin marketplace/plugin update 로 각 플러그인 갱신
#   → 세션 재시작이면 새 스킬·훅 반영. (서버 컴포넌트 mcp/대시보드는 범위 밖 — 관리자가 docker로 배포.)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# plm_lib.sh: PLM_API_URL 해석(토큰 불필요 — /template/download는 무인증 공개).
# shellcheck source=/dev/null
[ -f "$HERE/plm_lib.sh" ] && . "$HERE/plm_lib.sh" && plm_resolve "" 2>/dev/null || true

MP="${PLM_MARKETPLACE:-jwk-platform}"
PLUGINS=(plan code plm-hub plm-channel)
API="${PLM_API_URL:-https://jwk-plm.shoi.ch}"; API="${API%/}"

command -v claude >/dev/null 2>&1 || { echo "[X] 'claude' CLI 없음 — Claude Code 설치 필요"; exit 1; }
command -v curl   >/dev/null 2>&1 || { echo "[X] 'curl' 없음"; exit 1; }
command -v tar    >/dev/null 2>&1 || { echo "[X] 'tar' 없음"; exit 1; }

# 1) 마켓플레이스 소스 루트(=로컬 저장소; .claude-plugin/marketplace.json 위치)를 CWD에서 상향 탐색.
_find_mp_root() {
  local d="${CLAUDE_PROJECT_DIR:-$PWD}"
  d="$(cd "$d" 2>/dev/null && pwd)" || return 1
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -f "$d/.claude-plugin/marketplace.json" ] && { echo "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}
ROOT="$(_find_mp_root || true)"

# 2) 서버 배포 최신 번들 다운로드(무인증).
echo "[*] 서버 배포 최신 플러그인 번들 다운로드: $API/template/download"
TMP="$(mktemp)"; TDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP" "$TDIR"; }
trap cleanup EXIT
if ! curl -fsSL -A "plm-update/1.0" "$API/template/download" -o "$TMP"; then
  echo "[X] 다운로드 실패 — 네트워크/URL($API) 확인"; exit 1
fi

if [ -n "$ROOT" ]; then
  # 3) plugin/ + marketplace.json만 로컬 저장소에 반영(사용자 config·.ouroboros·docs 불변).
  #    ⚠ 멤버 선택 추출(tar -xzf … plugin)은 번들 멤버명 접두('plugin/…' vs './plugin/…')에 따라 조용히
  #    깨진다(과거 "번들 손상?" 오진의 원인) → 전체를 임시 디렉토리에 풀고 복사(접두 무관·견고).
  echo "[*] 로컬 마켓플레이스 소스 최신화: $ROOT  (plugin/ · .claude-plugin/marketplace.json)"
  if ! tar -xzf "$TMP" -C "$TDIR" 2>/dev/null || [ ! -d "$TDIR/plugin" ]; then
    echo "[X] 번들 추출 실패 또는 plugin/ 부재 — 번들 손상?"; exit 1
  fi
  # ⚠ 단순 [ -e plugin/.git ] 판별 금지: 구 tarball이 서브모듈 gitfile(.git 파일)까지 포함 배포해
  #   레거시 설치본엔 '깨진 gitfile' 잔재가 흔함 → 실제 동작하는 git 저장소인지로 판별.
  if git -C "$ROOT/plugin" rev-parse --git-dir >/dev/null 2>&1; then
    # 개발 체크아웃(plugin = 실 git repo/서브모듈) — 파괴 금지, 파일 병합만(잔재 정리는 git이 담당).
    cp -R "$TDIR/plugin/." "$ROOT/plugin/" || { echo "[X] plugin/ 병합 실패"; exit 1; }
  else
    # 일반 설치본 — 교체(단순 병합은 리네임된 구 파일이 남아 커맨드 중복 등록되는 잔재 문제) · 준-원자적 스왑.
    rm -rf "$ROOT/plugin.new" \
      && cp -R "$TDIR/plugin" "$ROOT/plugin.new" \
      && rm -rf "$ROOT/plugin" \
      && mv "$ROOT/plugin.new" "$ROOT/plugin" \
      || { echo "[X] plugin/ 교체 실패"; exit 1; }
  fi
  if [ -f "$TDIR/.claude-plugin/marketplace.json" ]; then
    mkdir -p "$ROOT/.claude-plugin"
    cp "$TDIR/.claude-plugin/marketplace.json" "$ROOT/.claude-plugin/marketplace.json" || true
  fi
  SRC="$ROOT"
else
  # 로컬 마켓플레이스 루트 미발견(마켓플레이스가 다른 경로) → 임시 추출본을 소스로 재등록.
  echo "[!] 로컬 마켓플레이스 루트(.claude-plugin/marketplace.json) 미발견 — 임시 번들을 소스로 등록"
  tar -xzf "$TMP" -C "$TDIR" || { echo "[X] 번들 추출 실패"; exit 1; }
  SRC="$TDIR"
  claude plugin marketplace add "$SRC" --scope project >/dev/null 2>&1 || true
fi

# 3.8) 마켓플레이스 등록 경로 self-heal — 등록 경로는 머신당 1개(최초 add 선점)라, 다른 디렉토리에서
#   update해도 Claude는 "등록된 경로"의 사본으로 설치해 버전 정체가 재발한다(중복/정체의 근본 원인).
#   → 등록 경로가 현재 ROOT와 다르면 known_marketplaces.json의 경로를 ROOT로 교정(.bak 백업).
#   (marketplace remove/add는 설치 플러그인 고아화 위험 → 직접 경로 교정이 안전. 이후 step 4가 재읽음.)
if [ -n "$ROOT" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$ROOT" "$MP" <<'PY' || true
import json, os, shutil, sys, time
root, mp = sys.argv[1], sys.argv[2]
p = os.path.expanduser("~/.claude/plugins/known_marketplaces.json")
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
e = d.get(mp)
if not isinstance(e, dict):
    sys.exit(0)
cur = (e.get("source") or {}).get("path") or e.get("installLocation") or ""
if os.path.realpath(cur or "/nonexistent") == os.path.realpath(root):
    sys.exit(0)
shutil.copy2(p, p + ".bak-" + time.strftime("%Y%m%d%H%M%S"))
if isinstance(e.get("source"), dict) and "path" in e["source"]:
    e["source"]["path"] = root
e["installLocation"] = root
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
print(f"[+] 마켓플레이스 '{mp}' 등록 경로 교정: {cur or '(없음)'} → {root}  (이 디렉토리가 업데이트 원본이 됩니다)")
PY
fi

# 4) 마켓플레이스 재읽기 + 각 플러그인 업데이트(프로젝트 스코프 우선, user 스코프 폴백 — P0-2).
echo "[*] 마켓플레이스 갱신: $MP"
claude plugin marketplace update "$MP" 2>&1 | grep -iE 'updated|error' | sed 's/^/    /' || true
for p in "${PLUGINS[@]}"; do
  out="$(claude plugin update "$p@$MP" --scope project 2>&1 || true)"
  if printf '%s' "$out" | grep -qiE 'not installed'; then
    out="$(claude plugin update "$p@$MP" 2>&1 || true)"
  fi
  line="$(printf '%s' "$out" | grep -iE 'updated from|up to date|up-to-date|Restart|not installed' | head -1)"
  [ -n "$line" ] && printf '    %-12s %s\n' "$p:" "$line" || printf '    %-12s (처리됨)\n' "$p:"
done

# 4.5) ouroboros MCP 인증 self-heal(구설치본) — update만으로 ouro 연결이 살아나게:
#   ① 헬퍼(.ouroboros/env/mcp-auth.sh)를 번들 최신으로 배치(토큰 자동 취득 self-heal 포함)
#   ② .mcp.json ouroboros 블록에 headersHelper 없으면 전환(구 인증 방식 → 토큰 헤더)
#   토큰 자체는 mcp-auth.sh가 연결 시 PLM 인증(/ouro-token)으로 자동 발급 — 수동 배부 불필요.
if [ -n "$ROOT" ] && [ -f "$TDIR/plugin/plan/seed/env/mcp-auth.sh" ]; then
  mkdir -p "$ROOT/.ouroboros/env"
  cp "$TDIR/plugin/plan/seed/env/mcp-auth.sh" "$ROOT/.ouroboros/env/mcp-auth.sh" 2>/dev/null \
    && echo "[+] .ouroboros/env/mcp-auth.sh 최신화 — ouro 토큰 자동 발급 지원"
fi
if [ -n "$ROOT" ] && [ -f "$ROOT/.mcp.json" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$ROOT/.mcp.json" <<'PY' || true
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
srv = d.get("mcpServers")
if not isinstance(srv, dict):
    sys.exit(0)
o = srv.get("ouroboros")
if isinstance(o, dict) and "headersHelper" not in o:
    o["headersHelper"] = "bash .ouroboros/env/mcp-auth.sh ouro"
    o.pop("headers", None)
    json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
    print("[+] .mcp.json ouroboros -> headersHelper 인증으로 전환(재시작 후 적용)")
PY
fi

# 4.8) 설치 기록 정리 — 삭제된 디렉토리의 유령 항목 purge(우리 4종 한정·.bak 백업) + 멀티 디렉토리 요약.
#   'claude plugin list'가 디렉토리별 설치를 전부 나열해 유령/구버전이 목록을 오염하던 문제의 해소.
if command -v python3 >/dev/null 2>&1; then
  python3 - "$MP" <<'PY' || true
import json, os, shutil, sys, time
mp = sys.argv[1]
OURS = {f"{n}@{mp}" for n in ("plan", "code", "plm-hub", "plm-channel")}
p = os.path.expanduser("~/.claude/plugins/installed_plugins.json")
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
plugins = d.get("plugins")
if not isinstance(plugins, dict):
    sys.exit(0)
purged = 0
dirs = set()
for key in list(plugins.keys()):
    if key not in OURS:
        continue  # 타 플러그인 불변
    ent = plugins[key]
    if not isinstance(ent, list):
        continue
    keep = []
    for e in ent:
        pp = e.get("projectPath", "") if isinstance(e, dict) else ""
        if e.get("scope") == "project" and pp and not os.path.isdir(pp):
            purged += 1
            continue
        keep.append(e)
        if pp:
            dirs.add(pp)
    plugins[key] = keep
if purged:
    shutil.copy2(p, p + ".bak-" + time.strftime("%Y%m%d%H%M%S"))
    json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
    print(f"[+] 설치 기록 정리: 삭제된 디렉토리의 유령 항목 {purged}건 제거(백업 .bak 생성)")
n = len(dirs)
if n > 1:
    print(f"[i] 이 머신에 워크플로우 플러그인이 설치된 디렉토리 {n}곳 — 목록의 중복 표시는 디렉토리별 기록입니다.")
    print("    각 디렉토리의 버전은 '그 디렉토리에서 update 실행' 시 최신화됩니다(안 쓰는 디렉토리는 그곳에서 uninstall).")
PY
fi

# 5) 레거시 훅 정리(self-heal) — 구 인스톨러가 .claude/settings.json에 심은 '.ouroboros/hooks/*' 훅 항목 제거.
#    플러그인이 훅을 제공(plugin hooks.json)하므로 중복이고, .ouroboros/hooks/가 없으면 매 도구호출마다
#    "No such file or directory" 에러(비차단)가 난다. .ouroboros/hooks/를 가리키는 항목만 surgical 제거(커스텀 훅 보존).
if [ -n "$ROOT" ] && [ -f "$ROOT/.claude/settings.json" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$ROOT/.claude/settings.json" <<'PY' || true
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
hooks = d.get("hooks")
if not isinstance(hooks, dict):
    sys.exit(0)
def legacy(cmd):
    return isinstance(cmd, str) and ".ouroboros/hooks/" in cmd
changed = False
new_hooks = {}
for event, groups in hooks.items():
    if not isinstance(groups, list):
        new_hooks[event] = groups; continue
    ng = []
    for g in groups:
        hl = g.get("hooks", []) if isinstance(g, dict) else []
        kept = [h for h in hl if not legacy(h.get("command", ""))]
        if len(kept) != len(hl):
            changed = True
        if kept:
            g = dict(g); g["hooks"] = kept; ng.append(g)
    if ng:
        new_hooks[event] = ng
if changed:
    if new_hooks:
        d["hooks"] = new_hooks
    else:
        d.pop("hooks", None)
    json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
    print("[+] .claude/settings.json 레거시 훅(.ouroboros/hooks/*) 정리 — 플러그인이 훅 제공(중복·누락 에러 제거)")
PY
fi

echo
echo "[✓] 플러그인 업데이트 완료 (서버 배포 최신 기준)."
echo "    → 반영: Claude Code 세션을 재시작하세요(새 스킬·훅 로드)."
echo "    (mcp-server·대시보드 등 서버 컴포넌트는 이 명령 범위 밖 — 관리자 docker 배포.)"
