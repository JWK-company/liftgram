# /qa code 재검토 — 세션 refresh 경합·재사용 탐지 (712a24c..b0175d7 · SRS-083)

- 대상: `git diff 712a24c b0175d7 -- src`, 최종 상태 `src/backend/internal/auth/`, `src/database/migrations/0018*`·`0019*`, `src/database/queries/auth.sql`, `src/frontend/lib/session.ts`, `src/frontend/app/api/session/refresh/route.ts`
- 근거: 앞선 검토 `.ouroboros/docs/qa/20261027_session-refresh-race-code_qa.md`(H-1~H-3), spec `.ouroboros/docs/spec/20261027_session-refresh-race/spec.md`
- 패널: **인증 보안 감사관** · **Go/PostgreSQL 동시성 엔지니어**
- 코드는 수정하지 않았다. 공격 시나리오는 임시 탐침 `internal/auth/zz_recheck_probe_test.go`(`pgtest`, 실 Postgres, 서비스 시계 주입)로 재현했고, 확인한 뒤 지웠다.

## 실행 결과

| 명령 | 결과 |
|---|---|
| `go test -race -count=1 ./internal/auth/...` | 통과 |
| `TEST_ADMIN_DATABASE_URL=… go test -tags pgtest -race -count=1 ./internal/auth/...` (일회용 컨테이너 `pgvector/pgvector:pg18` :55439, 5434 dev DB는 쓰지 않음) | 통과. PG 4건(`TestPGConcurrentSameTokenKeepsOneLive`, `…RevokeAllDuringRefreshStorm…`, `…LogOutDuringRefreshStorm…`, `…ReuseDetectionAndExpiry`)이 실제로 실행됐다(skip 아님) |
| 임시 탐침 6건(실 DB) | 아래 표 |
| e2e(`session-refresh-race.spec.ts`) | 실행하지 않음 |

| 탐침 | 관찰 |
|---|---|
| 공격자 먼저: T0→Ta, 10분 뒤 피해자 T0, 5분 뒤 공격자 Ta | 피해자 성공(Ta 대체) → **공격자 Ta 401, 계열 폐기(live 0)** → 피해자 Tv도 401 |
| 공격자 두 단계 앞서기: T0→Ta→Ta2, 피해자 T0 | **피해자 T0에서 즉시 탐지**, 계열 폐기 |
| 오래된 rotated 재사용: T0→T1(피해자 잠수), 29일 뒤 T0를 20번 | **20/20 성공, 살아 있는 토큰은 늘 1개**. 피해자가 T1로 돌아오면 탐지, 계열 폐기 |
| superseded 핑퐁: 두 보유자가 20초 간격으로 번갈아 superseded 토큰 제시 | **50/50 성공(17분 동안 탐지 없음)**, live 1 |
| 쿠키 순서 역전: 같은 R로 두 요청(S1 회전, S2가 S1 대체), 브라우저에 S1이 남은 채 15분 | **401, 계열 폐기 — 정상 사용자 로그아웃** |
| 폭주: 재사용 탐지된 토큰으로 64 고루틴이 1초간 Refresh(768회), 그 사이 다른 사용자 갱신 | 다른 사용자 최악 75ms. 풀(11)이 고갈되지는 않았다 |

---

## 1. 앞선 높음 3건

### H-1 (평행 세션) — **해소**

- 「미사용 후계」 규칙(`service.go:379-406`)과 「계열당 live 1개」로, 공격자와 피해자 중 한쪽은 반드시 무효 토큰을 내밀게 된다.
- 공격자 먼저: 피해자가 T0를 내밀면 Ta가 superseded로 대체된다. 공격자가 Ta를 30초 밖에서 쓰는 순간 탐지된다. 공격자가 한 번 더 회전해 두면, 피해자의 T0가 후계 불일치(`live.ParentHash != T0`)로 즉시 탐지된다.
- 공격자 나중: 피해자의 미사용 T1이 대체된다. 피해자가 돌아와 T1을 내미는 순간 탐지된다(30초 안이면 피해자가 구제된다. 그 뒤 공격자가 다시 쓰면 탐지된다).
- 남은 틈 두 가지는 아래 N-1(rotated 유예에 시간 상한 없음)과 N-3(superseded 핑퐁)에 적었다. 둘 다 탐지 자체를 영구히 막지는 못한다.

### H-2 (회전된 토큰 하나로 live 무제한 발급) — **해소(행 증가는 남음)**

- 같은 R을 반복하면 매번 앞선 후계를 대체한다. 실 DB 탐침에서 20회 반복 뒤에도 live는 1개였다.
- 행(superseded)은 호출마다 1행씩 쌓인다. 토큰 단위 속도 제한은 여전히 없다(N-5).

### H-3 (폐기와 재발급의 비원자성) — **해소**

- Refresh(`service.go:356`), LogOut(`service.go:456`), RevokeAll(`account_repo.go:72-78`)이 모두 `WithUserLock`(`repo.go:41-58`, `pg_advisory_xact_lock(hashtextextended('refresh:'||user_id,0))`) 트랜잭션 안에서 판단하고 쓴다. 잠금 안에서 토큰을 다시 읽는다(`service.go:357`). peek(`:342`)은 사용자를 찾는 데만 쓴다.
- 갱신 뒤 폐기: 같은 계열의 새 행까지 폐기된다(`RevokeRefreshFamily`, user 단위 `RevokeAll`). 폐기 뒤 갱신: reason이 logout·all이라 `default`로 거절된다. 실 DB 폭주 테스트 2건이 이를 확인한다.
- ResetPassword(`account.go:232`)와 ChangePassword(`account.go:269`) 모두 잠금 경로를 탄다(`NewAccountRepo`가 pool을 가진 같은 pgRepo를 돌려준다).
- 잠금
  - 트랜잭션 잠금이라 commit·rollback에서 풀린다. ctx가 취소되면 pgx가 rollback에 실패한 연결을 닫으므로 세션 종료와 함께 풀린다.
  - 한 트랜잭션이 잠금 하나만 잡고 중첩은 거부된다(`repo.go:42`). 그래서 advisory 잠금끼리 데드락이 생길 수 없다.
  - refresh_tokens 행 잠금도 같은 사용자 잠금 뒤에서만 잡는다. 따라서 행 잠금 순서 데드락도 생기지 않는다.
  - 다른 advisory 키 사용처는 없다. 64비트 해시라 충돌해도 다른 사용자와 잠깐 줄을 서는 정도다.
- 트랜잭션 밖에서 refresh 토큰을 쓰는 곳은 새 로그인·가입·비밀번호 변경 뒤의 `issue`(새 계열)와 `DeleteExpiredRefreshTokens`뿐이다. 둘 다 경합 위험이 없다.

---

## 2. 새 결함

| 심각도 | 건수 |
|---|---|
| 치명 | 0 |
| 높음 | 0 |
| 중간 | 2 |
| 낮음 | 5 |

### N-1 (중간) rotated 토큰 유예에 시간 상한이 없다. 오래된 토큰 한 장으로, 피해자가 돌아올 때까지 세션을 얻는다

- **위치**: `src/backend/internal/auth/service.go:387`(`want := hash`), `:395`. 시간 조건은 superseded 쪽(`:391`)에만 있다.
- **재현**: 탐침 「오래된 rotated 재사용」. T0→T1을 만든 뒤 피해자가 잠수한다. 29일 뒤 T0로 20번 갱신하면 20번 모두 성공한다. 피해자가 T1로 돌아와야 비로소 탐지된다.
- **영향**
  - 회전이 끝난 옛 토큰은 원래 가치가 없어야 한다. 그런데 후계가 쓰이지 않는 한 30일(T1 만료)까지 유효하다.
  - 탐지는 결국 일어나므로 RFC 9700의 성질은 지켜진다. 다만 잠수한 기기(앱을 닫아 둔 폰)라면 피해 창이 수 주가 될 수 있다.
  - 공격자는 같은 R만 계속 내밀면 되고 자기 토큰을 회전할 필요가 없다. 그래서 공격자 쪽에서는 무효 토큰을 내밀 일이 생기지 않는다.
- **수정안**: rotated R의 구제에 상한을 둔다. 예: `now - R.revoked_at <= N분`(N=10~60). 응답 유실 구제는 대부분 「앱을 닫았다 다시 연다」 수 분 안에 일어난다. 그 밖은 재사용으로 본다. 앞선 검토 H-1 수정안 6의 대안과 같다. 상한을 넘으면 계열을 끊을지, 조용히 거절만 할지도 정한다(끊는 쪽이 RFC에 맞다).

### N-2 (중간) 같은 쿠키로 동시 요청이 나가고 응답 순서가 뒤집히면, 15분 뒤 정상 사용자가 계열 폐기로 로그아웃된다

- **위치**
  - `service.go:388-393`: superseded 유예는 30초뿐이다.
  - `src/frontend/lib/session.ts:284`: Web Locks가 없으면 그냥 실행한다.
  - `session.ts:290`: 잠금을 15초 기다린 뒤 잠금 없이 실행한다.
- **재현**: 탐침 「쿠키 순서 역전」.
  1. 탭 A와 B가 R을 들고 동시에 갱신한다. Web Locks가 없는 브라우저이거나, 얼어 있는 탭이 잠금을 쥐고 있어 15초 폴백이 일어난 경우다.
  2. 서버는 advisory 잠금으로 줄을 세운다. A가 회전해 S1을 받고, B는 S1을 대체해 S2를 받는다.
  3. route.ts는 Refresh 뒤에 Me를 한 번 더 부르고 나서 응답한다(`route.ts:73`). Me 지연 편차 때문에 **S1 응답이 S2 응답보다 늦게 도착할 수 있다.** 그러면 쿠키에 superseded S1이 남는다.
  4. 다음 갱신은 access TTL 15분 뒤라 30초 유예 밖이다. 재사용으로 판정되어 **계열 전체가 폐기된다.** 탐침에서 401과 live 0을 확인했다.
- **영향**
  - V2(형제 모두 생존)보다는 퇴보다. V1(둘 다 즉사)보다는 낫다.
  - 빈도는 낮다(Web Locks가 없거나 폴백이 일어나야 하고, 응답 순서도 역전돼야 한다). 하지만 일어나면 사용자에게 「이유 없는 로그아웃」으로 보이고, 서버 로그에는 「재사용 탐지」로 남는다. 침해 지표에 오탐이 섞인다.
  - superseded 유예를 늘리면 N-3의 핑퐁 창이 커진다. 서버 쪽만 고쳐서는 맞바꿈이 된다.
- **수정안**: 다음을 함께 쓰는 것을 권한다.
  - **(a) 프론트**: 잠금 없이 실행할 때(`:284`, `:290`) BroadcastChannel이나 localStorage로 「갱신 중」 표시를 두고 짧은 지연·지터를 준다. 동시 발사 확률을 낮춘다.
  - **(b) route.ts**: Set-Cookie를 Me 호출 **전에** 확정할 수는 없다(한 응답이다). 대신 Me를 먼저 끝낼 필요가 없게 바꾼다. Me를 빼고 Refresh 응답의 user만 쓰면 Refresh와 응답 사이 간격이 줄어 역전 확률이 낮아진다.
  - **(c) 서버**: superseded X가 30초 밖에서 왔을 때, live가 X의 형제이고 **그 형제가 한 번도 회전되지 않았으며 생성 뒤 N분 이내**라면 계열을 끊지 말고 「조용히 401」만 준다(폐기 대신 거절). 401을 받은 화면은 600ms 뒤 재시도한다. 그러나 쿠키가 여전히 S1이라 구제되지는 않는다. 오탐 폐기만 막고 로그아웃은 남는다. 완전한 구제는 (a)·(b)로 확률을 낮추는 길뿐이다.
  - 최소한 탐지 로그에 「superseded 유예 밖」과 「rotated 후계 불일치」를 구분해 남겨 운영에서 오탐 비율을 볼 수 있게 한다(`service.go:422`).

### N-3 (낮음) superseded 유예 재발급이 다시 superseded를 만든다. 두 보유자가 30초 안에 번갈아 쓰면 탐지 없이 계속 이어진다

- **위치**: `service.go:388-406`. 대체된 live가 새 superseded가 되고, 그 토큰의 30초 창이 새로 시작된다.
- **재현**: 탐침 「superseded 핑퐁」. 20초 간격으로 50회 번갈아 제시했고 50번 모두 성공했다. 17분 동안 탐지가 없었다.
- **평가**
  - 연쇄 조건은 「어느 쪽도 자기 live 토큰을 정상 회전하지 않는다」이다. 한쪽이 live를 회전하면 상대의 superseded 토큰이 후계 불일치로 즉시 탐지된다.
  - 그래서 공격자는 피해자의 사용 주기에 맞춰 30초 안에 계속 응수해야 한다. 피해자가 30초 넘게 쉬었다가 다음 요청을 보내는 순간 탐지된다. live는 늘 1개다.
  - 실제 악용 가치는 낮지만 「유예 안 재사용이 연쇄된다」는 점은 확인됐다.
- **수정안**: 유예 재발급 토큰에 「유예로 만들어졌음」(예: `revoke_reason` 대신 `grace_from` 열, 또는 parent 체인 깊이)을 표시한다. 같은 부모 아래 superseded 대체가 K회(예: 3)를 넘으면 계열을 끊는다. 또는 superseded 유예 창을 「부모 R의 회전 시각」 기준 30초로 고정해, 연쇄가 창을 연장하지 못하게 한다(`now - parent.revoked_at <= 30s`).

### N-4 (낮음) 클라이언트 타임아웃(10초)이 route의 최악 소요(Refresh 8초 + Me 8초)보다 짧다

- **위치**: `session.ts:251` `REFRESH_TIMEOUT_MS = 10_000`, `route.ts:20`(`UPSTREAM_TIMEOUT_MS = 8_000`), `route.ts:48`, `route.ts:77`
- **재현**
  1. Refresh가 2초 걸려 서버에서 회전이 커밋된다.
  2. Me가 매달린다. 클라이언트가 10초에 abort한다. 새 쿠키를 담은 응답은 도착하지 않는다.
  3. 다음 시도는 R로 간다. rotated R의 미사용 후계 규칙으로 구제된다(세션 유실 없음, superseded 행 1개 증가).
- **영향**: 로그아웃은 없다. 다만 회전마다 낭비가 생기고, 화면은 「다음에 다시」 경로로 간다. N-1에 시간 상한을 넣으면 이 구제가 그 상한 안에서만 돼야 하므로 함께 맞춘다.
- **수정안**: Me의 한도를 줄인다(예: 2초. 실패해도 화면이 Me를 부른다). 또는 클라이언트 한도를 route 최악보다 크게 잡는다(예: Refresh 6초 + Me 2초 < 클라이언트 10초).

### N-5 (낮음) Refresh에 토큰·사용자 단위 속도 제한이 없다. 폐기된 토큰도 peek을 통과해 매번 트랜잭션과 연결을 쓴다

- **위치**
  - `service.go:342`: `GetRefreshToken`은 폐기된 토큰도 돌려준다. 만료만 거른다.
  - `handler.go:57`: Refresh에는 `h.guard`가 없다.
- **재현**: 탐침 「폭주」. 재사용 탐지된 토큰 하나로 64 고루틴이 1초에 768회 호출했다. 호출마다 BEGIN, 잠금, `RevokeRefreshFamily`(계열 전 행 UPDATE), COMMIT이 실행됐다. 다른 사용자의 최악 지연은 75ms였다.
- **영향**
  - 계열 행 수와 함께 쓰기 증폭이 커진다. N-3과 H-2 잔여분으로 superseded 행도 쌓인다.
  - MaxConns 10에서 같은 사용자 잠금을 기다리는 연결이 풀을 점유할 수 있다. 지금 측정에서는 고갈되지 않았다.
- **수정안**
  - `AuthLimiter`로 Refresh에 `guard("refresh", …)`를 건다. 키는 IP 대신 토큰 해시 앞자리(또는 user_id)로 한다.
  - 재사용 판정에서 이미 reason이 `reuse`·`logout`·`all`인 토큰은 잠금 전에 바로 거절한다. peek 결과만으로 판단해도 안전하다. 폐기는 되돌아가지 않으므로 경합이 없다.

### N-6 (낮음 · 기존 · 확인 필요) refresh route가 클라이언트 IP를 넘기지 않는다. 전역 요청 제한이 모든 사용자의 갱신을 한 버킷(`read:unknown`)으로 센다

- **위치**: `route.ts:43-49`(헤더는 content-type뿐), `internal/middleware/ratelimit.go:110-118`(`clientIP`가 없으면 `"unknown"`), `compose.yaml:69` `RATE_LIMIT` 기본 120/분
- **영향**: 운영 동시 사용자가 늘면 Refresh가 429를 받는다. 이번 변경으로 429가 503으로 바뀌어 로그아웃은 되지 않는다(개선). 다만 갱신이 실패해 화면이 「다음에 다시」에 머문다. 이번 diff가 만든 문제는 아니다. `[...path]` 프록시도 같은지 별도로 확인이 필요하다.
- **수정안**: route에서 `x-forwarded-for`(CF는 `cf-connecting-ip`)를 백엔드로 넘긴다. 백엔드는 신뢰 프록시에서 온 값만 쓴다.

### N-7 (낮음) 배포 중 옛 바이너리가 만든 토큰은 family_id가 NULL이라, 계열 폐기 대상에서 자기 자신이 빠진다

- **위치**
  - `0018`의 백필은 마이그레이션 시점의 행만 채운다.
  - 배포 스크립트는 migrate 다음 backend 순서이고(`src/scripts/deploy-h2500-3.sh:94-97`), 그 사이 옛 backend는 family_id 없이 INSERT한다.
  - `RevokeRefreshFamily`는 `WHERE family_id = $1`이다.
- **영향**
  - 그런 토큰 R(family NULL)을 새 코드가 회전하면 family=hash(R)로 이어진다. 계열 폐기는 후계만 끊고 R 자신(이미 rotated)은 남긴다.
  - R이 다시 오면 `LiveRefreshInFamily`가 비어 있어 조용히 거절된다. **보안 영향은 없다.**
  - 옛 바이너리가 회전한 토큰은 reason이 NULL이라 `default`로 거절된다(legacy와 같다).
- **수정안**: 필요 없다. 정합을 원하면 `RevokeRefreshFamily`에 `OR token_hash = $1`을 더한다.

### 참고

- `LatestRotationAt` 쿼리와 생성물이 남아 있다(원복용). 원복을 포기할 때 `/reflect`에서 함께 지운다.
- 재사용 탐지는 그 계열만 끊는다. 같은 사용자의 다른 기기 계열은 그대로다. RFC가 허용하는 범위이고, 정책 선택이다(전체 끊기 + 알림 메일도 고려할 수 있다).

---

## 3. 배포 순간 기존 세션 (0019 백필 · parent_hash NULL)

- 0019는 열과 부분 인덱스만 추가하고 백필이 없다. 기존 live 토큰은 parent NULL, family=self(0018 백필)로 남는다.
- 기존 live 토큰을 새 코드가 갱신하면 정상 회전한다(`RevokedAt == nil` 경로는 parent를 보지 않는다). **기존 세션은 유지된다.**
- 이미 회전된 옛 토큰은 `legacy`(0018) 또는 NULL이고, 유예 없이 거절된다. 배포 직전에 응답을 잃은 경우만 구제되지 않는다. 극히 드물다.
- superseded가 될 수 있는 토큰은 언제나 parent가 있다(`live.ParentHash == want`이고 want는 비어 있지 않음). 그래서 parent NULL 토큰이 superseded로 바뀌어 판정이 꼬이는 경로는 없다.
- 마이그레이션 전에 새 바이너리가 뜨면 500이 난다. 이제 route가 503으로 바꾸고 화면은 로그아웃하지 않는다(M-1 해소). 배포 순서도 migrate가 먼저다.

## 4. 5xx→503과 프론트 재시도

- route는 401일 때만 401을 보내고, 그 밖의 non-ok는 503, 업스트림에 닿지 못하면 503을 보낸다(`route.ts:53,63-64`). 쿠키는 어떤 실패에서도 건드리지 않는다.
- 화면(`session.ts`)은 401일 때만 600ms 뒤 한 번 재시도하고, 그래도 401이면 깃발을 내린다. 503이나 null이면 `return false`로 끝내고 재시도 루프가 없다. **무한 루프는 없다.**
- 쿠키 유실은 없다. 성공 응답만 Set-Cookie한다.
- M-3 완화(`refreshedRecentlyElsewhere`, 10초)는 동작한다. 다만 「다른 탭의 성공이 10초 안」일 때만 막는다. 그 밖의 401에서는 여전히 공유 깃발을 내린다(의도된 동작).
- Web Locks 15초 폴백의 경합은 N-2에 적었다. 클라이언트 요청 한도가 10초라서, 정상적인 탭이 잠금을 15초 넘게 쥐는 일은 얼어 있는 탭이 아니면 거의 없다.

---

## 5. 판정 — **조건부 배포 가능**

- 앞선 높음 H-1·H-2·H-3은 모두 해소됐다. 새 치명·높음은 없다. 실 DB 테스트와 `-race`도 통과했다.
- 조건
  1. **N-1(rotated 유예에 시간 상한 없음)은 배포 전에 상한을 넣기를 권한다.** 한 줄 조건이다. 넣지 않고 배포한다면 「옛 토큰은 피해자가 돌아올 때까지 유효」라는 위험을 수용한다고 spec에 명시한다.
  2. N-2는 빈도가 낮다. 배포 뒤 「재사용 탐지」 경고 로그의 빈도를 관찰하고, 오탐이 보이면 (a)·(b)를 적용한다. 탐지 사유를 로그에서 구분하는 작업은 배포 전에 하면 좋다.
  3. 낮음 N-3~N-7은 후속 작업으로 돌려도 된다.

---

## 조치 (2026-10-27 · v0.41.2)

| 항목 | 조치 |
|---|---|
| N-1 | **수정** — `refreshRotatedRescue = 60분`. 테스트 `TestRefreshRotatedRescueCapped`(수정 전 실패 확인)·`…WithinCap`. 기존 `TestRefreshAttackerLaterIsDetected` 는 30분 시나리오로 조정(48시간 원본은 주석 보존) |
| N-2 | **수정** — `withStorageLock`(lib/session.ts), 라우트 Me 호출 제거, 탐지 로그 사유. e2e 「Web Locks 가 없어도 … 한 줄로 선다」(수정 전 빌드에서 실패 확인) |
| N-3 | **보류** — 위 스펙 사유 |
| N-4 | **수정** — Me 호출 제거로 해소 |
| N-5 | **일부 수정** — 끝난 토큰 잠금 전 거절(`TestRefreshDeadTokenSkipsLock`, 수정 전 실패 확인). 속도 제한은 보류 |
| N-6 | **수정** — refresh 라우트 IP 헤더 전달 |
| N-7 | **보류** — 보안 영향 없음 |
