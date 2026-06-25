spec 없이 단순 수정을 즉시 실행한다. 파일 1-2개, 단일 관심사의 작업만 대상. 복잡하면 /spec으로 에스컬레이션한다.

## 파라미터

- `$ARGUMENTS` (필수): 수정 내용 (자연어)

---

## Step 1: 빠른 검증

1. 작업 설명에서 수정 대상 파일/범위 추정
2. **Patch 적격 판단:**
   - 파일 3개 이상 수정 예상 → `/spec`으로 안내 후 종료
   - DB 스키마 변경 포함 → `/spec`으로 안내 후 종료
   - 새 API 엔드포인트 → `/spec`으로 안내 후 종료
   - FE + BE 동시 수정 → `/spec`으로 안내 후 종료
3. **gotcha 검색 (1회):**
   ```
   memory_search(query="{작업 키워드}", type="gotcha", limit=3)
   ```
   - score >= 0.85 → 주의사항으로 표시
   - MCP 실패 → 경고 없이 진행

---

## Step 2: 즉시 구현

**코드 분석 (serena 우선):**
- `mcp__serena__get_symbols_overview(relative_path="{파일}")` → 파일 구조 파악
- `mcp__serena__find_symbol(name_path="{심볼}", include_body=true)` → 수정 대상 심볼만 읽기
- 파일 전체를 읽지 말고 심볼 단위로 필요한 부분만 읽기 (토큰 절약)
- **fallback:** serena MCP 미연결 시 기존 Read로 대체

**라이브러리 API 확인 필요 시 (context7):**
- `mcp__context7__resolve-library-id(library="{라이브러리}")` → `mcp__context7__query-docs(library_id="{id}", query="{수정 관련 API}")`
- **fallback:** context7 MCP 미연결 시 WebSearch로 대체

**수정 방향이 불확실할 때 (sequential-thinking):**
- `mcp__sequential-thinking__sequentialthinking(thought="수정 목표: {목표}. 가장 안전한 수정 방법을 단계적으로 도출")`
- **fallback:** sequential-thinking MCP 미연결 시 직접 분석

1. 대상 파일 분석 (serena 우선, Read는 심볼 구조가 불명확할 때만)
2. 수정 수행
3. **인사이트 감지 (Auto-collection):**
   - 예상과 다른 동작 → gotcha 저장
   - 3회+ 시도 끝에 해결 → gotcha 저장
   - 세션당 최대 2건
   - Idea-Only 준수
   - **호출:** `memory_store(memory_type="gotcha", title="...", content="...", scope="personal", user_id="{DEVELOPER_USER_ID}", project_id="{PROJECT_ID}")`

---

## Step 3: 완료

수정 결과를 1줄로 보고:

```
✅ Patch 완료: {수정 내용 요약}
   변경: {파일 목록}
```

**에스컬레이션 감지:**
- 실제 수정 파일이 3개 이상 → "예상보다 범위가 큽니다. `/spec`으로 전환할까요?"
- 구현 중 예상치 못한 의존성 발견 → 동일 안내

---

## /execute와의 차이

| | /patch | /execute |
|---|---|---|
| spec 필요 | 없음 | 필수 |
| 복잡도 분석 | 없음 (Patch 고정) | /spec에서 판정 |
| Phase 분할 | 없음 | Feature+ 필수 |
| SV (build/test/lint) | 없음 | Feature+ 필수 |
| Scope Audit | 없음 | Patch: 정보 / Feature+: 필수 |
| Signal 확인/기록 | 없음 | Feature+ 필수 |
| state.json | 변경 없음 | 갱신 |
| current.md | 변경 없음 | 갱신 |
| Auto-collection | 최대 2건 | 최대 5건 |

---

## 실패/fallback

- **MCP 미연결:** gotcha 검색 건너뛰고 바로 구현
- **에스컬레이션:** 범위 초과 감지 시 `/spec`으로 안내
- **구현 실패:** `/fix`로 안내
