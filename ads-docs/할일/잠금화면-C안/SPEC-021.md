# SPEC-021 — 잠금 운동 화면 C안 — 앱 테마 따르기 · 운동 시간 · 「닫기」 제거 · 둥근 버튼·휴식 링·세트 점 · 광고 없음

> 타입 Spec · 그룹 할일/잠금화면-C안 · ADStudio가 `SPEC-021.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-048, SRS-100

## 목표

실기기 피드백(할 일 #T1)을 반영해 잠금화면 위 운동 화면을 사용자가 고른 **C안(아기자기) · 광고 없음**으로 바꾼다. 시안: https://claude.ai/artifact/EuDHTYwCqtFRJ9B5iTudgi

- 앱의 라이트·다크 설정을 따른다(지금은 어두운 색 고정).
- 루틴 이름을 빼고 운동 시간을 보여 준다.
- 「닫기」를 빼고 「잠금 해제」만 남긴다.
- 둥근 버튼 · 휴식 링 · 세트 점으로 모양을 바꾼다. 조작 규칙(길게 누르기·±·보호 시간·대기열)은 그대로 둔다.

## 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/core/src/domain/lockScreen.ts` | `LockSnapshot`·`buildLockSnapshot` 에 선택 칸 `clock`·`theme` |
| `src/core/src/data/workoutRepository.ts` | `loadLockSnapshotInput` 이 `pausedAt`·`accumulatedPauseMs` 도 돌려줌 |
| `src/frontend/lib/lockBridge.ts` | 스냅샷에 운동 시간 재료와 테마 싣기 · `PREFS_EVENT` 구독 · `theme` 은 동적 import(순환 방지) |
| `src/frontend/lib/theme.ts` | `setTheme` 뒤 스냅샷 다시 요청(`applyTheme` 에는 두지 않는다 — 저장 전일 수 있다) |
| `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockRules.java` | 순수 함수 `elapsedSec`(core `lockElapsedSec` 와 같은 정답)·`clockText`·`restFraction` |
| `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockView.java` | `elapsedSec`(`Long` · null = 숨김)·`theme`·`restTotalSec` |
| `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockWorkoutActivity.java` | C안 레이아웃·팔레트·바 색 · 「닫기」 제거 |
| `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockRingView.java` | 새 파일 — 휴식 링 |
| `src/mobile/android/app/src/main/res/values/strings_lock.xml` · `src/mobile/android/app/src/main/res/values-en/strings_lock.xml` | 운동 시간·세트 점 설명 문구 |
| `src/core/src/domain/__tests__/lockFixtures.test.ts` · `src/mobile/native/fixtures/lock-rules.json` | 운동 시간 정답 사례(core 가 만들고 네이티브가 읽는다) |
| `src/mobile/release.json` · `src/frontend/package.json` | 앱 1.5.0(6) · 웹 v0.63.0 |
| 테스트 | `src/core/src/domain/__tests__/lockScreen.test.ts` · `src/frontend/e2e/lock-bridge.spec.ts` · `src/mobile/android/app/src/test/java/org/tarae/liftgram/lock/LockElapsedTest.java`(새 파일) |

범위 밖: 카드 알림(`WorkoutNotification`)의 제목과 모양은 그대로 둔다 — 잠긴 화면 카드에 루틴 이름이 남는다. 광고는 넣지 않는다(Google Play 잠금화면 수익화 금지). 잠금 화면에 Pretendard 글꼴을 싣는 일은 하지 않는다(기기 기본 글꼴). iOS 는 새 칸을 쓰지 않는다(모르는 칸을 무시한다). 웹 `ActiveWorkout` 의 시간 계산은 그대로 둔다.

## 설계

### 스냅샷 계약

`v: 3` 을 유지하고 **선택 칸**만 더한다. 옛 앱은 모르는 칸을 무시하고, 새 앱은 칸이 없는 옛 웹 스냅샷에서 시간을 숨기고 기기 설정 테마를 쓴다.

```ts
clock?: { startedAt: number; accumulatedPauseMs: number; pausedAt: number | null };
theme?: 'system' | 'light' | 'dark';
```

- 값은 시각이라 초마다 바뀌지 않는다. 기존 「같은 사본이면 보내지 않는다」 가드가 그대로 동작한다.
- 앱 화면의 계산(`src/frontend/app/components/session/ActiveWorkout.tsx:333`)과 같은 식을 쓴다: `round(((paused && pausedAt ? pausedAt : now) - startedAt - accumulatedPauseMs) / 1000)`, 0 미만은 0. 반올림까지 같아야 1초 어긋나지 않는다. core `lockElapsedSec` 가 정답 사례를 만들고 Java 가 같은 사례로 시험한다.
- `startedAt` 이 0 이하이거나 칸이 없으면 시간을 숨긴다(`optLong` 의 0 이 56년으로 보이지 않게). 모르는 `theme` 값은 `system` 으로 본다. `accumulatedPauseMs` 는 입력 함수에서 `?? 0`.
- 다른 기기에서 내려온 테마는 `PREFS_EVENT` 로 다시 요청한다(`user_profiles` 구독이 localStorage 반영보다 먼저 읽으면 같은 사본으로 보고 안 보낸다).
- 표시는 앱과 같은 시계 형식이다: 1시간 미만 `42:18`, 이상 `1:02:18`.

### 테마

- 웹은 고른 값(`getTheme()`)을 그대로 보낸다. `system` 이면 네이티브가 그 순간의 기기 `uiMode` 로 정한다(앱이 꺼져 있어도 기기 설정을 따라간다).
- 첫 그림이 틀리지 않게 마지막 고른 값을 `UI_PREFS`(`LockScreenGate`)에 저장해 `onCreate` 의 `setContentView` 앞에서 읽고, 창 배경·바를 먼저 칠한다. 프로세스가 죽어도 남는다.
- 비교는 문자열이 아니라 **최종 다크 여부**로 한다. `onResume`·`onConfigurationChanged`(manifest 에 `uiMode` 가 있어 재생성되지 않는다)·그림마다 판정한다.
- 달라지면 레이아웃을 다시 만든다(`recreate` 안 함). **먼저 `stopHold()`·`stopRepeats()`** 를 부르고, `pendingEdits > 0` 이거나 누르는 중이면 다음 틱으로 미룬다. `pendingEdits` 는 초기화하지 않는다.
- 바: API 35 이상은 지정이 무시되니 루트 바탕이 비치게 하고, API 29 이상은 `setNavigationBarContrastEnforced(false)`. API 34 이하는 코드로 색을 지정하고 아이콘은 `WindowInsetsControllerCompat` 으로 바꾼다. API 24~25 는 밝은 내비 아이콘이 없으니 내비 바를 어둡게 둔다.

### 팔레트 — 앱 토큰(`src/frontend/app/theme.generated.css`)과 같은 값

| 역할 | 라이트 | 다크 |
| --- | --- | --- |
| 바탕(틴트) | `#FFF0EB` | `#3D2620` |
| 카드 | `#FFFFFF` | `#2B2B2B` |
| 링 자리 | `#F1F2F4` | `#3A3A3A` |
| 글자 | `#141619` | `#F5F7F9` |
| 보조 글자(틴트 위에도 쓰는 것) | `#3E4348` | `#D8DBDF` |
| 흐린 글자(카드 위만) | `#6A737B` | `#98A1AD` |
| 강조 | `#C8381C` | `#FF7A57` |
| 강조 위 글자 | `#FFFFFF` | `#161616` |
| ± 바탕 | `#FFF0EB` | `#3A3A3A` |
| 버튼 테두리(1dp) | `#747474` | `#A8A8A8` |

### 화면

- **위 줄:** 운동 시간 알약(시계 그림 + 시간, 정지 중이면 정지 그림) · 「잠금 해제」 알약(44dp 이상). `lock_screen_close` 와 닫기 버튼은 `[원본]` 주석으로 막는다. **전원 버튼은 이 화면을 닫지 않는다**(다시 켜면 그대로 보인다). 잠금화면으로 돌아가는 길은 뒤로 가기뿐이므로 닫기 버튼이 하던 보호 시간·진단 기록을 뒤로 가기로 옮긴다(API 33 이상 `OnBackInvokedDispatcher`, 그 아래 `onBackPressed`).
- **운동 중:** 가운데 종목 이름 · 세트 점(`setNo`>0 이고 `setTotal` 1~8 일 때만, 지금 세트는 크게, 지난 세트는 채움, **남은 세트는 테두리만** — 색만으로 구분하지 않는다) + `WorkoutNotification.setName` 글자와 「한쪽」. 라벨 세트는 점 없이 글자만, 줄 높이는 고정한다. 카드(반경 24dp)에 무게·횟수 줄, 지름 56dp 둥근 ±, 큰 숫자.
- **휴식 중:** 링 안에 「쉬는 시간」과 남은 시간. 링 아래 +30초·건너뛰기 알약(56dp). 시안은 휴식 중 값만 보여 주지만 **휴식 중 값 조정은 지금 되는 기능이라 없애지 않는다** — 운동 중과 같은 카드(56dp ± 세로 2줄)를 그대로 두고 넘치면 스크롤한다. 휴식 전환으로 카드를 다시 만들지 않는다(누르던 ± 가 사라지지 않게).
- **링 크기:** 기본 176dp, 낮은 화면(사용 가능 높이 680dp 미만) 140dp, 슈퍼셋 120dp. 글자 칸은 고정 크기, 슈퍼셋 글자 상한은 링 120dp 에 맞춰 28sp(구현 때 36sp 에서 바꿈 · REV-022). 자동 크기는 `AppCompatTextView` 로 API 24 부터 동작시킨다.
- **슈퍼셋:** 카드마다 이름·세트 글자를 넣고 점은 뺀다. 넘치면 위쪽이 스크롤되고 완료 버튼은 아래 고정(기존과 같음).
- **초안:** 숫자를 강조색으로, 아래 줄을 「kg · 원래 75」처럼 쓴다. 기존 낙관 표시 규칙은 그대로.
- **안내 문구(`notice`):** 스크롤 밖 위 줄 바로 아래에 두어 밀려나지 않게 한다. 글자는 보조 글자색.
- **눌림:** 모든 버튼에 눌림 색(잔물결), ± 에 짧은 햅틱.
- **유산소·조정 불가:** 지금처럼 값 한 줄만.
- **아래:** 알약 모양 완료 버튼 72dp, 눌러서 차오르는 막대는 그대로(트랙·진행 색을 팔레트로 지정). 문구 「꾹 눌러 세트 완료」(영어는 그대로). 그 밖의 문구는 카드 알림과 같게 둔다(「쉬는 시간」·「건너뛰기」·「다음: …」).
- 링은 `LockRingView`(Canvas 호 그리기). 비율 = 남은 시간 ÷ `totalSec`, 0~1 로 자르고 `totalSec` 이 없으면 가득. +30초로 총량을 넘어도 1 을 넘지 않는다.
- 접근성: 운동 시간 알약에 「운동 시간 42분 18초」(정지 중이면 「일시정지」 포함) 설명, live region 끔. 세트 점은 접근성에서 빼고 이름·세트 글자를 한 포커스로 묶는다. 완료 버튼 설명은 「세트 완료」(TalkBack 은 두 번 탭으로 바로 완료된다). 슈퍼셋 ± 설명 앞에 종목 이름. 큰 글꼴에서 `fitOneLine` 유지.

## 작업 단계

### Phase 1 — 데이터 전달과 C안 화면

- [x] 스냅샷 선택 칸(`clock`·`theme`) · `lockElapsedSec` · 입력 함수 · 브리지 · `setTheme` 뒤와 `PREFS_EVENT` 에 다시 요청
- [x] core·e2e 시험
- [x] `LockRules`·`LockView` · 단위 시험
- [x] `LockRingView` · 팔레트 · 레이아웃 · 바 색 · 「닫기」 제거 · 문구
- [x] 에뮬레이터(`lg_test`·`lg_test30`)에서 라이트·다크 / 운동 중·휴식 중 화면 확인 또는 못 한 이유 기록
- [x] 버전 올림 · `make verify`

완료 기준: 아래 수용 기준의 자동 시험이 통과하고 APK 가 빌드된다.

## 수용 기준(SRS-100 연결)

1. 앱 테마가 라이트면 잠금 운동 화면이 라이트, 다크면 다크, 시스템이면 기기 설정을 따른다.
2. 루틴 이름이 잠금 운동 화면에 없고, 운동 시간이 앱과 같은 값으로 초마다 늘어난다. 일시정지 중에는 멈춘다.
3. 「닫기」 버튼이 없고 「잠금 해제」는 잠금 해제 뒤 앱 운동 화면을 연다. 뒤로 가기는 기기 잠금화면으로 돌아간다(켜진 직후 1초 보호).
4. 세트 완료·±·+30초·건너뛰기가 예전과 같이 동작한다. 휴식 중에도 ± 가 된다.
5. 광고·수익화 요소가 없다.
6. 옛 웹·새 앱, 새 웹·옛 앱 어느 조합에서도 오류가 없다.

## 테스트 계획

- core: `buildLockSnapshot` 이 `clock`·`theme` 을 싣고, 안 넘기면 칸이 없다(`src/core/src/domain/__tests__/lockScreen.test.ts`).
- e2e: 브리지가 보낸 스냅샷에 `clock`·`theme` · 테마를 바꾸면 스냅샷이 다시 간다(`src/frontend/e2e/lock-bridge.spec.ts`).
- 네이티브 단위 시험: 운동 시간 정답 사례(`LockRulesFixtureTest` — core 와 같은 파일) · 칸 없음·`startedAt` 0 · 시계 형식 · 링 비율 경계 · 모르는 테마 값(`LockElapsedTest`).
- 빌드: `./gradlew :app:testDebugUnitTest :app:assembleDebug`, `make verify`.
- 에뮬레이터: 잠금 화면 위 그림은 가능하면 스크린샷으로 확인한다. 실기기 확인은 사용자에게 맡긴다.

## 위험·주의

- **앱 재설치 필요:** 화면은 APK 안에 있어 1.5.0 을 설치해야 보인다. 그 전까지 새 칸은 무시된다.
- **자동 배포 없음:** `CLAUDE.md` 에 `할 일 자동 배포:` 줄이 없어 이 항목은 커밋까지만 한다.
- **화면 다시 만들기:** `holdTick` 은 `holdDownAt` 만 보고 완료를 실행한다. 다시 만들기 전에 `stopHold()` 를 부르지 않으면 세트가 뜻 없이 완료될 수 있다. `rows`·`builtKey` 도 함께 비운다.
- **대비:** 흐린 글자는 틴트 바탕 위에서 대비가 모자랄 수 있어 카드 위에서만 쓴다.
- **첫 줄 공간:** 작은 화면과 큰 글꼴에서 위 줄이 넘치지 않게 시간 글자 칸을 고정하고 글자를 줄인다(REV-022).
- **카드 위치:** 카드는 아래쪽에 붙이고, 다음 줄이 없어도 자리를 비워 둔다. 휴식 시작·끝이나 마지막 단계에서 ± 가 움직이지 않게 하기 위해서다(REV-022).
- **± 동작:** 뗄 때 한 번 실행하고 450ms 이상 누르면 반복한다. 버튼 밖으로 끌면 취소한다(REV-022).
