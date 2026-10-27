---
description: 로컬 기획 CODE.json 전체를 PLM과 동기 (export/import 일괄)
---

`.ouroboros/config/plm.json` 의 바인딩으로 전체 동기를 수행한다.

1. 바인딩(project/api_url)과 토큰을 확인한다(없으면 `/plm-hub:link` 안내).
2. **로컬→PLM(권위)**: `.ouroboros/docs/{requirements,design,decisions,roadmap,product,blueprint,design-research,wireframes}/*.json`(ADR-019 canonical, `.md` 레거시 병행) 를 `plm` MCP의 `import` 도구(또는 `scripts/sync_bulk.py import`)로 일괄 upsert한다. (`product/`의 PRD·BS·Business, `blueprint/`의 BP, `design-research/`의 DR, `wireframes/`의 WF는 미추적이지만 대시보드 표시·문서 뷰 열람 위해 동기된다. 반대 방향인 `/plm-hub:pull`은 `Code` 아티팩트를 `docs/code/`로도 내려받는다.)
3. 충돌(로컬·PLM 양쪽 변경) 감지 시 중단하고 사용자에게 질의한다(직전 export 스냅샷 대비 양쪽 다 바뀐 경우 — 로컬이 SSOT이므로 `--force`로 로컬을 밀어넣거나, 먼저 `/plm-hub:pull`로 PLM 변경을 받는다). ※ 이 충돌 검사는 `import` 방향에만 있다 — `pull`(export)은 검사 없이 로컬을 재작성한다.
4. 동기 결과(생성/수정/관계/skip)를 보고하고 `/plm-hub:gates`로 게이트 상태를 확인한다.

> ℹ **Wireframe(WF-*)도 이 명령의 대상이다**(감사 H-4에서 `sync_bulk.py`의 type→dir 표에 `Wireframe → wireframes`가 추가됐다 — 이전엔 import가 조용히 스킵하고 export는 `docs/misc/`로 떨어뜨려 **왕복이 아예 불가**했다). 다만 와이어프레임의 **정상 경로는 여전히 `/plm-hub:wfscan`(발급)·`/plm-hub:wfanno`(본문 동기)** 다 — 이 일괄 동기는 그 둘이 놓친 문서를 맞추는 안전망으로 쓴다.
> 그 밖에 동기에서 제외되는 것: 파일명이 `_`로 시작하는 문서 · **이름이 `_`/`.`로 시작하는 디렉터리**(특히 사본 작업 스테이징 `wireframes/.working/` — 승격 전 사본 명세가 PLM 정본으로 새면 안 된다) · `research/` · 래퍼에 `sync: false`가 붙은 민감 기획.
