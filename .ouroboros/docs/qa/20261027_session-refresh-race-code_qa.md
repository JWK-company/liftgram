# /qa code — 세션 refresh 경합 수정 (712a24c · SRS-083)

- 대상: `git show 712a24c` 중 `src/backend/internal/auth/*`, `src/database/{migrations/0018,queries/auth.sql}`, `src/frontend/{lib/session.ts,app/api/session/refresh/route.ts,app/components/AuthProvider.tsx,e2e/session-refresh-race.spec.ts}`
- 근거: spec `.ouroboros/docs/spec/20261027_session-refresh-race/spec.md`(Q1~Q5), 원인 `.ouroboros/docs/qa/20261027_declutter-p4-code_qa.md` H-1
- 패널: **인증 보안 감사관** · **Go 백엔드·DB 엔지니어** · **프론트 세션·브라우저 엔지니어**
- 실행: `go test ./internal/auth/...` 통과. 공격 시나리오는 임시 탐침 테스트(`zz_qa_probe_test.go`, fakeRepo 사용)로 재현한 뒤 지웠다. 코드는 수정하지 않았다.

## 총평

UX 목표인 응답 유실과 탭 경합 구제는 달성했다. 회전 승패를 `UPDATE … WHERE revoked_at IS NULL`의 영향 행 수로 가르는 방식도 옳다. 문제는 보안 쪽이다. **「마지막 회전이면 허용」과 「유예 재발급이 형제 토큰을 계속 만든다」가 겹쳐서, 커밋 메시지가 말하는 재사용 탐지가 대부분의 탈취 시나리오에서 작동하지 않는다.** 아울러 폐기(로그아웃·비밀번호 변경)와 유예 재발급이 원자적이지 않아 경합으로 살아남는 토큰이 생길 수 있다.

배포 전에 H-1·H-2는 꼭 고쳐야 한다. H-3은 같은 작업에서 함께 고치기를 권한다.

| 심각도 | 건수 |
|---|---|
| 치명 | 0 |
| 높음 | 3 |
| 중간 | 4 |
| 낮음 | 8 |

---

## 높음

### H-1 「계열의 마지막 회전이면 허용」 때문에 탈취 토큰과 정상 세션이 평행으로 영구 공존한다. 재사용 탐지가 사실상 무력화된다

- **위치**
  - `src/backend/internal/auth/service.go:298-310` `reuseAllowed`(`return !latest.After(*rt.RevokedAt)`)
  - `service.go:293` 유예 재발급 `issueInFamily`
  - `src/database/queries/auth.sql:49` `LatestRotationAt`
- **원리**
  - 유예 재발급은 아무것도 폐기하지 않는다. 그래서 회전된 토큰 R은 그 뒤 계열 안에서 다른 회전이 일어나기 전까지 **만료(30일)까지 언제든** 「마지막 회전」으로 남는다.
  - 재발급된 토큰은 계열 안에서 독립된 살아 있는 사슬이 된다. 이후 양쪽은 각자 **살아 있는 토큰만** 내밀기 때문에 「회전된 옛 토큰의 재사용」이 다시는 일어나지 않는다. 탐지 조건이 영원히 충족되지 않는다.
- **재현 1: 공격자가 먼저 쓴다.** 탐침 테스트로 확인했다.
  1. 피해자의 쿠키 T0를 훔친다.
  2. 공격자가 `Refresh(T0)`를 호출해 Ta를 받는다. T0는 rotated다.
  3. 10분 뒤 피해자가 `Refresh(T0)`를 호출한다. 30초는 지났지만 T0가 마지막 회전이라 허용되고 Tv를 받는다.
  4. 이후 공격자(Ta→…)와 피해자(Tv→…)가 번갈아 10회 갱신하는 동안 **탐지가 한 번도 일어나지 않았다.** 피해자는 로그아웃 신호조차 받지 않는다.
  5. 옛 코드에서는 3단계에서 피해자가 401을 받아 이상을 알아차릴 수 있었다. 이번 커밋에서 그 신호가 사라졌다.
- **재현 2: 공격자가 나중에 쓴다.**
  1. 피해자가 T0를 T1로 회전한 뒤 앱을 며칠 쓰지 않는다. T1은 쓰이지 않았다.
  2. 공격자가 백업·프록시 로그 등에서 얻은 T0로 `Refresh`를 호출한다. 마지막 회전이라 허용되고 Ta를 받는다.
  3. 피해자가 돌아와 T1로 정상 회전한다.
  4. 결과는 재현 1과 같은 평행 세션이고, 탐지는 없다.
- **탐지가 걸리는 경우**: 공격자가 피해자보다 **두 번 이상** 먼저 회전해서, 피해자가 내미는 토큰이 「마지막」이 아니게 될 때뿐이다(`TestRefreshStaleReuseRevokesFamily`가 다루는 경로). RFC 9700 §4.14.2의 전제는 「공격자와 정상 클라이언트 중 하나는 반드시 무효 토큰을 내밀게 되고, 그것으로 침해를 안다」이다. 이 설계는 그 전제를 깬다. OWASP Session Management Cheat Sheet의 「재사용이 드러나면 세션 무효화」 권고와도 어긋난다.
- **수정안**: 한 계열에 살아 있는 토큰은 **언제나 하나**로 유지한다.
  1. `refresh_tokens`에 `parent_hash`(또는 `replaced_by`)를 둔다.
  2. 유예 재발급 때 R의 **아직 쓰이지 않은 후계 토큰**을 `superseded`로 폐기하고 새 토큰을 발급한다.
  3. `superseded` 토큰이 30초 밖에서 다시 오면 재사용으로 보고 계열을 폐기한다.
  4. 이렇게 하면 재현 1에서 공격자의 Ta가 대체된다. 공격자가 Ta를 쓰는 순간 탐지되고 계열이 끊긴다. 재현 2도 같다.
  5. 탭 경합 때문에 대체된 쪽 쿠키가 브라우저에 남는 경우는 `superseded`에도 같은 30초 창을 주면 살릴 수 있다. Web Locks가 있으면 이 경우는 거의 생기지 않는다.
  6. 대안: 「마지막 회전」 조건을 「후계 토큰이 생성 뒤 한 번도 쓰이지 않았고, R의 회전으로부터 N분 이내」로 바꿔 창을 유한하게 만든다. 이 경우에도 유예 재발급 때 후계 토큰을 폐기하는 처리는 필요하다.

### H-2 회전된 토큰 하나로 살아 있는 토큰을 무제한 발급할 수 있다

- **위치**
  - `service.go:282-294` 유예 경로가 매 호출마다 `issueInFamily`를 실행한다.
  - 횟수 제한도 없고, 앞서 발급한 형제 토큰의 폐기도 없다.
- **재현**: 탐침 테스트로 확인했다.
  1. 가입한 뒤 `Refresh(T0)`로 회전한다.
  2. 같은 T0로 `Refresh`를 20번 더 호출한다.
  3. 한 계열에 **살아 있는 토큰이 21개** 생긴다.
  4. 「마지막 회전」 조건 때문에 30초 창 밖에서도 아무도 회전하지 않는 한 이 발급은 30일 동안 계속된다.
- **영향**
  - 형제 토큰마다 30일 TTL이 새로 시작된다. 행도 계속 쌓인다(저장 증폭, 고속 반복 호출 DoS).
  - 로그아웃은 계열 전체를 끊으므로 막히지만, 그 전까지 공격자가 예비 토큰을 비축할 수 있다. H-3과 결합하면 위험이 커진다.
- **수정안**: H-1과 같다(유예 재발급 때 앞선 후계 토큰을 폐기한다). 추가로 Refresh 엔드포인트에 토큰 해시 단위 속도 제한을 둔다(`internal/middleware/ratelimit.go` 재사용).

### H-3 (의심: 악용 성공률) 폐기와 유예 재발급이 원자적이지 않다. 비밀번호 변경·재설정·로그아웃 직후에 새 토큰이 살아남을 수 있다

- **위치**
  - `service.go:249-294`: `GetRefreshToken`, `LatestRotationAt`, `CreateRefreshToken`이 트랜잭션 없이 따로 실행된다. `SELECT … FOR UPDATE`도 없다.
  - `auth.sql:69` `RevokeAllRefreshTokensForUser`, `RevokeRefreshFamily`는 **그 시점에 존재하는 행만** 끊는다.
- **재현**
  1. 공격자가 유예 조건을 만족하는 토큰(H-1의 「마지막 회전」)으로 Refresh를 고속으로 반복 호출한다.
  2. 피해자가 비밀번호를 바꾼다(`account.go:269` RevokeAll).
  3. 어떤 Refresh 요청이 RevokeAll **전에** `GetRefreshToken`을 읽었다. 그때는 reason이 rotated였다. 그 요청이 RevokeAll **뒤에** `CreateRefreshToken`을 실행한다.
  4. 그 결과 reason이 NULL인 새 live 토큰이 남는다. 비밀번호를 바꿔도 공격자가 쫓겨나지 않는다.
  5. 로그아웃(`LogOut` → `RevokeRefreshFamily`)도 같은 창을 가진다.
  6. 창은 수 ms지만 공격자가 반복 호출하면 여러 번 시도할 수 있다.
  7. 정상 회전 경로(`won=true` → 발급)도 같은 경합이 있다. 다만 그 경로는 공격자가 live 토큰을 가져야 하므로 H-1이 고쳐지면 위험이 줄어든다.
- **수정안**: 다음 중 하나를 택한다.
  - **(a)** Refresh 전체를 한 트랜잭션으로 묶는다. 제시된 행을 `SELECT … FOR UPDATE`로 잠그고, 계열 폐기 여부를 확인한 뒤 INSERT한다. LogOut·RevokeAll도 같은 행 또는 계열 행을 잠근다.
  - **(b)** `refresh_families(id, user_id, revoked_at)` 테이블을 두고 INSERT를 `INSERT … SELECT … WHERE NOT EXISTS (폐기된 계열)` 한 문장으로 만든다.
  - **(c)** `users.sessions_valid_after`를 두고, Refresh가 발급 직전에 `rt.created_at`/계열 시작 시각과 비교한다. RevokeAll은 그 값만 올린다. 가장 단순하고 경합에 강하다.
  - 보안 회귀 테스트(아래 M-4)도 함께 추가한다.

---

## 중간

### M-1 백엔드 5xx를 401로 바꿔 보낸다. DB가 순간적으로 장애를 일으키면 그것이 로그아웃이 된다

- **위치**: `src/frontend/app/api/session/refresh/route.ts:57` `if (!res.ok) return 401`
- **재현**
  1. 배포 순간(새 바이너리는 떴는데 마이그레이션 전이라 `family_id` 열이 없는 상태)이나 DB 연결 고갈로 Refresh가 500을 돌려준다.
  2. route가 이를 401로 바꾼다. 600ms 뒤 재시도도 500이라 다시 401이다.
  3. `session.ts:283` `setFlag(false)`가 실행된다. 이 문서는 로그아웃 상태가 되고 깃발도 내려간다.
  4. 쿠키를 지우지 않으므로 옛 코드보다는 덜 나쁘다. 그래도 다음 문서도 `hasSession()`이 false라 복원을 시도하지 않는다. 사용자는 다시 로그인해야 한다.
- **수정안**: 백엔드 응답 코드가 `unauthenticated`일 때만 401로 보낸다. 그 밖은 503으로 보내 화면이 「다음에 다시」 경로를 타게 한다.

### M-2 (의심) Web Locks 안의 fetch에 타임아웃이 없다. 한 탭이 정체되면 모든 탭의 갱신이 멈춘다

- **위치**
  - `src/frontend/lib/session.ts:253-262` `withRefreshLock`(`locks.request` 사용, `signal`/`ifAvailable` 없음)
  - `refreshRequest`에 `AbortSignal.timeout` 없음
  - route.ts의 백엔드 fetch에도 타임아웃 없음
- **재현**
  1. 모바일 네트워크가 반쯤 끊겨 탭 A의 `/api/session/refresh` 요청이 응답 없이 수십 초 매달린다.
  2. 그동안 탭 B, C의 `refreshOnce`는 잠금을 기다린다. 화면은 「불러오는 중」에 머문다.
  3. 백그라운드 탭이 얼거나 숨겨진 상태에서 잠금을 쥐면 증상이 더 길어질 수 있다.
- **수정안**
  - `refreshRequest`에 `AbortSignal.timeout(10_000)`을 건다.
  - `locks.request`에 `{ signal: AbortSignal.timeout(15_000) }`을 주고, 타임아웃되면 잠금 없이 실행한다(서버 유예가 받쳐 준다).
  - route.ts의 백엔드 fetch에도 타임아웃을 건다.

### M-3 공유 깃발(localStorage)을 한 탭이 내리면 살아 있는 다른 탭의 세션도 다음 문서에서 복원되지 않는다

- **위치**: `session.ts:283` `setFlag(false)`. `restoreSession`(`session.ts:310`)이 깃발이 없으면 갱신을 시도하지 않는다.
- **재현**
  1. 탭 A가 M-1 같은 이유로 두 번 401을 받는다. 깃발이 지워진다.
  2. 탭 B는 메모리의 access와 유효한 쿠키로 정상 동작 중이다.
  3. 탭 B를 새로고침하면 `hasSession()`이 false라 복원하지 않는다. 로그아웃 상태로 보인다(쿠키는 살아 있다).
  4. 옛 코드도 같은 증상이었다(그때는 쿠키까지 지웠다). 다만 이번 수정의 목표가 「탭 간 로그아웃 전파 차단」이므로 남은 구멍으로 기록한다.
- **수정안**: 다음 중 하나를 택한다.
  - 깃발을 내리기 직전에 잠금 안에서 한 번 더 확인한다(다른 탭이 방금 성공했으면 내리지 않는다).
  - 성공한 탭이 `storage` 이벤트나 BroadcastChannel로 「갱신 성공」을 알리고, 그러면 깃발을 복구한다.

### M-4 테스트 공백: 보안 회귀 테스트와 실 DB 테스트가 없고, e2e가 프론트 변경을 검증하지 않는다

- **Go 테스트**
  - 5건 모두 fakeRepo로 돈다. **실 Postgres로 SQL을 검증하는 테스트가 없다.** `RotateRefreshToken :execrows`, `LatestRotationAt`의 NULL 처리, `COALESCE` 덮어쓰기, `GetRefreshToken`의 DB `now()` 만료가 모두 미검증이다. fakeRepo가 SQL 의미를 손으로 흉내 내므로 둘이 어긋나도 테스트는 통과한다.
  - 다음 보안 회귀 테스트가 **없다**.
    - 공격자가 먼저 쓰고 피해자가 나중에 오는 경우(H-1). 현재 코드에서는 테스트가 실패해야 정상이다.
    - 유예 재발급 횟수 제한·형제 토큰 수(H-2).
    - 재사용 탐지 뒤 「마지막 회전」 토큰을 다시 내밀면 계속 401인지.
    - `ChangePassword` 경로(재설정만 테스트됨).
    - 동시성 테스트(`-race`, goroutine으로 Refresh와 RevokeAll 경합).
  - 「유예 밖 재사용이면 계열 전체 폐기」(`TestRefreshStaleReuseRevokesFamily`)와 「로그아웃 뒤 유예 불가」(`TestLogOutClosesGraceAndSiblings`)는 있다. 이 둘은 유효하다.
- **e2e 테스트**
  - ①은 `page.evaluate`에서 `fetch`를 직접 두 번 보낸다. **`withRefreshLock`과 600ms 재시도를 거치지 않으므로 서버 유예만 검증한다.** 프론트의 Web Locks와 재시도 코드를 지워도 통과한다.
  - ②는 서버의 「마지막 회전」 규칙과 「401에서 쿠키 유지」 동작에 걸려 있다. 게이트로서 유효하다.
  - ③ 「탭 둘」은 커밋 주석이 스스로 비결정적이라고 밝힌다. **옛 코드에서도 통과한다는 것은 이 테스트가 경합을 재현하지 못한다는 뜻이다. 회귀를 막지 못하고 스모크 수준이다.**
  - 실제로 탭 둘에서 Web Locks를 검증하려면 다음 중 하나가 필요하다: route에 지연을 주입(`page.route`로 첫 응답을 2초 붙잡기)한 상태에서 두 페이지가 동시에 `restoreSession`을 실행하고, 서버로 간 refresh 요청이 **직렬로** 도착했는지 확인한다. 또는 두 요청이 서로 다른 쿠키를 들고 왔는지 확인한다.
- **수정안**: 위 테스트를 추가한다. pg 통합 테스트는 compose의 db나 `DATABASE_URL`이 있을 때만 도는 build tag로 둔다.

---

## 낮음

- **L-1** `auth.sql:49`, `repo.go:131` `LatestRotationAt`
  - 해당 계열에 rotated 행이 없으면 `max()`가 NULL이고, 이것이 zero time이 되어 `!zero.After(x)`가 **허용**으로 판정된다.
  - 이런 상황은 계열 id가 비어 있는 행에서 생긴다: 0018 뒤 옛 바이너리로 롤백했을 때 만들어진 `family_id` NULL 행에서 서비스가 `family=hash`로 대체하는 경우다.
  - 지금은 우연히 허용 쪽이라 UX에는 안전하지만 의도가 코드에 드러나지 않는다. `Valid=false`를 명시적으로 처리하라.
- **L-2** 시계가 섞여 있다.
  - 회전·계열 폐기·유예 판단은 앱 시계 `s.now()`를 쓴다. 만료(`GetRefreshToken expires_at > now()`)와 `RevokeAll`은 DB `now()`를 쓴다.
  - 유예 판단 자체는 같은 앱 시계끼리 비교하므로 일관된다. 그러나 api 인스턴스가 여러 대가 되면 인스턴스 간 시차가 30초 창을 흔든다.
  - 수정안: 유예 판단을 SQL(`now() - revoked_at <= interval '30 seconds'`)로 옮기거나, 모든 시각을 DB 기준으로 통일한다.
- **L-3** `RevokeAllRefreshTokensForUser`에서 `WHERE revoked_at IS NULL`이 빠졌다.
  - 그래서 사용자의 **모든 역사 행**(15분마다 회전, 30일 보존이면 기기당 최대 수천 행)을 매번 UPDATE한다.
  - `DeleteExpiredRefreshTokens`가 실제로 주기 실행되는지 확인이 필요하다.
  - 수정안: `WHERE user_id=$1 AND (revoked_at IS NULL OR revoke_reason='rotated')`. 유예 대상만 덮어쓰면 된다.
- **L-4** 마이그레이션 0018
  - 기존 행을 백필하므로 배포 순간 기존 세션이 로그아웃되지는 않는다. live 행은 `family=자기 해시`, revoked 행은 `legacy`가 되어 유예 없이 401이고 기존과 같다.
  - 다만 `family_id NOT NULL`·`revoke_reason CHECK(...)` 제약이 없어 잘못된 값이 들어갈 수 있다.
  - down 마이그레이션은 없다(저장소 규약). 열이 추가될 뿐이라 옛 바이너리로 롤백해도 동작한다. 단 롤백 기간에 회전된 행은 reason이 NULL이어서 재전환 뒤 유예를 받지 못한다(무해).
  - 0017(opengym 예약)은 `migrate.go`가 **파일명 집합** 기준으로 적용하므로 나중에 들어와도 적용된다(0015도 이미 비어 있다). 단 0017이 `refresh_tokens`를 건드리면 운영(0018→0017 순서)과 sqlc 스키마(0017→0018 순서)의 적용 순서가 달라진다. opengym에 확인이 필요하다.
- **L-5** 재사용 탐지 기록이 부실하다(`service.go:286-290`).
  - `slog.Warn`에 user만 남고 family·IP·UA가 없다. 사용자 알림(메일)도 없다.
  - 침해 대응에 쓸 근거가 부족하다. PasswordChanged 템플릿처럼 「다른 곳에서 세션 재사용이 감지되어 로그아웃했습니다」 메일을 권한다.
- **L-6** 스펙 리스크 표(`spec.md` 「401에서 쿠키를 안 지워 죽은 쿠키가 남음 → 두 번째 401에서 DELETE로 정리」)가 Q2 결정(DELETE 부르지 않음)과 모순된다.
  - 실제 구현은 Q2를 따른다. 그 결과 죽은 쿠키는 max-age(30일)까지 남는다. 다만 깃발이 내려가 `restoreSession`·인터셉터가 `hasSession()`에서 막히므로 **무한 재시도나 깜빡임은 없다.** 문서만 정정하면 된다.
- **L-7** Web Locks 미지원 환경
  - Safari 15.4 미만(iOS 15.3 이하), 구형 Samsung Internet, **비보안 컨텍스트**(http LAN 주소로 폰 테스트할 때)에서는 `navigator.locks`가 undefined다. 이때 `withRefreshLock`이 잠금 없이 실행하는 폴백은 올바르다. 서버 유예가 받쳐 준다.
  - 단 H-1·H-2를 고쳐 형제 토큰을 줄이면 잠금이 없는 환경의 경합 구제는 「superseded 30초 창」에 의존하게 된다. 그 창을 반드시 함께 두어야 한다.
- **L-8** 그 밖
  - `setTokens`(`session.ts:100-116`)는 `/api/session` POST가 실패해도 resolve한다. 그래서 signUp·logIn의 `await`는 「요청이 끝났다」만 보장하고 「쿠키가 구워졌다」는 보장하지 않는다. 응답 상태를 확인해 실패를 로그로 남기기를 권한다.
  - 같은 함수가 refresh 원문을 JS로 다룬다(가입·로그인 응답 → `/api/session`). 기존 설계이며 이번 범위 밖이지만, HttpOnly 이점이 이 순간에는 없다.

---

## 확인했고 문제없는 것

- 토큰은 SHA-256 해시만 저장한다(`service.go:413`). 원문은 DB에 없다.
- 회전 승패는 조건부 UPDATE와 영향 행 수로 가린다. 동시 갱신 둘 중 하나만 `won`이고, 진 쪽은 다시 읽어 유예 규칙을 탄다.
- 로그아웃은 계열 전체를 폐기하고 다른 기기의 계열은 건드리지 않는다. `RevokeAll`은 rotated 사유를 `all`로 덮어써 유예를 닫는다(경합은 H-3 참고).
- 계정 삭제·관리자 정지 기능은 현재 없다(`users` ON DELETE CASCADE만 있다). **나중에 정지 기능을 넣으면** `RevokeAll`과 함께 Refresh에서 `GetUserByID` 뒤 상태를 검사해야 한다. 지금 Refresh는 사용자 상태를 보지 않는다.
- 서비스워커(`public/sw.js:94-98`)는 GET이 아니거나 `/api/*`이면 손대지 않는다. refresh POST와 상호작용하지 않는다.
- refresh route는 Set-Cookie를 하나만 내보내고 미들웨어나 SSR 갱신 경로가 없다. 순서 문제는 없다. `fetch`는 응답 헤더를 처리할 때 쿠키를 반영하므로, 잠금을 풀기 전에 새 쿠키가 저장되어 있다.
- 401에서 쿠키를 유지해도 무한 재시도는 없다. 인터셉터(`session.ts:193,200`)와 `restoreSession`이 깃발로 막는다.

---

## 조치 (2026-10-27 — 미배포, main 독립 재검토 대기)

| 항목 | 조치 |
|---|---|
| H-1 | **수정** — 「마지막 회전이면 허용」 폐기, 「미사용 후계」 규칙(0019 `parent_hash`, `superseded` 사유). 공격자 먼저·나중 모두 계열 폐기로 탐지(`TestRefreshAttackerFirstIsDetected`·`TestRefreshAttackerLaterIsDetected`, 수정 전 실패 확인) |
| H-2 | **수정** — 유예 재발급은 이전 후계를 대체해 계열당 살아 있는 토큰 1개(`TestRefreshReplayKeepsOneLiveToken`·`TestPGConcurrentSameTokenKeepsOneLive`, 수정 전 실패 확인). 토큰 해시 단위 속도 제한은 **보류** — 살아 있는 토큰이 늘지 않아 저장 증폭이 없고, 기존 인증 속도 제한(AUTH_RATE_LIMIT)이 IP 단위로 걸린다 |
| H-3 | **수정** — `WithUserLock`(트랜잭션 + `pg_advisory_xact_lock`)으로 Refresh·LogOut·RevokeAll 직렬화. 실 DB 갱신 폭주 중 전체 폐기·로그아웃 뒤 살아 있는 토큰 0(잠금을 끄면 5~8개 살아남아 실패하는 것 확인) |
| M-1 | **수정** — 라우트: 백엔드 401 만 401, 나머지 503 |
| M-2 | **수정** — 갱신 요청 10초·백엔드 호출 8초 한도, 잠금 대기 15초 초과 시 잠금 없이 실행 |
| M-3 | **수정** — 다른 탭이 10초 안에 성공했으면 깃발 유지(`liftgram.session.okAt`) |
| M-4 | **수정** — Go 보안 회귀 5건·실 DB 4건(`-tags pgtest`), e2e ① 재시도 경로·③ Web Locks 직렬(잠금·재시도를 끈 빌드에서 ①③ 실패 확인) |
| L-1 | **해소** — `LatestRotationAt` 판단을 쓰지 않는다(쿼리·pgRepo 함수는 보존) |
| L-2 | **보류** — 유예 판단은 앱 시계끼리 비교(`revoked_at` 도 앱 시계로 기록)라 일관된다. api 다중 인스턴스가 생기면 SQL 쪽으로 옮긴다 |
| L-3 | **수정** — 전체 폐기는 살아 있는 것·rotated·superseded 만 |
| L-4 | **보류** — 제약 추가는 기존 `legacy`·NULL 행과 섞여 마이그레이션 위험이 커서 미룬다. 0017(opengym)은 refresh_tokens 를 건드리지 않음을 확인할 것(main) |
| L-5 | **일부 수정** — 탐지 로그에 계열 해시 앞 12자. 사용자 알림 메일은 보류(템플릿·문구 결정 필요) |
| L-6 | **수정** — 스펙 리스크 표 정정 |
| L-7 | **유지** — 미지원 브라우저는 잠금 없이 실행, superseded 30초 창이 받친다 |
| L-8 | **일부 수정** — `setTokens` 가 쿠키 저장 실패를 경고로 남긴다. 원문 refresh 를 JS 로 다루는 기존 설계는 범위 밖 |
