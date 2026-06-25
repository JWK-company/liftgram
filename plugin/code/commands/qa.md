동적 전문가 패널을 구성하여 spec 또는 code를 분야별 관점에서 비판적으로 리뷰한다. 병렬 전문가 리뷰 후 side effect 검증을 거쳐, 채택/보류/기각으로 분류된 최종 보고서를 생성한다.

## 파라미터

- `$ARGUMENTS` (필수): 모드 지정 — `spec` 또는 `code`
- `--panel <구성>` (선택): 전문가 패널 자연어 지정 (예: `--panel "DB 마이그레이션 전문가, 보안 감사관"`)

---

## 두 가지 모드

| | `/qa spec` | `/qa code` |
|---|---|---|
| 입력 | spec 문서 (설계) | git diff / 변경된 파일 |
| 관점 | 실현 가능성, 누락, 모순, 확장성 | 버그, 성능, 보안, 가독성 |
| 산출물 | spec 보완 사항 → /spec 재실행 | 코드 수정 사항 → /execute 재실행 |
| 타이밍 | /spec 후, /execute 전 | /execute 후, 커밋 전 |

---

## Step 1: 전문가 패널 구성 (등급별 최대 인원)

**등급별 전문가 수 제한 (M2 비용 상한):**

| 등급 | 최대 전문가 수 |
|------|-------------|
| Patch | 0 (리뷰 생략 권장) |
| Task | 2인 |
| Feature | 3인 |
| Project/Epic | 5인 |

**작업 성격별 자동 추천 (예시):**

| 작업 성격 | 추천 패널 예시 |
|----------|--------------|
| API 설계 | API 아키텍트, 보안 감사관, DX 전문가, 성능 분석가, 도메인 전문가 |
| UI 구현 | UX 전문가, 접근성 감사관, 성능 최적화 전문가, 비주얼 QA |
| DB 스키마 | DBA, 데이터 무결성 전문가, 쿼리 성능 분석가, 보안 전문가 |
| 인프라 변경 | 클라우드 아키텍트, 보안 전문가, SRE, 비용 분석가 |

> Claude가 작업 성격을 분석하여 적합한 전문가를 자동 구성합니다.
> 위 테이블은 예시이며, 실제로는 작업에 최적화된 전문가가 동적으로 정의됩니다.

AskUserQuestion으로 추천 패널 확인/수정

**토큰 예산:** 전문가당 8,000 토큰 (역할 ~500 + 리뷰 대상 ~5,000 + 메모리 ~1,500 + 출력 형식 ~500 + 여유 ~500)
리뷰 대상이 전문가당 5K 초과 시 → 분할 리뷰 (Phase별 또는 파일별)

---

## Step 1.5: 리뷰 대상 컨텍스트 수집

전문가에게 전달할 컨텍스트를 사전 수집:

**spec 모드:**
- spec 문서 전문 읽기
- 관련 메모리 검색: `memory_search(query="{spec 주제}", limit=5)` → gotcha/decision 포함

**code 모드:**
- `git diff` → 변경된 코드 수집
- `mcp__serena__find_referencing_symbols(symbol_name="{변경된 핵심 심볼}")` → 영향 범위
- `mcp__serena__get_symbols_overview(relative_path="{변경 파일}")` → 파일 구조
- `memory_search(query="{기술 키워드}", type="gotcha", limit=5)` → 과거 함정

**공통:**
- `mcp__context7__query-docs(library_id="{사용 라이브러리}", query="best practices pitfalls")` → 공식 권장 사항
- 프로젝트 기술 스택 요약 (언어, 프레임워크, DB 등)

---

## Step 2: 병렬 전문가 리뷰

Claude가 작업 성격을 분석하여 각 전문가의 **역할, 전문 분야, 리뷰 관점을 직접 정의**한 뒤 호출:

```
FOR each expert in panel:
    Task(
        subagent_type="general-purpose",
        prompt="당신은 {역할} 전문가입니다.
        전문 분야: {작업 성격에 맞는 전문 분야 설명}
        리뷰 관점: {작업 성격에 맞는 구체적 관점}

        ## 프로젝트 컨텍스트
        - 기술 스택: {언어, 프레임워크, DB}
        - 아키텍처: {레이어 구조 요약}

        ## 리뷰 대상
        {spec 문서 전문 또는 git diff}

        ## 영향 범위 (serena 분석 결과)
        {find_referencing_symbols 결과 요약}

        ## 과거 관련 gotcha
        {메모리 검색 결과}

        ## 공식 문서 참고 (context7)
        {라이브러리 best practice}

        ## 요청
        위 컨텍스트를 바탕으로, {역할} 관점에서 비판적으로 리뷰하세요.
        출력: 핵심 의견(2-3문장) + 상세 분석 + 구체적 개선안 (코드 예시 포함)"
    )
```

**spec 모드 검증 항목:**
- 실현 가능성
- 누락 요구사항
- 내부 모순
- 확장성 리스크

**code 모드 검증 항목:**
- 버그, 보안 취약점
- 성능 이슈
- 코드 가독성
- 테스트 커버리지

---

## Step 3: Side Effect + 기획의도 검증

1. 각 개선안이 다른 부분에 미치는 영향 분석
2. 원래 기획의도를 벗어나는 제안 식별
3. 개선안 간 상충 검출

**MCP 도구:**
```
project_query(path="{관련 파일}", direction="both", depth=2)    # 영향 범위 파악
memory_search(query="{원래 의도}", type="decision", limit=3)     # 기획의도 확인
```

**코드 영향 범위 분석 (serena):**
```
mcp__serena__find_referencing_symbols(symbol_name="{변경된 심볼}")
```
→ 개선안이 다른 코드에 미치는 영향을 심볼 참조 기반으로 정밀 분석
- 파일 전체 Read 대신 심볼 단위 분석으로 토큰 절약
- **fallback:** serena MCP 미연결 시 project_query + Grep으로 대체

**복잡한 리뷰 시 구조화된 분석 (sequential-thinking):**
```
mcp__sequential-thinking__sequentialthinking(thought="이 변경이 기존 아키텍처에 미치는 영향을 체계적으로 분석")
```
→ 다각도 영향 분석을 단계적으로 수행
- **fallback:** sequential-thinking MCP 미연결 시 직접 단계별 분석 수행

**기술 선택/API 사용법 검증 (context7):**
```
mcp__context7__resolve-library-id(library="{리뷰 대상 라이브러리}")
→ mcp__context7__query-docs(library_id="{id}", query="{사용 패턴 best practice}")
```
→ 공식 문서 기반으로 코드가 올바른 API 사용법을 따르는지 검증
- **fallback:** context7 MCP 미연결 시 WebSearch로 대체

**등급별 검증 깊이:**
- Patch/Task: 간략 확인
- Feature+: 상세 (dependency 그래프 활용)

---

## Step 4: 최종 보고서

각 개선안을 분류:

| 분류 | 기준 | 후속 조치 |
|------|------|----------|
| **채택** | 명확한 개선, side effect 없음 | spec 보완 또는 코드 수정 |
| **보류** | 가치 있으나 side effect 미확인 | 추가 검토 후 결정 |
| **기각** | 기획의도 이탈, 과도한 변경 | 사유 기록 |

**리뷰 패널 명시:**
```
📋 리뷰 패널:
  1. {역할} — {전문 분야 한 줄}
  2. {역할} — {전문 분야 한 줄}
  ...
```

**보고서 저장:** `.ouroboros/docs/qa/YYYYMMDD_{name}_review.md`

채택 항목 후속:
- spec 모드 → /spec 재실행 가이드
- code 모드 → 구체적 수정 지시

**리뷰에서 발견된 주요 인사이트 메모리 저장:**
- 채택된 개선안 중 재사용 가능한 패턴/교훈 → `memory_store(memory_type="pattern" 또는 "gotcha")`
- 기각 사유 중 반복될 수 있는 판단 근거 → `memory_store(memory_type="decision")`
- scope: 프로젝트 코드 관련 → "project", 범용 기술 → "personal"
- 다음 /qa에서 이 인사이트가 검색되어 중복 논의 방지

---

## 등급별 차이 요약

| | Patch/Task | Feature+ |
|---|---|---|
| 사용 여부 | 선택적 (생략 권장) | 권장 (Project+ 필수) |
| 패널 규모 | 최대 2인 | 최대 5인 |
| Side effect 검증 | 간략 | 상세 (dependency 그래프) |

---

## state.json 관리

- /qa는 state.json을 변경하지 않는다 (유틸리티 스킬).
- 리뷰 결과는 `.ouroboros/docs/qa/`에 저장하고, 다음 /execute나 /spec에서 참조한다.
- CC 발생 시: 리뷰 진행 중이었다면 `.ouroboros/docs/qa/` 최근 파일을 읽어 이어가거나, 처음부터 다시 실행.

---

## 실패/fallback

- **전문가 팀 호출 실패:** 단일 전문가로 순차 리뷰
- **패널 구성 불일치:** AskUserQuestion으로 재구성
- **MCP 미연결:** side effect 검증 시 파일 기반 분석으로 대체

---

## 다음 단계

리뷰 완료 시 모드에 따라 안내:

**spec 모드 완료 시:**
```
✅ 설계 리뷰 완료: {채택}건 채택, {보류}건 보류, {기각}건 기각

📋 다음 단계:
  채택 사항 반영: /spec 재실행 (보완) 또는 반영 후 /execute
  바로 구현: /execute
```

**code 모드 완료 시:**
```
✅ 코드 리뷰 완료: {채택}건 채택, {보류}건 보류, {기각}건 기각

📋 다음 단계:
  수정 필요: 채택 사항 코드에 반영
  완료: /reflect — 작업 회고 + 인사이트 저장
```
