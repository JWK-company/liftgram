# QA spec — 전용 앱(안드로이드·iOS) 스펙 독립 리뷰

- 대상: `.ouroboros/docs/spec/20261103_native-app/spec.md`
- 근거 문서: URS-031·032 · SRS-095·096·097 · ADR-046 · ADR-032 · 코드(`src/frontend`·`src/core`·`src/backend`·`src/database/migrations`) · 북타래 `feat/ios-app:src/mobile/`
- 참여 전문가(역할만 적음)
  1. **iOS 네이티브 전문가**: ActivityKit·WidgetKit·App Intents·WKWebView·AlarmKit
  2. **안드로이드 네이티브 전문가**: 알림·AlarmManager·포그라운드 서비스 유형·Android 14~16 정책·앱 위젯
  3. **오프라인 우선 웹/동기 아키텍트**: Watermelon/LokiJS·서비스 워커·Capacitor server.url·tabGuard
  4. **스토어 심사·인증 감사관**: Google Play·App Store 4.2/4.8/5.1.1, OAuth 웹뷰 차단, Apple 로그인, 계정 삭제

## 판정: **조건부**

방향(Capacitor 껍데기 + 네이티브 확장 + "정본은 웹 로컬 기록")은 맞다. 하지만 §4 대기열 설계에는 기록이 틀어지는 구조 결함이 여러 개 있다. 스펙이 기대는 코드 사실(순서 함수, 세트 완료 저장 경로) 가운데 일부는 실제 코드와 다르다. 앱 로그인 복귀 방식은 북타래에서 검증된 방식을 버리고 검증되지 않은 방식을 골랐다. 아래 H 항목 6개를 스펙에 반영하면 P0(껍데기)는 바로 시작해도 된다. P1(잠금화면)은 H-1~H-5를 고친 뒤에 시작해야 한다.

---

## H — 구현 전 반드시 고칠 것

### H-1. 「세트 완료」 조작이 하나의 무게·횟수를 여러 세트에 덮어쓴다(슈퍼셋), 게다가 표시 단위로 왕복해 값이 변한다
- **근거**
  - 스펙 §4.4: `kind:"complete"; setIds: string[]; weight: number|null; reps: number|null`로, 값 한 쌍에 세트가 여러 개다. §4.2 `LockStep.weight`는 "표시 단위로 이미 환산"된 값이다.
  - 웹 슈퍼셋 완료는 멤버마다 **자기 값**을 쓴다. `ActiveWorkout.tsx:738-747`에서 `entries = round.map(... d?.weightKg ...)`를 만들어 `completeSupersetRound(entries)`로 넘긴다. 받는 쪽은 `workoutRepository.ts:1687-1716`이고, 멤버마다 값을 따로 반영한다.
  - 무게 단위는 **블록마다** 다르다(SRS-067). `ExerciseBlock.tsx:188-196`의 `blockUnit`이 그 근거다. 그런데 스펙 `LockSnapshot.unit`은 세션 전체에 하나뿐이다.
  - 웹은 "보이는 숫자 그대로면 저장된 kg을 유지"한다(`SetRowEdit.tsx:196,222` `enteredWeightToKg(n, unit, set.weightKg)`). lb↔kg 왕복으로 반올림 오차가 생기지 않게 하려는 규칙이다. 플레이트 한쪽 배수(`loadMultiplier`, SRS-058)도 표시값과 저장값을 다르게 만든다.
- **실패 시나리오**
  - 벤치 80kg + 풀업 0kg을 슈퍼셋으로 묶고 잠금 중 「세트 완료」를 누른다. 조작에는 `setIds=[벤치2, 풀업2], weight=80`이 실린다. 이 값을 그대로 적용하면 풀업 세트가 80kg으로 저장돼 볼륨과 PR이 오염된다.
  - lb 블록에서 225lb로 저장된 세트(102.058kg)가 표시 225 → 환산 102.06kg 같은 식으로 덮여, 볼륨과 PR이 미세하게 달라진다. 그러면 SRS-096 수용 기준 "볼륨·PR이 앱에서 직접 누른 것과 같다"가 깨진다.
- **고칠 방법**
  - 네이티브는 값을 편집하지 않으므로 **조작에 값을 싣지 않는다**: `{kind:"complete", setIds, snapshotRev, at}`. 적용할 때는 저장소에 있는 값 그대로 완료한다(`completeSupersetRound(entries의 값 undefined)` 또는 `setSetDone`).
  - 표시는 단계마다 `unit`을 따로 가진다(`LockStep.unit`). 최상위 `unit`은 없앤다.
  - 값을 꼭 실어야 한다면 세트별 `{setId, weightKg(저장값 그대로), reps}[]`로 바꾼다. 그리고 "저장값이 스냅샷 이후 바뀌었으면 값은 덮지 않고 완료만 한다"는 규칙을 추가한다(H-2 참고).

### H-2. 스냅샷과 대기열을 맞추는 규칙이 없다: 낡은 스냅샷이 네이티브 사본을 되돌려 세트 하나가 영원히 완료되지 않는다
- **근거**
  - 스펙 §4.2는 "보내는 때: … 앱 복귀 직후 대기열 적용 뒤"라고만 한다. §4.4 적용 시점은 "resume · 첫 로드 · 앱이 앞에 있을 때 action 이벤트(즉시)"로 **세 경로가 동시에** 돈다. 스냅샷에 세대 번호가 없고, 네이티브가 대기 중인 조작 위에 새 스냅샷을 받을 때의 규칙도 없다.
  - 웹에는 묶음 휴식, 완료 시 휴식 시작, 휴식 끝내기가 있다. 조작 하나하나가 멱등이어도 **순서가 섞이면 최종 상태가 달라진다**.
- **실패 시나리오**
  1. (안드로이드에서 화면이 꺼졌지만 웹뷰 JS가 느리게 살아 있는 경우) 잠금 중 c1(2세트 완료)을 누른다. 네이티브는 이벤트를 보내고, 카드는 3세트로 바뀐다. 이어 c2(3세트 완료)를 누르면 카드는 4세트가 된다.
  2. 웹이 c1만 적용한 뒤 DB로 만든 스냅샷(3세트가 지금 세트)을 보낸다. 네이티브가 이걸로 사본을 통째로 바꿔 카드가 **3세트로 되돌아간다**.
  3. 사용자가 다시 「세트 완료」를 누른다. 조작은 3세트로 가고(이미 완료라 아무 일도 없음) 카드는 4세트를 보이는데, 실제 4세트는 완료되지 않았다. 사용자는 4세트를 했다고 믿는다. 유실이다.
  - 휴식도 같은 문제가 있다. drain 1이 [c1(휴식 시작 t1)]을 처리하는 사이에 이벤트로 `rest_set(null)`(끝내기)이 먼저 적용된다. 그 뒤 c1의 휴식 연산이 적용되면 **끝낸 휴식이 되살아난다**.
- **고칠 방법**
  - 조작에 단조 증가 `seq`를 매긴다. 스냅샷에는 `appliedThroughSeq`를 싣는다. 네이티브는 `appliedThroughSeq`가 자기 미적용 조작보다 앞선 스냅샷을 받으면, **남은 조작을 그 위에 다시 적용(rebase)한 뒤** 그린다.
  - 웹의 적용기는 **한 줄(mutex)**로만 돈다. 이벤트·resume·첫 로드는 모두 같은 `drain()` 하나를 깨우기만 하고, 그 함수는 seq 순서대로 적용한다.
  - 잠금 중 휴식의 정본은 네이티브가 들고 있는 **현재 휴식 상태 하나**(`rest.endsAt`)로 한다. 웹은 휴식 연산을 하나씩 다시 재생하지 않고, drain이 끝날 때 네이티브의 현재 `endsAt`을 그대로 받아들인다.
  - 테스트로 위 1~3번 시나리오와 휴식 순서 역전을 고정한다(M-12).

### H-3. "저장 완료 뒤 ack"가 디스크 저장을 보장하지 않는다(LokiJS 비동기 내려쓰기 · 봉인 탭), 중복 방지 로그는 오히려 유실을 만든다
- **근거**
  - 스펙 §4.4는 "적용 → 저장 완료 뒤 `queue.ack(ids)`"라고 하고, "적용한 id를 prefs(최근 200개)에 남긴다"고 한다.
  - `lib/prefs.ts:141-150`에 근거가 있다. "LokiJS는 비동기로 내려쓰므로 … 프로필 쓰기가 사라진다". 그래서 `flushLocalDbResult()`가 `"saved"`일 때만 끝난 것으로 본다. 결과가 `"sealed"`(다른 탭이 쓰기 주인)일 수도 있다(SRS-089). `database.write`가 resolve된 시점은 **메모리 반영**일 뿐이다.
  - `prefs`는 localStorage라서 **동기로 즉시** 디스크에 남는다.
- **실패 시나리오**
  - drain이 세트 3개를 적용해 `write`가 resolve된다. 적용 id는 localStorage에 기록되고 네이티브 대기열은 ack로 지워진다. 그런데 Loki가 IndexedDB로 내려쓰기 전에 앱이 강제 종료되거나 OS가 회수한다. 다음 실행에서 세트 3개는 미완료로 돌아오고, 대기열은 비어 있고, 적용 로그는 "이미 적용했다"고 말한다. **영구 유실**이다. SRS-096 수용 기준 "강제 종료 뒤 다시 열어도 한 번씩만"이 "0번"으로 깨진다.
  - 웹뷰 문서가 봉인 상태이면 쓰기가 `LOCAL_DB_SEALED`로 거부된다. 그런데도 적용 로그만 남으면 같은 유실이 생긴다.
- **고칠 방법**
  - ack 조건을 "`flushLocalDbResult() === "saved"` **그리고** `getWriterState() === "owner"`"로 명시한다. `unreachable`이면 ack하지 않고 다음 drain에서 다시 시도한다.
  - 멱등은 **DB 상태로만** 판정한다(이미 완료면 아무 일도 하지 않음). prefs 적용 로그는 없앤다. 진단용으로 남기려면 flush 성공 **뒤에** 쓰고, 그 로그로 적용을 건너뛰지 않는다.
  - 테스트: "적용 직후 flush 전에 kill"을 e2e 결함 주입으로 고정한다(`lib/e2eFlags`의 기존 결함 주입 틀).

### H-4. 웹의 세트 완료는 저장 한 번이 아니다: 처방 무게 채우기·PR·휴식 규칙을 건너뛰면 잠금 중 다음 세트가 틀린 무게로 기록된다
- **근거**
  - 스펙 §4.3은 "화면은 받은 ops를 기존 저장 경로(onToggleDone과 같은 저장소 함수)로 실행"한다고 한다.
  - 실제 `onToggleDone`(`ExerciseBlock.tsx:453-520`)과 `roundToggle`(`ActiveWorkout.tsx:727-788`)은 다음을 한꺼번에 한다.
    ① `setSetDone`/`completeSupersetRound`
    ② 휴식 `restSecondsForSetType(setType, restSeconds)`: 세트 유형별 휴식, `restSeconds`는 컴포넌트 state
    ③ `fillPrescribedLoadsAfter`: 탑셋을 마치면 이후 백오프 세트 무게를 다시 쓴다(SRS-063)
    ④ `evalLiveSetPr` 축하
    ⑤ 다음 세트 무게 제안
  - `setSetDone`(`workoutRepository.ts:1674-1682`)은 `completedAt = Date.now()`, 즉 **적용 시각**을 쓴다.
- **실패 시나리오**
  - 처방 루틴에서 잠금 중 탑셋(100kg)을 완료한다. 웹이 깨어 있었다면 ③으로 백오프 세트가 85kg으로 바뀌었을 것이다. 네이티브 사본은 바뀌기 전 값(템플릿 값이나 지난 값)을 갖고 있다. 다음 「세트 완료」는 **틀린 무게로 표시된 세트**를 완료하고, drain 때 ③이 돌더라도 이미 완료된 세트는 사람이 고친 것으로 보고 건너뛸 수 있다(QA Q5 규칙).
  - 결과적으로 "앱에서 직접 누른 것과 같다"는 수용 기준이 처방 루틴에서 깨진다. 잠금 중 완료한 세트의 `completedAt`은 앱을 연 시각이 되어, 세트 시각과 블록 단위 기본값(`blockUnit.ts:26`이 `completedAt` 최신값을 씀)이 어긋난다.
- **고칠 방법**
  - `onToggleDone`과 `roundToggle`의 저장소 쪽 오케스트레이션(①②③)을 **core의 함수 하나**로 뽑는다(예: `completeSetsFlow(repo, {setIds, at, grouped})`). 화면과 `applyLockActions`가 둘 다 그 함수를 부른다. 축하(④)와 제안(⑤)은 화면 전용으로 남긴다.
  - 저장소 함수에 `completedAt = action.at`을 넘길 수 있게 한다.
  - 스냅샷을 만들 때 **완료하면 무게 채우기가 일어나는 단계 뒤의 단계**는 순수 함수로 채워질 값을 미리 계산해 싣는다. 그게 어려우면 그 뒤 단계를 「앱 열기」로 막는다. 둘 중 하나를 스펙에서 정한다.
  - 테스트: 처방 탑셋 → 백오프를 잠금 경로와 화면 경로로 각각 돌려 결과 행을 비교한다.

### H-5. "웹 화면이 쓰는 기존 순서 함수"는 존재하지 않는다: 웹에는 「지금 세트」라는 개념이 없다
- **근거**
  - 스펙 §4.3은 "웹 화면이 쓰는 기존 순서 함수를 그대로 부른다(새 규칙 금지)"고 한다. §8은 "같은 픽스처로 화면 순서 함수와 비교"한다고 한다.
  - 실제 웹은 블록을 `sort_order` 순서로 나열하고 슈퍼셋을 한 줄로 접을 뿐이다(`ActiveWorkout.tsx:221-236`). 사용자는 아무 세트나 누른다. core 도메인을 찾아봐도 "다음/남은 세트 순서"를 내는 함수는 없다. 비슷한 것은 `firstOpenWorkingSet`(`supersetRound.ts:49`, PR 칩 대상)과 `roundKeyOf`/`pickRoundSets`(짝짓기)뿐이다.
  - 슈퍼셋은 "교대 순서"가 아니다. **화면 번호가 같은 세트끼리 한 번에** 완료하고(`supersetRound.ts:15-26`), 워밍업·드롭·실패는 짝 없이 그 종목만 완료한다.
- **실패 시나리오**: 구현자가 "새 규칙 금지"와 "함수 없음" 사이에서 즉흥 규칙을 만든다. 예를 들어 한쪽에만 워밍업이 있는 슈퍼셋, 중간에 건너뛴 세트, 종목 순서 변경 직후에 잠금 카드의 「지금 세트」가 사용자가 기대한 것과 달라진다. §8의 "화면 순서 함수와 비교" 테스트는 비교할 대상이 없어 쓸 수 없다.
- **고칠 방법**: 새 순서 규칙을 **스펙에서 명시적으로 정의**하고 사용자 확인을 받는다. 권장 규칙은 다음과 같다.
  - 블록 `sort_order` 순서
  - 블록 안 첫 미완료 세트(워밍업 포함)
  - 슈퍼셋은 `roundKeyOf` 같은 키를 한 단계로 묶음(`groupWithNext` 대신 `LockStep.setIds[]`)
  - 짝 없는 세트(워밍업 등)는 그 종목만 한 단계
  - 사용자가 건너뛴(앞 세트가 미완료인데 뒤를 완료한) 세트는 블록 첫 미완료로 되돌아감
  - 구현은 `pickRoundSets`/`roundKeyOf`를 재사용한다. 테스트는 이 규칙 자체의 표를 고정하는 방식으로 바꾼다.

### H-6. 앱 로그인 복귀를 https 앱 링크로 하면 시스템 브라우저 안에서 앱으로 돌아오지 못할 수 있다: 북타래에서 검증된 커스텀 스킴 + ASWebAuthenticationSession + 코드 결속을 버렸다
- **근거**
  - 스펙 §6: `@capacitor/browser` → 서버가 끝나면 `https://liftgram.tarae.org/auth/app-return?code=` → "앱 링크로 앱 복귀". `@capacitor/browser`는 iOS에서 SFSafariViewController, 안드로이드에서 Custom Tabs다.
  - 북타래 `feat/ios-app`의 방식은 다르다.
    - iOS: `booktarae-native` Swift `ASWebAuthenticationSession(url:, callbackURLScheme:)`
    - Android: `AndroidManifest.xml`의 `booktarae://auth?code=` intent-filter
    - 서버: `src/backend/internal/oauth/handoff.go`, "가로채기 … PKCE처럼 묶는다: `ac = S256(v)`"
  - 리프트그램 콜백은 실패할 때 `h.fail`이 `SignInPath?err=`로 302한다(`backend/internal/oauth/handler.go:240-242`). 이 302는 시스템 브라우저 안에 머문다. 로그인 코드 TTL은 60초다(`auth/account.go:44`).
- **실패 시나리오**
  - 서버 302로 같은 도메인의 https 주소에 도착해도 SFSafariViewController나 Custom Tabs가 앱으로 넘겨주지 않을 수 있다. 사용자 조작 없이 일어난 리디렉트이고, Universal Link는 같은 도메인 안 이동에서는 열리지 않는 규칙이 있다(**확인 필요**, 기기별로 다름). 그러면 사용자는 브라우저 창 안의 `/auth/app-return`에 갇힌다.
  - 그 페이지가 거기서 교환을 하면 토큰이 **브라우저 쿠키 통**에 저장된다. 앱은 계속 로그아웃 상태이고, 일회용 코드는 소모됐다.
  - 앱 링크 검증(assetlinks 지문 누락 등)에 실패하면 모든 로그인이 막힌다. 오류(`email_taken` 등)는 앱으로 돌아오지 않는다.
  - https 앱 링크 대신 커스텀 스킴을 쓰면서 결속을 생략하면, 같은 스킴을 등록한 다른 앱이 코드를 가로챈다.
- **고칠 방법**
  - 북타래 방식을 그대로 가져온다.
    - iOS: `ASWebAuthenticationSession(callbackURLScheme: "liftgram")`
    - Android: Custom Tabs + `liftgram://auth?code=` intent-filter
    - 서버: `start?app=1&ac=S256(v)` → 콜백은 쿠키를 굽지 않고 `liftgram://auth?code=`로 보낸다(성공·**오류 모두**) → 웹뷰가 `v`와 함께 교환
  - 리프트그램은 refresh 쿠키를 화면 라우트(`/api/session`)가 굽는다. 따라서 "교환 = 기존 `ExchangeLoginCode` + `v` 검증 추가"가 된다. 스펙의 "새 RPC 없음"을 "요청 필드 하나 추가"로 고친다.
  - 앱 링크(https)는 피드 공유 링크 용도로만 쓴다(§6 앱 링크 항목은 그대로 유지).
  - 시범 ③에 "제공자 3종 + 오류 경로 복귀"를 추가한다.

---

## M — 구현 중 반드시 반영

### M-1. ADR-046과 스펙이 안드로이드 카드 방식에서 서로 다르다(포그라운드 서비스 유무)
- 근거: ADR-046 결정 "안드로이드: 운동 중 **포그라운드 서비스**의 진행 중 알림". 스펙 §4.5는 FGS 없이 일반 `setOngoing` 알림을 쓴다. Android 14부터는 `setOngoing` 알림도 사용자가 밀어서 지울 수 있다(잠금 상태·CallStyle 등은 예외). https://developer.android.com/about/versions/14/behavior-changes-all#non-dismissable-notifications
- 실패 시나리오: 구현자가 ADR을 따라 FGS를 만들면 Android 14+에서 FGS 유형 선언이 필요하다. `health` 유형은 센서/활동 권한이 함께 필요하고, Play Console에 FGS 사용 신고도 해야 한다. 이 작업이 스펙 범위 밖에서 튀어나온다. 반대로 스펙을 따르면 ADR과 어긋난다.
- 고칠 방법: 스펙의 "FGS 없음, 밀어 지우면 다음 갱신 때 다시 냄"을 정본으로 하고 ADR-046의 해당 문구를 고친다(또는 근거와 함께 반대로 정한다). 결정은 하나로 맞춘다.

### M-2. 정확한 알람이 없을 때의 `shortService` 대체 경로가 깨지기 쉽다
- 근거: 스펙 §4.5 "권한이 없으면 휴식이 3분 이하일 때 `shortService`". shortService는 약 3분 제한이 있고, 시간을 넘기면 `onTimeout`(Android 15+)이 불리며 멈추지 않으면 ANR이나 크래시가 난다. https://developer.android.com/develop/background-work/services/fgs/timeout · https://developer.android.com/develop/background-work/services/fgs/service-types
  - `startForeground`를 다시 불러도 제한 시간이 연장된다는 근거는 찾지 못했다(**확인 필요**).
  - FGS만으로는 화면이 꺼졌을 때 CPU가 잠드는 것을 막지 못한다. `PARTIAL_WAKE_LOCK`이 필요하다.
  - `SCHEDULE_EXACT_ALARM` 기본 거부: https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
  - `USE_EXACT_ALARM`은 Play 정책상 알람/캘린더 앱 전용이라 대안이 되지 못한다(**확인 필요**).
- 실패 시나리오: 2분 50초 휴식에 「+30초」를 누르면 3분 제한을 넘겨 크래시 또는 ANR이 난다. wakelock이 없으면 Handler 시각이 수십 초 밀린다.
- 고칠 방법:
  - shortService 경로는 "남은 시간 < 3분 − 여유(예: 10초)일 때만, 넘기면 즉시 `setAndAllowWhileIdle`로 전환"하도록 명시한다.
  - wakelock을 쓰고, `onTimeout`에서 바로 `stopSelf`를 부른다.
  - 실기기 체크리스트에 "권한 거부 상태에서 +30초로 3분 넘기기"를 추가한다.
  - Doze에서 `setExactAndAllowWhileIdle`의 빈도 제한이 짧은 휴식 연속에 걸리는지 실측한다(**확인 필요**).

### M-3. 알림음: 안드로이드 채널 소리는 생성 뒤 바꿀 수 없고, iOS 무음 스위치는 알림 소리를 끈다
- 근거
  - 스펙 §4.5 "채널 `rest_done` = 사용자 알림음". Android 8+ 알림 채널의 소리는 채널을 만든 뒤 앱이 바꿀 수 없다.
  - 웹 알림음은 tanh 소프트클립 합성음 4종 × 음량 3단이다(`lib/restSound.ts:25-26,132-164`). 사용자 메모리에도 "음악 위로 들려야 한다"는 핵심 요구가 있다.
  - iOS `UNNotification` 소리는 무음 스위치와 집중 모드에 막힌다. iOS 26 AlarmKit은 무음과 집중 모드를 뚫는 카운트다운 알람을 제공하며 Live Activity를 함께 요구한다. https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit · https://wwdcnotes.com/documentation/wwdc25-230-wake-up-to-the-alarmkit-api/
- 실패 시나리오: 사용자가 프로필에서 알림음을 바꿔도 안드로이드는 처음 만든 채널 소리를 계속 낸다. 아이폰이 무음 모드면 URS-031 수용 기준 "휴식 종료 알림이 울린다"가 실패한다.
- 고칠 방법
  - 안드로이드: 알림음 종류마다 채널을 따로 둔다(`rest_done_ding` 등). 또는 채널은 무음으로 두고 리시버에서 `AudioAttributes.USAGE_ALARM`으로 직접 재생한다.
  - 프리셋 4종(× 음량)을 미리 렌더링한 파일을 앱에 싣는다. iOS 알림음은 30초 이하 caf/wav여야 한다.
  - iOS: time-sensitive 권한(entitlement `com.apple.developer.usernotifications.time-sensitive`)을 명시한다. iOS 26+에서는 AlarmKit 카운트다운을 1순위로 검토한다(`NSAlarmKitUsageDescription` 필요). 이 결정은 사용자에게 물어야 한다.

### M-4. 스펙이 끄겠다는 "restSound 잠금 대응(오디오 클록 예약·keep-alive)"은 지금 웹 코드에 없다. 실제 위험은 백그라운드 중복 소리다
- 근거: `lib/restSound.ts:14`에 "app에만 있는 것(여기서 뺀 것): 잠금화면 MediaSession 카드 · keep-alive 오실레이터 · 네이티브 알람"이라고 적혀 있다. 웹 소리는 `SessionProvider.tsx:105-110`의 500ms 틱에서 `notifyRestDone()`으로 그 자리에서 재생할 뿐이다. SRS-096 수용 기준 "웹 소리 이어 붙이기는 앱에서 네이티브 알림으로 바뀐다"도 같은 잘못된 사실에 기대고 있다.
- 실패 시나리오: 안드로이드에서 앱이 백그라운드에 있어도 웹뷰 JS 타이머는 (느리게) 돈다. 웹 틱 소리와 네이티브 알람이 **두 번 울린다**. 스펙의 "앞에 있으면 네이티브는 소리 없이"는 방향이 반대인 경우를 다루지 않는다.
- 고칠 방법: 앱 안에서는 `document.visibilityState === "visible"`일 때만 웹 소리를 낸다. 네이티브 알람은 발화 시점에 앱이 앞에 있으면 소리를 끄는 대칭 규칙으로 정의한다. SRS-096 문구는 "앱에서는 휴식 종료 소리를 네이티브가 맡는다"로 고친다.

### M-5. "서버 배포 = 즉시"는 사실이 아니다. 웹 번들과 네이티브 껍데기 버전이 어긋나는 경우가 계약에 없다
- 근거: `sw/sw.template.js:14-17`에서 새 워커는 skipWaiting을 하지 않고 프로필 「업데이트」나 앱을 완전히 종료할 때만 활성화된다. 셸은 SWR로 캐시본을 먼저 준다(`:141-155`). 안드로이드는 앱 프로세스가 오래 살아 있다.
- 실패 시나리오
  - 네이티브 1.0.0(플러그인 없음)에 웹 0.58(다리 있음)이 실린다. 반대로 네이티브 1.1(새 필드)에 캐시된 웹 0.57이 실린다. 플러그인 메서드가 없으면 예외가 나서 세션 화면이 깨질 수 있다.
  - P1 다리를 배포한 직후, 이미 설치된 앱은 옛 웹을 계속 쓴다.
- 고칠 방법
  - `LiftgramNative.info()`로 `{nativeVersion, bridge: 1}`을 받는다. 웹 `native.ts`는 기능 단위로 확인하고, 모르는 기능은 아무것도 하지 않는다.
  - 스냅샷과 조작에 `v`를 둔다(이미 있음). 네이티브는 모르는 `v`를 무시한다.
  - 스펙 §3 표의 "업데이트" 칸을 "서버 배포 → 다음 앱 완전 재시작 또는 프로필 업데이트 때"로 고친다.

### M-6. 스냅샷을 누가 어떤 원천으로 만드는지 정해지지 않았다(블록 휴식 state, 입력 중 값, 표시 이름, 블록 단위)
- 근거
  - 휴식 길이는 `ExerciseBlock`의 컴포넌트 state `restSeconds`(`ExerciseBlock.tsx:165`)와 `restSecondsForSetType`(`core/domain/prescription.ts:124`)이 정한다.
  - 입력 중 값은 `SetDraftContext`에 있다(`SetRowEdit.tsx:145,342-363`, blur 때 저장).
  - 세트 표는 행 증감만 관찰하고 1.5초마다 다시 읽는다(`ExerciseBlock.tsx:354-362`).
  - 블록 표시 이름은 사용자 별칭이다(`useExerciseName`, SRS-056). 스펙은 `exerciseListName`이라고 적었다.
  - 사용자가 /history 같은 다른 화면에 있으면 세션 화면은 마운트되어 있지 않다.
- 실패 시나리오: 무게를 고치고 바로 폰을 잠그면(blur도 없고 500ms 디바운스도 지나지 않음) 카드에 옛 값이 뜬다. 휴식이 블록 설정과 다르다. 카드 종목 이름이 화면과 다르다. 다른 탭 화면에서 시작한 휴식은 스냅샷에 반영되지 않는다.
- 고칠 방법
  - 스냅샷은 `SessionProvider`(셸) 쪽에서 **저장소에서 직접** 만든다. 휴식 길이는 `we.restSeconds`를 저장값으로 쓴다(블록에서 바꾸면 즉시 저장되는지 확인하고, 아니면 저장하게 한다).
  - Capacitor `pause`와 `visibilitychange:hidden`에서 ① 입력 중 값 커밋 → ② 스냅샷을 즉시 전송한다(디바운스 우회).
  - 이름은 사용자 표시 이름 규칙을 쓴다. 단위는 단계마다 둔다(H-1).

### M-7. "값이 빈 세트 → 앱 열기" 규칙은 사실상 발동하지 않는다. 가짜 기본값(20kg×8)이 잠금화면에서 기록된다
- 근거: `weightKg`와 `reps`는 null이 아니다. `addSet`은 값이 없으면 마지막 세트를 복제하거나 `20kg × 8회`를 넣는다(`workoutRepository.ts:1640-1660`). 이 값은 `userEdited=false`(v25)다.
- 실패 시나리오: 처음 하는 종목에 세트를 추가하고 잠금 중 「세트 완료」를 누르면 20kg×8이 실제 기록이 된다. 화면에서는 사용자가 숫자를 보고 고칠 기회가 있지만 잠금화면에서는 그 기회가 없다.
- 고칠 방법: 「앱 열기」로 바꾸는 조건을 정의한다. 권장: `userEdited=false`이면서 지난 기록이나 처방에서 온 값이 아닌 세트. 맨몸이나 유산소처럼 무게 0이 정상인 지표는 따로 정의한다.

### M-8. 휴식 영속화의 세부가 빠졌다
- 근거
  - `SessionProvider.startRest(seconds)`는 상대 초만 받는다(`SessionProvider.tsx:91-117`).
  - `setPref`는 `SYNCED_PREF_KEYS`에 든 키를 서버 프로필로 동기한다(`prefs.ts:26-36,66-79`).
  - `localStorage`는 데스크톱 웹의 여러 탭이 공유한다.
- 실패 시나리오
  - 휴식 키가 동기 목록에 들어가면 다른 기기에 휴식이 뜬다.
  - 운동 ID 없이 저장하면 버린 운동의 휴식이 다음 운동에서 되살아난다.
  - drain이 이미 지난 `endsAt`을 적용할 때 웹이 소리를 또 낸다(네이티브가 이미 알림을 냈다).
- 고칠 방법
  - `startRestUntil(endsAt)` API를 추가한다.
  - 키는 **동기하지 않는** `liftgram.restEndsAt = {workoutId, endsAt}`로 한다. 종료와 버리기 때 지우고, 복원할 때 활성 운동 ID와 대조한다.
  - 지난 시각을 복원하거나 drain할 때는 소리 없이 휴식을 지운다.

### M-9. Apple 로그인을 iOS 앱에서만 보이면 Apple로만 가입한 계정은 웹과 안드로이드에서 들어올 수 없다
- 근거: 스펙 §6 "웹·안드로이드는 Apple 버튼을 iOS 앱에서만 보인다". URS-032 "앱에서 로그인하면 웹과 같은 계정". 이메일 숨김 주소를 허용하면 이메일 로그인으로 우회할 수도 없다.
- 실패 시나리오: 아이폰에서 Apple(숨김 이메일)로 가입한 사용자가 PC 웹이나 안드로이드 폰으로 옮기면 로그인할 수단이 없다.
- 고칠 방법
  - 웹(Services ID, form_post. 리프트그램 `oauth/state.go`에 SameSite=None form_post 준비가 이미 있다)에도 Apple 버튼을 둔다. 또는 Apple 전용 계정에는 프로필에서 "다른 로그인 수단 연결"을 강하게 안내한다.
  - 서버 검증은 `aud`가 웹(Services ID)과 네이티브(번들 ID `org.tarae.liftgram`) 둘 다일 수 있다. 네이티브 경로에는 nonce 검증이 필요하다. 북타래 `apple_native.go`를 참고한다.

### M-10. 계정 삭제 범위가 빠지거나 손으로 나열돼 있다(Apple 토큰 철회, 기기 로컬 데이터, cascade)
- 근거
  - Apple은 Sign in with Apple을 쓰는 앱이 계정을 삭제할 때 REST API로 토큰을 철회하라고 안내한다. https://developer.apple.com/support/offering-account-deletion-in-your-app/
  - 사용자를 참조하는 테이블은 거의 전부 `ON DELETE CASCADE`다(`database/migrations/0003…0020`). 스펙 목록에 없는 coaching_grants, progress_summaries, stories, notifications, post_bookmarks, blocks, reports, client_health, gear_clicks, messages도 이 cascade로 지워진다.
  - `conversations`는 사용자 FK가 없어 상대가 없는 대화방이 남는다.
  - 기기 쪽에는 LokiJS, localStorage, App Group/SharedPreferences 사본, 위젯, Live Activity가 남는다.
- 실패 시나리오
  - 삭제했는데도 위젯과 잠금화면에 운동 정보가 남는다.
  - 같은 기기에서 새로 가입하면 남은 로컬 기록이 새 계정으로 동기된다(**확인 필요**: 로그아웃 시 로컬 사용자 처리 규칙에 따라 다름).
  - 손으로 나열한 삭제 목록과 스키마가 어긋나면 테이블이 추가될 때마다 누락이 생긴다.
- 고칠 방법
  - 서버: `DELETE FROM users`에 맡기고, 남는 것(conversations 정리, 미디어 파일 배치 삭제, Apple `/auth/revoke`)만 별도로 처리한다. 가입할 때 Apple refresh token을 보관해야 철회할 수 있다.
  - 테스트는 "information_schema에서 users를 참조하는 모든 테이블에 그 사용자의 행이 0개"를 스키마 기반으로 단언한다.
  - 기기: 삭제가 성공하면 로컬 DB, 설정, 네이티브 사본, 위젯을 지우고 `session.end()`를 부른다.
  - 소셜 전용 사용자의 "최근 로그인 확인"은 시스템 브라우저 재인증 흐름으로 정의한다.

### M-11. 오프라인 첫 실행 수용 기준과 iOS App-Bound Domains의 부작용
- 근거
  - SRS-095와 URS-032는 "비행기 모드에서 앱을 **처음부터** 열어"라고 하는데, 스펙 방식 A는 "첫 설치 후 1회 온라인 실행 뒤부터"다. 요구 문서를 고치지 않으면 수용 기준과 어긋난 채로 출시된다.
  - App-Bound Domains는 도메인 10개 상한이 있고, 그 밖으로 이동하면 실패한다. 같은 앱의 다른 웹뷰와 사용자 스크립트에도 영향을 준다는 보고가 있다. Capacitor 브리지 주입에 영향이 있는지는 **확인 필요**. https://webkit.org/blog/10882/app-bound-domains/ · https://developer.apple.com/forums/thread/748795
  - 브라우저 PWA의 **비로그인(로컬 사용자) 기록**은 서버에 없어서 앱으로 옮겨 갈 길이 없다. "동기 최신일 때만 안내"하는 규칙은 로그인 사용자만 다룬다.
- 고칠 방법
  - SRS-095와 URS-032 수용 기준을 "설치 뒤 한 번 온라인으로 연 다음부터 비행기 모드로 처음부터 실행"으로 고친다(사용자 확인 필요).
  - 시범 ②에 `navigator.storage.persist()` 결과를 함께 확인하는 항목을 추가한다.
  - App-Bound 목록에 들어갈 도메인(liftgram.tarae.org 하나)과 앱 밖으로 나가는 링크 처리를 시범 ①에 넣는다.
  - 비로그인 PWA 사용자에게는 "앱 설치 전에 로그인 후 동기"를 안내한다.

### M-12. 검증 계획이 수용 기준을 증명하지 못한다(경합 시나리오가 없다)
- 근거: §8 e2e ①~⑧은 순차 시나리오뿐이다. 가짜 플러그인은 kill, flush 실패, 이벤트와 drain의 동시 실행을 재현하지 않는다. "볼륨이 화면과 같음"은 무엇과 비교하는지(같은 조작을 화면으로 한 대조군)가 없다.
- 고칠 방법: 아래 테스트를 추가한다.
  - (a) 슈퍼셋, 멤버 무게가 다를 때(H-1)
  - (b) lb 블록과 플레이트 한쪽 블록(H-1)
  - (c) 처방 탑셋 → 백오프(H-4)
  - (d) 이벤트와 drain 동시 실행, 낡은 스냅샷 rebase(H-2)
  - (e) 적용 뒤 flush 전 kill 주입(H-3)
  - (f) 봉인 탭에서 drain(H-3)
  - (g) 대기열 대기 중 세션 버리기/종료 → 모두 `discarded`이고 카드가 내려감
  - (h) 잠금 중 완료한 세트를 앱에서 해제하고 다시 drain
  - (i) 같은 픽스처로 화면 경로와 잠금 경로의 DB 행을 비교(`completedAt` 제외)
  - core 단위 테스트에 H-5의 순서 규칙 표를 넣는다.

### M-13. iOS Info.plist 권한 설명과 웹뷰 권한(카메라, 사진, 위치)이 빠졌다
- 근거
  - 웹은 미디어 업로드(피드, `mediaClient.ts`)와 위치(주변 헬스장, SRS-035, `next.config.ts:46` `geolocation=(self)`)를 쓴다.
  - WKWebView에서 `<input type=file>`로 카메라나 사진을 고르려면 `NSCameraUsageDescription`과 `NSPhotoLibraryUsageDescription`이 필요하다. 없으면 크래시나 심사 반려가 생긴다(**확인 필요**: Capacitor 처리 방식).
  - 웹뷰 위치는 `NSLocationWhenInUseUsageDescription`, 안드로이드는 `ACCESS_FINE_LOCATION`과 Capacitor 위치 권한 처리가 필요하다.
  - 북타래 Info.plist에는 이런 항목이 없다(기능이 달라서). 복사만 하면 빠진다.
- 고칠 방법: §2 저장소 구조에 iOS 권한 문구 목록과 Manifest 권한 목록(INTERNET, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, FOREGROUND_SERVICE(_SHORT_SERVICE), POST_PROMOTED_NOTIFICATIONS, WAKE_LOCK, 위치)을 명시한다. 실기기 체크리스트에 "사진 첨부, 주변 헬스장"을 추가한다.

---

## L — 다듬기, 확인

- **L-1.** ActivityKit Live Activity는 iOS 16.1부터다(스펙은 "16.2+"). Capacitor 8의 최소 배포 대상(iOS 15 추정, **확인 필요**)과 위젯 확장의 배포 대상을 스펙에 숫자로 적는다.
- **L-2.** 남은 시간이 0을 지난 뒤: 안드로이드 `setChronometerCountDown`은 0을 지나면 음수(-0:05)로 센다. Live Activity의 `Text(timerInterval:)`도 끝난 뒤 갱신이 필요하다. 휴식 끝 알람 리시버나 의도에서 카드를 "다음 세트" 상태로 다시 그리고, iOS에는 `staleDate`를 둔다.
- **L-3.** iOS는 알림 권한과 Live Activity 허용(`ActivityAuthorizationInfo`)이 서로 다른 설정이다. "알림 권한 거절 → 잠금화면 카드 꺼짐" 안내는 iOS에서 틀리다. 안드로이드는 `POST_NOTIFICATIONS`를 거절하면 카드도 사라진다.
- **L-4.** iOS 위젯 `reloadAllTimelines`는 앱이 백그라운드일 때(잠금 중 의도 실행) 일일 예산에 걸린다. 운동 중 위젯 갱신은 Live Activity와 같은 `endsAt` 카운트다운에 맡기고, 세트 완료 때마다 다시 그리는 것은 최소화한다.
- **L-5.** 북타래 로컬 플러그인은 **Swift만** 있다(`native/booktarae-native/ios/...`). Kotlin 플러그인, 알림, 리시버, 위젯은 전부 새로 짜야 한다. §2의 "복사"와 일정 추정을 이에 맞춘다.
- **L-6.** `capacitor.config.ts`에 북타래처럼 `server.errorPath: "offline.html"`과 `allowNavigation`을 명시한다. `appendUserAgent`의 버전 숫자는 앱 버전(§7)과 한 곳에서 만들어지게 한다.
- **L-7.** Play Console의 데이터 보안 양식, 건강·피트니스 앱 신고(Health apps declaration, **확인 필요**), 개인 계정의 테스터 12명·14일 조건을 P3 체크리스트에 넣는다.
- **L-8.** 대기열 12단계를 다 쓴 뒤의 카드 상태와, 웹 첫 로드 때 활성 세션이 없으면 `session.end()`로 고아 카드를 정리하는 규칙을 명시한다. `paused` 운동(`getActiveWorkout`가 paused를 포함함, `workoutRepository.ts:318-323`)에서는 버튼을 숨길지 정한다.
- **L-9.** Android 16 promoted ongoing(Live Updates)은 조건이 있다. 제목이 있어야 하고, 커스텀 RemoteViews와 색 칠한 배경을 쓰면 안 되며, 그룹 요약이면 안 되고, 중요도가 MIN보다 높아야 한다(정식 문서로 **확인 필요**, QPR 단계에서 조건이 바뀐 보고가 있음). https://www.androidauthority.com/android-16-qpr1-live-updates-3573399 . 실패하면 일반 진행 중 알림으로 되돌아가는 동작을 테스트한다.
- **L-10.** 위젯 딥링크 `liftgram://start`와 피드 https 앱 링크가 들어왔을 때 Capacitor가 웹뷰를 직접 이동시키는지, `appUrlOpen`으로만 넘기는지 확인해서(**확인 필요**) 처리를 한 곳(`native.ts`)에 모은다.
- **L-11.** 가장 큰 불확실성(iOS 웹뷰 서비스 워커)은 Xcode 설치 전에는 검증할 수 없는데, P1 웹 다리가 그 결과와 무관하게 먼저 진행된다. iOS가 B안으로 갈 경우 영향 범위(다리 코드는 공통, 셸만 다름)를 위험 표에 한 줄 적는다.

---

## 요약

스펙의 큰 틀은 타당하다. Capacitor 원격 화면 + 네이티브 카드·위젯, 정본은 웹 로컬 기록, 휴식은 끝나는 시각 기준. 다만 잠금화면 대기열에는 기록을 조용히 틀리게 하는 결함 네 가지가 있다.
- 조작 하나가 값 한 쌍을 여러 세트에 덮어쓰고 표시 단위로 왕복한다(H-1).
- 스냅샷과 대기열 사이에 세대·순서 규칙이 없어 카드가 되돌아가고 세트가 유실되거나 휴식이 되살아난다(H-2).
- "저장 완료 뒤 ack"가 LokiJS 비동기 내려쓰기와 봉인 탭을 무시하고, 중복 방지 로그가 오히려 영구 유실을 만든다(H-3).
- 웹의 세트 완료는 처방 무게 채우기·휴식 규칙·완료 시각까지 포함한 흐름인데 스펙은 저장 한 번으로 취급한다(H-4).

또 스펙이 재사용한다는 "기존 순서 함수"는 코드에 없어 새 규칙을 명시해야 한다(H-5). 로그인 복귀는 북타래에서 검증된 커스텀 스킴 + ASWebAuthenticationSession + 코드 결속 방식으로 되돌려야 한다(H-6). 그 밖에 ADR과 스펙의 FGS 불일치, 정확한 알람 대체 경로, 알림음 채널과 무음 모드(AlarmKit 검토), 존재하지 않는 웹 소리 잠금 대응, 배포 즉시 반영 가정, Apple 전용 계정 고립, 계정 삭제 범위, 오프라인 첫 실행 수용 기준과 SRS의 어긋남, 경합을 다루지 않는 검증 계획을 M으로 지적했다. H 6건을 스펙에 반영하고 M-11의 수용 기준 문구를 사용자에게 확인받으면 P0를 바로 시작할 수 있다. P1은 H-1~H-5를 반영한 개정 스펙에 다시 `qa spec`을 거친 뒤 시작하기를 권한다.
