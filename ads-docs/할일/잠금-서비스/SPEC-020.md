# SPEC-020 — Feature Spec — 잠금화면 운동 화면이 실기기에서 뜨게: 운동 중 포그라운드 서비스 · 「다른 앱 위에 표시」 직접 시작 · 휴식 시각은 서비스가 · 프로필 진단 (ADR-049)

> 타입 Spec · 그룹 할일/잠금-서비스 · ADStudio가 `SPEC-020.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-049, SRS-096, SRS-100

## 목표

SPEC-019 잠금화면 운동 화면이 실기기(갤럭시)에서 뜨지 않는 문제를 고친다(ADR-049 · SRS-100 수용 기준 그대로). 고칠 원인은 세 가지다.

- 뒤에 있는 앱이 cached되면 화면 꺼짐·켜짐 방송이 늦게 오거나 오지 않는다.
- 백그라운드 액티비티 시작이 막힌다.
- 전체 화면 알림(FSI)이 막힐 수 있다.

고치는 방법도 세 가지다.

- 운동 중에만 포그라운드 서비스를 켠다.
- 「다른 앱 위에 표시」를 허용받으면 화면 꺼짐에 바로 띄운다.
- 프로필에서 빠진 허용을 진단해 보여 준다.

사용자 결정(2026-11-03 msg 250): 권장안 1번이다. 운동 중 카드를 밀어 지우기 어려워지는 것과 배터리를 조금 더 쓰는 것은 받아들인다.

**등급 Feature** — 새 서비스, 매니페스트 권한, 휴식 시각 경로, 플러그인 정보, 프로필 화면을 바꾼다. 안드로이드와 웹 두 층이고, DB·서버는 바꾸지 않는다.

## 범위(바꿀 파일)

| 층 | 파일 |
| --- | --- |
| 안드로이드 | 새 `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/WorkoutService.java` · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockHub.java`(서비스 시작·멈춤) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockScreenGate.java`(오버레이 허용이면 직접 시작 · 순수 판정) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/RestAlarm.java`(휴식 경로 선택) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/RestShortService.java`(서비스가 돌면 안 씀) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LiftgramLockPlugin.java`(info overlay·service · openSettings overlay · VERSION 1.3.0) · `src/mobile/android/app/src/main/AndroidManifest.xml` · `src/mobile/android/app/src/main/res/values/strings_lock.xml` · `src/mobile/android/app/src/main/res/values-en/strings_lock.xml` · JUnit `src/mobile/android/app/src/test/java/org/tarae/liftgram/lock/LockServiceRulesTest.java`(새) |
| 웹 | `src/frontend/lib/native.ts`(lockInfo overlay·service · openSettings 'overlay') · `src/frontend/app/components/profile/LockScreenRow.tsx`(진단 줄) · `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` · e2e `src/frontend/e2e/lock-bridge.spec.ts` |
| 버전 | `src/mobile/release.json`(1.4.0 · versionCode 5) · `src/mobile/package.json`(1.4.0) · `src/frontend/package.json`(0.61.0) |

## 설계

### 1. WorkoutService(새 · 포그라운드 서비스)

- 매니페스트

  - `<service android:name=".lock.WorkoutService" android:exported="false" android:foregroundServiceType="specialUse">`
  - `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="workout_lock_screen" />`
  - 권한: `FOREGROUND_SERVICE_SPECIAL_USE`. `FOREGROUND_SERVICE`는 이미 있다.
- **켜기 조건(순수 · JUnit)**: `WorkoutService.shouldRun(active, lockScreenEnabled)` = 운동 중이고 잠금 운동 화면 설정이 켜져 있다. 일시정지 중에도 돈다(다시 이어 할 때 방송을 받아야 한다).
- **시작**: `LockHub.refresh`가 그린 뒤 `WorkoutService.sync(ctx, v)`를 부른다.

  - shouldRun이고, 아직 안 돌고, 앱이 앞(`LiftgramLockPlugin.isForeground()`)이면 `startForegroundService`로 시작한다.
  - 뒤에 있으면 시작하지 않는다(백그라운드 FGS 시작은 막힌다 · 예외를 잡는다).
  - 다음에 앱이 앞에 오면 `handleOnResume → refreshAsync`로 다시 시도한다.
- **onStartCommand**: RestShortService와 같은 크래시 방지 순서를 따른다.

  - 무엇보다 먼저 `startForeground(7301, WorkoutNotification.last() ?? build(최소), FOREGROUND_SERVICE_TYPE_SPECIAL_USE)`를 부른다. 34 미만은 종류 없는 두 인자 판이다.
  - 실패하면 stopSelf하고 START_NOT_STICKY를 돌려준다.
  - 그 뒤 `running=true`로 두고 `LockScreenGate.ensureRegistered`, `LockHub.refreshAsync`를 부른다.
  - 돌고 있는 동안 `WorkoutNotification.render`의 notify(7301)는 같은 id라 서비스 알림을 갱신한다.
- **멈춤**: `sync`에서 shouldRun이 거짓이면 `stop(ctx)`를 부른다.

  - 돌고 있는 인스턴스에 메인 스레드로 `finish()`를 보낸다. startService를 다시 부르지 않으니 백그라운드 제한이 없다.
  - `finish`는 휴식 타이머를 지우고, wake lock을 풀고, `stopForeground(STOP_FOREGROUND_REMOVE)`와 `stopSelf`를 부른다.
  - 운동이 끝나면(`!v.active`) 카드도 함께 내린다. 렌더가 cancel하므로 REMOVE로 충분하다.
  - 설정만 끈 경우(운동 중) 카드는 남아야 한다. 그때는 `STOP_FOREGROUND_DETACH`로 멈추고 refreshAsync로 다시 그린다.
- **시간 초과**: Android 15의 specialUse에는 시간 제한이 없다(dataSync·mediaProcessing만 있다). 그래도 `onTimeout(int,int)`에서 finish를 부른다(방어).
- **onDestroy**: running=false, 타이머·wake lock을 정리한다.
- **다시 시작 안 함**: START_NOT_STICKY다. 프로세스가 죽으면 다음에 앱이 앞에 올 때 다시 시작한다.
- **알림 권한이 없을 때**: FGS는 그대로 돈다(알림이 안 보일 뿐이다). 방송 수신이 목적이라 상관없다.

### 2. 휴식 끝 시각 경로(RestAlarm)

순수 판정 `RestAlarm.route(canExact, serviceRunning, sdk, remainMs, foreground)`는 아래 넷 중 하나를 돌려준다.

- **EXACT**: canExact다. 정확 알람을 걸고, 서비스 타이머와 shortService는 멈춘다.
- **SERVICE**: 서비스가 돌고 0 < remain ≤ 15분이다. `WorkoutService.scheduleRest(endsAt)`가 핸들러와 wake lock(remain+10초)으로 시각을 지킨다. shortService는 멈춘다.
- **SHORT**: 서비스가 없고, sdk ≥ 34, 0 < remain < 170초, 뒤에 있다. 지금처럼 `RestShortService`를 쓴다.
- **LOOSE**: 그 밖이다. 느슨한 알람만 건다.

느슨한 알람(`setAndAllowWhileIdle`)은 EXACT가 아닐 때 늘 걸어 둔다(지금과 같다). 휴식이 없거나 일시정지면 서비스 타이머도 지운다(`WorkoutService.cancelRest`).

서비스 타이머가 끝나면 `RestAlarm.onRestDone(ctx)`를 작업 스레드에서 부른다. 같은 휴식은 한 번만 울리는 장치(`rungEndsAt`)가 이미 있어서, 알람과 두 번 겹쳐도 안전하다.

### 3. 화면 꺼짐에 직접 시작(LockScreenGate)

- 순수 판정 `LockScreenGate.directStart(wasForeground, overlay, alive)` = `!alive && (wasForeground || overlay)`.
- `overlay` = `Settings.canDrawOverlays(ctx)`(23+).
- `onScreenOff`가 이 판정으로 `startActivity(LockWorkoutActivity, NEW_TASK)`를 부른다.
- 실패하거나 판정이 거짓이면, 지금처럼 화면이 켜질 때 `onScreenOn`이 FSI를 쏜다.
- 휴식 끝(`onRestDone`)

  - overlay가 있고, 화면이 켜져 있지 않거나 잠겼으면 `LockWorkoutActivity.intent(ctx, true)`(wake)로 직접 시작을 먼저 해 본다. 안 되면 FSI를 쏜다.
  - 이미 떠 있으면(alive) 액티비티 쪽 tick이 그린다. 이때 화면을 켜야 하면 FSI(wake)를 그대로 쏜다. 그러면 액티비티가 새 intent의 wake로 켠다(singleTask onNewIntent).
- 매니페스트에 `android.permission.SYSTEM_ALERT_WINDOW`를 더한다. 특별 권한이라 설치 때 자동으로 허용되지 않는다. 프로필에서 설정을 연다.

### 4. 플러그인·웹 진단

- 플러그인

  - `VERSION`을 "1.3.0"으로 올리고 features에 "lockService"를 더한다.
  - `info`에 두 값을 더한다: `overlay`(canDrawOverlays), `service`(WorkoutService가 지금 도는가).
  - `openSettings('overlay')` → `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` + `package:` URI. 실패하면 앱 정보 화면을 연다.
- `setLockScreen(false)`: 서비스를 DETACH로 멈춘다(카드는 남긴다). `true`면 refreshAsync를 불러, 앞에 있을 때 서비스를 다시 시작한다.
- `src/frontend/lib/native.ts`

  - `lockInfo`에 `overlay: boolean | null`, `service: boolean | null`을 더한다(모르면 null · 옛 앱).
  - `openSettings` 종류에 "overlay"를 더한다.
- `src/frontend/app/components/profile/LockScreenRow.tsx`: 잠금 운동 화면이 켜져 있고 `overlay === false`면 진단 줄 `row-lock-overlay`를 보여 준다.

  - 제목: 「다른 앱 위에 표시 허용」
  - 값: 「허용 필요 — 켜기」
  - 누르면 `openSettings('overlay')`를 연다.
  - 기존 `row-lock-fullscreen`과 함께 보인다. 진단 줄은 빠진 것만 보여 준다.
- 힌트 문구 `profile.lockScreenOverlayHint`: 「허용하면 앱이 뒤에 있어도 화면을 끄는 순간 운동 화면이 떠요」. 줄의 보조 글로 보여 준다.

### 5. 버전

- 앱: 1.4.0 · versionCode 5
- 웹: 0.61.0(기능 = minor)
- 플러그인: 1.3.0

### 6. 스펙 리뷰 반영(REV-016)

- **진단 기록** `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockDiag.java`(새): 마지막 30줄만 남기고, 운동 이름·값은 적지 않는다. 적는 것:

  - 화면 꺼짐·켜짐을 받았을 때 고른 경로(직접 시작 · 못 함 · FSI · FSI 허용 안 됨)
  - 휴식 끝 경로
  - 서비스 시작 요청·켜짐·끝(이유)
  - 운동 화면이 열리고 닫힌 이유(\`src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockWorkoutActivity.java\`)

플러그인 \`info.diag\`로 넘기고, 프로필 「잠금 운동 화면 진단 기록」(\`row-lock-diag\` · 펼치기 · 최근 것이 위)에서 보인다.

- **배터리 진단**: \`info.battery\`(isIgnoringBatteryOptimizations)를 넣는다.

  - 거짓이면 「배터리 사용 제한 없음」 줄(\`row-lock-battery\`)을 보인다.
  - 누르면 \`openSettings('battery')\`로 제외 요청 대화상자를 연다(REQUEST_IGNORE_BATTERY_OPTIMIZATIONS · 자체 배포). 열 수 없으면 앱 정보 화면으로 간다.
- **서비스 상태 깃발**

  - \`desired\`: sync가 늘 기록한다. onStartCommand는 startForeground 직후 거짓이면 바로 finish한다.
  - \`starting\`: 10초가 지나면 만료된다.
  - \`blocked\`: 시간 초과나 시스템 종료 뒤 다시 시작하지 않게 막는다. 다음에 앱이 앞에 오면(handleOnStart → \`WorkoutService.onAppForeground\`) 풀린다.
  - \`finishing\`: finish를 두 번 불러도 안전하게 한다.
  - 멈춤 진입점은 sync 하나다. 카드를 지울지는 메인 스레드에서 그때의 \`lastActive\`로 정한다. finish 뒤에는 늘 refreshAsync를 부른다.
- **shortService와 넘겨받기**: \`RestShortService.isRunning()\`이면 먼저 멈추고, 그 onDestroy가 부르는 refresh에서 WorkoutService를 시작한다. 같은 알림 id를 두 FGS가 쥐지 않는다.
- **휴식 끝 띄우기** \`LockScreenGate.restRoute(interactive, fullScreen, overlay)\`

  - 꺼진 화면이고 FSI가 허용되면 FSI다. SystemUI가 화면을 켠다.
  - 아니면 오버레이 허용일 때 직접 시작(wake)을 한다. 1.5초 뒤 \`isAlive\`가 거짓이면 FSI로 넘어간다. BAL이 막혀도 예외가 나지 않기 때문이다.
- **15분 넘는 휴식**: 서비스가 돌면 「끝−15분」에 REDRAW 알람(요청 코드 12)을 건다. 그때부터 서비스가 시각을 지킨다.
- **화면 꺼짐 직접 시작**: 오버레이가 주 경로다. 「앞에 있었음」 경로는 화면이 잠들면 막힐 수 있다(TOP_SLEEPING). 막히면 onScreenOn의 FSI가 대신한다.
- **카드 밀어 지우기**: Android 14+에서는 FGS 알림도 사용자가 지울 수 있다. 지우면 다음 상태 변화 때 다시 나온다. 서비스는 계속 돈다.
- **알려진 한계**: 시스템이 프로세스를 죽이면 다음에 앱을 열 때까지 서비스가 없다. 진단 기록에 「서비스 끝: 시스템」이 남는다.

## 작업 단계

### Phase 1 — 안드로이드 서비스·경로·진단 + 웹 진단

- [x] `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/WorkoutService.java`(shouldRun · sync · start/stop · scheduleRest/cancelRest · onTimeout · onDestroy)
- [x] 매니페스트: service + property, FOREGROUND_SERVICE_SPECIAL_USE, SYSTEM_ALERT_WINDOW
- [x] `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockHub.java` refresh → `WorkoutService.sync`
- [x] `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/RestAlarm.java` route + SERVICE 경로 · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/RestShortService.java`는 그대로(route가 고른다)
- [x] `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockScreenGate.java` directStart · onScreenOff/onRestDone 직접 시작 · setEnabled에서 서비스 멈춤
- [x] 플러그인 info·openSettings·VERSION
- [x] JUnit `src/mobile/android/app/src/test/java/org/tarae/liftgram/lock/LockServiceRulesTest.java`(shouldRun · route 표 · directStart 표)
- [x] 웹 native.ts · LockScreenRow · i18n ko/en · e2e(overlay 줄 · 누르면 openSettings overlay · 옛 앱 null이면 안 보임)
- [x] 버전 1.4.0/5 · 0.61.0
- **완료 기준**:

  - JUnit 전부 통과(기존 42 + 새 것), `./gradlew assembleRelease` 성공
  - 코어 시험 통과, `make verify` 통과, 로컬 운영 빌드 e2e(이 작업의 포트 3220/3221) 통과
  - 배포 뒤 `https://liftgram.tarae.org/downloads/android.json`이 versionCode 5

## 수용 기준(SRS 연결)

- **SRS-100**: 운동 중 화면을 끄고 다시 켜면 잠금 해제 없이 운동 화면이 보인다. 여기에 이번 조건이 붙는다.

  - 「다른 앱 위에 표시」를 허용했으면 앱이 뒤에 있어도(다른 앱을 쓰다 꺼도) 뜬다.
  - 허용하지 않았으면 앱을 보다가 끈 경우, 또는 FSI가 허용된 경우에만 뜬다.
- **SRS-100**: 휴식이 끝나면 화면이 켜지며 운동 화면이 나온다. 서비스가 돌면 3분 넘는 휴식도 제시간에 끝난다(정확 알람 권한이 없어도).
- **SRS-096**(카드): 운동 중에는 카드가 포그라운드 서비스 알림이다. 운동이 끝나면 서비스와 카드가 함께 사라진다. 잠금 운동 화면을 끄면 서비스는 멈추고 카드는 남는다.
- **프로필**: 빠진 허용(다른 앱 위에 표시 · 전체 화면 알림)이 줄로 보이고, 누르면 그 설정 화면이 열린다.

## 테스트 계획

- **JUnit**

  - `WorkoutService.shouldRun` 표
  - `RestAlarm.route` 표: EXACT 우선 / SERVICE는 15분 상한 / SHORT는 서비스 없고 34+·뒤·170초 미만 / LOOSE
  - `LockScreenGate.directStart` 표
- **e2e(가짜 플러그인)** `src/frontend/e2e/lock-bridge.spec.ts`

  - overlay=false → `row-lock-overlay`가 보이고, 누르면 openSettings kind 'overlay'
  - overlay=true → 안 보임
  - 옛 앱(overlay 없음 → null) → 안 보임
  - lockScreen=false → 안 보임
- **빌드**: assembleRelease, 그리고 `aapt dump` 또는 merged manifest에서 service·권한 확인
- **실기기 확인 목록**(사용자): 아래는 결과 회신에 적는다.

  - 프로필에서 「다른 앱 위에 표시」 허용
  - 앱을 보다가 끄고 켜기
  - 다른 앱을 쓰다가 끄고 켜기
  - 휴식 끝에 화면 켜짐
  - 운동 끝에 카드·서비스 사라짐

## 위험·주의

- **FGS 시작 크래시**: startForegroundService 뒤 5초 안에 startForeground를 부르지 않으면 앱이 죽는다. 그래서 onStartCommand 맨 앞에서 부른다. 다른 경로로 멈출 때도 startForeground가 끝난 인스턴스만 멈춘다.
- **두 서비스가 같은 알림 id**: route가 SERVICE를 고르면 shortService를 먼저 멈춘다. 서비스가 돌기 시작하면 다음 refresh에서 shortService가 멈춘다. 잠깐 겹쳐도 같은 알림이라 화면은 같다. shortService는 DETACH로 끝나 알림을 지우지 않는다.
- **specialUse 정책**: 플레이 배포 때 다시 판단한다(ADR-049 결과). 지금은 자체 배포다.
- **Android 15 BAL**: SYSTEM_ALERT_WINDOW 예외는 액티비티 시작에 그대로 남아 있다. FGS 시작 예외(보이는 오버레이 창이 있어야 함)만 줄었다. 우리는 FGS를 앞에서만 시작하므로 영향이 없다.
- **배터리**: 서비스는 CPU를 잡지 않는다. wake lock은 휴식 중(최대 15분+10초)에만 잡는다.
- **삼성 「절전 앱」**: 사용자가 앱을 깊은 절전에 넣으면 FGS도 막힐 수 있다. 실기기 확인 목록에 「배터리 → 제한 없음」 안내를 적는다.
