# PAMR: Phase별 메모리 검색 어드바이저리

> 참조: /execute (Step 3), /spec
> 목적: Phase 전환 시 관련 메모리를 체계적으로 검색하여 맥락을 확보

---

## 검색 시점

| 시점 | 트리거 |
|------|--------|
| /execute 시작 (Step 3) | spec 문서 로드 후 |
| Phase 전환 | 새 Phase 시작 전 |
| 새 파일 첫 수정 | active_files에 없는 파일 수정 시 |
| 에러 발생 | 빌드/테스트 실패 시 |
| 3회+ 시도 | 같은 문제에 3회 이상 시도 시 |

---

## 3축 키워드 추출

spec 문서 또는 Phase 문서에서 3축 키워드를 추출한다.

| 축 | 설명 | 예시 |
|----|------|------|
| 도메인 | 비즈니스 영역 | "인증", "결제", "알림" |
| 기술 | 사용 기술/라이브러리 | "bcrypt", "JWT", "Redis" |
| 패턴 | 아키텍처/코드 패턴 | "미들웨어", "이벤트 드리븐", "CQRS" |

---

## 검색 쿼리 패턴

### Phase 시작 시 (포괄 검색)

```
memory_search(query="{도메인 키워드}", limit=5)
memory_search(query="{기술 키워드}", type="gotcha", limit=5)
knowledge_query(query="{기술 키워드}", type="convention", limit=3)
```

### 파일 단위 검색 (좁은 범위)

```
memory_search(query="{파일명 또는 모듈명}", limit=3)
```

### 에러 발생 시 (문제 중심)

```
memory_search(query="{에러 메시지 키워드}", type="gotcha", limit=5)
```

---

## 검색 결과 활용 기준

| score | 판정 | 행동 |
|-------|------|------|
| >= 0.85 | **반드시 준수** | 작업 전 확인, 위반 시 AskUserQuestion |
| 0.80 - 0.85 | **상황 발생 시 참조** | 관련 상황 발생하면 적용 |
| < 0.80 | **무시** | 검색 결과에 포함하지 않음 |

---

## Phase 전환 메모리 브리핑

새 Phase 시작 시 다음 형태로 메모리 브리핑을 제공한다:

```
## Phase {{N}} 메모리 브리핑

### 필수 준수 (score >= 0.85)
- [gotcha] {{1줄 요약}} (score: 0.92)
- [pattern] {{1줄 요약}} (score: 0.88)

### 상황 참조 (score 0.80-0.85)
- [decision] {{1줄 요약}} (score: 0.82)

### 관련 convention
- {{convention 1줄 요약}}
```

---

## 검색 최적화

- Phase당 MCP 호출 최대 3회 (도메인/기술/패턴 각 1회)
- 이전 Phase에서 이미 검색한 결과는 재사용
- CC 발생 시 메모리 브리핑은 current.md에서 복구
