#!/bin/bash
# UserPromptSubmit Hook — 기획 워크플로우 가이드라인 1줄 주입. graceful: 항상 exit 0.
# 거버넌스 백엔드 = PLM(plm-hub). 동기화는 plm-sync hook(자동)·게이트는 plm-gate hook(Stop).
set -uo pipefail

echo "[planning] 1)불확실하면 질문 2)본문·관계=로컬 SSOT / Status=PLM(거버넌스 백엔드) 3)아티팩트=CODE.json(ADR-019 동형, markdown 금지)·owner 관계만 relations에 기재 4)작업 완료 시 current.md 갱신"
exit 0
