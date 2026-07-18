#!/usr/bin/env bash
# UserPromptSubmit — PLM 거버넌스 환기 + 프로젝트 바인딩 상태. 로컬·비차단.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
plm_resolve
if [[ -n "${PLM_PROJECT:-}" && ( "${PLM_ENABLED:-1}" == "1" || "${PLM_ENABLED:-1}" == "true" ) ]]; then
  echo "[plm-hub] 거버넌스 백엔드=PLM(project=${PLM_PROJECT} @ ${PLM_API_URL}). 연동(ADR-019 동형): 문서=.ouroboros/docs/*.json(CODE.json — schemaVersion/id/type/relations/doc) — markdown 금지, 저장 시 doc·relations 자동 동기 / 코드=별도 repo 소스에 \`// @plm SRS-NNN\` 주석 → /plm-hub:codescan으로 딥링크. SSOT=doc·관계 로컬·Status PLM. 규칙 전문 .ouroboros/docs/_GUIDE.md. 조회/발급은 plm MCP 14도구."
else
  echo "[plm-hub] PLM 미바인딩 — '/plm-hub:link <project>'로 연결하면 .json(CODE.json)↔PLM 자동 동기·게이트가 활성화됩니다. (MCP 도구는 바인딩 없이도 사용 가능)"
fi
exit 0
