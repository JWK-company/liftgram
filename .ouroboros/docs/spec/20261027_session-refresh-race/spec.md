# Task Spec — 세션 갱신 경합 수정 (refresh 회전 유예·계열 재사용 탐지·탭 간 직렬화)

> 생성일: 2026-10-27 · 등급: **Feature**(backend 인증 서비스·저장소·서버 마이그레이션 0018 + frontend 갱신 라우트·세션 클라이언트)
> 추적: SRS-083 (URS-008 · URS-001) · 근거: `.ouroboros/docs/qa/20261027_declutter-p4-code_qa.md` H-1
> 출시: 다음 patch(버전은 release 단계에서 결정)

## 문제

refresh 토큰은 갱신할 때마다 회전한다(`backend/internal/auth/service.go` `Refresh`). 지금은 **옛 토큰을 먼저 폐기하고** 새 토큰을 준다. 이 자체는 맞지만 유예가 없어서, 새 토큰이 브라우저 쿠키에 닿지 못하면 세션이 통째로 죽는다.

### 재현 경로

1. **응답 유실**: 문서 A가 `/api/session/refresh`를 보낸다 → 응답 전에 문서가 사라진다(당겨서 새로고침·「새 버전」 새로고침·앱 닫기). Next 라우트는 backend `Refresh`를 끝까지 호출해 옛 토큰을 폐기하지만, 새 토큰을 담은 Set-Cookie는 버려진다. 다음 문서의 갱신은 폐기된 옛 쿠키로 401 → 라우트가 쿠키를 지움(`Max-Age=0`) → 로그아웃.
2. **탭 경합**: 두 문서(탭 둘, PWA+브라우저)가 같은 쿠키로 동시에 갱신 → 하나만 이김. 진 쪽 401 응답이 늦게 오면 **이긴 쪽이 막 구운 새 쿠키까지 지움** → 모든 탭 로그아웃.
3. 재현(브라우저 DevTools): `await Promise.all([1,2].map(()=>fetch("/api/session/refresh",{method:"POST",headers:{"x-liftgram-session":"1"}}))).then(r=>r.map(x=>x.status))` → `[200, 401]`이 나오고 이후 로그아웃.

### 사용자가 전에 말한 증상과의 관계

「로그인 상태인데 프로필 탭이 로그인 안 된 것처럼 보이다가 몇 초 뒤 돌아옴」은 **회복되는** 증상이다. 이번 버그는 **회복되지 않는**(다시 로그인해야 하는) 로그아웃이다. 그 증상은 첫 그리기에서 세션 복원이 끝나기 전 상태(`restoring`)를 비로그인처럼 그린 것으로, 2026-10-26 인증 캐시(`readCachedMe`·`restoring`)로 이미 고쳤다. 다만 「앱을 열자마자 새로고침했더니 아예 로그아웃돼 있었다」는 경우가 있었다면 이 버그다.

## 설계안 비교

| 안 | 내용 | 막는 것 | 못 막는 것 | 보안 |
|----|------|---------|-----------|------|
| (a) 서버 회전 유예 | 회전으로 폐기된 토큰을 30초 안에 다시 쓰면 같은 계열의 새 토큰을 하나 더 준다 | 응답 유실, 탭 경합(둘 다 성공) | — | 유예 안 재사용은 허용(30초 창). 유예 밖 재사용은 탈취로 보고 계열 폐기 |
| (b) 클라이언트 직렬화 | Web Locks(`navigator.locks`)로 탭 사이 갱신을 하나씩. 401은 한 번 기다렸다 재시도 | 탭 경합 | **응답 유실**(문서가 사라지면 클라이언트 쪽 대책이 없다) | 변화 없음 |
| (c) 둘 다 | (a)+(b) | 전부 | — | (a)와 같음, 경합 자체가 줄어 유예가 덜 쓰인다 |

**선택: (c).** 응답 유실은 서버 유예로만 고칠 수 있고, 탭 직렬화는 유예 창을 쓰는 횟수(=새 토큰 발급 수)를 줄이고 쿠키 덮어쓰기 순서를 안정시킨다. 업계 관행(OAuth refresh rotation의 reuse interval, Auth0 「Reuse Interval」)과 같다.

## 설계

### 서버 — 토큰 계열(family)과 폐기 사유

- 마이그레이션 **`0018_refresh_token_family.sql`**(0017은 병행 작업 opengym이 예약 — 적용은 파일명 집합 기준이라 순서가 바뀌어도 둘 다 적용된다): `refresh_tokens`에 `family_id text`, `revoke_reason text` 추가 · 기존 행 `family_id = token_hash` · 이미 폐기된 행 `revoke_reason = 'legacy'`(유예 대상 아님) · `family_id` 인덱스.
- 폐기 사유: `rotated`(회전) · `logout`(이 기기 로그아웃) · `reuse`(재사용 탐지) · `all`(전체 로그아웃·비밀번호 변경 등) · `legacy`.
- 발급: 로그인·가입 등 새 세션 = 새 계열(`family_id = 자기 hash`). 회전·유예 재발급 = 같은 계열.
- `Refresh(raw)`:
  1. `GetRefreshToken(hash)` — 폐기 여부와 상관없이 읽는다. 없거나 만료 → 401.
  2. 살아 있으면 `RotateRefreshToken(hash)`(`revoked_at IS NULL`일 때만 `revoked_at=now(), reason='rotated'` — 영향 행 수로 경합 판정) → 같은 계열로 새 토큰 발급.
     - 영향 행 0(동시에 다른 요청이 먼저 회전) → 3의 유예 규칙으로 처리.
  3. 폐기돼 있고 `reason='rotated'`이며 `now - revoked_at ≤ 30초` → 같은 계열로 새 토큰 발급(옛 토큰은 그대로 폐기 상태).
  4. 그 밖(유예 밖 `rotated` 재사용) → **재사용 탐지**: 그 계열 전부를 `reason='reuse'`로 폐기(이미 폐기된 행도 사유를 덮어써 유예를 닫는다) → 401.
  5. `logout`·`reuse`·`all`·`legacy` → 401(유예 없음).
- `LogOut(raw)`: 그 토큰의 **계열 전체**를 `logout`으로 폐기(유예로 생긴 형제 토큰까지). 다른 기기(다른 계열)는 그대로.
- `RevokeAllRefreshTokensForUser`: 사용자 모든 행 `reason='all'`(이미 폐기된 행 사유도 덮어써 유예를 닫는다).
- 시계: 서비스의 `s.now()`(테스트에서 바꿀 수 있다). DB `now()`와 앱 시계 차이는 유예 판단을 Go에서 하므로 영향 없다(`revoked_at`은 DB 시각 — 같은 서버라 차이 무시 가능, 스펙 리스크에 기재).

### 프론트

- `app/api/session/refresh/route.ts`: backend 401이어도 **쿠키를 지우지 않는다**. 지우면 다른 탭이 막 구운 새 쿠키까지 지운다. 죽은 쿠키는 화면이 「진짜 로그아웃」으로 판정한 뒤 `DELETE /api/session`이 지운다.
- `lib/session.ts` `refreshOnce`:
  - 탭 간 직렬화: `navigator.locks.request("liftgram-refresh", …)` 안에서 갱신(없는 브라우저는 그대로).
  - 401이면 600ms 기다렸다 **한 번 더**(그사이 다른 탭이 새 쿠키를 구웠을 수 있다). 또 401이면 로그아웃 상태 + `DELETE /api/session`으로 죽은 쿠키 정리.
- `AuthProvider` `signUp`·`logIn`: `setTokens()`를 **await**(쿠키가 구워지기 전 전체 이동으로 끊기는 보조 경로 — H-1 보조).

## 테스트

- Go 단위(`service_test.go`): 동시 회전 둘 다 성공 · 유예 안 재사용 성공(같은 계열) · 유예 밖 재사용 401 + 계열 폐기(그 계열의 새 토큰도 죽음) · 로그아웃 뒤 유예 안 재사용 401 · 다른 계열 무영향 · 전체 폐기 뒤 401. 기존 「이미 쓴 refresh가 다시 통했다」 테스트는 「유예 밖」으로 바꾼다.
- e2e(`session-refresh-race.spec.ts`): ① 같은 쿠키로 갱신 2회 동시 → 둘 다 200, 새로고침 뒤 로그인 유지 ② 갱신 응답을 끊고(route abort) 다시 열기 → 로그인 유지 ③ 같은 컨텍스트 탭 둘 동시 열기 → 둘 다 로그인. **수정 전 코드에서 ①②가 실패하는지 먼저 확인.**

## /qa spec 반영 (아래가 위 설계보다 우선)

근거: `.ouroboros/docs/qa/20261027_session-refresh-race-spec_qa.md`

| QA | 바뀐 결정 |
|---|---|
| Q1 | 유예 = 30초 안 **또는** 그 토큰이 계열의 마지막 회전(그 뒤 다른 회전이 없음 = 새 토큰이 한 번도 쓰이지 않음 → 응답 유실로 본다). 그 밖의 rotated 재사용만 재사용 탐지. 「앱을 열자마자 닫고 몇 분 뒤 다시 연다」를 살린다 |
| Q2 | 갱신 실패(두 번째 401) 경로에서 `DELETE /api/session`을 부르지 않는다 — 깃발만 내린다(다른 탭의 새 쿠키를 지우거나 살아 있는 계열을 로그아웃시키지 않게) |
| Q3 | `LogOut` = 그 토큰의 계열 전체를 `logout`으로 폐기(유예로 생긴 형제 포함) |
| Q4 | 전체 폐기·재사용 탐지는 이미 폐기된 행 사유도 덮어쓴다(`revoked_at = COALESCE(revoked_at, now())`) — 비밀번호 변경 뒤 옛 기기가 유예로 되살아나지 않게 |
| Q5 | 회전 승패 = `UPDATE … WHERE revoked_at IS NULL` 영향 행 수, 진 쪽은 유예 규칙으로 |

## /qa code 반영 (2026-10-27 — 아래가 위 설계·/qa spec 반영보다 우선)

근거: `.ouroboros/docs/qa/20261027_session-refresh-race-code_qa.md`(높음 3 · 중간 4 · 낮음 8). main 결정.

| QA | 바뀐 결정 |
|---|---|
| H-1·H-2 (qa code 반영) | **「계열의 마지막 회전이면 허용」(Q1) 폐기 → 「미사용 후계(unused successor)」 규칙.** 0019 `parent_hash` 추가. 회전된 R 이 다시 오면, 계열의 살아 있는 토큰이 R 의 후계(parent=R)이고 아직 한 번도 쓰이지 않았을 때만 응답 유실로 본다 → 그 후계를 `superseded` 로 대체하고 새 후계(parent=R)를 준다. 후계가 이미 쓰였거나(살아 있는 토큰의 parent≠R) 살아 있는 토큰이 없으면 재사용/종료 → 계열 전체 `reuse` 폐기(없으면 조용히 401). 계열당 살아 있는 토큰은 **언제나 1개** — 공격자와 정상 클라이언트 중 하나는 반드시 무효 토큰을 내밀게 된다(RFC 9700 §4.14.2) |
| H-1 (탭 경합) | 30초 유예는 **`superseded` 토큰에만**: 30초 안이고 살아 있는 토큰이 그 형제(같은 parent)면 같은 방식으로 대체·재발급(살아 있는 토큰 1개 유지). 30초 밖 `superseded` = 재사용 → 계열 폐기 |
| H-3 (qa code 반영) | 원자성: `Refresh`·`LogOut`·`RevokeAllRefreshTokens` 는 **한 트랜잭션 + 사용자 단위 `pg_advisory_xact_lock`**(`LockUserSessions`) 안에서 읽고·판단하고·쓴다(`WithUserLock`). `users.sessions_valid_after` 는 잠금으로 충분해 두지 않았다 |
| M-1 | 갱신 라우트: 백엔드 401 만 401, 그 밖(5xx)은 503 — DB 순간 장애가 로그아웃이 되지 않게 |
| M-2 | 갱신 요청 10초·라우트의 백엔드 호출 8초 한도, Web Locks 대기 15초 넘으면 잠금 없이 실행 |
| M-3 | 다른 탭이 10초 안에 갱신 성공했으면(`liftgram.session.okAt`) 401 이어도 공유 깃발을 내리지 않는다 |
| M-4 | 보안 회귀(공격자 먼저·나중, 재사용 N회 뒤 살아 있는 토큰 ≤1, 대체 토큰 30초 안 구제, 비밀번호 변경 뒤 부활 없음) + 실 DB 테스트(`-tags pgtest`, 동시 고루틴: 동시 갱신 1개 유지·갱신 폭주 중 전체 폐기/로그아웃 뒤 0개·재사용 탐지·만료). e2e ①은 앱 재시도 경로(첫 갱신 401 → 600ms 뒤 재시도), ③은 첫 응답을 1.5초 붙잡아 Web Locks 직렬·새 쿠키를 확인 |
| L-3 | 전체 폐기는 살아 있는 것·유예 대상(rotated·superseded)만 UPDATE |
| L-6 | 아래 리스크 표의 「두 번째 401에서 DELETE」는 Q2 로 폐기됐다 — 죽은 쿠키는 남지만 깃발이 내려가 재시도·깜빡임이 없고, 다음 로그인이 덮어쓴다(Max-Age 30일) |

실 DB 테스트 실행: `TEST_ADMIN_DATABASE_URL=postgres://app:app@127.0.0.1:5434/postgres?sslmode=disable go test -tags pgtest -race ./internal/auth/ -run PG`(backend/).

## 보안 재검토 반영 (2026-10-27 — 아래가 위 모든 반영보다 우선)

근거: `.ouroboros/docs/qa/20261027_session-refresh-race-recheck_qa.md`(조건부 배포 가능 · 중간 2 · 낮음 5).

| 항목 | 결정 |
|---|---|
| N-1 | rotated 토큰의 「미사용 후계」 구제 상한 **60분**(`refreshRotatedRescue`, 기준 = 그 토큰이 회전된 시각) — 갱신 도중 앱이 닫혀도 1시간 안에 다시 열면 유지. 그 밖 재사용은 계열 폐기 |
| N-2 | Web Locks 가 없거나 잠금 대기가 넘치면 **저장소 대체 잠금**(localStorage + 무작위 지연·재확인)으로 줄을 세운다. refresh 라우트는 Me 를 다시 부르지 않고 Refresh 응답의 user 를 쓴다(회전→응답 간격 축소). 탐지 로그에 사유(rotated 구제 상한 밖·superseded 유예 밖·후계 불일치) |
| N-4 | Me 호출 제거로 라우트 최악 = Refresh 8초 < 화면 한도 10초 |
| N-5 | 끝난 토큰(reuse·logout·all·legacy)은 잠금 없이 즉시 거절. 토큰 단위 속도 제한은 보류(N-6 IP 전달이 운영에서 확인된 뒤) |
| N-6 | refresh 라우트가 클라이언트 IP 헤더(x-forwarded-for·x-real-ip·cf-connecting-ip)를 넘긴다 |
| N-3·N-7 | 보류 — N-3 은 상대가 30초 안에 계속 응수해야만 이어지고 한쪽이 정상 회전하면 즉시 탐지(악용 가치 낮음), N-7 은 보안 영향 없음 |

## 리스크

| 리스크 | 대응 |
|---|---|
| 유예 창 동안 탈취 토큰 재사용 | (qa code) 「미사용 후계」 규칙 — 계열당 살아 있는 토큰 1개라 평행 세션이 생기지 않고, 재사용은 다음 갱신에서 드러난다 |
| 유예로 계열 안에 살아 있는 토큰이 여러 개 | (qa code) 생기지 않는다 — 유예 재발급은 이전 후계를 superseded 로 대체한다 |
| 401에서 쿠키를 안 지워 죽은 쿠키가 남음 | ~~클라이언트가 두 번째 401에서 `DELETE`로 정리~~ (Q2·L-6) 깃발을 내려 재시도·깜빡임을 막고, 다음 로그인이 덮어쓴다 |
| 마이그레이션 번호 충돌(0017) | 0018 사용 · 파일명 집합 기준 적용이라 순서 무관 |
| DB `now()`와 Go 시계 | 같은 서버 · 30초 창 대비 무시 가능 |
