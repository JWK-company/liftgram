# 코드 영향 분석 — openGym 추천 1~5

> 2026-10-27 · 탐색 에이전트 조사(읽기 전용) 결과를 정리한 것. 경로는 `src/` 기준, 줄 번호는 조사 시점(HEAD 6120a30 근처) 값이라 화면 정리 작업 뒤 밀릴 수 있다. 착수 전 다시 확인한다.

## 구현 전에 알아야 할 점
- `set_logs.rpe` 칸은 이미 있다(schema.ts:136 · SetLog.ts:16 · `updateSetLog` patch workoutRepository.ts:1924). ADR-038에 따라 `rir`를 새로 둔다.
- 서버 마이그레이션 다음 번호는 **0017**(0015 비어 있음). `make gen-migration NAME=…`이 최대+1로 만든다.
- 새 로컬 테이블은 사실상 `USER_TABLES`(core/src/sync/pending.ts:9) 하나에 넣으면 백업(backup.ts:22)·대기 카운트가 따라온다. 서버 동기(sync/service.go:146)는 컬렉션 허용 목록이 없고, 계정 전환(syncOwner.ts:99)은 DB 전체를 지운다.
- DM에는 서버가 대신 보내는 함수가 없다. `dm.Service.Send`(service.go:214)는 `switch m.Kind`에 없는 종류를 거부한다.
- 앱 코드에서 Web Worker를 쓰는 곳은 없다(서비스워커만). 가져오기가 첫 사례다.
- 차트는 라이브러리 없이 **div 막대**(ui/charts.tsx `SimpleBarChart`:17·`DistributionBars`:68, ExerciseProgress.tsx:59-78). 선 그래프 없음.
- `app_prefs`는 키 50개·키 64자·**값 200자** 제한(_sanitizers.ts:79). 큰 표는 못 담는다.

## A. RIR
| 지점 | 위치 |
|---|---|
| 스키마 버전 | core/src/db/schema.ts:5 `SCHEMA_VERSION = 25` → 26 (syncEngine.ts:236이 버전 변경 시 pull 커서를 지워 처음부터 받음) |
| 마이그레이션 | core/src/db/migrations.ts:354-378(v25 형태: `addColumns`) · 새 테이블 예 v22 `createTable({name:'exercise_user_prefs'})` ~326 |
| 모델 | core/src/db/models/SetLog.ts `@field('rir')` · 새 모델은 ExerciseUserPref.ts 본뜸 · models/index.ts export·`models` 배열 |
| 세트 저장 | workoutRepository.ts:1901 `updateSetLog`(patch 타입·`s.update`) · ExerciseBlock.tsx:897 `onUpdate` |
| 세트 줄 | SetRowEdit.tsx:94 `SetRowEdit` · 한 줄 flex ~269(set-type·set-prev·set-weight·set-reps·set-done:360·set-more:~396) · 처방 줄 :413(`session.rxRir`) · `SetRow` 인터페이스 :41 |
| 완료 | SetRowEdit.tsx:383 `onToggleDone` → ExerciseBlock.tsx:441 → `repo.setSetDone`(workoutRepository.ts:1599) |
| 시트 | ui/Dialog.tsx `SheetShell`:80·`ActionSheet`:162 · 예 `SetVariantSheet`(SetRowEdit.tsx:592) |
| 설정 키 | frontend/lib/prefs.ts:12 `SYNCED_PREF_KEYS` · `setPref`:28→`writeToProfile`:67 · PrefsBridge.tsx:12·46 · 예 CalendarClient.tsx:83-103 |
| 기록 상세 | analytics/WorkoutDetailClient.tsx:399(rpe 표시) |

## B. 통계 카드
- StatsClient.tsx:72 · `Segmented`(ui/rows.tsx:138 재사용 가능) · `Period`·`PERIODS`·`SPAN`(:32-42)은 파일 내부 상수 · 데이터 `Promise.all` :91-99
- analyticsRepository.ts:38 `getCompletedSets(sinceMs?)` — **비공개**, 상한 없음, 결과에 `rir`·`done` 없음 → 확장·export 필요. `getMuscleDistribution`:154는 주근육만.

## C. 근육 지도
- `MuscleGroup` core/src/domain/types.ts:33 · `ALL_MUSCLE_GROUPS`:75 · 라벨 domain/labels.ts:69
- Exercise.ts:18-19 `primaryMuscles`/`secondaryMuscles`(JSON) · 커스텀 폼은 비면 `["other"]`(ExerciseFormClient ~102) · 피드 가져오기도 `["other"]`(WorkoutBox.tsx:126)
- 루틴 카드: RoutinesClient.tsx `TodayCard`:674 · `RecoCard`:734 · `RoutineRow`:850 · `ExerciseCount`:894(미니 그림 자리) · 종목·계획 세트 `queryRoutineExercises`(routineRepository.ts:34, `target_sets`)
- 운동 화면 머리 ActiveWorkout.tsx:275-370 · 그 아래 :372 `SessionGuideButtons`(SessionGuides.tsx:17) — '오늘 근육' 버튼 자리 · 블록 :145 `queryWorkoutExercises` · 세트 ExerciseBlock.tsx:342 `querySetLogs`(1.5초 폴링) · 세션 전체 세트 한 번에 주는 함수 없음
- 근육 필터 URL: CatalogClient.tsx:69 상태만(쿼리 안 받음) · ExercisePicker는 부위 필터 없음

## D. 체중
- 읽기 `getUserBodyweightKg()`(workoutRepository.ts:77) · `useUser().bodyweightKg`(userContext.tsx:14/58) · 쓰기 `updateUserSettings`(userRepository.ts:76)
- 프로필 입력 ProfileClient.tsx:265-276
- 시작 경로: core 공통 `startWorkoutFromRows`(workoutRepository.ts:1080) + 따로 `startBlankWorkout`(:1352) · 프론트 `useStartGuard`(useStartGuard.tsx:22, WorkoutBox·WorkoutSummary·WorkoutDetailClient) · 훅 밖: RoutinesClient.tsx:198·210, RoutineEditor.tsx:406 → **체크인은 ActiveWorkout 첫 진입에서**

## E. 요약·코치 보내기
- 가드 `assertActiveGrant(ctx, trainerID, memberID, scope)`(coaching/service.go:297) · 범위 `ScopeLogView`(:32-34)
- `GetMemberReport` service.go:316 → `repo.ListMemberRecords`(repo.go:200, queries/coaching.sql:79) → `buildReportWith`(report.go:135) · `reportCollections` report.go:28 · 감사 `audit`(service.go:453) · Action 상수 :51-56 · proto 변환 handler.go:82
- 트레이너 화면 CoachingClient.tsx `openReport`:95 · `ReportDialog`:389-462
- 서버 조립 cmd/server/main.go:260 `coaching.NewService(repo, uuid, time.Now)` — DM 의존 없음(주입 필요)
- DM: dm.proto:26 MessageKind · Go `KindText/KindImage`(dm/service.go ~35) · `messages.kind` text·CHECK 없음(0008:42) · `GetOrCreateDirect` service.go:125 · proto 변환 dm/handler.go:235/243 · 말풍선 ConversationClient.tsx:340 · 목록 미리보기 ConversationsClient.tsx:112 · 인증 게이트 auth/verified_gate.go:29
- 알림 `notification.Service.Notify`(service.go:60) Kind=follow·like·comment · 화면 NotificationsClient.tsx:22 · DM은 알림 안 만듦
- 생성: `make proto`(buf) · `make sqlc` · `make proto-check` · core 테스트는 `core/src/domain/__tests__`만 돈다(`bun run test:core`)

## F. CSV 가져오기
- `markLocalWins(raw, columns)` localWins.ts:9 · 사용 예 exercisePrefs.ts:50-55
- batch 예: `startWorkoutFromRows` :1160-1226 · finishRoutine.ts:271 · 대량 `prepareCreateFromDirtyRaw` backup.ts:102
- flush: frontend/lib/localDb.ts `flushLocalDb`:36 · `scheduleFlush`:76 · `navigateAfterFlush`:90
- 검색: `buildExerciseSearchIndex`(exerciseSearch.ts:99) · `searchExercises`(:167, matchedKind name|alias|nameEn) · 정확 일치 `resolveSharedExercise`(:239) · 참고 WorkoutBox.tsx:74-137
- 커스텀 종목 `createCustomExercise`(exerciseRepository.ts:87) — id 자동 → 결정적 id 인자 필요
- 백업 UI: frontend/app/components/sync/BackupCard.tsx(AuthClient.tsx:226·404 배치) · 파일 처리 frontend/lib/backupFile.ts
- 웰니스 게이트: core/src/domain/__tests__/guideCopy.test.ts `PREFIXES`:9
- e2e: 공용 헬퍼는 e2e/helpers/block.ts 하나, 로그인·시작은 spec마다 로컬 함수(workout.spec.ts:15 등) · playwright는 떠 있는 앱에 붙음 · `RATE_LIMIT=2000`·`AUTH_RATE_LIMIT=0`
