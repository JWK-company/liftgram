# Phase 2 — 분류 통합 (패턴·finder·대체운동)

## 체크리스트

- [ ] `movementPatterns.ts`: **spec 표의 패턴 컬럼 기재분만** 매핑(공란=제외 확정 · 괄호 신규 엔트리는 베이스 폴백 자동 도달 — 매핑 추가 금지, 예: 힙 쓰러스트 (덤벨)) (`@plm SRS-047`)
- [ ] `exerciseFinder.ts`: FINDER_TREE 부위 슬롯에 신규 종목 편입 — chest/flat·incline·decline·fly, back/vertical·row·deadlift, shoulders/press·lateral·front·rear, triceps, quads/squat·lunge, hamstrings, glutes, calves, abs 각 슬롯의 성격에 맞게. 슬롯 없는 부위(fullBody 등)는 기구 필터로 충분 — 미편입 (`@plm SRS-031`)
- [ ] `substitutes.seed.ts`: 신규 근력 종목마다 대체운동 3~5개(같은 패턴 우선, nameKo 실존만) (`@plm SRS-047`)
- [ ] catalogGap.test의 dangling 금지 테스트(패턴 키 시드 실존)로 자동 검증 — 통과 확인

## 주의

- finder names·substitutes 값은 전부 시드 nameKo 그대로(무결성 테스트가 검출).
- samePatternNames 후보 수 급증 — 기존 하한 assert(>=15)는 유지될 뿐 상한 없음, 문제 없음.
