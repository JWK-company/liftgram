<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P4 화면 밖(core) — 결과 보고 (2026-10-27)

## 커밋
- `f73099c` feat(opengym): P4 화면 밖 — 기간 성과 요약 계산·스냅샷 검증·트레이너 원본 변환(미배포) · 브랜치 feat/opengym-recs · push·merge·배포 안 함
- 새 파일 4개만 경로를 지정해 add 했다. 기존 파일(domain/index.ts·i18n·Phase 5 파일)은 손대지 않았다. `src/core/src/domain/import/`(Phase 5 에이전트 작업)·`lefthook.yml`·`.ouroboros-work/` 는 커밋에 넣지 않았다.

## 파일
- `src/core/src/domain/periodSummary.ts` — SummaryV1 타입 · buildPeriodSummary · omitSections · presentSections · 기간 함수(summaryRange·customSummaryRange·isValidSummaryRange·previousRange·summaryRangeDays) · muscleLoadFromSummary
- `src/core/src/domain/summarySchema.ts` — parseSummaryV1 · serializeSummaryV1 · summaryByteLength · fitsSummaryLimit · SUMMARY_MAX_BYTES(65536)
- `src/core/src/domain/summaryRecords.ts` — raw(snake_case) → 입력 변환(summaryInputFromRaw · *FromRaw 4종) · memberReportFromRecords
- `src/core/src/domain/__tests__/periodSummary.test.ts` — 14개
- 모두 `// @plm SRS-079 SRS-080 (ADR-040)` 역링크가 있다.

## 검증
- `bun run test:core` **373/373** 통과(새 테스트 14개, 기존 359개). 새 테스트는 TZ=America/New_York·Asia/Kolkata 에서도 14/14.
- `npx tsc --noEmit -p core`·`-p frontend` 오류 0.
- 1년치 표본(주 4회 × 6종목 × 4세트, 209회, 매주 무게가 올라 PR이 많음, 체중 365건): 스냅샷 **7,870B**(상한 64KB의 12%)이고 prs는 50개에서 잘렸다. parse 왕복 결과가 원본과 같다.
- 같은 숫자 테스트: 1년 표본(맨몸 턱걸이·보조 딥스·유산소·커스텀 종목 포함)을 7일·4주·3개월로 계산했다. 서버를 흉내 낸 응답(허용 칸만, 완료 운동, started_at 기준 [start−길이, end), 커스텀 종목만, 시드 종목은 카탈로그로 해석)으로 만든 트레이너 결과와 회원 결과가 다음에서 같다: 세션 수·총 볼륨(캐시)·시간·delta·부위별 세트·PR 수·힘든 정도. 맨몸 최고 세트는 회원 쪽이 트레이너 쪽보다 정확히 체중(80kg)만큼 크다(S-12 규칙이 테스트로 고정됨).
- 실행 안 함: e2e·브라우저(화면 단계 몫)·Go 테스트.

## 스펙과 다르게 한 것과 이유
1. **기간에 넣는 기준이 started_at 이다**(통계 카드의 getCompletedSets 는 completed_at). 서버 GetMemberRecords가 started_at으로 거르기 때문에, 같은 운동 집합을 보려면 기준이 같아야 한다. 대가: 자정을 넘긴 운동은 통계 카드와 요약에서 다른 날로 잡힐 수 있다.
2. **같은 변환 함수를 회원도 쓰게 했다**(`summaryInputFromRaw`). 회원 화면도 Watermelon `_raw`를 이 함수에 넘기면, 트레이너와 계산 경로 전체가 같아진다. 스펙에는 memberReportFromRecords만 있었다.
3. **memberReportFromRecords 에 3번째 인자 `opts.catalog` 를 더했다**. 시드 종목은 응답에 없어서(서버 보고) 트레이너 기기 카탈로그로 근육·하중모드를 찾아야 한다. 응답 안의 커스텀 종목이 카탈로그보다 우선한다. 카탈로그를 넘기지 않으면 시드 종목 세트는 부위별에서 빠진다(테스트로 고정).
4. **effort 섹션에는 weekly(주별 추이)를 넣지 않았다**. 들어가는 것은 avg·shareAtOrBelow3·buckets[5]·total·rated·fromRpe다. 스냅샷을 작게 유지하고 parse 대상을 좁히려는 것이다. 주별 그래프가 필요하면 판을 올려야 한다.
5. **delta 는 늘 들어간다**(직전 기간이 0회여도 넣는다. 0회도 사실이다). 「없는 섹션」 규칙은 prs(목록이 빔)·topExercises·muscleSets(전부 0)·effort(RIR을 아는 세트 0)·bodyweight(기간 안 측정 0)에 적용된다. prCount는 0이어도 들어간다.
6. **'prs' 섹션을 끄면 prs와 prCount가 함께 빠진다**. 섹션 = 'delta'|'prs'|'topExercises'|'muscleSets'|'effort'|'bodyweight'. range·counts·schemaVersion은 끌 수 없다. 기본으로 꺼진 것은 `SUMMARY_DEFAULT_OFF = ['bodyweight']`.
7. **parse 세부 규칙**: 이름·tz 문자열은 80자에서 자른다. id(exerciseId)가 80자를 넘으면 그 줄을 버린다(잘린 id는 다른 종목을 가리킬 수 있다). 필수 부분(판·range·counts)이 틀리면 null을 돌려준다. 선택 섹션이 틀리면 그 섹션만 버린다. 배열 안의 틀린 줄은 버리고 상한까지만 본다. 근육은 MAP_MUSCLES 12개 키만 받고, 음수가 있으면 섹션을 버린다. JSON의 `1e999`(Infinity)와 문자열 숫자는 숫자로 받지 않는다. 결과는 새 객체로 다시 만들기 때문에 `__proto__`가 따라오지 않는다.
8. **PR 목록 규칙**은 완료 판정(completeWorkout·recomputeWorkoutTotals)과 같다: (종목 × 변형 키) 칸, 유산소 제외, completed_at 순으로 칸별 「앞선 최고」를 누적한다. 목록을 만들려면 회원이 **기간 앞의 전 이력**을 workouts에 넣고 `prList: true`를 줘야 한다. 목록이 50개를 넘으면 가장 최근 50개만 남긴다.
9. **topExercises**: 작업 세트 수가 많은 순(같으면 운동 수, 그다음 id)이고 유산소는 뺀다. 최고 세트는 `pickPrSets().weight`(유효무게 최대, 같으면 횟수 많은 것)로 고르고, 기간 첫 운동 → 마지막 운동을 보여 준다. name은 보낸 시점의 표시 이름이다. 받는 쪽은 exerciseId로 자기 카탈로그 이름을 먼저 찾는 것을 권장한다.
10. 부위별 세트는 periodMuscleLoad와 같은 규칙이다: done≠false, 워밍업 제외, 실패 세트는 포함, 유산소·모르는 종목 제외.
11. 숫자 반올림: kg은 0.1, perWeek는 0.1(횟수×7/일수), effort avg·share는 0.01, durationSec은 정수. duration_seconds가 없으면 completed−started로 계산한다. volume·pr_count가 null이면 0으로 본다.

## 화면 단계가 쓸 시그니처
```ts
// '@app/core/domain/periodSummary'
SUMMARY_SCHEMA_VERSION = 1 · SUMMARY_MAX_RANGE_DAYS = 400 · SUMMARY_TOP_EXERCISES = 5 · SUMMARY_MAX_PRS = 50
SUMMARY_SECTIONS · SUMMARY_DEFAULT_OFF = ['bodyweight']
type SummaryPreset = '7d' | '4w' | '3m'
type SummarySection = 'delta' | 'prs' | 'topExercises' | 'muscleSets' | 'effort' | 'bodyweight'
interface SummaryV1 { schemaVersion: 1; range: { startMs; endMs; tz }; counts: { workouts; durationSec; volumeKg; perWeek };
  delta?: SummaryCounts; prCount?: number; prs?: { exerciseId; name; type: 'maxWeight'|'maxVolumeSet'; valueKg; previousKg; atMs }[];
  topExercises?: { exerciseId; name; sets; sessions; first: { weightKg; reps; atMs }; last: {…} }[];
  muscleSets?: { byMuscle: Partial<Record<MapMuscle, number>>; fullBody }; effort?: { avg|null; shareAtOrBelow3|null; buckets[5]; total; rated; fromRpe };
  bodyweight?: { startKg; endKg; changeKg; startMs; endMs; count } }
summaryRange(preset, nowMs, tz = currentTimeZone()): SummaryRange          // [오늘−n 자정, 내일 자정)
customSummaryRange('YYYY-MM-DD', 'YYYY-MM-DD'(끝 포함), tz?): SummaryRange | null
isValidSummaryRange(range, nowMs): boolean   // 서버 검사와 같다 — 보내기 전 확인
previousRange(range) · summaryRangeDays(range) · currentTimeZone()
buildPeriodSummary(input: PeriodSummaryInput): SummaryV1
omitSections(summary, offSections): SummaryV1      // 보내기 직전 · 미리보기도 이걸 거친 결과를 그린다(보는 그대로 보낸다)
presentSections(summary): SummarySection[]         // 토글 목록(없는 섹션은 토글도 없음)
muscleLoadFromSummary(summary): MuscleLoad         // BodyMap·rankedMuscles 에 그대로

// '@app/core/domain/summarySchema'
parseSummaryV1(jsonOrValue): SummaryV1 | null      // SummaryView 앞에서 반드시 — 회원·트레이너 모두
serializeSummaryV1(s): string                      // snapshot_json
summaryByteLength(s) · fitsSummaryLimit(s) · SUMMARY_MAX_BYTES = 65536

// '@app/core/domain/summaryRecords'
summaryInputFromRaw({ workouts, workoutExercises, setLogs, exercises }: raw[] ×4, {
  range, catalog?, bodyweightKg?, bodyweightLogs?, prList?, lang?, displayName? }): PeriodSummaryInput
memberReportFromRecords(resp: { workouts; workoutExercises; setLogs; exercises: string[] }, range, { catalog?, lang?, displayName? }?): PeriodSummaryInput
exerciseFromRaw(raw) / workoutFromRaw / blockFromRaw / setFromRaw
```
- **회원 화면 조립(권장)**: 완료 운동 전부(PR 목록 기준선용)와 그 블록·세트·종목의 `_raw`를 읽는다. 체중은 `resolveBodyweightKg`(또는 getUserBodyweightKg — 완료 판정과 같은 값)로, 이력은 `listBodyweightLogs({startMs, endMs})`(toBodyweightLogLike)로 가져온다. 그다음 `summaryInputFromRaw(raw, { range, bodyweightKg, bodyweightLogs, prList: true, lang, displayName })` → buildPeriodSummary → omitSections(토글) → parseSummaryV1 → SummaryView 순서다. 읽기용 data 함수는 만들지 않았다(이번엔 새 domain 파일만이라는 지시). 화면 단계에서 새 `data/periodSummaryRepository.ts`를 두면 된다. 전 이력을 읽는 게 무거우면, 기간 앞 이력은 PR 기준선에만 필요하니 prList를 3개월 이하에서만 켜는 방법도 있다.
- **트레이너**: `getMemberRecords({memberId, periodStart, periodEnd})` → `memberReportFromRecords(resp, 요청 range, { catalog: 로컬 exercises.map(e => exerciseFromRaw(e._raw)) })` → buildPeriodSummary → parseSummaryV1 → SummaryView. range.tz는 트레이너 시간대다(회원 tz는 스냅샷에만 있다). 결과는 컴포넌트 상태에만 둔다(S-20).
- 보낸 스냅샷의 `range` = 회원이 고른 기간이다. SendProgressSummary의 period_start/end에도 같은 값을 넣는다(서버가 최상위 schemaVersion만 대조).

## 필요한 i18n 키(화면 단계 · `summary.*` · guideCopy PREFIXES `summary.` 등록 필요)
- 진입·기간: `summary.entry`(성과 요약) · `summary.title` · `summary.preset.7d`·`4w`·`3m`·`custom` · `summary.customStart`·`customEnd` · `summary.rangeInvalid`(400일 넘음 등)
- 상태 5종: `summary.loading` · `summary.empty`(이 기간 운동 없음) · `summary.noCoach`(/coaching 안내) · `summary.offlineQueued` · `summary.failed`
- 숫자 라벨: `summary.workouts`·`duration`·`volume`·`perWeek` · `summary.deltaVsPrev`(직전 {n} 대비) · `summary.prCount` · `summary.prs` · `summary.prType.maxWeight`·`maxVolumeSet` · `summary.topExercises` · `summary.firstToLast`(처음 → 끝) · `summary.muscleSets` · `summary.effort` · `summary.bodyweight` · `summary.bodyweightChange` · `summary.bodyweightCount`
- 보내기: `summary.send` · `summary.sendTo` · `summary.sections.*`(delta·prs·topExercises·muscleSets·effort·bodyweight) · `summary.bodyweightWarn`(코치가 체중 변화를 보게 돼요) · `summary.tooLarge`(기간을 줄여 주세요) · `summary.sent`·`sending`·`sendFailed`(+이유) · `summary.dailyLimit`(내일 다시) · `summary.sentList`(보낸 요약 {n})
- DM·트레이너: `summary.card`(성과 요약 · 눌러서 보기) · `summary.preview`(대화 목록 「성과 요약」) · `summary.memberSent`(회원이 보낸 요약(보낸 시점)) · `summary.offlineOpen`(연결되면 열 수 있어요) · `summary.ended`(코칭이 끝나 볼 수 없어요) · `summary.prescribe`(루틴 처방) · `summary.reportUnitNote`(볼륨 kg → 세트 단위 안내) · `summary.prListTrainerNote`(새 기록은 개수만)
- 서버 보고에서 남은 것: `coaching.action.summary_send`·`summary_view`·`records_view` · 알림 `coaching_summary` 문구
- 문구는 사실만 쓴다(평가·권고 금지). 웰니스 게이트를 통과해야 한다.

## 남은 일 · 주의
- 트레이너 쪽 1년 표본 계산 시간 측정(360 기기 · 1초 넘으면 기본 기간 4주)은 화면 단계 e2e에서 한다. node에서는 1년 표본 생성과 3기간 계산을 합쳐 약 70ms였다.
- 회원·트레이너 시간대가 다르면 날짜 표시가 하루 어긋날 수 있다. 화면은 스냅샷 `range.tz` 기준(회원 기준)으로 날짜를 표시한다.
