# SPEC-018 — Project Spec — 안드로이드 앱 자체 배포 · 앱 안 업데이트 · PWA → 전용 앱 원클릭 교체 (SRS-099 · ADR-047)

> 타입 Spec · 그룹 할일/앱-업데이트-교체 · ADStudio가 `SPEC-018.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-047, SRS-095, SRS-099

## 목표

리프트그램 사이트가 안드로이드 앱을 직접 배포한다(SRS-099 · ADR-047). 사용자 흐름은 셋이다.

- **새 앱(1.2.0 이상 · 출시 키)**: 앱 안 「앱 설치 파일 업데이트」 한 번 → 시스템 「업데이트」 한 번.
- **옛 앱(디버그 서명 1.0.x·1.1.x)**: 미동기 확인 → 공개 안내 페이지 `/app`에서 새 APK 받기 → 옛 앱 지우기 → 새 앱에서 「웹에서 쓰던 계정으로 계속」.
- **안드로이드 PWA(크롬)**: 「전용 앱으로 바꾸기」 → 미동기 0건 확인 → APK 받기·설치 → 새 앱이 처음 열리면 「웹에서 쓰던 계정으로 계속」 한 번 → 크롬 창의 확인 화면 → 같은 계정으로 로그인.

iOS는 범위 밖이다. 홈 화면의 PWA 아이콘은 자동으로 지울 수 없어 안내만 한다.

**등급 판정**: Project. 배포 스크립트, 안드로이드 네이티브, 웹 화면, 백엔드 RPC·DB 마이그레이션이 함께 바뀐다.

**v2 변경(REV-009 · 4개 리뷰 74건 반영)**

- 로그인 넘기기를 **앱이 시작하는 방식**으로 바꿨다. v1은 PWA가 코드를 만들어 `intent://`로 앱에 밀어 넣었다. 이 방식에는 세 문제가 있었다. 남이 만든 코드로 로그인시킬 수 있고(login CSRF), 앱이 꺼져 있으면 링크를 잃고, 설치기의 「열기」로 열면 코드가 없다. v2에서는 앱이 크롬 탭으로 기존 S256 교환(`src/backend/internal/oauth/handoff.go`)을 시작한다.
- 넘기기로 받은 세션은 「최근 로그인」으로 치지 않는다.
- `install`은 네이티브 안에서 매번 검증한다. JS에서 경로를 받지 않는다.
- 출시 키는 곧 **앱 서명 키**이므로 백업을 2곳에 둔다. 빌드와 서명을 나눈다.
- APK 이름에 해시를 넣는다. 되돌리기 배포가 json을 낮추지 않게 한다. 캐시는 깨끗한 커밋에서만 만든다.
- 단계를 3개에서 4개로 나눴다.

## 범위(바꿀 파일)

| 영역 | 파일 |
| --- | --- |
| 버전 원본 | 새 `src/mobile/release.json`(`versionName`·`versionCode` — 앱 버전의 유일한 원본) · `src/mobile/android/app/build.gradle`(그 파일을 읽음 · 서명 주석 고침) · `src/mobile/package.json` |
| 서명·배포 | 새 `src/scripts/android-release-key.sh`(키 만들기 · 권한 · 지문) · 새 `src/scripts/build-android-release.sh`(빌드 → 서명 → 검증 → 캐시 · 단독 실행) · `src/scripts/deploy-h2500-3.sh` · 새 `src/mobile/release-cert.json`(출시 키 지문 상수 — 커밋) · `.gitignore` |
| 웹 정적·SW | `src/frontend/sw/sw.template.js`(`/downloads/` 통과 · 옛 캐시 키 지우기) · `src/frontend/next.config.ts`(헤더) |
| 안드로이드 | 새 `src/mobile/android/app/src/main/java/org/tarae/liftgram/update/`(`LiftgramUpdatePlugin.java` · `ApkCheck.java` · `UpdateInstaller.java` · `InstallResultReceiver.java` · `PackageReplacedReceiver.java`) · `src/mobile/android/app/src/main/AndroidManifest.xml` · `src/mobile/android/app/src/main/java/org/tarae/liftgram/MainActivity.java` · `src/mobile/android/app/src/main/res/xml/`(백업 규칙 · FileProvider 경로) · JUnit `src/mobile/android/app/src/test/java/org/tarae/liftgram/update/ApkCheckTest.java` |
| 백엔드 | `src/proto/auth/v1/auth.proto`(`CreateAppContinue`) → `make proto` · `src/backend/internal/auth/handler_account.go` · `src/backend/internal/auth/account.go` · `src/backend/internal/auth/account_repo.go` · `src/backend/internal/oauth/handoff.go`(넘기기 착지 맡기기 공개) · `src/backend/cmd/server/main.go` · 마이그레이션 `src/database/migrations/0022_refresh_token_origin.sql` · `src/database/queries/auth.sql` → `make sqlc` · Go 테스트 |
| 웹 화면 | 새 `src/core/src/domain/appDistribution.ts`(+ 테스트) · 새 `src/frontend/lib/appDistribution.ts` · 새 `src/frontend/app/components/appdist/`(`AppDistBanner.tsx` · `AppUpdateCard.tsx` · `AppUpdateSheet.tsx` · `SwitchToAppSheet.tsx` · `AppContinueEntry.tsx`) · 새 공개 페이지 `src/frontend/app/app/page.tsx`(앱 받기·지문) · 새 `src/frontend/app/app/continue/`(크롬 탭 확인 화면) · `src/frontend/app/components/profile/ProfileClient.tsx` · `src/frontend/lib/native.ts`(앱 정보·appUrlOpen 한 곳·getLaunchUrl) · `src/frontend/app/components/LockBridge.tsx` · 로그인 화면(로그아웃된 앱의 첫 화면에 「계속」) · i18n `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` |
| e2e | 새 `src/frontend/e2e/app-distribution.spec.ts` |

범위 밖: iOS · 플레이 스토어 등록·플레이 빌드 · PWA 아이콘 자동 삭제(불가) · v3 키 회전.

## 설계

### 0. 신뢰 모델

- **업데이트**: 설치된 앱의 서명에 고정한다. 안드로이드는 같은 패키지 업데이트에서 서명이 같아야만 설치한다. 그와 별개로, 앱이 네이티브에서 직접 검사한다. 기준은 설치된 앱의 서명 집합과 앱 안 상수 지문(`src/mobile/release-cert.json`을 빌드 때 `BuildConfig`로 넣음)이다.
- `android.json`의 `sha256`·`certSha256`은 전송 손상 검사와 진단용이다. 신뢰 근거로 쓰지 않는다. APK와 json이 같은 서버에서 나가기 때문이다.
- **새 설치(PWA·옛 앱)**는 TLS와 사이트 신뢰에 기댄다. 그래서 출시 키 지문을 공개 페이지 `/app`과 프로필에 보인다.
- 패키지 이름은 서명과 묶여 있지 않다. 그래서 로그인 넘기기는 앱 쪽에 비밀(S256 검증값)이 있어야만 끝나게 한다(7절).

### 1. 출시 키

- `src/scripts/android-release-key.sh`가 키를 만든다.

  - 폴더 `~/.liftgram-release/`(700). 키 `upload.jks`(600 · RSA 4096 · 30년 · 별칭 `liftgram`). 비밀번호 파일 `secret.properties`(600 · 무작위 32자).
  - 비밀번호는 `-storepass:env`(생성)·`--ks-pass stdin`(서명)으로 넘겨 셸 기록·로그·환경 변수에 남기지 않는다.
  - 폴더는 Time Machine에서 뺀다(`tmutil addexclusion` — 암호화 안 된 백업 디스크에 키·비밀번호가 함께 들어가지 않게).
  - **한계(REV-010 보안 H-1 · 보류)**: 「키 없는 빌드」는 우리 gradle 설정이 키를 읽지 않게 할 뿐이다. 같은 사용자 권한으로 도는 프로세스(의존성 코드·다른 세션)는 파일을 읽을 수 있다. 서명 전용 사용자·키체인 분리는 사람이 정할 일로 남긴다.
  - 이미 있으면 덮어쓰지 않고 멈춘다.
  - 끝에 SHA-256 지문을 출력하고 `src/mobile/release-cert.json`에 쓴다.
- 이 키는 플레이의 업로드 키가 아니라 **앱 서명 키 그 자체**다. 잃으면 모든 사용자가 다시 설치해야 한다.

  - `src/mobile/android/app/build.gradle`의 옛 주석(「업로드 키 · Play에서 재설정 가능」)을 고친다.
  - 결과 회신에서 백업을 요청한다. 암호화한 사본 2벌을 서로 다른 매체에 두고, 키와 비밀번호를 분리하며, 클라우드 동기 폴더 밖에 둔다.
- 비밀번호를 macOS 키체인에 두는 안은 보류했다. 에이전트 세션은 키체인을 읽지 못한다(ADStudio 맥 기록).

### 2. APK 빌드 — `src/scripts/build-android-release.sh` `<소스 루트>` `<출력 폴더>`

1. **사전 검사**: JDK 21(`JAVA_HOME` 없으면 `/opt/homebrew/opt/openjdk@21`) · `ANDROID_HOME`(없으면 `~/Library/Android/sdk`) · build-tools의 `apksigner`·`zipalign`·`aapt2`가 있는지 본다. 하나라도 없으면 멈추고 무엇이 없는지 출력한다.
2. **빌드(키 없이)**: `src/mobile`에서 `bun install --frozen-lockfile` → `npx cap sync android` → `git diff --exit-code`(sync가 추적 파일을 바꾸면 멈춤) → `./gradlew :app:assembleRelease`. 이때 `LIFTGRAM_UPLOAD_KEY_PROPS`는 비워 둔다. 의존성 gradle 코드가 키를 볼 수 없게 하려는 것이다.
3. **서명(키는 여기서만)**: `zipalign -p 4` → `apksigner sign --v2-signing-enabled true --v3-signing-enabled true`.
4. **검증**:

  - `apksigner verify --print-certs -v`로 v2가 참인지, 지문이 `src/mobile/release-cert.json`과 같은지 본다.
  - `aapt2 dump badging`으로 패키지 `org.tarae.liftgram`, versionName·versionCode가 `src/mobile/release.json`과 같은지 본다.
  - 하나라도 다르면 멈춘다.
5. **출력**:

  - `liftgram-<versionName>-<versionCode>-<sha8>.apk`. 이름에 해시가 있어 같은 이름이 다른 바이트를 가리키지 않는다.
  - `android.json`.
6. **캐시** `~/.liftgram-release/apk/<versionCode>/`:

  - 깨끗한 커밋(`git status --porcelain`이 비어 있음)에서 만든 것만 넣는다. 임시 폴더에 쓴 뒤 `mv`하고, `mkdir` 잠금으로 동시 실행을 막는다.
  - 쓸 때 `commit`·`sha256`을 함께 적는다. 꺼낼 때 sha256을 다시 확인한다.
  - **같은 versionCode의 재사용 규칙**:

    - 캐시 커밋 이후 `src/mobile/`(ios 제외)·`src/mobile/package.json`·`bun.lock`·`src/mobile/www/`가 바뀌었으면 멈춘다. 「`src/mobile/release.json`의 versionCode를 올리세요」라고 안내한다.
    - 캐시 커밋을 이 저장소가 모르면 멈춘다.
    - `ALLOW_SAME_APK=1`이면 그대로 쓴다.
  - 직전 버전 APK 한 벌은 남긴다(되돌리기용).
7. 저장소 밖 출력 폴더도 받는다(단독 실행). 서명 키가 없으면 멈춘다. 서명 없는 APK는 내보내지 않는다.

`android.json`(no-store):

```json
{ "v": 1, "versionName": "1.2.0", "versionCode": 3, "url": "/downloads/liftgram-1.2.0-3-1a2b3c4d.apk",
  "sha256": "<64 hex>", "size": 7340032, "certSha256": "<지문 hex>", "minVersionCode": 1,
  "minSignedVersionCode": 3, "builtAt": "2026-11-03T…Z", "commit": "<short>" }
```

- `minVersionCode`: 이보다 낮으면 꼭 해야 하는 업데이트다(그래도 「나중에」는 남는다).
- `minSignedVersionCode`: 출시 키로 처음 서명한 버전. 이보다 낮은 앱은 옛 키라 덮어쓸 수 없어 재설치 안내를 받는다.

### 3. 배포 스크립트 — `src/scripts/deploy-h2500-3.sh`

- rsync 전에 사전 검사를 하고, `build-android-release.sh "$CLEAN" "$CLEAN/src/frontend/public/downloads"`를 부른다. 웹 이미지가 APK를 싣는다.

  - `$CLEAN`은 커밋된 SHA의 깨끗한 사본이다. 그래서 커밋되지 않은 `lock/*.java` 같은 파일은 빌드에 들어가지 않는다. **커밋 뒤 배포**가 전제다.
- **되돌리기 보호**: 지금 사이트의 `android.json`을 먼저 받는다. 새 versionCode가 그보다 낮으면 멈춘다. 낮추려면 `ALLOW_APK_DOWNGRADE=1`이 필요하다. 판정 함수 쪽에서도 최신 ≤ 설치본이면 안내하지 않는다.
- `SKIP_APK=1`이면 빌드를 건너뛴다. 대신 지금 사이트의 `android.json`과 그 APK를 받아 sha256을 확인한 뒤 넣는다. 못 받으면 멈춘다.
- **끝 확인**(하나라도 틀리면 0이 아닌 코드로 끝냄):

  - `$SITE/downloads/android.json`의 versionCode·sha256이 새 값과 같다.
  - APK를 끝까지 받아 sha256이 같다.
  - 헤더: `Content-Type: application/vnd.android.package-archive` · json `Cache-Control: no-store` · `Range: bytes=0-0` 응답이 206이다.

### 4. 웹 정적·서비스 워커

- `src/frontend/sw/sw.template.js`:

  - fetch 첫 줄에서 `/downloads/`를 가로채지 않는다(navigate 포함).
  - activate 때 옛 PAGES 캐시의 `/downloads/` 키를 지운다.
  - 옛 SW가 남아 있는 브라우저는 다음 SW 갱신 때 풀린다. 그 사이를 위해 화면의 받기 링크는 `apkHref()` = `<url>?_rsc=apk`다(옛 SW는 `_rsc` 질의를 건너뛴다 · 정적 파일은 질의를 무시한다 · REV-013). 같은 헤더·바이트가 오는지 e2e로 본다.
- `src/frontend/next.config.ts` headers:

  - `/downloads/:name(liftgram-[0-9A-Za-z.]+-[0-9]+-[0-9a-f]+\\.apk)`(빌드 스크립트가 만드는 이름 모양만 · REV-013 보안 L-4) → `Content-Type: application/vnd.android.package-archive` · `Content-Disposition: attachment` · `Cache-Control: public, max-age=31536000, immutable`
  - `/downloads/android.json` → `Cache-Control: no-store`

### 5. 안드로이드 플러그인 `LiftgramUpdate`

(Phase 2 · REV-011 반영판 — 웹 `src/frontend/lib/appDistribution.ts`가 쓰는 모양)

| 메서드 | 하는 일 |
| --- | --- |
| `info()` | `{versionName, versionCode, certs, certSha256 \ | null, expectedCertSha256, debug, installer, selfUpdate, canInstall, sdk, metered}`. 서명을 읽지 못하면 `certSha256`은 null(= 모름)이다. 설치 표식이 있으면 `justUpdated {from,to}`(바뀜) 또는 `installStarted {from,to}`(시작했는데 아직 그 판이 아님)를 덧붙인다. **부수효과는 없다.** |
| `ackJustUpdated()` | 「업데이트됐습니다」를 보인 뒤 표식을 지운다. |
| `state()` | `{downloading {id,received,total} \ | null, installing {to,sessionId,at} \ | null, confirmWaiting, lastResult {status,sessionId,at} \ | null}`. 화면을 새로 고친 뒤 이어 보는 데 쓴다. 리스너를 달기 전에 온 결과도 `lastResult`에 남는다. |
| `download({url, sha256, size})` | 아래 검사를 거쳐 `{id}`(= sha256)를 돌려준다. 진행 이벤트는 `progress {received,total}`(이미 받은 파일이면 한 번). 받는 중이면 줄 세우지 않고 바로 `busy`. |
| `cancelDownload()` | 받기를 끊는다(`cancelled`). |
| `install({id, mode?:"session"\ | "view"})` | 아래 검사 뒤 PackageInstaller 세션에 쓰고 commit한다 → `{mode, sessionId}`. 결과는 이벤트 `installResult {status, sessionId, at}`. `view`(대체 설치)는 결과 이벤트가 없다 — 웹은 `resume` 뒤 `info()`로 판단한다. |
| `cancelInstall()` | 우리 세션을 모두 버리고 표식을 지운다. |
| `openInstallSettings()` | `ACTION_MANAGE_UNKNOWN_APP_SOURCES`(이 앱 · 24~25는 보안 설정). 이미 허용이면 열지 않고 `{opened:false}`. 돌아오면 이벤트 `resume` → 웹이 `info()`로 `canInstall`을 다시 읽는다. |

- **닫힌 실패 코드**(`ApkCheck.ERROR_CODES` · reject의 `code`): `origin`(호출 화면·주소·리다이렉트 · 개발 주소에서는 전부 이것) · `invalid`(인자 형식) · `busy` · `cancelled` · `network` · `size` · `hash` · `space` · `storage` · `missing`(받은 파일 없음·깨짐 → 다시 받기) · `store`(플레이 설치본) · `package` · `downgrade`(같거나 낮은 판 → 「이미 최신」) · `signature` · `notAllowed`(설치 허용 꺼짐) · `failure`. 표 밖의 값은 `failure`로 바꾼다. 시스템 메시지 원문은 보내지 않는다.
- **installResult `status`**: `pending`(확인 화면) · `success` · `aborted`(사용자 취소) · `blocked` · `conflict` · `incompatible` · `invalid` · `storage` · `timeout` · `failure` · (state 전용) `expired`(30분 지난 표식을 지움).
- **실행기**: 받기(DL 한 줄)와 나머지(IO)를 나누고 static으로 둔다 — 받는 동안에도 info·설정이 바로 답한다.
- **호출 출처**: 메인 프레임 URL의 출처가 `https://liftgram.tarae.org`이고, 새 브리지(`WEB_MESSAGE_LISTENER` · `useLegacyBridge:false`)일 때만 받는다. 옛 브리지는 iframe의 호출을 가리지 못해 전부 거절한다.
- **download 검사**(`ApkCheck` · JUnit):

  - `java.net.URI`로 해석한다. 상대 경로는 상수 기준으로 푼다.
  - scheme https · host 정확히 같음 · userInfo 없음 · 포트 -1·443 · path는 `/downloads/liftgram-`로 시작하고 `..`가 없어야 한다.
  - 리다이렉트를 끄고, 3xx는 `origin` 실패로 본다.
  - `size`를 넘으면 즉시 끊는다. 빈 공간이 `size`×2 미만이면 `space` 실패다.
  - 받는 중 sha256을 계산한다. 저장 경로는 `cacheDir/updates/<sha256>.apk`이고, 이름은 64 hex 정규식을 통과한 값만 쓴다.
  - 같은 sha256 파일이 있으면 다시 받지 않는다. 다른 파일은 지운다(설치가 진행 중이면 지우지 않는다).
  - 해시가 틀렸던 sha256은 10분 동안 다시 받지 않는다(데이터 남용 방지).
  - 실패 코드: `network`·`hash`·`size`·`space`·`origin`·`storage`·`cancelled`·`busy`·`invalid`.
- **install 검사**(매번 · 네이티브):

  - 받은 파일 경로로 `PackageManager.getPackageArchiveInfo`를 읽는다(API 28+는 `GET_SIGNING_CERTIFICATES | GET_SIGNATURES` — 일부 API에서 signingInfo가 비면 옛 signatures로). 검사와 쓰기 사이의 바꿔치기는 **세션에 쓰면서 sha256을 다시 계산해 commit 직전에 대조**하는 것으로 막는다(대체 설치는 열기 전에 해시를 다시 계산 · REV-011 안드로이드 L-4).
  - 패키지 = `org.tarae.liftgram`.
  - 서명 집합 = 설치된 앱의 서명 집합, 그리고 상수 지문 포함. 설치본 서명을 못 읽었으면 APK 서명자 = {상수} 정확히.
  - versionCode > 지금.
  - 실패 코드: `signature`·`package`·`downgrade`·`hash`·`missing`·`store`·`notAllowed`.
  - 확인 화면은 **언제나** 뜬다(`USER_ACTION_REQUIRED` · REV-011 보안 M-1). 설치 전에 우리의 끝나지 않은 세션을 모두 버린다.
  - 설치기가 플레이(`com.android.vending`)면 자체 업데이트를 하지 않는다(`installer` 판정).
- **설치 직전 저장**:

  - 웹이 먼저 `commitAll` 초안 → LokiJS 저장 → `CookieManager.flush()`를 부른다. 설치에 성공하면 프로세스가 죽기 때문이다.
  - 그 뒤 진행 상태를 `SharedPreferences`에 적는다(`installing:<versionCode>` · 시각 · 세션 id). 쿠키는 확인 화면을 받을 때와 `onPause`에도 flush한다.
- **결과 수신**:

  - `InstallResultReceiver`는 명시적 Intent(`setPackage`·컴포넌트)이고, PendingIntent는 `FLAG_MUTABLE`(API 31+)을 쓴다. 시스템이 결과를 채우기 때문이다.
  - 지금 세션이 아닌 결과는 버린다.
  - `STATUS_PENDING_USER_ACTION`일 때 확인 화면 Intent가 시스템 앱으로 가는지 확인하고 권한 위임 플래그를 지운다. 앱이 앞에 있으면 바로 띄우고, 뒤에 있으면 저장했다가 `onResume`에서 띄운다(30분 안 · 같은 세션만). 띄우지 못하면 `pending` 없이 `failure` 하나.
  - 상태 코드는 `success`·`aborted`(사용자 취소)·`conflict`·`incompatible`·`storage`·`blocked`·`failure`로 옮긴다.
- **업데이트 뒤**:

  - `PackageReplacedReceiver`(`MY_PACKAGE_REPLACED`)가 「업데이트 완료 — 눌러서 열기」 알림을 띄운다. 표식이 30분 안이고 판이 맞을 때만이다. 알림 권한이 없으면 생략한다.
  - 다시 열린 앱은 `info().justUpdated`로 「1.2.1로 업데이트됐습니다」를 한 번 보이고 `ackJustUpdated()`로 표식을 지운다.
- **대체 설치**: 세션 설치가 `blocked`(일부 제조사 MIUI 등)면 업데이트 전용 FileProvider(`${applicationId}.updates` · `cache/updates/`만) 주소로 `ACTION_VIEW` 설치 화면을 연다. 이때도 위 검사를 먼저 통과해야 하고, 읽기 권한은 시스템 설치기에만 준다(`setPackage`).
- **API 가드**: minSdk 24. 기능별 API 판정이 필요한 것은 `canRequestPackageInstalls`(26+), `GET_SIGNING_CERTIFICATES`(28+), `setRequireUserAction`(31+, 설치기 자기 업데이트에서 확인 화면을 줄임 — 실패해도 무시), `getInstallSourceInfo`(30+)다. 24~25에서는 「설정 → 보안 → 출처를 알 수 없는 앱」 안내만 한다.
- **매니페스트**:

  - `REQUEST_INSTALL_PACKAGES`(플레이 빌드에서는 빼야 한다 — ADR-047).
  - 리시버 둘(exported=false · `InstallResultReceiver` 이름은 바꾸지 않는다 — 성공 결과가 새 판 프로세스로 배달된다), 업데이트 전용 FileProvider.
  - 백업 규칙에서 `app_webview`·`updates/`를 뺀다(`dataExtractionRules`·`fullBackupContent`).

### 6. 판정 — `src/core/src/domain/appDistribution.ts`(순수)

```ts
type Shell =
  | { kind: "web"; os: "android" | "ios" | "other"; browser: "chrome" | "samsung" | "inapp" | "other"; standalone: boolean }
  | { kind: "app"; os: "android" | "ios"; bridge: "ready" | "missing" | "failed"; versionCode: number | null;
      certSha256: string | null; expectedCertSha256: string | null; installer: string | null; hasUpdater: boolean };
type Latest = { v: 1; versionName: string; versionCode: number; minVersionCode: number; minSignedVersionCode: number;
  url: string; sha256: string; size: number; certSha256: string };
type Offer =
  | { kind: "none"; why: string }
  | { kind: "update"; mandatory: boolean; latest: Latest }      // 새 앱 — 앱 설치 파일 업데이트
  | { kind: "reinstall"; latest: Latest }                       // 옛 키 앱 — 한 번 지우고 다시 설치
  | { kind: "switch"; latest: Latest; manual: boolean };        // 안드로이드 웹 — 전용 앱으로(manual = 크롬 아님)
parseLatest(json: unknown): Latest | null    // 스키마 검사 — v===1 · 정수 범위 · minVersionCode ≤ versionCode · url 형식 · 64 hex
decideOffer(shell, latest, ctx: { activeWorkout; loggedIn; dismissed: { key: string; until: number } | null; now }): Offer
```

규칙(위에서부터 먼저 맞는 것):

1. `latest`가 null(못 읽음·검증 실패) → none.
2. 운동 중 → none. 꼭 해야 하는 업데이트도 운동이 끝난 뒤에 안내한다.
3. 앱·iOS → none(H-5 — iOS 앱이 재설치 안내를 받지 않게).
4. 앱·안드로이드:

  - 브리지 `missing`(1.0.x·1.1.x 플러그인 없음) → reinstall.
  - 브리지 `failed`(호출 오류) → none.
  - 설치기가 플레이 → none.
  - 기대 지문은 앱에 박힌 `RELEASE_CERT_SHA256`(= `src/mobile/release-cert.json` · 단위 시험이 대조)이다. json 값으로 대신하지 않는다(REV-013).
  - `certSha256`이 있는데 기대 지문과 다름 → reinstall(디버그 빌드면 none `debug`).
  - `certSha256`을 모르고(빈 값) `versionCode < minSignedVersionCode` → reinstall. 지문을 알면 minSigned는 보지 않는다(서명이 맞는 앱에 재설치를 권하지 않게 · REV-013 보안 M-4).
  - json의 `certSha256`이 기대 지문과 다름 → none `json-cert`(네이티브가 늘 `signature`로 거절할 업데이트를 권하지 않는다 · REV-013 계약 H-3).
  - `versionCode ≥ latest.versionCode` → none(되돌리기 배포 포함).
  - 그 밖 → update. `versionCode < minVersionCode`면 mandatory.
5. 웹: 안드로이드·standalone 아님이어도 안내한다(크롬 탭). iOS·데스크톱 → none. 로그인 안 됨 → none(배너 기준 — `/app` 페이지는 늘 보인다).

  - 크롬 → switch.
  - 삼성 인터넷·그 밖 → switch(manual: 「크롬으로 열면 로그인이 이어집니다」).
  - 인앱 브라우저 → none(「브라우저로 열기」 안내만, `/app` 페이지).
6. 「나중에」:

  - 열쇠는 `<kind>:<versionCode>`다. 새 버전이면 다시 보인다.
  - 숨기는 기간은 3일 → 7일 → 30일로 늘어난다.
  - 「다시 보지 않기」는 switch에만 둔다. 한 번 고르면 새 판이 나와도 모든 `switch:*`를 숨긴다(REV-013 화면 M-7).
  - 배너만 숨긴다. 프로필 줄은 늘 보인다.

### 7. 로그인 넘기기 — 앱이 시작한다(기존 S256 교환 재사용)

**흐름**

1. 로그아웃된 안드로이드 앱의 첫 화면(로그인 화면) 맨 위에 「웹에서 쓰던 계정으로 계속」이 있다. PWA에서 바꾸기를 시작했거나 설치 직후 처음 열렸을 때는 이것을 강조한다.
2. 누르면 앱 웹뷰가 무작위 `v`를 메모리에 두고, 크롬 Custom Tab으로 `https://liftgram.tarae.org/app/continue?ac=<S256(v)>`를 연다. 기존 `nativeSignIn`과 같은 방식이다.
3. 크롬 탭은 크롬의 쿠키를 함께 쓴다. 크롬으로 설치한 PWA도 같은 저장소를 쓰므로 웹 세션이 살아 있다. 이 탭에 **확인 화면**이 뜬다. 「`a••••@gmail.com`(이름·아바타) 계정으로 리프트그램 앱에 로그인할까요? — 방금 앱에서 누른 경우에만 계속하세요」 · 「계속」 · 「다른 방법으로 로그인」(`liftgram://auth?cancel=1` — 코드 없이 탭만 닫는다 · REV-012).

  - 웹 세션이 없으면 그 탭에서 일반 로그인을 거친 뒤 이 화면으로 돌아온다.
4. 「계속」을 누르면 RPC `CreateAppContinue({challenge})`를 부른다.

  - 로그인한 사람만 부를 수 있다. 사용자별·IP별로 분당 5회까지다.
  - 서버는 목적 `PurposeAppContinue`의 일회용 로그인 코드(60초 · 한 번)를 만든다.
  - 착지 `/auth/complete?code=<c>&via=continue`를 기존 handoff 저장소에 `challenge`와 함께 맡긴다(2분).
  - `liftgram://auth?code=<handoff>`를 돌려준다. 화면이 그 주소로 이동한다.
5. 앱이 `liftgram://auth`를 받는다. 이후는 기존 경로와 같다. `v`를 가진 웹뷰만 `/api/auth/oauth/app/handoff`로 교환한다.

**방어**

- 남이 `liftgram://auth?code=`를 밀어 넣어도 `v`가 없으면 교환되지 않는다(handoff `take`가 소모하지 않음).
- 남이 크롬에서 `/app/continue?ac=<자기 값>`을 열게 꾀어도, 확인 화면과 「방금 앱에서 누른 경우에만」 문구를 거쳐야 한다. 이 화면은 `frame-ancestors 'none'`이다. 「계속」은 사용자 클릭으로만 RPC를 부른다(Connect POST · SameSite 쿠키).
- **이미 로그인된 앱**은 이 진입점을 보이지 않는다. `via=continue` 착지가 세션이 있는 앱에서 열리면 교환하지 않고 홈으로 간다.
- **최근 로그인 아님**:

  - 마이그레이션 `0022`에서 `refresh_tokens.origin text NOT NULL DEFAULT 'login'`을 추가한다.
  - `PurposeAppContinue`로 교환한 계열의 첫 토큰은 `origin='continue'`다.
  - `LastLoginAt`은 `origin = 'login'`만 센다(닫힌 조건 · `refresh_tokens_origin_check` · REV-012). 그래서 계정 삭제·첫 비밀번호 설정은 다시 로그인해야 한다.
  - 원 세션 계열 폐기와는 묶지 않는다(보류 — 비밀번호 변경·전체 로그아웃은 사용자 전체를 폐기하므로 포함된다. Go 테스트로 확인).
- 코드·handoff 값은 로그에 남기지 않는다(접근 로그의 쿼리 문자열 가림 확인).
- **appUrlOpen 한 곳**:

  - `src/frontend/lib/native.ts`가 리스너 하나로 auth·workout·start를 나눠 보낸다.
  - 앱이 링크로 처음 켜진 경우(콜드 스타트)는 `App.getLaunchUrl()`도 한 번 읽는다. 재생은 원하는 쪽(`replayLaunch` — 진입 강조·운동 화면)만, 한 실행에 한 번(sessionStorage)만 받는다(REV-012 화면 H-1·M-2).
  - 기존 `nativeSignIn` 안의 리스너는 이 디스패처를 쓰도록 바꾼다.

### 8. 웹 화면

- **배너** `AppDistBanner.tsx`(홈 위 · 로그인한 사람만 · 6절 「나중에」 규칙):

  - 「새 앱 1.2.1 — 앱 설치 파일 업데이트」
  - 「앱을 한 번만 다시 설치해 주세요」
  - 「전용 앱으로 바꾸기」
  - 용어를 나눈다: 「화면 업데이트」(기존 `AppVersionRow` — 웹 번들)와 「앱 설치 파일 업데이트」(APK).
- **프로필 줄**: `AppVersionRow` 아래 `AppUpdateCard.tsx`. 앱 버전 · 상태 배지 · 출시 키 지문 앞 16자. 누르면 시트가 열린다.
- **업데이트 시트** `AppUpdateSheet.tsx`(새 앱):

  - 크기 표시(「약 7MB · 와이파이 권장」) → 받기 진행 막대 → 「업데이트」.
  - 설치 권한이 없으면 「설정에서 『이 출처 허용』」 단계를 먼저 둔다. 돌아오면 `canInstall`을 다시 읽는다.
  - 설치 직전 운동 중인지 다시 확인하고, 초안 `commitAll` → 저장 → 쿠키 flush.
  - 실패 문구는 코드별(network·hash·size·space·origin·signature·package·downgrade·aborted·conflict·storage·blocked)이다. `aborted`는 「취소했어요 — 다시 누르면 이어서」.
  - 단계는 `sessionStorage`에 둔다(설정에 다녀와도 이어짐).
- **바꾸기 시트** `SwitchToAppSheet.tsx`(PWA). 단계는 `localStorage`에 둔다(설치하고 돌아와도 이어짐).

  1. **기록 확인**. 아래가 모두 참이어야 다음으로 간다.

    - 로그인됨(아니면 로그인으로).
    - 쓰기 주인 충돌 없음(있으면 기존 AccountGuard 화면으로).
    - 온라인.
    - 운동 중 아님.
    - `syncWithServer()` 성공. 성공 시각이 이 시트를 연 뒤여야 한다.
    - 그 뒤 `countPendingUserChanges()` = 0, 설정 대기(prefsPending) 0, 요약 보낼 것(summaryOutbox) 0.
    - 「서버에 올라간 기록 N개」를 보여 준다. 실패하면 이유와 「다시 시도」.
  2. **APK 받기**: `<a href=url download>`. 크롬 「이 출처 허용」 안내 그림 한 줄. 「이미 설치했어요」 버튼.
  3. **앱 열기**: `intent://start#Intent;scheme=liftgram;package=org.tarae.liftgram;S.browser_fallback_url=https%3A%2F%2Fliftgram.tarae.org%2Fapp;end`. 코드는 싣지 않는다. 안내 문구는 「앱에서 『웹에서 쓰던 계정으로 계속』을 누르세요」다.
  4. **끝 안내**: 「홈 화면의 웹 아이콘은 길게 눌러 지워도 됩니다」.
  5. 단계를 넘어갈 때마다 1단계 확인을 다시 한다. 웹 아이콘을 지우라는 안내 전에도 한 번 더 한다.
- **재설치**(옛 앱 1.0.x·1.1.x): 옛 앱에는 새 플러그인이 없다. 그래서 웹 시트 1단계(기록 확인)를 거친 뒤 시스템 브라우저로 공개 페이지 `/app`을 연다(`@capacitor/browser` 또는 `window.open(_system)`). 그 페이지가 APK 받기·옛 앱 지우기·새 앱에서 「계속」을 안내한다.
- **공개 페이지** `/app`(로그인 없이):

  - 최신 버전·크기·지문 전체를 보인다.
  - 받기 · 단계 안내(크롬 허용 → 설치 → 옛 앱이 있으면 먼저 지우기 → 새 앱 「계속」).
  - 인앱 브라우저면 「브라우저로 열기」.
  - SW가 가로채지 않는다(navigate 셸 예외).

## 작업 단계

### Phase 1 — 버전 원본 · 출시 키 · APK 빌드 · 배포 파이프라인

- [x] `src/mobile/release.json` 1.2.0 / 3 · `src/mobile/android/app/build.gradle`이 읽게 · 서명 주석 고침 · `src/mobile/package.json`
- [x] `src/scripts/android-release-key.sh`(권한 700/600 · 덮어쓰기 금지 · `-storepass:env`) → 키 만들기 → `src/mobile/release-cert.json`
- [x] `src/scripts/build-android-release.sh`: 사전 검사 · 키 없는 빌드 · zipalign·apksigner · 검증(v2·지문·aapt2) · 해시 이름 · json · 깨끗한 커밋만 캐시(원자·잠금·재확인·변경 감지) · 직전 한 벌 보관
- [x] `src/scripts/deploy-h2500-3.sh`: 사전 검사 · 호출 · 되돌리기 보호(`ALLOW_APK_DOWNGRADE`) · `SKIP_APK`는 사이트에서 되받기 · 끝 확인(전체 sha256·헤더·Range)
- [x] SW `/downloads/` 통과·옛 키 청소 · `src/frontend/next.config.ts` 헤더 · `.gitignore`
- [x] (REV-010 반영) 백업 표식 `~/.liftgram-release/BACKED_UP` 없으면 APK 안 냄 · 사이트와 같은 versionCode·다른 바이트 멈춤 · 끝 확인은 DEPLOYED_REF 뒤(실패는 끝에서 0 아닌 코드) · 직전 APK 한 벌 같이 싣기 · 없는 이름은 서버가 짧은 404 · 16KB 정렬 · v1/v4 끔·v3 확인 · 비밀번호는 stdin · `--no-daemon` · `--verify` 모드(SKIP_APK 되받기)
- **완료 기준**:

  - 단독 실행으로 서명된 APK와 json이 나온다. 검증 3종을 통과한다.
  - 더러운 사본에서는 캐시하지 않는다. 깨끗한 사본 두 번째 실행은 캐시를 쓴다. 다른 키 지문이면 멈춘다.
  - 로컬 운영 빌드(3200)에서 json·APK 헤더와 Range를 확인한다.
  - `make verify`.

### Phase 2 — 안드로이드 업데이트 플러그인

- [x] `ApkCheck`(URL·출처·크기·응답 코드·서명자 고르기·서명 집합 비교·닫힌 코드표·표식) + JUnit 표(12)
- [x] `LiftgramUpdatePlugin`(info·state·ackJustUpdated·download·cancelDownload·install·cancelInstall·openInstallSettings · 출처+새 브리지 확인 · 이벤트) · `UpdateInstaller`(서명 읽기·세션 쓰기·대체 설치·취소) · `InstallResultReceiver`(명시 Intent·FLAG_MUTABLE·앞/뒤 처리·세션 id·시스템 앱 확인) · `PackageReplacedReceiver`
- [x] 매니페스트(권한·리시버·전용 FileProvider·백업 제외) · `MainActivity.java` 등록 · `BuildConfig` 상수 지문 · API 가드
- [x] 에뮬레이터 업데이트 왕복(API 35·30): 1.2.0(3) 설치 → 1.2.1(4) 업데이트 → 데이터 유지(첫 설치 시각 유지) → 내리기·다른 키 거부. 계측 시험 5개(실제 PackageManager) 두 API 통과 — EXE-007
- **완료 기준**: `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug` 통과 · 서명 릴리스 빌드 · 왕복 결과(또는 사유).

### Phase 3 — 로그인 넘기기(앱이 시작) · 백엔드

- [x] 마이그레이션 `0022`(`refresh_tokens.origin`) · `LastLoginAt` 제외 · `make sqlc`
- [x] `PurposeAppContinue` · RPC `CreateAppContinue(challenge)` · handoff 맡기기 공개(`oauth`) · 조립 · 제한(사용자·IP)
- [x] `/app/continue` 확인 화면(마스킹 · 경고 문구 · `frame-ancestors 'none'` · 로그아웃이면 로그인 뒤 복귀)
- [x] `src/frontend/lib/native.ts` appUrlOpen 디스패처 · `getLaunchUrl` · `via=continue`는 세션 있으면 버림 · 로그인 화면 진입점 `AppContinueEntry.tsx`
- [x] Go 테스트:

  - 로그인 없음 → Unauthenticated
  - challenge 형식 오류
  - 코드는 한 번만, 61초 뒤 실패
  - v가 틀리면 소모 안 됨
  - 교환 직후 소셜 전용 계정 삭제 → `reauth_required`
  - 비밀번호 변경 → continue 계열도 폐기
  - 제한
- [x] (REV-012) 실 DB 시험 `src/backend/internal/auth/app_continue_pg_test.go` · 콜드 스타트 재생은 원하는 쪽만·한 실행 한 번 · 「다른 방법으로 로그인」 = `liftgram://auth?cancel=1` · 탭 닫힘 정리 · 진입 바쁨 상태 · 「앱 열기」 링크 · SW가 `/app`·`/auth/complete`를 가로채지 않음
- **완료 기준**: Go 테스트 · `make verify` · e2e(크롬 탭을 흉내: 같은 브라우저에서 `/app/continue` → handoff → 착지 · 다른 v 거부 · 로그인된 앱은 버림).

### Phase 4 — 판정 · 웹 화면 · e2e

- [x] `appDistribution.ts` `parseLatest`·`decideOffer` + 단위 표(6절 규칙 전부)
- [x] `src/frontend/lib/appDistribution.ts`(json 읽기 no-store · 셸 판별 · 브리지)
- [x] 배너 · 프로필 카드 · 업데이트 시트 · 바꾸기 시트(단계 저장·재확인) · 재설치 경로 · 공개 `/app` · i18n
- [x] (REV-010 웹 M-3) PWA 받기 링크는 옛 서비스 워커를 건너뛰는 주소로(옛 워커가 건너뛰는 `_rsc` 질의 — 정적 파일은 질의를 무시) · e2e
- [x] (REV-010 안드로이드 L-8) 디버그 서명 앱(개발 기기)은 지문이 달라 「재설치」로 판정된다 — 디버그 빌드는 안내를 끄거나 「개발 빌드」로 표시(`info().debug`)
- [x] (REV-011 이월) 다리 계약 쓰기: 시작 때 `state()`로 이어 보기 · `justUpdated` → 안내 → `ackJustUpdated()` · 코드표 16개 → 문구 · `downgrade`=「이미 최신」 · 안드로이드 7(sdk 24·25)은 기기 전체 설정 문구 · `blocked` → 대체 설치는 한 번만 · 데이터 요금 회선(`metered`)이면 크기 안내 · 운동 중이면 확인 화면·설치를 미룸 · 설치 직전 저장은 IndexedDB(LokiJS) 커밋을 기다린 뒤
- [x] e2e `src/frontend/e2e/app-distribution.spec.ts`:

  - 안드로이드 크롬 PWA: 바꾸기 → 미동기 있으면 멈춤 → 동기 실패면 멈춤 → 0건 → APK 링크(SW 통과·헤더) → intent 주소(코드 없음·package·fallback `/app`)
  - 삼성 인터넷 → manual 문구 · 인앱 → 안내 · 데스크톱·iOS → 0
  - 가짜 새 앱: 업데이트 시트 · 진행 · 실패 코드별 문구 · aborted 이어하기 · 운동 중 0 · 최신 ≤ 설치본 0 · 플레이 설치본 0
  - 가짜 옛 앱(브리지 없음) → 재설치 → `/app`
  - iOS 앱 → 0
  - 「나중에」 열쇠·기간 · 새 버전이면 다시 보임
  - 기존 회귀(프로필·세션·잠금)
- [x] (REV-013) 기록 확인 우회 막기(단계 복원·재설치 열기 때 재확인 · 사용자별 단계 열쇠 · 단정 문구 수정) · 운동 시작 시 받기·설치 거둠 · 받은 id를 `latest.sha256`에 묶기 · 「설치 취소」·resume 판단·30분 지난 표식 거둠 · 받는 중 이어 붙기 · `notAllowed` → 설정 · 영구 실패에 다시 시도 없음 · 기대 지문 = 앱에 박힌 지문 · /app 지문 불일치면 받기 숨김 · `recordCheckVerdict` 순수 함수 · 시험 표식(`app-offer-state`)
- **완료 기준**: 단위·e2e 통과 · `make verify` · 독립 qa code · 웹 v0.59.0 · 앱 1.2.0(3).

## 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-099 | 배포마다 서명 APK·json, sha256·지문·버전 일치 | 스크립트 검증 3종 · 끝 확인 · 로컬 3200 |
| SRS-099 | 「업데이트」 한 번 + 시스템 「업데이트」 한 번 | 에뮬레이터 왕복 · e2e(가짜 플러그인) |
| SRS-099 | 해시·서명·패키지·버전이 다르면 설치 안 함 · JS가 경로를 못 줌 | JUnit · e2e 실패 문구 |
| SRS-099 | 운동 중 안내 없음 · 설치 직전 재확인 | 단위 · e2e |
| SRS-099 | PWA → 기록 확인(동기 성공·0건) → APK → 앱 「계속」 → 같은 계정 | e2e(intent 주소 · 계속 흐름) · 실기기 |
| SRS-099 | 넘기기는 앱의 S256 비밀 없이는 안 끝남 · 확인 화면 · 최근 로그인 아님 | Go 테스트 · e2e |
| SRS-099 | 데스크톱·iOS(웹·앱)에 안내 없음 | 단위 · e2e |
| SRS-095 | 계정 삭제·첫 비밀번호의 최근 로그인 규칙 유지 | Go 테스트 |

## 테스트 계획

- **core 단위**: `parseLatest`(형식·범위·min ≤ v) · `decideOffer` 표(6절 1~6 · 브리지 3상태 · 지문 null/다름 · 플레이 · 되돌리기 · 브라우저 4종 · 로그인 · 「나중에」 열쇠·기간).
- **Go**: Phase 3 목록.
- **JUnit 4**(`src/mobile/android/app/src/test/java/org/tarae/liftgram/update/ApkCheckTest.java`): URL 표(userInfo·접미 호스트·포트·`..`·http) · 호출 화면 출처 · 응답 코드(리다이렉트·200 밖) · 해시 이름 · 크기 읽기(브리지 형)·초과 · 서명 집합(여러 서명자·설치본 모름) · 서명자 고르기(회전·옛 signatures) · 닫힌 코드표 · 표식 판정 · 상태 이름. json 형식은 웹 단위 시험(Phase 4 `parseLatest`).
- **계측**(`src/mobile/android/app/src/androidTest/java/org/tarae/liftgram/update/UpdateInstallerDeviceTest.java` · 디버그 빌드 · run-as로 시험 APK 심기): 받은 APK 서명자 읽기 · 실제 판정 · 세션 쓰기·취소 — API 35·30.
- **스크립트**:

  - 깨끗한 사본 두 번(빌드 → 캐시) · 더러운 사본은 캐시 안 함
  - 다른 키로 서명된 캐시 → 멈춤
  - 같은 versionCode에 `src/mobile` 바뀜 → 멈춤
  - 되돌리기 → 멈춤
  - `SKIP_APK` 되받기
- **e2e**(로컬 운영 빌드 3200/3201 · 새 DB): Phase 3·4 목록 + 기존 회귀.
- **에뮬레이터**: 출시 키 adb 업데이트 왕복(API 35·30 · Phase 2).
- **실기기**(기기가 생기면): 1.1.0 디버그 → 재설치 · 1.2.0 → 1.2.1 · PWA → 앱 「계속」 · MIUI 대체 설치.

## 위험·주의

- **출시 키 분실 = 모든 사용자 재설치.** 이 키는 앱 서명 키다. 결과 회신에서 백업 2벌을 요청한다.
- **구글 개발자 확인(2026~ 단계적 시행)**: 플레이 밖 설치도 확인된 개발자 서명을 요구하는 기기가 늘어난다. 등록은 사람의 일이고 이번 범위 밖이다. 막히면 설치 실패 코드 `blocked`로 보이고 `/app`에 안내한다.
- **플레이 정책**: `REQUEST_INSTALL_PACKAGES`는 플레이 빌드에서 빼야 한다(나중 일). 플레이 설치본은 자체 업데이트를 하지 않는다.
- **앱 링크 지문**(`ANDROID_CERT_SHA256`, 서버 `.env`): 새 지문을 **추가**한다(옛 디버그 지문은 재설치가 끝날 때까지 둠). 지문을 알려 드린다.
- 패키지 이름만으로는 우리 앱인지 보장되지 않는다. 그래서 넘기기는 S256 비밀과 확인 화면에 기댄다. `/app`에 지문을 공개한다.
- 미동기 확인은 이 기기 DB 기준이다. 다른 탭이 쓰는 중이면 쓰기 주인 대기를 거친다. 진행 중인 운동은 새 기기로 넘어가지 않는다(`dropInProgressWorkouts`). 그래서 운동 중에는 막는다.
- 설치에 성공하면 프로세스가 죽는다. 저장·flush를 먼저 하고, 다시 열리면 안내한다.
- 배포는 커밋된 HEAD만 나간다. 커밋되지 않은 `src/mobile/android/app/src/main/java/org/tarae/liftgram/lock/` 파일이 빠진 APK가 캐시에 굳지 않게, 커밋 승인 뒤 배포한다.
