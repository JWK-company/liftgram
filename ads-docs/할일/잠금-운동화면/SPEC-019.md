# SPEC-019 — Feature Spec — 잠금화면 위 전용 운동 화면(안드로이드) · 무게·횟수 조정 완료 · 휴식 끝 화면 켜기 (SRS-100 · ADR-048)

> 타입 Spec · 그룹 할일/잠금-운동화면 · ADStudio가 `SPEC-019.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-048, SRS-096, SRS-100

## 목표

운동 중인 안드로이드 앱 사용자가 화면을 켜면 갤럭시 잠금화면 대신 **리프트그램 운동 화면이 전체로** 보이게 한다(SRS-100). 잠금 해제 없이 할 수 있는 조작:

- 세트 완료(무게·횟수를 바꿀 수 있음)
- 휴식 +30초·건너뛰기
- 다음 세트 미리보기

휴식이 끝나면 화면을 켜서 이 화면과 소리를 낸다. 사용자 결정(2026-11-03 · 권장안): 안드로이드만 · 기본 켜짐 · 넣을 것 = 완료·휴식 조작·무게/횟수 조정 · 휴식 끝 = 화면 켜기+소리 · 운동 종료·종목 넘기기는 잠금 해제 뒤에만.

**등급 Feature** — 새 화면(액티비티)과 네이티브·웹·도메인 세 층을 바꾸지만 DB·서버는 바꾸지 않는다.

## 범위(바꿀 파일)

| 층 | 파일 |
| --- | --- |
| 도메인 | `src/core/src/domain/lockScreen.ts`(`LockAction.values`) · `src/core/src/domain/lockDrain.ts`(`wellFormed`) · `src/core/src/data/workoutRepository.ts`(`applyLockAction`이 values 씀) · 단위 시험 `src/core/src/domain/__tests__/lockValues.test.ts`(새) |
| 안드로이드 | 새 `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockWorkoutActivity.java` · 새 `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockScreenGate.java` · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockState.java`(`pressComplete` values) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LockView.java`(setId·step 단위) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/RestAlarm.java`(휴식 끝에 화면) · `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/LiftgramLockPlugin.java`(info·설정) · `src/mobile/android/app/src/main/AndroidManifest.xml` · `src/mobile/android/app/src/main/res/values/strings_lock.xml` · `src/mobile/android/app/src/main/res/values-en/strings_lock.xml` · JUnit `src/mobile/android/app/src/test/java/org/tarae/liftgram/lock/` |
| 웹 | `src/frontend/lib/native.ts`(lock.info·setLockScreen·openSettings 'fullScreen') · `src/frontend/app/components/profile/LockScreenRow.tsx` · `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` · e2e `src/frontend/e2e/lock-bridge.spec.ts` |
| 버전 | `src/mobile/release.json`(1.3.0 · versionCode 4) · `src/mobile/android/app/build.gradle` · `src/frontend/package.json`(0.60.0) |

## 설계

### 1. 완료 조작에 값 싣기(도메인)

`LockAction`에 선택 필드를 더한다: `values?: { setId: string; weight: number | null; reps: number | null; unit?: 'kg' | 'lb' }[]`.

- `weight`는 **누를 때 보인 단위**(`unit`, 없으면 블록 단위 — 하위 호환)다. 한쪽 입력이면 한쪽 값이다. 웹이 `toKg(weight, unit)`로 바꾼다.
- **바꾼 칸만** 값을 싣고, 나머지는 null로 둔다(REV-014 #38). 손대지 않은 멤버는 values에 넣지 않는다. 예외는 아래 「낡은 처방값」이다.
- **낡은 처방값(REV-014 #37)**: 스냅샷 멤버에 `weId`와 `filled`(처방 채우기로 값이 정해진 세트인지)를 싣는다. 이번 세션에서 같은 `weId`의 앞 세트를 고쳐 완료했다면, `filled` 멤버를 완료할 때 **보인 무게·횟수를 그대로** values에 싣는다. 사용자가 보고 든 값이 기록돼, drain의 다시 채우기와 어긋나지 않는다.
- `wellFormed`: values가 있으면 배열이어야 한다. 각 원소는 setId 문자열 · weight·reps는 유한수 또는 null · unit은 없거나 kg·lb여야 한다. 아니면 조작 전체를 malformed로 버린다. 옛 조작(values 없음)은 그대로 통과한다.
- `applyLockAction`:

  - 완료하는 세트에 values가 있으면 칸마다 **표시 정밀도로 저장값과 다를 때만** `writeSetValues(rec, …, 'user')`로 쓴다. 같으면 저장 kg과 출처를 그대로 둔다. 그 뒤 done을 쓴다.
  - 「다름」 비교는 values로 쓴 칸만 빼고 나머지 칸은 그대로 한다(#39).
  - 범위는 weight 0~1000kg, reps 0~999다. 넘으면 그 값만 무시한다.
  - 시간(유산소) 세트의 values는 무시한다(#42). setIds 밖의 setId도 무시한다.
- 스냅샷에 `caps: ["values"]`를 싣는다(#40). 네이티브는 이 표시가 있을 때만 ± 조정을 켠다. 옛 웹이 values를 조용히 버리는 조합을 막기 위해서다.
- 처방 다시 채우기(planRoundFills)는 그대로 돈다. 바꾼 무게는 **같은 블록 뒤 처방 세트**(탑셋 % 등)의 채우기 기준이 된다. 처방이 없는 일반 세트는 다음 세트에 이어지지 않는다(화면과 같음 · #44).

### 2. 잠금 운동 화면(안드로이드)

`LockWorkoutActivity`의 속성: `exported=false` · `showWhenLocked` · `excludeFromRecents` · `taskAffinity` 분리 · `launchMode=singleTask` · 세로 고정 · `windowDisablePreview` · KEEP_SCREEN_ON 없음.

- **잠금 판정(#18·#19)**:

  - `onCreate`에서는 닫지 않는다.
  - `onResume`과 1초 틱에서 `isInteractive && !isKeyguardLocked`면 닫는다. `ACTION_USER_PRESENT`를 받아도 닫는다.
  - 스냅샷이 없으면(운동 끝·버림) 닫는다. 화면이 꺼져 있어도 살아 있는 화면은 WeakReference로 찾아 닫는다(#28).
- **화면 켜기(#1·#20)**: intent(onCreate·onNewIntent)마다 `setTurnScreenOn(wake)`. 화면이 켜지면(onResume) false로 되돌린다. 켜진 뒤 1초 동안은 터치를 무시한다.
- **그리기**: 저장소 실행기에서 `LockView.of`를 읽고 화면 스레드에서 그린다(1초 틱 · #29). 레이아웃은 코드로 만든다(어두운 바탕 · ScrollView). 위에서부터 이렇게 놓는다:

  1. 위 줄: 운동 제목 · 「닫기」(잠금화면으로) · 「잠금 해제」
  2. 휴식 중이면 가장 큰 카운트다운 `m:ss` + 「+30초」·「건너뛰기」
  3. 지금 단계 멤버마다(슈퍼셋은 모두, 스크롤): 종목 이름 · 세트 라벨 · **무게 [−] 값 [+]** · **횟수 [−] 값 [+]**

    - ± 버튼은 56dp이고, 길게 누르면 반복한다.
    - 고친 값은 강조색과 「•」 표시로 보이고, 그 아래에 원래 값을 작게 둔다.
    - 시간·거리 종목은 값만 보인다.
  4. 「세트 완료」 — **길게 누르기 0.6초**(채워지는 진행 표시, #3). 높이 72dp.
  5. 다음 미리보기 · 막힘 안내(카드와 같은 문구)
- **버튼 상태(#7·#34)**:

| 단계 상태 | 완료 | ± 조정 | 휴식 버튼 |
| --- | --- | --- | --- |
| 보통(caps values 있음) | 길게 누르기 | 켬 | 휴식 중일 때 |
| 보통(옛 웹 — caps 없음) | 길게 누르기 | 끔(값만 보임) | 휴식 중일 때 |
| 막힘(openApp: 기본값·멈춤·유산소 값 없음) | 「앱에서 하기」(잠금 해제 → 앱) | 끔 | 휴식 중일 때 |
| 대기열 가득 · 일시정지 | 「앱에서 하기」 | 끔 | 끔 |

- **조정**:

  - 무게 단계는 kg 2.5, lb 5다. 한쪽 입력이면 한쪽 값 그대로이고, 최소 0이다. 횟수는 1 단위이고 1~999다(#45).
  - 조정 값은 `LockState.draft`(저장소)에 둔다(#4). 원래 값으로 돌아오면 지운다. stepToken이 바뀌거나 그 멤버의 표시값이 바뀌면 버리고(#48), 버린 일은 한 번 안내한다.
- **완료**:

  - 저장소 실행기에서 `s.pressComplete(now, token, true)` → `LockHub.refresh` → `LiftgramLockPlugin.fireAction()`. 카드 버튼과 같은 길이고, 연타는 토큰으로 막는다.
  - 카드 버튼도 values를 싣는다. 단 초안(draft)은 없으므로 「낡은 처방값」 멤버의 보인 값만 싣는다.
- **+30초·건너뛰기**: 리시버와 같은 `addRest`·`endRest`.
- **잠금 해제(#26)**: `requestDismissKeyguard`가 성공하면 MainActivity로 `ACTION_VIEW liftgram://workout`(NEW_TASK)을 보내고 닫는다. 매니페스트 intent-filter에 host `workout`을 더한다.
- **소리(#36)**: 화면은 소리를 내지 않는다. 휴식 끝 소리는 `RestAlarm`(`RestSound`)이 낸다.
- **접근성(#10)**: 버튼마다 contentDescription을 달고, 글자는 sp, 대비는 4.5:1 이상이다.

### 3. 띄우는 길(LockScreenGate)

- **켜기 조건**(`LockScreenGate.shouldShow` — 순수 함수 · JUnit):

  - 설정 켜짐(SharedPreferences `liftgram_lock_ui` `lockScreen` · 기본 true)
  - 스냅샷 있음, 일시정지 아님
  - 잠겨 있거나 화면이 꺼짐(`!isInteractive || isKeyguardLocked`)
  - 운동 화면이 아직 떠 있지 않음 — 떠 있으면 게시하지 않고 `onNewIntent`로 깨운다(#21)
- **리시버 등록(#24)**: `LockScreenGate.ensureRegistered(appCtx)` — 정적으로 한 번, `ContextCompat.registerReceiver(…, RECEIVER_NOT_EXPORTED)`로 `ACTION_SCREEN_OFF`·`ACTION_USER_PRESENT`를 등록한다. 플러그인 load와 `sessionUpdate`에서 부른다.
- **화면 꺼짐**:

  - 앱이 앞이었으면 `startActivity`로 바로 띄운다(#2 — 이 순간에는 앞에서 시작하는 것이 허용된다).
  - 아니면 FSI 알림(wake=false)을 게시한다.
- **휴식 끝**: `RestAlarm.onRestDone`이 실제로 울릴 때(`ring != null`) 켜기 조건을 보고 `show(ctx, true)`. 화면이 이미 떠 있으면 wake intent로 깨운다.
- **`show` — FSI 알림(#23·#25)**:

  - 채널 `workout_fullscreen`(IMPORTANCE_HIGH · 채널에서 소리·진동 끔 · 잠금화면 공개), id 2002
  - CATEGORY_ALARM · PRIORITY_HIGH. `setSilent`·`setOnlyAlertOnce`는 쓰지 않는다.
  - `cancel(2002)` 뒤 `notify`. fullScreenIntent와 contentIntent는 같은 액티비티이고, PendingIntent는 IMMUTABLE이다. `setTimeoutAfter(30_000)`.
  - Android 14+에서 `canUseFullScreenIntent()`가 false면 게시하지 않는다(카드는 그대로).
- 액티비티가 열리면 2002를 지운다.

### 4. 플러그인·웹 설정

- `info()`에 `lockScreen: boolean`(설정) · `fullScreen: boolean | null`(허용 — 알림 켜짐 · 채널 중요도 · `canUseFullScreenIntent` · 14 미만은 true · #12)을 더한다. 플러그인 VERSION 1.2.0 · features `lockScreen`(#33).
- 새 메서드 `setLockScreen({enabled})`. `openSettings({kind:'fullScreen'})`은 `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`(34+ · `package:` URI · #27)를 연다.
- `src/frontend/lib/native.ts` `lock.setLockScreen(enabled)` · `lockInfo()`가 두 값을 돌려준다(모르면 null — 옛 껍데기).
- `LockScreenRow`: 알림이 켜져 있고 `lockScreen != null`(새 껍데기)이면 「잠금화면 운동 화면 · 켜짐/꺼짐」 줄을 더한다(누르면 토글 · `role=switch` · `aria-checked`). 켜짐인데 `fullScreen === false`면 「허용 필요 — 켜기」(설정 열기).

### 5. 문구

| 키 | 한국어 |
| --- | --- |
| lock_screen_unlock | 잠금 해제 |
| lock_screen_close | 닫기 |
| lock_screen_hold | 길게 눌러 완료 |
| lock_screen_in_app | 앱에서 하기 |
| lock_screen_draft_lost | 바뀐 세트라 조정한 값을 지웠어요 |
| lock_screen_complete | 세트 완료 |
| lock_screen_weight / lock_screen_reps | 무게 / 횟수 |
| lock_screen_rest | 쉬는 시간 |
| lock_screen_next | 다음: %s |
| lock_fullscreen_channel | 잠금화면 운동 화면 |
| profile.lockScreen | 잠금화면 운동 화면 |
| profile.lockScreenNeedsPermission | 허용 필요 — 켜기 |

영어 문구도 함께 둔다.

## 리뷰 반영(REV-014)

스펙 리뷰 REV-014(전문가 3명 · 49건 · 채택 47 · 보류 2)를 반영했다.

- 바꾼 곳: 1절(바꾼 칸만 · 낡은 처방값 · caps · unit), 2절(잠금 판정 · 화면 켜기 · 길게 눌러 완료 · 버튼 상태 표 · draft · 딥링크), 3절(조건·등록·FSI 플래그).
- 보류: 무시된 값 진단 수 · 기구별 증분.

## 작업 단계

### Phase 1 — 완료 조작에 무게·횟수 싣기(도메인)

- [ ] `LockAction.values` 타입(`unit` 포함) · `wellFormed` 검사
- [ ] `applyLockAction`: 칸마다 표시 정밀도로 다를 때만 `writeSetValues(…, 'user')` · 쓴 칸만 「다름」 비교에서 뺌 · 범위 밖 값·시간 세트·setIds 밖 무시
- [ ] 스냅샷: `caps: ["values"]` · 멤버 `weId`·`filled`
- [ ] 단위 시험(`src/core/src/domain/__tests__/lockDrain.test.ts`에 더함): wellFormed(옛 조작 통과 · 깨진 values 거절) · 단위 변환(kg·lb · unit 우선) · 범위 · 섞인 멤버 · 같은 값이면 출처 유지 · 남은 칸 「다름」 · 멱등 재적용 · 이미 완료 · 슈퍼셋 한 멤버만
- **완료 기준**: 단위 시험 · `make verify`

### Phase 2 — 안드로이드 잠금 운동 화면

- [ ] `LockState`: draft(저장·버림·안내) · `pressComplete(now, token, withDraft)` — 초안 값 + 「낡은 처방값」 멤버의 보인 값을 values로 · caps 없으면 values 없음
- [ ] `LockView.Member`: setId·weId·filled·조정 가능 여부
- [ ] `LockWorkoutActivity`(2절) · `LockScreenGate`(3절) · `RestAlarm.onRestDone` 연결 · `ensureRegistered`
- [ ] 매니페스트: 액티비티 · `USE_FULL_SCREEN_INTENT` · host `workout` · 문구(ko·en)
- [ ] 플러그인 `info` 두 값 · `setLockScreen` · `openSettings('fullScreen')`
- [ ] JUnit(순수 모델): draft(바꾼 칸만 · 원래 값이면 지움 · 토큰·표시값 바뀌면 버림+안내) · `pressComplete` values(낡은 처방값 · caps 없으면 없음 · 토큰 불일치 null) · 조정 단계(kg 2.5 · lb 5 · 최소 0 · 횟수 1~999) · 켜기 조건 표(`LockScreenGate.shouldShow`)
- **완료 기준**: `./gradlew testDebugUnitTest` · 릴리스 APK 빌드 성공

### Phase 3 — 프로필 설정 · 배포

- [ ] `src/frontend/lib/native.ts` · `src/frontend/app/components/profile/LockScreenRow.tsx` · i18n
- [ ] e2e `src/frontend/e2e/lock-bridge.spec.ts`: 가짜 플러그인으로 줄 보임·토글 호출 · 허용 필요 → 설정 열기 · 옛 껍데기(값 없음)면 줄 없음 · drain이 values 조작을 기록에 씀(무게·횟수·완료)
- [ ] 버전: 앱 1.3.0(versionCode 4) · 웹 0.60.0
- [ ] 독립 qa code → 커밋 → `src/scripts/deploy-h2500-3.sh`
- **완료 기준**: e2e · `make verify` · 배포 확인(android.json versionCode 4) · 실기기는 사용자 피드백

## 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-100 #1·#6·#8 | 화면 끔/켬 → 운동 화면 · 끝나면 닫힘 · 잠금 풀린 상태엔 안 뜸 | 실기기(사용자) · 켜기 조건 JUnit |
| SRS-100 #2 | 바꾼 무게·횟수로 완료 · 한 번만 반영 | 단위(Phase 1) · e2e drain · JUnit pressComplete |
| SRS-100 #3 | +30초·건너뛰기 | 기존 JUnit(LockState) 재사용 · 실기기 |
| SRS-100 #4 | 휴식 끝 화면 켜짐+소리 | 실기기 |
| SRS-100 #5 | 잠금 해제 → 앱 운동 화면 | 실기기 |
| SRS-100 #7 | 프로필 끄기·허용 안내 | e2e |

## 테스트 계획

- 단위: `node --import tsx --test src/core/src/domain/__tests__/lockValues.test.ts` + 기존 lock 시험 전체
- JUnit: `cd src/mobile/android && ./gradlew testDebugUnitTest`
- e2e: 로컬 운영 빌드(웹 3220 · API 3221)에 `src/frontend/e2e/lock-bridge.spec.ts` · 회귀(app-distribution · app-boot · profile)
- `make verify`
- 실기기(배포 뒤 · 사용자 갤럭시 S26): 「앱 → 화면 끔/켬」과 「다른 앱 → 끔/켬」을 따로 · 완료(무게 조정 · 길게 누르기) · 휴식 끝 화면 켜짐 · 잠금 해제 → 앱 운동 화면 · 운동 종료 뒤 원래 잠금화면 · 프로필 끄기 · 업데이트 뒤 FSI 허용 상태

## 위험·주의

- **FSI 권한**: 안드로이드 14+에서 사용자가 끄면 화면이 뜨지 않는다. 프로필 안내로 보완한다. 플레이 빌드에서는 다시 판단한다(ADR-048).
- **화면 꺼짐 방송의 한계(REV-014 #17·#35)**: Android 14+에서 오래 백그라운드에 있던(cached) 앱이나 삼성 「절전 앱」에는 방송이 늦거나 오지 않는다. 그때는 휴식 끝 경로와 카드가 대신한다.
- **방해 금지·삼성 운동 모드**: FSI가 막힐 수 있다. 카드는 그대로 보인다.
- **프로세스가 죽은 경우**: 화면 꺼짐을 못 받는다. 카드·휴식 알람이 대신한다(알려진 한계). 피드백을 보고 포그라운드 서비스를 검토한다.
- **삼성 잠금 지연**: 「자동 잠금」이 몇 초 늦으면, 화면이 꺼진 직후에는 아직 잠기지 않았을 수 있다. 액티비티는 화면이 켜져 있고(`isInteractive`) 잠금이 풀려 있을 때만 닫으므로, 꺼진 채로는 닫히지 않는다.
- **같은 조작 두 길**: 카드 버튼과 운동 화면 버튼이 같은 토큰을 쓰므로 중복 완료가 없다.
- **값 신뢰**: values는 앱 안(exported=false 액티비티)에서만 만든다. 웹 drain은 범위 검사를 하고 출처 user로 쓴다.
