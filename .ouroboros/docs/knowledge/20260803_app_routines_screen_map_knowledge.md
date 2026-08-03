# app 루틴 화면 구조 지도 (RN → React DOM 이관용)

> 조사 대상: `app/src/features/routines/` 4파일
> — `WorkoutTabScreen.tsx`(1072) · `RoutineEditorScreen.tsx`(907) · `PrescriptionRows.tsx`(99) · `ExerciseName.tsx`(42)
> 작성: 2026-08-03 · 목적: 웹(Next.js `src/`)에서 **같은 UI·같은 규칙**으로 재현하기 위한 구현 사양
> 참조 토큰: `app/src/theme/tokens.ts` · i18n 한국어: `app/src/i18n/locales/ko.ts`

---

## 0. 공통 토큰 · 프리미티브 (먼저 웹으로 포팅해야 함)

### 0.1 색 (`colors`)
| 토큰 | 값 |
|---|---|
| bg | `#0E1116` |
| surface | `#171B22` |
| surfaceAlt | `#1E242D` |
| border | `#2A323D` |
| text | `#F2F5F8` |
| textMuted | `#9AA6B2` |
| textFaint | `#5E6B78` |
| primary | `#4C8DFF` |
| primaryMuted | `#2A4A7F` |
| onPrimary | `#FFFFFF` |
| success | `#37C871` |
| warning | `#FFB020` |
| danger | `#FF5C5C` |
| pr | `#FFD23F` |

### 0.2 간격/반경/타이포
- `spacing` = xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32
- `radius` = sm 8 / md 12 / lg 16 / pill 999
- `fontSize` = xs 12 / sm 14 / md 16 / lg 20 / xl 28 / xxl 36
- `fontWeight` = regular 400 / medium 600 / bold 700
- RN의 `StyleSheet.hairlineWidth` ≈ 웹에서는 `1px`(또는 0.5px)로 대체

### 0.3 AppText variant 매핑
| variant | size | weight |
|---|---|---|
| display | 36 | 700 |
| title | 28 | 700 |
| heading | 20 | 700 |
| body | 16 | 400 |
| caption | 14 | 400 |
| label | 12 | 600 |

`numberOfLines={1}` → 웹 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.

### 0.4 Card
`background: surface` · `border-radius: 12(md)` · `padding: 16(lg)` · `border: hairline solid border`. `alt` prop이면 bg를 surfaceAlt로.

### 0.5 Button (`components/Button.tsx`)
- 높이: `sm 36` / `md 46` / `lg 54`
- 공통: `border-radius: 12(md)`, 가운데 정렬, `padding-x: 16(lg)`, 내용은 row + `gap 8` (아이콘 + 텍스트)
- 텍스트: sm은 14px, 그 외 16px, 항상 `700`
- 아이콘 크기: sm 16, 그 외 18
- variant 팔레트
  | variant | bg | fg | border |
  |---|---|---|---|
  | primary | primary | onPrimary | 없음 |
  | secondary | surfaceAlt | text | border |
  | ghost | transparent | primary | 없음 |
  | danger | transparent | danger | danger |
- `fullWidth`(기본 true) → `align-self: stretch`; false → `align-self:flex-start` + `padding-x: 24(xl)`
- disabled/loading → `opacity .45`, pressed → `.85`. loading이면 텍스트 대신 스피너.

### 0.6 IconButton
40×40, `border-radius: pill`, 아이콘 기본 22px, `filled`면 bg surfaceAlt, disabled `opacity .4` / pressed `.7`.

### 0.7 EmptyState
`flex:1, center, padding 24(xl)` → (옵션 아이콘 배지 64×64 원형 surfaceAlt, mb16) + 제목(heading, center) + 메시지(caption, textMuted, center, mt8) + 액션(mt16).

### 0.8 SectionHeader
row / space-between / center / `margin-bottom: 12(md)`. 좌측 heading 텍스트, 우측 옵션 노드.

### 0.9 Tag
`padding: 3px 8px`, `radius: pill`, `align-self:flex-start`, 12px/600.
tone=`primary` → bg `primaryMuted`, fg `primary`.

### 0.10 TextField / NumberStepper (`components/inputs.tsx`)
- **TextField**: 래퍼 `margin-bottom 12(md)`. 라벨(label 12/600, textMuted, mb4) + input(bg surfaceAlt, radius 12, padding 12, 16px text, hairline border, placeholder색 textFaint) + hint(caption, textFaint, mt4).
- **NumberStepper**: row + gap8. `−` 버튼 40×40(radius 12, bg surfaceAlt) / 값 영역(minWidth 56, minHeight 40, **점선 밑줄** 1px textFaint — 탭하면 인라인 TextInput으로 전환, `border:1px primary`, radius 8, 20px/700, 가운데정렬) / `+` 버튼 40×40. `clamp = min(max, max(min, round(n*100)/100))`, 정수면 정수 표기 아니면 소수1자리.

---

## 1. WorkoutTabScreen.tsx — "운동" 탭

### 1.1 최상위 골격
```
<Screen padded={false}>            // SafeAreaView, bg #0E1116, edges top/left/right
  <ReorderableList                 // 탭 전체가 한 스크롤 (헤더를 리스트 헤더로 주입)
     data={looseRoutines}          // 폴더 없는 루틴만
     contentContainerStyle={{ padding:16, paddingBottom:32, flexGrow:1 }}
     ListHeaderComponent={header}
     renderItem={RoutineRow}
     ListEmptyComponent={routines.length===0 ? <EmptyState/> : null}
     onReorder={handleReorder} />
</Screen>
```
웹에서는 ReorderableList → dnd-kit/`SortableContext` 등으로 치환. 드래그 핸들에 `touch-action:none; cursor:grab; user-select:none`가 이미 RN-web용으로 들어가 있음(그대로 유지).

### 1.2 상태 목록 (WorkoutTabScreen 본체)
| 상태 | 타입 | 구동 UI |
|---|---|---|
| `busy` | boolean | 3버튼/시작 버튼 `disabled`·`loading` |
| `routines` | `Routine[]` (`useQueryData(routineRepo.queryRoutines())`) | 전체 루틴 소스. `is_archived=false`, `sort_order ASC` |
| `focusTick` | number | 화면 포커스마다 +1 → 폴더 그룹/loose 재계산 (폴더는 필드변경이라 WatermelonDB observe가 재방출 안 함) |
| `folderGroups` | `[folderName, Routine[]][]` | 폴더 카드 목록(삽입순=루틴 정렬순) |
| `looseRoutines` | `Routine[]` | 드래그 재배치 대상 리스트 |
| `openFolders` | `Record<string,boolean>` | 폴더 펼침 여부 |
| `reco` | `analyticsRepo.TodayRoutineReco \| null` | "오늘의 추천 루틴" 카드 |
| `catchUp` | `MissedPlan \| null` | "놓친 루틴" 카드 |
| 컨텍스트 | `useSession(): activeWorkoutId, setActiveWorkoutId` / `useUser(): weeklySchedule` | 진행중 카드·스케줄 분기 |

**데이터 로딩 타이밍**
- `useFocusEffect` → `loadReco()` + `setFocusTick(x=>x+1)`
- `useEffect([routines.length, activeWorkoutId, loadReco])` → `loadReco()`
- `loadReco()`:
  1. `analyticsRepo.getTodayRoutineRecommendation()` → `setReco` (실패시 null)
  2. `weeklySchedule`가 있으면 `analyticsRepo.getCompletedDayNumsSince(8)` → `missedCatchUp(weeklySchedule, dayNums, Date.now())` → `setCatchUp`; 없으면 `setCatchUp(null)`

### 1.3 렌더 순서 (ListHeaderComponent)

#### ① 헤더 행 `styles.headerRow`
`flexDirection:row; alignItems:center; justifyContent:space-between; marginBottom:16(lg)`
- 좌: `AppText variant="display"` → `routines.title` = **"운동"** (36/700)
- 우: `activeWorkoutId`가 있을 때만 `Button` — title `routines.resumeWorkout` = **"이어서 운동하기"**, icon `play`, size `sm`(36h), `fullWidth={false}`, primary.
  → **onPress**: `navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId })`

#### ② "진행 중인 운동" 재개 카드 — `activeWorkoutId`일 때만
`Card style=resumeCard`: `backgroundColor: surface` · `borderColor: primary` · `borderWidth:1` · `marginBottom:16(lg)` (+Card 기본 radius 12 / padding 16)
- 내부 `resumeRow`: `row / alignItems:center / gap:12(md)`
  - 좌(flex:1)
    - `AppText heading` → `routines.activeWorkout` = **"진행 중인 운동"**
    - `AppText caption color=textMuted marginTop:2` → `routines.resumePrompt` = **"이전에 시작한 운동 세션이 있습니다."**
  - 우: `Button variant="danger" size="sm" fullWidth={false}` → `routines.discardWorkoutButton` = **"폐기"**
- **"이어서 운동하기" 버튼은 이 카드가 아니라 ① 헤더 우측에 있다** (포팅 시 위치 주의).
- **폐기 onPress → `discardActive()`**
  - `Alert(routines.discardWorkoutTitle="진행 중 운동 폐기", routines.discardWorkoutMessage="하던 운동 기록을 버릴까요? 되돌릴 수 없어요.")`
  - 버튼: `common.cancel`("취소", cancel) / `common.delete`("삭제", destructive)
  - 확인 시 `workoutRepo.discardWorkout(activeWorkoutId)` → 실패해도 `setActiveWorkoutId(null)`

#### ③ `<WeeklyScheduleCard>` — 주간 스케줄 (SRS-044)
**항상 렌더**(진행중 운동 여부와 무관). 내부에서 `useUser()`의 `user`, `weeklySchedule`를 다시 읽는다.

**(a) 스케줄이 없을 때 = "주간 스케줄 만들기" 엔트리 행**
`Pressable style=wsStyles.entry`:
`row / alignItems:center / gap:8(sm) / paddingVertical:12(md) / paddingHorizontal:12(md) / borderRadius:12(md) / backgroundColor:surface / border 1px border / marginBottom:8(sm)`
- 좌: Ionicons `calendar-outline` 18px, color `primary`
- 중: `AppText body weight="medium" flex:1` → `schedule.createEntry` = **"주간 스케줄 만들기 (요일별 루틴·디로딩)"**
- 우: Ionicons `chevron-forward` 18px, color `textMuted`
- **onPress → `openEdit()`**: `draftDays = weeklySchedule?.days 복사 ?? [null×7]`, `draftBlock = weeklySchedule?.blockWeeks ?? null`, `setEditing(true)` → `ScheduleEditModal` 오픈 (삭제 버튼 없음)

**(b) 스케줄이 있을 때 = 카드**
`Card style=[wsStyles.card, block?.isDeload && cardDeload]` — card: `marginBottom:8(sm)`, cardDeload: `borderColor: colors.pr(#FFD23F), borderWidth:1`
- `headRow`(row/center/gap8):
  - `AppText label color=primary` → `schedule.title` = **"주간 스케줄"**
  - 주차 배지(`block`이 있을 때): `paddingH 8 / paddingV 2 / radius pill / bg primaryMuted`(디로딩이면 bg `surfaceAlt`), 텍스트 label bold — 디로딩이면 `schedule.deloadWeek`="디로딩 주"(color warning), 아니면 `schedule.weekN`="{week}주차"(color primary)
  - `assignedCount>0`이면 `AppText caption textMuted` → `schedule.timesPerWeek` = **"주 {count}회 운동"** (count = `days` 중 `null`도 `'rest'`도 아닌 것 수)
  - `<View flex:1/>` 스페이서
  - `IconButton icon="pencil" size=16 color=textMuted` → `openEdit()`
- `strip`(row / gap4 / marginTop 8): 요일 칩 7개 (`DAY_KEYS = mon..sun`, 월=0)
  - 칩: `flex:1 / alignItems:center / paddingVertical:6 / radius 8(sm) / bg surfaceAlt / hairline border`; 오늘(`(new Date().getDay()+6)%7`)이면 `borderColor primary, bg primaryMuted`
  - 상단 텍스트: `schedule.dayShort.mon..sun` = "월/화/수/목/금/토/일" — 오늘이면 color primary + bold, 아니면 textFaint
  - 하단 `dayChipValue`(row/center/minHeight 12/gap3): 루틴 배정이면 **색 점**(6×6, radius 3, 색 = `routineDotColor`), `'rest'`면 Ionicons `moon` 9px(오늘이면 primary, 아니면 textMuted), 미배정이면 아무것도 없음
  - **텍스트로 루틴 이름을 쓰지 않는다** (짤림 제거 결정). 이름은 탭으로 확인.
  - **칩 onPress → `showDay(i)`**: Alert 제목 = `schedule.day.*` 풀네임("월요일"…)
    - `'rest'` → 본문 `schedule.rest`="휴식"
    - 미배정 → 본문 `schedule.unassigned`="비움"
    - 루틴 → 본문 = 루틴명, 버튼 `common.ok`("확인", cancel) + `schedule.startThis`("이 루틴 시작") → `onStartRoutine(entry)`
- `ScheduleEditModal` (삭제 버튼 포함)

**루틴 색 점 팔레트** (`ROUTINE_DOT_PALETTE`, 루틴 목록 인덱스 % 8로 고정 배정):
`['#4F8EF7','#A78BFA','#34D399','#F59E0B','#F472B6','#22D3EE','#F87171','#A3E635']`

**`ScheduleEditModal`** (transparent, fade) — backdrop `rgba(0,0,0,0.5)` + center + padding 24; sheet `width:100% / maxWidth:380 / bg surface / radius 16(lg) / padding 16(lg)`
1. `AppText heading` → `schedule.editTitle` = **"주간 스케줄 편집"**
2. 요일 7행 `editRow`(row/center/gap8/paddingV 8/하단 hairline border): 좌 `dayShort`(width 32) · 중 라벨(flex1, numberOfLines 1; 값 없으면 color textFaint) · 우 `chevron-forward` 16
   - 라벨 = `'rest'`면 "휴식", 루틴이면 이름(없으면 `'?'`), null이면 "비움"
   - **onPress → `pickDay(i)`**: Alert(제목 = 요일 풀네임, 본문 `schedule.pickPrompt`="이 요일에 배정할 항목을 선택하세요") · 선택지 = `routines.slice(0,8)` 각 루틴명 + `schedule.rest`("휴식") + `schedule.unassigned`("비움") + 취소. 선택하면 `draftDays[i]` 갱신(저장은 아직 안 함)
3. `AppText label textMuted (mt12/mb4)` → `schedule.blockLabel` = **"훈련 주기 (블록)"**
4. `blockRow`(row/wrap/gap4) — 옵션 `[null,4,5,6]`
   - 칩 `blockOpt`: `paddingV 4 / paddingH 12 / radius pill / bg surfaceAlt / hairline border`; 선택되면 `bg primaryMuted, borderColor primary` + 텍스트 primary bold
   - 라벨: null → `schedule.blockNone`="블록 없음", n → `schedule.blockOption`="{weeks}주 + 1주 디로딩"
5. `AppText caption textFaint mt4` → `schedule.blockHint` = **"디로딩 주에는 표시만 해드려요 — 볼륨 조정 값은 루틴에서 직접 정합니다."**
6. `actions`(row/gap8/mt12): `common.cancel`("취소", secondary, flex1) / `common.save`("저장", primary, flex1)
7. `onDelete`가 있을 때만: `Button danger size=sm icon="trash-outline" mt8` → `schedule.deleteButton` = **"스케줄 삭제"**

**저장 `saveSchedule()`**
- `hasAny = draftDays.some(d=>d!==null) || draftBlock!=null`
- `next = hasAny ? { days: draftDays, blockWeeks: draftBlock, blockStartAt: draftBlock==null ? null : (기존 blockWeeks===draftBlock ? 기존 blockStartAt ?? Date.now() : Date.now()) } : null`
- `userRepo.updateUserSettings(user.id, { weeklySchedule: next })` → `setEditing(false)`

**삭제 `deleteSchedule()`**
- Alert `schedule.deleteTitle`="주간 스케줄 삭제" / `schedule.deleteMessage`="요일 배정과 블록 주기가 모두 삭제돼요. 루틴 자체는 그대로 남습니다."
- 확인 시 `userRepo.updateUserSettings(user.id, { weeklySchedule: null })`

**주차 계산 `currentBlockWeek(schedule, now)`** (`domain/weeklySchedule.ts`)
`cycleWeeks = blockWeeks + 1` · `weeksSince = floor((now - blockStartAt)/WEEK_MS)` · `week = weeksSince % cycleWeeks + 1` · `isDeload = week === cycleWeeks`. `blockWeeks`/`blockStartAt` 없거나 `now < blockStartAt`이면 `null`.

#### ④ 오늘의 안내 — 두 갈래 (스케줄 = SSOT)

**갈래 A — `!activeWorkoutId && weeklySchedule`**
- `<ScheduleTodayCard>`: `todayPlan(schedule, Date.now())` 결과로 분기
  - `kind==='routine'` → 배정 루틴이 현재 목록에 있으면 `Card style=recoCard`
    (`row/center/ bg primaryMuted / borderColor primary / 1px / marginBottom 8`)
    - 좌(flex1, marginRight 12): `label color=primary` → `schedule.todayLabel`="**오늘의 운동**"
      / (row gap6 mt2) 색점 8×8 radius4 + `heading numberOfLines=1` 루틴명
      / `caption textMuted mt2` → `schedule.todayHint`="**주간 스케줄 기준이에요**"
    - 우: `Button size=sm icon=play` → `routines.start`="**시작**" (disabled=busy) → `guardActive(()=>doStartFromRoutine(rid))`
    - 배정 루틴이 삭제된 상태면 **카드 자체를 렌더하지 않음(null)**
  - `kind==='rest' | 'none'` → `Card style=recoCardMuted`(bg surfaceAlt, mb8)
    - `label textMuted` "오늘의 운동" + `caption textMuted mt4`
      - rest → `schedule.todayRest` = "오늘은 휴식일이에요. 회복도 훈련입니다."
      - none → `schedule.todayNone` = "오늘은 배정된 루틴이 없어요 — 연필 아이콘으로 스케줄을 편집해 보세요."
- `<CatchUpCard>` — `catchUp && !reco?.alreadyWorkedOutToday`일 때만
  - 루틴이 삭제됐거나, `todayPlan`의 루틴과 같은 id면 **null**(중복 카드 방지)
  - `Card style=recoCardAlt`(row/center/ bg surfaceAlt / borderColor border / 1px / mb8)
    - `label color=warning` → `schedule.catchUpLabel`="**놓친 루틴**"
    - 색점 + `body bold` 루틴명
    - `caption textMuted mt2` → daysAgo===1 ? `schedule.catchUpYesterday`("어제 못한 루틴이에요 — 오늘 진행할까요?") : `schedule.catchUpDaysAgo`("{days}일 전 못한 루틴이에요 — 오늘 진행할까요?")
    - 우: `Button size=sm variant=secondary icon=play` "시작"
  - **판정 로직** `missedCatchUp(schedule, completedDayNums, now)`: 어제(ago=1)부터 최대 6일 역추적, 첫 번째로 만나는 "루틴 배정일"에서 그날 완료 세션이 있으면 `null`, 없으면 `{routineId, dayIdx, daysAgo}`. 휴식/미배정일은 건너뜀. **가장 최근 1건만** 노출.

**갈래 B — `!activeWorkoutId && !weeklySchedule && reco && !reco.alreadyWorkedOutToday`**
- `reco.status === 'ok'`
  - **주 추천 카드** `Card style=recoCard`(row/center/ bg primaryMuted / border primary 1px / mb8)
    - 좌(flex1, mr12): `label color=primary` → `routines.todayRecoLabel` = "**오늘의 추천 루틴**"
      / `heading numberOfLines=1 mt2` → `reco.routineName`
      / `caption textMuted mt2` → `routines.todayRecoHint` = "**오늘은 {muscle} 차례예요**" — `{muscle}` = `muscleLabel(reco.muscle, lang)` (가슴/등/어깨/이두/삼두/전완/대퇴사두/햄스트링/둔근/종아리/복근/승모/전신/기타)
    - 우: `Button size=sm icon=play` "시작" → `guardActive(()=>doStartFromRoutine(reco.routineId))`
  - **요일 습관 보조 카드** — `reco.weekdayHabit`가 있을 때만. `Card style=recoCardAlt`
    - `label textMuted` → `routines.weekdayHabitLabel` = "**지난주 이 요일엔**"
    - `body bold numberOfLines=1 mt2` → `weekdayHabit.routineName`
    - `caption textMuted mt2` → `routines.weekdayHabitHint` = "이 요일마다 하던 루틴이에요 — 예정대로 갈까요?"
    - 우: `Button size=sm variant=secondary icon=play` "시작"
- `reco.status === 'insufficient'` → `Card style=recoCardMuted`
  - `label textMuted` "오늘의 추천 루틴" + `caption textMuted mt4` → `routines.todayRecoInsufficient` = "일주일 이상 꾸준히 운동하면 오늘 할 루틴을 추천해드려요"

**추천을 결정하는 로직** (`domain/routineRecommendation.ts` + `data/analyticsRepository.getTodayRoutineRecommendation`)
1. repo: 최근 `RECO_WINDOW_DAYS`일의 `state='completed'` 운동 조회 → 세션별 종목 주근육(`exercise.primaryMuscles[0]`) 수집 → 현존하는 루틴만 `routineId/Name` 유지 → `RecoWorkout[]`
2. `alreadyWorkedOutToday` = 오늘(dayNumber) 완료 세션 존재 여부 → **true면 추천/캐치업 카드 숨김**
3. `recommendTodayRoutine(entries, now)`
   - 각 세션의 대표 부위 = `dominantMuscle(primaryMuscles)` (최빈, 동률이면 먼저 등장)
   - **꾸준함 게이트**: 서로 다른 운동일 수 ≥ `RECO_MIN_WORKOUT_DAYS(4)` **그리고** 첫~마지막 운동 간격 ≥ `RECO_MIN_SPAN_DAYS(6)` — 불충족 시 `insufficient`
   - 오늘 세션 제외한 과거만 사용, 과거가 비면 `insufficient`
   - **후보 순서**: ① 직전 부위의 최빈 "다음 부위"(전이 모델, 동률이면 오래 쉰 순 → 근육 정렬순) → ② 가장 오래 안 한 부위(LRU) → ③ 최후 폴백(직전 부위 포함)
   - 후보 중 **현존 루틴이 있는 첫 부위** 채택 → `{routineId, routineName, muscle, lastPerformedMs}`
4. `weekdayHabitRoutine(entries, now)` — 최근 21일(`WEEKDAY_HABIT_LOOKBACK_DAYS`) 내 **오늘과 같은 요일**에 같은 루틴 ≥2회(`WEEKDAY_HABIT_MIN_COUNT`)면 채택. 주 추천과 **id가 같으면 null**(중복 제거).

#### ⑤ 새 운동 진입 3버튼 (같은 크기 md 46, 각 `marginBottom: 8(sm)`)
| 순서 | title(i18n) | 한국어 | icon | variant | onPress |
|---|---|---|---|---|---|
| 1 | `routines.newRoutine` | **새 루틴** | `add` | secondary | `navigation.navigate('RoutineEditor')` (파라미터 없음 = 신규) |
| 2 | `routines.quickStart` | **빠른 운동 시작** | `flash` | primary (`loading={busy}`) | `guardActive(doStartBlank)` |
| 3 | `program.title` | **프로그램 생성** | `sparkles` | secondary | `navigation.navigate('ProgramGenerator')` |

- `doStartBlank()`: `busy` 가드 → `workoutRepo.startBlankWorkout()`(이름 "빠른 운동", routineId=null, state='active') → `setActiveWorkoutId(w.id)` → `navigate('ActiveWorkout',{workoutId})`. 실패 시 `Alert(common.error="오류", String(e))`
- `doStartFromRoutine(routineId)`: `workoutRepo.startWorkoutFromRoutine(routineId)` → 동일 흐름
- **`guardActive(start)`**: `activeWorkoutId` 없으면 즉시 `start()`. 있으면 Alert
  - 제목 `routines.activeExistsTitle` = "진행 중인 운동이 있어요"
  - 본문 `routines.activeExistsMessage` = "하던 운동을 그만두고 새로 시작할까요?"
  - 버튼 ①`common.cancel`("취소") ②`routines.resumeInstead`("이어서 하기") → `navigate('ActiveWorkout',{workoutId:activeWorkoutId})` ③`routines.discardAndStart`("폐기하고 새로 시작", destructive) → `workoutRepo.discardWorkout(activeWorkoutId)`(실패 무시) → `setActiveWorkoutId(null)` → `start()`

#### ⑥ `<ConceptRoutinesSection>` — "콘셉트 루틴"
래퍼 `View marginBottom: 8(sm)`
- `AppText label textMuted mb4` → `concept.sectionTitle` = **"콘셉트 루틴"**
- `conceptStyles.row`(row / gap 8) — `CONCEPT_ROUTINES` 전부를 **한 줄에 flex:1로 나열**(현재 4개)
  - 카드 `conceptStyles.card`: `flex:1 / padding 12(md) / radius 12(md) / bg surface / border 1px border / gap 2`
    - `AppText body bold numberOfLines=1` → `lang==='ko' ? c.nameKo : c.nameEn`
    - `AppText label textMuted` → `concept.dayCount` = "**{count}일 구성**"
  - **onPress → `setOpen(c)`** → 상세 모달
- 상세 모달(transparent/fade): backdrop `rgba(0,0,0,.5)`+center+padding24, sheet `maxWidth 380 / bg surface / radius 16 / padding 16`
  - `AppText title` → 콘셉트 이름
  - `AppText body textMuted mt4` → 스토리(`storyKo/storyEn`)
  - Day 박스 반복 `dayBox`(`mt8 / bg surfaceAlt / radius 8(sm) / padding 8`)
    - `caption bold color=primary` → Day 이름
    - `caption textMuted mt2` → `d.exercises.join(' · ')`
  - `actions`(row/gap8/mt12): `common.cancel`("취소", secondary, flex1) / `concept.saveButton`("**내 루틴에 저장**", primary, `loading={saving}`, flex1)
- **저장 `saveConcept(c)`**
  - 저장될 루틴명 규칙: `` `${콘셉트명} — ${Day명}` `` (em dash, 앞뒤 공백)
  - **중복 검사**: 만들어질 이름 중 하나라도 기존 루틴명(`existingNames` = `routines.map(r=>r.name)`)에 있으면
    Alert `concept.dupeTitle`="이미 있는 루틴" / `concept.dupeMessage`="같은 이름의 루틴이 이미 있어요. 그래도 저장할까요?" → 취소 / `common.save`("저장") 후 진행
  - 진행: `exerciseRepo.getExerciseIdsByNames(모든 종목 nameKo 유니크)` → `Map<nameKo, exerciseId>`
    → Day마다 매핑된 id만 남겨 `routineRepo.importRoutine(routineName(d), [{exerciseId},...])` (id를 못 찾은 종목은 조용히 제외, 종목 0개면 그 Day는 생성 안 함)
    → 모달 닫고 Alert `concept.savedTitle`="저장 완료" / `concept.savedMessage`="루틴 {count}개가 내 루틴에 추가됐어요. 주간 스케줄에 배정해 보세요."
  - `importRoutine` 기본값: targetSets 3, repsMin 8, repsMax 12, rest 120초, supersetGroup null, sortOrder=인덱스

**데이터 출처: `app/src/domain/conceptRoutines.ts`의 `CONCEPT_ROUTINES` (순수 상수 배열, 서버 없음)**
| id | nameKo | Day 구성(각 Day 종목은 시드 `name_ko`) |
|---|---|---|
| `boulder-shoulders` | **어깨깡패 프로젝트** | Day 1 프레스·측면(오버헤드 프레스 / 덤벨 레터럴 레이즈 / 인클라인 프레스 (덤벨) / 케이블 레터럴 레이즈) · Day 2 후면·상체 풀(페이스 풀 / 덤벨 리어 델트 플라이 / 랫 풀다운 / 덤벨 슈러그) |
| `big3-500` | **3대 500 로드** | Day 1 스쿼트(바벨 스쿼트 / 레그 프레스 / 시티드 레그 컬 / 플랭크) · Day 2 벤치(바벨 벤치프레스 / 인클라인 프레스 (덤벨) / 딥스 / 트라이셉스 푸시다운) · Day 3 데드리프트(데드리프트 / 바벨 로우 / 풀업 / 바벨 컬) |
| `profile-season` | **바디프로필 시즌** | Day 1 가슴·어깨(체스트 프레스 머신 / 케이블 크로스오버 / 숄더 프레스 머신 / 케이블 레터럴 레이즈) · Day 2 등·팔(랫 풀다운 / 시티드 케이블 로우 / 케이블 컬 / 로프 푸시다운) · Day 3 하체·코어(레그 프레스 / 힙 쓰러스트 (바벨) / 시티드 레그 컬 / 케이블 크런치) |
| `after-work-30` | **퇴근 후 30분** | Day 1 전신 푸시(고블릿 스쿼트 / 덤벨 벤치프레스 / 덤벨 숄더 프레스 / 플랭크) · Day 2 전신 풀(루마니안 데드리프트 (바벨) / 랫 풀다운 / 시티드 케이블 로우 / 덤벨 컬) |

스토리 한국어 원문(카드 모달용)
- 어깨깡패 프로젝트: "프레임이 달라 보이는 건 결국 어깨예요. 측면·후면 삼각근을 볼륨 있게 공략하는 주 2일 구성으로, 상체 실루엣의 인상을 노립니다."
- 3대 500 로드: "스쿼트·벤치·데드 합계 500을 향해 가는 파워빌딩 구성이에요. 메인 리프트를 앞에 무겁게, 보조 운동으로 약점을 채웁니다."
- 바디프로필 시즌: "촬영이 잡힌 것처럼 라인에 집중하는 볼륨 구성이에요. 머신·케이블로 자극 부위를 정확히 노리고, 코어 마무리로 미드섹션까지 챙깁니다."
- 퇴근 후 30분: "바쁜 날에도 끊기지 않는 게 우선이에요. 복합 운동 위주로 전신을 훑는 주 2일 미니멀 구성 — 짧게 끝내고 꾸준함을 지킵니다."

#### ⑦ "주변 헬스장 찾기" 행
`Pressable style=styles.gymEntry`:
`row / alignItems:center / gap 8(sm) / paddingVertical 12(md) / paddingHorizontal 12(md) / radius 12(md) / bg surface / border 1px border / marginBottom 16(lg)`
- Ionicons `location` 18 color primary
- `AppText body weight="medium" flex:1` → `gyms.entry` = **"주변 헬스장 찾기"**
- Ionicons `chevron-forward` 18 color textMuted
- **onPress → `navigation.navigate('NearbyGyms')`**
(스케줄 엔트리 행과 스타일이 거의 동일 — 아이콘과 marginBottom(8 vs 16)만 다름)

#### ⑧ `<SectionHeader title={t('routines.myRoutines')} />` = **"내 루틴"** (heading, mb12)

#### ⑨ 폴더 그룹 카드들 (`folderGroups.map`)
`FolderGroup` — `Card style=folderCard`(marginBottom 12(md))
- 헤더 `Pressable style=folderHead`(row/center/gap8)
  - Ionicons `folder-open`(열림) / `folder`(닫힘) 20px color primary
  - 중(flex1): `heading numberOfLines=1` 폴더명 / `caption textMuted mt2` → `routines.folderRoutineCount` = "**루틴 {count}개**"
  - Ionicons `chevron-up`/`chevron-down` 18 textMuted
  - onPress → `openFolders[name]` 토글
- 열렸을 때 멤버 행 `FolderRoutineRow` 반복
  - `folderMemberRow`: `row/center / marginTop 8 / paddingTop 8 / paddingLeft 12 / borderTop hairline border`
  - 좌(flex1, mr8): `body bold numberOfLines=1` 루틴명 / `caption textMuted mt2` → `routines.exerciseCount` = "**종목 {count}개**" (`routineRepo.queryRoutineExercises(routine.id)` 구독)
  - `Button size=sm` "시작" (disabled=busy) → `guardActive(()=>doStartFromRoutine(r.id))`
  - `IconButton icon="ellipsis-vertical" color=textMuted` → `openActions(routine)`
  - **폴더 내부는 드래그 핸들 없음(재배치 비대상)**

### 1.4 리스트 아이템 — `RoutineRow` (폴더 없는 루틴)
`Card style=routineCard`: `row / alignItems:center / justifyContent:space-between / marginBottom 12(md)`
1. **드래그 핸들** `Pressable style=[dragHandle, webDragHandleStyle]` — `width 30 / alignItems:center / marginRight 4(xs)`, `hitSlop 8`, `accessibilityLabel = routines.reorderHandle`("꾹 눌러 순서 변경"), 웹은 `touch-action:none; cursor:grab; user-select:none`
   - 아이콘 Ionicons `reorder-three` 24 textMuted (三)
   - `onPressIn = drag` (long-press가 아니라 **누르는 즉시** 드래그 시작)
2. `routineInfo`(flex1, marginRight 12)
   - `AppText heading numberOfLines=1` 루틴명
   - `AppText caption textMuted mt2` → `` `${folder} · ` `` (폴더 있을 때만) + `routines.exerciseCount`="종목 {count}개"
3. `routineActions`(row/center/gap 4(xs))
   - `Button size="sm" fullWidth={false}` → `routines.start`="시작", `disabled={busy}` → `guardActive(()=>doStartFromRoutine(item.id))`
   - `IconButton icon="ellipsis-vertical" color="textMuted"` → `openActions(item)`

**스와이프 액션은 없다.** 롱프레스도 없음 — 모든 관리 동작은 `⋮`(ellipsis) 액션시트 하나로 처리한다.

**`openActions(routine)`** — `Alert(routine.name, undefined, [...])`
| 버튼 | i18n | 동작 |
|---|---|---|
| 편집 | `routines.edit` | `navigation.navigate('RoutineEditor', { routineId })` |
| 복제 | `routines.duplicate` | `routineRepo.duplicateRoutine(id)` — 이름 `"{원본} (복사본)"`, 종목·변형·처방·유산소 목표까지 전부 복사 |
| 삭제 | `common.delete` (destructive) | `confirmDelete(routine)` |
| 취소 | `common.cancel` | — |

**`confirmDelete(routine)`**: Alert `routines.deleteTitle`="루틴 삭제" / `routines.deleteConfirm`="'{routineName}' 루틴을 삭제할까요?" → 취소 / 삭제(destructive) → `routineRepo.deleteRoutine(routine.id)`

**재배치 `handleReorder({from,to})`**: `looseRoutines`의 id 배열에서 from을 빼서 to에 삽입 → `routineRepo.reorderRoutines(ids)`(sort_order 0..n 재기록). 실패 시 Alert.

### 1.5 빈 상태 (`ListEmptyComponent`)
`routines.length === 0`일 때만 `EmptyState` — 전부 폴더로 들어가 loose 리스트가 비어도 폴더 그룹이 있으면 빈 상태 아님.
- title `routines.listEmptyTitle` = **"루틴이 없습니다"**
- message `routines.listEmptyMessage` = **"자주 하는 운동을 루틴으로 만들어 빠르게 시작하세요."**
- action `Button icon="add" fullWidth={false}` → `routines.createRoutine`="**새 루틴 만들기**" → `navigate('RoutineEditor')`

### 1.6 이 화면이 호출하는 data/domain 전부
`../../data`
- `routineRepo.queryRoutines()` — 루틴 목록 구독
- `routineRepo.queryRoutineExercises(routineId)` — 각 행의 종목 수
- `routineRepo.deleteRoutine(id)` / `duplicateRoutine(id)` / `reorderRoutines(orderedIds)` / `importRoutine(name, exercises)`
- `workoutRepo.startBlankWorkout()` / `startWorkoutFromRoutine(routineId)` / `discardWorkout(id)`
- `analyticsRepo.getTodayRoutineRecommendation()` / `getCompletedDayNumsSince(8)`
- `userRepo.updateUserSettings(userId, { weeklySchedule })`
- `exerciseRepo.getExerciseIdsByNames(namesKo[])`

`../../domain`
- `muscleLabel(muscle, lang)` · `todayPlan(schedule, now)` · `currentBlockWeek(schedule, now)` · `missedCatchUp(schedule, dayNums, now)` · `CONCEPT_ROUTINES`
- 타입: `ConceptRoutine`, `MissedPlan`, `ScheduleDay`, `WeeklySchedule`

### 1.7 네비게이션 대상 정리
`ActiveWorkout {workoutId}` · `RoutineEditor {routineId?}` · `ProgramGenerator` · `NearbyGyms`

---

## 2. RoutineEditorScreen.tsx — 루틴 편집기

### 2.1 골격
```
<SafeAreaView edges=[top,left,right] bg=#0E1116>
  <topBar>  ← chevron-back · "루틴 편집" · width40 스페이서
  <ReorderableList
    data={exercises}
    ListHeaderComponent={listHeader}   // 이름/폴더/메모 + 구분선 + "종목" 헤더 + 재배치 힌트
    renderItem={ExerciseEditRow}
    ListFooterComponent={listFooter}   // 운동 추가 / 구분선 / 완료 / 루틴 삭제 / barInset 스페이서
    ListEmptyComponent={EmptyState}
    contentContainerStyle={{ padding:16, paddingBottom:32 }} />
  <Modal supersetTarget />             // 슈퍼셋 상대 선택
</SafeAreaView>
```
`topBar`: `row / center / space-between / paddingH 12(md) / paddingV 8(sm) / borderBottom hairline border`
- 좌 `IconButton icon="chevron-back"` → `navigation.goBack()`
- 중 `AppText heading` → `routines.editorTitle` = **"루틴 편집"**
- 우 `<View width:40/>` (타이틀 중앙 유지용 스페이서 — **완료 버튼은 하단에 있다**)

### 2.2 상태
| 상태 | 구동 |
|---|---|
| `routineId` | 신규면 마운트 시 생성된 id, 기존이면 route 파라미터 |
| `creating` | `!paramRoutineId`로 시작 → 생성 완료 시 false |
| `name` / `notes` / `folder` | 3개 입력 필드 |
| `loadedMeta` | 메타 로드 완료 여부 |
| `folderOptions: string[]` | 폴더 칩 목록 (`routineRepo.getFolderNames()`) |
| `newFolderMode` | "새 폴더" 칩 선택 시 인라인 입력 표시 |
| `supersetTarget: RoutineExercise\|null` | 슈퍼셋 상대 선택 모달 |
| `ssVersion` | 슈퍼셋 그룹 변경 후 강제 재조회 키 |
| `exercises` | `useQueryData(routineRepo.queryRoutineExercises(routineId), [routineId, ssVersion])` |
| refs | `createdRef`(StrictMode 이중생성 방지) · `nameRef` · `handledRef`(명시적 종료 플래그) · `exercisesCountRef` |

**로딩 게이트**: `creating || !routineId || !loadedMeta`면 화면 전체가 중앙정렬 `AppText body textMuted` → `common.loading` = "**불러오는 중…**"

### 2.3 생성 · 저장 · 폐기 플로우 (중요)
- **신규 진입**: 마운트 시 `routineRepo.createRoutine({ name: t('routines.newRoutineName') })` → 이름 기본값 "**새 루틴**". `createdRef`로 1회 가드. 실패 시 Alert.
- **`hasRoutineContent()`** = `종목 수 > 0` **또는** (`name.trim() !== ''` **그리고** `name.trim() !== '새 루틴'`)
- **`beforeRemove`(뒤로가기) 리스너** — 기존 루틴(`paramRoutineId`)·미생성·`handledRef.current`면 아무것도 안 함
  - 내용 없음 → `routineRepo.deleteRoutine(routineId)` 조용히(빈 초안 정리) 후 그대로 나감
  - 내용 있음 → `e.preventDefault()` + Alert
    - 제목 `routines.discardTitle` = "**저장하지 않은 루틴**"
    - 본문 `routines.discardMessage` = "**작성 중인 루틴을 저장하지 않았습니다. 삭제하고 나갈까요?**"
    - 버튼 `routines.keepEditing`("계속 편집", cancel) / `routines.discardConfirm`("삭제하고 나가기", destructive) → `handledRef=true` + `deleteRoutine` + `navigation.dispatch(e.data.action)`
- **`onDone()`(완료 = 저장)**
  - 신규인데 내용 없음 → `handledRef=true` + `deleteRoutine` + `scheduleSync()` + `goBack()`
  - 아니면 `handledRef=true` → `await Promise.all([saveName(), saveFolder(), saveNotes()])`(블러 전 타이핑 확정) → `scheduleSync()`(`../../sync/syncEngine`) → `goBack()`
- **`deleteRoutine()`**: Alert `routines.deleteRoutineTitle`="루틴 삭제" / `routines.deleteRoutineMessage`="이 루틴을 삭제할까요? 되돌릴 수 없습니다." → 취소/삭제(destructive) → `handledRef=true` + `routineRepo.deleteRoutine` + `goBack()`
- **필드별 즉시 저장**(onBlur/onSubmitEditing): `saveName`(빈 문자열이면 저장 안 함) / `saveNotes`(빈 문자열 → null) / `saveFolder`(빈 문자열 → null; 새 폴더면 `folderOptions`에 push 후 ko locale 정렬)

### 2.4 listHeader (렌더 순서)
1. **루틴 이름** `TextField`
   - label `routines.nameLabel` = "**루틴 이름**", placeholder `routines.namePlaceholder` = "예: 상체 A", `returnKeyType="done"`, onBlur/onSubmit → `saveName`
2. **폴더** — 두 모드
   - `folderOptions.length === 0 && !newFolderMode` → 단순 `TextField` label `routines.folderLabel`="**폴더 (선택)**", placeholder `routines.folderPlaceholder`="예: 푸시/풀/레그"
   - 그 외 → 칩 픽커 (`View marginBottom: 12(md)`)
     - `AppText label textMuted mb4` "폴더 (선택)"
     - `folderChips`(row/wrap/gap 4(xs)) — 칩 `folderChip`: `row/center/gap4 / paddingH 8(sm) / paddingV 6 / radius 12(md) / bg surfaceAlt / border 1px border`; 활성 `folderChipActive`: `borderColor primary, bg primaryMuted` + 텍스트 primary
       - 첫 칩: `routines.folderNone` = "**폴더 없음**" → `pickFolder('')`
       - 기존 폴더 칩: Ionicons `folder-outline` 12 + 폴더명 → `pickFolder(f)`
       - 마지막 칩: Ionicons `add` 12 + `routines.folderNew` = "**새 폴더**" → `setFolder(''); setNewFolderMode(true)`
     - `newFolderMode`면 그 아래 `TextField autoFocus` placeholder `routines.folderNewPlaceholder`="새 폴더 이름" — onBlur/onSubmit에서 `saveFolder()` 후 값이 있으면 모드 해제
     - **`pickFolder(next)`**: 상태 갱신 + 즉시 `routineRepo.updateRoutine(routineId, { folder: next.trim() || null })` (블러 의존 없음)
3. **메모** `TextField multiline` — label `routines.notesLabel`="**메모 (선택)**", placeholder `routines.notesPlaceholder`="루틴 메모"
4. `<Divider/>` (hairline, `margin-y: 12(md)`)
5. `<SectionHeader title={t('routines.exercisesSection')}/>` = "**종목**"
6. `exercises.length >= 2`일 때만 `AppText caption textFaint mb8` → `routines.reorderHint` = "**≡ 핸들을 꾹 눌러 드래그하면 순서를 바꿀 수 있어요.**"

### 2.5 listFooter
- `Button icon="add" variant="secondary" marginTop 12(md)` → `routines.addExercise` = "**운동 추가**" → `addExercise()`
- `<Divider/>`
- `Button icon="checkmark"` (primary, mt8) → `common.done` = "**완료**" → `onDone()`
- `Button variant="danger"` (mt8) → `routines.deleteRoutineTitle` = "**루틴 삭제**" → `deleteRoutine()`
- `barInset > 0`이면 그 높이만큼 스페이서(운동 중 전역 바가 덮는 영역)

### 2.6 빈 상태
`EmptyState` — title `routines.editorEmptyTitle` = "**종목이 없습니다**", message `routines.editorEmptyMessage` = "**아래 버튼으로 운동을 추가하세요.**"

### 2.7 `ExerciseEditRow` — 종목 행 (핵심)
래퍼: `grouped`면 `ssWrap`(position:relative)

**(0) 슈퍼셋 시각 띠** — `grouped`일 때만 절대위치 바
`ssBand`: `position:absolute / left:-8 / top:2 / bottom: 12+2 / width:4 / radius:2 / bg primary`
- `sameGroupAsPrev` → `top: -12`(위 카드와 이어짐) · `sameGroupAsNext` → `bottom: -2`(아래 카드와 이어짐)

**카드** `Card style=[exCard, grouped && exCardGrouped, isActive && exCardActive]`
- `exCard`: `marginBottom 12(md)` + `gap 12(md)` (Card 기본 padding 16 / radius 12 / bg surface)
- `exCardGrouped`: `borderColor primary, borderWidth 1`
- `exCardActive`(드래그 중): `borderColor primary, borderWidth 1, opacity .95`

**① `exHeader`** (row / center / gap 8)
- 드래그 핸들 `Pressable style=[handle, webDrag]` — `width 28 / alignItems:center`, `hitSlop 8`, `onPressIn = drag`, Ionicons `reorder-three` 24 textMuted
- `exTitle`(flex1 / gap 2)
  - `<ExerciseName exerciseId={re.exerciseId} variant="body" base />` — 기구 토큰 뗀 베이스명
  - `AppText caption textMuted`
    - 유산소면 `routines.cardioRowLabel` = "**{index}. 유산소**"
    - 아니면 `routines.exerciseRowSummary` = "**{index}. {sets}세트 · 휴식 {rest}초**" (index는 1-based)
  - `exVariant`(row/wrap/gap6/mt4): `<VariantSelector exerciseId baseEquipment value={variant} onChange/>`
    - 트리거는 칩 형태(Ionicons `options-outline` 12 + 라벨 caption + `chevron-down` 12), 선택되면 primary 색
    - `onChange(dims)` → 로컬 `setVariant` + `routineRepo.setRoutineExerciseVariant(re.id, dims)`
    - **그립 편집은 여기 없음** — 세션의 세트 ▼ 변형 시트 담당(루틴 편집기는 기구 변형만)
- `re.supersetGroup`이면 `Tag label={t('routines.supersetTag')} tone="primary"` = "**슈퍼셋**"

**② 본문 — 유산소 분기**
- `isCardio`(= `exercise.kind === 'cardio'`)면 `<CardioTargetFields>`만 렌더 (세트/무게/휴식/처방 전부 숨김)
  - `cardioFields`: row / wrap / gap 12(md); 각 필드 `flexGrow:1 / flexBasis:'30%' / minWidth:90`
  - 필드 = `cardioMetricsFor({nameEn})` 결과(기본 `['duration','distance']`)
  - 라벨(label, textMuted, mb4): `routines.cardioDurationLabel`="시간(분)" / `cardioDistanceLabel`="거리(km)" / `cardioInclineLabel`="경사(%)" / `cardioLevelLabel`="단계" / `cardioSpeedLabel`="속도(km/h)"
  - 입력 `cardioInput`: `border 1px border / radius 8(sm) / paddingH 12 / paddingV 8 / bg surface / 16px / textAlign center / placeholder "0"(textFaint)`, numeric
  - onBlur/onSubmit → `persist()` = `routineRepo.updateRoutineExercise(re.id, { cardioTarget: { durationSec: minInputToSec(mins), distanceM: kmInputToM(km), incline: inputToIncline(...), level: inputToLevel(...), speed: inputToSpeed(...) } })`
  - 변환 규칙: 분↔초(`round(n*60)`), km↔m(`round(n*1000)`), incline/speed는 소수 1자리 반올림, level은 정수. **0/음수/NaN → null**
- 근력이면 아래 ③~⑤

**③ 세트 · 휴식 행** `fieldRow`(row / gap 16(lg)), 각 `field`(flex1), 라벨 `fieldLabel`(label/textMuted/mb4)
- `routines.setsLabel` = "**세트**" → `NumberStepper value={sets} min={1} step={1}` → `setSets(v)` + `updateRoutineExercise(re.id,{targetSets:v})`
- `routines.restLabel` = "**휴식(초)**" → `NumberStepper value={rest} min={0} step={15}` → `updateRoutineExercise(re.id,{restSeconds:v})`

**④ 무게 행** `fieldRow` — 좌 필드만 사용, 우는 `<View flex:1/>` 빈칸
- 라벨 `routines.weightLabel` = "**무게({weightUnit})**" (kg/lb)
- `NumberStepper value={weightDisp} min={0} step={weightUnit==='kg' ? 2.5 : 5}` → `updateRoutineExercise(re.id,{ targetWeightKg: v>0 ? toKg(v, unit) : null })`
- 표시는 사용자 단위, **저장은 항상 kg**

**⑤ `<PrescriptionEditor re onSaved={(n)=>setSets(n)} />`** — 세트별 처방 (2.9 참조)

**⑥ `rowActions`**(row / center / gap 4(xs))
- 좌측 `<View flex:1/>` 스페이서 (화살표 이동 버튼은 폐지됨 — 순서 변경은 三 핸들 드래그 전용)
- `total >= 2`일 때만 슈퍼셋 버튼: `Button size="sm" variant="ghost" icon="git-merge-outline" fullWidth={false}`
  - `grouped`면 `routines.supersetUnlink`="**슈퍼셋 해제**" → `unlinkSuperset(re)`
  - 아니면 `routines.supersetLink`="**슈퍼셋**" → `openSuperset(re)`
- `Button size="sm" variant="ghost"` → `routines.swap` = "**대체**" → `swap(re)`
- `IconButton icon="trash-outline" size=18 color="danger"` → `removeExercise(re)`

**행 로컬 상태**: `sets` `rest` `weightDisp` `variant` `baseEquipment` `isCardio` `cardioMetrics`.
모델 값이 외부에서 바뀌면(스왑/복제) `useEffect`로 동기화. `exerciseRepo.getExercise(re.exerciseId)`로 `equipment`/`kind`/`cardioMetricsFor(nameEn)` 취득.

### 2.8 종목 추가 · 대체 · 삭제 · 재배치 · 슈퍼셋
| 동작 | 구현 |
|---|---|
| 추가 `addExercise()` | `requestExercisePick(exId => routineRepo.addExerciseToRoutine(routineId, exId))` → `navigate('ExerciseList', { mode:'pick' })`. 기본값: sets 3 / repsMin 8 / repsMax 12 / rest 120 |
| 대체 `swap(re)` | `requestExercisePick(exId => routineRepo.swapRoutineExercise(re.id, exId))` → 동일 화면 이동. 스왑 시 **변형은 새 종목의 마지막 수행 변형을 승계**(이전 변형 상속 금지) |
| 삭제 `removeExercise(re)` | Alert `routines.removeExerciseTitle`="종목 삭제" / `routines.removeExerciseMessage`="이 종목을 루틴에서 제거할까요?" → 취소/삭제 → `routineRepo.removeRoutineExercise(re.id)` |
| 화살표 이동 `move(index, ±1)` | 코드에는 남아 있으나 **UI에서 호출되지 않음**(핸들에 `onMoveUp/onMoveDown`이 연결만 되고 버튼 없음). `reorderRoutineExercises(ordered)` |
| 드래그 `handleReorder({from,to})` | id 배열 splice → `routineRepo.reorderRoutineExercises(ids)` |
| 슈퍼셋 묶기 | `openSuperset(re)` → `setSupersetTarget(re)` → 모달에서 상대 선택 → `chooseSupersetPartner(partner)` |
| 슈퍼셋 해제 `unlinkSuperset(re)` | 그룹 멤버 ≤2면 **그룹 전체 해제**, 아니면 이 종목만 제외 → `routineRepo.ungroupSuperset(ids)` → `setSsVersion(v=>v+1)` |

**`chooseSupersetPartner(partner)`**: target(+기존 그룹원 전체)과 partner(+기존 그룹원 전체)의 id를 `Set`으로 합집합 → `routineRepo.groupAsSuperset(ids)`(새 `ss_xxx` 그룹키 발급) → `setSsVersion(v=>v+1)`. `partner.id === target.id`면 무시.

**슈퍼셋 상대 선택 모달** (`visible={!!supersetTarget}`, transparent/fade)
- `ssBackdrop`: `flex1 / rgba(0,0,0,.5) / justifyContent:center / padding 24(xl)` (가로 중앙정렬 없음 = 폭 꽉 참)
- `ssSheet`: `bg surface / radius 16(lg) / padding 16(lg) / maxHeight 80%`
- `AppText heading mb8` → `routines.supersetPickTitle` = "**슈퍼셋으로 묶을 종목 선택**"
- `ScrollView maxHeight 360` — 자기 자신 제외한 종목들
  - `ssOption`: row / center / space-between / paddingV 8(sm) / borderBottom hairline border
  - 좌 `<ExerciseName variant="body" base />`, 우 이미 그룹이면 `Tag "슈퍼셋" tone=primary`
  - 후보 0개면 `AppText caption textMuted` → `routines.supersetNoPartner` = "**묶을 다른 종목이 없어요**"
- 하단 `Button variant="secondary" mt12` → `common.cancel`="취소"

### 2.9 `PrescriptionEditor` — 세트별 처방 칩 + 모달 (SRS-043)
래퍼 `View marginTop: 8(sm)`
- **칩** `Pressable style=[rxStyles.chip, summary && chipOn]`
  - chip: `row/center/gap6 / alignSelf:flex-start / paddingH 8(sm) / paddingV 4 / radius pill / hairline border border / bg surfaceAlt`
  - chipOn(처방 있음): `borderColor primary / bg primaryMuted`
  - Ionicons `clipboard-outline` 14 (있으면 primary, 없으면 textMuted)
  - 텍스트 caption — 처방 있으면 `routines.rxSummary` = "**처방 {summary}**"(bold, primary), 없으면 `routines.rxButton` = "**처방 설정**"(textMuted)
  - `summary` = `rxSummary(savedRx)` = 각 행 타입 문자를 공백으로 이은 문자열, `RX_SUMMARY_CHAR = { normal:'·', warmup:'W', top:'T', backoff:'B' }` → 예 `"W W T B"`
  - **onPress → `openEditor()`**: 저장된 처방이 있으면 그 복사본으로, 없으면 `max(1, targetSets)`개의 `emptyRxRow()`로 rows 초기화 후 모달 오픈
- **모달**: backdrop `rgba(0,0,0,.5)`+center+padding24 / sheet `maxWidth 400 / bg surface / radius 16 / padding 16`
  - `AppText heading` → `routines.rxTitle` = "**세트별 처방**"
  - `AppText caption textMuted (mt2/mb8)` → `routines.rxHint` = "**타입을 탭해 웜업/탑/백오프를 순환합니다. 저장하면 세트 수가 처방 세트 수로 맞춰집니다. 모든 행이 비어 있으면 처방이 제거됩니다.**"
  - `<PrescriptionRows rows onChange={setRows} />` (§3)
  - `actions`(row/gap8/mt12): `common.cancel`("취소", secondary, flex1) / `common.save`("저장", primary, flex1)
- **저장 `save()`**
  - `hasAny` = 한 행이라도 `setType!=='normal' || targetRir!=null || repMin!=null || repMax!=null`
  - `routineRepo.setRoutineExercisePrescription(re.id, hasAny ? rows : null)`
    - repo가 **처방이 있으면 `targetSets = prescription.length`로 함께 갱신**
  - 로컬 미러 `setSavedRx` 갱신(필드 변경은 observe가 재방출 안 하므로 필수), `hasAny`면 `onSaved(rows.length)` → 부모 `setSets(n)`
  - 모달 닫기. 실패 시 Alert.

### 2.10 이 화면이 호출하는 data/domain 전부
`../../data`
- `routineRepo`: `getFolderNames` · `createRoutine` · `getRoutine` · `updateRoutine` · `deleteRoutine` · `queryRoutineExercises` · `addExerciseToRoutine` · `updateRoutineExercise` · `setRoutineExercisePrescription` · `setRoutineExerciseVariant` · `removeRoutineExercise` · `swapRoutineExercise` · `reorderRoutineExercises` · `groupAsSuperset` · `ungroupSuperset`
- `exerciseRepo.getExercise(id)`

`../../domain`
- 단위: `fromKg` · `toKg`
- 유산소: `cardioMetricsFor` · `secToMinInput` · `minInputToSec` · `mToKmInput` · `kmInputToM` · `cardioNumInput` · `inputToIncline` · `inputToLevel` · `inputToSpeed`
- 타입: `ArmKey` `CardioMetric` `EquipmentType` `GripKey` `VariantDims` `PrescribedSet` `PrescribedSetType`

기타: `scheduleSync()`(`../../sync/syncEngine`) · `requestExercisePick`(`../../utils/picker`) · `useWorkoutBarInset`

---

## 3. PrescriptionRows.tsx — 처방 행 에디터 (프레젠테이셔널 공용)

루틴 에디터(로컬 저장)와 코칭 화면(원격 저장)이 **공유**하는 순수 표현 컴포넌트. 저장·영속은 호출측 책임.

**export**
- `RX_SUMMARY_CHAR: Record<PrescribedSetType,string>` = `{ normal:'·', warmup:'W', top:'T', backoff:'B' }`
- `emptyRxRow(): PrescribedSet` = `{ setType:'normal', targetRir:null, repMin:null, repMax:null, loadHint:null }`
- `rxSummary(rx)` — 없거나 빈 배열이면 `null`, 아니면 타입문자 공백 join
- `PrescriptionRows({ rows, onChange })`

**렌더 순서**
1. `gridHead`(row / center / gap 4(xs) / paddingBottom 4) — 전부 `AppText label color="textFaint"`
   - `colType`(width 86) → `routines.rxColType` = "**타입**"
   - `colNum`(flex1, textAlign center) → `routines.rxColRir` = "**RIR**"
   - `colNum` → `routines.rxColRepMin` = "**최소**"
   - `colNum` → `routines.rxColRepMax` = "**최대**"
   - `colDel`(width 32) 빈 칸
2. `ScrollView maxHeight: 320` — 행 반복 `row`(row/center/gap 4(xs)/paddingV 3)
   - **타입 버튼** `Button size="sm" fullWidth={false} style={{width:86}}` — variant는 `normal`이면 `ghost`, 그 외 `secondary`
     - 라벨: `routines.rxType.normal`="**일반**" / `.warmup`="**웜업**" / `.top`="**탑**" / `.backoff`="**백오프**"
     - **onPress → `cycleType(i)`**: 순서 `normal → warmup → top → backoff → normal`
   - 숫자 셀 3개 (`targetRir`, `repMin`, `repMax`) — `numCell`: `flex1 / minWidth 0 / height 38 / textAlign center / color text / 16px / bg surfaceAlt / radius 8(sm) / hairline border / placeholder "–"(textFaint)`, numeric
     - **`setNum`**: `parseInt(txt,10)` → NaN이거나 `<0`이면 `null`; `targetRir`은 `min(6, n)`으로 상한(0~6)
   - `IconButton icon="close" size=16 color="textFaint"` → 행 삭제. **행이 1개뿐이면 삭제하지 않음**(`rows.length>1`일 때만 filter)
3. `Button icon="add" variant="secondary" size="sm" marginTop 8(sm)` → `routines.rxAddSet` = "**세트 추가**" → `onChange([...rows, emptyRxRow()])`

**도메인 규칙** (`domain/prescription.ts`)
- `PrescribedSet = { setType, targetRir(0~6|null), repMin, repMax, loadHint('light'|'medium'|'heavy'|null) }` — `loadHint`는 이 UI에서 편집하지 않음
- 타입별 권장 휴식(참고): warmup 45 / top 180 / backoff 120초, normal은 종목 설정값
- 반복범위 라벨 헬퍼 `repRangeLabel(min,max)` — `"4-7"` / `"8"` / `"8+"` / `"~12"` / `""`

---

## 4. ExerciseName.tsx — 종목 이름 표시 헬퍼

```tsx
<ExerciseName exerciseId variant="body"|"title"|"heading"|"caption"|"label"
              color="text"|"textMuted"|"textFaint" base?={boolean} />
```
- 마운트/`exerciseId` 변경 시 `exerciseRepo.getExercise(exerciseId)` 비동기 조회 → 로컬 `ex` 상태. `alive` 플래그로 언마운트 후 setState 방지, 실패는 무시.
- 렌더: `AppText variant color numberOfLines={1}`
  - 로드 전에는 **`'…'`** (U+2026) 표시
  - `base`면 `baseExerciseName(ex, lang)`(기구 토큰 제거한 베이스명), 아니면 `exerciseDisplayName(ex, lang)`
- 웹 이관 시: 종목 캐시(`Map<id, Exercise>`)를 두고 SWR/react-query로 대체하는 편이 낫다(현재는 행마다 개별 조회 — RoutineEditor 종목 수만큼 병렬 호출).

---

## 5. 웹 이관 시 주의사항 체크리스트

1. **WatermelonDB observe의 함정** — `folder`, `supersetGroup`, `prescription` 같은 **필드 변경은 query.observe()가 재방출하지 않는다**. 그래서 `focusTick`(WorkoutTab), `ssVersion`(Editor), `savedRx` 로컬 미러(PrescriptionEditor) 세 곳에 강제 재계산 장치가 있다. 웹에서 일반 DB/API를 쓴다면 이 우회는 불필요 — 대신 **저장 후 재조회/invalidate**를 확실히 걸 것.
2. **Alert 기반 UX가 많다** — `guardActive`, `openActions`(루틴 관리), `pickDay`(요일 배정, 루틴 8개 제한), `showDay`, 각종 삭제 확인. 웹에서는 ActionSheet/Dialog/DropdownMenu 컴포넌트로 치환 필요. 특히 **`pickDay`는 루틴이 8개를 넘으면 잘린다**(Alert 한계) — 웹에서는 전체 목록 셀렉트로 개선 가능.
3. **드래그 재배치** 2곳: 루틴 목록(폴더 없는 것만), 종목 목록. 핸들은 `onPressIn`으로 즉시 드래그, 웹은 `touch-action:none`.
4. **스와이프/롱프레스 액션은 존재하지 않는다** — 관리 진입점은 `⋮` 아이콘 버튼뿐.
5. **저장 타이밍**: 루틴 이름/폴더/메모는 onBlur 저장 + '완료'에서 재저장. 종목 세트/휴식/무게/변형/유산소 목표는 **변경 즉시 저장**(스테퍼 조작마다 write).
6. **단위**: 무게는 표시=사용자 단위, 저장=kg(`toKg/fromKg`), step은 kg 2.5 / lb 5.
7. **`weeklySchedule`가 있으면 추천 카드는 완전히 숨긴다**(스케줄 = SSOT). 반대로 스케줄이 없으면 스케줄 카드 대신 "주간 스케줄 만들기" 엔트리 행만 나온다.
8. **오늘 이미 운동했으면**(`reco.alreadyWorkedOutToday`) 추천·캐치업 카드 모두 숨김.
9. 요일 인덱스는 **월=0** 관례(`(new Date().getDay()+6)%7`).
