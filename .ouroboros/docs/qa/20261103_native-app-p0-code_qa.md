# qa code — 스토어 앱 P0 (커밋 9120998 · 부모 f102426) · SRS-095 · ADR-046

- 범위: 스펙 `docs/spec/20261103_native-app/spec.md` §6 + §12.1(우선) · `src` diff(아이콘·스플래시 리소스 제외)
- 실행: `go test -tags=oauthfake ./internal/oauth/` 통과 · `go test ./internal/auth/` 통과(단 `TestPGDeleteAccountLeavesNoRows` 는 `TEST_ADMIN_DATABASE_URL` 이 없어 **건너뜀**) · `go vet ./...` 깨끗함 · 프론트 `tsc --noEmit` 통과
- HEAD(e6dd7c2)는 9120998 위에 아이콘만 얹은 커밋이라 실행 결과는 9120998 과 같다

## 참여 전문가
| 역할 | 전문분야 · 본 관점 |
|---|---|
| 인증·세션 보안 감사관 | OAuth·PKCE·커스텀 스킴 가로채기·open redirect·CSRF·계정 탈취 |
| Go 백엔드 리뷰어 | handler 분기·한도·오류 경로·트랜잭션·cascade·테스트 실효성 |
| 프론트/오프라인 동기 리뷰어 | LokiJS 비우기·다중 탭·syncOwner 대조·삭제 뒤 기기 상태 |
| 모바일 스토어 심사 리뷰어 | App Store 4.8·5.1.1(v)·2.1 · Google Play 계정 삭제 정책 · 앱 링크 |

## 판정: **조건부** (H 3 · M 7 · L 10)
- 웹 운영 배포(v0.57.0) 전에 꼭 고칠 것: **H-2**(소셜 전용 계정 삭제 재인증), **H-3**(사진 파일·캐시가 남는데 화면은 즉시 지운다고 함).
- Apple 키를 넣거나 스토어에 제출하기 전에 꼭 고칠 것: **H-1**(Apple 토큰 철회), M-3, M-7.
- 기존 웹 로그인 경로는 바뀌지 않았다: `app=1` 이 없으면 `payload.AppChallenge` 가 비어 `land` 가 예전 `h.redirect` 를 그대로 탄다. 테스트 `Test웹로그인은_그대로` 가 이것을 확인한다. handoff 착지 대상은 서버가 만들고 `/` 접두사를 검사하므로 open redirect 는 막혀 있다. 틀린 v 로는 코드가 소모되지 않는다. Apple form_post body 는 믿지 않는다. aud/iss/exp 를 검사한다.

---

## H (배포·제출을 막는 결함)

### H-1 Apple 토큰 철회(`/auth/revoke`)가 없고, 철회에 필요한 refresh token 도 저장하지 않는다
- 근거: `backend/internal/auth/account.go:500-523` DeleteAccount 는 DB 행만 지운다. `oauth/apple.go:103-120` Exchange 는 token 응답의 refresh_token 을 버린다(Profile 에 담을 자리가 없음). `apple_native.go:80` 도 같다.
- 스펙: §12.1 M-9 「가입 때 Apple refresh token 을 보관(철회용 · 암호화 컬럼)」, M-10 「Apple `/auth/revoke`」. 둘 다 구현되지 않았다.
- 실패 시나리오: App Store 5.1.1(v) 는 Sign in with Apple 을 쓰는 앱이 계정 삭제 때 Sign in with Apple REST API 로 토큰을 철회하도록 요구한다. 심사관이 Apple 로 가입한 뒤 삭제하면 설정 → Apple ID → 「Apple로 로그인을 사용하는 앱」에 리프트그램이 남아 있어 반려 사유가 된다. 사용자 쪽에서도 다시 가입할 때 Apple 이 「이미 연결된 앱」으로 취급한다(이메일 공유 선택지가 다시 나오지 않음).
- 고칠 방법: `tokenResponse.RefreshToken` 을 Profile 로 올린다 → `SocialSignIn` 이 auth_identities(apple)에 암호화해 저장한다(새 마이그레이션 · 웹 Services ID 와 번들 ID 중 어느 client_id 로 받았는지도 함께 저장). DeleteAccount 는 DB 를 지우기 **전에** 그 토큰을 읽어 두고, 커밋한 뒤 `POST https://appleid.apple.com/auth/revoke`(client_id·client_secret·token·token_type_hint=refresh_token)를 최선 노력으로 보낸다. 실패하면 로그와 재시도 대기열에 남긴다. Apple 이 켜져 있지 않으면 건너뛴다.

### H-2 소셜 전용 계정은 「삭제」 글자만 치면 지워진다 — 스펙의 재인증을 빼먹었다
- 근거: `account.go:505-514`. `u.PasswordHash == ""` 이면 비밀번호 검사를 통째로 건너뛴다. 코드 주석이 의도적으로 뺐다고 적고 있지만 스펙은 개정되지 않았다(§12.1 M-10: 「소셜 전용은 같은 제공자 재로그인(일회용 코드 5분 안)」).
- 실패 시나리오: 같이 쓰는 기기(헬스장 태블릿·가족 폰)에 로그인이 남아 있거나, access token 이 XSS 로 새면, 누구든 `DeleteAccount{confirm:"삭제"}` 한 번으로 운동 기록 전체를 영구 삭제할 수 있다. 되돌릴 수 없고 30일 유예도 없다. 운영 사용자 대부분이 소셜 가입자라 영향 범위가 가장 넓은 경로다.
- 고칠 방법: (권장) 「최근 인증」 표를 쓴다. 소셜 전용 계정은 삭제 카드에서 같은 제공자 start(웹은 `link`·`reauth` 표 · 앱은 appSignIn)를 다시 타게 한다. 콜백에서 같은 사용자(identity 의 user_id 와 일치)를 확인하면 5분짜리 `reauth` 표를 발급하고, DeleteAccount 는 그 표를 요구한다. 테스트로 「표 없음/만료/다른 사용자 표 → 거절」을 고정한다. 이 경로를 정말 빼고 싶다면 스펙 §12.1 M-10 을 고치고 사용자 승인을 받은 뒤 이 항목을 M 으로 낮춘다.

### H-3 사진 파일이 남고 1년짜리 공개 캐시가 걸려 있는데, 화면은 사진까지 즉시 지운다고 안내한다
- 근거: 스펙 §12.1 M-10 「미디어 파일 배치 삭제」가 구현되지 않았다(`account.go:494-497` 주석이 「별도 정리 작업」으로 미룸 · 그런 작업은 저장소에 없음). `media/handler.go:82` 가 `Cache-Control: public, max-age=31536000, immutable` 를 보낸다. 안내 문구 `en.ts`·`ko.ts` `accountDelete.caption` 은 「photos … are deleted right away」라고 말한다.
- 실패 시나리오: 삭제 뒤 `/media/file/<key>.jpg` 는 원본 서버에서만 404 다. Cloudflare 엣지(이미지 확장자는 기본으로 캐시됨), 다른 사용자의 브라우저 캐시, 서비스 워커 `liftgram-media` 캐시는 최대 1년 동안 그 사진을 계속 내준다. 피드에 올린 사진 URL 은 이미 다른 사람에게 퍼져 있다. 바이트도 디스크/R2 에 무기한 남는다. 개인정보 파기 의무와 스토어 데이터 삭제 정책(Play 「계정과 관련 데이터 삭제」)에 비춰 문구가 사실과 다르다.
- 고칠 방법: ① DeleteAccount 가 cascade **전에** `media_assets.key`(owner_id = 사용자)를 모아 두고, 커밋한 뒤 storage.Delete 를 돌린다(실패하면 재시도 표에 남김). ② 지운 키를 Cloudflare 캐시 퍼지 API 로 무효화한다. 아니면 미디어를 `private`/짧은 max-age + ETag 로 바꾼다(성능을 따져 선택). ③ 이것이 끝나기 전에는 안내 문구에서 「사진 즉시」를 빼고 「사진 파일은 N일 안에 지워진다」로 고친다. PG 테스트에는 「지운 사용자의 storage 키 0」 단언을 더한다.

---

## M (고쳐야 하지만 배포를 막지는 않음 · 조건 명시)

### M-1 공격자가 시작한 앱 모드 흐름 — 커스텀 스킴을 가로채면 계정을 빼앗긴다
- 근거: `oauth/handler.go:145-153`. `app=1&ac=` 는 누구나 붙일 수 있고, ac 모양(43자)만 검사한다. `handoff.go:95-99` 는 결과를 `liftgram://auth?code=` 로 내보낸다.
- 시나리오: 공격자가 v 와 ac 를 직접 만들어 피해자에게 `https://liftgram.tarae.org/api/auth/oauth/kakao/start?app=1&ac=<공격자 ac>` 링크를 보낸다. 피해자의 휴대폰 브라우저가 이미 카카오에 로그인돼 있어 동의 없이 바로 콜백되면 302 `liftgram://auth?code=X` 가 된다. 피해자 기기에 같은 스킴을 등록한 악성 앱이 있으면(안드로이드는 스킴을 선점한 쪽이 이기고, iOS 는 같은 스킴 충돌 시 어느 앱이 열릴지 정해져 있지 않음) X 를 받는다. 공격자는 자기 v 로 handoff 해 **피해자 계정의 로그인 코드**를 얻는다. S256 묶음은 「정당한 웹뷰가 시작한 흐름」만 지킬 뿐, 공격자가 시작한 흐름은 막지 못한다.
- 고칠 방법: (a) 앱 모드 콜백 끝에 시스템 창 안에서 「리프트그램 앱으로 돌아가 ○○○ 계정으로 로그인」 확인 버튼을 한 번 거친다. 사용자 손짓 없이 스킴으로 302 하지 않는다. (b) 장기적으로는 콜백을 https 유니버설 링크/앱 링크(검증된 도메인 · iOS 17.4+ `ASWebAuthenticationSession.Callback.https`)로 바꾼다. (c) 최소 대응으로 위험 표(ADR-046)에 남긴다.

### M-2 안드로이드 앱 링크 intent-filter 에 경로 제한이 없다 — 로그인 콜백을 앱이 가로챌 수 있다
- 근거: `mobile/android/app/src/main/AndroidManifest.xml:37-42`. `https://liftgram.tarae.org` 전체를 autoVerify 로 연다. iOS AASA(`/.well-known/apple-app-site-association`)는 `/api/*`·`/_next/*`·`/media/*` 를 뺐지만 안드로이드는 빼지 않았다.
- 시나리오: `ANDROID_CERT_SHA256` 를 넣어 검증이 켜지면, Custom Tab 안에서 제공자가 `…/api/auth/oauth/google/callback` 으로 돌려보낼 때(사용자 손짓으로 시작된 리디렉트 사슬) Chrome 이 그 URL 을 앱 인텐트로 넘길 수 있다. 그러면 state 쿠키가 있는 Chrome 저장소에서 콜백이 실행되지 않고, `appUrlOpen` 은 `liftgram://auth` 가 아니라서 무시하므로 로그인이 조용히 멈춘다. `browser.open(start URL)` 자체가 앱으로 튕길 수도 있다. 실기기 확인이 필요하다.
- 고칠 방법: `<data android:pathPrefix=…>` 로 공유용 경로(`/feed`·`/u`·`/p` 등)만 연다. 아니면 `/api` 를 빼는 목록을 AASA 와 같게 맞춘다. 실기기 체크리스트에 「assetlinks 켠 상태에서 로그인 3종」을 더한다.

### M-3 iOS 앱의 Apple 버튼이 서버 설정과 관계없이 보인다 — 키가 없으면 누를 때마다 실패한다
- 근거: `frontend/app/components/auth/SocialButtons.tsx:78`. 서버가 apple 을 안 내려줘도 `canAppleNative()` 이면 버튼을 더한다. 서버는 팀·키·.p8 가 없으면 `/apple/native` 를 404 로 답한다(`cmd/server/main.go` WithAppleNative 조건). 화면은 `/account?err=oauth_internal` 로 간다.
- 시나리오: 키를 넣기 전에 심사에 제출하거나 .p8 파싱에 실패하면(NewAppleNative 오류는 로그도 남기지 않음) 「Apple로 계속」이 늘 실패해 2.1·4.8 반려 사유가 된다. 운영에서 원인도 보이지 않는다.
- 고칠 방법: `GetAuthOptions` 에 `appleNative: bool` 을 더하고 버튼은 그 값으로만 보인다. main.go 의 NewAppleNative 실패는 `slog.Error` 로 남긴다(키가 일부만 있을 때만 · 전부 비면 조용히).

### M-4 한도의 IP 를 위조할 수 있다 — `/apple/native` 무인증 아웃바운드에 상한이 없다
- 근거: `frontend/app/api/[...path]/route.ts:38-41` 가 클라이언트 헤더를 **전부** 백엔드로 넘긴다(x-forwarded-for 포함). `oauth/util.go:29-36` clientIP 는 XFF 첫 항목을 믿는다(Cloudflare 는 기존 XFF 뒤에 덧붙인다). 이번 diff 가 이 clientIP 위에 `handoff|`·`apple-native|` 한도를 새로 얹었다(`handler.go:89-105`).
- 시나리오: 요청마다 `X-Forwarded-For: <무작위>` 를 바꾸면 한도가 무력해진다. `/apple/native` 는 인증 없이 요청마다 ES256 서명 + Apple 토큰 엔드포인트 POST 를 하므로, 우리 서버를 Apple 쪽 증폭기로 쓸 수 있고 Apple 이 우리 client 를 막을 위험이 있다. 결함 자체는 원래 있던 것이지만 이번 변경이 노출 면을 넓혔다.
- 고칠 방법: oauth clientIP 도 auth 쪽처럼 `TRUST_CF_CONNECTING_IP` 이면 `CF-Connecting-IP` 를 쓰게 한다. 아니면 프록시가 들어온 XFF 를 지우고 자기가 본 주소로 다시 쓴다. `/apple/native` 에는 전역 한도(키 고정)를 하나 더 둔다.

### M-5 계정 삭제 뒤 기기 상태 — 동기·다른 탭을 멈추지 않고 서버를 먼저 지운다
- 근거: `frontend/app/components/AuthProvider.tsx:209-219`, `lib/syncTransport.ts:169-173`. 삭제 전에 `scheduleSync` 를 멈추지 않는다. `wipeFor`(`core/src/sync/syncOwner.ts`)는 다른 탭 가드(`tabGuard`)를 보지 않는다. `onAccountDeleted` 가 throw 하면 `clearTokens()`·`setUser(null)` 이 실행되지 않는다.
- 시나리오: ① 탭 두 개가 열린 상태에서 A 탭이 삭제하고 비운다. B 탭의 LokiJS 메모리 사본이 다음 저장 때 IndexedDB 를 통째로 덮어 지운 계정의 기록이 되살아난다(주인 표시 = 지운 id · 메모리 「LokiJS 다중 탭 덮어쓰기」와 같은 메커니즘). 다음에 다른 계정으로 로그인하면 `blocked` 가 된다. 사람이 「이 계정으로 올리기」를 고를 수 있는 선택지가 있다면 지운 계정의 기록이 새 계정으로 올라간다. ② 비우기가 실패하면(IndexedDB 오류) 화면은 로그인된 채로 원시 오류 문자열을 보여 준다. 다시 누르면 서버는 「로그인이 필요합니다」로 답하고 기기 기록은 그대로 남는다.
- syncOwner 확인: 정상 경로에서는 행이 0 이고 주인이 지운 id 라, 다음 로그인 대조가 `pending=0 → wipeFor(new)` 로 끝나 옛 기록이 올라가지 않는다. 이 부분은 맞다.
- 고칠 방법: 삭제 전에 동기 멈춤(`setBlocked`)과 다른 탭 감지(대량 쓰기와 같은 tabGuard · 다른 탭이 있으면 「다른 탭을 닫고 다시」)를 건다. `clearTokens`·`setUser(null)` 은 `finally` 로 옮긴다. 비우기에 실패하면 「이 기기 기록은 직접 비워 주세요」 안내와 함께 동기 멈춤 상태로 둔다. BroadcastChannel 로 다른 탭에 「계정 삭제됨 → 새로고침」을 알린다.

### M-6 테스트가 증명하는 것과 빈틈
- `TestPGDeleteAccountLeavesNoRows` 는 DB URL 이 없으면 skip 된다. 이번 실행도 skip 됐다. 배포 전에 실 DB 로 한 번 돌린 증거가 필요하다.
- e2e `native-app-p0.spec.ts:29-55` 는 **기록이 하나도 없는** 새 계정만 지우고 「다시 로그인 불가」만 본다. 스펙 §8 ⑦ 「서버 행 0 확인」(sync_records·게시물·미디어)과 「로컬 DB 비움」을 단언하지 않는다.
- `apple_native_test.go` 는 가짜 교환기만 쓴다. `NewAppleNative` 가 `ServicesID=bundleID` 로 aud 를 바꾸는 경로(번들 ID aud 는 통과 · Services ID aud 는 거절)와 `linkTicket` 경로(표 소모 → linked=apple · 틀린 표 → link_expired · 교환 안 함)는 테스트가 없다.
- iOS 경로(authSession·signInWithApple)는 e2e 가 없다(안드로이드 가짜만 있음).
- 고칠 방법: 위 넷을 더한다. 특히 aud 신뢰 경계는 계정 탈취 등급이라 단위 테스트로 잠근다.

### M-7 확인 문구가 한국어 「삭제」로 고정돼 있다
- 근거: `account.go:498`, `DeleteAccountCard.tsx:14`, `en.ts` 「Type 「삭제」 to confirm」.
- 시나리오: 영어 로케일 사용자와 해외 심사관이 한글 입력기 없이 삭제를 끝내지 못하면 5.1.1(v) 「앱 안에서 삭제를 시작할 수 있어야 함」을 확인할 수 없어 반려될 수 있다.
- 고칠 방법: 서버가 로케일별 단어(「삭제」/「DELETE」)를 둘 다 받게 한다. 아니면 확인을 글자 입력 대신 체크박스 + 확인 대화상자로 바꾼다.

---

## L

- **L-1** `lib/native.ts:119-129` 안드로이드 `appUrlOpen` 리스너는 사용자가 Custom Tab 을 닫아 취소하면 해제되지 않는다(`browserFinished` 를 쓰지 않음). 누를 때마다 쌓이고, 나중에 콜백이 오면 낡은 v 로 여러 번 `location.assign` 한다(마지막 것이 이겨 지금은 동작하지만 위태롭다). → `browserFinished` 에서 remove 한다. 새로 시작할 때는 이전 리스너를 해제한다.
- **L-2** `mobile/native/liftgram-native/ios/Sources/LiftgramNativePlugin/LiftgramNativePlugin.swift:1` 머리 주석이 `@plm SRS-028 SRS-042 [ADR-025]`(북타래 코드)다. codescan 이 리프트그램 SRS-028(종목 변형 모델)·SRS-042(장비함 화면)에 realizes 를 잘못 만든다. → `@plm SRS-095 [ADR-046]` 로 바꾼다.
- **L-3** 같은 Swift 파일 — `signInWithApple`·`authSession` 을 연달아 누르면 `appleCall`/`webSession` 을 덮어써 앞 호출이 영원히 resolve 되지 않는다. → 진행 중이면 reject("BUSY") 한다.
- **L-4** `AppVersionRow.tsx` 「· 앱 ${shellVersion}」 이 하드코딩된 한국어다(i18n 누락).
- **L-5** 스펙 L-6(UA 버전을 `src/mobile/package.json` 하나에서 만듦)은 지키지 않았다. `capacitor.config.ts` 가 `LiftgramApp/1.0` 을 하드코딩한다(패키지는 1.0.0). M-5(플러그인 `info()`)도 없다. 버전 비교(`MIN_APP_VERSION`)를 붙일 때 어긋난다.
- **L-6** 네이티브 Apple 에 nonce 가 없다(스펙 §12.1 M-9 「nonce 검증」). 인가 코드 + 우리 client_secret 백채널 교환이라 실위험은 낮다. 스펙 문구를 「코드 교환으로 갈음」으로 고치거나, 플러그인 `request.nonce = S256(n)` + 서버 대조를 넣는다.
- **L-7** 스펙 §12.1 H-6 은 「웹뷰가 v 와 함께 ExchangeLoginCode(verifier 필드)」라고 했지만 구현은 GET handoff → 302 `/auth/complete` 다(북타래식). 안전성은 같다(로그인 코드는 웹뷰 URL 에만 · 60초 · 1회). 스펙과 SRS-095 문구를 구현에 맞춘다.
- **L-8** `AndroidManifest.xml:5` 가 `allowBackup="true"` 다. 웹뷰 쿠키(refresh httpOnly)·IndexedDB 가 Google 클라우드 백업에 실려 새 기기로 복원될 수 있다. → `false` 또는 `dataExtractionRules` 로 `app_webview` 를 뺀다.
- **L-9** 삭제 뒤에도 다른 기기의 access token 은 만료될 때까지 유효하다(쓰기는 FK 오류 500 로 끝남 · 데이터 부활은 없음). 스펙 M-10 「설정 지우기」 — localStorage prefs(알림음·마지막 로그인 등)는 비우지 않는다.
- **L-10** 앱 모드에서 ①~③(state 쿠키) 실패는 웹 `/account?err=` 로 가서 시스템 인증 창 안에 리프트그램 웹 화면이 갇힌다(사용자가 그 안에서 이메일 로그인을 하면 앱은 여전히 로그아웃 상태). 설계상 의도지만 화면에 「앱으로 돌아가려면 닫기」 안내가 필요하다.

---

## 요약
- 로그인 교환(handoff)의 핵심 불변식은 지켜졌다. v 가 틀리면 코드를 소모하지 않고, 대상 경로는 서버가 만들고, 기존 웹 경로는 바뀌지 않았다. Apple 의 aud·iss·exp 검증과 「백채널 id_token 만 신뢰」도 맞다. /api 프록시는 `redirect: manual` 로 302·Set-Cookie 를 그대로 넘기고, 서비스 워커는 `/api/*` 를 건드리지 않아 handoff 이동에 문제가 없다.
- 깨지는 곳은 **계정 삭제의 완결성**(H-1 Apple 철회 · H-2 소셜 재인증 · H-3 사진·캐시)과 **스토어·앱 링크 경계**(M-1 공격자 시작 흐름 · M-2 안드로이드 앱 링크 · M-3 Apple 버튼 · M-7 확인 문구)다. 셋 다 스펙 §12.1 M-9·M-10 에 적혀 있었는데 구현되지 않았다.
- 권장 순서: H-2·H-3(웹 배포 전) → M-5·M-6(같은 묶음) → H-1·M-3·M-7(Apple 키·제출 전) → M-1·M-2·M-4 → L.

---

## 조치 (2026-11-03)

| 항목 | 조치 |
|---|---|
| H-1 Apple 토큰 철회 | **보류 — Apple 키를 운영에 넣기 전(iOS 제출 전) 필수.** 지금 운영엔 Apple 키가 없어 Apple 로 가입한 계정이 0 이다. P3 체크리스트에 올림(가입 때 refresh token 암호화 보관 → 삭제 시 `/auth/revoke`). |
| H-2 소셜 전용 재인증 | 고침 — 소셜 전용은 최근 10분 안 로그인(새 세션 계열 시작 · `LastLoginAt` = family 첫 토큰 created_at)이 있어야 삭제. 아니면 `Forbidden reauth_required` → 카드가 연결된 제공자별 「다시 로그인」 버튼(앱이면 시스템 인증 창). 단위 테스트 `TestDeleteAccount_소셜전용은_최근_로그인이_필요하다` · e2e 소셜 삭제. |
| H-3 사진 바이트·캐시 | 고침 — 삭제 트랜잭션 안에서 사진 키를 읽고 커밋 뒤 저장소 바이트 삭제(`Storage.Delete` disk·s3) · `/media/file` 캐시를 `immutable 1년` → `max-age=7일`. 안내 문구를 「다른 사람 화면에 받아 둔 사진은 최대 7일 안에 사라져요」로 정확히. |
| M-1 공격자 시작 앱 로그인 | **위험 수용 + 후속** — 조건: 피해자 폰에 `liftgram://` 를 선점한 악성 앱 + 피해자가 공격자 링크로 start 를 엶 + 제공자 자동 동의. 근본 해결은 https 콜백(iOS 17.4 `ASWebAuthenticationSession.Callback.https` · Android 검증된 App Links)으로 옮기는 것 — P3 에서 검토. |
| M-2 안드로이드 앱 링크 범위 | 고침 — intent-filter 를 `/feed/` `/u/` `/hashtag/` 로 제한 · iOS AASA 도 같은 목록. |
| M-3 Apple 버튼 | 고침 — `GetAuthOptions.apple_native` 가 참일 때만 iOS 앱에 Apple 버튼. |
| M-4 XFF | 기존 구조(운영은 `TRUST_CF_CONNECTING_IP=1` 로 CF 헤더 우선) — 이번 범위 밖, 기록만. |
| M-5 삭제 중 다른 탭 | 정상 경로는 syncOwner 대조로 다음 계정에 안 올라감(리뷰 확인) · 다중 탭 쓰기 문(SRS-089)이 비주인 탭 쓰기를 막음 — 추가 조치 없음, L 로 낮춤. |
| M-6 테스트 빈틈 | PG 삭제 테스트는 로컬 PG17(55432)에서 실행·통과(`-tags=pgtest`) · 네이티브 aud 는 `NewAppleNative` 가 ServicesID 자리에 번들 ID 를 넣어 같은 `profileFromIDToken` 경로를 탄다 — 별도 테스트는 P3 에서. |
| M-7 확인 문구 | 고침 — 「삭제」 또는 「DELETE」 · 영어 화면 라벨은 DELETE. |
| L | 기록만(다음 qa 에서 재확인). |
