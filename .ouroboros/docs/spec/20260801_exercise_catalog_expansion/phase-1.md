# Phase 1 — 시드 확장 + 변형 축 band + 무결성 기반 (qa 리뷰 반영판)

## 체크리스트

- [ ] **무결성 테스트 선행 작성**(qa 리뷰 — 시드 추가 전에 먼저): catalogGap.test에
  - 슬러그 유일성: 전체 nameEn → `seed-<slug>` 소문자-슬러그 유일(기존↔신규 완전 충돌 포함 — '파워 클린' 사례)
  - nameKo 유일성(Set 크기 = 배열 길이)
  - SUBSTITUTES **키·값** 전건 ⊆ 시드 nameKo
  - FINDER_TREE 전 슬롯 names ⊆ 시드(베이스 폴백 허용)
  - RAW_MEDIA 키 ⊆ 시드(베이스 폴백 허용)
  - IMPLEMENT_KEYS 전건이 IMPLEMENT_LABELS에 존재
  - 시드 총수 하한(>=336) + 유산소 15종 kind==='cardio'
- [ ] **substitutes.seed 죽은 키 정리**(실측: 죽은 키 14·죽은 값 65 — '런지'·'인클라인 프레스'·'프리처 컬' 등 베이스명 잔존으로 현재도 침묵 드롭): 현행 시드명으로 치환 → 위 테스트 통과
- [ ] `variants.ts`: IMPLEMENT_KEYS에 'band' + IMPLEMENT_LABELS `{ko:'밴드', en:'Band'}` (`@plm SRS-028`)
- [ ] `exercises.seed.ts`: spec.md 신규 표 전건(**153**) 추가 — 부위 섹션 주석 유지, 표의 primary/secondary/equipment/kind/loadMode 준수 (`@plm SRS-001 SRS-047`)
- [ ] 시드·러너 헤더 주석 정정: 'nameKo 기준' → 'nameEn(안정 키) 기준 top-up' + 넥 제외 주석(230행)을 'other로 편입 확정' 결정으로 갱신
- [ ] `npm run typecheck` + `npm test` 통과

## 주의

- 기존 엔트리 순서·표기·nameEn 절대 불변(diff는 추가 블록+주석 정정만).
- 라잉 넥 컬/익스텐션: equipment bodyweight → loadMode 자동 파생(명시 불요 — resolveLoadMode 확인 완료).
- 유산소 15종 필드는 spec.md 유산소 표가 정본.
