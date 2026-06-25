# Staleness Detection 프로토콜

> 참조: /onboarding, /housekeeping
> 목적: 메모리 상충/최신화 감지, 코드 변경 연동, SUPERSEDES 관리

---

## 메모리 라이프사이클

```
active -> stale_candidate -> archived
              ^
  코드 변경 / 상충 감지 / 6개월 미접근
```

| 상태 | 검색 포함 | 설명 |
|------|----------|------|
| `active` | O | 기본 상태. 정상 검색 대상 |
| `stale_candidate` | O + 경고 | "이 정보는 최신이 아닐 수 있음" 경고 첨부 |
| `archived` | X | 이력 보존, 기본 검색 제외. `--include-archived`로 조회 가능 |

---

## 코드 변경 연동

### related_files 매칭

Memory 노드에 `related_files: [String]` 속성:

```
gotcha: "bcrypt는 cost=12가 적절"
related_files: ["src/services/auth.ts", "src/utils/crypto.ts"]
```

### 감지 시점: /onboarding --mode project

1. `git diff`로 변경 파일 추출
2. 변경 파일과 Memory의 related_files 매칭
3. 매칭 -> status: `stale_candidate` 자동 전환
4. /housekeeping에서 "관련 파일이 변경되었습니다. 아직 유효한가요?" 질문

---

## 감쇠 (Decay)

### Memory 노드 속성

- `last_accessed_at`: 검색 결과에 포함될 때마다 갱신
- `access_count`: 검색 결과에 포함될 때마다 +1

### 감쇠 규칙

| 조건 | 전환 |
|------|------|
| 6개월 미접근 | -> `stale_candidate` |
| access_count 0 + 3개월 경과 | -> `stale_candidate` |
| stale_candidate + /housekeeping 확인 "무효" | -> `archived` |
| stale_candidate + /housekeeping 확인 "유효" | -> `active` (last_accessed_at 갱신) |

### 검색 우선순위 (RRF 리랭킹 3축)

1. Semantic similarity (의미 유사도)
2. Recency (created_at + last_accessed_at)
3. Access count (자주 참조되는 메모리 우선)

---

## 상충 감지

### 새 메모리 저장 시

1. 유사도 0.80-0.90 범위의 기존 메모리 검색
2. 발견 시 AskUserQuestion:
   > "비슷한 기존 기록이 있습니다. 대체할까요, 병존할까요?"
3. **대체**: 기존 -> `archived`, 새 메모리에 `supersedes: [기존 uuid]`
4. **병존**: 둘 다 `active` 유지

### 개인 vs 프로젝트 메모리 상충

```
1순위: active + 최신 (created_at 내림차순) — 프로젝트/개인 무관하게 최신이 먼저
2순위: 같은 시점이면 개인 메모리 > 프로젝트 메모리
상충 감지: 개인 메모리와 프로젝트 메모리가 상충하면
  -> "프로젝트 지식과 다른 개인 기록이 있습니다. 어떻게 진행할까요?" 1회 질문
```

---

## SUPERSEDES 관계

```
(new_memory)-[:SUPERSEDES]->(old_memory)
```

- 대체 시 자동 생성
- old_memory는 archived 상태로 이력 보존
- KG에서 관계 추적 가능

### SUPERSEDES 체인 관리

- 체인 깊이 3 이상 -> /housekeeping에서 정리 권장
- archived 메모리가 50건 이상 -> /evolve 권장

---

## /housekeeping stale 리뷰 절차

1. stale_candidate 목록 조회
2. 각 항목에 대해:
   a. related_files 변경 이력 확인
   b. 내용이 아직 유효한지 AskUserQuestion
   c. 유효 -> active 복원 / 무효 -> archived
3. archived 항목 중 SUPERSEDES 체인 정리
