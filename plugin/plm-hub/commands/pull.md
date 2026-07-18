---
description: PLM(대시보드) → 로컬 CODE.json 역방향 반영 (Status·관계·code_refs). 대시보드 편집분 회수.
---

대시보드에서 수정한 내용(Status 전이·관계·본문)을 로컬 `CODE.json`(ADR-019 동형)으로 **역방향 반영**한다. (plm-sync는 로컬→PLM 단방향이므로 그 반대.)

1. 바인딩(project/api_url)·토큰 확인(없으면 `/plm-hub:link`).
2. `scripts/sync_bulk.py export --project <project>` 실행 → PLM `/export` 번들을 받아 `.ouroboros/docs/{type→dir}/{code}.json` 로 기록:
   - **Status**: PLM 권위 → 로컬 CODE.json 래퍼에 반영.
   - **관계·code_refs**: PLM 보유분을 래퍼(`relations`·`code_refs`)에 반영.
   - **본문(body)**: 대시보드 편집분이 있으면 로컬에 회수(merge). 로컬·PLM 양쪽 변경 충돌 시 해시 비교로 경고 → 사용자 선택(`--force` 덮어쓰기).
3. 반영 결과(갱신 파일 수·충돌)를 보고.

## SSOT 규약 (재정의)
- **본문·관계 = 로컬 CODE.json 권위**(생성·편집의 정본). 단 대시보드에서 편집했다면 `/plm-hub:pull`로 회수해 정합 유지.
- **Status = PLM 권위** → `pull`로만 로컬 반영(로컬에서 임의 전이 금지).
- 표준: 로컬 편집 → plm-sync(자동 push) / 대시보드 편집 → `/plm-hub:pull`(수동 회수).
