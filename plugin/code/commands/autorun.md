**root(RM|PRD|BS) 또는 SRS 목록**을 받아 하위 아티팩트를 DAG로 전개·위상정렬하고, 각 SRS에 대해 code 스킬 체인(spec→qa×2→execute→qa×2→reflect)을 **순차 자동 실행**한다(SRS-031 · P1-4). 각 단계 결과를 PLM 대시보드 채팅에 남기며, CC의 선택 질의는 대시보드로 요구하고, 문제 발생 시에만 홀딩하여 사용자 지시를 기다린다. "아침에 걸고 퇴근 후 결과 확인" 무인 진행을 목표로 한다.

> **전제**: `claude --channels plugin:plm-channel@jwk-platform` 로 기동된 세션에서 실행(대시보드 왕복). 채널 미연결이면 로컬 진행 + 콘솔 보고로 폴백(대시보드 알림·질의 생략).

## 파라미터

- `$ARGUMENTS`: 대상. 형식:
  - **`RM-00N` | `PRD` | `BS-00N` (root — 권장)**: DAG 전개·위상정렬로 실행 큐 자동 산출(아래 Step 0-DAG).
  - `SRS-001 SRS-003` — 명시한 순서대로(수동 큐).
  - `--all` — PLM에서 이 프로젝트의 미구현(Code realizes 없는) SRS를 code 오름차순으로.
  - **비우면 임의 진행하지 않는다** — root를 요구한다(채널 세션이면 `message`(kind=question), 로컬이면 AskUserQuestion).
- `--from SRS-003` — 목록 중간부터 재개(이전 홀딩 지점).
- `--dry` — 실제 실행 없이 계획(대상·순서·단계)만 대시보드/콘솔에 보고.

## Step 0: 준비

1. **채널 여부 확인**: 환경에 채널 릴레이가 있으면(대시보드 왕복 가능) 채널모드, 아니면 로컬모드.
2. **대상 목록 확정**:
   - **root(RM|PRD|BS) 입력 — Step 0-DAG**: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/plm_dag.py <ROOT>` 실행 →
     ①전개(수집: 계보 역방향+covers·derives_from역·refs역·realizes역 — targets/relates_to 제외) ②실행 큐(`queue`: **SRS만**, 하위 방향 에지 위상정렬·계보 불참).
     - `cycles`가 비어있지 않으면 **실행 전 중단·보고**(순환 참여 노드 명시).
     - `queue_unrealized`(미구현 SRS)를 기본 큐로 쓴다(이미 realizes 있는 SRS는 스킵·보고).
     - **빈 큐 규칙(QA C1)**: 실행 가능 SRS가 0이면 임의 진행 금지 — root=BS(idea)면 `/code:spec bs` seed 직행을 우선 제안, 그 외에는 요구·설계 전개(`/plan`·`/requirement`)를 제안 → 사용자 확인 후 큐 삽입, 거부 시 사유 안내 후 종료.
     - `context`(URS/UCS/ADR/SAD 등)는 각 대상 실행 시 컨텍스트로 로드하되 큐에 넣지 않는다.
   - `--all`: `mcp__plm__gates`(G3 orphan=미구현 SRS) 또는 `export` 후 `realizes` 역참조 없는 SRS 수집 → code 오름차순.
   - 명시 인자: 그 순서 그대로.
   - 각 대상이 실재하는지 `mcp__plm__artifact_get` 로 확인(오타·미발급 즉시 보고).
3. **진행상태 초기화**: `.ouroboros/context/state.json` 에 `autorun: { queue: [...], idx: 0, step: null, status: "running" }` 기록. current.md "진행 중" 갱신.
4. **시작 보고**(채널모드): 대시보드 채팅에 `message` — "🚀 autorun 시작: N건 [SRS-001, SRS-003, ...] · 순서대로 spec→qa→execute→qa→reflect. 문제 시에만 홀딩·알림."

## Step 1: 큐 순차 실행

`queue` 의 각 대상 `T` 에 대해 **순서대로**(병렬 금지):

각 대상마다 아래 **5단계 체인**을 순차 수행. 각 단계 완료 즉시 대시보드 채팅에 1줄 결과를 남긴다(`message`, kind=note).

| # | 단계 | 실행 | 성공 기준 | 결과 보고 예 |
|---|------|------|-----------|--------------|
| 1 | 설계 | `/code:spec "T 구현"` | spec 문서 생성·등급 판정 | "① SRS-001 spec 생성(Task) ✓" |
| 2 | 설계리뷰 | `/code:qa spec` **×2사이클** | 2회차 종료 시 치명 결함 0 (잔존 시 **홀딩** — 사이클 무한 증가 금지) | "② qa spec c1: 채택3 → c2: 치명0 ✓" |
| 3 | 구현 | `/code:execute` | SV(build/test/lint) 통과 | "③ execute: 4파일·빌드/테스트 통과 ✓" |
| 4 | 코드리뷰 | `/code:qa code` **×2사이클** | 2회차 종료 시 치명 결함 0 (잔존 시 **홀딩**) | "④ qa code c1: 이슈2 반영 → c2: 치명0 ✓" |
| 5 | 회고 | `/code:reflect` | 인사이트 저장·다음 안내 | "⑤ reflect: gotcha1 저장 ✓" |

- **qa 2사이클(SRS-031)**: 각 qa 단계는 [리뷰→반영]을 2회 반복. 2회차 후에도 치명 결함이 남으면 자동 진행하지 않고 Step 3 홀딩(채널 질문 왕복).
- **계보 기재(SRS-031 — 개체화 결정 전 임시)**: 대상 T가 root BS에서 전개된 경우, 체인 완료 시 **BS 본문에 실행 로그 1줄 append**(`doc_get`→마지막에 paragraph 추가→`put_doc`): `[autorun] T: spec {파일} · qa c2 치명0 · execute ✓ · {날짜}` → 대시보드에서 bs→spec→qa 체인 추적. (spec·qa 산출물의 경량 아티팩트 개체화는 review 리팩토링에서 결정 — RM-013 ④)

- **단계 간 자동 진행**: 성공 기준 충족 시 다음 단계로 자동 이동(사용자 입력 대기 없음). 이것이 무인 진행의 핵심.
- **각 단계 결과**를 채널 `message`(kind=note)로 대시보드에 남긴다. 로컬모드면 콘솔 1줄.
- 대상 1건 완료 → state.json `idx++`, current.md 갱신 → 다음 대상.

## Step 2: CC 선택 질의 처리 (대시보드 왕복)

체인 중 스킬이 **AskUserQuestion 이 필요한 선택지**에 도달하면(등급 확인·브랜치 선택·spec 폐기 등):

- **채널모드**: `AskUserQuestion` 대신 **`message`(kind=question)** 로 대시보드에 질문을 보낸다(선택지 포함). 세션은 응답이 올 때까지 그 단계에서 대기하되, **다른 대상으로 넘어가지 않는다**(순서 보존). 사용자가 대시보드 채팅에서 답하면 그 선택으로 이어서 진행.
  - (plm-channel 의 `no-ask` hook 이 AskUserQuestion 을 자동 차단·이 경로로 유도하므로, 원격 세션이 터미널에서 막히지 않는다.)
- **로컬모드**: 일반 AskUserQuestion.

## Step 3: 문제 발생 → 홀딩

단계가 **성공 기준 미충족**(빌드 실패·qa 치명 결함·execute 차단·5회 fix 초과 등)이면:

1. **즉시 홀딩**: 이후 단계·다음 대상 진행을 멈춘다. state.json `autorun.status="held"`, `held_at={T, step}` 기록.
2. **알림**(채널모드): 대시보드 채팅에 `message`(kind=alert) — "⛔ HOLD: SRS-003 ③execute 빌드 실패(에러: ...). 이후 진행 보류. 지시 필요: ⓐ수정 재시도 ⓑ이 대상 스킵 ⓒ전체 중단." + `report`(work 실패 표시).
3. **대기**: 사용자 지시를 대시보드 채팅에서 기다린다. 답에 따라:
   - 수정 재시도 → `/code:fix` 후 해당 단계 재실행.
   - 스킵 → 이 대상 중단, 다음 대상으로(`idx++`).
   - 전체 중단 → Step 4.
- **문제 없으면 알림·홀딩 없음** — 조용히 다음 단계로. (알림 최소화: 성공은 note, 문제만 alert.)

## Step 4: 종료 보고

큐 소진 또는 전체 중단 시:

1. **요약 보고**(채널모드): 대시보드 채팅에 `message` — "✅ autorun 완료: 성공 N건 · 홀딩/스킵 M건 · 각 대상 결과 링크. 소요 ...". 각 대상의 5단계 결과 요약 테이블.
2. state.json `autorun.status="done"`, current.md 정리.
3. 홀딩으로 남은 대상이 있으면 재개 방법 안내: `/code:autorun --from <SRS>`.

## 안전·규칙

- **순서 보존**: 반드시 큐 순서대로 1건씩. 앞 대상이 홀딩이면 뒤 대상으로 넘어가지 않는다(의존성·리뷰 맥락 보존).
- **알림 최소화**: 정상 단계는 note(조용), **문제·질의만 alert/question**(홀딩). "문제 없으면 퇴근 후 확인" 원칙.
- **결과 추적**: 각 대상의 구현 코드엔 `@plm <SRS>` 역링크를 달고(execute Step 6.0), 완료 후 `/plm-hub:codescan` 로 Code 딥링크 동기.
- **중단 복구**: state.json `autorun` 로 어느 대상·단계에서 멈췄는지 항상 알 수 있게 유지 → CC 재시작/CC 후에도 `--from` 재개.
- **범위**: code 스킬 체인만 오케스트레이션. 기획(plan) 스킬은 대상 아님(빈 큐 규칙의 /plan·/requirement 제안은 사용자 확인 후 별도 실행).
- **DAG 산출 재현**: `--dry`에서 plm_dag.py 원출력(expansion·queue·cycles)을 그대로 보고 — 사용자가 순서를 검증할 수 있게.

## 다음 단계

```
✅ autorun 완료: 성공 {N}건 · 홀딩 {M}건
   홀딩 재개: /code:autorun --from {SRS}
   전체 회고: /code:reflect
```
