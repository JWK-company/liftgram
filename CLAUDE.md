# 기획 워크플로우 가이드 (planning-workflow)

> 이 파일이 기획 워크플로우의 단일 권위 가이드다. 충돌 시 이 파일 우선.
> **거버넌스 백엔드 = PLM-Hub**(`plm-hub` 플러그인 · 라이브 `plm.shoi.ch` · 대시보드 `plm-dash.shoi.ch`). 데이터 구조·동기화 권위는 이 §6.

---

## 1. 핵심 원칙

1. **불확실하면 질문** — 의도/범위가 애매하면 묻는다. 추측 금지.
2. **작업 범위 준수** — `.ouroboros/context/current.md`의 작업 범위 내 문서만 수정.
3. **실시간 동기화** — 작업 완료 즉시 current.md 갱신. 로컬이 본문·관계의 SSOT.
4. **기획 전용** — 이 워크플로우는 요구·설계·의사결정·로드맵 **기획 산출물**만 다룬다. 코드 구현·테스트는 범위 밖.

---

## 2. 산출물 사전 (기획 + 추적성)

| 코드 | 이름 | 생성 스킬 | 게이트 | 추적 |
|------|------|-----------|--------|------|
| URS | User Requirements (이해관계자 니즈) | /requirement | G1 | ✓ |
| UCS | Use Cases (시나리오) | /requirement | G1 | ✓ |
| SRS | Software Requirements (기능·성능) | /requirement | G1 | ✓ |
| SAD | Architecture Doc (상위 설계) | /design | G2 | ✓ |
| ADR | Architecture Decision Record | /decision | G2 | ✓ |
| Roadmap | 로드맵(RM) | /plan | — | ✓ |
| Code | 코드 단위(실구현) | (소스 `@plm` 주석 → /plm-hub:codescan) | G3 | ✓ |
| PRD | 제품 기획서 | /plan | — | ✗ 비추적 |
| Research | 리서치 노트 | (자유) | — | ✗ 비추적 |

### 추적 백본 (owner = 로컬 작성 측, 화살표 = 작성 방향)
```
UCS ─elaborates→ URS        SRS ─derives_from→ URS
SAD ─refs→ SRS              ADR ─informs→ SRS,SAD     ADR ─supersedes→ ADR
Roadmap ─covers→ URS,SRS    Code ─realizes→ SRS,SAD   (역: SRS/SAD ─implemented_by→ Code)
```
- frontmatter에는 **owner(작성) 관계만** 적는다. 역방향(피참조)은 매트릭스 역산.
- URS는 outgoing 관계가 없다(피참조 루트).

### 딥링크 추적 (아티팩트 ↔ 실제 문서/코드 위치 — 끝까지 연결)
- **아티팩트 → 문서 위치(결정적)**: `docs/{type→dir}/{code}.md`. URS/UCS/SRS=`requirements`, SAD=`design`, ADR=`decisions`, Roadmap=`roadmap`. 규약이 곧 링크.
- **코드 → 요구 역링크(소스 주석)**: 구현 코드 위에 **`@plm <CODE>`** 주석을 단다(여러 개 가능). 예: `// @plm SRS-002  피드 생성`. 언어별 주석문법 자유.
- **요구 → 코드(딥링크)**: `/plm-hub:codescan`이 `@plm` 주석을 스캔 → **Code 아티팩트**(body 첫 줄 `` loc: `path:line` ``, build_state=as_built) + **realizes**(Code→SRS/SAD) 생성. → SRS에서 역추적 시 Code→`loc`로 **실제 코드 위치까지** 도달.
- **문서에도 명시(역기재)**: codescan이 참조된 SRS/SAD의 `.md` frontmatter에 `code_refs: [path:line, ...]`를 자동 기재 → 문서에서도 구현 위치 확인.
- **양방향 동기**: 로컬→PLM=plm-sync(자동)·코드→PLM=/plm-hub:codescan·PLM→로컬=/plm-hub:pull.

---

## 3. 스킬

| 스킬 | 용도 | 산출 |
|------|------|------|
| `/plan` | 기획 의도 → PRD(비추적) + Roadmap(추적 RM) + 작업범위 | docs/product, docs/roadmap |
| `/requirement` | URS·UCS·SRS 발급(ID·frontmatter·relation) | docs/requirements |
| `/design` | SAD 발급 | docs/design |
| `/decision` | ADR 발급 | docs/decisions |
| `/trace` | 요구→설계 추적·orphan·G1/G2·매트릭스 | docs/traceability/matrix.md |
| `/reflect` | 기획 회고·ADR 후보·로드맵 갱신 제안 | — |
| **`/plm-hub:link`** | 워크플로우 ↔ PLM 프로젝트 바인딩(config/plm.json) | PLM |
| **`/plm-hub:sync`** | 로컬 `.md` ↔ PLM 일괄 동기(export/import) | PLM |
| **`/plm-hub:gates`** | PLM 게이트(G1~G3)·재검토 큐 조회 | PLM |
| **`/plm-hub:verify`** | 로컬↔PLM 동기 무결성 전수 재검증(드리프트 감사·정합) | PLM |
| **`/plm-hub:agent`** | 빈약 본문 아티팩트 자동 보정(work agent) | PLM |

표준 흐름: `/plan → /requirement → /design → /decision → /trace`. **동기화는 PLM**(plm-hub의 Edit hook `plm-sync`가 `.md` 저장 시 자동 upsert, Stop hook `plm-gate`가 게이트·빈약본문 표면화).

---

## 4. 품질 게이트 (소프트 — 차단 아님)

| 게이트 | 기계 조건 | 사람 판단(/trace) |
|--------|-----------|-------------------|
| G1 요구 | 모든 SRS가 `derives_from`(→URS) 보유 | 요구 완전성 |
| G2 설계 | 모든 SAD가 `refs`(→SRS) 보유 | 설계 타당성 |

gate-check hook(Stop)이 매 작업 자동 평가하여 state.json·경고로 표면화. exit 0(차단 안 함).

---

## 5. status 수명주기 / 소유권

- **본문·관계 = 로컬 권위**, **Status = PLM 권위**.
- **생성**: 스킬이 `status: Draft` 기입 → plm-sync hook이 PLM에 자동 upsert.
- **전이**(Draft→In Review→Approved→Superseded): **PLM 대시보드(`plm-dash.shoi.ch`)에서 사람이 수행**(역할: editor 발급/수정 · approver/admin 승인 전이) → 로컬은 `/plm-hub:pull`로 Status 반영.
- **Approved**: G1·G2 pass는 전제·대시보드 표시(자동), 실제 Approved 전이는 사람이 대시보드에서 수동.

---

## 6. 동기화 규약 (PLM)

- **권위 분담**: 본문·관계 = 로컬 `.md`(SSOT), Status·게이트·추적 = PLM.
- **인증 분담**: **hook(셸) = token_hash 토큰**(`.ouroboros/env/.env`의 `PLM_API_TOKEN`), **Claude MCP = OAuth**(Keycloak, 사용자 승인).
- **바인딩**: `/plm-hub:link <project>` → `.ouroboros/config/plm.json`(`project`, `api_url`).
- **local→PLM(자동)**: PostToolUse(Edit|Write) hook `plm-sync`가 변경된 기획 `.md` 1건을 `POST /import`로 즉시 upsert(frontmatter+본문+owner 관계). 일괄은 `/plm-hub:sync`.
- **code→PLM(딥링크·자동)**: 소스 `@plm <CODE>` 주석 → **PostToolUse hook `plm-codesync`** 가 변경 파일 1건을 자동 동기(Code 아티팩트+realizes+`loc`·`code_refs` 경로-스코프 merge). 전체 스캔+GC(리네임/삭제 Code → Superseded)는 `/plm-hub:codescan`(수동). 스캔 루트=`PLM_CODE_ROOT`(env/config `code_root`, 기본 프로젝트 루트). 죽은/벤더/구이터레이션 코드는 `.plmignore`(또는 `PLM_CODE_IGNORE`)로 제외 — @plm 잔여 재생성 차단.
- **PLM→local(역반영)**: `/plm-hub:pull`이 `/export`로 대시보드 편집분(Status·관계·본문)을 로컬 `.md`에 회수. (plm-sync는 단방향이므로 대시보드 편집은 pull로 정합.)
- **게이트(자동)**: Stop hook `plm-gate`가 `/gates`·`/review-queue`를 읽어 G1~G3 orphan·재검토를 경고(비차단).
- **동기 드리프트(자동·안전망)**: 같은 Stop hook이 매 세션 **로컬 문서↔PLM active 집합을 대조** — `미동기`(로컬→PLM 누락)·`드리프트`(PLM엔 있으나 로컬 파일 없음)를 표면화. per-edit 동기가 조용히 실패해도 누적 desync를 차단. 전수 재검증·정합은 `/plm-hub:verify`.
- **본문 품질(자동)**: 작성 시 `body-lint` hook이 빈약 본문 경고(예방), Stop hook `plm-gate`가 `G_body`(제목수준 본문) 상시 감지, `/plm-hub:agent`가 자동 보정(claude로 본문 생성→upsert). Code 본문은 codescan이 `loc+symbol+스니펫`으로 자동 강화.
- **민감 기획**: frontmatter `sync: false`로 본문 반출 제외. 모든 hook은 exit 0 graceful. Cloudflare가 python-urllib 기본 UA를 차단(403)하므로 스크립트는 `user-agent` 헤더 명시.
- 설계 상세: `plugin/plm-hub/HOOKS.md`.

---

## 7. 문서 저장 규칙

`.ouroboros/docs/{requirements,design,decisions,roadmap,product,research,traceability}/`. 파일명 = 아티팩트 ID(`URS-001.md` 등). `_`로 시작하는 파일·`research/`·`product/`·`sync:false`는 동기화 제외.

---

## 8. 금지

- 코드 구현·테스트·실행(이 워크플로우 범위 밖).
- 로컬에서 Status를 임의 전이(PLM 소유 — PLM 대시보드에서).
- 본문 동기화 없이 다음 작업 진행.
