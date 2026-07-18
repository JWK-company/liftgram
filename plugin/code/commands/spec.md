5-Tier 복잡도 분석 후 등급에 맞는 설계 문서를 생성한다. 작업 요청을 분석하여 Patch/Task/Feature/Project/Epic 등급을 판정하고, 등급별 spec 문서를 생성하여 .ouroboros/docs/spec/에 저장한다.

## 파라미터

- `$ARGUMENTS` (필수): 작업 요청 설명 (자연어)
- `--escalate`: 기존 작업을 상위 등급으로 에스컬레이션
- `--grade <등급>`: 복잡도 수동 지정 (자동 판정 우회)

---

> **plan 체계 정합**: code 작업도 plan의 아티팩트 추적 백본에 편입한다 — **Step 2.5(추적성 분석)** 에서 상위 SRS/SAD 해소·요구 선행 게이트(G0)·구현↔요구 매핑을 수행하고, 구현 시 `@plm` 역링크 + `/plm-hub:codescan`으로 딥링크를 완성한다.

## Step 0: 의도 명확화 (자동 트리거, /brief 흡수)

**휴리스틱 Gate (등급 판정 전이므로 텍스트 기반 판별):**
- 요청 20단어 미만 AND 기술 키워드 2개 이하 → 이 Step 스킵
- 그 외 → 실행

기술 키워드 사전: api, auth, database, db, migration, schema, refactor, integration, deploy, security, performance, cache, queue, async, websocket, grpc, graphql, microservice, docker, k8s, jwt, rbac, encryption, monitoring, scalability

**실행 시:**
1. 사용자 요청에서 핵심 의도 추출
2. 모호한 부분 → AskUserQuestion으로 명확화:
   - 달성하려는 목표
   - 현재 문제점
   - 제약 조건
3. 의도가 명확하면 영문 Brief 1줄 생성 (내부 사용)
4. **용도(분석단위) 판정**: 요청을 `workflow/protocols/analysis-units.md`의 unit(feature·refactor·bugfix·perf·infra·research·design·domain:game)에 매핑한다. 주 용도 1개(+보조). 선택한 unit이 Step 2.5의 G0 적용·granularity·추가 protocol을 결정한다. 불명확 시 AskUserQuestion.
5. MCP 도구: 없음 (순수 대화)

---

## Step 1: 검색 키워드 생성

작업 요청에서 3축 키워드 도출:

| 축 | 설명 | 예시 |
|----|------|------|
| 도메인 | 비즈니스/기능 영역 | "JWT 인증 refresh token" |
| 기술 | 라이브러리, 프레임워크 | "jsonwebtoken middleware" |
| 파일 | 수정 대상 파일/디렉토리 | "auth controller token service" |

---

## Step 2: 다각도 메모리 검색 (필수)

**Phase A — 벡터 시맨틱 검색 (3축 병렬):**
```
memory_search(query="{도메인}", limit=5)
memory_search(query="{기술}", type="gotcha", limit=5)
knowledge_query(query="{도메인}", limit=5)
knowledge_query(query="{기술}", type="convention", limit=3)
```

**Phase B — 그래프 확장 (score >= 0.82 결과 존재 시):**
```
memory_search(related_to="{고관련 메모리 ID}", depth=2)
```

**Phase C — 코드 구조 활용 (수정 대상 파일 명확 시):**
```
project_query(path="{수정 대상}", direction="both", depth=2)
knowledge_query(query="{파일명}", tags="{파일 경로}", limit=3)
```

**Phase D — 코드 구조 분석 (serena, 수정 대상 파일 명확 시):**
```
mcp__serena__get_symbols_overview(relative_path="{수정 대상 파일}")
mcp__serena__find_referencing_symbols(symbol_name="{핵심 심볼}")
```
→ 영향 범위 파악 → spec "코드 영향 범위" 섹션에 반영
- **fallback:** serena MCP 미연결 시 Phase C의 project_query + Grep으로 대체

**Phase E — 새 기술/라이브러리 포함 시 (context7):**
```
mcp__context7__resolve-library-id(library="{기술명}")
→ mcp__context7__query-docs(library_id="{id}", query="{핵심 기능}")
```
→ 최신 API 확인 → spec 작업 목록에 반영
- **fallback:** context7 MCP 미연결 시 WebSearch로 대체

**Phase F — 복잡한 설계가 필요한 경우 (Feature+ 등급, sequential-thinking):**
```
mcp__sequential-thinking__sequentialthinking(thought="현재 아키텍처를 분석하고 변경 전략을 단계적으로 수립")
```
→ 단계적 사고로 설계 결정 구조화
- **fallback:** sequential-thinking MCP 미연결 시 직접 단계별 분석 수행

**Phase G — 외부 사례/패턴 조사 (WebSearch, 새 기술이거나 메모리 미축적 시):**
```
WebSearch(query="{기술명} best practices architecture pattern 2025 2026")
WebSearch(query="{기능명} implementation example {언어}")
```
→ 커뮤니티 검증된 패턴, 비슷한 구현 사례 참고 → spec "참고" 섹션에 반영
→ context7에서 문서를 못 찾은 기술, 최신 트렌드, 보안 관련 정보에 특히 유용

검색 결과 활용 기준:
- score >= 0.85: 직접 관련 → spec "주의사항"에 필수 포함 (source ID + score 명시)
- 0.80-0.85: 참고 가능 → "참고" 섹션에 언급
- < 0.80: 노이즈 → 무시
- 결과 없음: 미축적 → 정상 (첫 경험)

**MCP 실패 시:** 파일 기반 Grep/Read로 대체. 경고 출력 후 진행.

---

## Step 2.5: 추적성 분석 (Traceability Analysis) — plan 체계 정합

> 코드 작업을 plan의 **아티팩트 추적 백본에 일관되게 편입**한다. (프로토콜: `workflow/protocols/traceability-analysis.md`. PLM 미바인딩 시 경고 후 스킵.)

1. **상위 아티팩트 해소**: 이 작업이 구현하는 요구/설계를 찾는다 — `.ouroboros/docs/requirements/SRS-*.json`·`docs/design/SAD-*.json`(ADR-019 CODE.json) 또는 PLM(`mcp__plm__search`/`artifact_get`). 발견분을 후보로 수집.
2. **요구 선행 게이트 (G0)**:
   - 대응 SRS/SAD **있음** → spec 헤더 `추적(implements): SRS-NNN, SAD-NNN` 기재.
   - 대응 SRS **없음 + 새 동작/기능** → **먼저 `/requirement`(plan)로 SRS를 발급**해 추적 백본에 편입할 것을 권고(AskUserQuestion: "요구가 없습니다. SRS를 먼저 발급할까요?"). 사용자가 생략 동의 시 진행.
   - **면제**: 요구 불변의 버그픽스·리팩터·문서·빌드 작업(Patch/Task 한정)은 G0 면제.
3. **구현 매핑 계획**: 작성/수정할 **함수·모듈 ↔ 실현 SRS/SAD** 매핑을 표로 설계한다. 각 항목은 구현 시 `@plm <SRS>` 역링크 주석으로 실현하고, 완료 후 `/plm-hub:codescan`으로 Code 아티팩트·realizes·code_refs를 동기한다(딥링크).
4. 산출: spec 헤더 `추적(implements)` + 본문 **"추적 매핑"** 표(파일/심볼 → SRS/SAD). 이 매핑이 §딥링크 구현·codescan의 계획서가 된다.

---

## Step 3: 복잡도 분석

**MCP 도구 호출:**
```
assess_complexity(description="{작업 설명}", files_estimated=N, behavior_change=true/false, new_api=true/false, db_schema_change=true/false, multi_layer=true/false)
```

**MCP 실패 시 수동 점수 테이블 fallback:**

| 항목 | 점수 |
|------|------|
| 파일 1-2개 | +1 |
| 파일 3-5개 | +2 |
| 파일 6-8개 | +3 |
| 파일 9개+ | +4 |
| FE + BE 동시 수정 | +2 |
| 새 API 엔드포인트 | +1 |
| DB 스키마 변경 | +2 |
| 기존 동작 변경 | +1 |
| 외부 서비스 연동 | +1 |
| 고위험 gotcha 발견 (score >= 0.85) | +1 |

**Floor Rule (구조적 최소 등급):**
- multi_layer=true → 최소 Feature
- db_schema_change AND new_api → 최소 Feature
- files >= 8 AND multi_layer → 최소 Project

**Escape Hatch:** `--grade` 지정 시 Floor Rule 우회. AskUserQuestion으로 "Floor Rule {등급}이지만 하향합니다. 동의하십니까?" 확인.

---

## Step 4: 등급 확정

1. 점수 → 등급 매핑: Patch(0-1), Task(2-3), Feature(4-6), Project(7-9), Epic(10+)
2. 사용자에게 등급 판정 결과 + 발견된 주의사항 공유
3. AskUserQuestion으로 확인 (Single Decision: 1회만 확인)

---

## Step 5: 등급별 문서 생성

| 등급 | 템플릿 | 분량 |
|------|--------|------|
| Patch | spec_patch.md (단일 파일) | ~20줄 |
| Task | spec_task.md (단일 파일) | ~50줄 |
| Feature | spec.md + phase-N.md + _analysis.md (디렉토리) | ~150줄 |
| Project | spec.md + phase-N.md + _context.md + _analysis.md (디렉토리) | ~300줄 |
| Epic | _intent.md + phase-N.md + _context.md + _analysis.md (디렉토리) | ~500줄 |

**spec 필수 포함 항목:**
- 목표
- 작업 목록 (Phase/체크리스트)
- 주의사항 — 메모리 검색 결과 (source ID + score 명시)
- 코드 영향 범위 — dependency 그래프 기반
- 작업 범위 (수정 파일 목록 = scope)

**저장 경로:** `.ouroboros/docs/spec/YYYYMMDD_{name}_spec.md` (또는 디렉토리)

---

## Step 6: state.json + current.md 업데이트

- state.json: `active_skill: "spec"`, 등급, spec 경로
- current.md: 활성 작업 → spec 경로, 작업 범위 → 수정 예정 파일 목록

---

## --escalate 옵션

**트리거 조건:**
- 수정 파일 수가 예상의 2배 이상
- 예상치 못한 레이어 간 의존성 발견
- Signal 누적 3건 이상 (Feature 미만 등급)

**절차:**
1. 현재까지 완료된 작업을 Phase 0으로 마이그레이션
2. assess_complexity 재실행 → 새 등급 판정
3. 나머지 작업을 새 등급에 맞게 재구성
4. 기존 spec 보존 (참조용) + 새 등급 spec 재생성
5. state.json grade 필드 갱신
6. current.md 갱신

---

## 등급별 차이 요약

| | Patch/Task | Feature+ |
|---|---|---|
| Step 0 (의도 명확화) | 스킵 가능 (휴리스틱) | 자동 트리거 (모호 시) |
| 메모리 검색 | Phase A만 | Phase A + B + C |
| 동적 전문가 | 없음 | 선택적 (/qa spec 권장) |
| Phase 분할 | 없음 (단일) | 필수 |

---

## 실패/fallback

- **MCP 미연결:** 수동 점수 테이블 + 파일 기반 검색으로 대체
- **복잡도 판정 분쟁:** 사용자 최종 결정 (--grade 수동 지정)
- **기존 활성 spec 존재:** AskUserQuestion으로 "기존 spec 폐기/유지" 확인

---

## 다음 단계

spec 생성이 완료되면 사용자에게 안내:

```
✅ spec 생성 완료: {spec 경로}
   등급: {등급}

📋 다음 단계:
  1순위: /qa spec — 구현 전 설계 리뷰 (권장)
  2순위: /execute — 바로 구현 시작
```
