---
description: PLM(대시보드) → 로컬 CODE.json 역방향 반영 (Status·관계·본문). 대시보드 편집분 회수 — 로컬 파일을 재작성한다.
---

대시보드에서 수정한 내용(Status 전이·관계·본문)을 로컬 `CODE.json`(ADR-019 동형)으로 **역방향 반영**한다. (plm-sync는 로컬→PLM 단방향이므로 그 반대.)

> ⚠ **먼저 읽어라 — pull 은 파괴적이다.** 이 명령은 로컬 CODE.json 을 **통째로 재작성**한다. 병합도, 충돌 감지도, 되묻는 확인도 **없다**. 실행 전 `git status` 로 미커밋 편집이 없는지 확인하고, 있으면 **먼저 커밋하거나 백업**하라. 되돌리는 유일한 수단은 git 이다.

1. 바인딩(project/api_url)·토큰 확인(없으면 `/plm-hub:link`).
2. **실행 전 안전 확인**: `git status --porcelain .ouroboros/docs` 로 미커밋 편집을 점검한다. 변경이 있으면 커밋(또는 `git stash`) 후 진행 — pull 은 그 편집을 **경고 없이 덮어쓴다**.
3. `scripts/sync_bulk.py export --project <project>` 실행 → PLM `/export` 번들을 받아 `.ouroboros/docs/{type→dir}/{code}.json` 로 기록:
   - **Status**: PLM 권위 → 로컬 CODE.json 래퍼에 반영.
   - **관계**: PLM 보유 owner 관계를 래퍼 `relations` 에 반영. ⚠ `code_refs` 는 회수 대상이 **아니다** — 재작성 과정에서 기존 로컬 `code_refs` 가 **지워진다**. pull 후 `/plm-hub:codescan` 을 돌려 복원하라.
   - **본문(body)**: PLM 본문(`/export` + `GET /doc`)으로 로컬 파일을 **무조건 재작성**한다(merge 아님·충돌 감지 없음). 같은 code 의 레거시 동명 `.md` 가 있으면 **삭제**한다.
   - 확인 절차나 덮어쓰기 승인 플래그는 이 경로에 **없다**. (`--force` 는 `import` 서브커맨드 전용 — `export` 에 붙이면 argparse 가 거부한다.)
4. 반영 결과(갱신 파일 수)를 보고하고, 필요하면 `/plm-hub:codescan` 으로 `code_refs` 를 재생성한다.

> ⚠ **Wireframe(WF-*)은 이제 제자리로 내려온다 — 그래서 더 위험하다.** 감사 H-4 로 `sync_bulk.py` 의 type→dir 표에 `Wireframe → wireframes` 가 추가됐다(이전엔 `.ouroboros/docs/misc/WF-*.json` 이라는 엉뚱한 위치로 떨어졌고 import 대상도 아니라 영영 되돌아가지 않았다). 이제 pull 은 **와이어프레임 SSOT 인 `docs/wireframes/WF-*.json` 을 PLM 본문으로 재작성**한다 — 래퍼의 `screen_code`·`route`·`note` 는 PLM 이 돌려주지 않으므로 파일에서 사라진다(값 자체는 `doc` 의 H2 제목·`노트:` 문단에서 복원되어 `load_sae_spec` 이 계속 읽는다). 와이어프레임의 정상 경로는 `/plm-hub:wfscan`·`/plm-hub:wfanno` 이고, WF 를 되돌릴 목적이 아니라면 pull 전에 `docs/wireframes/` 를 커밋해 두어라. 예전 pull 이 남긴 `docs/misc/WF-*.json` 이 있으면 지워라(이제 만들어지지 않는다).

## SSOT 규약 (재정의)
- **본문·관계 = 로컬 CODE.json 권위**(생성·편집의 정본). 단 대시보드에서 편집했다면 `/plm-hub:pull`로 회수해 정합 유지.
- **Status = PLM 권위** → `pull`로만 로컬 반영(로컬에서 임의 전이 금지).
- 표준: 로컬 편집 → plm-sync(자동 push) / 대시보드 편집 → `/plm-hub:pull`(수동 회수).
- **양쪽을 동시에 편집하지 마라.** pull 은 로컬을 이기고(무조건 재작성), plm-sync 는 PLM 을 이긴다(즉시 upsert) — 둘 다 상대를 확인하지 않으므로 나중에 실행된 쪽이 앞선 편집을 지운다. 대시보드에서 만졌다면 로컬을 건드리기 **전에** pull 하라.
