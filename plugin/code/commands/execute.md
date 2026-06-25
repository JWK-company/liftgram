spec 문서를 기반으로 실제 코드를 구현하고, 완료 시 종료 루틴(Signal 기록 + Scope Audit)을 수행한다. current.md 또는 인자로 받은 spec 경로를 읽고, 등급별 절차에 따라 Step-by-Step으로 코드를 구현한다.

## 파라미터

- `$ARGUMENTS` (선택): spec 문서 경로. 없으면 current.md에서 활성 spec 확인
- `--continue`: 이전 중단된 지점에서 재개 (/proceed 흡수). Phase 전환에도 사용

---

## Step 0: 세션 상태 확인

1. **MCP 연결 검증:**
   ```
   memory_search(query="test", limit=1)
   ```
   - 실패 → "MCP 미연결. Degraded mode" 경고 + AskUserQuestion

2. **state.json + current.md 세션 상태 확인:**
   - active 상태 + 동일 spec → CC(Context Compact) 복구 (자기 세션)
   - active 상태 + 다른 spec → 충돌 처리 (AskUserQuestion)
   - idle → active로 전환, state.json 기록

---

## Step 0.1: Signal 확인 (Feature+ 전용)

> Patch/Task: 이 Step 스킵

Signal 큐 조회 → 등급별 차등 처리:
- 미해결 >= 10건 → 경고 + AskUserQuestion ("Signal 정리 후 진행" / "무시하고 진행")
- 미해결 >= 6건 → 경고 표시
- 미해결 1-5건 → 정보 표시
- urgent 존재 → AskUserQuestion (즉시)
- high >= 3건 → AskUserQuestion

**세션 캐시:** state.json `last_signal_check` 30분 내 재진입 시 캐시 사용 (MCP 호출 절약)

---

## Step 0.5: 브랜치 전략 (Feature+ 전용)

- Patch/Task: 현재 브랜치에서 작업
- Feature+: KG 선호 조회 → 없으면 AskUserQuestion ("새 브랜치" / "현재 브랜치")

---

## Step 1: spec 문서 확인

- 인자 경로 → 해당 spec 읽기
- `--continue` → state.json에서 마지막 Phase/Step 확인 → 해당 지점부터 재개
- 없음 → current.md에서 활성 spec → 없으면 AskUserQuestion

**state.json 갱신:**
```json
{
  "active_skill": "execute",
  "skill_step": 1,
  "grade": "<patch|task|feature|project|epic>",
  "phase": null,
  "plan_path": "<spec path>",
  "active_files": [],
  "tasks": { "<spec_id>": { "name": "<name>", "plan_path": "<path>", "grade": "<등급>" } }
}
```

---

## Step 2: 등급별 읽기 순서

| 등급 | 읽기 순서 |
|------|----------|
| Patch/Task | spec.md 전체 → 체크리스트 순서대로 실행 |
| Feature | spec.md (shell) → phase-N.md (현재 Phase) → _analysis.md (on-demand) |
| Project/Epic | _intent.md/spec.md (shell) → _context.md → phase-N.md → _analysis.md (on-demand) |

---

## Step 3: 사전 메모리 검색 + 체크리스트 등록

spec 문서에서 3축 키워드 추출 → 병렬 검색:
```
memory_search(query="{도메인}", limit=5)
memory_search(query="{기술}", type="gotcha", limit=5)
knowledge_query(query="{기술}", type="convention", limit=3)
```

검색 결과 활용:
- score >= 0.85 → 반드시 준수
- 0.80-0.85 → 상황 발생 시 참조
- < 0.80 → 무시

---

## Step 4: 순차 실행 (Auto-collection 내장)

각 작업마다:
1. 관련 파일 분석 (serena 우선, Read는 최후 수단):
   - `mcp__serena__get_symbols_overview(relative_path="{파일}")` → 파일 구조 파악
   - `mcp__serena__find_symbol(name_path="{심볼}", include_body=true)` → 수정 대상 심볼만 읽기
   - `mcp__serena__find_referencing_symbols(symbol_name="{심볼}")` → 변경 시 영향받는 코드 확인
   - 파일 전체 Read는 심볼 구조가 불명확할 때만 사용
   - **fallback:** serena MCP 미연결 시 기존 Read + Grep으로 대체
   **라이브러리 사용법 확인 필요 시 (context7):**
   - `mcp__context7__resolve-library-id(library="{라이브러리명}")` → `mcp__context7__query-docs(library_id="{id}", query="{사용법}")`
   - 공식 문서 기반으로 올바른 API 호출 방식 확인
   - **fallback:** context7 MCP 미연결 시 WebSearch로 대체
   **복잡한 구현 로직 시 (sequential-thinking):**
   - `mcp__sequential-thinking__sequentialthinking(thought="구현 목표: {체크리스트 항목}. 구현 순서와 주의점을 단계적으로 정리")`
   - 여러 파일에 걸친 변경, 상태 관리, 비동기 처리 등에 활용
   - **fallback:** sequential-thinking MCP 미연결 시 직접 단계별 분석
   **구현 중 막히거나 사례가 필요할 때 (WebSearch):**
   - `WebSearch(query="{에러 메시지 또는 구현 패턴} {기술 스택}")` → 커뮤니티 해결책/구현 사례 참고
   - context7에서 문서를 못 찾았거나, 에러 메시지 기반 검색이 필요할 때 적극 사용
2. 작업 단위 컨텍스트 검색 (새 파일 첫 수정, 에러 발생, 3회+ 시도 시)
3. 작업 수행
4. current.md 즉시 업데이트
5. **인사이트 자동 감지 (Auto-collection):**
   - 예상과 다른 동작 → gotcha
   - 3회+ 시도 끝에 해결 → gotcha
   - 재사용 가능한 패턴 → pattern
   - 설계/기술 선택 → decision
   - 비자명한 동작 원리 → insight
   - **세션당 최대 5건** (5건 초과 → "/reflect에서 추가 정리 권장" 안내)
   - **Idea-Only 검증:** content에 파일 경로/코드 스니펫/라인 번호 포함 시 저장하지 않음
   - **중복 체크:** content_hash + 시맨틱 유사도(>= 0.90 스킵, 0.80-0.90 질문) 확인
   - **related_files 자동 첨부:** state.json.active_files에서 현재 작업 관련 파일
   - **scope:** 항상 `"personal"` (Auto-collection은 개인 메모리로 저장. 프로젝트 공유는 /reflect에서 판단)
   - **user_id/project_id:** .env의 DEVELOPER_USER_ID, PROJECT_ID 사용
   - **호출 예시:**
     ```
     memory_store(
         memory_type="gotcha",
         title="{검색 가능한 제목}",
         content="{코드 없는 일반화된 내용}",
         scope="personal",
         user_id="{DEVELOPER_USER_ID}",
         project_id="{PROJECT_ID}",
         related_files=["{현재 작업 파일}"]
     )
     ```
6. active_files 갱신 (state.json, 최대 20개 FIFO)
7. 다음 작업

**금지:** 여러 작업 동시 수행, spec에 없는 수정
**차단 발생 시:** current.md "차단 요소" 기록 → AskUserQuestion → 병렬 작업 이동 또는 세션 종료
**구현 실패 시:** 변경 되돌리기 → spec 재검토 → 접근 변경 또는 /fix 호출

---

## Step 5: SV + Checkpoint (Feature+ 전용)

> Patch/Task: 이 Step 스킵

1. 전체 체크리스트 완료 확인
2. Self-Verification (build → test → lint)
3. Checkpoint 커밋 생성
4. current.md 진행 상태 갱신
5. Phase 완료 보고 + 다음 Phase 브리핑
6. **사용자 입력 대기** — 자동 다음 Phase 실행 금지
7. 마지막 Phase → Step 6

---

## Step 6: 종료 루틴 (/complete 흡수)

### 6.0 딥링크 역링크 (추적성 — 코드↔요구)
- 구현한 코드 단위(함수/모듈) 위에 **상위 요구 역링크 주석**을 단다: `// @plm SRS-NNN [SAD-NNN]  설명` (언어별 주석문법). 여러 요구를 실현하면 모두 나열.
- 구현 완료 후 **`/plm-hub:codescan`** 실행 → 소스 `@plm` 주석이 PLM에 Code 아티팩트(`loc: path:line`)+`realizes`로 등록되고, 대상 SRS/SAD `.md`에 `code_refs`가 역기재되어 **요구↔코드 양방향 딥링크**가 완성된다. (PLM 바인딩 시.)

### 6.1 메모리 검증 (Feature+ 전용)
- workflow-changed Signal: 워크플로우 파일 수정 감지 → reference 메모리 업데이트
- blocker-resolved Signal: 차단/디버깅 발생 → gotcha 자동 저장
- structure-changed Signal: 파일 이동/삭제 → 경로 참조 업데이트

### 6.2 Signal 기록
```
signal_record(signal_type="{type}", summary="{1줄 요약}")
```
+ current.md Signal 테이블 갱신

### 6.3 Scope Audit
- `git diff --name-only` vs spec Scope 비교
- **Patch/Task:** 정보 제공만 ("Scope 외 변경: {파일 목록}")
- **Feature+:** AskUserQuestion ("의도함" / "검토 필요")

### 6.4 세션 정리
- state.json 초기화: `active_skill: null, skill_step: null`
- current.md: 세션 상태 idle, 활성 작업 → 완료 작업 테이블로 이동

---

## 등급별 차이 요약

| | Patch/Task | Feature+ |
|---|---|---|
| Signal 확인 | 스킵 | 필수 |
| 브랜치 전략 | 현재 브랜치 | KG 조회 → AskUser |
| Phase 분할 | 없음 | 있음 |
| Self-Verification | 스킵 | 필수 (build/test/lint) |
| Scope Audit | 정보 제공 | AskUser 필수 |
| 종료 루틴 메모리 검증 | 스킵 | 필수 |

---

## --continue 옵션 (Phase 전환)

`/execute --continue` 호출 시:
1. state.json에서 마지막 Phase/Step 확인
2. 다음 Phase 문서 읽기
3. 해당 Phase의 Step 4부터 재개

---

## 실패/fallback

- **MCP 미연결:** Degraded mode (메모리 검색/Signal/체크리스트 없이 진행)
- **spec 문서 없음:** AskUserQuestion으로 경로 확인
- **CC 발생:** state.json 기반 상황별 최소 읽기 세트로 복구

---

## 다음 단계

구현 완료(종료 루틴 후) 시 안내:

```
✅ 구현 완료: {spec 이름}

📋 다음 단계:
  1순위: /qa code — 코드 리뷰 (권장)
  2순위: /reflect — 회고 + 인사이트 저장
```

/fix 호출 후 복귀 시:
- state.json의 이전 active_skill, skill_step 복원
- "이전 작업을 이어갑니다: {spec 이름} Step {N}" 안내
