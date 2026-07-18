# 워크플로우 마스터 가이드 (기획 · 개발 · 메모리 · 거버넌스 총괄)

> 이 파일이 이 프로젝트의 **단일 권위 가이드**다. 다른 문서와 충돌 시 이 파일 우선.
> 이 템플릿은 **기획(`plan`) · 개발(`code`) · 메모리(`ouroboros`) · 거버넌스(`plm-hub`) · 채널(`plm-channel`)** 을 하나로 묶은 통합 워크플로우다. **이 프로젝트로 기획과 개발을 모두 수행**하며, 산출물은 **PLM**으로 거버닝되고 **Ouroboros**로 기억된다.
> **거버넌스 백엔드 = PLM-Hub**(`plm-hub` 플러그인 · 라이브 `jwk-plm.shoi.ch` · 대시보드 `jwk-plm-dash.shoi.ch` · MCP `jwk-plm.shoi.ch/mcp`). 데이터 구조·동기화 권위는 §5. (jwk-* = k0s 격리 생태계. `plm.shoi.ch` 등 비-jwk는 별개 docker 배포.)

---

## 0. 전체 구조 (4-파트 총괄)

이 워크플로우는 하나의 프로젝트 안에서 **기획 → 개발**을 잇고, 그 전 과정을 **메모리(학습)** 와 **거버넌스(추적·검증)** 가 떠받친다.

| 파트 | 플러그인 / 백엔드 | 하는 일 | 산출·저장 |
|------|------------------|---------|-----------|
| **A. 기획** | `plan` | 요구·설계·의사결정·로드맵을 발급(코드는 안 짬) | `.ouroboros/docs/*.json` (CODE.json) |
| **B. 개발** | `code` | 스펙→구현→리뷰→디버깅으로 **실제 코드**를 작성·테스트 | 소스 코드 + `@plm` 주석 |
| **C. 메모리** | `ouroboros` MCP | 결정·함정·패턴·선호를 시맨틱 메모리·지식그래프·이벤트로 축적 | Neo4j + ClickHouse |
| **D. 거버넌스** | `plm-hub` + PLM 백엔드 | Status·품질게이트·추적성·양방향 동기 | PLM(대시보드) |
| **E. 채널** | `plm-channel` | 대시보드 메신저 ↔ Claude 세션 원격 연동 | (릴레이·훅) |

**연결 고리(끝까지):** 기획이 URS/SRS/SAD를 발급 → 개발이 코드를 작성하고 `@plm <CODE>` 주석을 단다 → `codescan`이 **요구↔코드 딥링크**(Code 아티팩트·`realizes`·`loc`)를 생성 → PLM이 추적 매트릭스·게이트로 검증 → 그 과정의 결정/함정/패턴은 Ouroboros가 기억해 다음 작업에 재활용.

---

## 1. 핵심 원칙

1. **불확실하면 질문** — 의도/범위가 애매하면 묻는다. 추측 금지. (원격 세션은 터미널 질문 대신 §6 규칙.)
2. **작업 범위 준수** — `.ouroboros/context/current.md`의 "작업 범위" 내 파일만 수정.
3. **실시간 동기화** — 작업 완료 즉시 `current.md`(+`state.json`) 갱신. **로컬이 본문·관계의 SSOT.**
4. **기획·개발 통합** — 이 프로젝트로 **기획과 개발을 모두** 한다. 단 **기획 스킬**(/plan·/requirement·/design·/decision·/trace)은 요구·설계·의사결정·로드맵 산출물을 만들고 **코드를 직접 짜지 않으며**, **코드 구현·테스트는 `code` 플러그인**(/spec·/execute·/qa·/fix)이 담당한다. 두 파트는 `@plm` 딥링크로 연결된다(§2·§5). **코드 개발 자체는 금지가 아니다.**
5. **JSON 동형(ADR-019)** — 모든 추적 아티팩트는 **`CODE.json`**(ProseMirror doc + 래퍼)로 생성한다. **markdown(.md) 아티팩트 생성 금지.** 포맷·노드 어휘 = `plugin/plan/templates/_ARTIFACT-JSON-FORMAT.md`. 웹 에디터·파일·DB·PLM이 같은 JSON 공유(변환기 없음 = 동형).
6. **5분 규칙** — 5분 이상 결과물 없는 자율 탐색 금지. 차단 시 즉시 보고.
7. **메모리 자동 축적** — 작업 중 결정·함정·패턴·선호를 감지하면 Ouroboros에 자동 저장(§4).

---

## 2. 파트 A — 기획 (Planning)

### 2.1 산출물 사전 (기획 + 추적성)

| 코드 | 이름 | 생성 스킬 | 게이트 | 추적 |
|------|------|-----------|--------|------|
| URS | User Requirements (이해관계자 니즈) | /requirement | G1 | ✓ |
| UCS | Use Cases (시나리오) | /requirement | G1 | ✓ |
| SRS | Software Requirements (기능·성능) | /requirement | G1 | ✓ |
| SAD | Architecture Doc (상위 설계) | /design | G2 | ✓ |
| ADR | Architecture Decision Record | /decision | G2 | ✓ |
| Roadmap | 로드맵(RM) | /plan | — | ✓ |
| Code | 코드 단위(실구현) | (소스 `@plm` 주석 → /plm-hub:codescan) | G3 | ✓ |
| BS | Brainstorming (아이디어 발산·피드백 기원 · **다수 발급**(BS-00N) · kind=idea\|feedback · 대시보드 표시) | /business, (feedback은 자유 발급) | — | ✗ 미추적(relates_to dst + **targets 발신**) |
| Business | 통합 조사 보고서 (구 MR+CA 병합 — 파트A 시장·파트B 경쟁 · **다수 발급**(BIZ-00N) · 완성 보고서 파일 첨부가 본체 · 대시보드 표시) | /business | — | ✗ 미추적(relates_to dst + generated_from→BS) |
| PRD | 제품 기획서 (프로젝트당 1개 · 대시보드 표시) | /plan | — | ✗ 미추적(관계·게이트 없음) |
| Research | 리서치 노트 | (자유) | — | ✗ 비추적 |

#### 추적 백본 (owner = 로컬 작성 측, 화살표 = 작성 방향)
```
UCS ─elaborates→ URS        SRS ─derives_from→ URS
SAD ─refs→ SRS              ADR ─informs→ SRS,SAD     ADR ─supersedes→ ADR
Roadmap ─covers→ URS,SRS    Code ─realizes→ SRS,SAD   (역: SRS/SAD ─implemented_by→ Code)
```
- CODE.json 래퍼의 `relations`에는 **owner(작성) 관계만** 적는다. 역방향(피참조)은 매트릭스 역산.
- URS는 outgoing 관계가 없다(피참조 루트).

#### 비추적 관계 (추적 백본 **밖** — 게이트·매트릭스 무관)
```
PRD|URS|SRS|SAD ─relates_to→ BS|Business   (관련·디스커버리 근거 참조 · 비추적 소프트관계 — 구 MR/CA는 Business로 이행됨)
BS ─targets→ (BS·Business 제외 전 타입)      (BS 피드백 겨냥 · 비추적 · 그래프 표시 — P0-3, 적용/스냅샷은 P1)
Business|PRD ─generated_from→ BS · Roadmap ─generated_from→ PRD   (생성 계보 · 비추적 · 그래프 계보 레인 — P1-2)
```
- **relates_to**: /business가 발급한 디스커버리 근거(BS·Business)를 이후 아티팩트(PRD·URS·SRS·SAD)가 근거로 참조하는 소프트 "관련" 링크. **비추적** — G1/G2 게이트·추적 매트릭스에 미포함(rel名 필터로 자동제외). Business는 항상 dst(피참조)이며 generated_from(→BS)만 발신.
- **targets**(P0-3): BS(kind=feedback)가 피드백을 겨냥하는 대상 아티팩트 지정. BS의 유일한 발신 관계(추적 백본 밖 — 게이트·매트릭스 제외, 그래프 표시). BS는 다수 발급(BS-00N)·kind 명시(idea|feedback, 미지정=idea).

#### 딥링크 추적 (아티팩트 ↔ 실제 문서/코드 위치 — 끝까지 연결)
- **아티팩트 → 문서 위치(결정적)**: `docs/{type→dir}/{code}.json`(CODE.json 동형 — markdown 아님). URS/UCS/SRS=`requirements`, SAD=`design`, ADR=`decisions`, Roadmap=`roadmap`. 규약이 곧 링크.
- **코드 → 요구 역링크(소스 주석)**: 구현 코드 위에 **`@plm <CODE>`** 주석을 단다(여러 개 가능). 예: `// @plm SRS-002  피드 생성`. 언어별 주석문법 자유.
- **요구 → 코드(딥링크)**: `/plm-hub:codescan`이 `@plm` 주석을 스캔 → **Code 아티팩트**(body 첫 줄 `` loc: `path:line` ``, build_state=as_built) + **realizes**(Code→SRS/SAD) 생성. → SRS에서 역추적 시 Code→`loc`로 **실제 코드 위치까지** 도달.
- **문서에도 명시(역기재)**: codescan이 참조된 SRS/SAD의 **CODE.json 래퍼**에 `code_refs: [path:line, ...]`를 자동 기재 → 문서에서도 구현 위치 확인.
- **양방향 동기**: 로컬→PLM=plm-sync(자동)·코드→PLM=/plm-hub:codescan·PLM→로컬=/plm-hub:pull.

### 2.2 기획 스킬 (`plan` 플러그인)

| 스킬 | 용도 | 산출 |
|------|------|------|
| `/business` | 시장·경쟁 사전조사(디스커버리) → BS·Business(비추적) 발급·차별화/수익화/Go-No-Go 판정 (/plan 선행·선택) | docs/product |
| `/plan` | 기획 의도 → PRD(비추적) + Roadmap(추적 RM) + 작업범위 | docs/product, docs/roadmap |
| `/requirement` | URS·UCS·SRS 발급(ID·CODE.json 래퍼·relation) | docs/requirements |
| `/design` | SAD 발급 | docs/design |
| `/decision` | ADR 발급 | docs/decisions |
| `/trace` | 요구→설계 추적·orphan·G1/G2·매트릭스 | docs/traceability/matrix.md |
| `/report` | 기획 거버넌스 HTML 보고서(PLM+Ouroboros 수집·3사이클 검증) | docs/report |
| `/reflect` | 기획 회고·ADR 후보·로드맵 갱신 제안 | — |

**표준 기획 흐름:** `/business(선택) → /plan → /requirement → /design → /decision → /trace`. 동기화는 PLM(§5)이 자동 담당.

---

## 3. 파트 B — 개발 (Development)

### 3.1 개발 스킬 (`code` 플러그인)

| # | 스킬 | 분류 | 용도 |
|---|------|------|------|
| 1 | `/patch` | Core | spec 없이 단순 수정 즉시 실행 (파일 1-2개) |
| 2 | `/spec` | Core | 5-Tier 복잡도 분석 → 등급별 스펙 생성 |
| 3 | `/execute` | Core | 스펙 실행 (SV + checkpoint) |
| 4 | `/fix` | Core | 점진적 에스컬레이션 디버깅 (5회 hard limit) |
| 5 | `/qa` | Core | 전문가 패널 리뷰 (spec 또는 code) |
| 6 | `/autorun` | Core | 승인된 계획의 무인 연속 실행 |
| 7 | `/reflect` | Periodic | 회고 + 메모리 보완 |
| 8 | `/onboarding` | Periodic | 프로젝트 구조/사용자 선호 동기화 |
| 9 | `/housekeeping` | Periodic | 메모리 정리 + stale 검증 |
| 10 | `/ask` | On-demand | 전문가 팀 질문 (경량) |
| 11 | `/suggest` | On-demand | 상태 분석 + 다음 액션 추천 |
| 12 | `/guide` | On-demand | 워크플로우 가이드 |
| 13 | `/study` | On-demand | 수준별 맞춤 교육 자료 생성 |
| 14 | `/evolve` | Extended | 메모리 → 지식 그래프 일반화 |
| 15 | `/report` | On-demand | 개발 산출 보고서 |

**표준 개발 흐름:** `/spec "기능" → /qa spec(권장) → /execute → /qa code(권장) → /fix(필요 시) → /reflect`. 단순 수정(파일 1-2개)은 `/patch`로 즉시. 각 스킬 완료 시 "다음 단계"가 자동 안내. 뭘 할지 모르면 `/suggest`.

### 3.2 5-Tier 복잡도 체계

| 등급 | 기준 | 동적 전문가 |
|------|------|-----------|
| Patch | 파일 1-2, 로직 변경 없음 | 스킵 |
| Task | 파일 2-5, 단일 관심사, 로직 변경 포함 | 선택적 (1-2명) |
| Feature | 파일 5+, FE+BE, 새 API | 필수 (2-3명) |
| Project | 멀티 도메인, DB 변경 | 필수 (3-5명) |
| Epic | 멀티 프로젝트 | 필수 (3-5명) |

### 3.3 @plm 딥링크 (코드 ↔ 요구)

`code`가 작성한 구현 코드 위에 **`@plm <CODE>`** 주석을 단다 → `/plm-hub:codescan`(수동 전체) 또는 `plm-codesync` hook(자동 per-file)이 요구↔코드를 잇는다(§5). **Code 아티팩트는 "구현물"이 아니라 실제 코드를 가리키는 추적 단위**다. 스캔 루트=`PLM_CODE_ROOT`(기본 프로젝트 루트), 제외=`.plmignore`.

### 3.4 /execute 인사이트 자동 저장

/execute 중 아래 감지 시 사용자 확인 없이 즉시 Ouroboros 저장(§4):

| 이벤트 | memory_type | 예시 |
|--------|-------------|------|
| 예상과 다른 동작/함정 | gotcha | "이 API는 null을 빈 배열로 반환한다" |
| 재사용 패턴/접근법 | pattern | "에러 핸들링은 Result 타입으로 통일" |
| 비자명한 동작 원리 | insight | "미들웨어 순서 중요: auth → rate-limit → handler" |

플로우: 감지 → `memory_search`(≥0.90 중복 스킵, 0.80–0.90 유사 시 질문) → `memory_store` → 1줄 보고.

### 3.5 /fix 에스컬레이션

| 횟수 | 동작 |
|------|------|
| 1회 | 직접 수정 시도 |
| 2회 | 스택트레이스 + 관련 코드 재분석 |
| 3회 | `memory_search`로 유사 gotcha 조회 |
| 4회 | root-cause 프로토콜 적용 |
| 5회 | hard limit — 사용자에게 에스컬레이션 보고 |

### 3.6 코드 변경 보존 규칙

알고리즘 개선/교체 시 원복 가능성 보장:
- **기존 함수 본체**: 삭제하지 않고 새 함수를 별도 추가.
- **기존 호출부**: 삭제하지 않고 주석 처리하여 실행만 차단.
- **새 호출부**: 주석 처리된 기존 호출 바로 아래에 추가(대비 명확).

```
// [원본] 원복 시 아래를 주석 해제하고 새 호출을 주석 처리
// originalFunction(args);
// [개선] 새 방식
improvedFunction(args);
```
안정성 확인 후 `/reflect`에서 이전 코드 제거 여부 논의.

---

## 4. 파트 C — 메모리 (Ouroboros)

### 4.1 Ouroboros MCP (단일 진입점)

모든 메모리/KG/이벤트 작업은 Ouroboros MCP를 통해 수행.

- **메모리:** memory_store / memory_search / memory_update / memory_archive / memory_batch_store
- **지식 그래프:** knowledge_store / knowledge_query / knowledge_link / knowledge_distill
- **프로젝트:** project_sync / project_query
- **이벤트:** event_record / event_sync_conversation / event_query
- **워크플로우:** signal_record / signal_query / assess_complexity / refine_analyze

**스토리지:** Neo4j(시맨틱 메모리 + 지식 그래프) · ClickHouse(이벤트 로깅 + 시계열).

### 4.2 외부 MCP 도구 (필수 활용)

| 도구 | 용도 | 활용 시점 |
|------|------|----------|
| **serena** | 코드 구조 분석(심볼 탐색·참조 추적·심볼 수정) | 코드 읽기/수정 시 우선. **미연결 시 Read/Grep/Edit 대체.** |
| **context7** | 라이브러리/프레임워크 최신 문서 | 새 기술·API 불확실·버전 호환성 |
| **chrome-devtools** | 브라우저 제어·DOM/네트워크/콘솔·성능 | UI·e2e 검증, 프론트 디버깅 |

(setup.sh 기본 설치 = serena · context7 · chrome-devtools. Notion은 `--notion` 옵션.)

**WebSearch 필수 상황:** context7 미도달 기술 · 코드 분석만으로 못 푸는 에러 · 최신 보안/버전 변경 · 커뮤니티 사례(SO/GitHub Issues).

### 4.3 메모리 타입 · 라이프사이클

| 타입 | 수명 | 설명 |
|------|------|------|
| gotcha | 영구 | 삽질/함정/예상과 다른 동작 |
| pattern | 영구 | 재사용 가능한 코드/설계 패턴 |
| decision | 영구(버전관리) | 아키텍처/기술 결정(superseded_by로 이력) |
| insight | 영구 | 비자명한 동작 원리/맥락 |
| domain-knowledge | 영구 | 도메인 특화 지식 |
| preference | 영구 | 사용자/프로젝트 선호(KG 구조화) |

라이프사이클: `active → stale_candidate → archived`. 검색 우선순위: active+최신 → 같은 시점이면 **개인 > 프로젝트** → 충돌 시 1회 질문.

### 4.4 프로젝트/개인 분리 · 필수 파라미터 · 자동 수집

- **scope**: `project`(프로젝트 공유·아키텍처 결정·공통 패턴) / `personal`(개인 선호·작업 맥락). 검색은 양쪽 포함.
- **필수 파라미터**(memory_store/search): `.ouroboros/env/.env`에서 읽어 전달 — `user_id`=DEVELOPER_USER_ID, `project_id`=PROJECT_ID, `scope`(기본 personal).
- **자동 수집(Auto-Collection)**: 감지 → memory_search(≥0.90 스킵, 0.80–0.90 질문) → memory_store → 1줄 보고. **세션당 최대 5건**, 항상 `scope: personal`. 저장 금지: 일회성 단계·자명한 사실·Idea-Only 스니펫.

### 4.5 상수

| 상수 | 값 | 용도 |
|------|-----|------|
| DUPLICATE_SKIP | ≥ 0.90 | 자동 수집 중복 스킵 |
| DUPLICATE_ASK | 0.80–0.90 | 유사 메모리 존재 시 질문 |
| RELEVANCE_HIGH | ≥ 0.85 | spec 주의사항 필수 포함 |
| RELEVANCE_REF | 0.80–0.85 | 참고 수준 |

---

## 5. 파트 D — 거버넌스 (PLM)

### 5.1 권위 분담

- **본문·관계 = 로컬 `.json`(CODE.json, SSOT)**, **Status·게이트·추적 = PLM**.
- **인증 분담**: hook(셸) = token_hash 토큰(`.ouroboros/env/.env`의 `PLM_API_TOKEN`) · Claude MCP = OAuth(Keycloak, 사용자 승인).
- **바인딩**: `/plm-hub:link <project>` → `.ouroboros/config/plm.json`(`project`, `api_url`).

### 5.2 PLM 스킬 (`plm-hub` 플러그인)

| 스킬 | 용도 |
|------|------|
| `/plm-hub:link` | 워크플로우 ↔ PLM 프로젝트 바인딩(config/plm.json) |
| `/plm-hub:sync` | 로컬 `.json`(CODE.json) ↔ PLM 일괄 동기(export/import) |
| `/plm-hub:pull` | PLM 대시보드 편집분(Status·관계·본문) 로컬 회수 |
| `/plm-hub:codescan` | 소스 `@plm` 주석 전체 스캔 → Code 아티팩트·realizes·GC |
| `/plm-hub:gates` | PLM 게이트(G1~G3)·재검토 큐 조회 |
| `/plm-hub:verify` | 로컬↔PLM 동기 무결성 전수 재검증(드리프트 감사·정합) |
| `/plm-hub:agent` | 빈약 본문 아티팩트 자동 보정(work agent) |
| `/plm-hub:upload` | 증거·미디어를 대시보드 스토리지(MinIO)에 업로드 → 본문 임베드 |
| `/plm-hub:artifact-get`·`artifact-issue`·`relation-link` | 아티팩트 조회·발급·관계 연결 |
| `/plm-hub:channel` | 웹 [Sync] 버튼 → 이 터미널 세션 push 채널 설정 |
| `/plm-hub:update` | 4개 플러그인을 서버 배포 최신으로 일괄 갱신 |

### 5.3 품질 게이트 (소프트 — 차단 아님)

| 게이트 | 기계 조건 | 사람 판단(/trace) |
|--------|-----------|-------------------|
| G1 요구 | 모든 SRS가 `derives_from`(→URS) 보유 | 요구 완전성 |
| G2 설계 | 모든 SAD가 `refs`(→SRS) 보유 | 설계 타당성 |
| G3 구현 | 모든 Code가 `realizes`(→SRS/SAD) 보유 (orphan Code 없음) | 구현 연결 |

`gate-check`/`plm-gate` hook(Stop)이 매 작업 자동 평가하여 state.json·경고로 표면화. exit 0(차단 안 함).

### 5.4 status 수명주기 / 소유권

- **생성**: 스킬이 `status: Draft` 기입 → `plm-sync` hook이 PLM에 자동 upsert.
- **전이**(Draft→In Review→Approved→Replaced): **PLM 대시보드에서 사람이 수행**(editor 발급/수정 · approver/admin 승인) → 로컬은 `/plm-hub:pull`로 Status 반영.
- **Approved**: G1·G2 pass는 전제·대시보드 표시(자동), 실제 전이는 사람이 대시보드에서 수동.
- **로컬에서 Status 임의 전이 금지**(PLM 소유).

### 5.5 동기화 규약

- **local→PLM(자동)**: PostToolUse(Edit|Write) hook `plm-sync`가 변경된 기획 `.json`(CODE.json) 1건을 `POST /import`로 즉시 upsert(래퍼 메타+본문 doc+owner 관계). 일괄은 `/plm-hub:sync`.
- **code→PLM(딥링크·자동)**: 소스 `@plm <CODE>` 주석 → PostToolUse hook `plm-codesync`가 변경 파일 1건을 자동 동기(Code 아티팩트+realizes+`loc`·`code_refs` 경로-스코프 merge). 전체 스캔+GC(리네임/삭제 Code → Replaced)는 `/plm-hub:codescan`(수동). 스캔 루트=`PLM_CODE_ROOT`, 제외=`.plmignore`(또는 `PLM_CODE_IGNORE`).
- **PLM→local(역반영)**: `/plm-hub:pull`이 `/export`로 대시보드 편집분을 로컬 `.json`에 회수(plm-sync는 단방향).
- **게이트(자동)**: Stop hook `plm-gate`가 `/gates`·`/review-queue`를 읽어 G1~G3 orphan·재검토 경고(비차단).
- **동기 드리프트(자동·안전망)**: 같은 Stop hook이 매 세션 **로컬 문서↔PLM active 집합 대조** — `미동기`·`드리프트`를 표면화. 전수 재검증·정합은 `/plm-hub:verify`.
- **본문 품질(자동)**: 작성 시 `body-lint` hook이 빈약 본문 경고(예방), `plm-gate`가 `G_body` 상시 감지, `/plm-hub:agent`가 자동 보정. Code 본문은 codescan이 `loc+symbol+스니펫`으로 강화.
- **민감 기획**: CODE.json 래퍼의 `sync: false`로 본문 반출 제외. 모든 hook은 exit 0 graceful. Cloudflare가 python-urllib 기본 UA를 차단(403)하므로 스크립트는 `user-agent` 헤더 명시.
- 설계 상세: `plugin/plm-hub/HOOKS.md`.

### 5.6 문서 저장 규칙

`.ouroboros/docs/{requirements,design,decisions,roadmap,product,research,traceability}/`. **파일명 = 아티팩트 ID + `.json`**(`URS-001.json` — ADR-019 동형, markdown 금지). 포맷 = `plugin/plan/templates/_ARTIFACT-JSON-FORMAT.md`(스펙 문서 자체는 참고용 .md). `_`로 시작·`research/`·`sync:false`는 동기화 제외. `product/`의 PRD(싱글턴)·BS·Business(다수 발급)는 미추적이나 대시보드 표시 위해 동기(관계·게이트·매트릭스엔 미포함).

**본문 미디어 첨부**: 증거·분석 자료(스크린샷·GIF·PDF·데이터)는 `/plm-hub:upload <file>`로 스토리지(MinIO)에 올려 반환된 **image/file 노드**를 본문 `doc.content`에 임베드. **필요한 자료만.** 대시보드에선 드래그·붙여넣기·슬래시(`/이미지`·`/PDF`·`/파일`)로도 첨부.

---

## 6. 파트 E — 채널 (원격 연동)

`plm-channel`은 대시보드 메신저 ↔ Claude 세션을 잇는 릴레이·훅이다.

- **원격 질문 규칙(중요)**: 세션이 웹 대시보드에서 원격 구동될 때 사용자 판단이 필요하면 **터미널 대화형 질문(AskUserQuestion) 금지**(원격 사용자에게 안 보이고 세션 멈춤). 대신 `message(kind="question", work_id=…)`로 대시보드에 묻고 **즉시 턴 종료(대기)** → 답이 `[PLM 사용자 메시지]`로 도착하면 이어간다. (`no-ask` hook이 이를 강제.)
- **작업 회신**: 진행상황=`message(kind="progress")`, 결과=`kind="result"`, 완료 종결=`report(work_id, ok=true, result=…)`.
- **작업 상태/멈춤 감지**: `plm-activity` hook(PreToolUse)이 도구 실행마다 활동 heartbeat, `plm-idle` hook(Stop)이 턴 종료 시 idle 신호 → 대시보드가 "처리 중/멈춤/종료" 정확 표시.

---

## 7. 동적 전문가

복잡한 작업 시 Claude가 작업 성격을 분석해 적합한 전문가를 동적 구성:
- /qa·/ask 실행 시 작업에 맞는 전문가 자동 정의(역할·전문분야·리뷰 관점을 직접 생성).
- 전문가 수: Task 1-2명 / Feature 2-3명 / Project+ 3-5명. 결과물에 참여 전문가 역할·전문분야 명시.
- **가짜 인명 생성 절대 금지** — 역할 자체가 이름(예: "Docker 아키텍트", "보안 감사관").
- 호출 조건: Feature+ 등급 기본 적용. Patch/Task는 선택적.

---

## 8. current.md / state.json 관리

### current.md (`.ouroboros/context/current.md`)
- **100줄 이내** 유지. 매 작업 완료 즉시 갱신. state.json과 동기(state.json=Primary, current.md=View).
- 필수 섹션: ① 세션 상태 ② 활성 작업(이름·등급·phase·spec 경로) ③ 작업 범위(수정 대상 파일) ④ 현재 위치(마지막 완료·다음 작업) ⑤ 차단 요소(있을 때만).

### state.json (`.ouroboros/context/state.json`)
Hook이 파싱하는 기계용 상태. 스킬 시작/종료 시 갱신. 주요 필드:

| 필드 | 설명 |
|------|------|
| `active_skill` / `skill_step` | 현재 스킬 / Step 번호 |
| `grade` / `phase` | 5-Tier 등급 / 현재 Phase(Feature+) |
| `spec_path` / `active_artifact` | 활성 spec 경로 / 활성 아티팩트 |
| `active_files` / `tasks` | 수정 중 파일(FIFO) / 작업별 상태 맵 |
| `gates` / `last_gate_check` | 게이트 상태 캐시 / 마지막 게이트 평가 |
| `last_sync` / `release_tag` | 마지막 PLM 동기 / 릴리스 태그 |

---

## 9. Hook 시스템

모든 Hook은 **exit 0 보장**(graceful degradation). 실제 훅(플러그인 제공):

| 플러그인 | Hook | 이벤트 | 역할 |
|----------|------|--------|------|
| code | user-prompt-reminder | UserPromptSubmit | 가이드라인 + 미완료 경고 |
| code | knowledge-signal | PostToolUse(AskUserQuestion) | 선호 감지 유도 |
| code | event-capture | PostToolUse(Edit\|Write\|Bash)+UserPromptSubmit | 이벤트 기록(Ouroboros) |
| code | context-compact-recovery | PreCompact | CC 복구 지침 주입 |
| code | conversation-sync | UserPromptSubmit+PreCompact | 대화 동기화(ClickHouse) |
| code | git-guard | PreToolUse(Bash) | git 변경 명령 사용자 확인 |
| plan | context-reminder | UserPromptSubmit | 기획 컨텍스트·원칙 주입 |
| plan | gate-check | Stop | G1/G2 자동 평가 |
| plan | trace-validator | PostToolUse | 관계·추적 검증 |
| plm-hub | plm-sync | PostToolUse(Edit\|Write) | 로컬 `.json` → PLM upsert |
| plm-hub | plm-codesync | PostToolUse | `@plm` 코드 → PLM 딥링크 |
| plm-hub | plm-gate | Stop | 게이트·드리프트·빈약본문 표면화 |
| plm-hub | body-lint | 작성 시 | 빈약 본문 경고(예방) |
| plm-hub | context-reminder | UserPromptSubmit | PLM 연동 컨텍스트 주입 |
| plm-channel | no-ask | PreToolUse | 원격 세션 AskUserQuestion 차단 |
| plm-channel | plm-activity | PreToolUse | 작업 활동 heartbeat |
| plm-channel | plm-idle | Stop | 턴 종료 idle 신호 |

---

## 10. Context Compact 복구 프로토콜

Hook(`context-compact-recovery`)이 `state.json`의 active_skill을 읽어 스킬별 최소 읽기 세트를 안내.

| active_skill | 읽기 세트 |
|-------------|----------|
| spec/reflect/fix/기획 스킬 | current.md만 |
| execute(Step 1-3) | current.md → spec shell |
| execute(Step 4+) | current.md → spec shell → 현재 phase 문서 |
| null/missing | current.md → 등급별 전량 |

**Fallback(state.json 없음)**: ① CC summary에서 작업 파악 ② current.md 전문 ③ 활성 spec 문서 ④ 기록 지점 재개 ⑤ 불확실하면 질문(§6 규칙).
**금지**: "어디까지 했나요?" 질문 · 문서/Memory 미확인 추측 진행.

---

## 11. 행동 규칙

### 요청 유형 구분
| 요청 | 산출물 | 금지 |
|------|--------|------|
| "스펙/계획/spec" | .md 설계 문서(또는 CODE.json 아티팩트) | 코드 구현 |
| "구현/implement" | 코드 변경 | 문서만 작성 |
| 불명확 | 질문(§6) | 추측 후 진행 |

### Multi-file 변경 프로토콜
1. **Grep** — 전체 사용처 검색 → 2. **체크리스트** — 수정 대상 목록 → 3. **수정** — 파일별 하나씩 → 4. **검증** — 최종 Grep으로 누락 확인.

### Sub-Agent 출력
Task agent 결과는 **반드시 파일로 저장**. 임시 메모리에만 의존 금지.

### 워크플로우 문서 저장
회고·QA·학습 등 **워크플로우 산출 문서**(아티팩트 아님)는 `.ouroboros/docs/{qa,study,report,knowledge,todo}/`에 저장. 파일명 `YYYYMMDD_{slug}_{카테고리}`. 프로젝트 루트/임의 위치 생성 금지.

---

## 12. 절대 규칙

### 금지
1. 문서(current.md/state.json) 동기화 없이 다음 작업 진행 · 여러 작업 후 일괄 문서화.
2. CC 후 문서/Memory 미확인 추측 진행.
3. 5분 이상 결과물 없는 자율 탐색.
4. "스펙" 요청에 코드 구현으로 응답 / "구현" 요청에 문서만.
5. **기획 스킬 수행 중 코드 구현으로 드리프트**(코드 개발은 `code` 플러그인). ※ 코드 개발 자체는 금지가 아니다 — 이 템플릿으로 개발도 한다.
6. 로컬에서 Status 임의 전이(PLM 소유).
7. **markdown(.md) 추적 아티팩트 생성**(ADR-019 — CODE.json 동형. §1.5·§5.6).
8. 원격 세션에서 터미널 대화형 질문(§6).

### 필수
1. 실시간 current.md + state.json 동기화 · current.md 100줄 이내.
2. /execute 중 인사이트 자동 감지·저장(§3.4·§4).
3. Multi-file 변경 시 Grep → 체크리스트 → 수정 → 검증.
4. Sub-Agent 출력 파일 저장.
5. 아티팩트 = CODE.json, 본문·관계는 로컬 SSOT, Status는 PLM.
