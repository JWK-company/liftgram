# Task Spec — 근육 지도 실제 근육 그림·주황 농도·오픈소스 고지 (SRS-090 · ADR-044)

> 등급 Task · 작업 위치 `../liftgram-wt-musclemap`(feat/musclemap-real · 웹 3300) — 옆 세션(기록 보호 2차 · wt-safety)과 파일 분리.
> 사용자 지시(2026-10-28): openGym 대조 후 「1번만 진행」 = 근육 지도 MuscleMap 교체 + 고지. 운동 사진·썸네일은 범위 밖.

## 결정
- 그림: MuscleMap(Melih Colpan · MIT) 남성 앞·뒤 Swift 경로 → `scripts/gen-body-map-paths.mjs` 가 직접 변환(openGym AGPL 변환본 미사용) → `ui/bodyMapPaths.ts`(생성물 · gzip 약 19KB).
- 대응: chest · upperBack/lowerBack/rotatorCuff→back · deltoids→shoulders · biceps · triceps · forearm→forearms · quadriceps→quads · hamstring→hamstrings · gluteal→glutes · calves · abs/obliques→abs · trapezius→traps. 세부 구역 11개(윗·아랫가슴 등)는 버림. 머리·목·손·발·무릎·발목·정강이·내전근·고관절굴곡근 = 회색 바탕(전거근은 원본이 복근 옆구리와 같은 경로라 버림 · QA L-1), 머리카락 = ink3.
- 색: 0 = line 회색 · 1/2/3 = brandVivid 불투명도 45/75/100% + brand 윤곽선 0.75 · 선택 = ink. (color-mix 안·brand 3단계 안은 다크에서 2·3단계가 뒤집혀 기각 — 실측)
- 고지: `/licenses`(LegalPage) — MuscleMap MIT 전문 + free-exercise-db(Unlicense) 표기 · 프로필 아래 약관 링크 줄에 「오픈소스 고지」(ProfileClient 3줄 — 옆 세션 P3 영역과 다른 hunk).
- 보존: 옛 실루엣 FRONT/BACK·zoneStyle·Body 는 남기고 호출부만 주석(코드 보존 규칙). `tone` prop 은 호환용으로 받기만.

## 수정 파일
`frontend/app/components/ui/BodyMap.tsx` · `ui/bodyMapPaths.ts`(신규 · 생성물) · `scripts/gen-body-map-paths.mjs`(신규) · `app/licenses/page.tsx`(신규) · `profile/ProfileClient.tsx`(링크) · `e2e/opengym-muscle.spec.ts`(대비 규칙 갱신 + 고지 테스트).
부르는 쪽 4곳(MuscleBalanceCard · TodayMuscleSheet · SummaryView · RoutineMuscleMini)은 API 불변이라 무변경.

## 검증
- tsc 0 · biome 통과 · `e2e/opengym-muscle.spec.ts` 5 통과(1 조건부 skip) — 대비 실측(라이트 카드 mini: 칠 2.79 → 윤곽선 4.68 로 3:1 확보 · 다크 칠3 4.5).
- 라이트·다크 화면 캡처 육안 확인(통계·오늘 카드·시트).
