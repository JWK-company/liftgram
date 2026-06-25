6단계 에스컬레이션으로 문제를 체계적으로 진단하고 해결한다. 빠른 진단부터 외부 검색, 전략 전환까지 점진적으로 심화하며, 5회 hard limit으로 무한 루프를 방지한다.

## 파라미터

- `$ARGUMENTS` (필수): 문제 설명 (에러 메시지, 증상 등)

---

## Step 0: 컨텍스트 감지

- state.json 확인 → `active_skill == "execute"` → **execute-aware 모드**
  - debug_context 기록: `{ caller_skill, caller_step, caller_phase, checklist_item, active_files_snapshot }`
  - active_skill은 "execute" 유지 (별도 스킬로 전환하지 않음)
- 그 외 → **독립 모드**

---

## Step 1: 히스토리 검색 + 증상 수집

**MCP 도구:**
```
memory_search(query="{problem keywords}", limit=5)
```

- 이전 유사 문제 발견 (score >= 0.85) → 해결 방법 공유 + 자동 에스컬레이션 가능
- MCP 실패 → 경고 출력, 다음 단계로

**증상 수집:**
- 에러 메시지/로그 → 분석 → Step 2
- 정보 부족 → AskUserQuestion:
  - 정확한 에러 메시지
  - 재현 조건
  - 최근 변경 사항

**핵심 구분: 증상(무엇이 다른가) != 원인(왜 다른가)**

---

## Step 2: 빠른 진단 (코드 분석)

1. 에러 위치에서 관련 코드 분석:
   - `mcp__serena__find_symbol(name_path="{에러 심볼}", include_body=true)` → 에러 발생 심볼의 본문 확인
   - `mcp__serena__find_referencing_symbols(symbol_name="{에러 심볼}")` → 호출자 추적
   - Read + Grep은 심볼명을 모를 때만 사용
   - **fallback:** serena MCP 미연결 시 기존 Read + Grep으로 대체
2. 에러 메시지 기반 원인 추론
3. 직접적 코드 결함 확인

**해결 Gate:** 원인 명확 + 수정 자명 → 수정 → Step 6
**미해결:** → Step 3

---

## Step 3: 심화 분석 (프로토콜 매칭)

**복잡한 문제 시 단계적 분석 (sequential-thinking):**
```
mcp__sequential-thinking__sequentialthinking(thought="증상: {증상}. 가능한 원인을 체계적으로 열거하고 각각의 검증 방법을 수립")
```
→ 다단계 디버깅을 구조화하여 원인 범위를 체계적으로 좁혀감
- **fallback:** sequential-thinking MCP 미연결 시 직접 단계별 분석 수행

1. 문제 유형별 프로토콜 매칭:
   - 원인 불명 → Root Cause Analysis 프로토콜
   - 상태 변경 이상 → State Verification 프로토콜
   - 매칭 없음 → 자체 흐름 추적
2. 매칭된 프로토콜의 Phase 적용
3. 불확실하면 AskUserQuestion으로 테스트/검증 요청

**해결 Gate:** 근본 원인 특정 → 수정 → Step 6
**미해결:** → Step 4

---

## Step 4: 외부 조사

**진입 조건:** 생소한 기술 / Step 3 실패 / 문서 확인 필요

1. **Context7 라이브러리 문서 조회:**
   ```
   mcp__context7__resolve-library-id(library="{라이브러리명}")
   → mcp__context7__query-docs(library_id="{id}", query="{문제 관련 쿼리}")
   ```

2. **WebSearch 유사 사례 검색:**
   ```
   WebSearch(query="{에러 메시지} {기술 스택}")
   ```

3. 공식 문서와 현재 사용법 차이 분석

**해결 Gate:** 외부 정보로 원인 특정 → 수정 → Step 6
**미해결:** → Step 5

---

## Step 5: 전략 전환

**진입 조건:** 같은 접근 3회+ 반복 실패 / Step 4에서도 미해결

1. 이전 시도 복기 + 공통 실패 원인 도출
2. 가정 재검토 ("당연히 맞다고 생각했던 것" 검증)
3. AskUserQuestion — 선택지 제시:
   - 새 접근 시도
   - 전문가 팀 브레인스토밍 (Claude가 문제 유형에 맞는 전문가 2-3명을 동적 구성)
   - 사용자 직접 제안
   - 디버깅 중단

**Hard limit: 5회 재시도 후 강제 중단** → AskUserQuestion으로 현재 상태 보고

---

## Step 6: 완료 + 인사이트 정리

1. **문제 요약:** 증상 / 원인 / 해결 방법 / 도달 Step
2. **인사이트 자동 수집:**
   - Step 2 즉시 해결 → 스킵 (단순 문제)
   - Step 3+ → gotcha 또는 insight 저장
   - Step 5 전략 전환 → gotcha + insight 모두 저장
   **memory_store 호출 예시:**
   ```
   memory_store(
       memory_type="gotcha",
       title="{검색 가능한 제목}",
       content="{코드 없는 일반화된 내용}",
       scope="personal",
       user_id="{DEVELOPER_USER_ID}",
       project_id="{PROJECT_ID}"
   )
   ```
   **Idea-Only 준수:** content에 파일 경로, 코드 스니펫, 라인 번호 포함 금지.
3. **blocker-resolved Signal 기록 (Step 3+):**
   ```
   signal_record(signal_type="blocker-resolved", summary="{1줄 요약}")
   ```
4. **execute-aware 모드:** debug_context 정리 → /execute 원래 Step으로 복귀

---

## Anti-pattern (금지 행동)

- **산탄총 디버깅:** 여러 곳 동시 수정 후 "되나 보자" → 금지
- **증상 숨기기:** try-catch로 에러 무시 → 금지
- **추측성 수정:** 원인 미확인 상태에서 코드 수정 → 금지

---

## 등급별 차이

- /fix 자체는 등급 무관하게 동일 동작
- execute-aware 모드에서 호출 시 원래 작업의 등급을 상속

---

## 실패/fallback

- **MCP 미연결:** 히스토리 검색 건너뜀, 인라인 분석으로 진행
- **5회 hard limit 도달:** 강제 중단 + 현재 상태 보고 (시도 내역, 배제된 원인, 남은 가설)
- **Context7/WebSearch 불가:** Step 4 건너뛰고 Step 5로 진행

---

## 다음 단계

수정 완료 시 안내:

**execute-aware 모드 (execute 중 호출):**
```
✅ 문제 해결 완료

📋 다음 단계:
  /execute 작업으로 복귀합니다.
```
→ state.json에서 이전 execute 상태를 복원하고 이어서 진행.

**독립 실행:**
```
✅ 문제 해결 완료

📋 다음 단계:
  /reflect — 이 디버깅에서 얻은 교훈 저장 (권장)
```
