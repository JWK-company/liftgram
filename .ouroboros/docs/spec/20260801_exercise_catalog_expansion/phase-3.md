# Phase 3 — 운동방법·미디어 통합 (qa 리뷰 반영판)

**매칭률 실측**: free-exercise-db 873종 대비 신규 153종 중 정확일치 ~23%(35건), 관대한 부분일치 포함 ~40% — 자체 작성 분량 **~90종+**로 재산정(스펙 초안의 60~70% 추정 폐기).

## 체크리스트

- [ ] **steps-only 렌더 경로 신설**(선행): `exerciseMedia.ts`의 s/e를 optional로 완화 + `ExerciseTipPanel.tsx` 이미지 없는 엔트리는 초기 mode='steps' 렌더(현행은 빈 이미지 박스) (`@plm SRS-032 SRS-046`)
- [ ] `scripts/gen-exercise-media.js` 신설: free-exercise-db `dist/exercises.json` 매칭(nameEn + 수동 별칭 맵) → 코드젠. 기존 129건 보존, 신규만 append. **매칭쌍 검수 표**(추정 근거 포함) 산출 (`@plm SRS-032`)
- [ ] **정확일치 외 전건 사람 검수** + negative 규칙(기구·자세 토큰 불일치 시 자동 탈락 — 예: 'Plank Push Up'≠'Push Up to Side Plank', 'Sprint'≠'Prowler Sprint')
- [ ] 한국어 스텝: 매칭 종목은 영문 번역, 무매칭 ~90종은 표준 폼 지식으로 자체 작성(시작 자세→동작→호흡→팁, 기존 '~다' 문체) — 워크플로우 에이전트 배치 + 검수
- [ ] **고위험 종목 안전 톤 가이드**: 핸드스탠드 푸시업·머슬업·드래곤 플래그·키핑 풀업·올림픽 리프팅·라잉 넥 컬 등 — 경험자 지도·점진 습득 권고 문구(단정 아닌 안내 톤)
- [ ] **카피 게이트 기계화**: catalogGap.test에 RAW_MEDIA 전 엔트리 instructionsKo/En `containsMedicalClaim === false` 테스트 신설
- [ ] 무매칭 종목 목록 파일 기록(이미지 없음 허용 — steps-only 렌더로 표시). **유산소 15종은 미디어·스텝 작성 제외**(hasTip 유산소 차단 정책 유지)

## 주의

- exerciseMedia.data.ts 헤더의 "직접 수정 금지"는 생성 스크립트 경유로 준수 형식 유지.
- 이미지 CDN = jsDelivr(free-exercise-db, Unlicense) — 기존과 동일, 신규 라이선스 리스크 없음. GymVisual(ADR-029) 범위 아님.
- 스텝 언어 톤: 기존 항목("~합니다/~한다" 혼재 — 신규는 기존 다수 문체 '~다' 준수), 팁은 "팁:" 접두.
