<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P5 화면 밖 — 결과 보고 (2026-10-27)

## 커밋
- `7c32040` feat(opengym): P5 화면 밖 — 동기 나눠 보내기·Strong/Hevy CSV 파싱·가져오기 계획·묶음 쓰기/되돌리기(미배포) · 브랜치 feat/opengym-recs · push·merge·배포 안 함
- 경로를 지정해 add 함. `lefthook.yml`·`.ouroboros-work/` 는 넣지 않음. 다른 에이전트 파일(periodSummary 등)·i18n·화면 컴포넌트·backend 는 건드리지 않음.

## 파일 (27개)
- 새 core 순수: `domain/import/{hash,csv,common,parse,match,plan,index}.ts` · `domain/import/formats/{strong,hevy}.ts` · `sync/pushChunks.ts`
- 새 data: `data/importRepository.ts`
- 고친 파일: `data/exerciseRepository.ts`(prepareCustomExercise + createCustomExercise 가 그것을 감쌈 · 옛 본체는 `createCustomExerciseV1` 로 남김) · `sync/syncEngine.ts`(pauseSync·isSyncPaused·isSyncLoggedIn · syncWithServer 미루기) · `migrations/runner.ts`(부팅 단계 `importCleanup`) · `frontend/lib/syncTransport.ts`(push 나눠 보내기)
- 테스트: `domain/__tests__/{importHash,importParse,importMatch,importPlan,pushChunks}.test.ts` + `fixtures/import/{strong-comma,strong-semicolon,hevy-kg,hevy-lb,broken,empty}.csv`·`generateLarge.ts`(값은 전부 지어낸 것)

## 검증
- `bun run test:core` **407/407** 통과(새 테스트 38). `TZ=America/New_York` 에서도 407 통과. importPlan 은 `TZ=Asia/Seoul`·`TZ=America/New_York` 둘 다 통과.
- `npx tsc --noEmit -p core` · `-p frontend` 오류 0 · `bunx biome check frontend/lib/syncTransport.ts` 깨끗 · core 새 파일은 scratchpad 임시 설정으로 lint 함: 깨끗(경고 1건 `exerciseRepository.ts:6` useImportType 은 원래 있던 것) · `make core-check` 통과.
- `make docs-check`: 드리프트 1건이 남아 있음. **이번 변경과 상관없음.** `backend/internal/coaching/summary_pg_test.go`·`backend/internal/sync/merge_test.go` 의 process env 읽기(P4 쪽)가 원인. 내 TZ 테스트는 env 를 쓰지 않게 고쳐서 목록에서 뺐다.
- **1만 세트 시간(Node 22, 데스크톱)**: 파싱 41.8ms · 계획 19.3ms · 16000행. 임시 실험(LokiJS 메모리 어댑터 + 데코레이터 없는 모델, 커밋 안 함): 2000행씩 8번 write 합계 219ms · 가장 긴 묶음 33ms. IndexedDB 저장·구독 쿼리·폰 CPU 는 빠진 숫자다 → 화면 단계에서 chrome-devtools 4×·6× 로 다시 잰다.
- 같은 실험에서 확인함: 삭제 표시가 남은 id 로 다시 만들면 Loki 가 `Duplicate key for property id` 로 거부한다(D-3 실재). created 행을 destroyPermanently 하면 삭제 표시가 남지 않는다.
- 실행 안 함: e2e·브라우저(화면 단계) · Go 테스트 · importRepository 의 실제 Watermelon 경로(node 에서 데코레이터 모델 불가). 판정부는 순수 함수로 고정했다.

## 스펙과 다르게 한 것과 이유
1. **rir 은 null 로 저장한다**(스펙은 「rpe 원본 + rir 환산」). rir 칸의 뜻은 「사람이 적은 RIR」이다(SetLog 주석, ADR-038). `effectiveRir` 이 읽을 때 rpe 로 환산하고, `isRirConverted` 가 「≈RIR」 표시를 맡는다. 환산값을 저장하면 이 표시가 사라진다.
2. **변형 칸**: SAD-025 는 「괄호 기구(Barbell…)를 변형 칸에」라고 쓰지만 ADR-034 에서 기구 칸이 폐지됐다(normalizeVariantDimsV34 가 지운다). 그래서 괄호 기구는 **종목 고르기 단서로만** 쓴다. 「Barbell Bench Press」 정확 일치, 또는 괄호 앞 이름 일치 + 기구 같음일 때 자동으로 맞춘다. 칸에는 케이블 부착물(rope 등)만 넣고, 그것도 family 허용 목록 안에 있을 때만 넣는다. 목록을 모르면 칸을 비운다.
3. **별칭은 `remember:true`(사람이 고르거나 확인함)와 커스텀 종목만 남긴다.** 자동 정확 일치까지 별칭으로 남기면 기계가 정한 값에 markLocalWins 가 걸린다(ADR-042 개정: 지키는 것은 사람이 고른 값뿐).
4. **되돌리기·정리의 삭제 방식**: 서버에 간 적 없는 created 행은 destroyPermanently 한다(삭제 표시가 남으면 재가져오기가 막힌다 · D-3). 부팅 정리는 언제나 이 방식이다(쓰는 동안 동기가 멈춰 있었다). 되돌리기는 **로그인 기기면 created 여도 삭제 표시**를 남긴다(나눠 보내기가 중간에 실패해 이미 서버에 간 행일 수 있다). 로그아웃 기기만 영구 삭제한다.
5. **쓸 것이 하나도 없으면 묶음 행을 남기지 않는다**(재실행이 전부 건너뜀일 때 「가져오기 기록」에 0건 묶음이 쌓이지 않게). 이때 `batchId: null` 이다.
6. **쓰다가 실패하면 그 자리에서 정리를 먼저 시도한다.** 정리도 실패하면 `write_failed_reload` 를 내고 **이번 실행 동안 동기를 멈춘 채 둔다.** 반쯤 쓴 행이 서버로 가면 부팅 정리가 로컬만 지워 기기 사이가 갈린다.
7. **가져오기 전 동기를 importPlan 안에서 한다**(로그인 ∧ 온라인일 때). 실패하면 `sync_failed`. 화면이 미리 보여 주는 판정은 `checkImportReadiness` 다.
8. 같은 시각의 운동이 두 번 나오면 첫 번째는 순번 없이 `sha16(시각)`, 두 번째부터 `#n`(n≥2) 이다. 시각은 늘 초까지 맞춘다(`:00` 보충) — 같은 운동을 ISO 로 내보내든 「25 Aug 2026, 10:10」 로 내보내든 같은 id 가 나온다.
9. 해시는 **순수 JS SHA-256 하나만** 쓴다(동기 함수). crypto.subtle 은 비동기이고 보안 컨텍스트가 아니면 없다. 그래서 대체 구현을 두지 않고, 테스트로 node:crypto·webcrypto.subtle·TextEncoder 와 같은 결과임을 고정했다.
10. Strong 쉼표 파일의 거리 단위는 파일에 없어서 무게 단위 선택을 따른다(kg→km, lb→마일). Strong 「Rest Timer」 행은 오류가 아니라 건너뛴다. 소수 쉼표 `140,5` 를 읽는다. 대가: 쉼표 파일 따옴표 안의 `1,000` 은 1.0 으로 읽힌다(드묾).
11. 가져온 운동의 `user_id` 는 null 이다(앱의 다른 운동 생성과 같다). `getOrCreateLocalUser` 는 write 밖에서 확보만 한다.
12. 시험 파일 `strong-semicolon.csv` 는 CRLF 로 만들었지만 git 이 LF 로 바꿔 저장한다(autocrlf). CRLF·옛 맥 CR 는 csv 단위 테스트가 문자열로 따로 고정한다.

## 발견한 함정
- docs-check 는 core 테스트의 `process.env` 도 「스키마 밖 설정 읽기」로 센다. 시간대 테스트는 오프셋 인자 + 외부 `TZ=` 실행으로 한다.
- `normalizeNameKey` 가 괄호를 지운다. 그래서 `Bench Press (Barbell)` 와 `bench press barbell` 은 같은 별칭·커스텀 id 다(의도). 다른 기구는 다른 id 다.
- 카탈로그에는 영문 「Bench Press」 정확 일치가 없다(「Barbell Bench Press」·별칭 「flat bench press」). 기구 낱말 + 이름 조합 검색이 없으면 Strong 의 대표 종목이 전부 「확인 필요」로 떨어진다.
- LokiJS 삭제 표시 id 재생성은 Duplicate key 로 실패한다(실험으로 확인). 쓰기 안에서 getDeletedRecords 를 다시 보는 판정이 필수다.
- Watermelon `prepareCreateFromDirtyRaw` 는 `_changed=''` 인 created 행을 만든다 → 원격 우선(ADR-042 개정 의도와 맞다). 사람이 고른 칸만 `markLocalWins` 로 표시한다.

## 화면 단계 시그니처
```ts
// 순수 — '@app/core/domain/import'(index.ts 배럴) · Worker 에서도 그대로
parseImportFile(text): ParseResult       // fatal: 'empty'|'unknown_format'|'missing_columns' · issues[{line, reason, column?}]
distinctExerciseNames(parsed): string[]
importFileLabel(fileName): string         // 확장자 뺀 40자 — 원래 이름은 화면 상태에만
matchExerciseNames(source, names, { index: buildExerciseSearchIndex(ctx.exercises), aliases: new Map(Object.entries(ctx.aliases)),
  attachmentsFor: (id) => ctx.attachments[id] }): ExerciseMatch[]   // status auto|review|none · candidates ≤3 · equipmentHint · variant
buildImportPlan({ parsed, weightUnit?, decisions: Map<name, ExerciseDecision>, exerciseInfo: Map(Object.entries(ctx.exerciseInfo)),
  bodyweightKg: ctx.bodyweightKg, existingAliases?, existingIds: new Set(ctx.takenWorkoutIds), fileLabel, now }): ImportPlan
  // ExerciseDecision = {kind:'existing', exerciseId, variant?, remember?} | {kind:'custom', nameKo?, equipment?, primaryMuscles?} | {kind:'skip'}
  // throws ImportPlanError('unit_required'|'unreadable') — 쉼표 Strong 은 weightUnit 필수
  // plan.stats{workouts, workoutExercises, sets, totalVolumeKg, rows, skippedExerciseNames} · plan.skipped · plan.issues
sha16(s) · sha256Hex(s)                   // 맞추기 결정 sessionStorage 키(파일 해시)에 sha16(text) 쓰면 된다
// 표본 한 줄 「벤치프레스 100 × 5」: parsed.workouts[0].exercises[0].sets 에서 화면이 만든다(무게는 원본 숫자 + 고른 단위)

// data — '@app/core/data/importRepository'
checkImportReadiness({ online }): Promise<{ ok, reason: 'active_workout'|'offline_with_undone'|'import_in_progress'|null, needsSync, loggedIn }>
loadImportContext(): Promise<ImportContext>   // exercises·exerciseInfo·attachments·aliases·bodyweightKg·takenWorkoutIds (직렬화 가능 → Worker)
importPlan(plan, onProgress?, { online?, flush?: flushLocalDb, faultInjection?: { throwAfterChunk } }): Promise<ImportResult>
  // onProgress({phase:'sync'|'writing'|'finishing', chunk, chunks, workoutsDone, workoutsTotal})
  // throws ImportBlockedError(reason: active_workout|offline_with_undone|import_in_progress|sync_failed|write_failed|write_failed_reload)
  // 안에서: 조건 → (로그인∧온라인) 동기 → 프로필 확보 → pauseSync → 묶음 쓰기 → flush → 재개 + scheduleSync(0)
previewUndoImportBatch(id): Promise<UndoPreview|null>   // workouts·sets·userEditedSets·customExercises{remove,keep}·aliasesToRemove
undoImportBatch(id, { confirmUserEdited?, flush? }): Promise<{status:'needs_confirm'|'undone', preview}>
listImportBatches(): Promise<ImportBatchSummary[]> · queryImportBatches()   // 「가져오기 기록」 observe
cleanupUnfinishedImports()                // 부팅 파이프라인이 이미 부른다
// sync — '@app/core/sync/syncEngine'
pauseSync(): Promise<release> · isSyncPaused() · isSyncLoggedIn()
// data — exerciseRepository
prepareCustomExercise(input, { id?, importBatchId? }): Exercise   // write·batch 안에서
```
- 화면은 `importPlan`·`undoImportBatch` 에 `flush: flushLocalDb` 를 꼭 넘긴다. 그래야 「완료」 전에 디스크까지 내려쓴다(D-11).
- 피드·스토리·PR 폭죽·완료 요약은 importRepository 가 부르지 않는다(finishWorkout 경로를 쓰지 않음). e2e 로 「피드에 없음」을 확인한다.
- 커스텀 종목은 근육 미지정(`primaryMuscles: []`)이 기본이다. 기구는 결정 → 괄호 단서 → 'other' 순서로 정한다.

## 필요한 i18n 키(`import.*` · 끝 구역 — 안 넣음)
- 입구·기록: `import.entry` 「다른 앱 기록 가져오기」 · `import.history` 「가져오기 기록」 · `import.historyRow`({source, label, workouts, sets, date}) · `import.undone` · `import.undo` · `import.undoConfirm`({workouts, sets}) · `import.undoEditedWarn`({count}) · `import.undoKeepsExercises`({count})
- 단계: `import.stepFile` · `import.stepSummary` · `import.stepMatch` · `import.stepProgress` · `import.stepDone` · `import.unitAsk` · `import.sample`({exercise, weight, reps}) · `import.match.auto` · `import.match.review` · `import.match.none` · `import.match.createMine` · `import.match.pick` · `import.leaveConfirm` 「고른 내용이 사라져요」 · `import.progress.sync` · `import.progress.writing`({done, total}) · `import.doneUploading` 「서버로 올리는 중」 · `import.summary`({workouts, sets}) · `import.skipped`({count})
- 막힘: `import.blocked.active_workout` · `import.blocked.offline_with_undone` 「온라인에서 다시 시도」 · `import.blocked.import_in_progress` · `import.blocked.sync_failed` · `import.blocked.write_failed` · `import.blocked.write_failed_reload`
- 파일 오류: `import.fatal.empty` · `import.fatal.unknown_format` · `import.fatal.missing_columns`({columns}) · `import.issue.{column_count,bad_date,bad_number,bad_set_order,missing_exercise_name,unterminated_quote}`({line, column}) · 건너뜀 이유 `import.skip.{exists,deleted_pending,custom_unavailable,no_exercises}`
- 웰니스 게이트 PREFIXES 에 `import.` 를 넣을지는 화면 단계에서 정한다(권고 문구가 없으면 필요 없음).

## Go 쪽에 남길 일(건드리지 않음)
- `backend/internal/sync/service_test.go` 에 **나눠 보내기 멱등 성질**을 주석 + 테스트로 고정한다. 같은 레코드 묶음을 ① 한 번에 ② 2000건씩 나눠 ③ 중간 묶음 실패 뒤 전체 재전송으로 보냈을 때 sync_records 결과(행·payload·deleted)가 같아야 한다. `maxRecordsPerPush` 주석(service.go:45)의 「클라이언트가 알아서 나눈다」는 이제 사실이 됐다 — `frontend/lib/syncTransport.ts` · `core/sync/pushChunks.ts` 를 가리키게 한다.
- 「삭제 표시 뒤 같은 id upsert → deleted=false 로 되살아남」(P23 보고)은 다른 기기 재가져오기(D-2)가 기대는 성질이다 — 같은 테스트 파일에 고정한다.
- D-17: v25 기기가 같은 세트를 고쳐 올려도 `source`·`import_batch_id` 가 얕은 병합으로 남는지(P1 보고와 같은 항목).
- docs-check 드리프트: `coaching/summary_pg_test.go`·`sync/merge_test.go` 의 env 읽기(P4 쪽 정리 필요).

## 화면·e2e 단계 할 일
- `lib/importWorker.ts`(blob Worker: parseImportFile → matchExerciseNames → buildImportPlan, 실패 시 메인에서 같은 함수) · ImportCard · `/account/import`
- e2e 실패 주입: `importPlan(plan, p, { faultInjection: { throwAfterChunk: 2 } })` → `write_failed` 이고 남은 행이 0. 새로고침 경로는 쓰는 도중 reload → 부팅 정리 뒤 0.
- 백업 가져오기 회귀(D-1): 단위 테스트는 같은 나눠 보내기 경로(여러 표·삭제만)로 고정했다. 실제 「백업 가져오기 → 동기 성공」은 e2e 로 본다.
- 성능 측정(3300, CPU 4×·6×, 360×640): write 총 시간·최장 long task·flush·첫 push(8번 나눠 보냄)·다른 기기 pull.
