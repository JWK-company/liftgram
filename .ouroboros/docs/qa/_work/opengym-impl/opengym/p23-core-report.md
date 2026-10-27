<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P2·P3 화면 밖 — 결과 보고 (2026-10-27)

## 커밋
- `b9af1c4` feat(opengym): P2·P3 화면 밖 — 근육 집계·체중 이력·미러 정리(미배포) · 브랜치 feat/opengym-recs · push·merge·배포 안 함
- backend·proto·database·화면 컴포넌트는 건드리지 않음. 경로를 지정해 add 함(`lefthook.yml`·`.ouroboros-work/` 는 커밋에 넣지 않음).

## 파일 (13개)
- 새 파일: core/src/domain/{muscleLoad,bodyweight}.ts · core/src/data/{muscleLoadRepository,bodyweightRepository}.ts · domain/__tests__/{muscleLoad,bodyweight}.test.ts
- 고친 파일: domain/index.ts(export 2줄) · sync/syncEngine.ts(동기 뒤 정리 + `isLocalPullComplete`) · sync/backup.ts(가져오기 뒤 정리) · migrations/runner.ts(부팅 단계 `bodyweightMirror`) · i18n ko/en(끝 구역) · guideCopy.test.ts PREFIXES(`muscleMap.`·`bodyweight.`)

## 검증
- `bun run test:core` **359/359** 통과(새 테스트 40개: muscleLoad 14 · bodyweight 26). TZ=America/New_York 에서도 359 통과. bodyweight 는 TZ=Asia/Kolkata 에서도 통과.
- `npx tsc --noEmit -p core` · `-p frontend` 오류 0 · `make core-check` 통과
- biome: core 는 biome.json 범위 밖이라 그대로 돌리면 「처리한 파일 0」이다. scratchpad 임시 설정(includes `**`, 포맷 끔)으로 lint 함 → 새 파일 6개 깨끗함. `sync/backup.ts:86` 의 `noAssignInExpressions` 는 원래 있던 코드이고 이번 변경과 상관없다.
- 실행 안 함: e2e·브라우저(화면 단계 몫) · Go 테스트

## 스펙과 다르게 한 것과 이유
1. **옛 경로 흡수 조건을 하나 더 걸었다.** 스펙 조건 「프로필 updated_at > 최신 이력 updated_at ∧ 값 다름」에 **「그 값이 어느 이력 값과도 다름」** 을 더했다. 이유: 최신 이력을 아직 받지 못한 기기가 다른 설정(알림음 등)을 바꾸면 프로필 행 전체가 올라간다. 이때 낡은 bodyweight_kg 도 같이 올라가고 updated_at 은 최신이 된다. 스펙 조건만으로는 이 경우를 옛 경로 수정과 구분할 수 없어서, 낡은 값이 「최신 측정」으로 흡수된다. 대가: v25 화면에서 예전에 기록한 적 있는 값과 똑같은 값으로 고치면 흡수되지 않는다. 그 경우 미러는 최신 이력 값으로 돌아간다(드물다).
2. **legacy 줄도 결정적 id 를 쓴다**: `bw-legacy-<profileId>-<프로필 updated_at>`. 같은 수정을 본 기기 여럿이 각자 줄을 만들어 중복되는 것을 막는다. 같은 id 가 지운 표시로 남아 있으면 심지 않는다. bw-init id 가 막혔을 때도 legacy id 로 넘어간다.
3. **v26 첫 동기 전에는 정리를 건너뛴다**(`isLocalPullComplete()`). 옛 스키마로만 동기한 기기는 아직 서버의 이력을 받지 못했다. 이 상태에서 부팅 정리가 bw-init 을 심으면 서버에 이미 있는 이력과 중복된다. 미러를 덮으면 흡수해야 할 옛 경로 값도 사라진다. 판정 기준은 이렇다. 지금 스키마로 동기에 성공한 적 있음 → 정리함. 동기 흔적이 전혀 없음(로그인 안 한 기기) → 정리함. 옛 스키마로만 동기함 → 건너뜀. 동기 뒤 정리는 `SYNCED_SCHEMA_KEY` 를 쓴 다음에 돌기 때문에 첫 v26 동기 직후에 바로 처리된다.
4. **부팅 파이프라인(runner.ts)에도 정리 단계를 넣었다.** 로그인하지 않은 기기는 동기를 하지 않아서 이 단계가 없으면 bw-init 이 영영 생기지 않는다. 스펙의 「첫 v26 부팅(또는 첫 정리)」에 해당한다.
5. **정리는 프로필을 만들지 않는다.** `getOrCreateLocalUser` 를 부르지 않고 가장 오래된 프로필을 조회만 한다. 프로필이 없으면 아무것도 하지 않는다. 동기 안에서 `awaitFirstSync`(최대 4초)를 기다리거나 첫 동기 전에 빈 프로필을 만드는 일을 피하려는 것이다. `addBodyweightLog` 만 write 밖에서 `getOrCreateLocalUser()` 로 프로필을 먼저 확보한다(교착 방지). 수정·삭제는 이미 있는 프로필을 조회만 한다.
6. **weeklyRate: 같은 로컬 날짜의 여러 번 측정은 그날 평균 한 점으로 합친다.** 「3개 이상」은 서로 다른 날 기준이다. 하루에 세 번 재면 시간 단위 오르내림에 ×7 을 곱하게 되어 주간 변화가 크게 튄다. x 는 dayNumber(로컬 날짜 일련번호)이고 창은 (now−28일, now] 이다. 미래 측정은 뺀다. %는 창 안 최신 날 값 대비다.
7. **근육 집계에서 유산소(kind='cardio')를 뺀다.** 그대로 세면 걷기·러닝이 종아리·전신 세트로 쌓인다. 예전 「부위별 분포」도 유산소는 볼륨 0 이라 빠졌으므로 결과가 같다. ADR-039 에는 언급이 없다.
8. **sessionMuscleLoad 의 planned = 이 운동의 작업 세트 전부(끝낸 것 포함), done = done≠false(null=옛 세트=수행됨).** 「끝낸/계획」에서 계획을 분모로 쓰기 위해서다.
9. **routine 계획 세트**: 처방이 있으면 처방 줄 가운데 워밍업이 아닌 줄의 수, 없으면 target_sets 다. 운동 시작 때 세트를 만드는 규칙(prescription 길이 우선)과 맞춘 것이다.
10. **fullBody 가 보조근육이면 0.5 로 센다**(다른 근육과 같은 가중치). 같은 근육이 주·보조에 함께 있으면 주로 한 번만 센다.
11. **topMusclesLabel 은 근육 이름만 이어 붙인다**: 「가슴·삼두」 / 「Chest · Triceps」. 「… 중심」 문장은 화면이 i18n `muscleMap.focus` 로 만든다. 같은 세트 수면 ALL_MUSCLE_GROUPS 순서를 따른다. 그래서 벤치만 했으면 가슴·**어깨**다(어깨가 삼두보다 앞 순서).
12. 미러 「같은 값」 기준은 오차 0.005kg 이다(lb 왕복 흡수). 프로필 0 은 「미설정」으로 읽는다. 이력이 있으면 최신 측정값으로 채우고, 이력이 없으면 null 로 정리한다.
13. 마지막 기록을 지울 때의 확인(U-9)은 화면이 맡는다. `countBodyweightLogs()===1` 이면 묻는다. 정리는 이력 0 ∧ 프로필 null 일 때 아무것도 하지 않는다(미설정 유지).

## 발견한 함정
- 동기 병합은 `payload || EXCLUDED.payload` 이고, 클라이언트는 프로필 **행 전체**를 올린다. 그래서 체중과 상관없는 설정만 바꿔도 낡은 bodyweight_kg 가 updated_at 최신으로 서버에 올라간다(→ 위 1번).
- 서버 `MarkSyncDeleted` 뒤에도 같은 id 로 upsert 하면 `deleted=false` 로 되살아난다. 마지막 기록을 지운 뒤 다른 기기가 낡은 프로필 값을 올리면 bw-init 이 다시 생길 수 있다. 내용이 실제로 있던 값이라 해는 작아서 기록만 해 둔다.
- Loki 는 지운 표시가 남은 id 로 다시 만들 수 없다 → `adapter.getDeletedRecords` 와 기존 id(무효 행 포함)를 「쓸 수 없는 id」로 판정에 넘긴다.
- core 는 biome 범위 밖이다. 임시 설정으로만 lint 할 수 있다.
- 저장소 쓰기 경로(실제 Watermelon write)는 node 에서 데코레이터 모델 때문에 불러올 수 없다. 판정부만 순수 함수 테스트로 고정했다. 연결 부분(applyMirrorInWrite·reconcile write)은 e2e 「체크인 → 이력·프로필 반영」 「백업 내보내기 → 새 계정 가져오기」로 확인해야 한다.

## 화면 단계가 쓸 함수
```ts
// domain (import from '@app/core' 배럴 또는 '@app/core/domain/muscleLoad')
SECONDARY_WEIGHT = 0.5;  MAP_MUSCLES: MapMuscle[] /* 12구역 */
type MapMuscle = Exclude<MuscleGroup, 'fullBody'|'other'>
interface MuscleLoad { byMuscle: Record<MapMuscle, number>; fullBody: number }
setsByMuscle(items: MuscleLoadItem[]): MuscleLoad
untrained(load): MapMuscle[]                       // 「이 기간에 안 한 근육」 칩
rankedMuscles(load): { muscle; sets }[]            // 많은 순 숫자 목록·aria-label
topMuscles(load, limit=2): MapMuscle[]
topMusclesLabel(load, lang='ko', limit=2): string | null   // t('muscleMap.focus', { muscles })
muscleShadeLevel(load, m): 0|1|2|3                 // full 그림 칠하기(0=윤곽선)
primarySecondaryMuscles(items): { primary; secondary }     // mini 2단계
totalMuscleSets(load) · addMuscleLoad(a, b) · emptyMuscleLoad()

// data '@app/core/data/muscleLoadRepository'
routineMuscleSummary(routineId): Promise<{ load; primary: MapMuscle[]; secondary: MapMuscle[] }>  // TodayCard·RecoCard mini
routineMuscleLoad(routineId): Promise<MuscleLoad>
sessionMuscleLoad(workoutId): Promise<{ done: MuscleLoad; planned: MuscleLoad }>                 // 「오늘 근육」 시트
periodMuscleLoad(startMs?, endMs?): Promise<MuscleLoad>                                         // StatsClient MuscleBalanceCard
getWorkoutSetLogs(workoutId): Promise<{ blocks: WorkoutExercise[]; sets: SetLog[] }>

// domain '@app/core/domain/bodyweight'
BODYWEIGHT_STEPS: { kg: [0.1,0.5,1]; lb: [0.2,1,2] } · BODYWEIGHT_MAX_KG = 300
latest(logs) · sortBodyweightLogs(logs) · resolveBodyweightKg(profile, logs): number|null
goalGap(currentKg, goalKg): { remainingKg; absKg; direction: 'up'|'down'|'reached' } | null
weeklyRate(logs, now): { kgPerWeek; pctPerWeek; days } | null     // null → t('bodyweight.weeklyNeedMore')
stepBodyweightKg(currentKg, step, unit): number                    // 시트 [±] 버튼(부호 붙인 step)
interface BodyweightLogLike { id; measuredAt; weightKg; updatedAt; source? }

// data '@app/core/data/bodyweightRepository'
addBodyweightLog({ weight, unit, measuredAt?, source?: 'checkin'|'manual', note? }): Promise<BodyweightLog>
updateBodyweightLog(id, { weight?, unit?, measuredAt?, note? }): Promise<void>
deleteBodyweightLog(id): Promise<number|null>          // 지운 뒤 미러(null = 미설정)
listBodyweightLogs({ startMs?, endMs? }) · queryBodyweightLogs(range)  // observe() 용
countBodyweightLogs() · toBodyweightLogLike(model)
reconcileBodyweightMirror(): Promise<{ created: 'init'|'legacy'|null; mirrorChanged; mirrorKg }>  // 이미 동기·백업·부팅에서 부름
```
- i18n(이번에 넣은 것): `muscleMap.focus`「{muscles} 중심」 · `muscleMap.fullBody`「전신 {count}세트」 · `muscleMap.setsCount` · `bodyweight.deleteLastConfirm` · `bodyweight.weeklyNeedMore` · `bodyweight.sourceLegacy`. 나머지 화면 문구는 화면 단계에서 같은 구역에 추가한다(PREFIXES 이미 등록됨).
- 볼륨 계산은 그대로 프로필 미러(`getUserBodyweightKg`)를 읽는다. 미러는 이력 쓰기·정리가 최신 측정으로 맞춰 둔다.
- 화면에서 체중을 쓸 때 `updateUserSettings({bodyweightKg})` 를 **직접 부르지 않는다**. 이력 저장소를 쓴다. ProfileClient 의 기존 NumberStepper 경로는 화면 단계에서 「기록」 버튼으로 바꾼다. 그때까지는 옛 경로 흡수가 받아 준다.
