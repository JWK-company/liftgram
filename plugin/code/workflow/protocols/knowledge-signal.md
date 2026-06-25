# Knowledge Signal 프로토콜 (T1/T2/T3 선호 감지)

> 참조: knowledge-signal.sh (Hook)
> 목적: 사용자의 AskUserQuestion 응답에서 암시적 선호를 감지하고 분류

---

## 3-Tier 분류 체계

### T1: 명시적/오버라이드 (즉시 저장)

**정의**: 사용자가 명시적으로 선호를 표현한 경우

**키워드 패턴** (2-gram 이상):
- "항상 ~해", "항상 ~해줘"
- "절대 ~하지", "절대 ~하지 마"
- "매번 ~해줘", "매번 ~해"
- "~를 선호해", "~가 좋아"
- "~는 싫어", "~하지 마"
- "always", "never", "prefer"

**행동**:
1. 키워드 감지 시 -> 선호인지 확인 후 knowledge_store 즉시 호출
2. 확인 질문: "'{키워드 포함 문장}'을 선호로 저장하겠습니다. 맞습니까?"
3. type: `preference` (convention 카테고리)

**오탐 방지**:
- 단순 기술 설명 내 키워드 제외 ("항상 null을 반환합니다" -> 선호 아님)
- 2-gram 이상 패턴으로 문맥 확인
- 부정 패턴: "항상 + 기술동사(반환/호출/실행/생성)" -> 스킵

### T2: 구조적 선택 (query 확인 후 저장)

**정의**: 복잡도/브랜치/접근 방식/스타일에 대한 선택

**감지 상황**:
- 복잡도 등급 선택 ("Feature로 하겠습니다")
- 구현 접근 방식 선택 ("방법 A로 진행")
- 코드 스타일 선택 ("세미콜론 없이")
- 브랜치 전략 선택 ("develop에서 작업")

**행동**:
1. `knowledge_query`로 기존 값 확인
2. 기존 값 존재 -> "기존 설정: {값}. 업데이트할까요?"
3. 기존 값 없음 -> 새로 저장
4. type: `preference` 또는 `convention`

### T3: 상황적/사실 확인 (무시)

**정의**: 특정 상황에 대한 사실 확인 응답. 범용 선호가 아님.

**감지 상황**:
- 범위 확인 ("이 파일은 수정하지 마세요")
- 차단 해소 ("그 에러는 무시해도 됩니다")
- 검증 확인 ("네, 테스트 통과했습니다")
- 진행 여부 ("계속하세요")

**행동**: 저장하지 않음

---

## Hook 동작 (knowledge-signal.sh)

### Progressive Disclosure

| 조건 | 출력 |
|------|------|
| 첫 발동 또는 30분 경과 | Full (4줄 가이드) |
| 30분 이내 재발동 | Compact (1줄 요약) |

### T1 사전 감지

Hook이 bash grep으로 T1 키워드를 사전 스캔한다.

- T1 키워드 감지 -> `[KS-T1]` 힌트 추가
- T1 키워드 미감지 -> 일반 리마인더만 출력

> Hook은 T1 키워드만 사전 감지. T2/T3 분류는 Claude에게 위임.
> (Hook에서 LLM 수준 의미 분석 불가)

---

## 저장 형식

```
knowledge_store(
    type="preference",
    category="convention",
    content="{선호 내용}",
    source="user_response",
    confidence=0.95  // T1
)
```

---

## 참조 파일

- Hook 구현: `${CLAUDE_PLUGIN_ROOT}/hooks/knowledge-signal.sh`
- 동적 전문가 호출: `${CLAUDE_PLUGIN_ROOT}/workflow/protocols/agent-invocation.md`
