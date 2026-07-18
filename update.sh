#!/usr/bin/env bash
# update.sh — 워크플로우 업데이트 (make update). 재설치 없이 최신화한다.
#
#   갱신: ① 플러그인(commands/hooks/scripts = 스킬·훅·워크플로우 로직) via claude plugin update
#         ② 스캐폴딩 instruction(.ouroboros/docs/_GUIDE.md · env/.env.example) via 최신 seed 재sync
#   보존: .env(토큰) · docs/**/*.json(아티팩트) · config/plm.json(바인딩) · context/{state.json,current.md}
#
# 왜 필요한가: plugin update는 마켓플레이스 플러그인(스킬·훅)만 갱신한다. install 시 프로젝트로 '복사'된
#   스캐폴딩(instruction md·예시)은 그대로 남아 낡는다. 이 스크립트가 그 격차를 메운다.
#   CLAUDE.md·Makefile 등 '템플릿 루트' 파일까지 갱신하려면 웹 인스톨러 재실행(데이터 보존).
#
# 사용:  make update       (또는)  bash update.sh
#        MP=<marketplace> bash update.sh   # 마켓플레이스 이름 오버라이드(기본 jwk-platform)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OURO="$ROOT/.ouroboros"
PLUGINS=(plan code plm-hub plm-channel)

# 배포 프로파일: .env 핀(PLM_ENV)을 읽어 그 환경으로 고정(갱신이 환경을 바꾸지 않음 = 섞임 방지).
[ -f "$ROOT/profiles.sh" ] && . "$ROOT/profiles.sh"
PINNED_ENV="$(grep -oE '^PLM_ENV=.+' "$OURO/env/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' \r')"
PLM_ENV="${PLM_ENV:-$PINNED_ENV}"; PLM_ENV="${PLM_ENV:-jwk}"
if command -v resolve_profile >/dev/null 2>&1 && resolve_profile "$PLM_ENV"; then
  MP="${MP:-$PROFILE_MP}"
else
  MP="${MP:-jwk-platform}"
fi

c_ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
c_warn(){ printf '  \033[33m!\033[0m %s\n' "$1"; }
c_step(){ printf '\033[1m-> %s\033[0m\n' "$1"; }

echo "== 워크플로우 업데이트 (marketplace: $MP) =="

# ── ⓪ 소스 최신화 (git) ─ jwk-platform 마켓플레이스 = 이 로컬 저장소(CURDIR). 따라서 plugin 새 버전은
#     저장소·plugin 서브모듈을 먼저 당겨야 반영된다. 이 단계가 없으면 아래 marketplace/plugin update가
#     옛 로컬 파일만 재-읽어 실제로는 새 버전이 있어도 "이미 최신(0.1.x)"으로 나온다(무성 정체).
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  c_step "소스 최신화 (git pull + plugin 서브모듈)"
  if out="$(git -C "$ROOT" pull --ff-only 2>&1)"; then
    c_ok "저장소: $(printf '%s' "$out" | tail -1)"
  else
    c_warn "git pull 건너뜀(로컬 변경·비-ff·오프라인 가능) — 수동 'git pull' 후 재실행 권장"
  fi
  # plugin 서브모듈만 부모 핀 SHA로 정렬(마켓플레이스 소스). 로컬 변경 있으면 graceful 실패.
  if out="$(git -C "$ROOT" submodule update --init --recursive plugin 2>&1)"; then
    c_ok "plugin 서브모듈 = 저장소 핀 버전"
  else
    c_warn "plugin 서브모듈 갱신 실패 — 'git -C plugin status'로 로컬 변경 정리 후 재실행"
  fi
else
  c_warn "git 저장소 아님 — 소스 최신화 건너뜀(웹 인스톨러로 받았으면 인스톨러 재실행으로 최신화)"
fi

# ── ① 플러그인 갱신 (스킬·훅·스크립트) ─────────────────────────────────────────
if command -v claude >/dev/null 2>&1; then
  c_step "플러그인 갱신 (commands/hooks/scripts)"
  claude plugin marketplace update "$MP" 2>&1 | grep -iE 'updated|error' | sed 's/^/    /' || true
  for p in "${PLUGINS[@]}"; do
    # P0-2(macOS 재설치 미인식): 워크플로우 플러그인은 프로젝트 스코프 설치 — scope 없는 update는
    # user 스코프만 갱신해 프로젝트 구버전이 잔존했다. 프로젝트 스코프 우선, 미설치면 user 스코프 폴백.
    out="$(claude plugin update "$p@$MP" --scope project 2>&1 || true)"
    if printf '%s' "$out" | grep -qiE 'not installed'; then
      out="$(claude plugin update "$p@$MP" 2>&1 || true)"
    fi
    line="$(printf '%s' "$out" | grep -iE 'updated from|up to date|Restart|not installed' | head -1)"
    [ -n "$line" ] && printf '    %s: %s\n' "$p" "$line" || printf '    %s\n' "$p"
  done
else
  c_warn "claude CLI 없음 — 플러그인 갱신 건너뜀"
fi

# ── ② 스캐폴딩 instruction 재sync (안전 파일만·사용자 데이터 보존) ────────────
# seed 소스: 갱신된 plan 플러그인 캐시 → 없으면 로컬 plugin/plan/seed.
SEED=""
CACHE="$HOME/.claude/plugins/cache/$MP/plan"
if [ -d "$CACHE" ]; then
  latest="$(ls -1 "$CACHE" 2>/dev/null | sort -V | tail -1)"
  [ -n "$latest" ] && [ -d "$CACHE/$latest/seed" ] && SEED="$CACHE/$latest/seed"
fi
[ -z "$SEED" ] && [ -d "$ROOT/plugin/plan/seed" ] && SEED="$ROOT/plugin/plan/seed"

if [ -n "$SEED" ] && [ -d "$OURO" ]; then
  c_step "스캐폴딩 instruction 재sync"
  # 덮어써도 안전 = 프로젝트별 내용이 없는 순수 지침/예시. (사용자 데이터는 목록에 없음 → 보존.)
  for rel in docs/_GUIDE.md env/.env.example; do
    if [ -f "$SEED/$rel" ]; then
      mkdir -p "$OURO/$(dirname "$rel")"
      if cmp -s "$SEED/$rel" "$OURO/$rel" 2>/dev/null; then
        c_ok ".ouroboros/$rel (변경 없음)"
      else
        cp -f "$SEED/$rel" "$OURO/$rel" && c_ok ".ouroboros/$rel 갱신"
      fi
    fi
  done
elif [ ! -d "$OURO" ]; then
  c_warn ".ouroboros 없음 — 설치되지 않은 디렉토리? (make setup 먼저)"
else
  c_warn "seed 소스 없음 — 스캐폴딩 재sync 건너뜀"
fi

# ── ③ 배포 프로파일 재확인 (환경 고정 — 갱신 후 URL 드리프트/섞임 방지) ──────
if command -v apply_profile >/dev/null 2>&1 && [ -d "$OURO" ]; then
  c_step "배포 프로파일 재확인 ($PLM_ENV)"
  apply_profile "$ROOT" "$OURO"
  c_ok ".mcp.json·config·PLM_ENV = $PLM_ENV (ouro=${PROFILE_OUROBOROS_URL:-?} · plm=${PROFILE_PLM_API_URL:-?})"
fi

echo ""
echo "[OK] 업데이트 완료."
echo "  갱신됨 : 플러그인(스킬·훅·스크립트) · _GUIDE.md · .env.example"
echo "  보존됨 : .env(토큰) · docs/**/*.json(아티팩트) · config/plm.json · context/(state·current)"
echo "  → 플러그인 반영: Claude Code 재시작"
echo "  → CLAUDE.md·Makefile 등 루트 스캐폴딩까지 갱신하려면 웹 인스톨러 재실행(기존 .env·데이터 보존)."
