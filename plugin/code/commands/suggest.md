현재 프로젝트 상태를 분석하고 다음에 어떤 스킬을 사용하면 좋을지 추천합니다.

---

## 실행 절차

### Step 1: 현재 상태 수집

다음을 순서대로 확인하세요:

1. `.ouroboros/context/state.json` 읽기 — active_skill, grade, phase, tasks
2. `.ouroboros/context/current.md` 읽기 — 활성 작업, 차단 요소
3. `git status` — 변경된 파일, 커밋 안 된 것
4. `git log --oneline -5` — 최근 커밋
5. memory_search("현재 프로젝트 상태") — 관련 메모리 (있으면)
6. 프로젝트 구조 파악 (serena):
   ```
   mcp__serena__get_symbols_overview(relative_path="{현재 작업 파일}")
   ```
   → 현재 작업 중인 코드의 복잡도를 파악하여 더 정확한 스킬 추천
   - **fallback:** serena MCP 미연결 시 git status만으로 판단
7. 사용 중인 기술 스택 최신 상태 확인 (context7):
   ```
   mcp__context7__resolve-library-id(library="{주요 프레임워크/라이브러리}")
   → mcp__context7__query-docs(library_id="{id}", query="latest changes migration guide")
   ```
   → 라이브러리 업데이트/마이그레이션 필요 여부 감지 → 추천에 반영
   - **fallback:** context7 MCP 미연결 시 생략

### Step 1.5: 상태 종합 분석 (sequential-thinking)

수집된 모든 정보를 종합하여 현재 상황을 체계적으로 분석:
```
mcp__sequential-thinking__sequentialthinking(thought="수집된 정보 종합: state={active_skill}, git 변경={파일 수}, 메모리={관련 gotcha 수}, 코드 복잡도={serena 결과}. 현재 가장 효과적인 다음 액션을 우선순위별로 도출")
```
→ 단순 규칙 매칭이 아닌, 프로젝트 전체 맥락을 고려한 정밀 추천
- **fallback:** sequential-thinking MCP 미연결 시 상태별 추천 가이드 테이블로 판단

### Step 2: 상태 판단

수집한 정보를 기반으로 현재 상태를 판단하세요:

| 상태 | 조건 |
|------|------|
| **idle** | active_skill == null, 진행 중 작업 없음 |
| **spec-ready** | /spec 완료, /execute 대기 |
| **executing** | /execute 진행 중 |
| **blocked** | /fix 필요하거나 차단 요소 있음 |
| **phase-done** | 현재 Phase 완료, 다음 Phase 대기 |
| **task-done** | 전체 작업 완료, 회고/릴리즈 대기 |
| **messy** | 커밋 안 된 변경 많음, 메모리 정리 필요 |

### Step 3: 추천 출력

아래 형식으로 출력하세요:

```
📍 현재 상태: {판단된 상태}

{상태 요약 1-2줄}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 추천 액션

  1순위: /{스킬명} {인자}
    → {이유}

  2순위: /{스킬명} {인자}
    → {이유}

  (선택): /{스킬명}
    → {이유}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 참고
  {추가 조언이 있으면}
```

### 상태별 추천 가이드

**idle (할 일 없음)**
- 1순위: `/patch` 또는 `/spec` — 새 작업 시작
- 2순위: `/housekeeping` — 메모리 정리
- 선택: `/onboarding --mode project` — 프로젝트 구조 최신화

**spec-ready (설계 완료, 구현 대기)**
- 1순위: `/qa spec` — 구현 전 설계 리뷰 (권장)
- 2순위: `/execute` — 리뷰 건너뛰고 바로 구현
- 참고: state.json의 plan_path에 있는 스펙 문서 경로 알려주기

**executing (구현 중)**
- 진행: `/execute --continue` — 현재 Phase 이어서 진행
- 막힘: `/fix` — 에러/문제 발생 시
- 질문: `/ask "질문 내용"` — 특정 기술 문제

**blocked (차단됨)**
- 1순위: `/fix` — 에러 해결
- 2순위: `/ask "차단 원인"` — 원인 분석 질문
- 참고: current.md의 "차단 요소" 섹션 내용 인용

**phase-done (Phase 완료)**
- 1순위: `/execute --continue` — 다음 Phase 진행
- 선택: `/qa` — Phase 완료 시점 중간 리뷰
- 참고: 남은 Phase 수와 체크리스트 상태 알려주기

**task-done (전체 완료)**
- 1순위: `/qa code` — 코드 리뷰 (권장)
- 2순위: `/reflect` — 회고 + 인사이트 저장

**messy (정리 필요)**
- 1순위: 커밋 안 된 변경 먼저 커밋
- 2순위: `/housekeeping` — 메모리 정리
- 3순위: `/onboarding` — 프로젝트 구조 동기화
- 참고: stale 메모리 수, 중복 의심 건수 알려주기

### Step 4: 사용자 응답 대기

추천을 출력한 후 사용자의 선택을 기다리세요.
사용자가 번호나 스킬명을 말하면 해당 스킬을 바로 실행하세요.

---

## 등급별 차이

없음 (독립 실행)

---

## 실패/fallback

- **MCP 미연결:** 메모리 검색 건너뛰고 git/state 기반으로 추천
- **state.json 없음:** git status + 최근 커밋으로만 판단
