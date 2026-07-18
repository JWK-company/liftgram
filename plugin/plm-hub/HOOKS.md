# PLM ↔ plan/code 통합 hook 설계

PLM(원격 MCP/REST 거버넌스 백엔드)을 plan·code 워크플로우와 **유기적으로** 묶는 hook 체계.
원칙: **로컬 `.ouroboros/docs/*.json`(ADR-019 CODE.json 동형) = SSOT(본문·관계)**, **PLM = 동기 대상 + 게이트/추적/영향전파 권위**(Notion 대체). markdown 아티팩트 금지.

## 데이터 흐름
```
 plan/code 스킬 ── 발급/편집 ──▶ .ouroboros/docs/{requirements,design,decisions,roadmap,product}/*.json   (SSOT)
                                          │  (PostToolUse Edit|Write)
                                          ▼  plm-sync.sh → POST /import(메타·관계) + PUT /doc(본문·3회 재시도)
                                      PLM DB ── 게이트 G1~G3 · 영향전파 needs_review · 추적
                                          │  (Stop)
                                          ▼  plm-gate.sh → GET /gates,/review-queue → 소프트 경고
 소스코드 // @plm SRS-NNN ── /plm-hub:codescan ──▶ Code 아티팩트(loc:path:line)+realizes→SRS/SAD
                                          └─▶ 대상 CODE.json 래퍼에 code_refs 역기재
 PLM/대시보드 편집 ── /plm-hub:pull ──▶ 로컬 CODE.json 역반영(Status·관계·본문)
 Claude ◀── plm MCP 14도구(search·gates·artifact_*·relation_*·export/import…) ── 직접 조회/변경
```

## 딥링크 추적 (아티팩트 ↔ 실제 문서/코드)
- **문서 위치(결정적)**: 아티팩트 `<CODE>` → `.ouroboros/docs/{type→dir}/{CODE}.json`.
- **코드 역링크(소스 주석)**: 구현부에 `// @plm SRS-002` → `/plm-hub:codescan`이 Code 아티팩트(body `loc: \`path:line\``)+`realizes` 생성.
- **문서 역기재**: codescan이 대상 SRS/SAD `CODE.json`에 `code_refs: [path:line]` 자동 기입.
- **역추적**: SRS-002 → (implemented_by/realizes 역) → Code → `loc` → 실제 코드. 스크립트 `scripts/plm_codescan.py`.

## hook 매트릭스
| 이벤트 | hook | 동작 | 차단 |
|--------|------|------|------|
| UserPromptSubmit | `context-reminder.sh` | 거버넌스=PLM·프로젝트 바인딩·MCP 도구 환기 | 비차단 |
| PostToolUse(Edit\|Write) | `plm-sync.sh` | 변경된 기획 `CODE.json` 1건 즉시 PLM upsert(관계 포함) | 비차단·graceful |
| PostToolUse(Edit\|Write) | `plm-codesync.sh` | 변경된 **소스코드** 1건의 `@plm` → Code 아티팩트 단일 동기(`--file`, GC 없음). doc↔PLM 과 일관되게 code↔PLM 자동 유지 | 비차단·graceful |
| Stop | `plm-gate.sh` | PLM 게이트(G1~G3 orphan)+재검토 큐+G_body+**동기 드리프트(local↔PLM)** 경고(디바운스 45s) | 소프트·비차단 |

- 모든 hook은 **항상 exit 0**(graceful degradation). PLM 미도달/미바인딩이면 조용히 스킵.
- **doc 저장 불변식**("json 최신인데 대시보드 미갱신" 재발 방지): doc(본문)은 **`PUT …/doc` 단일 경로**로만 쓴다(`/import`는 doc 미수용 — 메타·관계만). doc PUT은 **3회 backoff 재시도**(타임아웃 15s)하고, 최종 실패 시 `.ouroboros/context/sync-drift.json`에 마커를 남겨 다음 Stop의 `plm-gate`가 표면화한다. `plm-gate`는 존재 비교(local↔PLM 코드집합)뿐 아니라 **로컬 `.json` doc ↔ PLM doc 해시**를 대조해 '메타 최신·본문 옛버전' 침묵 드리프트도 잡는다.
- 비밀(쓰기 토큰)은 `.ouroboros/env/.env`의 `PLM_API_TOKEN`(gitignore). 프로젝트 바인딩은 `.ouroboros/config/plm.json`(비밀 아님).
- 인증: hook은 셸이라 OAuth 불가 → REST에 **token_hash 토큰** 사용. Claude의 MCP 도구는 OAuth(Keycloak).
- **토큰 셀프 발급**: `plm-hub:link`가 사용자의 plm MCP OAuth(SSO JWT)를 재사용해 `POST /tokens`(OIDC 전용)로 본인 realm 역할 토큰을 자동 발급·`.env` 기입(`scripts/plm_token_issue.py`). 역할 없으면 editor 기본. 재발급=교체(기존 무효). 토큰 미설정 상태는 plm-gate가 매 세션 경고.

## 설정
```jsonc
// .ouroboros/config/plm.json
{ "project": "<plm-project-id>", "api_url": "https://jwk-plm.shoi.ch" }
// .ouroboros/env/.env
PLM_API_TOKEN=                   // 쓰기 토큰 — plm-hub:link가 자동 발급(셀프, OIDC). 자가호스팅(OIDC off)은 plmhub-dev-token
// (선택) PLM_ENABLED=0 으로 통합 일시 비활성
```
바인딩: `/plm-hub:link <project>` (없으면 MCP `project_create`로 생성).

## 커맨드 (plm-hub:)
| 커맨드 | 용도 |
|--------|------|
| `plm-hub:link <project>` | 로컬 워크플로우 ↔ PLM 프로젝트 바인딩 |
| `plm-hub:sync` | 로컬 `CODE.json` 전체를 PLM과 일괄 동기(import 중심) |
| `plm-hub:pull` | **PLM/대시보드 → 로컬 `CODE.json` 역반영**(Status·관계·본문 회수) |
| `plm-hub:codescan` | **소스 `@plm` 주석 → Code 딥링크 동기**(Code 아티팩트·realizes·loc + 문서 code_refs 역기재) |
| `plm-hub:gates` | PLM 게이트(G1~G3)+재검토 큐 조회·해소 제안 |
| `plm-hub:artifact-issue/get` · `relation-link` | 개별 발급·조회·관계(또는 MCP 도구 직접) |

## plan/code 와의 관계
- **plan**: Notion hook(`notion-detect`) 제거 — PLM이 대체. 로컬 `gate-check`(로컬 아티팩트 즉시검증)는 오프라인 보조로 유지, `plm-gate`(DB 권위)가 주.
- **code**: 코드 단위는 `Code` 아티팩트(granularity·build_state)로 PLM 등록 → 구현 갭(to_be)·추적이 거버넌스에 편입. code 플러그인의 메모리/이벤트 hook과 독립 공존.
- 두 플러그인은 `.ouroboros/` 컨텍스트를 공유하고, PLM은 그 위의 거버넌스 백엔드.
