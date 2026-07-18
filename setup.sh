#!/usr/bin/env bash
# jwk-platform — cross-platform installer (Git Bash on Windows · Linux · macOS).
# Equivalent to `make setup` but needs no `make` (Git Bash friendly), and auto-installs
# the base runtimes (Node.js/npx, uv/uvx, Claude Code CLI, git) when missing.
#
# Usage (from the repo root):
#   bash setup.sh              full install (deps + plugins + .ouroboros + .env)
#   bash setup.sh --check      show install status
#   bash setup.sh --skip-deps  don't auto-install runtimes (only plugins/seed/env)
#   bash setup.sh --notion     also install optional Notion MCP plugin
#   bash setup.sh --channels   channel usage guidance
#   bash setup.sh --dry-run    print actions without executing
#
# Idempotent: safe to re-run (skips installed plugins, keeps existing .env / .ouroboros).
set -uo pipefail

# ---- args ----
CHECK=0; SKIP_DEPS=0; NOTION=0; CHANNELS=0; CHANNEL_POLICY=0; DRY=0
for a in "$@"; do case "$a" in
  --check) CHECK=1;; --skip-deps) SKIP_DEPS=1;; --notion) NOTION=1;;
  --channels) CHANNELS=1;; --channel-policy) CHANNEL_POLICY=1;; --dry-run) DRY=1;;
  --env=*) PLM_ENV="${a#*=}";;
  -h|--help) sed -n '2,16p' "$0"; exit 0;;
  *) echo "unknown arg: $a"; exit 2;;
esac; done

# ---- paths / constants ----
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
OFFICIAL="claude-plugins-official"
PLUGINS=("chrome-devtools-mcp@$OFFICIAL" "context7@$OFFICIAL" "serena@$OFFICIAL")
NOTION_MP_SRC="makenotion/claude-code-notion-plugin"
NOTION_PLUGIN="notion-workspace-plugin@notion-plugin-marketplace"
MP="jwk-platform"
LOCAL_PLUGINS=(plan code plm-hub plm-channel)
SEED="$ROOT/plugin/plan/seed"
OURO="$ROOT/.ouroboros"
ENV_FILE="$OURO/env/.env"

# ---- 배포 환경 프로파일 (섞임 방지) ----
# 우선순위: 명시 PLM_ENV(env/--env) > 기존 .env 핀(재설치 시 환경 유지) > 기본 jwk.
[ -f "$ROOT/profiles.sh" ] && . "$ROOT/profiles.sh"
PINNED_ENV="$(grep -oE '^PLM_ENV=.+' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' \r')"
PLM_ENV="${PLM_ENV:-$PINNED_ENV}"; PLM_ENV="${PLM_ENV:-jwk}"
if command -v resolve_profile >/dev/null 2>&1; then
  if ! resolve_profile "$PLM_ENV"; then
    echo "[!] 알 수 없는 PLM_ENV='$PLM_ENV' (지원: $(profile_list)). jwk 로 진행."
    PLM_ENV=jwk; resolve_profile jwk
  fi
  MP="$PROFILE_MP"   # 마켓플레이스도 프로파일 기준
fi

# ---- os detect ----
OS="$(uname -s 2>/dev/null || echo unknown)"
IS_WIN=0
case "$OS" in MINGW*|MSYS*|CYGWIN*) IS_WIN=1;; esac
# root면 sudo 불필요(컨테이너/도커). 아니면 sudo(있을 때).
SUDO=""; [ "$(id -u 2>/dev/null || echo 0)" = 0 ] || { command -v sudo >/dev/null 2>&1 && SUDO="sudo"; }

# ---- helpers ----
c_cyan(){ printf '\033[36m%s\033[0m\n' "$*"; }
step(){ printf '\033[36m-> %s\033[0m\n' "$*"; }
ok(){   printf '  \033[32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '  \033[33m[!]\033[0m %s\n' "$*"; }
err(){  printf '  \033[31m[X]\033[0m %s\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }
run(){ if [ "$DRY" = 1 ]; then printf '    [dry] %s\n' "$*"; else eval "$@"; fi; }

# winget available on Windows?
has_winget(){ [ "$IS_WIN" = 1 ] && command -v winget >/dev/null 2>&1; }
WG_FLAGS="-e --accept-source-agreements --accept-package-agreements --silent"

# ---- dependency installers ----
install_node(){
  step "installing Node.js (npx)"
  if has_winget; then run "winget install $WG_FLAGS --id OpenJS.NodeJS.LTS"; return; fi
  if [ "$OS" = Darwin ] && have brew; then run "brew install node"; return; fi
  # Linux 등: 공식 LTS tarball을 ~/.local 로(무sudo·모던·경량). curl+tar 필요.
  if have curl && have tar; then
    local a v url
    a="$(uname -m)"; case "$a" in x86_64) a=x64;; aarch64|arm64) a=arm64;; armv7l) a=armv7l;; esac
    v="$(curl -fsSL https://nodejs.org/dist/index.json 2>/dev/null | tr '}' '\n' | grep '"lts":"' | head -1 | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
    if [ -n "$v" ]; then
      run "curl -fsSL \"https://nodejs.org/dist/$v/node-$v-linux-$a.tar.gz\" -o /tmp/node.tgz && mkdir -p \"\$HOME/.local\" && tar -xzf /tmp/node.tgz -C \"\$HOME/.local\" --strip-components=1 && rm -f /tmp/node.tgz"
      ok "Node.js $v installed (tarball) -> \$HOME/.local"
      return
    fi
  fi
  # 폴백: 패키지 매니저(구버전일 수 있음)
  if have apt-get; then run "$SUDO apt-get update && $SUDO apt-get install -y nodejs npm"
  elif have dnf; then run "$SUDO dnf install -y nodejs"
  elif have pacman; then run "$SUDO pacman -S --noconfirm nodejs npm"
  else warn "Node.js 자동설치 불가 — https://nodejs.org 에서 LTS 설치 후 재실행"; return 1; fi
}
install_uv(){
  step "installing uv (uvx)"
  if has_winget; then run "winget install $WG_FLAGS --id astral-sh.uv"
  else run "curl -LsSf https://astral.sh/uv/install.sh | sh"; fi
}
install_git(){
  step "installing git"
  if has_winget; then run "winget install $WG_FLAGS --id Git.Git"
  elif [ "$OS" = Darwin ] && have brew; then run "brew install git"
  elif have apt-get; then run "$SUDO apt-get install -y git"
  else warn "git 자동설치 불가 — https://git-scm.com 설치"; return 1; fi
}
install_claude(){
  step "installing Claude Code CLI"
  if [ "$IS_WIN" = 1 ] && have powershell; then
    run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"irm https://claude.ai/install.ps1 | iex\""
  else
    run "curl -fsSL https://claude.ai/install.sh | bash"
  fi
}

# 새로 설치된 도구를 현재 셸 PATH에 노출(재시작 없이). 흔한 설치 경로 추가.
refresh_path(){
  export PATH="$PATH:$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.claude/bin:$HOME/AppData/Local/Programs/nodejs:/c/Program Files/nodejs:/c/Program Files/Git/cmd"
  hash -r 2>/dev/null || true
}

ensure_deps(){
  if [ "$SKIP_DEPS" = 1 ]; then step "skipping runtime install (--skip-deps)"; return 0; fi
  step "checking / installing base runtimes (git, node, uv, claude)"
  [ "$IS_WIN" = 1 ] && ! has_winget && warn "winget 없음 — Windows 10 1809+/11 권장. 없으면 각 도구 공식 설치본 사용."
  have git   || install_git
  have npx   || { have node || install_node; }
  have uvx   || install_uv
  have claude|| install_claude
  refresh_path
  # 재검증
  local miss=()
  for c in claude npx uvx; do have "$c" || miss+=("$c"); done
  if [ ${#miss[@]} -gt 0 ]; then
    warn "설치했으나 현재 세션 PATH에 아직 없음: ${miss[*]}"
    warn "터미널을 새로 열고 'bash setup.sh' 를 다시 실행하세요(설치는 유지됨)."
    return 1
  fi
  ok "runtimes ready: claude, npx, uvx"
}

# ---- plugin / seed / env (Makefile 등가) ----
install_plugins(){
  step "installing MCP plugins (chrome-devtools / context7 / serena)"
  # Fresh claude installs don't have the official marketplace registered - add it first.
  run "claude plugin marketplace add anthropics/claude-plugins-official" 2>&1 | sed 's/^/    /' || true
  for p in "${PLUGINS[@]}"; do echo "  * $p"; run "claude plugin install \"$p\"" 2>&1 | sed 's/^/    /'; done
}
install_notion(){
  step "installing Notion MCP plugin (optional)"
  run "claude plugin marketplace add \"$NOTION_MP_SRC\"" 2>&1 | sed 's/^/    /'
  run "claude plugin install \"$NOTION_PLUGIN\"" 2>&1 | sed 's/^/    /'
}
install_local_plugins(){
  step "installing jwk-platform plugins (plan/code/plm-hub/plm-channel) — project scope"
  run "claude plugin marketplace add \"$ROOT\" --scope project" 2>&1 | sed 's/^/  /' \
    || run "claude plugin marketplace update $MP" 2>&1 | sed 's/^/  /' || true
  # 재설치 함정(P0-2, macOS 리포트): 기설치 경로에 재설치하면 install이 "already installed"로
  # 구버전 프로젝트 스코프를 유지 → 신버전의 새 skill이 안 보인다. marketplace를 항상 최신화하고
  # install 후 update --scope project로 신버전을 강제한다(신규 설치엔 no-op).
  run "claude plugin marketplace update $MP" 2>&1 | sed 's/^/  /' || true
  for p in "${LOCAL_PLUGINS[@]}"; do
    echo "  * $p@$MP (project)"; run "claude plugin install \"$p@$MP\" --scope project" 2>&1 | sed 's/^/    /'
    run "claude plugin update \"$p@$MP\" --scope project" 2>&1 | grep -iE 'updated|up to date|error' | sed 's/^/    /' || true
  done
  echo "  usage: plan:<command> / code:<command> / plm-hub:<command>"
}
copy_seed(){
  step "creating .ouroboros seed"
  [ -d "$SEED" ] || { err "seed dir not found: $SEED"; exit 1; }
  if [ "$DRY" = 1 ]; then printf '    [dry] cp -rn %s/. %s/\n' "$SEED" "$OURO"; return; fi
  mkdir -p "$OURO/env"
  cp -rn "$SEED/." "$OURO/" 2>/dev/null || cp -r "$SEED/." "$OURO/"   # -n=no-clobber (기존 보존)
  ok ".ouroboros ready (docs / env / config / context)"
}
ensure_env(){
  step "ensuring .ouroboros/env/.env"
  mkdir -p "$OURO/env"
  if grep -qE '^PLM_API_TOKEN=.+' "$ENV_FILE" 2>/dev/null; then ok ".env already configured (PLM_API_TOKEN present) — kept"; return; fi
  if [ "$DRY" = 1 ]; then printf '    [dry] write .env skeleton\n'; return; fi
  if [ ! -f "$ENV_FILE" ]; then
    local proj; proj="$(basename "$ROOT")"
    cat > "$ENV_FILE" <<EOF
# Ouroboros / PLM workflow env.  배포 환경 = $PLM_ENV (섞임 방지 핀 — 바꾸려면 PLM_ENV=<env> 로 재설치).
# PLM_API_TOKEN is filled by \`/plm-hub:link <project>\` (reuses your MCP OAuth), or blank to use MCP auth.
PLM_ENV=$PLM_ENV
OUROBOROS_URL=${PROFILE_OUROBOROS_URL:-https://jwk-ouro.shoi.ch}
PLM_API_URL=${PROFILE_PLM_API_URL:-https://jwk-plm.shoi.ch}
DEVELOPER_USER_ID=
PROJECT_ID=$proj
PLM_API_TOKEN=
EOF
    ok ".env skeleton created ($PLM_ENV) — run /plm-hub:link <project> after launching Claude"
  else warn ".env exists but PLM_API_TOKEN empty — /plm-hub:link will fill it"; fi
}
channels_info(){
  step "channels (web [Sync] -> this session)"
  echo "  run:  claude --dangerously-skip-permissions --channels plugin:plm-channel@jwk-platform"
  echo "  -> the web [Sync] button pushes <channel> messages into that Claude session."
  echo "  If you hit 'not on the approved channels allowlist': bash setup.sh --channel-policy (sudo/admin)."
}
# 채널 allowlist(managed-settings.json) 등록 — 기존 plm-channel setup 스크립트 재사용(OS별 경로·sudo 처리).
channel_policy(){
  local sc="$ROOT/plugin/plm-channel/scripts/setup-channels.sh"
  if [ -f "$sc" ]; then run "bash \"$sc\" --policy"
  else warn "setup-channels.sh not found ($sc) — set managed-settings allowlist manually."; fi
}
# setup 중 자동 시도: root=인라인 · sudo+대화형 tty=프롬프트 1회 · 그 외=안내 후 계속(비차단).
channel_policy_auto(){
  [ "$DRY" = 1 ] && { printf '    [dry] channel policy (auto)\n'; return 0; }
  local sc="$ROOT/plugin/plm-channel/scripts/setup-channels.sh"
  [ -f "$sc" ] || { warn "setup-channels.sh 없음 — 채널 정책 수동 필요"; return 0; }
  if [ "$(id -u 2>/dev/null || echo 1)" = 0 ]; then
    step "channel policy (root — inline)"
    bash "$sc" --policy || warn "channel policy 실패 — 나중에: bash setup.sh --channel-policy"
  elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
    step "channel policy (sudo 비밀번호를 물을 수 있음)"
    bash "$sc" --policy || warn "건너뜀 — 나중에: sudo 가능한 셸에서 bash setup.sh --channel-policy"
  else
    warn "channel policy 생략(비대화형/sudo 없음) — 채널 쓰려면 1회: bash setup.sh --channel-policy"
  fi
}
show_check(){
  echo "=== plugins ==="; have claude && claude plugin list 2>/dev/null | grep -iE "chrome|context7|serena|notion|plan|code|plm" || echo "  (claude 없음)"
  echo "=== MCP ==="; have claude && claude mcp list 2>/dev/null | grep -iE "chrome|context7|serena|ouroboros|plm" || true
  echo "=== runtimes ==="; for c in claude npx uvx git; do have "$c" && ok "$c" || err "$c missing"; done
  echo "=== ouroboros env ==="
  [ -d "$OURO/docs" ] && ok ".ouroboros/docs" || err ".ouroboros/docs missing"
  if [ -f "$ENV_FILE" ]; then ok ".env"; for k in OUROBOROS_URL DEVELOPER_USER_ID PROJECT_ID; do grep -q "^$k=" "$ENV_FILE" && echo "    [OK] $k" || echo "    [X] $k missing"; done; else err ".env missing"; fi
}

# ---- dispatch ----
if [ "$CHECK" = 1 ]; then show_check; exit 0; fi
if [ "$CHANNEL_POLICY" = 1 ]; then channel_policy; exit 0; fi
if [ "$CHANNELS" = 1 ]; then channels_info; exit 0; fi

# 레거시 정리: 구 ouroboros 전역 hook($HOME/.claude/settings.json 의 .ouroboros/hooks/*)을 제거한다.
# 새 워크플로우는 hook을 플러그인(${CLAUDE_PLUGIN_ROOT}/hooks/)이 제공하므로, 구 전역 등록은 없는
# 파일(.ouroboros/hooks/*.sh)을 가리켜 매 도구호출마다 "No such file" 에러를 낸다. 플러그인 hook은 보존.
clean_legacy_hooks(){
  have python3 || return 0
  step "cleaning legacy ouroboros hooks (.ouroboros/hooks/*) from settings (global + project)"
  # 전역($HOME) + 프로젝트($ROOT) settings 둘 다 정리 — 구 인스톨러가 프로젝트 settings.json에도 심어
  # 매 도구호출 "No such file" 에러를 내던 잔재까지 제거(최초 설치·재설치 모두 자기치유). 플러그인 hook은 보존.
  local s
  for s in "$HOME/.claude/settings.json" "$ROOT/.claude/settings.json"; do
    [ -f "$s" ] || continue
    [ "$DRY" = 1 ] && { echo "    [dry] strip .ouroboros/hooks/* from $s"; continue; }
  python3 - "$s" <<'PY'
import json,sys,shutil,time
p=sys.argv[1]
try: d=json.load(open(p))
except Exception: sys.exit(0)
h=d.get("hooks")
if not h: sys.exit(0)
changed=False
for ev in list(h.keys()):
    groups=[]
    for g in h[ev]:
        kept=[hk for hk in g.get("hooks",[]) if ".ouroboros/hooks/" not in hk.get("command","")]
        if len(kept)!=len(g.get("hooks",[])): changed=True
        if kept: g["hooks"]=kept; groups.append(g)
    if groups: h[ev]=groups
    else:
        del h[ev]; changed=True
if not h: d.pop("hooks",None)
if changed:
    shutil.copy(p, p+".bak-legacy-hooks-"+time.strftime("%Y%m%d%H%M%S"))
    json.dump(d,open(p,"w"),ensure_ascii=False,indent=2); open(p,"a").write("\n")
    print("  [OK] 구 ouroboros 전역 hook 제거 — 플러그인 hook이 대체(백업 생성)")
else:
    print("  [OK] 레거시 hook 없음(정합)")
PY
  done
}

echo ""; c_cyan "=== jwk-platform setup ($OS) ==="
ensure_deps || { err "runtimes 미완 — 위 안내대로 조치 후 재실행."; exit 1; }
install_plugins
[ "$NOTION" = 1 ] && install_notion
install_local_plugins
clean_legacy_hooks
copy_seed
ensure_env
# 배포 프로파일 반영: .mcp.json default·config api_url·PLM_ENV 핀을 원자적으로 기입(섞임 방지).
if command -v apply_profile >/dev/null 2>&1 && [ "$DRY" != 1 ]; then
  apply_profile "$ROOT" "$OURO"
  ok "배포 프로파일 적용: $PLM_ENV (ouro=$PROFILE_OUROBOROS_URL · plm=$PROFILE_PLM_API_URL)"
fi
channel_policy_auto
channels_info

echo ""; ok "setup done."
echo "   - MCP plugins + plan/code/plm-hub/plm-channel installed"
echo "   - .ouroboros seed + .env created"
echo "   - restart Claude -> approve MCP (headersHelper 토큰 인증 — 헤드리스/채널 OK)"
echo "     · plm 토큰=/plm-hub:link 자동 · ouro 는 .env 의 OURO_MCP_TOKEN 필요(운영자 배부)"
echo "   - PLM governance: /plm-hub:link <project> (jwk-plm.shoi.ch)"
echo "   verify: bash setup.sh --check"
echo ""
