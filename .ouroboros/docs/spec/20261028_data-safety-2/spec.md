# Project Spec — 정식 오픈 전 기록 보호 2차 (로그인 유도 · 백업 검증 · 운영 상태 · 다중 탭)

> 생성일: 2026-10-28 · 등급: **Project**(frontend·core·Go 백엔드 새 서비스·DB 마이그레이션 0020·서버 스크립트·cron)
> 추적: **URS-027** → SRS-086(로그인 유도) · SRS-087(백업 검증·복원 시험) · SRS-088(운영 상태) · SRS-089(다중 탭)
> 작업 위치: worktree `../liftgram-wt-safety` · 브랜치 `feat/data-safety-2`(7b1b935 에서) · Phase 마다 커밋 → 독립 qa code → main ff-only → 배포
> 결정: 사용자 확정(2026-10-28) — Q1 백업은 h2500-3 안에 둔다(외부 저장소 없음) · Q2~Q4 권장안 그대로

## 1. 문제

2026-10 사고(옛 앱 동기 두 달 조용히 실패 → 기록이 폰에만 → 주소 이전으로 고립)의 직접 원인 둘은 막았다(서버 `_status` 거름 · 고정 주소 · 경고 띠 · 계정 전환 가드 · 백업 파일). 남은 위험:

| # | 위험 | 이번 Phase |
|---|------|-----------|
| R1 | 비로그인 사용자의 기록은 기기에만 있음 — 폰 교체·앱 삭제·Safari 7일 축출 = 전부 소실. 띠는 5건부터·7일 접힘 | P1 |
| R2 | 백업이 실제로 되살아나는지 아무도 확인하지 않음 · 결과를 아무도 안 봄 | P2 |
| R3 | 운영진이 동기 실패를 모른다(경고는 사용자 화면에만) — 사고를 두 달 늦게 안 근본 원인 | P3 |
| R4 | 같은 브라우저 탭 둘 = LokiJS 가 자기 메모리 사본으로 디스크를 덮음(실측 · 지금은 가져오기만 막음) | P4 |

## 2. 확정 결정 (사용자 2026-10-28)

| # | 결정 | 구현 |
|---|------|------|
| Q1 | 백업은 **h2500-3 안**에 둔다 | 조사: DB volume = `/var/lib/docker`(sdb SSD) · 백업 = `~/liftgram/backups`(`/home` = **sda 별도 물리 디스크**) → 디스크 하나 고장으로 둘이 같이 사라지지는 않는다. `/m2`(nvme)는 root·동업자 소유라 **쓰지 않는다**. 대신 **결과 기록 + 월 복원 시험 + 운영 화면 표시**(P2·P3) |
| Q2 | 로그인 **유도 강화**(필수 아님) | 비로그인 완료 1·3번째 + 이후 마지막 표시 7일 뒤 완료마다 권유 시트 · 로컬 띠 1건부터 · 「나중에」 24시간 |
| Q3 | 운영진 알림 = **앱 안**(메일 아님) · admin 계정 | 기기 건강 보고 RPC · `/ops` 화면(admin) · 문제 있을 때 admin 의 프로필 탭 **빨간 점** · 프로필 「운영 상태」 줄 |
| Q4 | 다중 탭 = **새 탭이 주인**, 먼저 열린 탭은 덮개 + 「여기서 계속하기」 | Web Locks `steal` + BroadcastChannel 넘겨주기 · 멈춘 탭은 DB 쓰기·autosave·동기 없음 · 넘겨받으면 새로고침 |
| — | 운영진 계정 | jh21star@gmail.com admin 부여 완료(2026-10-28 · 직전 백업 `pre-admin-grant-20261028-004109.dump`) |

## 3. Phase

| Phase | 내용 | 버전 | 서버 변경 |
|-------|------|------|-----------|
| P1 | 로그인 유도(SRS-086) | v0.49.0 | 없음 |
| P2+P3 | 백업 결과 기록·복원 시험(SRS-087) + 운영 상태(SRS-088) — 같은 마이그레이션 0020 · 같이 배포 | v0.50.0 | 0020 · 새 RPC · cron |
| P4 | 다중 탭 단일 쓰기(SRS-089) | v0.51.0 | 없음 |

각 Phase: execute → 독립 qa code → 조치 → main ff-only → 배포 → 운영 확인. 병행 세션이 그사이 버전을 올렸으면 rebase 뒤 다음 minor.

## 4. P1 — 로그인 유도 (SRS-086)

### 4.1 판정 (core 순수 함수 · 테스트)
`core/src/domain/loginNudge.ts`
```
shouldShowLoginNudge({ anonCompletedCount, lastShownAt, now }): boolean
  // anonCompletedCount = 이번 완료를 **포함한** 이 기기 비로그인 완료 수
  count === 1 || count === 3 → true
  count > 3 && lastShownAt != null && now - lastShownAt >= 7일 → true
  count > 3 && lastShownAt == null → true (3번째 때 못 띄웠으면)
  그 밖 false
localOnlyBannerVisible({ pending, dismissedAt, now }): pending >= 1 && now - dismissedAt > 24h
```
상수: `LOGIN_NUDGE_REPEAT_MS = 7일` · `LOCAL_ONLY_MIN = 1` · `LOCAL_ONLY_SNOOZE_MS = 24h`.

### 4.2 화면
- 셈: 운동 완료 확정(confirm-finish 의 완료 처리)이 끝난 뒤 **로그인 안 했으면** 기기 로컬 `liftgram.nudge.anonCompleted` +1(prefs · 계정 동기 대상 아님 — 비로그인이니까). 같은 운동 id 를 두 번 세지 않는다(`liftgram.nudge.lastCountedWorkout`).
- 표시: 요약(WorkoutSummary) 위에서 **루틴 저장·반영 질문(FinishRoutineSheets)이 끝난 뒤** 권유 시트 `LoginNudgeSheet`(testId `login-nudge`). 질문이 없으면 요약이 뜬 직후.
  - 제목 「이 기록은 이 폰에만 있어요」 · 본문 「로그인하면 기록이 계정에 안전하게 보관되고, 폰을 바꿔도 그대로예요.」
  - 주 행동 「로그인하고 보관하기」(빨강 채움 — 요약 화면의 다른 빨강 채움이 있으면 시트가 뜬 동안 그 화면의 유일한 채움이 되게: 시트는 덮개라 OK) → `/account`(로그인 화면 · 가입 전환 가능) — 이동 전 flush(navigateAfterFlush)
  - 보조 「나중에」(quiet) · 바깥 누름 = 나중에. 보이는 순간 `liftgram.nudge.lastShownAt = now`.
- 띠(SyncHealthBanner): `LOCAL_ONLY_MIN` 5→1 · 접기 7일→24시간(기존 상수·식은 주석 보존 + [개선]).
- 로그인 뒤 기기 기록이 계정으로 올라가는 기존 동작(awaitFirstSync·AccountGuard)은 바꾸지 않는다.
- 문구 ko/en(core i18n `loginNudge.*` · 기존 `syncHealth.*` 유지).

### 4.3 P1 e2e (`e2e/login-nudge.spec.ts`)
- 비로그인 1·2·3·4번째 완료 → 시트 1·3번째만 · 시계 7일 앞당긴 뒤(addInitScript 로 Date.now 오프셋 또는 lastShownAt 를 과거로) 5번째 → 보임.
- 루틴 운동 완료: 반영 질문 먼저, 닫은 뒤 시트.
- 로그인 상태: 시트·로컬 띠 없음.
- 띠: 기록 1건에서 보임 · 「나중에」 → 안 보임 · lastDismissed 를 25시간 전으로 → 다시 보임.
- 「로그인하고 보관하기」 → /account 로 가고 방금 운동이 기기에 남아 있다(새로고침 뒤 기록 탭).
- 수정 전 빌드에서 실패하는지 확인(1건 시트·1건 띠).

## 5. P2 — 백업 결과·복원 시험 (SRS-087)

### 5.1 DB (0020 — P3 와 같은 파일)
```sql
create table ops_backup_runs (
  id bigserial primary key,
  kind text not null check (kind in ('daily','restore_test')),
  ok boolean not null,
  size_bytes bigint,
  tables int,              -- daily: TABLE DATA 수 · restore_test: 대조한 표 수
  disk_free_bytes bigint,  -- 백업 디스크(/home) 남은 공간
  detail text,             -- 실패 이유·행 수 대조 요약(짧게)
  created_at timestamptz not null default now()
);
create index on ops_backup_runs (kind, created_at desc);
```

### 5.2 스크립트
- `scripts/backup-h2500-3.sh`(수정): 지금 흐름 유지 + 끝(성공·실패 모두)에 `docker exec liftgram-db-1 psql … -c "insert into ops_backup_runs …"`. `set -e` 로 중간에 죽어도 기록되게 `trap` 으로 실패 줄을 남긴다. 디스크 여유 = `df -B1 --output=avail $DIR`. 20GB 미만이면 detail 에 `low_disk`.
- `scripts/restore-test-h2500-3.sh`(신규): 최신 `daily/*.dump` → `createdb liftgram_restore_test_<ts>` → `pg_restore --no-owner` → `users`·`sync_records` 행 수를 운영 DB 와 대조(복원 ≤ 운영 이고 복원 > 0 이면 ok — 백업 뒤 늘어난 만큼은 정상) → 결과 insert → **항상** `dropdb`(trap). 같은 postgres 컨테이너 안에서만.
- cron(사용자 crontab · 배포 스크립트가 없으면 추가 · 있으면 그대로): `17 4 * * *` 기존 · **`47 4 1 * *` 복원 시험**. 배포 스크립트에 「crontab 에 두 줄이 있는지」 확인 단계(없으면 추가하고 알림).
- 첫 배포 직후 두 스크립트를 한 번씩 손으로 돌려 첫 줄을 만든다(운영 화면이 「기록 없음」으로 시작하지 않게).

## 6. P3 — 운영 상태 (SRS-088)

### 6.1 DB (0020)
```sql
create table client_health (
  user_id text not null references users(id) on delete cascade,
  device_id text not null,            -- 기기 로컬 무작위 id(localStorage · 계정 동기 아님)
  app_version text not null default '',
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  consecutive_failures int not null default 0,
  pending int,                        -- 모르면 null
  blocked boolean not null default false,
  last_error text,                    -- 앞 200자
  reported_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
```
기기는 사용자당 여러 개(폰·PC). 보관: 90일 넘게 보고 없는 줄은 조회에서 뺀다(삭제는 안 함 — 작다).

### 6.2 RPC — 새 서비스 `proto/ops/v1/ops.proto` `OpsService`
- `ReportClientHealth(ReportClientHealthRequest{device_id, app_version, last_success_at_ms, last_attempt_at_ms, consecutive_failures, pending(optional), blocked, last_error})` → upsert. **로그인 필수 · 역할 무관**. 서버가 길이 자르기(device_id 64 · version 32 · error 200) · 미래 시각은 now 로.
- `GetOpsStatus({})` → **admin 만**(`role == "admin"` · 아니면 PermissionDenied). 응답:
  - `users[]`: user_id · 이메일 앞부분(`@` 앞 3글자 + `…`) · display_name · 서버 관점 마지막 동기 쓰기(`max(sync_records.updated_at)`) · 마지막 로그인(refresh_tokens max created_at) · 기기들(보고 줄 전부, 최신순).
  - `stalled[]`: 기기 보고 기준 **pending > 0 이고 (last_success_at 없음 또는 24시간 넘음) 이고 그 뒤 시도(last_attempt_at > last_success_at)가 있음** 또는 consecutive_failures ≥ 3 또는 blocked. 「N일째」 = now − last_success_at(없으면 첫 보고부터).
  - `backup`: 마지막 daily(ok·시각·크기·여유) · 마지막 ok daily 시각 · 마지막 restore_test(ok·시각·detail).
  - `alert: bool` + `alert_reasons[]`: stalled 있음 · 마지막 ok daily > 36h · restore_test 없음/40일 넘음/실패 · low_disk.
- `GetOpsAlert({})` → admin 만 · `{alert, count}` 만(탭 점용 가벼운 호출).
- Go: `backend/internal/ops/`(service·sqlc 쿼리 `database/queries/ops.sql`) · 라우터 등록은 기존 서비스들과 같은 방식.

### 6.3 기기 쪽 보고 (`frontend/lib/clientHealth.ts`)
- `subscribeSyncHealth` 를 듣다가 `lastAttemptAt` 이 바뀌면 보고. 10분에 한 번 이하(마지막 보고 시각 localStorage) — 단 `consecutiveFailures` 가 0↔양수로 바뀌었거나 `blocked` 가 바뀌면 즉시. 로그인 안 했으면 안 보낸다.
- 보고 실패는 삼킨다(동기 실패와 별개 경로라 동기가 죽어도 보고는 간다 — 오히려 그때가 중요). 오프라인이면 다음 시도로.
- device_id: `liftgram.device_id`(없으면 만든다 · 계정 전환·wipe 에도 유지).
- app_version: `build-info.json`/package version(이미 프로필이 쓰는 값).

### 6.4 화면
- `/ops`(새 라우트 `app/ops/page.tsx` + `components/ops/OpsClient.tsx`): admin 아니면 「운영진 계정만 볼 수 있어요」.
  - 맨 위 상태 한 줄: 문제 없으면 「이상 없음」(회색), 있으면 이유 목록(빨강 글자 — 채움 아님).
  - 「동기가 멈춘 사용자」 목록(이메일 앞부분·이름·N일째·연속 실패·안 올라간 기록·앱 버전·마지막 오류 앞부분).
  - 「백업」: 마지막 일일 백업(시각·크기·남은 디스크) · 마지막 복원 시험(시각·결과).
  - 「사용자」 전체 목록(접기 · 마지막 동기·로그인·기기 수).
  - 새로고침 버튼.
- 프로필(ProfileClient): admin 이면 「계정과 데이터」 묶음에 「운영 상태」 줄(`row-ops`) — alert 면 줄 오른쪽 빨간 점.
- 탭 바: admin 이고 alert 면 프로필 탭에 **빨간 점**(`nav-profile-ops-dot` · sr-only 「운영 확인 필요」). 업데이트 회색 점과 함께면 빨강만 보인다. 확인 시점: 로그인 직후·앱이 보일 때(visibilitychange)·10분마다 · 오프라인이면 건너뜀.

### 6.5 P2+P3 테스트
- Go: ReportClientHealth upsert·자르기·미래 시각 · GetOpsStatus 권한(user·coworker 거부, admin 허용) · stalled 판정 경계(23h59m/24h1m · 시도 없음은 제외 · failures 3) · alert 이유(36h · 40일 · 실패 · low_disk).
- core/frontend: 보고 쓰로틀·즉시 조건 단위 테스트.
- e2e(`e2e/ops-status.spec.ts` · 로컬 운영 빌드): admin 시드 계정(테스트 DB 에 role 갱신) · 다른 계정의 동기를 막아(route 로 Push 500) 3회 실패 → 보고 → admin `/ops` 멈춘 사용자에 보임 · 탭 빨간 점 · 일반 계정은 `/ops` 막힘·줄 없음 · ops_backup_runs 에 오래된 daily 를 넣으면 이유 「백업 36시간」.
- 스크립트: 로컬 docker 에서 backup·restore-test 를 테스트 DB 로 돌려 줄이 생기고 임시 DB 가 남지 않는지.

## 7. P4 — 다중 탭 단일 쓰기 (SRS-089)

### 7.1 원리
- 쓰기 주인 = Web Lock `liftgram-writer`(배타). 탭은 시작할 때 `navigator.locks.request("liftgram-writer", {steal: true}, …)` 로 **빼앗는다** → 이전 주인의 잠금 약속이 AbortError 로 끝나 「빼앗겼다」를 안다.
- **순서 보장(덮어쓰기의 핵심)**: 새 탭은 기기 DB 를 읽기 전에 이전 주인이 메모리 변경을 디스크에 내려써야 한다.
  1. 새 탭: 잠금 빼앗기 → BroadcastChannel `liftgram-tabs` 로 `{t:"claim", from}`.
  2. 이전 주인: 빼앗김 감지 → 즉시 멈춤 상태(쓰기 차단·동기 pause·autosave 중지) → `flushLocalDbResult()` → `{t:"released", from, flushed:"saved"|"failed"|"nothing"}`.
  3. 새 탭: DB 를 열기 **전에** released 를 최대 1.5초 기다린다. 이전 주인이 없거나(첫 탭) 답이 없으면 그냥 연다.
  - DB 모듈(`@app/core/db`)이 임포트 시점에 Loki 를 연다면, 「DB 를 열기 전」을 보장하는 방법을 execute 가 고른다: (a) 앱 셸이 DB 를 처음 만지기 전에 넘겨받기 약속을 기다린다 또는 (b) 새 탭이 이미 DB 를 연 뒤 released 가 `saved` 로 오면 **한 번 새로고침**(디스크 최신본으로 다시 읽기 · sessionStorage 표식으로 무한 반복 방지). 어느 쪽이든 e2e 7.3 이 증명한다.
- 멈춘 탭(dormant):
  - 화면 전체 덮개 `TabElsewhereOverlay`(testId `tab-elsewhere`) — 뒤 화면 `inert` · 「다른 탭에서 열려 있어요」 · 본문 「한 번에 한 탭에서만 기록할 수 있어요. 이 탭에서 계속하면 다른 탭이 멈춰요.」 · 버튼 「여기서 계속하기」(`btn-tab-take-over`).
  - **어떤 DB 쓰기도 디스크에 닿지 않아야 한다**: 동기 pause(풀지 않음) · Loki autosave 끄기(가능하면 어댑터 autosave 해제, 아니면 dormant 동안 `database.write` 를 거부하는 문지기) · 휴식 타이머 등 배경 쓰기 중지. 가장 안전한 형태는 「멈춘 탭은 새로고침해서 DB 없이 덮개만 그리는 상태로 들어간다」 — execute 가 실측으로 고른다.
  - 「여기서 계속하기」 = 잠금 빼앗기(steal) → claim/released 절차 → **새로고침**(메모리 사본이 낡았으므로 항상 디스크에서 다시 읽는다).
- 운동 중인 탭도 같은 규칙(덮개가 뜨면 휴식 타이머 소리는 멈춘다 — 다른 탭이 이어받는다).
- 가져오기 가드(SRS-082 · `liftgram-import` 잠금·ImportElsewhereNotice)는 그대로 둔다(가져오기 중인 탭은 빼앗기지 않게: 가져오기 중이면 새 탭이 claim 하지 않고 기존 「다른 탭에서 가져오는 중」 안내를 띄운다).
- Web Locks 없는 브라우저: BroadcastChannel 만으로 「나중 탭 우선」(claim 받으면 멈춤) · 둘 다 없으면 막지 않는다(fail-open · 기존과 같음).
- 서비스워커 sw-nudge iframe(`/sw-nudge.html`)·`/diag`·정적 페이지는 탭으로 세지 않는다(앱 셸에서만 시작).

### 7.2 파일
`frontend/lib/tabGuard.ts`(확장 · 기존 export 유지) · `frontend/app/components/TabElsewhereOverlay.tsx`(신규) · 셸 마운트 지점(layout/Providers — DB 를 처음 만지는 곳) · `lib/localDb.ts`(필요 시 autosave 제어) · `core/src/sync/syncEngine.ts`(pause 사용 — 기존 API) · i18n.

### 7.3 P4 e2e (`e2e/multi-tab.spec.ts` · 같은 context 의 두 page)
- A 에서 운동 시작·세트 저장 → B 열기 → A 덮개 · B 에 그 세트 보임.
- B 에서 세트 하나 더 저장 → A 「여기서 계속하기」 → A 에 두 세트 · B 덮개.
- A 에서 저장 → A 닫기 → B 「여기서 계속하기」 → 세 세트 모두(사라진 것 없음).
- 멈춘 탭에서 5초 기다려도 IndexedDB 가 바뀌지 않는다(덮개 상태에서 autosave·동기 없음).
- **수정 전 빌드에서 실패**(덮개 없음 + 세트 소실 재현)를 확인한다.
- 가져오기 중인 탭이 있으면 새 탭은 claim 하지 않고 기존 안내.

## 8. 작업 범위 (파일)

| Phase | 파일 |
|-------|------|
| P1 | `core/src/domain/loginNudge.ts`(+test) · `core/src/i18n/locales/{ko,en}.ts` · `frontend/app/components/session/LoginNudgeSheet.tsx`(신규) · `session/ActiveWorkout.tsx`·`WorkoutSummary.tsx`(표시 지점) · `sync/SyncHealthBanner.tsx` · `e2e/login-nudge.spec.ts` · `frontend/package.json` |
| P2 | `database/migrations/0020_ops.sql` · `scripts/backup-h2500-3.sh` · `scripts/restore-test-h2500-3.sh`(신규) · `scripts/deploy-h2500-3.sh`(crontab 확인) |
| P3 | `proto/ops/v1/ops.proto` + 생성물 · `database/queries/ops.sql` + sqlc · `backend/internal/ops/*` · 라우터 등록 · `frontend/lib/clientHealth.ts` · `app/ops/page.tsx` · `components/ops/OpsClient.tsx` · `profile/ProfileClient.tsx` · `ui/TabBar.tsx` · `lib/opsAlert.ts` · i18n · `e2e/ops-status.spec.ts` |
| P4 | `frontend/lib/tabGuard.ts` · `components/TabElsewhereOverlay.tsx` · 셸 마운트 · `lib/localDb.ts` · i18n · `e2e/multi-tab.spec.ts` |

코드 보존 규칙(CLAUDE.md §3.6): 바꾸는 상수·호출은 [원본] 주석 + [개선]. 모든 새 코드 위 `@plm SRS-08x`.

## 9. 위험·주의

- **P4 가 가장 위험**: 덮개·넘겨주기 순서를 잘못 짜면 오히려 기록을 잃는다. e2e 7.3 의 「사라진 것 없음」을 수정 전 빌드 실패로 증명하기 전엔 배포 금지. iOS Safari·삼성 인터넷의 Web Locks `steal` 지원 확인(미지원이면 BroadcastChannel 경로).
- P3 보고 RPC 는 동기와 다른 경로여야 한다(동기가 죽을 때 보고가 필요). 보고가 많아 서버를 누르지 않게 10분 쓰로틀 + 서버 upsert 1행.
- 운영 상태에 이메일 전체·오류 전문을 싣지 않는다(앞부분만) · admin 전용 검사는 **서버**가 한다(화면 숨김은 안내일 뿐).
- 운영 DB 마이그레이션 전 pg_dump(배포 스크립트 표준 + 수동 `pre-ops-0020-*.dump`).
- 로그인 권유가 운동 흐름을 끊지 않게: 요약 뒤에만, 바깥 누름으로 닫힘, 같은 운동에 두 번 안 뜸.
- 「로그인하고 보관하기」로 가입하면 기기 기록이 새 계정으로 올라가는 기존 경로(awaitFirstSync)를 e2e 로 한 번 확인.

## 10. 완료 정의

- 각 Phase: make verify 통과 · 새 e2e 가 수정 전 빌드에서 실패·수정 뒤 통과 · 기존 관련 e2e(data-safety·manual-update·finish-routine·import) 통과 · 독립 qa code 조치 · 운영 배포·확인.
- P2+P3 배포 뒤 운영 `/ops` 를 admin 으로 열어 백업 두 줄(daily·restore_test)과 사용자 목록이 보이는 것을 확인.
- current.md·state.json 갱신 · 보고서 `.ouroboros/docs/report/20261028_data-safety-2_report.md`.

---

## 11. rev2 — /qa spec 반영 (2026-10-28 · `qa/20261028_data-safety-2-spec_qa.md` 조건부 통과)

아래가 §4~§7 의 해당 부분을 **덮어쓴다**.

### 11.1 P1 (반영 완료 · 5de8810 이후)
- H-3: 로컬 띠 = 비로그인 · **완료한 운동 1회 이상**(`liftgram.nudge.anonCompleted ≥ 1`)일 때 미동기 1건부터 · 이 판정 전부터 쓰던 기기(완료 수 0)는 예전 기준 5건 · **`/workout` 에서는 숨김**. e2e 「운동 중 세트 저장 뒤에도 띠 없음 → 완료 뒤 보임」.
- L-8: 「그대로 다시 시작」이 시트를 닫는다(`setLoginNudge(false)`) · 시트는 `#modal-root` 덮개(휴식 막대·소리와 독립).
- L-9: `lastShownAt > now`(시계 되돌림)는 없는 것으로 본다 · 단위 테스트.
- 사용자 피드백(같은 릴리스 v0.49.0): ① 운동 화면 헤더(경과 시간·일시정지·완료) **sticky top-0**(앱 바와 같은 방식) ② 블록 도구 줄 순서 버튼 **맨 왼쪽**·두 버튼 붙임(36×44 · 사이 0). e2e `session-header-tools.spec.ts` · 기존 #62 너비 기준 44→36.

### 11.2 P2 백업 (M-1·M-2·M-3·L-2·L-3·L-4·L-7)
- 기록: `trap 'record' EXIT` 하나 + 상태 변수(`STAGE`·`OK`) · insert 는 `psql -v ON_ERROR_STOP=1 -v ok=… -v detail=…` 변수 인용(`:'detail'`) · 기록 insert 실패 시 backup.log 에 `RECORD_FAILED`.
- 표 칸 추가: `counts jsonb`(daily: 덤프 직전 같은 트랜잭션 `REPEATABLE READ` 로 센 `users`·`sync_records` 행 수).
- 복원 시험 ok = **그 덤프에 기록된 counts 와 정확히 같음**(운영 현재 수는 detail 에 참고로만) · 시작 시 남은 `liftgram_restore_test_%` 먼저 drop · `/var/lib/docker` 여유 < 덤프×3 이면 건너뛰고 `ok=false detail=low_disk_db` · `pg_restore --exit-on-error` · 대조 쿼리는 `-d` 명시.
- 0020 SQL 은 저장소 관례(`CREATE TABLE IF NOT EXISTS` · `@plm` 머리말 · 인덱스 이름).
- 경보 이유에 「기록 없음」(daily·restore_test 0줄)도 넣는다.
- crontab 확인: `(crontab -l 2>/dev/null || true)` · 스크립트 경로로 grep(중복 방지).
- 사진 주간 백업 결과 기록은 이번 범위 밖(다음 후보).

### 11.3 P3 운영 상태 (H-1·H-2·H-5·M-8·M-10·L-5·L-6)
- **보고 방아쇠 = 시도가 끝났을 때**(`lastSuccessAt` 또는 `consecutiveFailures`·`lastError` 가 바뀐 순간) · 즉시 보고: 실패 0→양수 · **연속 실패가 3 이상이 된 순간** · 실패→성공 · blocked 변화 · 그 밖 10분 쓰로틀.
- **stalled 식 = 기기 `isBackupStalled` 와 같은 식**(pending>0 && (blocked || failures≥3 || (stale24h && attempt 있음 && failures>0))) — 식은 core 한 곳(`core/src/domain/syncStall.ts`)에 두고 `useSyncHealth` 가 그것을 쓰게 바꾼다(원본 주석 보존) · Go 에는 같은 경계 표 테스트 복제.
- `client_health.first_reported_at`(upsert 에서 안 바꿈) · 기기는 `success_age_ms`·`attempt_age_ms`(= 기기 now − 시각)를 보내고 **서버가 server_now − age 로 시각을 계산**(시계 틀어짐 무관) · 음수 나이 0 · 「N일째」 = now − last_success(없으면 first_reported_at).
- 남용 방지: 사용자당 최신 8줄만 유지(같은 트랜잭션) · 사용자당 분당 6회(넘으면 조용히 무시) · `consecutive_failures` 0..10000 · `pending` 0..10^7 · `device_id` `[A-Za-z0-9_-]{1,64}` · `last_error` 제어문자 제거 200자 · 경보는 안내(남용은 /ops 에서 바로 보인다).
- admin 검사: claim 빠른 거부 뒤 **`users.role` 을 DB 에서 다시 읽어** admin 확인(`requireAdmin` · service 안 · Go 테스트 「claim admin · DB user → 거부」).
- 「마지막 로그인」 → 「마지막 활동(토큰 갱신)」(refresh_tokens max created_at).
- 비admin 은 클라이언트가 role 로 먼저 걸러 GetOpsAlert 를 부르지 않는다.
- device_id 는 보고 때 `sha256(device_id + user_id)` 앞 16자(계정 간 같은 기기 연결 숨김).

### 11.4 P4 다중 탭 — §7 을 이것으로 **바꾼다**(재 /qa spec 대상)
원리: 잠금·채널은 「누가 주인인가」를 정하고, **디스크 덮어쓰기 자체는 가장 아래에서 거부**한다(어느 경로가 어긋나도 남의 쓰기를 지우지 않게).

1. **안전망(1순위 · B-3)**: Loki 증분 어댑터의 저장을 감싼다. 저장 직전 디스크의 `loki` 청크 versionId 를 읽어 자기가 마지막에 본 값과 다르면 **저장하지 않고 봉인**(= 다른 탭이 썼다 → slow path 덮어쓰기 대신 거부) → 덮개(문구에 「이 탭의 저장 안 된 변경은 반영되지 않았어요」 · 로그). 이것만으로 다중 탭 소실의 근본 경로(slow path)가 닫힌다.
2. **autosave 끈 채로 열기(B-1)**: `core/src/db/adapter.ts` 진짜 DB `autosave:false` 로 연다 → 넘겨주기 끝(released 수신 · 이전 주인 없음 · 시간 초과) 뒤 `autosaveEnable()`. 그 전 `flushLocalDbResult()` = `"deferred"`(디스크 안 닿음). 넘겨주기 동안 `pauseSync()` · `runBootPipeline` 은 `writerReady` 를 기다린다. (a)안(DB 열기 전 대기)은 버린다.
3. **봉인(B-2)**: `lib/localDb.ts` `sealLocalDb()` — `autosaveDisable()` + 어댑터 saveDatabase 를 「디스크에 닿지 않고 오류 콜백」으로 바꿔 끼움 → flush 97곳·숨김 flush·Watermelon 내부가 전부 막힌다 · `flushLocalDbResult` = `"sealed"`(호출부 prefs 대기 표식·appUpdate 가 성공으로 오인하지 않는지 확인 목록) · 봉인된 탭을 새로고침하면 `buildAdapter()` 가 sessionStorage 표식을 동기적으로 읽어 스키마 가드처럼 **버리는 DB**(GUARD_DB_NAME 패턴 · autosave false)를 연다.
4. **넘겨주기 순서(H-4·M-7)**: 새 탭 = presence 잠금 → `isImportRunningElsewhere()`(중이면 claim 안 함·기존 안내) → writer steal → claim. 이전 주인 = 새 write 거부 문 닫기 → Watermelon 대기열 장벽(`await database.write(async()=>{})`) → flush(안전망 통과 시에만) → 봉인 → released. 기다림 = released 또는 `{t:"releasing"}` 진행 신호가 있으면 최대 5초 · 없으면 1.5초.
5. **봉인된 탭과 가져오기(M-5·M-9)**: 봉인된 탭은 presence 잠금을 놓는다(가져오기 판정 = 쓰기 가능한 다른 탭 수) · 「다른 탭에서 가져오는 중」 상태도 봉인을 부른다(기존 결함 M-9 함께 고침).
6. **범위(M-4)**: `@app/core/db` 를 여는 모든 문서(`/diag/db` 포함)가 writer 절차를 탄다 · 정적 페이지·`/sw-nudge.html` 만 예외.
7. L-1: flush 결과 이름 `"saved"|"failed"|"unreachable"|"deferred"|"sealed"` · unreachable 이면 경고 로그 + 진행.
8. e2e(M-6·B-2·B-3): ① **덮개와 무관한 소실 단언** — A 저장 → B 열기·저장 → A 에서 한 번 더 저장 시도 → 두 page 닫고 새 page 에서 세트 수(수정 전 빌드는 B 세트 소실로 실패) ② 숨김 이벤트(visibilitychange·pagehide)를 일부러 일으킨 뒤 IndexedDB 키·versionId 불변 ③ CDP `Page.setWebLifecycleState frozen` 으로 A 를 얼린 채 B 시간 초과·저장 → A 깨움 → B 세트 남음 ④ 넘겨받기 왕복 ⑤ 가져오는 탭이 있을 때 다른 탭 숨김·보임 뒤 가져온 행 남음.

### 11.5 P4 rev3 — 재검토(`qa/20261028_data-safety-2-p4-respec_qa.md` 조건부) 반영 · **§11.4 를 대체**

**결정: 「더 단순한 대안」을 채택한다.** 소실 방지는 저장 트랜잭션 안의 비교·거부 + 모듈 수준 문 두 가지로만 한다. 잠금 steal·claim 은 진 탭이 마지막 동작 하나를 잃지 않게 하는 UX 역할만 한다. autosave 끄기·`deferred`·넘겨주기 응답 대기(1.5/5초)·버리는 DB 는 **쓰지 않는다**(재검토 B-3·H-1·H-2 의 원인이 사라진다).

1. **트랜잭션 안 거부(B-1)**: lokijs `incremental-indexeddb-adapter.js` 의 `getLokiThenSave`(같은 readwrite 트랜잭션에서 `loki` 청크 versionId 를 읽고 다르면 slow path 로 덮는 분기)를 **`bun patch`** 로 고쳐, versionId 가 자기가 마지막에 본 값과 다르면 **트랜잭션을 중단하고 오류 콜백**(`LOKI_STALE`)으로 끝내게 한다(덮지 않는다). 패치 파일을 저장소에 둔다. 단위 테스트(fake-indexeddb · 두 어댑터 인스턴스로 A 저장 → B 저장 거부 · 단일 인스턴스 연속 저장은 거부 없음 · 자기 저장 뒤 versionId 갱신) 를 execute 첫 checkpoint 로 둔다.
2. **모듈 수준 문(H-2)**: `lib/localDb.ts` 에 `sealed` 상태(모듈 변수) — 저장이 `LOKI_STALE` 로 거부되면 그 자리에서 봉인. 봉인 뒤 `flushLocalDb*` 는 `"sealed"` 를 돌려주고 디스크에 닿지 않으며, Loki autosave 가 거부를 재시도해도 문에서 막힌다(리셋으로 새 Loki 가 생겨도 문은 모듈에 남는다).
3. **거부 뒤 규칙(B-2 (다))**: 쓰기 잠금(`liftgram-writer`)을 쥔 탭이 거부되면 = 「내가 주인인데 디스크가 바뀜」(넘겨주기 경합 · 다른 경로) → **1회 새로고침**(sessionStorage 표식 · 같은 탭 반복 방지 · 디스크 최신본으로 다시 읽기). 잠금이 없는 탭이 거부되면 → 봉인 + 덮개 `tab-elsewhere`(「다른 탭에서 열려 있어요 · 이 탭의 마지막 변경은 반영되지 않았을 수 있어요」 · `btn-tab-take-over`).
4. **UX 넘겨주기**: 앱 셸 시작 시 presence 잠금 → `isImportRunningElsewhere()`(중이면 기존 안내) → writer 잠금 steal. 빼앗긴 탭은 BroadcastChannel 로 즉시 알고: 새 write 문을 닫음 → Watermelon 대기열 장벽 → flush(안전망을 통과하면 저장, 아니면 봉인) → 봉인 → 덮개. 새 탭은 기다리지 않는다(경합은 1·3 이 처리). 「여기서 계속하기」 = **새로고침**(새로 연 탭과 같은 절차 — 봉인 탭 전용 모드 없음 · B-3).
5. **혼자 쓰는 사용자 회귀 금지(H-3)**: 새로고침·업데이트 새로고침·계정 전환 리셋·bfcache 복귀·한 문서 안 DB 재생성에서 덮개가 뜨지 않아야 한다 — 같은 탭의 이전 문서는 잠금을 놓고 사라지므로 steal 대상이 없고, 같은 문서의 리셋은 versionId 를 이어받는지 단위·e2e 로 확인.
6. **백필 표식(H-4)**: `runner.ts` 의 완료 표식은 flush 결과가 `saved` 일 때만 남긴다.
7. 봉인된 탭은 presence 잠금을 놓는다(M-5) · 「다른 탭에서 가져오는 중」 상태도 봉인(M-9) · `@app/core/db` 를 여는 모든 문서가 절차를 탄다(M-4).
8. **e2e(H-5)**: 모든 단언은 화면 클릭이 아니라 **IndexedDB 를 직접 읽어** 센다. ① A·B 두 탭 — B 저장이 디스크에 닿은 것을 확인 → A 에 숨김 이벤트(visibilitychange hidden·pagehide)로 flush 를 일으킴 → 디스크의 세트 수에 B 세트가 남음(수정 전 빌드: A 의 slow path 가 B 세트를 지워 실패) ② 언 탭: CDP frozen → B 저장 → A 깨운 뒤 숨김 이벤트 → B 세트 남음 ③ 넘겨받기 왕복(덮개·버튼) ④ 혼자 쓰는 사용자: 새로고침·업데이트 새로고침 뒤 덮개 없음 ⑤ 가져오는 탭이 있을 때 다른 탭 숨김 뒤 가져온 행 남음.
