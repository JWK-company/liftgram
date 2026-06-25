최근 작업을 회고하여 인사이트를 발견하고 메모리에 저장한다. gotcha/pattern/decision/insight 유형별로 분류하고, 프로젝트 공유 여부를 판단하여 적절한 레벨에 저장한다.

## 파라미터

- `$ARGUMENTS` (선택): 회고 대상 (없으면 최근 작업)

---

## Step 1: 최근 작업 분석

current.md에서 최근 완료 작업 확인:
- 관련 spec 문서 경로
- 수행한 작업 목록
- 발생한 이슈/차단 요소

**코드 변경 영향 파악 (serena):**
```
mcp__serena__find_referencing_symbols(symbol_name="{변경한 핵심 심볼}")
```
→ 작업 중 변경한 코드가 다른 곳에 미친 영향을 파악하여 인사이트 발굴에 활용
- **fallback:** serena MCP 미연결 시 git diff 기반으로 파악

---

## Step 2: 기존 메모리 중복 확인

**MCP 도구:**
```
memory_search(query="{작업 기술 키워드}", limit=10)
```

**중복 판단 기준:**
- 같은 기술 + 같은 문제 → `memory_update`로 기존 메모리 보강
- 같은 기술 + 다른 문제 → 새로 저장
- 기존 메모리 부정확 → `memory_update`로 수정

---

## Step 3: 인사이트 발견

작업 과정에서 다음 유형의 인사이트 식별:

| 유형 | 설명 | 예시 |
|------|------|------|
| **gotcha** | 예상과 다른 동작, 삽질, 함정 | "bcrypt hash 비교 시 timing attack 주의" |
| **pattern** | 재사용 가능한 패턴 | "3계층 에러 처리 전략" |
| **decision** | 설계 결정 + 근거 | "JWT 대신 세션 선택: 이유는..." |
| **insight** | 비자명한 동작 원리, 맥락 이해 | "Neo4j 트랜잭션 격리 수준 동작 방식" |

---

## Step 4: 저장 품질 체크리스트

각 인사이트에 대해 검증:

1. **제목이 검색 가능한가?** — 6개월 후 검색 키워드가 제목에 있는가?
2. **내용이 자기완결적인가?** — 이 메모리만 읽고 문제를 이해+해결 가능한가?
3. **태그가 다각도인가?** — 기술명 + 파일명 + 문제유형 (4-6개)
4. **중복이 아닌가?** — Step 2에서 확인

검증 실패 → 인사이트 재작성 또는 폐기

---

## Step 5: 사용자 확인

AskUserQuestion으로 발견된 인사이트 요약 제시:
- 유형별 목록
- 저장 예정 내용 요약
- 수정/추가/삭제 가능

---

## Step 6: 메모리 저장

각 인사이트에 대해 AskUserQuestion으로 scope 확인:

```
이 인사이트를 프로젝트에 공유할까요?
  1. 개인 메모리로 저장 (본인만 검색 가능)
  2. 프로젝트 메모리로 저장 (프로젝트 전체에서 검색 가능)
```

**개인 메모리 (scope: personal):**
```
memory_store(
    memory_type="{유형}",
    title="{검색 가능한 제목}",
    content="{자기완결적 내용}",
    user_id="{DEVELOPER_USER_ID}",
    project_id="{PROJECT_ID}",
    scope="personal"
)
```

**프로젝트 메모리 (scope: project):**
```
memory_store(
    memory_type="{유형}",
    title="{검색 가능한 제목}",
    content="{자기완결적 내용}",
    user_id="{DEVELOPER_USER_ID}",
    project_id="{PROJECT_ID}",
    scope="project"
)
```

**프로젝트 수준 패턴/컨벤션은 KG에도 저장:**
```
knowledge_store(
    node_type="Pattern" 또는 "Preference",
    name="{패턴/컨벤션 이름}",
    description="{설명}",
    namespace="project"
)
```
→ /spec, /execute에서 knowledge_query로 검색되어 팀 전체에 적용

**scope 판단 가이드:**

| 기준 | scope |
|------|-------|
| 프로젝트 코드/설정 특유 문제 | `project` (프로젝트 공유) |
| 프로젝트 컨벤션으로 채택할 패턴 | `project` (프로젝트 공유) |
| 범용 기술 지식 | `personal` |
| 개인 실수/학습 | `personal` |

**Idea-Only 준수:** content에 파일 경로, 코드 스니펫, 라인 번호 포함 금지.
related_files는 메타데이터로 별도 첨부.

---

## Step 7: current.md 업데이트

완료된 회고 내역 기록.

---

## 선택적 만족도 피드백 수집

작업 완료 후 사용자에게 간단 피드백 요청 (선택):
- 이번 작업 워크플로우 만족도
- 개선 의견

---

## 등급별 차이

없음 (모든 등급에서 동일)

---

## 실패/fallback

- **MCP 미연결:** 인사이트를 `.ouroboros/docs/knowledge/` 로컬 문서로 저장
- **인사이트 없음:** "이 세션에서 특별한 학습 사항 없음" 안내 후 종료
- **"순조로운 작업" 저장 폐지:** 문제 없이 동작한 것은 지식이 아님 — 아무것도 저장하지 않음

---

## 다음 단계

회고 완료 시 안내:

```
✅ 회고 완료: {저장된 인사이트 수}건 저장

📋 다음 단계:
  새 작업: /suggest — 다음 할 일 추천
  정리: /housekeeping — 메모리 품질 관리
```
