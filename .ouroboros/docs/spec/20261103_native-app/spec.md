# 스펙 — 전용 앱(안드로이드·iOS): 껍데기 · 잠금화면 운동 카드 · 홈 위젯

- 등급: **Project**(네이티브 iOS·Android + 웹 화면 + Go 서버 · 새 저장소 디렉터리 `src/mobile/`)
- 근거: BS-006 · URS-031·032 · SRS-095(껍데기)·096(잠금화면)·097(위젯)·098(광고 — **이 스펙 범위 밖**, 출시 뒤 별 스펙) · ADR-046 · ADR-032(오프라인 우선)
- 확정(사용자 2026-11-03): 방식 무관 → Capacitor · 계정 = 북타래와 같은 동업자 계정 · 아이폰 실기기 없음(시뮬레이터 + 심사 전 TestFlight 1회) · 동시 개발·안드로이드 먼저 출시 · 앱 ID `org.tarae.liftgram` · 잠금화면/위젯 내용 = 권장안
- 재사용: 북타래 `feat/ios-app`(`src/mobile/` Capacitor 8.5 · 서명 키 저장소 밖 · 앱 로그인 교환 · Apple 로그인 · 로컬 플러그인 `native/booktarae-native`) — **복사해 오되 북타래 저장소는 건드리지 않는다**

## 1. 범위

| 단계 | 내용 | 끝나는 조건 |
|---|---|---|
| **P0 껍데기·시범** | `src/mobile/` Capacitor 프로젝트 · 화면 싣는 방식 시범(§3) · 앱 표식(UA) · 앱 로그인(시스템 브라우저 → 앱 복귀 → 일회용 코드 교환) · Apple 로그인(서버+화면) · 앱 링크 · **계정 삭제(서버+화면 · 지금 없음)** · 오프라인 첫 실행 | 안드로이드 실기기에서 로그인·비행기 모드 첫 실행 기록·동기 · iOS 시뮬레이터 같은 항목 |
| **P1 잠금화면** | 네이티브 플러그인 `liftgram-native` · 상태 사본/조작 대기열(§4) · iOS Live Activity(잠금화면·다이내믹 아일랜드·버튼 3) · 안드로이드 진행 중 알림(버튼 3) · 휴식 끝 네이티브 알림 | SRS-096 수용 기준 |
| **P2 위젯** | iOS WidgetKit 작은·중간 · 안드로이드 앱 위젯 작은·중간 · 요약 쓰기(§5) | SRS-097 수용 기준 |
| **P3 출시 준비** | 안드로이드 출시 서명·AAB · 스토어 등록 자료 · 개인정보 라벨/데이터 보안 · 비공개 테스트 트랙 업로드 · iOS 아카이브(Xcode 설치 뒤) | 플레이 비공개 테스트 업로드 · iOS 빌드 성공 |

범위 밖: 광고(SRS-098) · 서포터 결제 · 푸시 알림(서버 발송) · 원스토어.

## 2. 저장소 구조

```
src/mobile/                       ← 새로(북타래 구조 복사 · 이름만 바꿈)
  capacitor.config.ts             appId org.tarae.liftgram · appName 리프트그램 · appendUserAgent "LiftgramApp/1.0" (iOS 는 "(ios)" 덧붙임)
  package.json                    @capacitor/{core,android,ios,app,browser,network,status-bar,splash-screen,local-notifications} 8.5.x
  www/offline.html                원격 화면을 못 열 때(§3 방식 A 의 마지막 안전망)
  native/liftgram-native/         로컬 플러그인(TS 정의 + Swift + Kotlin)
  android/                        cap add android · app/src/main/java/org/tarae/liftgram/
     .../LiftgramNativePlugin.kt  · WorkoutNotification.kt · ActionReceiver.kt · RestAlarm.kt · widget/
  ios/App/                        cap add ios · App(Capacitor) + LiftgramWidgets(위젯 확장 = Live Activity + 위젯)
     App Group group.org.tarae.liftgram 공유
src/frontend/lib/native.ts        웹 ↔ 플러그인 다리(앱 아니면 전부 no-op)
src/frontend/lib/platform.ts      앱 표식 판별(isApp · isIOSApp)
src/core/src/domain/lockScreen.ts 순수 함수(§4.3) + 테스트
```

빌드 도구: JDK 21(`/opt/homebrew/opt/openjdk@21` — 기본 24 는 Gradle/AGP 비호환이라 `JAVA_HOME` 지정) · Android SDK 36(있음) · **Xcode 26 미설치 → 사용자 설치 전까지 iOS 는 코드만 쓰고 빌드 검증은 보류**(P0~P2 의 iOS 항목은 설치 즉시 몰아서 확인).

## 3. 화면을 앱에 싣는 방식 (P0 시범으로 정함 · ADR-046)

| 안 | 내용 | 오프라인 첫 실행 | 업데이트 |
|---|---|---|---|
| **A 원격 + 서비스 워커(1순위)** | `server.url=https://liftgram.tarae.org` · 웹앱의 기존 서비스 워커(앱 셸·정적 캐시)가 웹뷰 안에서 동작 · iOS 는 App-Bound Domains(`WKAppBoundDomains`=liftgram.tarae.org · `limitsNavigationsToAppBoundDomains`)를 켜야 웹뷰 서비스 워커가 돈다 | 첫 설치 후 1회 온라인 실행 뒤부터 가능 · 그 전 오프라인이면 `offline.html`(「처음 한 번은 인터넷이 필요합니다」) | 서버 배포 = 즉시 |
| B 번들 셸 | 셸 HTML/JS 를 앱에 싣고 API 만 원격 | 설치 직후부터 | 네이티브 재배포 필요 · Next standalone/서버 렌더 페이지(47개 중 서버 컴포넌트)가 걸림 |

- 시범 판정(실측): ① 안드로이드 실기기 + iOS 시뮬레이터에서 「설치 → 온라인 1회 실행 → 앱 종료 → 비행기 모드 → 실행 → 빠른 운동 → 세트 저장 → 재실행해 남아 있음」 ② 로컬 DB(IndexedDB/LokiJS)가 앱 재시작·OS 저장공간 정리 뒤에도 남는가 ③ 소셜 로그인 쿠키(refresh httpOnly · SameSite=Strict)가 웹뷰에서 유지되는가.
- A 가 ①~③ 통과하면 A. iOS 만 실패하면 iOS 는 B 로 따로 간다(이 경우 별 스펙으로 쪼갠다 — 사용자에게 보고).
- **앱 첫 실행 안내**: 브라우저 PWA 와 앱 웹뷰는 저장소가 따로다. 앱은 서버에서 받아 시작하므로 PWA 에 **미동기 기록이 있으면 앱에 없다**(메모리: 오프라인 데이터 손실 교훈). 웹 화면에서 앱 설치를 안내할 때 「동기 상태: 최신」일 때만 안내하고, 아니면 「먼저 동기를 마치세요」를 보인다. 앱 첫 로그인 직후 서버 기록 수를 보여 준다.

## 4. 잠금화면 — 상태 사본과 조작 대기열 (SRS-096 · ADR-046)

### 4.1 원칙
- 세션의 정본 = 웹 화면의 로컬 기록(Watermelon · core 도메인). 네이티브는 **표시 사본**과 **조작 대기열**만 가진다. 볼륨·PR·1RM 계산을 네이티브에서 다시 하지 않는다.
- 잠금 중 웹뷰 JS 는 멈춰 있다고 가정한다(iOS 는 확실히 멈춤 · 안드로이드도 타이머 스로틀). 그래서 버튼을 누르면 **네이티브가 사본으로 다음 상태를 스스로 그리고**, 조작을 쌓아 둔다.

### 4.2 웹 → 네이티브: `LiftgramNative.session.update(snapshot)`
```ts
type LockSnapshot = {
  v: 1;
  sessionId: string;
  title: string;                 // 루틴 이름 또는 「빠른 운동」
  unit: "kg" | "lb";
  queue: LockStep[];             // 남은 세트를 수행 순서대로(최대 12개) — 슈퍼셋은 교대 순서 그대로
  rest: { endsAt: number | null; totalSec: number | null };  // 진행 중 휴식(끝나는 시각 ms)
  sound: { enabled: boolean; name: string };                 // 프로필 알림음
  updatedAt: number;
};
type LockStep = {
  setId: string; blockId: string;
  exerciseName: string;          // 표시 이름(exerciseListName)
  setNo: number; setTotal: number;
  weight: number | null;         // 표시 단위로 이미 환산 · 맨몸/유산소는 null
  reps: number | null;
  metric: "weight_reps" | "reps" | "time" | "cardio";
  restAfterSec: number;          // 이 세트 완료 뒤 휴식(블록 휴식 설정 · 슈퍼셋 중간은 0)
  groupWithNext: boolean;        // 슈퍼셋 — 한 번 「세트 완료」가 묶음 전체(웹의 한 번 누르기와 같게)
};
```
- 보내는 때: 세션 시작 · 세트 완료/해제 · 값 수정(디바운스 500ms) · 종목 추가/삭제/교체/순서 · 휴식 시작/변경/끝 · 앱 복귀 직후 대기열 적용 뒤. 끝나면 `session.end()`.
- `queue[0]` 이 「지금 세트」, `queue[1]`(묶음이면 묶음 다음)의 종목이 「다음 종목」.

### 4.3 core 순수 함수 `domain/lockScreen.ts`
- `buildLockSnapshot(session, blocks, sets, prefs, now) → LockSnapshot` — 웹 세션 화면의 순서 규칙(블록 순서 · 슈퍼셋 교대 · 완료 안 된 세트 · 워밍업 포함)과 같은 결과를 내야 한다. **웹 화면이 쓰는 기존 순서 함수를 그대로 부른다**(새 규칙 금지).
- `applyLockActions(state, actions) → { ops, discarded }` — 대기열을 도메인 연산(세트 완료 값 · 휴식 끝 시각)으로 바꾼다. 화면은 받은 ops 를 기존 저장 경로(onToggleDone 과 같은 저장소 함수)로 실행한다.
- 단위 테스트: 순서(일반·슈퍼셋·워밍업·유산소) · 프리필 값 · 빈 값 세트 · 대기열 멱등 · 낡은 조작 버림.

### 4.4 네이티브 → 웹: 조작 대기열
```ts
type LockAction =
  | { id: string; kind: "complete"; sessionId: string; setIds: string[]; weight: number | null; reps: number | null; at: number }
  | { id: string; kind: "rest_set"; sessionId: string; endsAt: number | null; at: number }; // +30초·끝내기 = **절대 시각**으로
```
- 「세트 완료」: `queue[0]`(묶음이면 묶음 전체)의 setIds · 사본에 있던 값 그대로 → 사본에서 그 단계를 빼고, `restAfterSec>0` 이면 휴식 시작(endsAt=now+restAfterSec) · 카드 갱신 · 알림 예약.
- 「+30초」: endsAt=max(endsAt, now)+30s · 「휴식 끝내기」: endsAt=null(알림 취소).
- **멱등**: 조작은 절대값(세트 id + 값, 휴식 끝 시각)이라 두 번 적용돼도 결과가 같다. 그래도 적용한 id 를 로컬 저장소(prefs · 최근 200개)에 남겨 중복 적용 로그를 없앤다. 웹은 `queue.drain()` → 적용 → 저장 완료 뒤 `queue.ack(ids)`. 적용 중 앱이 죽으면 다음 실행에 다시 drain(멱등이라 안전).
- **낡은 조작 버림**: sessionId 가 지금 세션과 다름 · setId 가 없음/이미 완료(완료는 no-op) · 세션이 이미 끝남 → 버리고 `discarded` 에 남긴다(토스트 없이 진단 로그).
- **값이 빈 세트**: 사본 `weight`/`reps` 가 필요한데 null 이면 버튼을 「앱 열기」로 바꾼다(빈 기록 금지).
- 적용 시점: 앱 `resume` 이벤트 · 화면 첫 로드 · 앱이 앞에 있을 때 네이티브가 보낸 `action` 이벤트(즉시).
- 휴식 정본 이동: 지금 `SessionProvider` 의 휴식은 메모리(`endAtRef`)뿐이라 웹뷰가 재시작되면 사라진다. **휴식 끝 시각을 prefs(로컬)에 저장**하고 시작 시 복원한다(웹에도 이득 · 웹 동작은 같게).

### 4.5 플랫폼별
- **iOS(17+ 버튼 · 16.2+ 표시만)**: ActivityKit `Activity<WorkoutAttributes>` · ContentState = 지금 단계·다음 종목·휴식 endsAt · 카운트다운 `Text(timerInterval:)` · 버튼 = `LiveActivityIntent`(App 프로세스에서 실행 → App Group 의 사본/대기열을 고치고 `activity.update`) · 다이내믹 아일랜드 compact(종목 약칭·남은 휴식)/expanded(카드 그대로) · 8시간 상한 → 운동 시작 7.5h 뒤 「계속 운동 중이면 앱을 여세요」로 바꾼다 · 휴식 끝 알림 = `UNTimeIntervalNotificationTrigger`(time-sensitive · 알림음 파일 앱에 포함).
- **안드로이드**: 운동 중 **진행 중 알림**(채널 `workout` · 소리 없음 · `setOngoing` · 잠금화면 공개 `VISIBILITY_PUBLIC`) · 카운트다운 `setUsesChronometer(true)`+`setChronometerCountDown(true)`+`setWhen(endsAt)` · 버튼 = `PendingIntent` → `ActionReceiver`(앱 프로세스가 죽어 있어도 깨움) → SharedPreferences 사본/대기열 갱신 → 알림 다시 그림 · Android 16 은 `setRequestPromotedOngoing(true)`(진행 중 알림 형식 · 권한 `POST_PROMOTED_NOTIFICATIONS` · 실패하면 일반 알림) · 사용자가 밀어 지우면 다음 갱신 때 다시 낸다.
- **안드로이드 휴식 끝 알림(±2초)**: `AlarmManager.setExactAndAllowWhileIdle` — Android 14+ 는 `SCHEDULE_EXACT_ALARM` 이 기본 거부라 **첫 운동 시작 때 한 번 설명하고 설정 화면으로 보낸다**(거절해도 운동은 된다). 권한 없으면 휴식이 3분 이하일 때 `shortService` 포그라운드 서비스로 시각을 지키고, 그보다 길면 `setAndAllowWhileIdle`(늦을 수 있음 — 설정에 「정확한 알림 꺼짐」 표시). 알림 채널 `rest_done` = 사용자 알림음 · 진동.
- **알림 권한**: 안드로이드 13+ `POST_NOTIFICATIONS` · iOS 알림 권한 — 첫 운동 시작 때 묻는다(로그인 직후 아님). 거절 시 잠금화면 카드 대신 프로필에 「잠금화면 표시 꺼짐 — 켜기」.
- **웹 소리**: 앱에서는 `lib/restSound` 의 잠금 대응(오디오 클록 예약·keep-alive)을 끄고 네이티브 알림에 맡긴다. 앱이 앞에 있을 때는 지금처럼 웹 소리 그대로(중복 방지: 앞에 있으면 네이티브 알림은 소리 없이 표시만).

## 5. 홈 위젯 (SRS-097)
- 웹 → `LiftgramNative.widget.update(summary)` : `{ v:1, signedIn, active: LockSnapshot 의 지금 단계·휴식 | null, week: { done, goal }, nextRoutine: { id, name } | null, updatedAt }` → iOS App Group UserDefaults · 안드로이드 SharedPreferences → 위젯 갱신 요청(`WidgetCenter.reloadAllTimelines` · `AppWidgetManager.updateAppWidget`).
- 쓰는 때: 운동 시작/끝 · 세트 완료 · 휴식 변경 · 주간 집계가 바뀌는 운동 저장 · 로그인/로그아웃 · 앱 복귀.
- 버튼 「운동 시작」 → 딥링크 `liftgram://start?routine=<id>`(없으면 빠른 운동) → 웹 화면이 기존 시작 경로(useStartGuard 포함 — 진행 중 세션이 있으면 그 세션으로)로 처리.
- 운동 중 위젯 휴식은 endsAt 기준 카운트다운(iOS `Text(timerInterval:)` · 안드로이드 `Chronometer`).
- 로그아웃 → `signedIn:false` · 개인 정보 없이 「로그인」.

## 6. 로그인 · 계정 (SRS-095)
- **앱 로그인 교환**: 앱에서 소셜 버튼 → `@capacitor/browser`(시스템 브라우저 창)로 `/api/auth/oauth/<p>/start?app=1` → 서버가 끝나면 `https://liftgram.tarae.org/auth/app-return?code=<일회용>` 로 보냄 → 앱 링크로 앱 복귀 → 웹뷰가 기존 `ExchangeLoginCode` 로 토큰 저장(지금 `/auth/complete` 경로와 같은 교환 · 새 RPC 없음). 이메일 로그인은 웹뷰 안 그대로.
- **Apple 로그인**: 서버 provider `apple` 추가(기존 oauth provider 인터페이스 · client_secret JWT 는 p8 키로 서명 · 키는 `.env` 만) · 이메일 숨김 주소 허용 · 같은 주소 자동 합병 금지 규칙 그대로. iOS 앱에서는 네이티브 `ASAuthorizationController` → identity token 을 서버 `/api/auth/oauth/apple/native` 로 검증 → 일회용 코드 → 같은 교환. 웹·안드로이드는 Apple 버튼을 iOS 앱에서만 보인다(4.8 은 iOS 요구 · 웹에도 켤지는 나중).
- **계정 삭제(지금 없음)**: 프로필 → 계정 → 「계정 삭제」(비밀번호 또는 최근 로그인 확인 · 「삭제」 입력) → 서버 `DeleteAccount` RPC: 사용자·인증·토큰·sync_records·게시물·댓글·좋아요·팔로우·DM 참가·미디어 행 삭제(미디어 파일은 배치로 지움) · 30일 유예 없음(즉시) · 운영 백업은 보존 기간대로 만료됨을 처리방침에 적음. 웹 요청 주소 `/account/delete`(로그인 화면 거쳐 같은 흐름 · 구글 플레이 요구).
- 앱 링크: `/.well-known/assetlinks.json`(SHA-256 지문은 `.env` `ANDROID_CERT_SHA256` · 비면 404) · `/.well-known/apple-app-site-association`(`IOS_APP_ID` · 비면 404) — 북타래 방식 그대로.
- 제공자 콘솔(사용자/동업자 몫): 구글 OAuth 리디렉트에 변화 없음(시스템 브라우저라 기존 웹 리디렉트 사용) · 카카오·네이버도 웹 리디렉트 그대로. Apple: Services ID · 키(p8) · 앱 ID 에 Sign in with Apple.

## 7. 버전
- 웹: 이 작업의 웹 변경 = **v0.57.0**(P0 화면·서버) · P1 다리 = 0.58.0 · P2 = 0.59.0 (배포마다 SemVer+태그 규칙 그대로).
- 앱: `src/mobile` 버전 **1.0.0** · versionCode = 정수 증가 · 앱 버전은 웹의 프로필 하단에 「앱 1.0.0 · 웹 0.57.0」로. 네이티브 최소 버전 `MIN_APP_VERSION`(비면 꺼짐) — 낡으면 스토어 업데이트 안내.

## 8. 검증
- **단위(core)**: `lockScreen.test.ts` — §4.3 항목 + 웹 세션 순서와 일치(같은 픽스처로 화면 순서 함수와 비교).
- **웹 e2e(Playwright · 로컬 운영 빌드 3200/3201)**: `window.Capacitor` 가짜 플러그인을 주입해 ① 세션 시작·세트 완료 때 `session.update` 가 올바른 snapshot 으로 불림 ② 가짜 대기열(세트 완료 3 · +30초 · 끝내기)을 drain 하면 세트 3개 완료·휴식 끝 시각·볼륨이 화면과 같음 ③ 같은 대기열 두 번 → 한 번만 ④ 낡은 sessionId 버림 ⑤ 위젯 summary ⑥ 앱 아니면 플러그인 호출 0 ⑦ 계정 삭제(서버 행 0 확인) ⑧ 휴식 끝 시각 새로고침 뒤 복원.
- **Go**: Apple provider(가짜 키로 토큰 검증) · DeleteAccount(행 삭제 범위 · 다른 사용자 무영향) · 앱 return 코드.
- **안드로이드 실기기(adb)**: 체크리스트 — 설치 · 로그인 3종 · 비행기 모드 첫 실행 · 잠금 중 버튼 3종 × 10회 · 앱 강제 종료 후 반영 · 휴식 알림 시각(로그 타임스탬프로 ±2초) · 위젯 2종 · 다크 모드 · 화면 녹화/스크린샷 저장 `docs/qa/` 증거.
- **iOS 시뮬레이터(Xcode 설치 후)**: 같은 체크리스트(잠금은 시뮬레이터 Lock · 다이내믹 아일랜드는 iPhone 17 Pro 시뮬레이터).
- 회귀: `make verify` · 세션·휴식 관련 기존 e2e 전부(웹 동작 무변화).

## 9. 위험
| 위험 | 대응 |
|---|---|
| iOS 웹뷰 서비스 워커(App-Bound) 미동작 → 오프라인 첫 실행 실패 | P0 시범에서 먼저 확인 · 실패 시 iOS 만 번들 셸(B) 별 스펙 |
| 잠금 중 조작과 앱 화면 편집이 엇갈림(잠금 중 완료한 세트를 앱에서 이미 고침) | 조작은 절대값 + 이미 완료면 no-op · 앱이 앞에 있을 땐 즉시 이벤트 · 테스트 ③④ |
| 안드로이드 정확한 알람 권한 거절 | shortService(3분 이하) · 그 밖은 늦을 수 있음 표시 |
| Live Activity 8시간 상한 · 시스템이 갱신 예산을 줄임 | 로컬 업데이트만(푸시 갱신 없음) · 7.5h 안내 |
| 아이폰 실기기 없음 | 시뮬레이터 + 심사 전 TestFlight 1회(동업자/지인 폰) · 사용자 보고 |
| Play 개인 계정이면 테스터 12명·14일 | P3 에서 계정 유형 확인 후 일정 보고(사용자 확인 대기 중) |
| 웹 refresh 쿠키(SameSite=Strict)가 앱 링크 복귀에서 빠짐 | 교환은 앱 웹뷰 안 요청이라 같은 사이트 · P0 시범 ③ 에서 확인 |
| 웹 브라우저 PWA 의 미동기 기록 | §3 안내(동기 최신일 때만 앱 안내) |

## 10. 사용자/동업자 준비물 (막히면 그 항목만 보류하고 나머지 진행)
1. Xcode 26 설치(App Store · Apple ID)
2. Google Play Console · App Store Connect 에 작업자 추가 · Play 계정 유형(개인/조직)
3. Apple: Sign in with Apple 키(p8) · Services ID · 팀 ID
4. 업로드 서명 키 — 새로 만들어 `~/.liftgram-release/` (북타래와 같은 방식 · 저장소 밖)
5. 카카오·네이버 개발자 콘솔에 앱 플랫폼(패키지명·키 해시) 등록(네이티브 SDK 를 쓸 때만 · 이 스펙은 시스템 브라우저라 불필요)

## 11. 작업 순서 (execute)
P0-1 `src/mobile` 골격(북타래에서 복사·이름 변경) → P0-2 안드로이드 빌드·실기기 설치 → P0-3 시범 ①~③ → P0-4 앱 로그인 교환·앱 링크 → P0-5 계정 삭제(서버+화면+e2e) → P0-6 Apple 로그인(서버·iOS 코드) → **v0.57.0 배포** → P1-1 core `lockScreen.ts`+테스트 → P1-2 `lib/native.ts`·SessionProvider 휴식 저장·대기열 적용+e2e → P1-3 안드로이드 알림·리시버·알람 → P1-4 iOS Live Activity(코드) → **v0.58.0** → P2 위젯(웹 summary · 안드로이드 · iOS 코드) → **v0.59.0** → P3 출시 준비 · 각 배포 전 독립 qa code.

---

## 12. rev2 — qa spec 반영 (`docs/qa/20261103_native-app-spec_qa.md` · 조건부 H6·M13·L11) · **앞 절과 어긋나면 이 절이 이긴다**

### 12.1 P0 (껍데기) 쪽
- **H-6 로그인 복귀 = 북타래 방식 그대로**: iOS `ASWebAuthenticationSession(callbackURLScheme:"liftgram")`(로컬 플러그인 `authSession`) · 안드로이드 Custom Tabs(`@capacitor/browser`) + `liftgram://auth` intent-filter. 서버 `start?app=1&ac=S256(v)` → 콜백은 **쿠키 없이 성공·오류 모두** `liftgram://auth?code=…|err=…` 로 302 → 웹뷰가 `v` 와 함께 `ExchangeLoginCode`(요청 필드 `verifier` 하나 추가 · 앱 코드에 결속된 `ac` 와 대조). https 앱 링크는 피드 공유 링크 용도만. 북타래 `src/backend/internal/oauth/handoff.go` 를 참고해 리프트그램 oauth 에 옮긴다(복사 원본 수정 금지).
- **M-9 Apple 로그인은 웹·안드로이드에도 둔다**(Services ID · form_post — `oauth/state.go` 의 SameSite=None 자리). iOS 앱은 네이티브 `ASAuthorization` → 서버 `apple/native`(aud = 번들 ID · nonce 검증). 웹 aud = Services ID. 가입 때 Apple refresh token 을 보관(철회용 · 암호화 컬럼).
- **M-10 계정 삭제**: 서버는 `DELETE FROM users`(cascade)에 맡기고 남는 것만 따로 — 빈 대화방 정리 · 미디어 파일 배치 삭제 · Apple `/auth/revoke`. 재인증: 비밀번호 사용자는 비밀번호, 소셜 전용은 같은 제공자 재로그인(일회용 코드 5분 안). 기기: 성공 시 로컬 DB·설정·네이티브 사본·위젯 지우고 `session.end()`. 테스트는 `information_schema` 로 users 를 참조하는 모든 테이블에 그 사용자 행 0 을 단언(스키마 기반).
- **M-11 수용 기준 문구**: 「설치 뒤 한 번 온라인으로 연 다음부터, 비행기 모드로 처음부터 실행해 기록」으로 SRS-095·URS-032 를 고친다(방식 A 의 사실 · 사용자에게 보고). 비로그인 PWA 사용자에게는 「앱 설치 전에 로그인 후 동기」 안내. 시범 ②에 `navigator.storage.persist()` 결과 추가 · 시범 ①에 App-Bound 밖 링크 처리 추가.
- **M-13 권한 목록**: iOS Info.plist `NSCameraUsageDescription` · `NSPhotoLibraryUsageDescription` · `NSLocationWhenInUseUsageDescription` · `NSSupportsLiveActivities` · (P1) time-sensitive entitlement · `NSAlarmKitUsageDescription`. 안드로이드 Manifest `INTERNET` · `ACCESS_COARSE/FINE_LOCATION`(웹뷰 위치 — Capacitor 가 웹뷰 geolocation 요청을 권한으로 이어 줌, P0 시범 확인) · (P1) `POST_NOTIFICATIONS` · `SCHEDULE_EXACT_ALARM` · `FOREGROUND_SERVICE` · `FOREGROUND_SERVICE_SHORT_SERVICE` · `WAKE_LOCK` · `POST_PROMOTED_NOTIFICATIONS`. 실기기 체크리스트에 사진 첨부·주변 헬스장.
- **M-5 버전 어긋남**: 플러그인 `info() → {nativeVersion, bridge}` · `lib/native.ts` 는 기능 단위로 확인하고 모르면 아무것도 안 한다(예외 금지). §3 「서버 배포 = 즉시」 → 「다음 완전 재시작 또는 프로필 업데이트 때」.
- **L-6** UA 의 버전은 `src/mobile/package.json` 하나에서 만든다(capacitor.config.ts 가 읽음). **L-5** Kotlin 쪽은 전부 새로 짠다(북타래는 Swift 만).

### 12.2 P1 (잠금화면) 쪽 — **구현 전에 이 절만 다시 qa spec**
- **H-5 「지금 세트」 순서 규칙(새로 정의)**: ① 블록 `sort_order` 순 ② 블록 안 첫 미완료 세트(워밍업 포함) ③ 슈퍼셋은 `roundKeyOf` 가 같은 세트를 한 단계로 묶고(`LockStep.setIds[]`), 짝 없는 세트(워밍업·드롭·실패)는 그 종목만 한 단계 ④ 앞 세트를 비워 두고 뒤를 완료한 경우에도 블록의 첫 미완료로 간다 ⑤ 슈퍼셋 묶음 안 블록 순서는 화면의 묶음 순서. 구현은 `pickRoundSets`/`roundKeyOf` 재사용 · 테스트는 규칙 표로 고정. (사용자 권장안 승인 범위 — 보고)
- **H-1 조작에 값을 싣지 않는다**: `{id, seq, kind:"complete", sessionId, setIds, at}` · 적용은 저장된 값 그대로 완료. `LockStep` 은 `unit` 을 단계마다 갖고, 표시값은 저장 kg → 블록 단위(`blockUnit`)·플레이트 한쪽 배수 규칙으로 만든다(표시 전용).
- **H-2 세대·순서**: 조작에 단조 `seq`(네이티브 발급) · 스냅샷에 `appliedThroughSeq` · 네이티브는 스냅샷을 받으면 `seq > appliedThroughSeq` 인 남은 조작을 그 위에 다시 적용(rebase)해 그린다. 웹 적용기는 **한 줄(mutex)** — 이벤트·resume·첫 로드는 같은 `drain()` 을 깨우기만 하고 seq 순서로 처리. **휴식 정본은 잠금 중 네이티브의 현재 `rest.endsAt` 하나** — 웹은 휴식 조작을 하나씩 재생하지 않고, drain 끝에 네이티브 현재값을 받아들인다(`rest_set` 조작 종류 삭제 → `queue.drain()` 이 `{actions, rest}` 를 준다).
- **H-3 ack 조건**: 적용 뒤 `flushLocalDbResult() === "saved"` **그리고** 쓰기 주인 탭일 때만 `ack(ids)`. 아니면 ack 하지 않고 다음 drain 에서 재시도. 멱등은 **DB 상태로만**(이미 완료면 no-op) — prefs 적용 로그 없음. e2e 결함 주입(`lib/e2eFlags`)으로 「적용 직후 flush 전 kill」·「봉인 탭 drain」 고정.
- **H-4 완료 흐름을 core 하나로**: `onToggleDone`(ExerciseBlock)·`roundToggle`(ActiveWorkout)의 저장소 쪽(① setSetDone/completeSupersetRound ② 세트 유형별 휴식 `restSecondsForSetType` ③ `planPrescribedLoadFills` 적용)을 core `completeSetsFlow(repo, {setIds, at, grouped})` 로 뽑아 화면과 잠금 경로가 함께 부른다(축하·제안은 화면 전용). 저장소 함수에 `completedAt = at` 을 넘길 수 있게. 스냅샷은 순수 `planPrescribedLoadFills` 로 **탑셋 뒤 단계의 채워질 무게를 미리 계산해** 표시값으로 싣는다(실제 저장은 drain 때 같은 흐름이 순서대로 한다 — 탑셋 완료 → 채우기 → 다음 완료는 채운 값).
- **M-6 스냅샷은 셸(SessionProvider)에서 저장소로 직접** 만든다(세션 화면이 안 떠 있어도). 휴식 길이 = `we.restSeconds` 저장값(블록에서 바꾸면 즉시 저장되는지 확인하고 아니면 저장). Capacitor `pause`·`visibilitychange:hidden` 에서 ① 입력 중 값 커밋(SetDraftContext) ② 스냅샷 즉시 전송. 이름 = 사용자 표시 이름(`useExerciseName` 규칙).
- **M-7 「앱 열기」 조건**: `userEdited=false` 이고 값의 출처가 지난 기록·처방·사용자 입력이 아닌 세트(=`addSet` 기본값 20kg×8 · 직전 세트 복제 아님) → 버튼 대신 「앱 열기」. 맨몸·유산소 등 무게 0 이 정상인 지표는 횟수/시간만 본다. (값 출처 표시가 저장소에 없으면 `set_logs` 에 출처 플래그를 더하는 것까지 P1 범위.)
- **M-8 휴식 영속화**: `startRestUntil(endsAt)` 추가 · 키 `liftgram.restEndsAt = {workoutId, endsAt}` (**동기 안 함**) · 종료·버리기 때 삭제 · 복원 시 활성 운동 id 대조 · 지난 시각 복원/drain 은 소리 없이 지움.
- **M-1 안드로이드 카드 = 포그라운드 서비스 없이 진행 중 알림**(밀어 지우면 다음 갱신에 다시) — ADR-046 문구를 이렇게 고친다.
- **M-2 정확한 알람 대체**: 권한 있음 → `setExactAndAllowWhileIdle`. 없음 → 남은 시간 < 2분 50초일 때만 `shortService` + `PARTIAL_WAKE_LOCK`(+30초로 넘기면 즉시 서비스 멈추고 `setAndAllowWhileIdle` 로 전환 · `onTimeout` 에서 즉시 `stopSelf`) · 그 밖은 `setAndAllowWhileIdle` + 프로필 「정확한 알림 꺼짐」. 실기기 「권한 거부 + 3분 넘기기」 · Doze 연속 짧은 휴식 빈도 제한 실측.
- **M-3 알림음**: 안드로이드 채널은 무음으로 두고 리시버가 `USAGE_ALARM` 으로 앱에 실린 프리셋 파일을 직접 재생(채널 소리 못 바꾸는 문제 회피) · 프리셋 4종×음량 3 을 `restSound` 합성과 같은 소리로 미리 렌더한 wav(≤30초)를 앱에 싣는다. iOS: **iOS 26+ 는 AlarmKit 카운트다운**(무음 스위치·집중 모드를 뚫음 · Live Activity 와 짝), 그 아래는 time-sensitive 로컬 알림. (헬스장에서 무음으로 두는 경우가 흔해 AlarmKit 을 기본으로 정함 — 사용자 보고)
- **M-4 웹 소리 중복**: 앱 안에서는 `document.visibilityState === "visible"` 일 때만 웹 소리 · 네이티브는 발화 시 앱이 앞이면 소리 없이. SRS-096 문구 「앱에서는 휴식 끝 소리를 네이티브가 맡는다」로 고친다(「웹 소리 이어 붙이기」는 사실이 아니었음).
- **L-1** Live Activity 16.1+ · 버튼 17+ · AlarmKit 26+ · 앱 최소 iOS 15(Capacitor 8) · 위젯 확장 최소 iOS 17. **L-2** 0 지난 뒤: 알람 리시버/의도가 카드를 「다음 세트」로 다시 그림 · iOS `staleDate=endsAt`. **L-3** iOS 는 알림 권한과 Live Activity 허용이 따로 — 안내 문구 분리. **L-4** 운동 중 위젯은 endsAt 카운트다운에 맡기고 세트 완료마다 다시 그리지 않음(iOS 예산). **L-8** 12단계 소진 시 「앱을 열어 다음 세트를 보세요」 · 웹 첫 로드에 활성 세션 없으면 `session.end()`(고아 카드 정리) · `paused` 운동은 버튼 숨김. **L-9** promoted 실패 시 일반 진행 중 알림(테스트). **L-10** 딥링크는 `appUrlOpen` 한 곳(`native.ts`)에서 처리.
- **M-12 검증 추가**: (a) 슈퍼셋 멤버 무게 다름 (b) lb 블록·플레이트 한쪽 (c) 처방 탑셋→백오프 (d) 이벤트·drain 동시 + 낡은 스냅샷 rebase (e) 적용 뒤 flush 전 kill (f) 봉인 탭 drain (g) 대기 중 세션 버리기/종료 → 전부 discarded·카드 내림 (h) 잠금 중 완료 세트를 앱에서 해제 후 drain (i) 같은 픽스처로 화면 경로 vs 잠금 경로 DB 행 비교(completedAt 제외) · core 순서 규칙 표.
- **L-11** iOS 가 방식 B 로 가더라도 다리·도메인 코드는 공통이고 셸만 다르다(위험 표).

### 12.3 순서 변경
P0 는 지금 시작한다. P1 은 §12.2 를 반영한 상태로 **qa spec 2차**를 거친 뒤 시작한다.
