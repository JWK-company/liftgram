# Signal 거버넌스 프로토콜

> 참조: /reflect, /execute (Step 1)
> 목적: Signal 큐 관리, 등급별 차등 처리, 미처리 Signal 관리

---

## 6종 Signal 타입

| Signal 타입 | TTL | 추천 스킬 | 트리거 | 등급 |
|------------|-----|----------|--------|------|
| `workflow-changed` | 7일 | /reflect | 스킬/Hook/워크플로우 파일 수정 | Tier 1 |
| `structure-changed` | 7일 | /reflect | 파일 이동/삭제 (depth >= 2 또는 files >= 3) | Tier 1 |
| `blocker-resolved` | 3일 | /reflect | 10분+ 디버깅 + 워크어라운드 | Tier 1 |
| `pattern-discovered` | 3일 | /reflect | 반복 패턴 감지 (수동 판단) | Tier 2 |
| `distill-ready` | 14일 | /evolve | gotcha + pattern 합계 50건+ | Tier 1 |
| `feature-added` | 없음 (영구) | /reflect | 유의미한 기능 구현 완료 | Tier 1 |

---

## persistent 플래그

`persistent: true`인 Signal은 TTL 만료로 소멸하지 않는다.

### 기본 persistent

- `feature-added` (항상 persistent)

### 수동 persistent

- 사용자가 명시적으로 `persistent: true` 지정한 Signal

### 해소 조건

`addressed_by` 필드에 해소 스킬/커밋 기록 시에만 resolved.

---

## addressed_by 추적

Signal 해소 시 추적 정보를 기록한다.

```json
{
  "signal_type": "workflow-changed",
  "summary": "execute.md Step 6 수정",
  "addressed_by": {
    "skill": "/reflect",
    "timestamp": "2026-03-18T14:30:00Z",
    "commit": "abc1234"
  }
}
```

### 효과

- 같은 Signal 무한 누적 방지
- Signal -> 해소 이력 추적
- 미해소 Signal만 필터링 가능

---

## 등급별 차등 처리

| 조건 | Patch/Task | Feature+ |
|------|-----------|---------|
| Signal 확인 | **스킵** | 매 /execute 시작 시 확인 |
| 미해결 >= 10건 | 경고만 | **/execute 차단** -> /reflect 필수 |
| 미해결 >= 6건 | 무시 | 경고 표시 |
| 미해결 1-5건 | 무시 | 정보 표시 |
| 미해결 0건 | 조용히 통과 | 조용히 통과 |
| urgent 존재 | AskUser | AskUser (즉시) |
| high >= 3건 | 무시 | AskUser |

### Feature+ 차단 플로우

```
미해결 Signal >= 10건
  -> "/execute 차단: 미해결 Signal {N}건. /reflect으로 정리 후 재시도하세요."
  -> /reflect 실행 후 Signal 수 감소 확인
  -> 10건 미만 -> /execute 재개 허용
```

---

## Signal -> 스킬 매핑

| Signal | 1차 추천 | 2차 추천 |
|--------|---------|---------|
| workflow-changed | /reflect | /reflect |
| structure-changed | /reflect | /onboarding --mode project |
| blocker-resolved | /reflect | /housekeeping |
| pattern-discovered | /reflect | /evolve |
| distill-ready | /evolve | /reflect |
| feature-added | /reflect | /reflect |

---

## 미처리 Signal의 gotcha 자동 변환

TTL 만료 시점에 아직 미처리(addressed_by 없음)인 Signal:

1. `blocker-resolved` -> gotcha 메모리로 자동 변환
   - content: Signal summary를 gotcha 형태로 변환
   - 이유: 해결된 문제는 재발 방지 지식으로 보존
2. `pattern-discovered` -> pattern 메모리로 자동 변환
3. 나머지 Signal -> 만료 삭제

---

## 세션 캐시

`state.json`의 `last_signal_check` 필드로 30분 내 중복 조회 방지.

```json
{
  "last_signal_check": "2026-03-18T14:00:00Z",
  "signal_count": 3
}
```

30분 이내 재진입 시 -> 캐시 사용 (MCP 호출 절약).
