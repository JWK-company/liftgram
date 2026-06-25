축적된 시맨틱 메모리에서 일반화 가능한 지식을 추출하여 Knowledge Graph에 저장한다. 서버에서 DBSCAN 클러스터링을 수행하고, 클라이언트에서 LLM 기반 일반화 텍스트를 생성한다.

## 파라미터

- `$ARGUMENTS`: 없음

## 트리거 조건
- gotcha + pattern 합계 50건+ 시 `distill-ready` Signal 자동 발생
- 소규모 프로젝트(1-5명): 20건+부터 유의미. knowledge_distill(min_count=20) 사용
- 대규모 프로젝트(10명+): 50건+ 권장 (기본값)
- 수동 실행도 가능

---

## Step 1: 승격 후보 수집

**MCP 도구 (서버 측 DBSCAN 클러스터링):**
```
knowledge_distill(min_count=50)
```

**서버 처리 내용:**
1. gotcha + pattern 메모리 로드 (임베딩 벡터 포함)
2. DBSCAN 클러스터링 실행:
   - eps = 1.0 - cosine_threshold (cosine_threshold=0.80 → eps=0.20)
   - min_samples = 3 (최소 3건이 모여야 클러스터)
3. 각 클러스터의 confidence 계산:
   ```
   confidence = avg_intra_similarity * sqrt(cluster_size / total_memories)
   ```
   - avg_intra_similarity: 클러스터 내 모든 쌍의 평균 코사인 유사도
   - size_factor: 큰 클러스터일수록 신뢰도 보너스
4. confidence >= 0.3 이상인 클러스터만 후보로 반환

**서버 응답 형식:**
```json
{
    "candidates": [
        {
            "cluster_id": 0,
            "source_memories": [
                {"id": "uuid-1", "title": "...", "content": "..."},
                {"id": "uuid-2", "title": "...", "content": "..."}
            ],
            "suggested_type": "Pattern",
            "suggested_name": "일반화된 패턴 이름",
            "common_tags": ["tag1", "tag2"],
            "confidence": 0.39
        }
    ],
    "total_analyzed": 45,
    "clusters_found": 3,
    "noise_count": 12
}
```

**MCP 실패 시 수동 분석 fallback:**
```
memory_search(type="gotcha", limit=30)
memory_search(type="pattern", limit=20)
```
→ 태그 기반 수동 클러스터링 (3건+ 동일 태그 묶음)
→ 시맨틱 유사도 그룹화 (memory_search로 0.80+ 확인)

---

## Step 2: 일반화 패턴 추출 (클라이언트 — LLM)

각 클러스터의 source_memories를 읽고 일반 원칙으로 재작성:

**단계적 일반화 (sequential-thinking):**
```
mcp__sequential-thinking__sequentialthinking(thought="다음 {N}개의 구체적 경험에서 공통 원칙을 추출: {클러스터 요약}")
```
→ 구체적 경험 → 일반 원칙 변환 과정을 구조화
- **fallback:** sequential-thinking MCP 미연결 시 직접 추론

**프롬프트 전략:**
"다음 {N}개의 구체적 경험을 하나의 일반 원칙으로 요약하세요.
구체적 파일명, 코드 스니펫은 제외하고, 재사용 가능한 아이디어로 작성하세요."

**예시:**
- 3건의 gotcha "Neo4j index 문제" → 일반 패턴 "Neo4j 인덱스 생성 후 AWAIT 필수"
- 5건의 pattern "API 에러 처리" → 일반 패턴 "API 에러 3계층 처리 전략"

---

## Step 3: AskUserQuestion으로 확인

추출된 일반 패턴을 사용자에게 제시:
- 패턴 이름
- 일반화된 설명
- 원본 메모리 수 + confidence
- 승인/수정/기각 선택

---

## Step 4: KG 저장

승인된 패턴:
**MCP 도구:**
```
knowledge_store(
    type="{suggested_type}",
    title="{일반 패턴 이름}",
    content="{일반화된 설명}",
    sources=["{원본 메모리 ID 목록}"]
)
```

원본 메모리에 `distilled_to: "{KG 노드 ID}"` 관계 추가.

---

## Step 5: 결과 보고

- 분석된 메모리 총 수
- 발견된 클러스터 수
- 노이즈(미분류) 수
- KG에 저장된 노드 수
- 연결된 원본 메모리 수

---

## DBSCAN 파라미터 참고

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| eps | 0.20 | 코사인 거리 반경 (1.0 - 0.80) |
| min_samples | 3 | 클러스터 최소 멤버 수 |
| cosine_threshold | 0.80 | 유사도 기준 |

## confidence 해석 기준

| confidence | 의미 | 행동 |
|-----------|------|------|
| >= 0.4 | 높은 신뢰도 | 적극 추천 |
| 0.3-0.4 | 보통 | 추천 (확인 필요) |
| < 0.3 | 낮음 | 후보에서 제외 |

## 역할 분리

| 책임 | 수행 주체 |
|------|----------|
| 메모리 조회 + 임베딩 수집 | 서버 (MCP) |
| DBSCAN 클러스터링 | 서버 (CPU-bound) |
| confidence 계산 | 서버 |
| 클러스터 요약 | 서버 |
| **일반화 텍스트 생성** | **클라이언트 (LLM)** |
| 사용자 확인 | 클라이언트 |
| KG 저장 | 서버 (MCP) |

---

## 등급별 차이

없음 (독립 실행)

---

## 실패/fallback

- **MCP 미연결:** 파일 기반으로 일반 패턴 문서 생성 (`.ouroboros/docs/knowledge/`)
- **데이터 부족 (50건 미만):** "메모리 축적 후 재실행 권장" 안내
- **클러스터 없음 (noise만):** "일반화 가능한 패턴 미발견" 안내
