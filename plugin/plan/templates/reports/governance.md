# 거버넌스(governance) 보고서 가이드 — 기획 현황·게이트·추적성

> 용도: 이해관계자·승인권자에게 프로젝트 기획 건강 상태를 보고. 데이터는 전부 PLM·Ouroboros에서 수집(추측 0). `_COMMON.md` 선행.

## 데이터 수집 (사실 기반 — 하드코딩 금지)
- 바인딩: `.ouroboros/config/plm.json`(api_url·project) · 토큰: `.ouroboros/env/.env` PLM_API_TOKEN. HTTP는 user-agent 명시.
- `/export?project=` 전 아티팩트+관계 → 타입별 active(비-Replaced) 집계.
- `/gates` G1/G2/G3 orphan · `/review-queue` 승인 대기.
- 추적성: owner 관계 역산 → URS×SRS×SAD×Code 커버리지 매트릭스. `code_refs` 유무로 구현 연결률.
- Ouroboros `memory_search`(decision·gotcha) — "왜 이렇게 결정됐나" 근거를 ADR과 교차 인용.
- **수집 검증**: 로컬 문서 수 == PLM active 수(드리프트 0) 확인, 불일치 시 보고서 상단 경고.

## 섹션 구성
1. **Executive Summary** — 1화면: 건강 한 줄 평가 + KPI 카드(요구 수·커버리지%·게이트·orphan·승인 대기) + 신호등.
2. **요구 완전성** — URS→UCS→SRS 계층, 고아 요구 목록.
3. **추적성 매트릭스** — 연결=●/미연결=○, 끊긴 사슬 강조, 양방향.
4. **게이트 현황** — G1/G2/G3 통과율 바, orphan·재검토 큐 목록.
5. **의사결정 로그** — ADR 결정·근거·supersedes 체인(Replaced 이력 포함).
6. **로드맵·진행** — RM이 커버하는 요구·진행·리스크.
7. **리스크 & 권고** — 우선순위화된 액션 리스트(누가·무엇을).
8. **부록** — 데이터 출처·집계 기준·생성 일시·검증 로그(C1~C3).

## 주의
- 모든 숫자는 수집 데이터에서 산출 — 표와 차트의 수치 일치를 C1에서 재계산 검증.
- PLM 미도달 시 그 사실을 명시하고 부분 보고서로 표기(조용한 생략 금지).
