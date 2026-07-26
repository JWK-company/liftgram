# SRS-047 카탈로그 갭 이관 + 콘셉트 루틴 — 구현 스펙

- 등급: Feature · 근거: SRS-047(Approved)·SAD-021 ④·BS-004 C1·C2
- 갭 소스: RapidOverload 전 화면 실탐색(2026-07-26)에서 관찰한 종목 목록 vs SEED_EXERCISES 대조.

## 1. 시드 갭 추가 (exercises.seed.ts — 멱등 top-up·규약 엄수)
- nameKo=조회 KEY(기존 rename 0건), 기구 변형=별도 엔트리(paren형 novel nameEn — id 충돌 회피 선례).
- 추가(가슴 프레스 세분): 해머스트렝스 체스트 프레스·디클라인 체스트 프레스 머신·라잉 체스트 프레스 머신·컨버징 체스트 프레스 머신·원암 체스트 프레스 머신·시티드/스탠딩/라잉 케이블 체스트 프레스·라슨 프레스·피트 업 벤치프레스·디클라인 프레스 (스미스)·와이드 그립 푸시업·데피싯 푸시업
- 추가(등·복근): 체스트 서포티드 티바 로우·체스트 서포티드 로우 (덤벨)·싯업
- **제외·문서화**: 넥 컬/넥 익스텐션 — MuscleGroup에 'neck' 없음(타입·라벨 확장은 별도 결정 필요, 침묵 탈락 아님을 스펙에 명기).

## 2. 무브먼트 패턴 (domain/movementPatterns.ts — 신규)
- **SAD-021 편차(qa 결정)**: DB 컬럼 신설 대신 **도메인 정적 매핑**(nameKo→pattern) — exerciseMedia 선례(런타임 의존 0·마이그레이션 불필요·커스텀 종목은 null). SAD 갱신은 BP 갱신 시 반영.
- Pattern: horizontalPress·verticalPress·horizontalPull·verticalPull·squat·hinge·lungeStep·fly·lateralRaise·curl·extension·carry·core·calf.
- `movementPatternOf(nameKo)` (괄호 기구 토큰 제거 폴백 — media와 동일 규칙) · `samePatternNames(pattern)`.
- 테스트: 매핑 키 전부 시드에 실존(무결성) · 폴백 · 대표 패턴 조회.

## 3. 콘셉트 루틴 (domain/conceptRoutines.ts — 신규 + 루틴 탭 UI)
- 데이터: 3콘셉트(패션근육 미니멀·파워빌딩·순수 근비대) — id·이름/스토리(ko·en)·days[{name, exercises: nameKo[]}].
- 테스트: 콘셉트 종목 전부 시드 실존(무결성).
- UI(WorkoutTabScreen): "콘셉트 루틴" 섹션 — 카드(이름+한줄) 탭→모달(스토리+Day별 구성 미리보기+「내 루틴에 저장」=Day별 importRoutine). 저장만(바로 시작 없음 — 기존 루틴 흐름 재사용).

## 4. 검증
- typecheck·test(신규 2 테스트 파일) — 기존 finder·substitutes 회귀 없음(추가만·rename 0).
- qa c1 자체지적 반영: 넥 종목 침묵 탈락 금지(문서화) · 콘셉트 저장은 중복 생성 방지(같은 이름 존재 시 확인).
