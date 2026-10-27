<!-- 2026-10-27 작업 폴더 정리 사고로 원본이 지워졌고 실행 기록에도 본문이 없어, 에이전트가 보낸 최종 요약으로 다시 쓴 사본 -->
# P1 화면 밖 구현 보고 — 로컬 스키마 v26·다운그레이드 가드·힘든 정도 계산

- 커밋: fcf6261(이후 rebase로 7cbe80a) · 고친 파일 27개(경로 지정 add) · push·merge·배포 없음
- 원래 폴더 src·기획 문서·backend/proto/database·화면 컴포넌트는 건드리지 않음(예외: 새 `SchemaGuard.tsx` + 루트 레이아웃 한 줄)

## 한 일
- **스키마 v26**: 칸 4개(`set_logs.rir`·`workouts.source`·`workouts.import_batch_id`·`exercises.import_batch_id`) + 새 표 3개(`bodyweight_logs`·`import_batches`·`import_aliases`), 전부 optional · 새 모델 3 · 기존 모델 3에 필드 · `USER_TABLES` 반영 · 옛 행 null 의미 주석
- **세트 저장**: `updateSetLog`·`LoggedSet`·`toLoggedSet`·기록 상세 세트에 `rir`
- **`getCompletedSets`**: export + `endMs` + rir·rpe·done·워밍업·setType 바깥 칸(기존 호출자 5곳 결과 불변 — `endMs` 없으면 질의도 같음)
- **`domain/effort.ts`**: `rirFromRpe`·`effectiveRir`·`summarizeEffort` + 경계 테스트(뉴욕 시간대 통과)
- **다운그레이드 가드**: DB 열기 전 `liftgram.maxSchemaSeen` 검사·기록 → 막히면 진짜 DB(`repset`) 대신 버리는 빈 DB를 열고, 동기를 멈추고, 「새로고침」 화면으로 덮음 · 마이그레이션 뒤 `liftgram-pages-*` 캐시 삭제(→ /qa code CD-3에서 「지우지 않고 온라인일 때 셸 덮어쓰기」로 바뀜) · 배포 스크립트는 서버 배포본보다 `SCHEMA_VERSION`이 낮으면 중단

## 검증
- `bun run test:core` 319 통과(새 22) · tsc core·frontend 0 · biome(frontend 3파일) · `make core-check`·`check-docs` 통과
- 3300 브라우저: 첫 부팅 `maxSchemaSeen`=26 기록 → 27로 바꾸고 새로고침하니 가드 화면, `repset` 열리지 않음
- 돌리지 않은 것: `make verify` 전체·e2e·Go 테스트

## 스펙과 다르게 한 것
- 페이지 캐시를 「옛 세대」만이 아니라 전부 지움(창에서 새 세대를 알 수 없음) — 이후 CD-3로 재수정
- skip-waiting 새로 만들지 않음(기존 `ServiceWorker.tsx`가 운동 중 아닐 때 보냄)
- `getCompletedSets`의 rir는 `set` 안이 아니라 바깥 칸
- 분포 칸은 올림(0.5→「1」, 3.5→「4+」) — 이후 CU-3에서 칸 이름을 범위로 바꿈
- 상수 이름 `EFFORT_RIR_*`(처방 `RIR_MIN/MAX`와 겹침 회피)

## 함정
- 가드는 v26 번들부터만 효과 — 이번 배포에서 실제로 막는 것은 캐시 정리와 배포 스크립트 하강 차단
- DB는 모듈을 처음 불러올 때 열리므로 가드는 `buildAdapter()` 안에서 동기로 돌아야 「열기 전」이 보장됨

## 넘긴 일
- B(backend): `report.go`·`migrate-records.ts`에 새 표를 넣지 않음을 주석+테스트로 · D-17 회귀 · sync 컬렉션 허용 목록 확인
- 화면 단계: RIR 칩·RirSheet·「≈RIR n」·EffortCard·ExerciseProgress·`effort.*` 문구·e2e(v25→v26·가드·캐시)·가드 화면 점검
