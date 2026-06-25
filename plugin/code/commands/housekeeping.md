메모리 품질을 유지하기 위해 중복 제거, staleness 리뷰, 코드 변경 연동 확인, Idea-Only 위반 검사를 수행한다. 30일 미확인 stale은 archived로 자동 전환한다.

## 파라미터

- `$ARGUMENTS`: 없음

---

## Step 1: 메모리 상태 확인

**MCP 도구:**
```
memory_search(query="*", limit=100)
```

**코드 변경 연동 검증 (serena):**
- Staleness 리뷰 시 `related_files`의 현재 상태를 serena로 확인:
```
mcp__serena__get_symbols_overview(relative_path="{related_file}")
```
→ 파일이 삭제/리네이밍되었는지, 심볼이 변경되었는지 정확히 파악
- **fallback:** serena MCP 미연결 시 `git log` + `ls` 기반으로 확인

확인 항목:
- 총 메모리 수
- 타입별 분포 (gotcha, pattern, decision, insight)
- 상태별 분포 (active, stale_candidate, archived)
- 태그 분포

---

## Step 2: Staleness 리뷰

**stale_candidate 상태 메모리 조회:**
```
memory_search(status="stale_candidate", limit=20)
```

각 stale_candidate에 대해:
1. `related_files` 변경 여부 확인:
   ```bash
   git log --since="{memory.updated_at}" --name-only -- "{related_file}"
   git diff HEAD -- "{related_file}"
   ```
2. AskUserQuestion: "관련 파일이 변경되었습니다. 아직 유효한가요?"
   - 유효 → active 복원: `memory_update(id="{id}", user_id="{DEVELOPER_USER_ID}", status="active")`
   - 무효 → archived 전환: `memory_archive(id="{id}", user_id="{DEVELOPER_USER_ID}")`

**30일 미확인 자동 archived:**
- stale_candidate 상태에서 30일간 사용자 확인 없음 → 자동 archived 전환

---

## Step 3: 중복 정리

**완전 중복 (content_hash):**
- 동일 hash → 자동 병합 (최신 유지, 나머지 archived)

**시맨틱 중복 (유사도 0.85+):**
```
memory_search(query="{메모리 content}", limit=5)
```
- 유사도 >= 0.85 → AskUserQuestion: "병합" / "유지"
- 병합 시: 최신 메모리에 정보 통합 → 나머지 archived

---

## Step 4: Idea-Only 위반 검사

기존 메모리의 content를 검사:
- 파일 경로 포함 (`/src/`, `./`, 절대 경로)
- 코드 스니펫 포함 (코드 블록, 인라인 코드)
- 라인 번호 포함 (`line 42`, `L42`, `:42`)
- 특정 변수명/함수명이 핵심인 내용

위반 발견 시 → content를 일반화된 아이디어로 재작성 제안
AskUserQuestion으로 재작성 확인/수정

---

## Step 5: 감쇠 대상 확인

**자동 stale_candidate 전환 조건:**
- 6개월 미접근 (`last_accessed_at` 기준)
- `access_count == 0` + 3개월 경과

**보호 규칙:**
- gotcha: 신중하게 처리 (실수 방지용이므로 보존 경향)
- pattern: 유지 권장
- 최근 7일 내 생성/접근: 삭제 대상 제외

---

## Step 6: 프로젝트 knowledge staleness 확인

프로젝트 공유 지식(knowledge) 중 stale_candidate 확인:
- 최초 발견자가 처리 담당
- AskUserQuestion: "프로젝트 지식 '{title}'이 stale 상태입니다. 업데이트/archived 중 선택하세요"

---

## Step 7: 사용자 확인 후 실행

AskUserQuestion으로 정리 후보 종합 제시:
- archived 예정 목록
- 병합 예정 목록
- 복원 예정 목록
- Idea-Only 재작성 목록

확인 후 일괄 실행.

---

## Step 8: 결과 보고

- 정리된 메모리 수 (archived, 병합, 복원)
- Idea-Only 위반 수정 수
- 잔여 stale_candidate 수
- 총 메모리 현황

---

## 등급별 차이

없음 (독립 실행)

---

## 실패/fallback

- **MCP 미연결:** "메모리 서비스 연결 필요" 안내 후 종료 (MCP 없이는 수행 불가)
- **stale_candidate 0건:** "정리 대상 없음" 안내
- **대량 정리 (50건+):** 10건씩 배치로 확인 (한 번에 전부 보여주지 않음)
