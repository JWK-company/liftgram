# Project Spec — 강도·근육·체중 · 코치에게 보내는 성과 요약 · 다른 앱 기록 가져오기 (2판)

> 생성일: 2026-10-27 · **2판(같은 날, /qa spec 3인 조건부 통과 반영 — 높음 17·중간 29·낮음 14)** · 등급: **Project × 5 Phase**
> 추적(implements): URS-024·025·026 · UCS-023·024·025 · SRS-073~082 · SAD-023·024·025 · ADR-038~043(040·042·043 개정)
> 근거: 보고서 `.ouroboros/docs/report/20261027_opengym-compare_report.html` · `_context.md` · `_analysis.md` · QA `.ouroboros/docs/qa/20261027_opengym-spec_qa.md`(원문 `qa/_work/`)
> 사용자 결정(2026-10-27): 스펙 질문 4건 **전부 권장** + "다른 세션과 충돌하지 않게" + "배포까지 끝까지"

## 목표
openGym이 사용자를 매일 붙잡는 네 축(세트 강도, 근육 분포, 체중 곡선, 갈아타기 쉬움)을 우리 방향(사람이 코칭하는 소셜 운동 앱)에 맞게 들여온다. 계산은 core 순수 함수 한 벌로만 하고, 새 입력은 켜야만 보이게 해서 화면 정리(URS-023)와 같은 방향을 지킨다.

## 복잡도
파일 9+(+4) · FE+BE(+2) · 새 API(+1) · 스키마 로컬 v26 + 서버 0017(+2) · 기존 동작 변경(+1) = 10 → Project(Floor: multi_layer + files≥8). 5 Phase 순차 배포.

## 병렬 세션 충돌 방지 규칙 (필수 · 최우선)
1. **작업 트리 분리**: 코드는 `../liftgram-wt-opengym`(브랜치 `feat/opengym-recs`, 2026-10-27 생성 · 기준 2c7735c)에서만 고친다. 원래 폴더 `liftgram/`의 src는 읽기만. 기획 문서(`.ouroboros/docs/**`)·current.md는 원래 폴더에서(current.md는 openGym 칸만).
2. **포트·DB 분리**: 상대 dev 3100·e2e 3200/3201은 쓰지도 끄지도 않는다. 이쪽은 웹 3300·API 3301, e2e DB `e2e_og_<시각>`(docker db·redis 컨테이너 공유, database만 새로).
3. **겹치는 화면 파일은 상대 단계 커밋 뒤에**(core·backend·proto·**새 파일**은 언제든 먼저):
   | 이 Phase | 겹치는 파일 | 상대 선행(원래 브랜치에 커밋) |
   |---|---|---|
   | P1 | SetRowEdit·ExerciseBlock(P1✓) · WorkoutDetailClient·StatsClient·ExerciseProgress(P2) · ProfileClient(P4) · **RestBar/시트 겹침 F4(P3)** | 화면 정리 **P3** 커밋(F4 포함) — 단 ProfileClient 스위치 한 줄은 P4 전에 해도 rebase로 흡수 |
   | P2 | RoutinesClient·WeekSummary(P3) · CatalogClient(P3·P4) · StatsClient(P2) · ActiveWorkout·SessionGuides | 화면 정리 **P3** |
   | P3 | StatsClient · ActiveWorkout · ProfileClient(P4) | 화면 정리 **P4** 또는 그쪽 current.md의 프로필 점검 완료 |
   | P4 | StatsClient(입구) · CoachingClient · dm/{ConversationClient,ConversationsClient,NotificationsClient}(P4) | 화면 정리 **P4** |
   | P5 | sync/BackupCard 옆 새 ImportCard · AuthClient 배치(P4 설정 범위) | 화면 정리 **P4** |
   - 공용 ui 파일(`ui/Dialog.tsx`·`ui/charts.tsx`·`ui/quiet.tsx`·`ui/primitives.tsx`)은 **수정 금지 — 새 파일만 만든다.** 모양은 호출부 className으로.
4. **새 UI는 상대 공용 조각을 쓴다**: `ui/quiet.tsx`(MetaLine·MetaAction·QuietChip·Fold·PrText)와 화면 정리 공용 규칙(회색 메타·빨강은 주 행동·완료·선택 전용·화면별 빨강 ≤2종·접기).
5. **커밋·합치기**: `feat/opengym-recs`에만 커밋. 독립 /qa code 조치 뒤 `git rebase feat/web-stack-tarae`(충돌은 이쪽이 맞춘다) → `make verify` → 원래 폴더 `git -C liftgram status --porcelain -- src`가 비고 src 최근 수정 5분 이상 없을 때만 그 폴더에서 `git merge --ff-only feat/opengym-recs`. 안 되면 Monitor로 기다린다(질문 없음).
6. **배포**: 버전 = 배포 시점 `src/frontend/package.json`의 다음 minor(미리 잡지 않음). 배포 스크립트가 보여 주는 「나갈 커밋」에 상대의 배포 안 된·검토 안 된 커밋이 있거나 상대가 배포 중이면 기다린다. **v26 배포 뒤에는 SCHEMA_VERSION<26 번들 배포 금지**(롤백은 앞으로만 고치기 — D-5).
7. **i18n**: ko.ts·en.ts 끝에 새 구역 `// ── openGym 추천(SRS-073~082) ──`. 접두사 `effort.`·`muscleMap.`·`bodyweight.`·`summary.`·`import.`. `coaching.action.*`에 새 action 키(S-9).
8. **e2e**: 새 헬퍼는 `e2e/helpers/opengym.ts` 한 파일.

## Phase 1 — RIR 입력·노력 분석 + 로컬 스키마 v26 전부 + 다운그레이드 가드 (SRS-073·074 · ADR-038)
**스키마 v26 (이 Phase에만 · 이후 Phase는 로컬 스키마를 바꾸지 않는다 · 모든 칸 optional)**
- [ ] `set_logs.rir` number
- [ ] 새 테이블 `bodyweight_logs`: measured_at number · weight_kg number · source string(`checkin|manual|legacy`, null=manual) · note string · created_at · updated_at
- [ ] `workouts.source` string(null=앱 · strong|hevy) · `workouts.import_batch_id` string indexed
- [ ] `exercises.import_batch_id` string
- [ ] 새 테이블 `import_batches`: source · file_label(표시용 40자 — 원래 파일 이름은 저장하지 않음, D-16) · workout_count · set_count · status string(`writing|done|undone`, null=done) · undone_at number · weight_unit string · tz_offset_min number · created_at · updated_at
- [ ] 새 테이블 `import_aliases`: source · source_name · exercise_id · created_at · updated_at (id 결정적 `ia-<source>-<sha16(정규화 이름)>`)
- [ ] migrations.ts `{toVersion:26, steps:[addColumns×3, createTable×3]}` · `SCHEMA_VERSION=26` · 모델 3 + SetLog/Workout/Exercise 필드 · models/index.ts · `USER_TABLES`에 3테이블 · 옛 행 null 의미 주석
- [ ] `report.go reportCollections`·`scripts/migrate-records.ts`: 새 테이블을 넣지 않음을 주석+Go 테스트로 고정(S-2 허용 목록과 함께)
- [ ] Go 회귀 테스트: v25 기기가 같은 세트를 고쳐 올려도 `rir`·`source`·`import_batch_id`가 얕은 병합으로 남는다(D-17)

**다운그레이드 가드 (D-5 · P1 필수)**
- [ ] 부팅 시 DB를 열기 **전에** localStorage `liftgram.maxSchemaSeen = max(기존, SCHEMA_VERSION)`. 이후 번들은 자기 SCHEMA_VERSION < 그 값이면 DB를 열지 않고 「새 버전으로 새로고침」 화면(버튼 → 옛 `liftgram-pages-*` 캐시 삭제 + reload).
- [ ] v26 번들이 마이그레이션을 마친 직후 옛 세대 페이지 캐시를 지우고, 기다리는 서비스워커가 있으면 운동 중이 아닐 때 `skip-waiting` 메시지.
- [ ] 배포 스크립트: 원격 DEPLOYED 소스의 SCHEMA_VERSION보다 낮으면 중단(src/scripts/deploy-h2500-3.sh — 원래 브랜치 파일이지만 상대 작업 범위 밖, 합치기 전 상대 변경 여부 재확인)
- [ ] e2e: v26 IndexedDB를 SCHEMA_VERSION=25로 만든 빌드로 열면 초기화 없이 새로고침 화면

**core**
- [ ] `domain/effort.ts` — `rirFromRpe`(10−rpe, 0~10 자름) · `effectiveRir(set)`(rir ?? 환산) · `summarizeEffort(sets, range)` → {avg, shareAtOrBelow3, buckets[0,1,2,3,4+], weekly[], coverage} · 대상 done≠false ∧ 워밍업 아님 · 4+ = 4 저장 · 범위 0~10(0.5 단위)
- [ ] `analyticsRepository.getCompletedSets` export + endMs·`rir`·`rpe`·`done`·`isWarmup`·`setType` 포함(기존 호출자 결과 불변 테스트)
- [ ] `workoutRepository.updateSetLog` patch에 `rir`
- [ ] 테스트 `__tests__/effort.test.ts`(0·0.5·4·10.5·null · 워밍업 제외 · 주 경계 로컬 날짜 · rpe만 있는 옛 세트)

**frontend** (화면 정리 P3 커밋 뒤)
- [ ] `lib/prefs.ts` `SYNCED_PREF_KEYS += "liftgram.effortLogging"`(기본 off) · 프로필 운동 설정에 스위치
- [ ] RIR 칩 위치(U-1): 세트 줄 **첫 줄에 넣지 않는다.** 켜졌을 때만 처방 줄(두 번째 줄, `pl-[42px]`) 오른쪽 끝에 칩 — 처방이 없어도 그 줄을 그린다. 처방 RIR이 있으면 처방 줄의 RIR 글자와 칩을 하나로 합친다: 비었으면 「목표 2」, 적었으면 「2 · 목표 2」(글자로 구분 · U-10). 보이는 모양은 QuietChip, 누르는 영역 44×44(호출부 className · U-11). testid `set-rir-<id>`. 끄면 DOM 0개.
- [ ] `components/session/RirSheet.tsx`(새 파일) — SheetShell `hideOk` · 6단계(0·0.5·1·2·3·4+ 쉬운 말) 누르면 **즉시 저장하고 닫힘** · 0.5 스테퍼·지우기는 닫을 때 저장 · 열 때 제목 포커스, 닫을 때 칩으로 focus 복귀(U-23) · 휴식 막대에 가리지 않음(e2e `elementFromPoint` — U-2)
- [ ] 저장은 블록 쓰기 직렬화·updatedAt deps 규칙을 따른다(메모리 「세트 입력칸 묶인 그림」)
- [ ] WorkoutDetailClient: rir 우선, 없고 rpe만 있으면 「≈RIR n」
- [ ] StatsClient `EffortCard` — **페이지 위쪽 기간 Segmented를 따른다**(U-6) · 머리 한 줄 「평균 여유 1.8개 · 적은 세트 64%」 + 분포 막대(`DistributionBars` 재사용) + 주별 추이는 Fold · 「RIR 3 이하」는 「여유 3개 이하」로 · 기록 0이면 접힌 안내 「설정에서 켜면 운동 중에 적을 수 있어요」(U-21·U-22: 가져온 RPE만 있어도 카드는 보인다 — 의도된 동작)
- [ ] ExerciseProgress 막대에 작업 세트 평균 RIR 채움 + 범례 한 줄
- [ ] i18n `effort.*` + guideCopy.test PREFIXES `effort.`

**검증**: `make verify` · e2e `opengym-rir.spec.ts`(켜기 → 칩 → 2 선택 → 즉시 닫힘·칩 「2」 → 다른 값에서 바꾸기 → 기록 상세 표시 → 다른 컨텍스트 동기 · 끄면 칩 없음 · 휴식 중 시트가 막대 위 · 포커스 복귀) · 360·390: 꺼짐 상태 첫 세트 `set-done` 좌표 = 기준선, 켜짐 상태 내려간 값 기록(상한 +40px) · 마이그레이션 e2e(v25 DB → v26 이관, 기존 운동·세트 그대로) · 다운그레이드 가드 e2e · v26 첫 동기 전량 pull 시간 기록(D-14)

## Phase 2 — 근육 지도·근육 균형 (SRS-075·076 · ADR-039)
**core**
- [ ] `domain/muscleLoad.ts` — `SECONDARY_WEIGHT=0.5` · `setsByMuscle(items)` → Record<MuscleGroup,number> + fullBody 별도 · other 제외 · `untrained(map)` · `topMusclesLabel(map)`(「가슴·삼두 중심」)
- [ ] `routineMuscleLoad(routineId)`(계획 세트) · `sessionMuscleLoad(workoutId)` → {done, planned}(세션 전체 세트 한 번 조회 함수 추가)
- [ ] 테스트(벤치=가슴1·삼두0.5·어깨0.5 · 커스텀 other · fullBody · 워밍업 제외)

**frontend** (화면 정리 P3 커밋 뒤)
- [ ] `components/ui/BodyMap.tsx`(새 파일) — 앞·뒤 인라인 SVG 12구역 · **0단계(안 함 = 윤곽선 `--color-line-strong`) + 칠함 3단계**(brand-vivid 100%·60%·30%, 30% 구역은 `--color-ink2` 윤곽선) · 3:1 판정은 「칠한 구역·윤곽선 vs 바탕」에만, 단계 구분은 숫자 목록이 맡음(U-4) · 토큰 이름은 실제 `--color-brand-vivid` · full: `<svg role="img" aria-label="많이 한 근육: 가슴 9세트…">` + 내부 path aria-hidden + 아래 실제 `<ul>` 숫자 목록(U-13) · mini: 2단계(주·보조)만, aria-hidden, 옆 caption 글자
- [ ] 시안: 빨강 농도안 vs 무채 농도 + 선택만 brand 안을 라이트·다크 캡처로 `shots/p2`에 남기고, 화면 정리 규칙(빨강 ≤2종)에 맞는 쪽 채택
- [ ] 설정 `liftgram.muscleMap`(「근육 그림 보기」, 기본 **on** — 카드 mini와 운동 중 버튼을 같이 켜고 끔 · U-14)
- [ ] 루틴 카드: **TodayCard·RecoCard만** mini(목록 줄 RoutineRow에는 넣지 않음 · U-12) · 켜진 동안 자리 고정(56px, 로딩 중 빈 자리 유지) · 근육 0이면 숨기되 줄 높이 영향 없는 오른쪽 열
- [ ] 운동 화면: `SessionGuideButtons` 줄에 「오늘 근육」(44px 이상) → 시트(full + 근육별 끝낸/계획) · 설정 off면 버튼 없음
- [ ] StatsClient `MuscleBalanceCard` — **기존 「부위별 분포」(analytics.muscleDistribution)를 대체**(기존 렌더는 주석으로 막음 · 코드 보존 · U-5) · 페이지 기간을 따르고 주 이동 ‹ › 하나만 · 많은 순 목록(볼륨 kg은 보조 숫자) · 「이 기간에 안 한 근육」 칩 → `/exercises?muscle=<g>`
- [ ] CatalogClient: `muscle` 쿼리 → 초기 필터(칩 상태와 양방향)
- (/qa code P2-3 결정) 근육 균형 기간 = 위쪽 숫자·직전 비교와 같은 「지금 − N일」, 표시는 날짜 대신 「최근 7일」·「7~14일 전」(자정 맞춤은 직전 기간과 통째로 겹쳐 택하지 않음) · 실패 세트 제외(ADR-039 개정)
- [ ] i18n `muscleMap.*`

**검증**: core 테스트 · e2e `opengym-muscle.spec.ts`(오늘 카드 그림 존재 → 설정 끄면 카드 그림·운동 중 버튼 없음 · 세트 완료 → 시트 열기 → 숫자 +1/+0.5 · 통계 안 한 근육 칩 → 카탈로그 필터 · 부위별 분포 섹션이 하나뿐) · 대비 계산 스타일 검사 · 360·390 좌표 검사

## Phase 3 — 체중 이력·체크인·추세 (SRS-077·078)
**core**
- [ ] `data/bodyweightRepository.ts` — add/update/delete/list(range)
- [ ] **미러 규칙 하나(D-10)**: `resolveBodyweightKg(profile, logs)` = measured_at 최대(동률 updated_at) 이력, 없으면 프로필 값. 미러(`user_profiles.bodyweight_kg`)는 캐시 — 이력 쓰기 직후 + **동기 뒤 멱등 정리** `reconcileBodyweightMirror()`(normalizeCatalogRecords 옆) + 백업 가져오기 직후. 미러를 쓸 프로필은 읽기와 같은 「가장 오래된 프로필」. 옛 경로가 프로필 칸을 직접 고친 흔적(프로필 updated_at > 최신 이력 updated_at ∧ 값 다름)은 `source='legacy'` 한 줄로 흡수.
- [ ] 첫 v26 부팅(또는 첫 정리): 프로필 값 있고 이력 0이면 결정적 id `bw-init-<profileId>`(measured_at = 프로필 updated_at, source=legacy) 한 줄
- [ ] 마지막 기록을 지우면 미러는 null(「체중 미설정으로 돌아가요」 확인 — U-9)
- [ ] `domain/bodyweight.ts` — `latest` · `goalGap` · `weeklyRate(logs, now)` = 최근 28일 기록 3개 이상이면 최소제곱 기울기(kg/일)×7, kg·%, 미만 null · 단위별 스텝 상수(kg ±0.1/0.5/1 · lb ±0.2/1/2)
- [ ] 테스트(불규칙 간격 · 같은 날 여러 번 · 28일 밖 · 2개면 null · 두 기기 교차 기록 pull 뒤 미러 = 최신 측정 · 백업 가져오기 뒤 미러 · 옛 경로 흡수 · 초기 한 줄 중복 없음)

**frontend** (화면 정리 P4 프로필 점검 뒤)
- [ ] 설정 `liftgram.weighInBeforeWorkout`(기본 off) · `liftgram.bodyweightGoalKg`
- [ ] `components/session/WeighInSheet.tsx`(새 파일) — ActiveWorkout 첫 진입에서: 완료 세트 0 ∧ `now − startedAt ≤ 10분` ∧ 오늘 로컬 날짜 기록 없음 ∧ localStorage `weighin:<workoutId>` 없음(운동 끝나면 지움) · 스크림·Esc·뒤로 = 「체중 없이 계속」(표시 남김) · 값 가운데 크게, 아래 두 줄 [−1][−0.5][−0.1]/[+0.1][+0.5][+1](각 ≥44, lb 스텝) · 직접 입력 자동 포커스 안 함 · 높이 ≤50dvh(헤더 타이머 보임) · lb↔kg 왕복은 `enteredWeightToKg` 패턴(U-7·U-8)
- [ ] 프로필 체중 칸: 최신값 읽기 전용 + 「기록」 버튼 → WeighInSheet 재사용(명시적 저장) · 「체중 기록 전체」(수정·삭제)(U-9)
- [ ] `components/ui/LineChart.tsx`(새 파일) — 인라인 SVG · 날짜 축 비례 · 목표선 점선 + 「목표」 글자 · 끝점 강조 · 축 라벨 ≤4 · `role="img"` aria-label 요약(U-21)
- [ ] StatsClient `BodyweightCard` — 자기 기간(1M·3M·1Y·전체) · 목표 설정/지우기 · 남은 차이 · 주간 변화(없으면 「한 번 더 적으면 추세가 보여요」)
- [ ] i18n `bodyweight.*` + guideCopy PREFIXES

**검증**: core 테스트 · e2e `opengym-bodyweight.spec.ts`(체크인 켜기 → 시작 → 시트 → 저장 → 이력·프로필 반영 · 같은 날 두 번째 운동 시트 없음 · 「체중 없이 계속」·스크림은 이력 불변 · 목표선·남은 차이 · 맨몸 종목 볼륨이 최신값 사용 · 백업 내보내기 → 새 계정 가져오기 이력·미러 유지)

## Phase 4 — 기간 성과 요약·코치에게 보내기·트레이너 리포트 (SRS-079·080 · ADR-040·041)
**core**
- [ ] `domain/periodSummary.ts` — `SummaryV1`{schemaVersion:1, range{startMs,endMs,tz}, counts{workouts,durationSec,volumeKg(=workouts.total_volume_kg 합),perWeek}, delta, prs[](회원 쪽만), prCount, topExercises[≤5], muscleSets, effort?, bodyweight?} · 없는 섹션 키 제거 · `omitSections` · **`parseSummaryV1(json)`**(모르는 키 버림 · prs≤50 · topExercises≤5 · 문자열≤80자 · 유한 숫자 — 회원·트레이너 양쪽이 렌더 전에 · S-18)
- [ ] `memberReportFromRecords(records, range)` — GetMemberRecords 응답 → periodSummary 입력. 체중 없이 계산(맨몸=가중분만), PR은 pr_count(S-3·S-12)
- [ ] 테스트(경계일 · 직전 기간 증감 · PR 일치 · 섹션 제거 · 64KB 이하 표본 · 맨몸 표본에서 「같은 숫자」 = 세션 수·총 볼륨(캐시)·부위별 세트 수)

**backend · proto · db**
- [ ] `0017_progress_summaries.sql`(이 Phase에만): id · member_id·trainer_id(→users ON DELETE CASCADE) · grant_consent_at timestamptz · period_start·period_end timestamptz · schema_version int · snapshot jsonb · client_id text · message_id text NULL · created_at timestamptz · UNIQUE(member_id, client_id) · INDEX(trainer_id, created_at)
- [ ] queries: Insert(ON CONFLICT DO NOTHING) · GetByMemberClient · GetByID · SetMessageID(`WHERE message_id IS NULL`) · ListByMember(최근 50 + 커서) · CountByMemberSince(하루 20건 상한)
- [ ] coaching.proto: `SendProgressSummary{trainer_id, period_start, period_end, schema_version, snapshot_json, client_id}` → {summary_id} · `GetProgressSummary{id}` · `ListSentSummaries{cursor}` · `GetMemberRecords{member_id, period_start, period_end}` · buf.validate(client_id uuid · snapshot_json ≤65536 bytes · trainer_id min_len 1) · 새 RPC에 `NO_SIDE_EFFECTS` 달지 않음 · 응답 `Cache-Control: no-store`(S-20) · Connect `WithReadMaxBytes(256KB)`
- [ ] Send 흐름(S-5·S-6): 가드(회원→트레이너 active ∧ ScopeLogView) + **차단 검사**를 Insert 전에 → schema_version ∈ {1} ∧ 스냅샷 최상위 schemaVersion 일치 · `json.Valid` ∧ 객체 ∧ `\u0000` 없음 · 기간 검사 → Insert 또는 기존 행(같은 client_id인데 trainer·기간·스냅샷 해시가 다르면 Conflict) → `message_id IS NULL`일 때만 DM 전송 + SetMessageID + 알림 + 감사 `summary_send`
- [ ] Get(S-1·S-13·S-17): `viewer == member_id` ∨ (`viewer == trainer_id` ∧ assertActiveGrant(viewer, member, ScopeLogView) ∧ `grant.consent_at == summary.grant_consent_at`) · 당사자인데 관계 끝남 = PermissionDenied, 당사자 아님 = NotFound · 트레이너가 열면 감사 `summary_view`
- [ ] GetMemberRecords(S-2·S-3·S-15): 컬렉션·칸 허용 목록 서버 상수(ADR-040 개정) · 기간 [start−len, end), 길이 ≤400일 · 완료 운동과 자식·쓰인 커스텀 종목만 · 응답 상한 2MB 넘으면 ResourceExhausted · 감사 `records_view`(detail = 실제 기간·행 수) · 허용 밖 칸이 응답에 없음을 Go 테스트로 고정
- [ ] 옛 GetMemberReport는 **그대로 둔다**(ADR-040 개정 · S-10). 새 클라이언트만 새 경로.
- [ ] dm: `KindSummary` · `Message.ref_id` 추가 · SUMMARY body = 숫자 없는 서버 상수 대체 문구(옛 앱용, ko·en 짧게) · `toProtoKind`/`fromProtoKind` 매핑 표 테스트 · 클라이언트 SendMessage(kind=SUMMARY)는 Validation · 범용 SendAs 대신 **`SendSummaryNotice(ctx, memberID, trainerID, summaryID)`** 하나(차단 검사 포함), coaching은 이것만 가진 좁은 인터페이스 `SummaryMessenger`로 주입(S-14) · main.go 조립
- [ ] notification: Kind `coaching_summary`(post_id 비움 · 옛 앱은 generic) · 첫 실제 전달에서만 Notify(S-16)
- [ ] action 키 snake_case `summary_send`·`summary_view`·`records_view` + 0012 주석 목록·i18n `coaching.action.*`(S-9)
- [ ] Go 테스트: 같은 회원의 다른 active 트레이너 Get 거부 · scope 끄면 거부 · 해지 후 거부 · 재계약 후 옛 요약 거부·새 요약 허용 · SendAs 1회 실패 → 재시도 → 메시지 1건 · 동시 2요청 → 1건 · 크기 초과·`\u0000`·기간 초과 거부 · SUMMARY 직접 전송 거부 · 차단 관계 Forbidden · body가 숫자 없음

**frontend** (화면 정리 P4 뒤)
- [ ] `/stats/summary` — 기간(7일·4주·3개월·직접(시트 안 date 입력)) → SummaryView · 상태 5종: 로딩·빈 기간·코치 없음·오프라인 대기·실패(U-15) · 섹션 토글 즉시 미리보기 반영(보는 그대로 보낸다) · **체중 섹션 기본 꺼짐**, 켤 때 「코치가 체중 변화를 보게 돼요」(S-11) · 「보낸 요약 n」 Fold · StatsClient 상단 입구 하나
- [ ] 보내기 시트: active 코치(여럿이면 선택 · 없으면 /coaching 안내) · client_id uuid · 오프라인 대기열 **`liftgram.summaryOutbox:<userId>`**, 항목에 ownerUserId, 현재 사용자와 다르면 버림, 로그아웃·계정 전환(`wipeFor`·`discardLocalAndAdopt`) 때 지움, ≤10개·7일 만료, 영구 실패(권한 거부)는 대기열에서 빼고 「못 보냄 · 이유」(S-4·D-13·U-16)
- [ ] DM 말풍선 kind=SUMMARY: 고정 문구 「성과 요약 · 눌러서 보기」(숫자는 Get 결과에서만 · S-7) · 받는 쪽만 「루틴 처방」 버튼 · 로딩 스켈레톤·오프라인 「연결되면 열 수 있어요」·해지 「코칭이 끝나 볼 수 없어요」 · 카드 「회원이 보낸 요약(보낸 시점)」 라벨 · 단위는 보는 사람 단위로(스냅샷 kg)(U-17) · 대화 목록 미리보기 「성과 요약」(숫자 없음)
- [ ] CoachingClient ReportDialog → GetMemberRecords + memberReportFromRecords + SummaryView · 단위 변경 안내 한 줄(볼륨 kg → 세트) · 결과는 컴포넌트 상태에만(Watermelon·localStorage·IndexedDB에 쓰지 않음 · S-20)
- [ ] 알림 화면 `coaching_summary` → 그 회원과의 대화(카드 강조)
- [ ] i18n `summary.*` + guideCopy PREFIXES

**검증**: `make proto-check`·`make sqlc` 생성물 커밋 · Go 테스트 · core 테스트 · e2e `opengym-summary.spec.ts`(트레이너·회원 연결 → 회원 4주 요약, 아무것도 안 건드리고 보냄 → 서버 스냅샷에 bodyweight 없음 → 트레이너 DM 카드 → 열기 → 루틴 처방 · 해지 후 열기 거부 · 오프라인 전송 → 복귀 후 1건 · A 오프라인 보냄 → 로그아웃 → B 로그인 → 서버 0건·대기열 비어 있음 · 트레이너 브라우저 저장소에 회원 id 없음 · 트레이너 숫자 = 회원 숫자(세션·총 볼륨·부위별)) · 1년 표본 응답 바이트·서버 시간·트레이너 계산 시간 기록(360 기기에서 1초 넘으면 기본 기간 4주)

## Phase 5 — Strong·Hevy CSV 가져오기 (SRS-081·082 · ADR-042·043 개정)
**동기 선행 (화면 겹침 없음 — 먼저)**
- [ ] `syncTransport.push` 나눠 보내기 ≤2000건 순서대로(서버 upsert 멱등 성질을 Go 테스트 주석에 고정) · 백업 가져오기 회귀 테스트(D-1)
- [ ] 가져오기 중 `syncWithServer` 미루는 플래그(기존 inFlight 자리)

**core** (`domain/import/`)
- [ ] `csv.ts` — RFC 4180 · BOM · CRLF · 구분자 자동(`,`·`;`)
- [ ] `formats/strong.ts` — 2변형(쉼표 `Date,Workout Name,Duration,…,Weight,…,RPE` 단위 없음 → 사용자 선택 · 세미콜론 `"Workout #";…;"Weight (kg)";…`) · Set Order의 W/D/F
- [ ] `formats/hevy.ts` — `weight_kg|weight_lbs`·`distance_km|distance_miles` · set_type normal/warmup/dropset/failure · 날짜 ISO와 「25 Aug 2026, 10:10」
- [ ] `plan.ts` — id = `imp-<source>-<sha16(정규화 현지 시각 문자열)>`(시간대 해석 전 · 같은 시각 두 번이면 원본 순번 `#n` · title 안 씀) · 하위 id 순번 파생 · 커스텀 종목 `cx-<source>-<sha16(정규화 이름)>`(`seed-` 아님 테스트) · **칸 값 계약 표(D-12)**: workouts state='completed' · started_at · completed_at=started+duration(없으면 started) · duration_seconds · total_volume_kg=core 볼륨 함수(가져올 때의 resolveBodyweightKg) · pr_count=0 · accumulated_pause_ms=0 · source · import_batch_id / set_logs done=true · completed_at=null · user_edited=false · is_warmup·is_drop·is_failed=W/D/F · set_type은 warmup만 · rpe 원본 + rir 환산 · kg 정규화 + lb면 `workout_exercises.weight_unit='lb'` · `import_batches.tz_offset_min`·`weight_unit`
- [ ] `match.ts` — import_aliases(가리키는 종목이 없으면 무시) → `resolveSharedExercise` → `searchExercises` 후보 3 → none · 괄호 장비 표기만 변형 칸에(ADR-034)
- [ ] 해시: SHA-256 앞 16바이트(crypto.subtle) + 순수 대체 구현이 같은 결과(테스트)
- [ ] 시험 파일 `__tests__/fixtures/import/`(Strong 2종 · Hevy kg·lb · 깨진 행 · 빈 파일 · 1만 세트 생성기 · 지어낸 값) · 테스트(운동·세트·총 볼륨 일치 · lb 변환 · TZ=Asia/Seoul·America/New_York 같은 id 집합 · 재실행 전부 skipped · 깨진 행 이유)

**data**
- [ ] `prepareCustomExercise(input, {id, importBatchId})`(Model을 돌려주는 prepare) + `createCustomExercise`가 그것을 감쌈(D-8 · 코드 보존 규칙)
- [ ] `workoutRepository.importPlan(plan, onProgress)` — import_batches 행 `status='writing'` → 운동 단위 묶음(≤2000행) write + 양보 → `done` · 각 write 안에서 기존 id(보이는 행 + `adapter.getDeletedRecords`) 재판정, 걸리는 운동 통째로 skipped(D-3) · 가져온 운동 행 markLocalWins **안 씀**, import_aliases.exercise_id만 씀(ADR-042 개정) · `getOrCreateLocalUser`는 write 밖에서 먼저 확보
- [ ] 부팅 정리: `status='writing'` 묶음 → 그 행 삭제 → 묶음 삭제
- [ ] `undoImportBatch(id)` — 묶음 운동·세트 삭제 · 커스텀 종목은 묶음 밖 참조(workout_exercises·routine_exercises)가 0일 때만 삭제, 남으면 import_batch_id 비움 · 지운 종목을 가리키는 별칭만 삭제 · `status='undone'`·undone_at · user_edited 세트 있으면 먼저 알림(D-9)
- [ ] 가져오기 전 조건: 로그인 상태면 동기 한 번 필수 · 오프라인 ∧ undone 묶음 있음 → 「온라인에서 다시 시도」 · 진행 중 운동 있으면 시작 안 함(U-19)

**frontend** (화면 정리 P4 뒤)
- [ ] `lib/importWorker.ts` — blob Worker 파싱·계획(실패 시 메인 대체) · 원본 내용 로그 금지
- [ ] `components/sync/ImportCard.tsx` — 입구만(「다른 앱 기록 가져오기」 + 「가져오기 기록」 묶음별 되돌리기) · AuthClient 두 분기(로그인·로그아웃) 모두 배치(U-20)
- [ ] 단계는 **전체 화면**(`/account/import`): 파일 → 요약(단위 kg/lb 선택 + 표본 한 줄 「벤치프레스 100 × 5」) → 종목 맞추기(자동·확인 필요·못 맞춤) → 진행(파싱·계획은 실제 진행률, 쓰기는 묶음 진행률 · 닫을 수 없음) → 완료(「서버로 올리는 중」 한 줄) · 맞추기 결정 sessionStorage 임시 저장(파일 해시·결정표만) · 나갈 때 「고른 내용이 사라져요」 확인(U-18)
- [ ] 끝나면 `await flushLocalDb()` 뒤 동기 재개
- [ ] 피드·스토리·PR 폭죽·완료 요약 경로 호출 0 확인
- [ ] i18n `import.*`

**검증**: core 테스트 · e2e `opengym-import.spec.ts`(Strong 표본 → 기록·캘린더·통계 반영 · 재가져오기 0건 · 되돌리기 → 0 · 피드에 없음 · 다른 컨텍스트 동기 뒤 중복 없음 · **1만 세트 → 동기 성공 → 서버 sync_records 수 = 로컬 → 다른 기기 pull 일치 · 되돌리기 → 동기 성공**(D-1) · 되돌리기 → 동기 → 새 DB에서 같은 파일 → 동기 두 번 → 운동 수 = 파일(D-2) · n번째 묶음에서 예외·강제 새로고침 → 부팅 정리 뒤 남은 행 0 · 진행 중 운동 있으면 시작 안 됨) · 성능: chrome-devtools CPU 4×·6× + 360×640, 포트 3300 — write 총 시간·최장 long task·flush·첫 push·다른 기기 pull·통계 「전체」 로딩 기록

## 추적 매핑 (`@plm` 주석)
| 파일/심볼 | 실현 |
|---|---|
| db/schema·migrations v26 · models/{BodyweightLog,ImportBatch,ImportAlias} · 다운그레이드 가드 | SRS-073·077·081·082 · SAD-023·025 |
| domain/effort · RirSheet · SetRowEdit RIR 칩 · EffortCard | SRS-073·074 · ADR-038 |
| domain/muscleLoad · ui/BodyMap · MuscleBalanceCard · CatalogClient muscle | SRS-075·076 · ADR-039 |
| bodyweightRepository · domain/bodyweight · reconcileBodyweightMirror · WeighInSheet · ui/LineChart · BodyweightCard | SRS-077·078 |
| domain/periodSummary · parseSummaryV1 · /stats/summary · SummaryView · outbox | SRS-079·080 |
| coaching Send/Get/ListSent/GetMemberRecords · 0017 · dm KindSummary·SendSummaryNotice · notification coaching_summary | SRS-080 · ADR-040·041 · SAD-024 |
| syncTransport 나눠 보내기 · domain/import/* · importWorker · ImportCard·/account/import · importPlan·undoImportBatch·부팅 정리 | SRS-081·082 · ADR-042·043 |

Phase마다 `/plm-hub:codescan`(단일 파일 모드 반복 가능).

## 작업 범위 (작업 트리 `../liftgram-wt-opengym`)
- core: db/{schema,migrations}.ts · db/models/* + 새 모델 3 · sync/{pending,syncEngine,syncOwner}.ts · data/{workoutRepository,analyticsRepository,exerciseRepository,routineRepository,userRepository}.ts · 새 data/bodyweightRepository.ts · 새 domain/{effort,muscleLoad,bodyweight,periodSummary}.ts · 새 domain/import/* · domain/__tests__ · i18n/locales/{ko,en}.ts(끝 구역)
- frontend: lib/{prefs,syncTransport,localDb}.ts · 새 lib/importWorker.ts · 부팅(다운그레이드 가드 — DB 여는 곳) · session/{SetRowEdit,ExerciseBlock,ActiveWorkout,SessionGuides}.tsx + 새 RirSheet·WeighInSheet · analytics/{StatsClient,WorkoutDetailClient,ExerciseProgress}.tsx · routines/RoutinesClient.tsx · exercises/CatalogClient.tsx · profile/ProfileClient.tsx · coaching/CoachingClient.tsx · dm/{ConversationClient,ConversationsClient,NotificationsClient}.tsx · sync/ 새 ImportCard + AuthClient · 새 ui/{BodyMap,LineChart}.tsx · 새 summary 컴포넌트·`app/stats/summary`·`app/account/import` · e2e 새 spec 5 + helpers/opengym.ts
- backend·proto·db: proto/{coaching,dm,notification}/v1 + 생성물 · backend/internal/{coaching,dm,notification,sync}/* · backend/cmd/server/main.go · database/migrations/0017 · database/queries/{coaching,dm}.sql + sqlcgen
- 배포: src/scripts/deploy-h2500-3.sh(스키마 하강 차단) · src/frontend/package.json(+ app.json·appInfo.ts가 남아 있으면 같이)

## 주의사항
- **[병렬 세션]** 충돌 방지 규칙 8개가 최우선. 원래 폴더 src 수정 금지 · 공용 ui 수정 금지.
- **[마이그레이션 1:1]** 로컬 v26은 P1에만, 서버 0017은 P4에만. 나중 Phase에서 v26에 칸 추가 금지(필요하면 v27) — Ouroboros dd56d532(0.745).
- **[다운그레이드]** v26 배포 뒤 스키마 하강 배포 금지 · 가드 필수(D-5).
- **[optional number]** 새 숫자 칸 전부 optional · null 처리는 core 함수 한 곳(ADR-037 QA B1).
- **[created 행 · 삭제 표시]** 가져온 행은 원격 우선 · 쓰기 안에서 기존 id·삭제 표시 재판정 · 가져오기 전 동기(ADR-042 개정).
- **[push 상한]** 서버 5000건 · 클라이언트 나눠 보내기(P5 선행).
- **[세트 표 묶인 그림]** RIR 저장은 블록 쓰기 직렬화·updatedAt deps · e2e는 다른 값에서 시작(상대 세션 메모리).
- **[LokiJS]** 메인 스레드·비트랜잭션 · 대량 쓰기 뒤 `await flushLocalDb()`.
- **[NFKC 자모]** 종목 맞추기는 기존 searchExercises 사용.
- **[권한]** 받는 트레이너에 묶은 Get · 허용 컬렉션·칸·기간 · 체중 기본 제외 · 대기열 계정 분리 · 저장–DM 멱등(S-1~S-5).
- **[웰니스]** effort·bodyweight·summary 문구 guideCopy 접두사 · 권고·평가 금지.
- **[화면 조용함]** RIR·체크인 기본 off · 근육 그림은 오늘/추천 카드 + 운동 중 버튼(설정 하나로 끔) · 끈 상태 좌표 = 기준선.
- **[e2e 포트]** 3300/3301.
- **[기록만]** pull 페이지 없음(D-14 · 백로그) · assertActiveGrant가 구독·차단을 안 봄(기존 부채 · SRS-048) · 회원·트레이너 시간대 차이로 기간 경계 하루 어긋날 수 있음(range에 tz를 실어 회원 기준 표시).

## 다음 단계
P1 `/execute`(작업 트리 · core·스키마·가드 먼저, 화면은 상대 P3 커밋 뒤) → 독립 `/qa code` → 조치 → 합치기·배포 → P2 … P5. 스펙 확정 뒤에는 질문 없이 완주하고 결과만 보고한다.
