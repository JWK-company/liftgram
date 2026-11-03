# qa code 재검 — 스토어 앱 P0 지적 반영 커밋 (0b9d8c1 · 부모 e6dd7c2) · SRS-095

- 범위: `git show HEAD` 한 커밋. 이전 리뷰 `20261103_native-app-p0-code_qa.md` 의 H-2·H-3·M-2·M-3·M-7 반영 여부와, 고친 코드에 새로 생긴 결함.
- H-1(Apple 토큰 철회)은 의도적으로 미룬 항목이라 보지 않았다.
- 실행: `go test ./internal/auth/ ./internal/media/` 통과 · `go vet ./internal/auth/ ./internal/media/ ./cmd/server/` 깨끗함. PG 테스트(`-tags=pgtest`)는 이번에 돌리지 않았다(DB 없음). 대신 코드를 읽어 확인했다.

## 참여 전문가
| 역할 | 본 관점 |
|---|---|
| 인증·세션 보안 감사관 | 「최근 로그인」 판정의 근거 시각, 위조와 우회 경로(access token만 가진 공격자) |
| Go 백엔드 리뷰어 | 트랜잭션 경계, 커밋 뒤 부수효과, 저장소 Delete 안전성 |
| 웹 캐시·프론트 리뷰어 | Cache-Control 변경의 파급, SW 캐시, Apple 버튼 조건 |
| 모바일 링크 리뷰어 | Android intent-filter 와 iOS AASA 의 경로 대조 |

## 판정: **조건부** (H 1 · M 4 · L 6)

| 이전 지적 | 결과 |
|---|---|
| H-2 소셜 전용 재인증 | **부분 해결.** 창은 생겼지만 access token 만으로 넘을 수 있다(아래 H-1, M-1) |
| H-3 사진 바이트·캐시·문구 | **대체로 해결.** 키를 cascade 전에 수집하고, 바이트는 커밋 뒤에 지우며, 실패해도 삭제는 성공한다. 다만 재시도가 없다(M-2). 「최대 7일」 문구는 실제보다 짧다(M-3) |
| M-2 안드로이드 앱 링크 | **해결.** intent-filter 와 AASA 가 `/feed/` `/u/` `/hashtag/` 로 같고, 실제 공유 라우트(`app/feed/[postId]`·`u/[userId]`·`hashtag/[tag]`)와 맞는다 |
| M-3 Apple 버튼 | **미해결.** 서버 값은 내려오는데 화면이 그 값을 쓰지 않는다(아래 M-4) |
| M-7 확인 문구 | **해결.** 서버는 「삭제」와 「DELETE」를 모두 받는다. en 라벨은 DELETE 다 |

---

## H

### H-1 access token 만 가진 공격자가 「최근 로그인」을 새로 만들고 비밀번호까지 정해 삭제할 수 있다
- 근거
  - `backend/internal/auth/account.go:252-282` `ChangePassword`: 비밀번호가 없는 계정(소셜 전용)은 **현재 비밀번호를 확인하지 않고** 새 비밀번호를 정한다. 그런 다음 `RevokeAllRefreshTokens` 를 부르고, 마지막에 `s.issue` 로 **새 세션 계열**을 만든다.
  - `account.go:528-539` `DeleteAccount`: 소셜 전용 계정은 `LastLoginAt`(= `family_id = token_hash` 인 행 가운데 가장 늦은 `created_at`, `database/queries/auth.sql:151-154`)이 10분 안인지 본다.
  - `handler_account.go:140-148` 은 `UserIDFrom` 과 `guard("password")`(사람 확인·한도)만 본다. 재인증은 요구하지 않는다.
- 실패 시나리오: XSS 로 access token 이 새거나, 같이 쓰는 기기에 세션이 남아 있다고 하자. 공격자는 `ChangePassword{current:"", new:"x12345678"}` 를 한 번 보낸다. 그러면 ① 새 계열이 생겨 `LastLoginAt` 이 지금이 되고, ② 피해자의 다른 세션은 모두 끊기며, ③ 계정에 공격자가 아는 비밀번호가 생긴다. 이어서 `DeleteAccount{password:"x12345678", confirm:"DELETE"}` 를 보내면 비밀번호 경로로 바로 통과한다. H-2 가 막으려던 「새어 나간 토큰만으로 삭제」를 그대로 할 수 있다. 피해자는 다른 기기에서도 로그아웃되므로 막을 시간도 없다.
- 고칠 방법
  - (최소) `ChangePassword` 에서 `u.PasswordHash == ""`(첫 비밀번호 설정)일 때 `DeleteAccount` 와 같은 최근 로그인 검사를 거친다. 이 검사는 `requireRecentLogin(ctx, userID)` 같은 함수 하나로 묶는다. 이 함수의 단위 테스트에 「오래된 로그인 + 첫 비밀번호 설정 → Forbidden」을 넣는다.
  - (권장) 최근 로그인을 「사용자 단위 시각」이 아니라 **요청한 세션**에 묶는다. 아래 M-1 을 함께 고친다.

---

## M

### M-1 「최근 로그인」이 요청한 세션에 묶여 있지 않다. 연결 표를 쓰면 access token 만으로 새 계열을 만들 수 있다
- 근거: `LastLoginAt` 은 **그 사용자의 아무 계열**이 10분 안에 시작됐는지만 본다(`auth.sql:151-154`). access token 에는 세션 id 가 없다(`service.go:520-522` `Sign(u.ID, u.Role, AccessTTL)`). `CreateLinkTicket`(`handler_account.go:168-177`)은 access token 만 있으면 표를 준다.
- 실패 시나리오
  1. 피해자가 자기 폰에서 방금 로그인했다면, 그 뒤 10분 동안 **다른 기기에 남은 오래된 세션**이나 훔친 access token 으로도 삭제가 통과한다.
  2. 공격자가 access token 으로 연결 표를 받는다. 그 표로 **자기** 구글 계정을 피해자 계정에 연결하고(`SocialSignIn` link 분기), 그 구글로 로그인한다. 그러면 새 계열이 생겨 삭제가 통과한다. 연결 알림 메일은 가지만 피해자가 읽기 전에 끝난다.
  3. 같이 쓰는 기기에는 제공자 세션(구글 등)도 대개 살아 있다. 그래서 「다시 로그인」 버튼이 사람 입력 없이 자동으로 끝난다. 제공자 쪽에 `prompt=login`·`max_age` 를 주지 않기 때문이다.
- 고칠 방법: 재인증 표를 따로 둔다. 삭제 카드가 `reauth=1` 로 start 하면, 콜백에서 **이미 연결돼 있던** identity 의 user_id 가 같은지 확인한다. 같으면 5분짜리 일회용 `reauth` 토큰(auth_tokens · purpose=reauth)을 발급하고, `DeleteAccount`(와 첫 비밀번호 설정)는 그 토큰을 소모한다. 이 경로에서는 제공자에 `prompt=login`(구글)·`auth_type=reauthenticate`(카카오는 `prompt=login`)을 준다. 연결(`CreateLinkTicket`)도 소셜 전용 계정이면 같은 재인증을 요구한다. 이것이 크다면 최소한 access token 에 계열 id(`sid`)를 싣고, `LastLoginAt` 을 「이 세션 계열의 시작 시각」으로 바꾼다.

### M-2 사진 바이트 청소가 한 번만 시도되고, 실패하면 키가 사라진다
- 근거: `cmd/server/main.go:170-175, 243-253`. `go purgeMedia(keys)` 는 고루틴 하나로 2분 동안 돈다. 실패하면 `failed` 개수만 로그에 남고 **키는 남지 않는다.** 재시도 표도 없다. 배포·재시작 때 프로세스가 끝나면 고루틴도 함께 끝난다.
- 확인한 것(문제없음)
  - 키 수집 `ListMediaKeysByOwner` 는 같은 트랜잭션 안에서 `DeleteUser`(cascade) **전에** 돈다(`account_repo.go:173-190`). `media_assets.owner_id` 는 `ON DELETE CASCADE` 다(0006).
  - `WithUserLock` 은 `fn` 이 성공해야 `tx.Commit` 하고 그 뒤에 반환한다(`repo.go:41-58`). 그래서 `OnAccountDeleted` 는 커밋 뒤에 불린다(`account.go:549`). 바이트 삭제가 실패해도 `DeleteAccount` 는 nil 을 돌려준다(고루틴이라 오류를 받지도 않는다).
  - 디스크 `Delete` 는 `Open` 과 같은 `d.path`(빈 키·`/`·`\`·`..` 거절, `filepath.Join`)를 쓴다(`storage_disk.go:72-90`). 키는 DB 에서 오고, 서버가 만든 무작위 이름이다. 경로를 거슬러 올라갈 수 없다. 없는 파일은 성공으로 본다. S3 도 없는 키 삭제를 성공으로 답한다.
- 실패 시나리오: R2 일시 장애나 배포 재시작 중에 삭제가 겹치면 바이트가 영구히 남는다. 어느 키인지 로그에도 없어서 나중에 찾아 지울 수 없다. 개인정보 파기를 보장하지 못한다.
- 고칠 방법: 실패한 키(또는 처음부터 전부)를 `media_purge_queue(key, attempts, next_at)` 같은 표에 **삭제 트랜잭션 안에서** 넣는다. 주기 작업이 지우고, 성공하면 행을 뺀다. 최소 대응으로는 실패한 키를 `slog.Error` 로 남긴다. 저장소에는 있지만 `media_assets` 에 없는 고아 키를 훑는 정리 작업이 있으면 아래 L-1 도 함께 해결된다.

### M-3 「다른 사람 화면의 사진은 최대 7일 안에 사라진다」는 문구가 실제보다 짧다
- 근거: `media/handler.go:81-85` 가 `public, max-age=604800` 을 보낸다. SW `sw/sw.template.js:172-188` 은 네트워크에서 받은 응답에 `sw-cached-at=지금` 을 찍어 7일 동안 다시 쓴다. 오프라인이면 기한이 지나도 내준다.
- 실패 시나리오: Cloudflare 엣지가 삭제 직전에 사진을 캐시했다고 하자(엣지에서 7일 동안 신선함). 6일째에 다른 사용자의 SW 캐시가 만료되면, SW 는 엣지에서 **아직 신선한 사본**을 받아 새 `sw-cached-at` 을 찍는다. 그러면 그 기기에서 약 13일 동안 보인다. 오프라인 기기에서는 기한 없이 보인다. Cloudflare 캐시 규칙이 Edge TTL 을 따로 정해 두었다면 엣지 사본은 더 오래 남는다(규칙은 확인하지 못함).
- 고칠 방법
  - (권장) 삭제 뒤 지운 키로 Cloudflare 캐시 퍼지 API(`purge_cache` files)를 부른다. 그러면 엣지 사본은 즉시 없어지고 SW 의 재캐시 문제도 사라진다.
  - 아니면 SW 가 응답의 `Age` 를 빼서 `sw-cached-at` 을 계산한다(`Date.now() - age*1000`). 그리고 문구를 「최대 2주」로 고치거나 「곧 사라져요」처럼 기한 없이 쓴다.
- 다른 미디어 경로에 미친 영향: 없다. 이 헤더를 쓰는 곳은 `FileHandler` 하나다. `/media/file/` 와 `/api/media/file/` 가 이 핸들러를 같이 쓴다(`main.go:261-262`). 404 응답에는 캐시 헤더가 붙지 않는다. 키는 바뀌지 않는 무작위 이름이라 `immutable` 을 빼도 7일 안에는 다시 받지 않는다. 기능 회귀는 없고, 7일마다 다시 검증하는 트래픽만 조금 는다.

### M-4 (이전 M-3 미해결) iOS 앱의 Apple 버튼이 여전히 서버 `apple_native` 와 관계없이 보인다
- 근거: `frontend/app/components/auth/SocialButtons.tsx:85-88`. `useAuthOptions()` 에서 `appleNative` 를 꺼내지 않는다. `served.length && canAppleNative() && !served.includes("apple")` 이면 그대로 Apple 을 더한다. 클릭 처리(`:108-111`)도 `canAppleNative()` 만 본다. 서버·proto·로더는 고쳤지만 화면이 그 값을 쓰지 않는다. `main.go:166-168` 의 `NewAppleNative` 실패도 여전히 로그를 남기지 않는다.
- 실패 시나리오: 이전 리뷰와 같다. 키가 없거나 .p8 파싱에 실패하면 「Apple로 계속」을 누를 때마다 404 가 나고 `/account?err=oauth_internal` 로 간다. 심사 2.1·4.8 반려 사유가 된다. 커밋 메시지와 조치표는 「고침」이라고 적고 있어 다음 단계에서 놓치기 쉽다.
- 고칠 방법:
  ```ts
  const { providers: served, appleNative } = useAuthOptions();
  const nativeApple = appleNative && canAppleNative();
  const providers = served.length && nativeApple && !served.includes("apple") ? [...served, "apple"] : served;
  // onClick: if (p === "apple" && nativeApple) { ... }
  ```
  main.go 에서는 팀·키·.p8 중 일부만 있을 때 `slog.Error("Apple 네이티브 꺼짐", "err", appleNativeErr)` 을 남긴다. e2e 로 「apple_native=false → iOS 가짜 환경에서 Apple 버튼 없음」을 고정한다.

---

## L

- **L-1 업로드와 삭제가 겹치면 고아 바이트가 생긴다.** `media/service.go:104-130` 은 바이트를 먼저 `Save` 하고 나서 행을 `Create` 한다. 이 업로드는 사용자 잠금 밖에 있다. 삭제 트랜잭션이 키를 읽은 뒤 행 삽입이 끼어들면 그 행은 cascade 로 지워지지만 키는 수집되지 않는다. 사용자 행이 먼저 지워져 FK 오류가 나도 이미 저장한 바이트는 남는다. → M-2 의 고아 키 정리 작업으로 함께 덮는다. 아니면 `Create` 가 실패했을 때 `storage.Delete` 로 되돌린다.
- **L-2 iOS 앱에서 Apple 로만 가입한 계정의 재인증이 웹 경로를 탄다.** `DeleteAccountCard.tsx:36-41` 의 `reauth` 는 모든 제공자에 `startUrl → appSignIn` 을 쓴다. 웹 Apple(Services ID)이 꺼져 있으면 `/apple/start` 가 404 가 되어 삭제할 수 없다(App Store 5.1.1(v)). → `p === "apple" && appleNative && canAppleNative()` 이면 `appleNativeSignIn({ returnTo: BACK })` 을 쓴다.
- **L-3 identities 를 불러오지 못하면 안내 문구만 보이고 버튼이 0개다.** `useIdentities` 는 실패를 삼킨다(`SecurityCard.tsx:33-36`). → 비어 있으면 「다시 시도」나 로그아웃 후 재로그인을 안내한다.
- **L-4 테스트 빈틈.**
  - 가짜 저장소 `DeleteUserAccount` 가 키를 늘 nil 로 돌려준다(`account_test.go:401-407`). 그래서 「수집한 키가 훅에 그대로 간다」는 것을 증명하지 못한다(호출 횟수만 셈).
  - `LastLoginAt`·`ListMediaKeysByOwner` SQL 은 PG 테스트에서 단언하지 않는다. 회전 뒤에도 값이 바뀌지 않는지, 사진 키가 모두 나오는지 확인하지 않는다.
  - e2e 는 성공 경로만 본다. 「오래된 로그인 → 다시 로그인 버튼」은 보지 않는다.
- **L-5 시계 기준이 섞여 있다.** `created_at` 은 DB `now()` 이고, 비교는 앱 `s.now()` 로 한다. 두 시계가 어긋나면 창이 그만큼 늘거나 준다. DB 가 앞서면 창이 넓어진다. 같은 서버 compose 라 실영향은 작다. → SQL 에서 `now() - max(created_at) <= interval` 로 판정하는 편이 일관된다.
- **L-6 `/feed`·`/hashtag` 목록 화면은 앱으로 열리지 않는다**(접두사가 `/feed/` 라서). 공유 대상은 글·프로필·태그 상세라 의도와 맞는다. 기록만 해 둔다. AASA(`/feed/*` 등)와 Android(`pathPrefix="/feed/"` 등)의 목록은 같다. 로그인 콜백(`/api/auth/oauth/*`)과 handoff 는 이제 앱 링크 범위 밖이다.

---

## 요약
- 고쳐진 것: M-2(앱 링크 범위는 공유 라우트와 맞고, 로그인 콜백은 범위 밖), M-7(확인 문구 「삭제」/「DELETE」). H-3 의 핵심 불변식도 지켜졌다. 키는 cascade 전에 같은 트랜잭션에서 수집하고, 바이트는 커밋 뒤 비동기로 지우며, 실패해도 삭제는 성공한다. 디스크 Delete 는 경로 순회에 안전하다. 캐시 변경도 다른 미디어 경로를 깨지 않는다.
- 막히는 곳
  - **H-1:** 소셜 전용 계정은 `ChangePassword` 로 현재 비밀번호 없이 비밀번호를 정하면서 새 세션 계열을 받는다. 그래서 access token 만으로 재인증과 비밀번호 검사를 둘 다 넘는다.
  - **M-1:** 최근 로그인이 세션에 묶이지 않았고, 연결 표 경로로도 우회할 수 있다.
  - **M-4:** Apple 버튼은 사실상 고쳐지지 않았다.
- 권장 순서: H-1(웹 배포 전) → M-4(제출 전, 작은 수정) → M-2·M-3 → M-1(재인증 표 설계) → L.

---
## 조치 (2026-11-03 · v0.57.0 전)
- **H-1 조치**: `requireRecentLogin` 하나로 묶어 소셜 전용 계정의 첫 비밀번호 설정(ChangePassword)에도 적용 · 단위 테스트(오래된 로그인 → Forbidden) · 보안 카드가 reauth_required 를 받으면 「○○로 다시 로그인」 버튼.
- **M-4 조치**: SocialButtons 가 서버 `appleNative` 일 때만 네이티브 Apple 버튼 · 키 일부만 있는 설정 오류는 slog.Error.
- **M-2 일부**: 실패한 사진 키를 slog.Error 로 남김(재시도 표는 보류).
- **M-3 일부**: 안내 문구 「최대 2주」(Cloudflare 퍼지·SW Age 반영은 보류).
- **M-1 보류**: 세션 묶인 일회용 재인증 토큰 — iOS 제출 전 처리 후보.
- 검증: go test auth·media · make verify · e2e 55 통과(2 skip).
