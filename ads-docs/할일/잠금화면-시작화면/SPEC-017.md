# SPEC-017 — Project Spec — 잠금화면 운동 카드 rev3 + 시작 화면(로고 차오름) (SRS-096 · SRS-054 · ADR-046)

> 타입 Spec · 그룹 할일/잠금화면-시작화면 · ADStudio가 `SPEC-017.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-046, SRS-054, SRS-096

## 목표

전용 앱(Capacitor · `src/mobile/`)의 **P1 잠금화면 운동 카드**를 구현할 수 있는 상태로 확정한다. 함께 **시작 화면**도 다룬다. 지금은 앱을 열면 원격 화면이 뜰 때까지 빈 화면이 보이는데, 이것을 로고가 차오르는 로딩 화면으로 바꾼다.

- **rev3 근거**: 옛 스펙 `.ouroboros/docs/spec/20261103_native-app/spec.md`(이관본 SPEC-016)의 §4(원안)·§12.2(rev2)와 qa spec 2차 `.ouroboros/docs/qa/20261103_native-app-spec-p1_qa.md`의 **H 5건**(H-1~H-5)이다. 2차의 M-1~M-8·L-1~L-6도 함께 결정한다.
- **우선순위**: SPEC-016 §4·§12.2 중 잠금화면 부분은 **이 문서가 대체한다**(어긋나면 이 문서가 이긴다). P0(껍데기)·P2(위젯)·P3(출시)은 SPEC-016 그대로다.
- **rev3.1**: 이 스펙의 qa spec(REV-003 · 32건)의 채택분을 본문에 반영했다(각 절의 「(REV-003 …)」 표시).
- **잠금화면 목표**(SRS-096): 운동 중 잠금화면에 종목·세트·무게×횟수·휴식 카운트다운·다음 종목이 보인다. 「세트 완료」「+30초」「휴식 끝내기」를 잠금 해제 없이 할 수 있고, 앱을 열면 **한 번씩만, 카드에 보인 값 그대로** 기록에 반영된다.
- **시작 화면 목표**(SRS-054 「앱 공용 로딩 = 로고 채우기」): 앱 아이콘을 누른 순간부터 첫 화면이 그려질 때까지 빈 화면·깜빡임 없이 한 장면으로 이어진다. 네이티브 스플래시(빈 로고) → 웹 부팅 덮개(같은 자리에서 로고가 차오름) → 첫 화면 순서다.

## 범위

### 바꿀 파일

| 영역 | 파일 | 무엇 |
| --- | --- | --- |
| 시작 화면 | `src/mobile/capacitor.config.ts` | SplashScreen `launchAutoHide:true`+`launchShowDuration:6000`(상한) · 배경색 |
| 시작 화면 | `src/mobile/android/app/src/main/res/values/styles.xml` · `src/mobile/android/app/src/main/res/drawable/splash.png` | Android 12+ SplashScreen API 테마(아이콘 = 빈 로고 윤곽 · 배경 = 앱 바탕색) · 옛 기기용 같은 그림 |
| 시작 화면 | `src/mobile/ios/App/App/Base.lproj/LaunchScreen.storyboard` · `src/mobile/ios/App/App/Assets.xcassets` | 빈 로고 윤곽 + 바탕색(라이트·다크) |
| 시작 화면 | `src/frontend/app/layout.tsx` · `src/frontend/app/globals.css` | `#app-boot-cover`(앱 안에서만 · 첫 그림 전까지) |
| 시작 화면 | `src/frontend/lib/native.ts` · `src/mobile/www/offline.html` | 첫 그림 뒤 `SplashScreen.hide()` · 오프라인 화면도 숨김 호출 |
| core | `src/core/src/domain/lockScreen.ts`(새) · `src/core/src/domain/__tests__/lockScreen.test.ts`(새) | 순서 규칙 · 스냅샷 · id 기반 rebase · 값 시뮬레이션 · 휴식 합치기 |
| core | `src/core/src/domain/completeSetsFlow.ts`(새) · `src/core/src/domain/prescription.ts` · `src/core/src/domain/supersetRound.ts` | 완료 흐름 하나로(화면·잠금 공용) |
| 데이터 | `src/core/src/db/schema.ts` · `src/core/src/db/migrations.ts` · `src/core/src/data/workoutRepository.ts` | v27 `set_logs.value_source` · 잠금 워터마크(`database.localStorage`) · `completedAt` 인자 · 세트 쓰기 헬퍼(userEdited+출처) · 블록 휴식 저장 |
| 서버 | (변경 없음 — REV-003 저장소 M-3) | 서버 동기는 레코드를 해석하지 않는 jsonb 병합(`payload |  | EXCLUDED.payload` · `src/backend/internal/sync/`)이라 새 필드가 그대로 오간다. 옛 클라이언트 push가 `value_source`를 지우지 않는지 **테스트만** 한다 |
| 웹 | `src/frontend/app/components/SessionProvider.tsx` · `src/frontend/lib/native.ts` · `src/frontend/lib/restSound.ts` · `src/frontend/lib/e2eFlags.ts` | 스냅샷 전송 · 한 줄 적용기(drain) · 휴식 영속화·합치기 · 웹 소리 조건 · 결함 주입점 |
| 웹 | `src/frontend/app/components/session/ExerciseBlock.tsx` · `src/frontend/app/components/session/ActiveWorkout.tsx` · `src/frontend/app/components/session/setDrafts.tsx` · `src/frontend/app/components/session/SetRowEdit.tsx` | 완료를 `completeSetsFlow`로 · 입력 중 값 커밋 요청 · 「잠금화면에서 본 값과 다름」 표식 |
| 안드로이드 | `src/mobile/android/app/src/main/java/org/tarae/liftgram/`(LiftgramNativePlugin.kt · LockStore.kt · WorkoutNotification.kt · ActionReceiver.kt · RestAlarm.kt · RestSoundPlayer.kt) · `src/mobile/android/app/src/main/AndroidManifest.xml` | 진행 중 알림 · 버튼 리시버 · 직렬 저장소 · 휴식 알람 · 소리 |
| iOS | `src/mobile/native/liftgram-native/ios/Sources/` · `src/mobile/ios/App/LiftgramWidgets/`(새 확장) · `src/mobile/ios/App/App/Info.plist` · `src/mobile/ios/App/App/App.entitlements` | Live Activity · LiveActivityIntent · AlarmKit · App Group 직렬 저장소 |
| 버전 | `src/frontend/package.json`(0.58.0) · `src/mobile/package.json`(1.1.0) | 배포마다 SemVer |

### 범위 밖

홈 위젯(P2 · SRS-097), 광고(SRS-098), 서버 푸시로 Live Activity 갱신하기, 잠금 중 무게·횟수 수정(잠금화면에서는 프리필 값으로만 완료한다), iOS AlarmKit(보류 — 후속 선택형 설정), 드롭 세트 앞 휴식 규칙 변경(화면과 함께 후속 · REV-003 도메인 L-7 일부).

## 설계

### 1. 시작 화면 (SRS-054)

지금 상태는 이렇다. `src/mobile/capacitor.config.ts`가 `SplashScreen: { launchShowDuration: 0 }`이라 네이티브 스플래시가 바로 내려가고, 원격 `liftgram.tarae.org`의 첫 그림까지 **빈 웹뷰**가 보인다. 웹에는 이미 공용 로딩 `src/frontend/app/components/ui/LogoSpinner.tsx`(빈 윤곽 위로 색이 차오르는 transform 키프레임)가 있다.

- **한 장면으로 잇기**

  1. **네이티브 스플래시** = 앱 바탕색 + 화면 가운데 **빈 로고 윤곽**(LogoSpinner의 `outline` 그림과 같은 모양·같은 크기 56pt).

    - 안드로이드 12+ SplashScreen API(REV-003 네이티브 H-3):

      - 지금 테마(`Theme.SplashScreen` + `android:background=splash.png` · `postSplashScreenTheme` 없음)는 이중 표시 구조다. **`windowSplashScreenAnimatedIcon` + `windowSplashScreenBackground` + `postSplashScreenTheme`** 으로 다시 짜고 `android:background`는 뺀다.
      - 아이콘은 240dp 캔버스·160dp 원 안에 들어가게 둔다. VectorDrawable은 `skewX`를 못 하므로 **기울기를 미리 적용한 path로 구운 윤곽 벡터**를 쓴다.
      - `values-night`에 다크 바탕(`#161616`)을 둔다.
    - 안드로이드 11 이하는 `splash.png` 대신 같은 벡터를 가운데 두는 `layer-list`다(비율로 잘리지 않게).
    - iOS는 `LaunchScreen.storyboard`(이미지 + 바탕색 에셋 · 라이트·다크)다.
  2. **상한은 플러그인으로**(REV-003 네이티브 H-2): `launchAutoHide:true` + `launchShowDuration:6000`이다. 웹이 더 일찍 `hide()`를 부르면 그때 내려간다. 6초가 지나도 흰 화면이 보이지 않게 **WebView 배경색을 앱 바탕색**(라이트·다크)으로 맞춘다(안드로이드 `android:windowBackground`·WebView `setBackgroundColor` · iOS `backgroundColor`).
  3. **웹 부팅 덮개** `#app-boot-cover`(REV-003 네이티브 H-1)

    - 서비스 워커가 셸을 URL 키로 캐시하고, 서버에서 UA를 읽으면 전 경로가 동적 렌더가 된다. 그래서 **덮개는 항상 HTML에 싣고**(기본 숨김), head 인라인 스크립트가 `navigator.userAgent`에 `LiftgramApp`이 있으면 `html[data-app-boot]`를 켠다(기존 `UPDATE_BOOT_INIT`과 같은 방식).
    - 내용은 같은 자리·같은 크기의 `LogoSpinner size={56}`(차오름)과 바탕색이다.
    - **CSS 안전망**: 하이드레이션이 실패해도 덮개가 화면을 영원히 가리지 않게 CSS 애니메이션으로 8초 뒤 스스로 사라진다.
  4. **첫 프레임 맞춤**(REV-003 네이티브 M-4)

    - 덮개 안 LogoSpinner는 **빈 윤곽·불투명도 1에서 시작**한다(`animation-delay` 당김·숨쉬기 0.6↔1을 부팅 덮개에서만 끈다). 그래서 hide 순간 네이티브 그림과 같다.
    - 중심은 `100dvh` 기준 화면 가운데에 둔다(상태바 영역 포함 · edge-to-edge 아닌 기기 확인).
    - 덮개가 처음 그려지면(`requestAnimationFrame` 두 번) `src/frontend/lib/native.ts`가 `SplashScreen.hide({fadeOutDuration:0})`을 부른다.
  5. 첫 화면이 준비되면(셸 마운트 + DB 열림, 지금 `RouteLoading`을 내리는 시점) 덮개를 200ms 페이드로 내린다.
- **안전망**: `src/mobile/www/offline.html`도 로드되면 `Capacitor.Plugins.SplashScreen?.hide()`를 부르고, 같은 윤곽 로고를 둔다. 원격이 느리기만 한 경우는 2번 상한이 맡는다.
- **움직임 줄이기**: 네이티브와 같게 **빈 윤곽 정지**로 시작한다. 첫 화면 직전에 다 찬 로고로 바뀌어도 이음매에는 영향이 없다.
- **테마 어긋남**: 사용자가 고른 앱 테마와 시스템 테마가 다르면 첫 프레임이 번쩍인다. 안드로이드는 `UiModeManager.setApplicationNightMode`로 다음 실행의 스플래시를 맞춘다. iOS는 런타임에 바꿀 수 없어 시스템 테마를 따른다(알려진 한계).
- **웹 브라우저**는 바뀌지 않는다. 덮개는 UA 판정이 켤 때만 보인다(`update-boot-cover`는 그대로).
- **업데이트 재시작**과 겹치면 `#update-boot-cover`가 이긴다. 같은 로고라 이어 보인다.
- **iOS 확인 절차**: LaunchScreen은 iOS가 강하게 캐시하므로 확인할 때마다 「앱 삭제 → 재부팅 → 설치」로 본다.

### 2. 잠금화면 — 원칙(SPEC-016 §4.1 유지)

- 세션의 정본은 웹의 로컬 기록(Watermelon · core 도메인)이다. 네이티브는 **표시 사본**과 **조작 대기열**만 가진다.
- 잠금 중에는 웹뷰 JS가 멈춘다고 가정한다. 버튼을 누르면 네이티브가 사본으로 다음 상태를 스스로 그리고, 조작을 쌓는다.
- **자리 연산 금지**(H-1): 네이티브와 웹 어디에서도 「`queue[0]` 빼기」 같은 위치 기반 갱신을 하지 않는다. 모든 갱신은 **세트 id 기반**이다.

### 3. 타입 — 한 곳에 다시 적는다(L-1 · §4.2·§4.4·§12.2의 옛 필드는 모두 폐기)

```ts
type LockSnapshot = {
  v: 3;
  sessionId: string;
  title: string;                       // 루틴 이름 또는 「빠른 운동」
  steps: LockStep[];                   // 남은 단계를 수행 순서대로(최대 12 · 묶음 한 단계 = 1)
  rest: RestState;                     // 휴식(§7)
  appliedThroughSeq: number;           // 이 스냅샷 읽기에 반드시 들어 있는 마지막 조작 seq(§6)
  storeId: string;                     // 네이티브 저장소 id(설치·저장소 재생성마다 새 UUID)
  dbEpoch: string;                     // 웹 로컬 DB id(DB 새로 만들 때마다 새 값 · 계정 리셋 포함)
  paused: boolean;                     // 일시정지면 버튼 숨김(L-8)
  sound: { enabled: boolean; preset: string; volume: 1 | 2 | 3 };
  updatedAt: number;
  truncated: boolean;                  // 12단계에서 잘렸는가(「남은 단계 없음」과 구분 · REV-005 도메인 L-3)
};
type LockStep = {
  setIds: string[];                    // 이 단계에서 완료할 세트(묶음이면 여러 개 · 화면 묶음 순서)
  members: {
    setId: string; exerciseName: string;    // 사용자 표시 이름(useExerciseName 규칙)
    setNo: number; setTotal: number;        // 그 멤버 블록 기준(워밍업 제외 번호 · 워밍업은 「W」)
    label: string;                          // 화면 라벨 그대로 — 일반·백오프는 번호, 나머지는 W·D·F·T(REV-005 도메인 M-2)
    unit: "kg" | "lb";                      // 블록 단위(blockUnit)
    oneSide: boolean;                       // 한쪽 입력 블록(배수 > 1) — 무게 옆에 「한쪽」
    display: { weight: number | null; reps: number | null; seconds: number | null; distanceM: number | null }; // 표시 전용
    expect: { weightKg: number | null; reps: number | null; seconds: number | null }; // 시뮬레이션한 저장값(§5)
  }[];
  restAfterSec: number;                // 단계 첫 멤버의 세트 유형 × 그 블록 휴식(M-2)
  openApp: boolean;                    // true면 버튼 대신 「앱 열기」(§8)
};
type RestState = { endsAt: number | null; totalSec: number | null; setAt: number; by: "web" | "native" }; // 시각은 모두 epoch ms(안드로이드 크로노미터용 elapsedRealtime 변환은 네이티브 안에서만)
type LockAction = { id: string; storeId: string; dbEpoch: string; seq: number; kind: "complete"; sessionId: string; setIds: string[];
                    expect: { setId: string; weightKg: number | null; reps: number | null; seconds: number | null }[];
                    at: number };
// drain 결과: { actions: LockAction[]; rest: RestState; storeId: string }  — +30초·끝내기는 조작이 아니라 rest 값(§7)
// 조작 형식 검사(wellFormed): 형식이 깨진 조작은 버리고(id 가 있으면 ack) 워터마크는 움직이지 않는다 · 적용 예외는 멈추고 다시 시도, 같은 조작 3번이면 버림(REV-006)
// 네이티브 계약: appliedThroughSeq 단조 검사는 같은 storeId·dbEpoch 안에서만 — dbEpoch 가 바뀐 스냅샷은 늘 받는다(acceptSnapshot · REV-006 저장소 M-7)
// 네이티브 계약(REV-007): 「완료」 버튼은 누른 순간의 단계 토큰(setIds 를 「,」로 이음)을 싣고, 처리할 때 지금 단계와 다르면 아무것도 하지 않는다(연타·낡은 카드)
//   · 스냅샷 storeId 가 네이티브 자기 storeId 와 다르면 워터마크를 0 으로 보고 지우지 않는다 · 끝난 세션의 늦은 스냅샷은 버린다 · 거부한 스냅샷의 rest 도 mergeRest
//   · 쓰기는 사본에서 하고 디스크 저장 성공 뒤에만 반영(gen +1 — 알림은 gen 이 낮은 그리기를 버린다) · 거부되면 웹은 그 사본을 「보냄」으로 치지 않는다
// 유산소 단계 멤버는 metrics?: string[](시간·거리 등 그 종목이 기록하는 칸)를 싣고, 「앱 열기」는 그 칸만 본다(줄넘기처럼 시간만 기록 · REV-007 화면 H-2)
```

### 4. 「지금 단계」 순서 규칙 — `buildLockSteps`(H-5 rev2 + 2차 M-1)

`pickRoundSets`·`roundKeyOf`(`src/core/src/domain/supersetRound.ts:29-46`)를 재사용한다. 결과는 아래 규칙 표로 테스트에 고정한다.

1. **화면 행 순서**: 블록 `sort_order`가 아니라 **화면 행 순서**를 쓴다(묶음은 첫 멤버 자리에 한 줄 · `src/frontend/app/components/session/ActiveWorkout.tsx:221-236`과 같은 함수를 공유한다).
2. 일반 블록은 첫 미완료 세트(워밍업 포함)부터 미완료 세트를 차례대로 놓는다. 앞 세트를 비우고 뒤를 완료했어도 블록의 첫 미완료로 간다.
3. **묶음(슈퍼셋)** 은 다음 순서다.

  - (a) 먼저 각 멤버의 **짝 키가 null인 앞쪽 세트**(워밍업 등)를 화면 묶음 순서로 한 단계씩 놓는다.
  - (b) 다음은 라운드다. **짝은 화면과 같은 짝 키**(`roundKeyOf` — 일반 `n:k` · 탑셋 `t:k`)로 맺는다(REV-005 도메인 M-3 — 위치로 맺으면 탑셋이 섞일 때 화면과 짝이 달랐다). 라운드 순서는 키 문자열 비교가 아니라 **그 키가 멤버들 안에서 처음 나오는 위치**로 정한다. 탑셋 `t:k`와 일반 `n:k`가 섞여도 블록 안 실제 순서를 따른다(REV-003 도메인 H-1). 멤버들 첫 미완료의 가장 앞 라운드를 고르고, 단계에는 그 라운드의 **미완료 세트만** 넣는다(완료된 짝은 뺀다).
  - (c) 라운드 사이의 짝 없는 세트(드롭·실패)는 그 멤버만 한 단계로, 원래 자리에 놓는다.
4. **12단계 상한**: 묶음 한 단계는 1로 센다. 다 쓰면 카드는 「앱을 열어 다음 세트를 보세요」를 보인다(L-8).
5. **일시정지**: `paused`면 버튼을 숨기고 휴식 알람을 취소한다. 재개하면 남은 휴식으로 다시 예약한다(REV-003 도메인 L-8).

| 경우 | 세트 | 기대 단계 |
| --- | --- | --- |
| 워밍업 한쪽만 | A=[1,2] · B=[W,1,2] | [B-W] → [A1,B1] → [A2,B2] |
| 한 멤버만 완료 | A=[1✓,2] · B=[1,2] | [B1] → [A2,B2] |
| 이웃 아닌 멤버 | A(g)·C·B(g) | [A+B 라운드…] → C… |
| 드롭 사이 | A=[1,D,2] · B=[1,2] | [A1,B1] → [A-D] → [A2,B2] |
| 뒤만 완료 | A=[1,2✓,3] | [A1] → [A3] |
| 탑셋+백오프 묶음 | A=[T,B1,B2](처방) · B=[1,2,3] | [AT] → [AB1,B1] → [AB2,B2] → [B3] (화면 짝 키 그대로 — 탑셋은 짝이 없다 · REV-005 도메인 M-3. 옛 기대 [AT,B1] → [AB1,B2] → [AB2,B3]는 위치 짝이라 화면과 달랐다) |
| 멤버 3개 | A=[1,2] · B=[1,2] · C=[1] | [A1,B1,C1] → [A2,B2] |
| 실패로 짝 밀림 | A=[1,2F,3] · B=[1,2,3] | [A1,B1] → [A-2F] → [A3,B2] → [B3] (실패는 짝 없음) |

- 잠금 대기 중에 앱에서 세트 유형을 바꿔 짝이 밀리면 §6 「짝 바뀜」 규칙을 따른다(버리지 않음).

### 5. 값 — 카드에 보인 값 = 저장되는 값(H-5)

결정은 **시뮬레이션 + 기대값 대조**다(대안이던 「pct1rm 블록은 첫 완료 뒤 앱 열기」는 쓰지 않는다).

- **`planLockQueueValues(input) → expect[]`**(순수 함수)는 단계 k를 완료한 결과(처방 채우기 포함)를 단계 k+1의 입력으로 넘기며 **대기열 순서 전체를 시뮬레이션**한다. 「1RM의 N%」 연쇄 채우기(`planPrescribedLoadFills` `src/core/src/domain/prescription.ts:219`)가 완료마다 다시 일어나는 것까지 포함한다.
- **입력**은 스냅샷 생성기가 저장소에서 미리 모아 넘긴다.

  - 처방(rx)과 블록별 `has1rm`(비동기 `estimatedOneRmForSlot` `src/core/src/data/workoutRepository.ts:687`을 미리 계산)
  - 장비·블록 단위(`blockWeightUnit`)
  - 세트별 touched 재료(`userEdited`·`updatedAt`·`createdAt`)
- **입력 순서**(REV-003 도메인 L-8): 시뮬레이션 입력은 블록 **전체 세트를 세트 번호 순서로**(완료·워밍업 포함) 넘긴다. 남은 세트만 넘기면 처방 %가 다른 세트에 들어간다.
- **같은 함수**(REV-003 도메인 H-2): 화면 묶음 완료는 라운드를 다시 계산해 **이미 완료한 멤버로도** 그 블록의 다음 세트를 다시 채운다(`src/frontend/app/components/session/ActiveWorkout.tsx:730-760`). 이것을 순수 함수 `planRoundFills(round, ...)`로 빼서 시뮬레이션과 `completeSetsFlow`가 같이 쓴다. 라운드 기준은 조작에 실린 `setIds`와 그 짝이다. 테스트로 「시뮬레이션 결과 = 실제 drain 뒤 DB」를 고정한다.
- **표시값도 시뮬레이션에서**(REV-003 도메인 M-4): 카드의 `display`는 지금 저장값이 아니라 시뮬레이션 결과를 블록 단위로 바꾼 값이다. 한쪽 입력 블록은 카드에 「한쪽」을 붙인다. 단위는 블록 단위이고, 없으면 사용자 기본 단위다.
- **조작에 기대값을 싣는다**: `expect`(저장 kg)다. 표시값이 아니므로 1차 H-1의 단위 왕복 문제가 없다. drain은 값을 **덮지 않는다**.

  - **비교 정밀도**: kg 그대로 비교하지 않고 **블록 단위 입력칸의 표시 정밀도**로 바꿔 비교한다(lb 반올림·한쪽 배수 나누기의 0.0001kg 차이로 거짓 「다름」이 나지 않게).
  - **비교 시점**: 그 단계를 완료하기 직전(같은 write 안에서) 저장값과 비교한다.
  - **다르면**(REV-003 도메인 M-5) 완료는 하고, 진단 로그를 남기고, 화면에 **「잠금화면에서 본 값: 80kg×8 · 저장된 값: 82.5kg×8」**처럼 두 값을 함께 보이는 표식과 **「본 값으로 바꾸기」** 버튼을 띄운다(로컬 전용 · 누르면 닫힘). 같은 원인(탑셋 하나 어긋남)으로 뒤 세트가 연쇄로 다르면 **블록 단위 표식 하나**로 묶는다.

### 6. 대기열·rebase·워터마크(H-1·H-2·H-3)

- **seq**는 **설치 단위 단조 증가**다. 네이티브 저장소의 카운터이며 다시 쓰지 않고 세션이 바뀌어도 이어진다.
- **저장소 id 두 개**(REV-003 동시성 H-4 · 저장소 L-8): 네이티브 `storeId`(설치·저장소 재생성·백업 복원 시 새 UUID — 안드로이드 `allowBackup`에서 이 파일은 백업 제외)와 웹 `dbEpoch`(로컬 DB를 새로 만들 때·계정 리셋 `syncOwner` 때 새 값)다. 워터마크는 `{storeId, dbEpoch, seq}`로 저장한다.

  - storeId가 다르면 워터마크를 0으로 본다(새 저장소의 조작이 「이미 적용됨」으로 조용히 버려지지 않게).
  - dbEpoch가 다른 스냅샷에서 나온 조작은 버린다. 리셋 직후 웹이 네이티브 대기열을 비운다(`queue.clear()`).
- **id 기반 rebase** `rebaseLockQueue(snapshot, pending) → steps`(core 순수 함수)

  - `seq > appliedThroughSeq`인 조작마다 `steps`에서 **`action.setIds`와 겹치는 세트를 뺀다**(단계가 비면 단계 삭제). 겹치는 것이 없으면 아무것도 안 한다(이미 화면에서 처리됨).
  - 네이티브의 버튼 처리도 같은 함수다. 누른 순간 보이던 단계의 `setIds`를 조작에 고정하고, 사본에서 그 id를 뺀다. 안드로이드(Java)·Swift는 같은 규칙 표(JSON 픽스처 공유)로 테스트한다.
  - **ack가 스냅샷보다 먼저 닿는 경우**(REV-003 동시성 H-2): 네이티브는 ack된 조작을 바로 지우지 않고 「ack됐지만 아직 그보다 큰 `appliedThroughSeq` 스냅샷이 덮지 않은 조작」으로 남겨 rebase 대상에 계속 넣는다. `appliedThroughSeq`가 그 seq 이상인 스냅샷이 오면 그때 지운다. 지금 가진 것보다 `appliedThroughSeq`가 **작은 스냅샷은 버린다**(거꾸로 가는 스냅샷 금지).
- **워터마크** `lockAppliedSeq`(REV-003 저장소 확인 · 동시성 H-3)

  - 정본은 Watermelon `database.localStorage`다. 같은 Loki DB의 `local_storage` 컬렉션이고(`@nozbe/watermelondb` `DatabaseDriver.js:225,279`), 한 번의 내려쓰기는 모든 변경을 IDB 트랜잭션 하나로 저장한다. **새 로컬 표(`lock_state`)는 만들지 않는다** — 동기 push가 서버로 올려 버린다.
  - 다만 세트 쓰기와 워터마크 쓰기는 별개의 변경이라, 500ms 자동 저장이 둘 사이에 끼면 다른 내려쓰기로 나뉠 수 있다. 그래서 **순서를 불변식으로 고정**한다: 세트 쓰기 → 워터마크 쓰기 → flush → ack.
  - 「세트는 남고 워터마크는 없음」으로 kill되면, 다음 drain이 그 조작을 다시 적용해도 이미 완료라 noop이다. 그 사이 사용자가 해제하지 못하게 **첫 drain이 끝날 때까지 세션 화면은 입력을 받지 않는다**(부팅 덮개 · 세션 화면 「확인 중」). 반대 순서(워터마크 먼저)는 kill 때 완료를 잃으므로 금지한다.
  - drain은 `seq ≤ 워터마크`인 조작을 건너뛴다. 그래서 사용자가 앱에서 해제한 세트가 다시 완료되지 않는다.
  - **noop 판정과 쓰기는 같은 `database.write` 안**에서 한다(REV-003 저장소 M-7 — 지금 `setSetDone`은 이미 완료된 세트의 완료 시각도 덮는다 `src/core/src/data/workoutRepository.ts:1674-1681`).
- **appliedThroughSeq 잡기**: 스냅샷 생성과 drain을 **같은 한 줄 실행기(mutex)** 에서 돌린다. 스냅샷은 drain이 끝난 뒤 실행되고, DB 읽기 **전에** 워터마크를 읽어 `appliedThroughSeq`로 싣는다. 메모리·localStorage에 따로 두지 않는다.
- **한 줄 적용기**: resume·첫 로드·앞에 있을 때의 action 이벤트는 같은 `drain()`을 깨우기만 하고, seq 순서로 처리한다.
- **ack**

  - 적용 뒤 워터마크를 포함한 `flushLocalDbResult() === "saved"`이고 쓰기 상태가 `"lost"`·`"framed"`가 아닐 때만 `ack(ids)`한다. `noop`·`discarded`도 ack한다.
  - writer가 `"unknown"`이면 drain을 **claim이 끝날 때까지 미룬다**.
  - ack에 실패하면 2·5·15초 백오프로 다시 깨운다.
  - **원인과 상관없이** 가장 오래된 미확인 조작이 60초를 넘거나 미확인 조작이 30개를 넘으면 카드 버튼을 「앱 열기」로 바꾼다(REV-003 동시성 M-6 — 가져오기 중·스키마 가드처럼 쓰기 주인이 끝내 안 정해지는 경우 포함).
- **버림과 무시를 나눈다(L-5)**

  - `noop`: 이미 완료된 세트
  - `discarded`: 다른 세션 · 없는 세트 · 끝난 세션 · 다른 dbEpoch
  - **짝이 바뀐 묶음은 버리지 않는다**(REV-003 동시성 M-5 · 도메인 H-1): 사용자가 누른 조작이므로 실린 세트 id대로 각각 완료하고 §5의 「확인」 표식으로 드러낸다.
  - 버린 것이 있으면 화면에 한 번 알린다(「잠금화면 조작 N개는 운동이 바뀌어 반영하지 않았어요」). noop은 진단 로그만 남긴다.
- **시각 자르기(L-4)**: `completedAt = clamp(at, startedAt, now)`.
- **네이티브 원자성(M-6 · REV-003 동시성 M-7)**

  - 대기열·사본·seq·rest는 **단일 직렬 실행기로만** 고친다. 안드로이드는 `LockStore` 단일 스레드 executor + `commit()`이다.
  - iOS는 읽고-고치고-쓰는 작업 **전체를 `NSFileCoordinator` 쓰기 블록 하나로** 묶는다(App Group 파일 · 프로세스 사이에서도 직렬). 버튼 `LiveActivityIntent`는 **앱 타깃에도 포함**해 앱 프로세스에서 돌게 한다. 확장 프로세스에서 도는 경우가 있는지 Phase 5에서 확인한다.
  - 네이티브 테스트에 「ack와 버튼 동시」를 넣는다.

### 7. 휴식 — 의도 시각 LWW(H-4 · M-2 · M-8)

- `RestState = {endsAt, totalSec, setAt, by}`이다. 양쪽 모두 **`setAt`이 더 늦은 쪽이 이긴다**. 같은 시각이면 `native`가 이긴다(잠금 중 조작이 더 최근의 사람 의도다).
- 웹의 휴식 변경(시작·+시간·끝내기)은 스냅샷과 따로 **즉시** `session.setRest(rest)`로 보낸다(디바운스·DB 읽기 없음). 스냅샷 안의 `rest`와 `setRest` 두 길 모두 **같은 `mergeRest` 함수**를 지난다(REV-003 동시성 L-8).
- **시간이 지나 끝난 휴식은 쓰기가 아니다**(REV-003 동시성 H-1): 지금 `src/frontend/app/components/SessionProvider.tsx:120-127`의 `onVisible`은 지난 휴식에 `clearRest`를 부른다. 앱 안에서 이것이 setAt=지금인 「끝내기」로 나가면, 잠금 중 누른 +30초를 이긴다.

  - 시각이 지나 끝난 것은 **계산한 상태**로만 둔다(setAt을 바꾸지 않고 네이티브로 보내지도 않는다). 사람이 「휴식 끝내기」를 누를 때만 setAt이 새로 찍힌다.
  - 앱 복귀(resume·visible)에서는 **만료 판정 전에 네이티브 휴식 값부터** 받아 합친다(`queue.drain()`의 rest).
- 네이티브의 +30초·끝내기는 조작을 만들지 않고 자기 rest만 바꾼다. drain 결과의 `rest`는 **적용이 끝난 시점에 다시 읽어** 합친다.
- `completeSetsFlow`는 휴식을 **값으로 돌려주기만**(`restSec`) 한다. 화면은 그 값으로 `startRest`를 부르고, drain은 무시한다. 잠금 중 휴식은 네이티브가 건 값이 drain 뒤 LWW로 들어온다.
- **영속화**: `startRestUntil(endsAt, setAt)`이고 키는 `liftgram.restEndsAt = {workoutId, endsAt, totalSec, setAt}`이다(동기 안 함). 종료·버리기 때 지운다. 복원할 때 활성 운동 id를 대조하고, 지난 시각은 소리 없이 지운다.
- **블록 휴식 저장(M-3 결정 · REV-003 저장소 M-5)**

  - 휴식 시트를 **닫을 때 한 번** `workout_exercises.rest_seconds`에 저장한다(스테퍼를 누를 때마다 쓰지 않는다 — 쓰기·동기·스냅샷 폭주 방지).
  - 화면은 `useState` 첫 값 대신 DB 값을 따른다(`observeWithColumns(['rest_seconds'])` · `src/frontend/app/components/session/ExerciseBlock.tsx:165`).
  - **영향 범위**: 이번 운동 행에 저장되므로 그 운동을 **루틴으로 저장하거나 다시 하기(replay)** 를 하면 바뀐 휴식이 이어진다(`src/core/src/data/finishRoutine.ts:63,154`). 루틴 자체를 직접 바꾸지는 않는다. 웹 동작이 바뀌어 다시 띄워도 유지된다 — 사용자에게 보고한다. 화면 안내 문구(「이 세션 동안의 설정」 `src/frontend/app/components/session/ExerciseBlock.tsx:1088-1089`)도 고친다.

### 8. 「앱 열기」 조건 — 값 출처(M-4 · rev2 M-7)

- v27에 `set_logs.value_source`를 추가한다. 값은 `default | copied_default | prev | prev_snap | routine | rx | user`이고, null은 옛 세트로 「앱 열기 아님」이다.
- **칸마다 다른 출처**(REV-003 저장소 H-2): 프리레이는 무게와 횟수의 출처가 다를 수 있다(`src/core/src/data/workoutRepository.ts:876-878` — 예: 무게는 루틴 목표, 횟수는 기본값 8). 그래서 `value_source`는 **칸별로** `"무게,횟수"`(예 `rx,default`)로 적는다 — 한 값만 있으면 두 칸이 같은 출처다(옛 값·짧은 표기). 판정은 표시 칸 중 **가장 약한 출처**로 한다(약한 순서 default < copied_default < prev_snap < prev < routine < rx < user). 한 값으로 합쳐 저장하면 처방 채우기가 무게만 올려도 횟수의 default가 남아 백오프가 영영 「앱 열기」였다(REV-005 도메인·저장소 H-1). 스냅샷의 「앱 열기」는 DB 값이 아니라 **시뮬레이션한 출처**로 판정한다(앞 단계 채우기 반영). 유산소는 `시간,시간` 한 출처.
- **서버는 바꾸지 않는다**(REV-003 저장소 M-3): 동기 서버는 레코드를 jsonb로 병합 저장하므로 새 필드가 그대로 오간다. 테스트는 「필드 없는 옛 클라이언트 push가 `value_source`를 지우지 않는다」만 둔다.
- **쓰기 헬퍼 하나로**(REV-003 저장소 M-4): 모든 세트 값 쓰기는 `writeSetValues(set, values, source)` 헬퍼를 거쳐 `userEdited`와 `value_source`를 함께 찍는다. Phase 2에서 grep으로 세트 쓰기 경로 전체를 찾아 아래 표를 완성한다(빠진 경로가 없는지 재확인).

| 경로 | 출처 |
| --- | --- |
| 세션 시작 프리레이 — 처방 / 지난 기록 / 지난 스냅 / 루틴 목표 / 기본값 | rx / prev / prev_snap / routine / default(칸별 → 가장 약한 것) |
| `addSet` 기본값 | default |
| `addSet` 값 넘김 | 넘긴 쪽 출처(없으면 user) |
| `addSet` 직전 세트 복제 — 미완료 기본값 | copied_default |
| `addSet` 직전 세트 복제 — **완료한** 세트 또는 사람이 고친 세트 | user(사람이 실제로 든 값 · REV-003 도메인 M-6 — 빈 봉 20kg 반복이 「앱 열기」로 막히지 않게) |
| 처방 채우기 | rx |
| 사용자 입력 · 입력 중 값 반영 · 원판 계산기 · PR 칩 · 제안 칩 | user |
| `completeSupersetRound` 입력 중 값 저장(`:1708`) | user(지금은 userEdited도 안 바꿈 — 고친다) |
| 빠른 완료 추가 | user |
| 종목 교체 · 변형 변경 뒤 다시 채움 | 다시 채운 출처(prev/rx/default) |
| 단위 환산 · 배수 동기 · 플레이트 정리 | 유지 |
| 가져오기 · 동기 pull | 받은 값 그대로(없으면 null) |
| v27 이전에 시작한 진행 중 세션 | null(「앱 열기 아님」) |

- `openApp = !userEdited && value_source ∈ {default, copied_default}`이다. 맨몸·유산소도 횟수·시간에 같은 규칙을 쓴다(맨몸 기본 0kg×8회 차단).
- **유산소**(REV-003 도메인 L-7): 카드에 거리가 없으니 거리·시간이 지표인 세트는 값이 보이지 않은 채 기록되지 않도록 시간과 거리를 함께 표시한다. 둘 중 하나라도 표시할 수 없으면 「앱 열기」다.

### 9. 스냅샷을 내는 때(M-5 · M-6 rev2 · M-8 · L-6)

- 스냅샷은 셸(`SessionProvider`)이 저장소에서 직접 만든다(세션 화면이 안 떠 있어도).
- **변경 감지**(REV-003 저장소 M-6 · 도메인 M-3): 셸 한 곳에서 `database.withChangesForTables(['set_logs','workout_exercises','workouts', 처방·변형 관련 표])`(Watermelon 0.28에 있음)를 구독하는 것이 정본이다. 저장소 함수 밖의 쓰기(동기 pull·카탈로그 정규화·가져오기)와 변형·기구 변형·배수·한쪽 입력·단위·종목 교체·처방 변경을 모두 잡는다. 셸은 300ms 디바운스로 스냅샷을 만들고, drain이 돌고 있으면 끝난 뒤 실행한다. `observe()`는 행 증감만 알려서 이 용도로 쓰지 않는다.
- **입력 중 값(M-8)**

  - 입력 등록부(`src/frontend/app/components/session/setDrafts.tsx`)에 `commitAll(): Promise<void>`을 두고, 셸이 이벤트로 요청한다.
  - drain은 **적용 직전에** 커밋을 요청하고 끝나기를 기다린다.
  - Capacitor `pause`·`visibilitychange:hidden`에서도 ① 커밋 → ② 스냅샷 즉시 전송 순서다.
- **iOS 백그라운드 시간(L-6)**: 플러그인이 `pause` 때 `beginBackgroundTask`로 최대 5초를 확보한다. 그 안에 스냅샷이 안 오면 직전 스냅샷을 유지한다. 백그라운드 작업을 받아도 WebView JS가 먼저 멈출 수 있어 **측정은 실기기 기준**이다 — 아이폰 실기기가 없으므로 TestFlight 1회 때 측정하기로 보류(REV-003 네이티브 L-8).

### 10. 완료 흐름 하나로 — `completeSetsFlow`(rev2 H-4 · 2차 M-7)

- 시그니처는 `completeSetsFlow(repo, {workoutExerciseIds, setIds, fillSetIds?, at, pressedSetId?, values?, writeValues?, onCompleted?}) → {changed, restSec, fills, fillError?}`이다(REV-005 화면 L-6 — 구현에 맞춰 고침). `values`는 화면의 입력 중 값이며 잠금 경로는 비운다. `writeValues`면 입력 값을 완료와 같은 쓰기로 저장한다(출처 user). `onCompleted`는 완료 저장 직후 불려 화면이 휴식을 바로 건다(REV-005 화면 M-1). 채우기 실패는 완료를 깨지 않고 `fillError`로 돌아온다(REV-005 화면 H-1). `fills`는 실제로 쓴 채우기만이다.
- 내용은 다음 순서다.

  - ① `setSetDone`/`completeSupersetRound`에 `completedAt = at` 인자를 추가한다(다른 호출부 기본 `Date.now()` · 완료된 세트의 시각은 덮지 않음).
  - ② 채우기는 `planPrescribedLoadFills`와 `planRoundFills`(§5)로 한다. **완료된 멤버에도 다시 부르는 화면 동작을 그대로 유지**한다(한쪽만 바꾸지 않는다).
  - ③ `restSecondsForSetType`(`src/core/src/domain/prescription.ts:124`)으로 `restSec`를 계산해 돌려준다.
- 축하·제안은 화면 전용으로 흐름 밖에 둔다.

### 11. 플랫폼 · 알림 · 소리(SPEC-016 §4.5·§12.2 M-1~M-4 · L 유지)

- **안드로이드**

  - 카드는 **진행 중 알림**이다(채널 `workout` 무음 · `VISIBILITY_PUBLIC` · 크로노미터 카운트다운).
  - **Android 16 promoted**(REV-003 네이티브 M-6): 커스텀 레이아웃·colorized를 쓰지 않고 표준 스타일로만 그린다. 실패하면 일반 진행 중 알림이다.
  - **밀어 지우기**(REV-003 네이티브 M-5): Android 14+는 진행 중 알림도 사용자가 지울 수 있다. `deleteIntent`로 받아 다음 갱신 때 다시 낸다.
  - **카운트다운 0 지남**: 크로노미터는 0이 지나면 음수로 계속 센다. 휴식 끝 알람이 울릴 때 알림을 「다음 세트」로 다시 게시한다.
  - 버튼은 `PendingIntent` → `ActionReceiver` → `LockStore`다. 리시버에서 소리를 재생하므로 `goAsync()`로 `onReceive` 뒤에도 끊기지 않게 한다.
  - **휴식 알람**: 권한이 있으면 `setExactAndAllowWhileIdle`이다. Android 14+ 새 설치는 정확 알람 권한이 기본 거부라 **대부분 「권한 없음」 경로**를 탄다고 보고 설계한다.

    - 권한이 없으면 남은 시간이 2분 50초 미만일 때만 `shortService`+`PARTIAL_WAKE_LOCK`를 쓰고, 그 밖은 `setAndAllowWhileIdle`에 프로필 「정확한 알림 꺼짐」 표시다.
    - **권한 목록 바로잡기**: `FOREGROUND_SERVICE_SHORT_SERVICE` 권한은 없다. `FOREGROUND_SERVICE` 권한 + 매니페스트 서비스 선언 `foregroundServiceType="shortService"`가 필요하다(지금 둘 다 없음).
    - **ADR-046 보강**: shortService도 포그라운드 서비스다. 「카드는 포그라운드 서비스 없음 · 휴식 끝 시각을 지키기 위한 3분 이하 shortService만 예외」로 ADR 문구를 고친다.
  - **알림 권한 거부**: 카드 자체가 없으므로 첫 운동 시작 때 한 번 안내하고, 프로필에 「잠금화면 표시 꺼짐 — 켜기」를 둔다.
  - 소리는 리시버가 `USAGE_ALARM`으로 앱에 실린 프리셋 wav(4종×음량 3)를 재생한다.
- **iOS**

  - Live Activity(16.1+ 표시 · 17+ 버튼 · `LiveActivityIntent`)와 다이내믹 아일랜드를 쓴다. 7.5시간 뒤 「앱을 여세요」다.
  - **staleDate**(REV-003 네이티브 M-7): `endsAt`으로 두면 휴식이 끝날 때마다 stale 표시가 되므로, 운동 시작 + 8시간으로 둔다.
  - **휴식 끝 소리 — 기본값 변경**: AlarmKit은 자체 Live Activity를 띄워 잠금화면 카드가 두 장 생기고, 90초 휴식마다 무음을 뚫는 전체 화면 경보가 뜬다. 그래서 **기본은 time-sensitive 로컬 알림**으로 하고, AlarmKit은 **보류**한다(후속 · 설정 「무음에서도 울리기」 선택형으로 검토).
  - **설정 누락 보강**: time-sensitive 알림 entitlement, 앱·위젯 확장 **양쪽** App Group, `LiveActivityIntent`를 앱 타깃에 포함(§6).
  - 알림 권한과 Live Activity 허용은 안내 문구를 따로 둔다.
- **웹 소리**: 앱 안에서는 `visibilityState==="visible"`일 때만 낸다. 네이티브는 앱이 앞이면 소리 없이 표시만 한다.
- **고아 카드 정리**: 웹 첫 로드에 활성 세션이 없으면 `session.end()`를 부른다. 딥링크는 `appUrlOpen` 한 곳(`src/frontend/lib/native.ts`)에서 처리한다.

## 작업 단계

### Phase 1 — 시작 화면(로고 차오르는 로딩) — 완료(EXE-001 · REV-004)

- [x] `src/mobile/capacitor.config.ts`: `launchAutoHide:true` + `launchShowDuration:6000` · `launchFadeOutDuration:0` · WebView 배경색은 `src/mobile/android/app/src/main/java/org/tarae/liftgram/MainActivity.java`에서 리소스 색(라이트·다크)으로 칠함 · 다크 모드 전환 때 다시 칠함
- [x] 안드로이드 12+ SplashScreen 테마 다시 짜기(`postSplashScreenTheme` · `android:background` 제거 · `values-night`) · 기울기를 구운 윤곽 벡터(**288dp 캔버스** — 아이콘 배경색이 없으면 core-splashscreen·안드로이드 12+가 288dp 칸에 그린다 · REV-004 H-1) · 11 이하도 core-splashscreen이 같은 테마 속성으로 그린다(따로 `layer-list`를 두지 않음) · `UiModeManager` 테마 맞춤은 **Phase 4로 미룸**(덮개가 OS 색 고정이라 이음매는 OS 기준으로 맞음)
- [x] iOS `LaunchScreen.storyboard` + 에셋(라이트·다크) — 코드만, 빌드 확인은 Xcode 설치 뒤
- [x] `src/frontend/app/layout.tsx`·`src/frontend/app/globals.css`: `#app-boot-cover` 항상 실음 + head 인라인 UA 판정 · 빈 윤곽·불투명도 1 시작 · CSS 8초 안전망 · 하이드레이션 뒤 페이드 · 덮개 바탕은 **OS 기준 고정색**(#F7F7F7 / #161616 — 네이티브 스플래시와 같음 · REV-004 웹 M-1)
- [x] `src/frontend/lib/native.ts`: 덮개가 문서에 들어온 직후 인라인 스크립트가 `SplashScreen.hide()`(안드로이드는 즉시 · iOS는 2프레임 뒤) · `src/mobile/www/offline.html`도 숨김 호출 + 윤곽 로고
- [x] 로고 윤곽 생성기 `src/mobile/scripts/gen-splash-logo.py`: 안드로이드·iOS·`src/mobile/www/offline.html` 세 곳을 한 기하로 · 선 굵기 = 웹 실측 2.45(REV-004 디자인 H1) · `--check`로 어긋남 확인
- [x] e2e `src/frontend/e2e/app-boot.spec.ts`(앱 UA 가짜 플러그인 6개): 문서 읽는 중 hide · 서비스 워커 캐시 셸 · 웹 UA 0회 · 8초 안전망(청크 차단 확인) · 움직임 줄이기 · 첫 프레임 크기·중심
- [ ] 안드로이드 실기기: 콜드 스타트 녹화(빈 화면 프레임 0) · 비행기 모드 첫 실행(`offline.html`) — **Phase 4 실기기 체크리스트로 옮김**(새 시작 화면은 웹 v0.58.0 배포 뒤에야 실기기에 보이고, 지금 연결된 기기가 없다)
- **완료 기준**: `make verify` 통과 · e2e 6개 통과 · 안드로이드 디버그 빌드 통과. 실기기 녹화(빈 프레임 0)는 Phase 4 완료 기준에 포함.
- **릴리스 순서**(REV-004 웹 M-3): 웹(덮개 실린 판)을 먼저 배포하고 앱 1.1.0을 낸다 — 앱이 먼저 나가면 덮개 없는 웹에서 스플래시가 상한 6초 머문다.

### Phase 2 — core 도메인 · 데이터(v27) — 완료(EXE-002 · REV-005)

- [x] `src/core/src/domain/lockScreen.ts`: `buildLockSteps`(§4 규칙 표) · `planLockQueueValues`·`planRoundFills`(§5) · `rebaseLockQueue`(§6) · `mergeRest`(§7) · `buildLockSnapshot`
- [x] `src/core/src/domain/completeSetsFlow.ts` 추출 + `ExerciseBlock`·`ActiveWorkout`을 이 흐름으로 바꿈(옛 호출은 `[원본]` 주석) · noop 판정과 쓰기를 같은 `database.write` 안에서
- [x] 저장소: `completedAt` 인자 · `writeSetValues` 헬퍼(userEdited+출처) · 블록 휴식 시트 닫을 때 저장 + 화면이 DB 값 관찰 · 안내 문구
- [x] v27 `set_logs.value_source` + Watermelon 마이그레이션 + node 이관 테스트 + 쓰기 경로별 출처(grep 전수 → §8 표 완성) · 서버는 「옛 클라이언트 push가 필드를 지우지 않음」 테스트만
- [x] 단위 테스트: 순서 규칙 표(탑셋 묶음·멤버 3개·실패 밀림 포함) · 시뮬레이션 = drain 결과(pct1rm 연쇄 · 탑셋→백오프 · 완료 멤버 재채우기 · lb·플레이트 한쪽 · 슈퍼셋 멤버 무게 다름) · 표시 정밀도 비교 · rebase 표(H-1 시나리오·해제·ack 먼저 도착·거꾸로 가는 스냅샷) · LWW 표(시간 만료는 쓰기 아님) · 출처 전파 · storeId/dbEpoch
- [x] (REV-005 반영) 칸별 출처 부호화 · 채우기 실패 격리 · 휴식 즉시 시작 · 짝 키 정렬 · 카드 라벨·한쪽·거리·잘림 표시 · 부분 판정 · 조작 dbEpoch · 휴식 안내 한 줄(`session.restSavedHint`)
- **완료 기준**: core 테스트·node 이관 테스트·서버 병합 테스트가 통과한다. 기존 세션 e2e가 전부 통과한다 — **블록 휴식 저장만 의도된 웹 동작 변경**이고(REV-003 저장소 M-7), 그 e2e는 새 기대값으로 고친다.
- **릴리스 묶음**: v27은 한 번 열리면 SchemaGuard 때문에 되돌릴 수 없다. Phase 2·3을 **v0.58.0 한 릴리스**로 내보낸다(Phase 2만 따로 배포하지 않음).

### Phase 3 — 웹 다리 · 적용기 · e2e — 완료(EXE-003 · REV-006)

- [x] `src/frontend/lib/native.ts`: `lock.sessionUpdate/sessionSetRest/sessionEnd` · `queueDrain/queueAck/queueClear` · `lockInfo()` 기능 확인(모르면 no-op) · `onAppState`
- [x] `src/frontend/lib/lockBridge.ts`(SessionProvider 밖으로 분리): 한 줄 실행기(스냅샷·drain 공용 · 네이티브 await 5초 상한) · 워터마크 · ack 조건(내려쓰기 saved + 쓰기 주인) · 백오프 · 쓰기 주인 대기 · 휴식 영속화·LWW(`src/frontend/app/components/SessionProvider.tsx`) · 입력 중 값 커밋→전송
- [x] 시작 덮개: 「첫 화면 준비(활성 운동 loaded + 첫 drain) 신호 + 상한 2.5초」(`src/frontend/app/components/AppBootRelease.tsx` · `src/frontend/app/components/LockBridge.tsx`) — 화면별 데이터 신호는 보류(REV-006 화면 M-6)
- [x] `src/frontend/app/components/session/setDrafts.tsx` `commitAllDrafts` · 「잠금화면에서 본 값과 다름」 표식(`src/frontend/app/components/session/LockNotices.tsx` · 「본 값으로 바꾸기」 뒤 처방 다시 채우기) · e2e 결함 주입점(`kill-before-watermark` · 봉인 `flush-sealed`)
- [x] drain 같은 write 계약: `src/core/src/domain/lockDrain.ts` + `src/core/src/data/workoutRepository.ts` `applyLockAction` — 판정·비교·완료 한 write · noop도 채우기 · 라운드 전체로 채우기 · 형식 깨진 조작·독 조작 격리
- [x] ~~`loadSimBlocks` 1RM·이력 캐시~~ — 기각: 추정 1RM이 지금 운동의 완료 세트를 포함해 캐시가 틀린 값을 낸다(REV-006 저장소 M-6) · 표시 정밀도 경계는 lb 테스트로
- [x] idb 요약·진단 `value_source` 키 — 필요 없음(진단에 쓰는 곳 없음 · 건너뜀)
- [x] e2e `src/frontend/e2e/lock-bridge.spec.ts` 11개: 앱 아니면 호출 0 · 고아 카드 정리·사본 · drain/ack/워터마크/H-3 해제 보존 · 기대값 어긋남 두 값·바꾸기 · 버림 안내 · 휴식 LWW(시간 만료는 쓰기 아님 · 앱 복귀 시 만료 vs 잠금 +30초 · 새로고침) · 첫 drain 전 입력 막힘 · 블록 휴식 저장 유지·카드 단계 휴식 · 입력 중 값(blur 전) 보존 · kill · 봉인
- [x] 단위 `src/core/src/domain/__tests__/lockDrain.test.ts` 15개(noop 채우기 · 라운드 채우기 · 시각 자르기·부분 완료 시각 보존 · 형식 깨짐 · 독 조작 · 바꾸기 뒤 다시 채우기 포함) · 네이티브 공용 픽스처 `src/mobile/native/fixtures/lock-rules.json`
- 줄인 것(→ Phase 4 네이티브 계약 테스트로): 2차 M-12 (a)(b)(c)(g)(i) e2e · H-1 경합·H-2 drain 중 스냅샷·ack 먼저 도착 동시성 e2e · 60초·30개 앱 열기 전환 e2e — 가짜 플러그인은 네이티브 직렬 실행기를 흉내 내지 못해 의미 있는 검증이 못 된다. 규칙은 core 단위 테스트와 공용 픽스처로 고정했다.
- **완료 기준**: 위 e2e 전부 통과 · `make verify` · **v0.58.0 배포 전 독립 qa code**(REV-006).

### Phase 4 — 안드로이드 네이티브 — 코드 완료 · 실기기 확인 대기(EXE-004 · REV-007)

- [x] `LockStore`(단일 직렬 실행기 · 사본에서 고치고 디스크 저장 성공 뒤 반영 · 세대 `gen`) · `LockState`(seq · 사본 · 대기열 · rest · 끝난 세션 · 단계 토큰) · `LockRules`(core 규칙 이식) — `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/` · JUnit 24개(`src/mobile/android/app/src/test/java/org/tarae/liftgram/lock/`): 공용 픽스처 `src/mobile/native/fixtures/lock-rules.json` · ack와 버튼 동시 · H-1 경합(연타·낡은 카드 토큰) · drain 중 스냅샷 · ack 먼저 도착 · 60초·30개 「앱 열기」 전환 · 저장 실패·조작 예외 때 상태 그대로
- [x] `WorkoutNotification`(진행 중 알림 · 채널 `workout_v2` 기본 중요도·무음 · 단계·다음 종목·카운트다운 · 슈퍼셋 · 일시정지 · 「앱 열기」 이유 3가지 · 세대 가드) · `LockActionReceiver`(`goAsync`) · `RestAlarm`(정확/shortService/느슨 · 막힘 시각 다시 그리기) · `RestShortService` · `RestSound` — **wav 12개 대신 웹 프리셋 4종 × 세기 3단을 그 자리에서 합성**(웹 `src/frontend/lib/restSound.ts`와 같은 tanh 곡선 · 파일 없음)
- [x] 권한·선언: `POST_NOTIFICATIONS`(첫 운동 시작 때 한 번) · `SCHEDULE_EXACT_ALARM` 안내(프로필 줄 `src/frontend/app/components/profile/LockScreenRow.tsx`) · `FOREGROUND_SERVICE` + `foregroundServiceType="shortService"` · `WAKE_LOCK` · `VIBRATE` · `POST_PROMOTED_NOTIFICATIONS` · 백업에서 `liftgram_lock.xml`·`liftgram_lock_ui.xml` 제외(`src/mobile/android/app/src/main/res/xml/backup_rules.xml` · `data_extraction_rules.xml`)
- [x] (REV-006 보류분) 대기열이 60초 넘게 막히면 「앱 열기」 — 막힘 시각에 다시 그리는 알람까지 · 휴식 다시 읽기(동시성 L-4)·resume 이중 이벤트(L-1)는 **다시 보류**(REV-007 계약 L-2)
- [ ] 시작 화면 실기기(Phase 1에서 옮김): 콜드 스타트 녹화 빈 프레임 0 · 비행기 모드 첫 실행 · 스플래시→덮개 깜빡임 1~3프레임 여부(있으면 `launchFadeOutDuration` 120~200 · REV-004 안드로이드 M-2) · `UiModeManager` 테마 맞춤(M-4) · edge-to-edge 아님일 때 중심(디자인 L6)
- [ ] 실기기 체크리스트: 잠금 중 버튼 3종 × 10회 · 강제 종료 뒤 반영 · 휴식 알림 ±2초 · 권한 거부 + 3분 넘기기 · 밀어 지우기 뒤 재표시 · 다크 모드 · 녹화 증거 · Android 16 Live Update 칩 · 음악 재생 중 소리(REV-007 안드로이드 L-7)
- [ ] 앱 1.1.0(versionCode 2) 내부 테스트 트랙 빌드 — 서명 빌드·업로드는 웹 v0.58.0 배포 뒤
- **완료 기준**: 실기기 체크리스트 전부 · 앱 1.1.0 내부 테스트 트랙 빌드. **지금 연결된 기기가 없어** 코드·JVM 테스트·디버그 빌드·린트까지 끝내고 실기기 항목은 열어 둔다(EXE-004 `partial`).

### Phase 5 — iOS 네이티브(코드 · 빌드는 Xcode 설치 뒤) — 코드 완료 · 빌드 보류(EXE-005 · REV-008)

- [x] 위젯 확장 소스 `src/mobile/ios/App/LiftgramWidgets/` · `WorkoutAttributes`(`src/mobile/native/liftgram-native/ios/Sources/LiftgramLockKit/WorkoutAttributes.swift` · staleDate = min(휴식 끝, 막힘)) · Live Activity 잠금화면·다이내믹 아일랜드 · `LiveActivityIntent` 3종(`AppIntentsPackage`로 앱·확장에 등록) · App Group(앱·확장 entitlements) + `NSFileCoordinator` 직렬 저장소
- [x] time-sensitive 휴식 끝 알림(entitlement · 글은 `LockFormat.restDoneNotice`) · `beginBackgroundTask`(만료 처리기) · Info.plist(`NSSupportsLiveActivities`) — AlarmKit·프리셋 소리는 보류(REV-008 화면 M-8)
- [x] 시작 화면 iOS: `CAPBridgeViewController` 하위 클래스(`src/mobile/ios/App/App/SceneDelegate.swift`)로 웹뷰 바탕 = `SplashBackground` 색
- [x] Swift 검사(같은 JSON 픽스처 · 안드로이드 문구 대조) — `src/mobile/native/lock-core-check` 137개(XCTest 대신 실행 타깃 · CLT만으로 돈다)
- [ ] Xcode: 위젯 확장 타깃 만들기 · 앱 타깃에 `LiftgramLockKit` 링크 · App ID 능력(App Group·시간 민감) · 빌드 설정(REV-008 플랫폼 M-6)
- [ ] 시뮬레이터 체크리스트(안드로이드와 같은 항목) · LaunchScreen 스냅샷 캐시(앱 삭제·재부팅 뒤 설치)
- **완료 기준**: Xcode 설치 뒤 시뮬레이터 체크리스트(안드로이드와 같은 항목) — 설치 전에는 코드·테스트 파일까지만 하고 「빌드 보류」로 기록(EXE-005 `partial`).

## 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-054 | 앱 콜드 스타트에 빈 화면 없이 로고가 같은 자리에서 차오른 뒤 첫 화면 | 실기기 녹화 · e2e |
| SRS-096 | 운동 중 잠금화면에 종목·세트·무게×횟수·휴식 카운트다운·다음 종목 | 실기기 · 시뮬레이터 |
| SRS-096 | 세트 완료·+30초·휴식 끝내기가 잠금 해제 없이 동작 | 실기기 체크리스트 |
| SRS-096 | 앱을 열면 조작이 **한 번씩만** 반영(중복·유실 0 · 사용자 해제 보존) | e2e H-1~H-3 · M-12 |
| SRS-096 | 카드에 보인 값 = 저장 값, 다르면 화면 표식으로 드러남 | 단위(시뮬레이션) · e2e H-5 |
| SRS-096 | 앱에서는 휴식 끝 소리를 네이티브가 맡고 웹 소리와 겹치지 않음 | 실기기 |
| ADR-046 | 안드로이드 카드 = 포그라운드 서비스 없는 진행 중 알림 | 코드 리뷰 · 실기기 |

## 테스트 계획

- **core 단위**(`node --test` · `src/core`): 순서 규칙 표 · `planLockQueueValues` = `completeSetsFlow` 실제 결과 · `rebaseLockQueue` 표 · `mergeRest` 표 · 출처 전파 표 · 시각 자르기 · noop/discarded 구분
- **서버 병합**: 옛 클라이언트(필드 없음) push가 `value_source`를 지우지 않음(jsonb `payload || EXCLUDED.payload`) · pull로 그대로 돌아옴
- **node 이관**: v26 → v27 Watermelon 이관(빈 Model+`_raw` · LokiMemoryAdapter 공유 + `saveDatabase` 명시)
- **웹 e2e**(Playwright · 로컬 운영 빌드 3200/3201 · 새 DB · dev 3100 무접촉): 시작 화면 3종 + 잠금 경로 전 항목(Phase 3 목록) + 기존 세션·휴식 e2e 회귀 전부
- **네이티브 단위**: 안드로이드(Java)·Swift가 core와 **같은 JSON 픽스처**로 rebase·LWW를 검증 · 「ack와 버튼 동시」
- **실기기/시뮬레이터**: Phase 1·4·5 체크리스트 · 녹화·스크린샷 증거는 EXE 문서에 첨부
- **배포 전**: `make verify` · `make smoke` · 독립 qa code(작아도 필수)

## 위험·주의

| 위험 | 대응 |
| --- | --- |
| 스플래시를 웹이 못 내림(원격 실패·스크립트 오류) → 앱이 멈춘 듯 보임 | 플러그인 상한 `launchShowDuration:6000` · WebView 배경색 · `offline.html`도 hide · 덮개 CSS 8초 안전망 |
| 세트 쓰기와 워터마크 사이 자동 저장 → 둘이 다른 내려쓰기 | 순서 불변식(세트 → 워터마크) · 첫 drain 전 입력 막음 · kill e2e |
| v27 스키마 → 옛 번들·옛 앱과 동기 | 필드 nullable · 옛 클라이언트는 null(앱 열기 아님) · 서버 jsonb 병합이라 서버 변경 없음 · SchemaGuard 기존 규칙 · Phase 2·3 한 릴리스 |
| 블록 휴식 저장으로 웹 동작 변경 | 시트 닫을 때 한 번 · 루틴 직접 변경 없음(루틴 저장·다시 하기에는 이어짐 — 보고) · 안내 문구 수정 |
| 네이티브 저장소 초기화(백업 복원·재설치) | storeId · dbEpoch · 리셋 시 대기열 비움 |
| Android 14+ 정확 알람 기본 거부 | 「권한 없음」을 기본 경로로 설계 · 실기기 실측 |
| `completeSetsFlow` 추출로 화면 완료 회귀 | 같은 픽스처로 화면 경로 vs 잠금 경로 DB 행 비교(`completedAt`·`updated_at` 제외) · `[원본]` 보존 |
| iOS 백그라운드 시간 부족(L-6) | `beginBackgroundTask` · 실패 시 직전 스냅샷 유지 · 시뮬레이터 측정 |
| Doze 연속 짧은 휴식 빈도 제한 | 실기기 실측 · 결과를 EXE에 |
| Xcode 미설치 | iOS 단계는 코드까지 · 설치 즉시 몰아서 확인 |
| 결함 주입점 새로 필요(L-2) | Phase 3 작업량에 포함 · `E2E_FAULTS` 빌드에서만 |

> 사용자 결정이 필요했던 것 중 권장안으로 정한 것: H-5 = 시뮬레이션+기대값 대조 · seq = 설치 단위 단조 + storeId · 휴식 동시각 = native 우선 · M-3 = 블록 휴식 저장(시트 닫을 때 · 웹 동작 변경) · 미확인 조작 60초/30개 → 앱 열기 · 시작 화면 = 네이티브 윤곽 → 웹 차오름 이음 · iOS 휴식 끝 = time-sensitive 알림(AlarmKit 보류) · 짝이 바뀐 묶음 = 버리지 않고 완료 + 확인 표식.
