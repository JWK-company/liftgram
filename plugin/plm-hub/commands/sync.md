---
description: 로컬 기획 .md 전체를 PLM과 동기 (export/import 일괄)
---

`.ouroboros/config/plm.json` 의 바인딩으로 전체 동기를 수행한다.

1. 바인딩(project/api_url)과 토큰을 확인한다(없으면 `/plm-hub:link` 안내).
2. **로컬→PLM(권위)**: `.ouroboros/docs/{requirements,design,decisions,roadmap}/*.md` 를 `plm` MCP의 `import` 도구(또는 `scripts/sync.py import`)로 일괄 upsert한다.
3. 충돌(로컬·PLM 양쪽 변경) 감지 시 사용자에게 질의한다(로컬이 SSOT — `--force`로 덮어쓰기).
4. 동기 결과(생성/수정/관계/skip)를 보고하고 `/plm-hub:gates`로 게이트 상태를 확인한다.
