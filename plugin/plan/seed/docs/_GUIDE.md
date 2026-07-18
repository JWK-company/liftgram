<!-- 이 프로젝트의 PLM 거버넌스 연동 규칙 (설치 시드). `_` 접두 → PLM 동기 제외(로컬 전용 지침). -->
# PLM 연동 규칙 — 문서·코드는 이렇게 PLM과 이어진다

> 이 파일은 **AI·기여자가 반드시 따라야 하는 연동 규칙**이다. PLM(거버넌스 백엔드)에 무엇이 어떻게
> 흘러가는지 정의한다. 워크플로우 전체 가이드는 plugin 명령(`/plan:*`, `/plm-hub:*`)·`INSTALL.md` 참조.

## 핵심 모델 (한 줄 요약)

- **문서 = PLM 아티팩트 그 자체 (ADR-019 동형 JSON)** → `CODE.json`만 저장하면 **자동 동기**. (별도 주석·명령 불필요)
- **코드 = PLM 아티팩트가 아님**(다른 git repo) → 소스에 **`@plm` 주석**을 달아야 PLM과 이어진다.

이 둘의 차이가 "왜 코드만 주석이 필요한가"의 답이다: 문서는 *어디에 있나*가 곧 아티팩트라 자동이고,
코드는 PLM 밖(git)에 있어 `@plm`이라는 다리가 필요하다.

> **markdown(.md) 아티팩트 생성 금지 (ADR-019).** 웹 에디터·파일·DB·PLM이 **같은 JSON**을 공유한다(변환기 없음 = 동형).
> 포맷·노드 어휘 = `plugin/plan/templates/_ARTIFACT-JSON-FORMAT.md`.

---

## 1. 문서 연동 — 자동·네이티브 (주석 0)

**`CODE.json`(ProseMirror doc + 래퍼)가 곧 PLM 아티팩트다.** JSON 한 파일 = PLM 아티팩트 하나(1:1).

```json
{
  "schemaVersion": 1,
  "id": "SRS-001",                       // PLM artifact id (= 파일명)
  "type": "SRS",                          // URS/UCS/SRS/SAD/ADR/Roadmap/Code/BS/PRD/MR/CA
  "title": "…",
  "status": "Draft",                      // Status는 PLM 권위 — 로컬에서 임의 전이 금지(대시보드에서)
  "relations": { "derives_from": ["URS-001"] },  // owner(작성) 방향만. 역방향은 PLM이 역산
  "doc": { "type": "doc", "content": [ … ] }      // 본문 = ProseMirror JSON (= PLM body)
}
```

규칙:
- **저장 = 자동 동기**: `CODE.json`을 Edit/Write하면 `plm-sync` hook이 래퍼(메타)+`doc`(본문)+`relations`(owner관계)를 PLM에 즉시 upsert.
- **경로·파일명 = 결정적 링크**: `docs/{type→dir}/{code}.json` (URS/UCS/SRS=`requirements`, SAD=`design`, ADR=`decisions`, Roadmap=`roadmap`, PRD=`product`). 규약이 곧 아티팩트↔파일 매핑.
- **`relations`엔 owner 방향만**: `derives_from`(SRS→URS)·`refs`(SAD→SRS)·`informs`(ADR→…) 등 *작성 방향*만. 역방향(피참조)은 적지 않는다(매트릭스 역산). URS는 outgoing 관계 없음(피참조 루트). 예외: **`relates_to`**(`PRD|URS|SRS|SAD → BS|Business` — 구 MR/CA는 Business로 병합)는 비-owner 소프트관계(비추적·게이트/매트릭스 제외)로, /plan:business 디스커버리 근거(BS·MR·CA)를 참조할 때만 기재. **`targets`**(`BS → BS·MR·CA 제외 전 타입`)는 BS(feedback)가 겨냥하는 대상 지정 — 역시 비추적(그래프 표시·적용 대상, P0-3). BS는 다수 발급(`BS-001`… 채번)·`kind`("idea"|"feedback") 명시. **`generated_from`**(`Business|PRD→BS`·`Roadmap→PRD`)은 생성 계보 — /business·/plan이 자동 기재(비추적·계보 레인).
- **SSOT 분담**: 본문(`doc`)·관계(`relations`) = **로컬 `CODE.json`**, Status·게이트·추적 = **PLM**. 대시보드 편집분은 `/plm-hub:pull`로 회수.
- **본문 조회 주의**(빈 문서 오판 금지): PLM은 본문을 `body`(레거시 평문)와 `doc`(ProseMirror·canonical) 두 곳에 둔다. **BS·웹에디터 문서는 본문이 `doc`에만 있어 `body`가 빔.** `artifact_get`은 body가 비면 doc 텍스트를 자동으로 채워주지만, 그래도 비어 보이면 **"빈 문서"로 단정 말고** `doc_get(project, code)`로 실제 본문을 확인하라.
- **동기 제외**: `_`로 시작하는 파일·`research/`·래퍼 `"sync": false`는 PLM에 본문 반출 안 함. (**`product/`의 PRD·BS·MR·CA는 미추적 싱글턴이나 대시보드 표시 위해 동기.**)

→ 발급은 `/plan:business`(디스커버리·BS·MR·CA) `/plan:requirement` `/plan:design` `/plan:decision` `/plan:plan`. 일괄 동기 `/plm-hub:sync`, 점검 `/plan:trace`.

## 2. 코드 연동 — `@plm` 주석 + codescan (이것만 주석 필요)

코드는 `.ouroboros/docs/`의 `CODE.json`이 아니라 **별도 git repo의 소스**다. PLM이 "이 코드가 어느 요구를
구현하나"를 알도록 **구현 심볼 바로 위에** 역링크 주석을 단다(여러 개 가능):

```rust
// @plm SRS-001  운동 기록 추가
pub fn add_workout(...) { ... }
```

- `/plm-hub:codescan` 이 `@plm`을 스캔 → **Code 아티팩트**(`loc: src/app.rs:42`, build_state=as_built) + **realizes**(Code→SRS/SAD) 생성 → 대상 SRS/SAD의 `CODE.json`에 `code_refs` 역기재.
- 결과: SRS-001 → realizes → Code → `loc` → **실제 코드 라인까지** 추적(요구↔코드 양방향 딥링크).
- 죽은/벤더/구버전 코드는 **`.plmignore`**(gitignore식)로 스캔 제외 — `@plm` 잔여 재생성 차단.
- 변경 파일 1건은 PostToolUse hook `plm-codesync`가 자동 동기. 전체 스캔+GC(리네임/삭제→Replaced)는 `/plm-hub:codescan`.

## 3. 전체 그림 — PLM 프로젝트 + git 연동

```
PLM 프로젝트 (/plm-hub:link <project> 로 바인딩)
├─ 문서  = .ouroboros/docs/*.json   → plm-sync hook 자동 upsert (네이티브, 주석 0)
└─ 코드  = 별도 git repo
     ├─ 소스 // @plm SRS-NNN  → /plm-hub:codescan → Code 아티팩트 + realizes + code_refs
     └─ GitHub webhook(main merge) → 리뷰 자동 생성 (repo 이름 = 프로젝트 slug 규약)
```

표준 흐름: `/plan:business(선택) → /plan:plan → /plan:requirement → /plan:design → /plan:decision → /plan:trace` (문서, 자동 동기)
→ 구현 시 소스에 `@plm` → `/plm-hub:codescan` (코드 딥링크).

## 금지
- **markdown(.md) 아티팩트 생성** (ADR-019 동형 — `CODE.json`만).
- Status를 로컬 `CODE.json`에서 임의 전이(PLM 소유 — 대시보드에서).
- `relations`에 역방향(피참조) relation 기재.
- 코드 연동을 문서 아티팩트로 흉내내기(코드는 git repo + `@plm`이 정도).
