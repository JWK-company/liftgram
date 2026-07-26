#!/usr/bin/env bash
# UserPromptSubmit — PLM 거버넌스 환기 + 프로젝트 바인딩 상태. 로컬·비차단.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
plm_resolve
# ── ouro 인증 자가치유(멱등·경량) ────────────────────────────────────────────
# 왜 훅에서: 구버전 사용자의 첫 /plm-hub:update는 "옛" 스크립트가 실행돼 파일 치유(4.5)가 그 회차에
# 적용되지 않는다 → 재시작 후 새 훅(이 블록)이 첫 프롬프트에서 치유 → 다음 세션부터 ouro 자동 연결.
# 게이트: 빠른 grep 2회로 이미 정상이면 즉시 통과(비용≈0). 치유 시에만 1줄 안내.
_ROOT="${PLM_CODE_ROOT:-}"
if [[ -n "$_ROOT" && -d "$_ROOT/.ouroboros" ]]; then
  _HEALED=""
  _HLP="$_ROOT/.ouroboros/env/mcp-auth.sh"
  _ENVF="$_ROOT/.ouroboros/env/.env"
  # ① 헬퍼가 없거나 구버전(self-heal 미지원)이면 최신 내용으로 배치.
  if ! grep -q "ouro-token" "$_HLP" 2>/dev/null; then
    mkdir -p "$_ROOT/.ouroboros/env"
    cat > "$_HLP" <<'MCPAUTH'
#!/usr/bin/env bash
# MCP 인증 헤더 생성기 — .mcp.json headersHelper 가 호출. .env 토큰으로 Bearer 헤더 출력.
# ouro 토큰 self-heal: 없으면 PLM 인증(/ouro-token)으로 자동 발급해 .env 에 기입.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ENV_FILE="$HERE/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
case "${1:-}" in
  plm)  TOKEN="${PLM_API_TOKEN:-}" ;;
  ouro) TOKEN="${OURO_MCP_TOKEN:-}" ;;
  *)    TOKEN="" ;;
esac
if [ "${1:-}" = "ouro" ] && [ -z "$TOKEN" ] && [ -n "${PLM_API_TOKEN:-}" ] && command -v curl >/dev/null 2>&1; then
  CFG="$HERE/../config/plm.json"; API=""
  if [ -f "$CFG" ] && command -v python3 >/dev/null 2>&1; then
    API="$(python3 -c "import json;print(json.load(open('$CFG')).get('api_url',''))" 2>/dev/null || true)"
  fi
  API="${API%/}"
  if [ -n "$API" ]; then
    NEW="$(curl -fsS -m 6 -H "authorization: Bearer $PLM_API_TOKEN" -H "user-agent: mcp-auth/1.0" \
      "$API/ouro-token" 2>/dev/null | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
    if [ -n "$NEW" ]; then TOKEN="$NEW"; printf 'OURO_MCP_TOKEN=%s\n' "$NEW" >> "$ENV_FILE" 2>/dev/null || true; fi
  fi
fi
if [ -z "$TOKEN" ]; then printf '{}'; else printf '{"Authorization":"Bearer %s"}' "$TOKEN"; fi
MCPAUTH
    _HEALED="helper"
  fi
  # ② .mcp.json ouroboros 블록에 headersHelper 없으면 전환.
  if [[ -f "$_ROOT/.mcp.json" ]] && grep -q '"ouroboros"' "$_ROOT/.mcp.json" 2>/dev/null \
     && ! grep -q 'mcp-auth.sh ouro' "$_ROOT/.mcp.json" 2>/dev/null && command -v python3 >/dev/null 2>&1; then
    python3 - "$_ROOT/.mcp.json" <<'PY' 2>/dev/null && _HEALED="${_HEALED:+$_HEALED+}mcp.json"
import json, sys
p = sys.argv[1]
d = json.load(open(p))
o = d.get("mcpServers", {}).get("ouroboros")
if isinstance(o, dict) and "headersHelper" not in o:
    o["headersHelper"] = "bash .ouroboros/env/mcp-auth.sh ouro"
    o.pop("headers", None)
    json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
else:
    sys.exit(1)
PY
  fi
  # ③ 토큰 선제 발급(선택) — PLM 인증 있고 OURO 토큰 없으면 지금 기입(다음 재시작 즉시 연결).
  if [[ -f "$_ENVF" ]] && ! grep -qE '^OURO_MCP_TOKEN=.' "$_ENVF" 2>/dev/null \
     && [[ -n "${PLM_API_TOKEN:-}" ]] && command -v curl >/dev/null 2>&1; then
    _OT="$(curl -fsS -m 6 -H "authorization: Bearer $PLM_API_TOKEN" -H "user-agent: plm-hook/1.0" \
      "${PLM_API_URL%/}/ouro-token" 2>/dev/null | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
    if [[ -n "$_OT" ]]; then
      printf 'OURO_MCP_TOKEN=%s\n' "$_OT" >> "$_ENVF" 2>/dev/null && _HEALED="${_HEALED:+$_HEALED+}token"
    fi
  fi
  [[ -n "$_HEALED" ]] && echo "[plm-hub] ouro MCP 인증 자가치유 적용($_HEALED) — 다음 Claude 재시작부터 ouroboros 자동 연결됩니다."
fi

if [[ -n "${PLM_PROJECT:-}" && ( "${PLM_ENABLED:-1}" == "1" || "${PLM_ENABLED:-1}" == "true" ) ]]; then
  echo "[plm-hub] 거버넌스 백엔드=PLM(project=${PLM_PROJECT} @ ${PLM_API_URL}). 연동(ADR-019 동형): 문서=.ouroboros/docs/*.json(CODE.json — schemaVersion/id/type/relations/doc) — markdown 금지, 저장 시 doc·relations 자동 동기 / 코드=별도 repo 소스에 \`// @plm SRS-NNN\` 주석 → /plm-hub:codescan으로 딥링크. SSOT=doc·관계 로컬·Status PLM. 규칙 전문 .ouroboros/docs/_GUIDE.md. 조회/발급은 plm MCP 14도구."
else
  echo "[plm-hub] PLM 미바인딩 — '/plm-hub:link <project>'로 연결하면 .json(CODE.json)↔PLM 자동 동기·게이트가 활성화됩니다. (MCP 도구는 바인딩 없이도 사용 가능)"
fi
exit 0
