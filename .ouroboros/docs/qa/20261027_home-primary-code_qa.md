# /qa code — 홈 주 행동 규칙(화면 정리 M-2 확정 A) · f99bcd8

- 대상: `git show f99bcd8`(src/) — `core/domain/homePrimary.ts`, `core/data/analyticsRepository.ts`, `frontend/app/components/routines/RoutinesClient.tsx`, e2e `home-primary.spec.ts`·`declutter-p4.spec.ts`, 단위 `homePrimary.test.ts`
- 스펙: `.ouroboros/docs/spec/20261027_declutter/spec.md` 154행 무렵(M-2 확정 A)
- 캡처: `shots/m2/home-{routine,active,noroutine}-390-{light,dark}.png` 직접 확인
- 검증: `cd src && make verify` → EXIT 0(단위 316/316 통과). e2e는 돌리지 않음(코드 읽기로 판단)
- 패널(2명): **UI·정보 위계 담당**(빨강 채움 개수, 카드 겹침, 문구, 레이아웃 이동) · **상태·회귀 담당**(규칙 엣지, 비동기 로딩 순서, 데이터 정확도, 테스트가 실제로 회귀를 막는지)

## 총평

`pickHomePrimary`는 순수 함수이고 순서(운동 중 → 루틴 0 → 오늘 운동함 → 휴식일 → 스케줄 > 추천 > 최근 > 첫 루틴, 없는 id는 건너뜀)도 스펙과 일치한다. 빨강을 칠하는 곳(TodayCard·RecoCard·NextCard·빠른 시작)이 모두 `primary` 하나만 보고 정해지므로 **안정 상태에서는 빨강 채움이 1개 이하**다. 운동 중 0개도 성립한다(캡처 active와 일치).
문제는 **안정 상태에 이르기 전**이다. `homeReady`가 「루틴 목록이 아직 안 읽혔다」, 「진행 중 운동을 아직 안 읽었다」, 「추천이 지난 상태다」를 가려내지 못한다. 그래서 커밋이 막았다고 한 깜빡임이 콜드 로드와 운동 완료 직후에 그대로 남고, `home-ready` 표식도 그 순간에 이미 떠 있다. 그 결과 e2e가 기다리는 표식을 믿을 수 없다. 이 밖의 지적은 정보 위계(같은 루틴이 두 번 보이고 머리말이 겹침)와 놓친 루틴·보관 루틴과의 상호작용이다.

| # | 심각도 | 제목 |
|---|---|---|
| H-1 | 높음 | `homeReady`가 「루틴 목록 미로딩(=[])」을 「루틴 0개」로 오인해 빠른 시작이 빨강이었다가 바뀌는 깜빡임·레이아웃 이동, `home-ready` 표식도 조기 노출 |
| H-2 | 높음 | 진행 중 운동을 읽기 전·운동 완료 직후에는 지난 `reco`·`active=false`로 판단해 빨강이 잘못 떴다가 사라짐 |
| M-1 | 중간 | 머리말 「내 루틴」이 바로 아래 구역 제목과 같고, 같은 루틴이 두 번 보임(main 지적) |
| M-2 | 중간 | NextCard 삽입이 빠른 시작을 밀어 내려 오탭을 유발함(CLS) |
| M-3 | 중간 | 놓친 루틴 카드와 「다음 운동」이 엇갈린 할 일을 동시에 권하거나 같은 루틴을 두 번 보여 줌 |
| M-4 | 중간 | 추천 루틴이 보관(archived)된 경우 RecoCard가 보관 루틴을 권하고, 그 옆에 NextCard까지 떠서 카드 두 장이 경쟁함 |
| M-5 | 중간 | 추천 조회가 실패하면 영구히 `homeReady=false`가 되어 주 행동 0개, `home-ready` 표식도 뜨지 않음 |
| M-6 | 중간 | 테스트 공백: 회귀 가드가 깜빡임·휴식일·추천 주 행동·지운/보관 루틴·놓친 루틴을 재지 않고, declutter-p4는 개수만 잼 |
| L-1 | 낮음 | 「첫 루틴」 폴백 순서가 화면 순서와 다름(폴더가 화면 위인데 id 목록은 낱개가 먼저) |
| L-2 | 낮음 | 스케줄은 있으나 오늘 배정이 없는 날, 「오늘은 배정된 루틴이 없어요」와 빨강 「오늘의 추천 루틴」이 함께 보임 |
| L-3 | 낮음 | 자정을 넘겨 홈을 띄워 둔 채면 `alreadyWorkedOutToday`가 어제 값으로 남음 |
| L-4 | 낮음 | `lastRoutineId`가 35일 창에 묶여 오래 쉰 사용자는 「최근」 대신 「첫 루틴」을 받음, 보관 루틴 필터도 없음 |
| L-5 | 낮음 | 루틴 0개 화면에 「추천 불가 안내」 카드가 남아 있음(기존 동작, 캡처 noroutine) |

치명 항목은 없다.

---

## 높음

### H-1 루틴 목록을 읽기 전 상태를 「루틴 0개」로 봄: 깜빡임·레이아웃 이동·표식 조기 노출 (상태·회귀 / UI)
- 위치: `src/frontend/app/components/routines/RoutinesClient.tsx:235` `const homeReady = !!repos && (routines.length === 0 || reco !== null);`, 같은 파일 `:342` `home-ready` 표식, `src/core/src/db/hooks.ts:10` (`useQueryData` 초기값 `[]`, 로딩 여부를 구분하지 않음)
- 원인: `repos`가 세팅된 직후 `queryRoutines().observe()`가 첫 값을 내기 전에는 `routines=[]`다. 이때 `homeReady=true`이고 `pickHomePrimary`가 `{quick, noRoutines}`를 고른다. 그 결과 **빠른 시작이 빨강**이 되고 `home-ready`가 붙는다. 그다음 루틴이 도착한다.
  - reco가 아직 없으면 `homeReady=false`가 되어 빨강이 0개가 되고, reco가 오면 NextCard가 빨강이 된다. 빨강이 빠른 시작 → 없음 → NextCard로 옮겨 간다.
  - reco가 먼저 왔으면 곧바로 빠른 시작 → NextCard로 옮겨 간다.
- 재현: 루틴 1개 이상, 이력 없음. 홈을 새로고침하고(저사양 기기나 LokiJS 첫 로드가 느릴 때 두드러짐) 처음 몇 프레임을 녹화한다. 빠른 시작이 빨강이었다가 회색이 되고, 그 위에 NextCard가 끼어든다.
- 영향: 커밋 메시지와 스펙의 「추천을 읽기 전에는 판단하지 않는다(깜빡임 방지)」가 콜드 로드에서는 지켜지지 않는다. e2e `주행동_계산_대기`는 이 순간에 이미 붙은 `home-ready`를 통과해 버린다. 그러면 결과가 실패 쪽으로 흔들리거나(측정 시점에 따라 `btn-quick-start`), 운이 좋으면 통과한다.
- 수정안: 루틴 목록이 **처음 도착했는지**를 알 수 있게 한다. 예를 들어 `useQueryData`에 `loaded` 플래그를 돌려주는 변형(`useQueryDataWithStatus`)을 두거나, 이 화면에서 `routinesLoaded` state를 첫 emit 때 true로 바꾼다. 그 뒤 `homeReady = repos && routinesLoaded && sessionLoaded && (routines.length === 0 || recoFresh)`로 바꾼다. 판단 전에는 빨강 0개와 자리 고정(H-1과 M-2 공통, 아래 M-2 수정안)을 함께 적용한다.

### H-2 진행 중 운동 미확인·지난 reco로 판단해 빨강이 잘못 떴다 사라짐 (상태·회귀)
- 위치: `RoutinesClient.tsx:235`(active 로딩 여부를 보지 않음), `:113-129`(reco 재조회 시 이전 `reco`를 비우지 않음), `src/frontend/app/components/SessionProvider.tsx:37,66`(active 초기값 `null`, 로딩 플래그 없음)
- 시나리오 A(운동 중 콜드 로드): 진행 중 운동이 있는 상태에서 앱을 새로 연다. `refreshActive()`가 끝나기 전에는 `activeWorkoutId=null`이다. 루틴과 reco가 먼저 오면 `primary=routine`이 되어 NextCard나 TodayCard가 **빨강**이 되고, 빠른 시작은 회색이다. 이어 active가 도착하면 빨강이 사라지고 NextCard도 언마운트되어 레이아웃이 위로 튄다. 「운동 중이면 빨강 0개」 규칙이 잠깐 깨진다.
- 시나리오 B(운동 완료 직후): 운동을 완료하고 클라이언트 내비게이션으로 홈에 돌아오면 `activeWorkoutId`가 null로 바뀌고 효과가 reco를 다시 읽는다. 하지만 그동안에는 **이전 reco(`alreadyWorkedOutToday=false`)** 가 남아 있다. 그래서 `primary=routine`이 되어 방금 마친 루틴의 「시작」이 빨강으로 보이고, 새 reco가 도착하면 빠른 시작이 빨강으로 바뀐다. 방금 끝낸 루틴을 다시 하라고 권하는 꼴이다. e2e는 완료 뒤 `page.goto("/")`로 새로 로드해 이 경로를 재지 않는다.
- 수정안: (1) SessionProvider에 `activeLoaded`(첫 `refreshActive` 완료)를 노출하고 `homeReady`에 포함한다. (2) reco를 다시 읽는 효과의 시작에서 `setReco(null)`을 하거나, reco에 「계산 시점의 activeWorkoutId·routineCount」 키를 함께 저장해 현재 키와 다르면 stale로 본다. (3) 완료 경로에서 `alreadyWorkedOutToday`를 낙관적으로 true로 둔다(완료 직후에는 확정 사실이다).

---

## 중간

### M-1 머리말 「내 루틴」 중복과 같은 루틴 두 번 노출 (UI·정보 위계 — main 지적, 심각도 **중간**)
- 위치: `RoutinesClient.tsx:819-824`(NextCard 라벨), `src/core/src/i18n/locales/ko.ts`의 `routines.nextFirstLabel: "내 루틴"`과 `routines.myRoutines: "내 루틴"`(같은 문자열)
- 재현: 캡처 `home-routine-390-light.png`를 보면 위 카드 머리말이 「내 루틴」인데 바로 아래 구역 제목도 「내 루틴」이고, 「가슴·삼두 A」가 위 카드와 목록에 두 번 나온다. 루틴이 1개인 신규 사용자(가장 흔한 첫 경험)는 화면 절반이 같은 정보다.
- 왜 중간인가: 기능 결함은 아니다. 다만 「왜 이 루틴이 위에 있는가」가 문구로 설명되지 않는다. 그래서 위 카드가 근거 있는 권고로 읽히지 않고 목록 복사본처럼 보인다. 이 문제가 M-2 확정 A가 노린 「주 행동 하나」의 설득력을 깎는다.
- 수정안(권장 조합):
  1. **머리말을 근거별로 바꾼다.** `first`는 「오늘 할 운동」, `recent`는 「지난번에 한 루틴」(또는 「이어서 하기」), `reco`는 「오늘의 추천 루틴」(현행), `schedule`은 TodayCard 「오늘의 운동」(현행)이다. 「내 루틴」은 구역 제목에만 남긴다.
  2. **근거 한 줄을 단다.** 이미 있는 데이터로 충분하다. `recent`는 「마지막 3일 전 · 종목 5개」, `first`는 「목록 첫 루틴 · 종목 1개」 또는 「스케줄을 만들면 요일마다 골라 드려요」, `reco`는 현행 `todayRecoHint`다. TodayCard·RecoCard와 같은 3행 구조(라벨, 이름, 캡션)라 위계도 맞는다.
  3. **목록에서 빼지 않되 중복이 덜 보이게 한다.** 목록의 해당 행 이름 옆에 작은 무채 칩 「오늘」(또는 brand 점)을 달아 위 카드와 같은 루틴임을 알린다. 행 「시작」은 회색 그대로 둔다. 빼면 목록 순서와 개수가 흔들리고 ⋯ 메뉴 접근이 사라지므로 빼지 않는 쪽을 권한다.
  4. (선택) 루틴이 **1개뿐이고 source가 `first`** 일 때는 NextCard를 띄우지 않고 목록 행 「시작」을 빨강으로 하는 방법도 있다. 그러면 중복이 0이 된다. 단점은 주 행동이 목록 안으로 내려가 빠른 시작보다 아래에 놓이는 것이라 「주 행동이 먼저 보인다」와 충돌한다. 그러니 1~3을 먼저 적용하고 4는 사용자 확인 사항으로 둔다.

### M-2 NextCard 삽입이 빠른 시작을 밀어 내림: 레이아웃 이동·오탭 (UI)
- 위치: `RoutinesClient.tsx:345`(판단 뒤에야 `todayGuide()`를 빠른 시작 **위**에 렌더)
- 재현: 루틴이 있는 사용자가 홈을 열자마자 빠른 시작을 누르려 한다. 판단 전에는 빠른 시작이 WeekSummary 바로 아래에 있다가, 판단 뒤 약 90px 높이의 카드가 위에 끼어 아래로 밀린다. 그러면 탭이 NextCard 「시작」에 떨어지거나 빈 곳을 누르게 된다. 빠른 시작을 노린 탭이 **루틴 시작**이 될 수 있어 의도와 다른 운동이 시작된다.
- 수정안: 판단 전에는 NextCard 자리에 같은 높이의 스켈레톤(또는 `visibility:hidden` 자리)을 둔다. 다만 「루틴 0개」가 확정되면 자리를 거둬야 하므로 H-1의 `routinesLoaded`가 필요하다. 그보다 단순한 방법은 `routinesLoaded && routines.length>0`이면 바로 스켈레톤을 넣고 reco가 오면 내용을 채우는 것이다. 판단 전에는 빠른 시작 버튼을 `disabled`로 두는 방법도 함께 쓸 만하다.

### M-3 놓친 루틴 카드와 「다음 운동」 충돌 (UI·상태)
- 위치: `RoutinesClient.tsx:366-376`(CatchUpCard 조건이 `primary`를 보지 않음), `src/core/src/domain/homePrimary.ts`(catch-up을 입력으로 받지 않음)
- 재현 1(엇갈린 권고): 스케줄이 있고 오늘은 배정이 없으며(`plan=none`) 어제 배정된 B를 놓쳤다. 이력상 추천은 C다. 그러면 위에 빨강 「오늘의 추천 루틴 C 시작」이 보이고, 아래에 「놓친 루틴 B — 2일 전 · 이걸로 할까요?」가 보인다. 오늘 할 일이 두 개로 엇갈린다.
- 재현 2(같은 루틴 두 번): 위 상황에서 reco나 recent가 B면 NextCard B(빨강)와 CatchUpCard B(회색)가 함께 뜬다. 기존에는 「오늘 예정과 같으면 한 장」 규칙이 있었는데, NextCard에는 그 규칙이 없다.
- 수정안: (a) `pickHomePrimary` 입력에 `catchUpRoutineId`를 넣고 순위를 「스케줄 > 놓친 루틴 > 추천 > 최근 > 첫」으로 둔다. 스케줄을 쓰는 사람에게는 놓친 루틴이 추천보다 의도에 가깝다. 이 경우 CatchUpCard 자체를 주 행동 카드로 승격하고 NextCard는 띄우지 않는다. (b) 최소한 `catchUp.routineId === primaryRoutineId`면 CatchUpCard를 숨긴다. 순위 변경(a)은 스펙 변경이므로 사용자 확인이 필요하다.

### M-4 보관 루틴이 추천되면 카드 두 장이 경쟁함 (상태 / UI, **의심** — 보관 루틴이 이력에 남는 경로 전제)
- 위치: `src/core/src/data/analyticsRepository.ts:353-354`(`routines().query(Q.where('id', oneOf))`에 `is_archived=false` 조건이 없음), `RoutinesClient.tsx:254,284`(`recoCardShows`는 reco가 화면 목록에 있는지 보지 않음)
- 재현: 스케줄 없음. 최근에 한 루틴 A를 보관했고 추천이 A다. `pickHomePrimary`는 A가 `routineIds`(보관 제외)에 없으므로 건너뛰고 recent나 first(예: B)를 고른다. 그러면 NextCard가 「B 시작」 빨강으로 뜨고, 그 아래 RecoCard가 「오늘의 추천 루틴 A」를 brand 테두리 카드로 함께 띄운다. 보관 루틴 시작 버튼까지 노출된다. `lastRoutineId`도 보관된 A일 수 있어 recent 순위가 무력화되고 first로 떨어진다(L-4).
- 수정안: 추천 수집 단계(`nameById`)에서 `Q.where('is_archived', false)`를 더한다. 현행 주석 「현존 루틴만」의 취지와도 맞다. 더불어 `recoCardShows`에 「reco.routineId가 화면 목록에 있다」를 조건으로 추가한다.

### M-5 추천 조회 실패 시 영구 미판단 (상태)
- 위치: `RoutinesClient.tsx:121` `.catch(() => setReco(null))`과 `:235`
- 재현: `getTodayRoutineRecommendation`이 예외를 던지면(DB 일시 오류, 스키마 드리프트) 루틴이 1개 이상일 때 `homeReady`가 계속 false다. 빨강 채움이 0개, 주 행동이 없는 홈이 되고 `home-ready`도 붙지 않는다. todayGuide는 빠른 시작 아래에 회색으로만 뜬다.
- 수정안: 실패를 `reco = { status:'insufficient', alreadyWorkedOutToday:false, lastRoutineId:null, ... }` 같은 **판단 가능한 폴백**으로 둔다(`recoError` 상태도 가능). 그러면 스케줄이나 첫 루틴 규칙으로라도 주 행동이 정해진다.

### M-6 테스트가 진짜 회귀를 다 막지 못함 (상태·회귀)
- 위치: `src/frontend/e2e/home-primary.spec.ts`, `src/frontend/e2e/declutter-p4.spec.ts:124-140`, `src/core/src/domain/__tests__/homePrimary.test.ts`
- 좋은 점: `filledBrand`가 개수뿐 아니라 **어느 testid가** 빨강인지 `toEqual`로 고정한다. 셸 막대와 탭바는 제외하고 계산 스타일로 잰다. 「수정 전 2건 실패」(루틴 있음, 스케줄 배정)는 진짜 가드다.
- 빈 곳:
  1. **깜빡임을 재지 않는다.** 모든 측정이 `home-ready` 이후 한 시점이다. 그런데 H-1 때문에 그 표식이 조기에 뜨므로, 측정이 흔들리거나 우연히 통과할 수 있다. 판단 전 구간을 `MutationObserver`로 관찰해 **빨강이 등장한 testid 순서**를 수집하고, 그 순서가 `[최종 하나]`인지 단언하는 테스트를 권한다. 운동 중 콜드 로드(H-2 A)도 같은 방식으로 잰다.
  2. **「운동 중 빨강 0」 단언은 수정 전에도 통과한다.** 옛 코드도 active면 빠른 시작이 secondary였으므로 M-2 회귀 가드가 아니다. 가드 2건이라는 집계에 넣지 말 것.
  3. 빠진 경로: 휴식일(스케줄 rest, e2e 없음), **추천이 주 행동(RecoCard가 빨강)**(e2e 없음, `primaryInReco` 분기 미검증), 스케줄 배정 루틴 삭제 → 다음 순위, 놓친 루틴 카드가 secondary인지, 보관 루틴, 완료 직후 클라이언트 내비게이션(H-2 B).
  4. `declutter-p4.spec.ts:139`는 제목만 M-2로 바꾸고 **개수(1)만** 잰다. `home-ready`를 기다리지 않고 `btn-start-routine` 표시 직후에 재기 때문에, 판단 전 0개 구간에 걸리면 실패하고 1개 구간(빠른 시작이 빨강인 H-1 순간)에 걸리면 **틀린 버튼으로 통과**한다. `home-ready` 대기와 `toEqual(["btn-start-next"])`로 바꾸거나, 이제 home-primary와 중복이니 이 건은 지운다.
  5. 단위 테스트에는 「workedOutToday와 rest 동시」, 「plan routine이 존재하지만 reco·recent와 같은 id」, 「routineIds 순서와 first」 경계는 없다. 함수가 단순해 위험은 낮다.

---

## 낮음

### L-1 「첫 루틴」 폴백 순서 ≠ 화면 순서
- 위치: `RoutinesClient.tsx:239`의 `routineIds: [...loose, ...folderGroups...]`. 화면은 `:385` 무렵에서 폴더 그룹을 먼저, 그 아래 낱개 목록을 렌더한다.
- 영향: 주석(`homePrimary.ts`의 「화면 목록 순서」)과 실제가 다르다. 폴더가 있는 사용자의 「첫 루틴」은 화면상 첫 행이 아니다.
- 수정안: `[...folderGroups.flatMap(...), ...loose]`로 바꾸거나, 의도가 「낱개 우선」이면 주석을 고친다.

### L-2 스케줄 미배정일의 문구 충돌
- 위치: `RoutinesClient.tsx:253-283`(스케줄이 있으면 TodayCard가 늘 렌더되고, plan=none이면 `todayNone` 문구)
- 재현: 스케줄이 있고 오늘 배정이 없는 날, 위에 빨강 「오늘의 추천 루틴 · X 시작」(NextCard)이 있다. 아래 TodayCard는 「오늘의 운동 — 오늘은 배정된 루틴이 없어요, 연필 아이콘으로 스케줄을 편집해 보세요」다. 권고와 「없다」가 동시에 보인다.
- 수정안: primary가 routine이고 plan이 none이면 TodayCard 미배정 안내를 숨기거나 한 줄 캡션으로 줄인다.

### L-3 자정·시간대
- `dayNum`과 `todayPlan`은 모두 로컬 날짜 기준이라 시간대 처리는 일관적이다(`streak.ts:dayNumber`와 같은 방식). 다만 reco는 `routineCount`와 `activeWorkoutId`가 바뀔 때만 다시 읽는다. 그래서 홈을 띄워 둔 채 자정을 넘기면, `plan`(렌더마다 `Date.now()`)은 새 날이고 `alreadyWorkedOutToday`는 어제 값이다. 어제 운동했다면 새 날에도 빠른 시작이 주 행동으로 남는다.
- 수정안: `visibilitychange`나 포커스 때 reco를 다시 읽거나, reco에 계산일(`dayNum`)을 담아 오늘과 다르면 stale로 본다(H-2의 stale 키와 같은 장치).

### L-4 `lastRoutineId`의 비용과 정확도
- 비용: 이미 만든 `entries`(35일치 완료 세션, 많아야 수십 건)를 filter와 sort로 한 번 더 도는 정도라 **무시할 수준**이다. 추가 DB 질의도 없다. `sort` 대신 한 번 순회하는 max를 쓰면 할당을 줄일 수 있지만 실익은 미미하다.
- 정확도 1: 35일 창 밖(오래 쉰 뒤 복귀)이면 null이 되어 「첫 루틴」으로 떨어진다. 복귀 사용자에게는 「지난번에 한 루틴」이 더 자연스럽다. 창과 무관하게 `routine_id is not null`인 완료 세션 1건을 `completed_at desc limit 1`로 따로 조회하면 된다(쿼리 1개 추가).
- 정확도 2: 보관 루틴을 거르지 않는다(M-4). UI에서 `exists`로 걸러져 안전하긴 하지만, 그다음 최근 루틴으로 내려가지 않고 바로 first로 떨어진다. 수정안은 「보관 아닌 루틴 중 가장 최근」으로 거르는 것이다.
- 타입: `lastRoutineId?: string | null` 선택 필드인데 모든 반환 경로가 채우므로 `string | null` 필수로 좁히는 편이 안전하다(경로가 추가될 때 누락을 컴파일이 잡는다).

### L-5 루틴 0개 화면의 「추천 불가 안내」(기존 동작)
- 캡처 `home-noroutine-390-light.png`를 보면 루틴이 없는데 「오늘의 추천 루틴 — 일주일 이상 꾸준히 운동하면…」 카드가 빈 상태 위에 떠 있다. 루틴이 없으면 추천할 대상이 없으므로 소음이다. 이번 커밋의 범위 밖이지만, 같은 todayGuide 정리 때 `routines.length===0`이면 숨기는 것을 권한다.

---

## 확인했으나 문제 없음
- 운동 중: `primary=active`이면 빠른 시작이 secondary, todayGuide의 두 카드가 숨겨지고 NextCard도 없다. CatchUpCard·RoutineRow·FolderGroup의 「시작」은 모두 secondary다. 셸 막대 「열기」 하나만 강조되어 캡처 active와 일치한다(안정 상태 기준, 전이 구간은 H-2).
- 오늘 운동함: CatchUpCard가 `!alreadyWorkedOutToday` 조건으로 숨겨지고, TodayCard는 secondary로 남는다. 의도에 맞다.
- 배정 루틴 삭제: TodayCard는 `return null`, `pickHomePrimary`는 `exists`로 다음 순위를 고른다. NextCard가 정상적으로 뜬다.
- 휴식일: 빠른 시작이 빨강이고 TodayCard 「휴식일」 안내는 그 아래에 있다. 스펙과 일치한다.
- reco 부족 + NextCard: `!(primaryRoutine && reco.status !== "ok")`로 안내 카드를 숨긴다. 스펙과 일치한다.
- `make verify` 통과(lint, typecheck, 단위 316, core·카탈로그·문서 검사).

---

## 조치 (2026-10-27 · v0.41.3)

| # | 조치 | 내용 |
|---|---|---|
| H-1 | 수정 | `core/db/hooks.ts`에 `useQueryDataStatus`({data, loaded})를 추가했다. 홈은 루틴 목록의 첫 결과가 오기 전에는 판단하지 않는다. e2e 「콜드 로드」는 프레임마다 빨강 testid를 기록하는데, **수정 전(f99bcd8 빌드)에는 `btn-quick-start`가 먼저 빨강이 되어 실패**했고 수정 후 통과한다. `home-ready`가 붙은 순간의 빨강도 최종 주 행동과 같은지 단언한다. |
| H-2 | 수정 | `SessionProvider`에 `activeLoaded`를 추가했다. 추천에는 「루틴 수·진행 중 운동·오늘」 열쇠를 붙여, 열쇠가 다르면 지난 추천으로 보고 판단하지 않는다(완료 직후 클라이언트 이동 포함). e2e 「운동 중 콜드 로드」, 「마치고 돌아오는 순간」은 **수정 전 빌드에서도 통과했다**(이 환경에서는 경합이 재현되지 않음). 회귀 가드로만 남긴다. |
| M-1 | 수정 | 머리말을 근거별로 바꿨다: 스케줄 「오늘 할 운동」, 추천 「추천 루틴」, 최근·첫 루틴 「다음 운동」. 근거 한 줄(`next-reason`)을 달고, 목록의 같은 루틴에는 무채 「오늘」 칩(`today-chip`)을 붙였다. 목록에서 루틴을 빼지는 않았다. 4안(루틴 1개일 때 위 카드 생략)은 사용자 확인 사항으로 보류. |
| M-2 | 수정 | 판단 전에는 같은 높이의 자리(`NextCardSkeleton`)를 잡아 두고, 빠른 시작은 `disabled`로 둔다. e2e는 누를 수 있는 빠른 시작의 위치 변화가 1개 이하인지 잰다. |
| M-3 | 부분 수정 | (b) 놓친 루틴이 곧 주 행동 루틴이면 놓친 루틴 카드를 숨긴다. e2e는 **수정 전 실패, 수정 후 통과**. (a) 순위를 「스케줄 > 놓친 루틴 > 추천」으로 바꾸는 안은 스펙 변경이라 사용자 확인 사항으로 **보류**했다. |
| M-4 | 수정 | 추천·최근 후보에서 보관 루틴을 거른다(`analyticsRepository` `is_archived=false`). 추천 카드는 화면 목록에 있는 루틴만 권한다. 앱에 보관 경로가 없어 e2e는 없다. |
| M-5 | 수정 | 추천 조회가 실패하면 「추천 없음」으로 폴백해 스케줄·첫 루틴 규칙으로 판단한다. |
| M-6 | 수정 | e2e 5건을 추가했다: 콜드 로드 깜빡임, 운동 중 콜드 로드, 완료 직후 클라이언트 이동, 휴식일, 놓친 루틴. `declutter-p4` M-2 측정은 `home-ready`를 기다린 뒤 `btn-start-next`를 확인한다. 단위 테스트 경계 3건을 추가했다. 휴식일 e2e는 수정 전에도 통과하므로 가드다. 추천이 주 행동인 경로(RecoCard 빨강)는 1주 이력이 필요해 e2e가 없고, 단위 테스트(`pickHomePrimary` 순위)로만 확인한다. |
| L-1 | 수정 | 첫 루틴 폴백을 화면 순서(폴더 묶음 → 낱개)로 맞췄다. |
| L-2 | 수정 | 미배정일에 「다음 운동」이 주 행동이면 「오늘은 배정된 루틴이 없어요」 카드를 숨긴다. |
| L-3 | 수정 | 추천 열쇠에 오늘(로컬 달력일)을 넣고, visibilitychange·focus 때 오늘을 다시 잡는다. |
| L-4 | 부분 | 보관 루틴 필터는 M-4로 해소. 35일 창 밖의 「최근」은 쿼리를 더 써야 해서 **보관**한다(복귀 사용자는 「첫 루틴」을 받는다). `lastRoutineId` 타입 좁히기는 보류. |
| L-5 | 수정 | 루틴이 0개면 「추천 불가 안내」 카드를 숨긴다. |
