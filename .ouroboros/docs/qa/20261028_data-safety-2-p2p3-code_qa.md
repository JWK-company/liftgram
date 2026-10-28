# /qa code — 데이터 안전 2차 P2·P3 (SRS-087 백업 결과·복원 시험 · SRS-088 운영 상태)

- 대상: worktree `/Users/woobi/Desktop/tarae/liftgram-wt-safety` 커밋 `580b84f`
- 근거: spec `20261028_data-safety-2/spec.md` §5·§6·§11.2·§11.3 · qa spec `20261028_data-safety-2-spec_qa.md` · 구현 보고 `report/_work/20261028_p2p3_execute.md` · SRS-087·SRS-088
- 검토자(역할): Go/PostgreSQL 백엔드 보안 엔지니어 · 운영/셸 스크립트·백업 엔지니어 · 프런트엔드 엔지니어
- 코드는 고치지 않았다.

## 판정: **조건부 통과** — H 1건을 고친 뒤 배포. M은 이번 배포에 같이 고치는 것을 권한다.

보안 축(admin 검사·남용 방지·개인정보·SQL)은 실측으로 문제가 없었다. 결함은 **판정의 의미**(서버는 멈춰 버린 보고를 보고 판정한다)와 **운영 절차**(첫 배포 순서·부분 파일) 쪽에 있다.

---

## 실측 기록(로컬 · 운영 서버 미접속)

| 항목 | 방법 | 결과 |
|---|---|---|
| 미로그인 보고 | API 3201 `ReportClientHealth` 토큰 없이 | `unauthenticated` ✓ |
| 일반 계정 → GetOpsAlert·GetOpsStatus | 새로 가입한 계정 | 둘 다 `permission_denied` ✓ |
| claim admin + DB 강등 | DB에서 role 올리고 LogIn → 호출(alert 3) → DB에서 user로 → **같은 토큰**으로 다시 | `permission_denied` ✓ (DB 역할 재확인 동작) |
| 기기 id 주입 | `x'; drop table users;--` | `invalid_argument` ✓ (정규식 거절 · 쿼리는 전부 sqlc 바인딩) |
| 입력 자르기 | 버전 100자·성공 나이 −5000·시도 나이 1e17·실패 2^31−1·pending −3·오류 300자+`\n`·`\0` | 버전 32 · 성공=reported_at(미래→now) · 시도=10년 전(상한) · 실패 10000 · pending 0 · 오류 200자·줄바꿈 없음 ✓ |
| 분당 6회 | 같은 계정으로 10번(서로 다른 기기 id) | 10번 모두 200 · 저장 6줄(devA+dev1..5) — 넘친 4번은 조용히 버림 ✓ |
| 이메일 노출 | admin `GetOpsStatus` JSON 전체에서 `@example.com` 검색 | 없음 · `qa-…`·`e2e…` ✓ |
| 백업 스크립트(정상) | 임시 DB `qa_ops_tmp`(e2e DB 복사) · `BACKUP_DIR`·`LIFTGRAM_SRC`·`SKIP_MEDIA=1` | 스냅샷 경로로 성공(counts_approx 아님) · 줄 `daily ok · tables 28 · counts {"users":12,"sync_records":16}` · 덤프 600 ✓ |
| 복원 시험(정상) | 같은 조건 | `expected=12 16 restored=12 16` ok · 임시 DB 남지 않음 ✓ |
| 복원 시험(남은 DB·counts 없는 최신 덤프) | `liftgram_restore_test_1` 만들고 counts 줄 없는 더 새 덤프 복사 | 남은 DB 정리됨 · `no_counts · failed stage=find_dump` ok=false로 기록 ✓ |
| 백업 덤프 단계 실패 | users·sync_records만 SELECT 되는 역할로 실행 | `failed stage=dump rc=1` 기록 ✓ · 스냅샷 세션 남지 않음 ✓ · **`.dump.part`(0바이트·권한 644)가 남음** ✗ (M-2) |
| 배포 cron 단계 | 원격 본문을 그대로 뽑아 가짜 `crontab`(PATH 앞)으로 2회 실행 · 기존 줄(MAILTO·다른 작업) 있음/빈 crontab | 기존 줄 보존 · 두 줄 1회만 추가 · 2회째 「있음」 ✓ |
| Go 테스트 | `go test ./internal/ops/` + `LIFTGRAM_TEST_DATABASE_URL`로 `TestPgRepo_*` | 통과 ✓ |

시험 뒤 임시 DB(`qa_ops_tmp`)·역할(`qa_lim`)·시험 계정은 지웠다. (`date -Is` 는 macOS date 가 몰라 로컬 로그 줄만 깨진다 — 운영 Linux는 정상.)

---

## H — 배포 전 수정

### H-1. 말이 끊긴 기기가 「멈춤」으로 굳어 최대 90일 동안 지울 수 없는 경보가 된다
- 근거: `src/backend/internal/ops/service.go:246-258`(IsStalled) · `:337`·`:377`(90일 창 전체를 판정) · `:386-390` · `src/frontend/lib/clientHealth.ts:57-71`(보고는 시도가 끝날 때만)
- 무엇이 문제인가: 식은 기기와 같지만 **`now`의 뜻이 다르다.** 기기는 앱이 열려 있을 때만 판정하고, 열리면 곧 다시 시도해 상태를 갱신한다. 서버는 마지막 보고를 그대로 둔 채 매번 **서버의 지금**으로 판정한다. 그래서
  - 배포 재시작·잠깐의 서버 오류 때 운동을 마친 사용자(실패 1·pending>0 · 0→1이라 즉시 보고)가 하루 넘게 앱을 안 열면 → 24시간 가지의 `stale` 이 참이 되어 **서버만 「멈춤」**. 사용자 기기는 다음에 열면 바로 성공한다.
  - PWA 재설치·저장소 비우기·다른 브라우저로 기기 id 가 바뀌면 옛 줄은 다시 보고되지 않는다 → 그 줄의 멈춤이 90일 동안 남는다. 새 기기가 잘 동기해도 사라지지 않는다.
  - 이탈한 사용자(실패 뒤 다시 안 옴)도 같다.
  - 「확인함」 같은 끄기 수단이 없으니 admin 탭의 빨간 점이 **늘 켜진 경보**가 되고, 진짜 멈춤(2026-10 사고 같은)이 묻힌다. 기능의 목적을 깎는 결함이라 H로 둔다.
- 수정안(작은 순서대로, ①만으로도 H 해소):
  1. 경보·「동기가 멈춘 사용자」 목록은 **최근 보고(`reported_at` ≥ now − 72h 등)인 줄만** 판정한다. 진짜 멈춘 기기는 앱을 쓰는 동안 계속(최소 10분 쓰로틀로) 보고하므로 잡힌다. 그보다 오래된 멈춤 줄은 「연락 끊긴 기기」로 따로 회색 목록에(경보 아님).
  2. 같은 사용자의 **더 새 보고가 건강하거나** 서버 `last_sync_at`(sync_records max updated_at)이 그 줄의 `reported_at` 보다 뒤면 그 줄은 멈춤에서 뺀다(기기 교체·재설치 대응).
  3. Go 경계표에 「마지막 보고 4일 전·실패 1·성공 25시간 전 → 경보 아님」 줄 추가(TS 표는 기기 쪽이라 그대로 둬도 된다 — 차이를 머리말에 적는다).

---

## M — 이번 배포에 같이 권장

### M-1. 분당 상한에 걸린 보고를 기기는 「보냈다」고 적는다 → 급한 변화가 사라질 수 있다
- 근거: `src/backend/internal/ops/handler.go:47-51`(accepted 버림 · 빈 답) · `src/frontend/lib/clientHealth.ts:155-167`(성공 응답이면 `writeSent`)
- 같은 계정의 탭 여럿·「지금 동기」를 연달아 누르기 등으로 1분에 6번을 넘기면, 3회째 실패(멈춤 문턱) 보고가 서버에서 조용히 버려지고 기기는 `failures=3` 을 보낸 것으로 적는다. 그 뒤엔 10분 쓰로틀이라, 사용자가 앱을 닫으면 서버에는 실패 2로 남는다(H-1의 반대 방향 — 놓침).
- 수정안: `ReportClientHealthResponse { bool accepted = 1; }` 를 내려 주고, 기기는 `accepted` 일 때만 `writeSent`. (오류로 바꾸지 않는 지금 방침은 유지.)

### M-2. 백업 실패 때 `.dump.part` 가 남고 쌓인다 · 쓰는 동안 권한이 644
- 근거: `src/scripts/backup-h2500-3.sh:127`(리다이렉트 대상) · `:134`(mv 뒤에야 chmod 600) · `:147`(정리는 `*.dump` 만) — 실측: 덤프 단계 실패 뒤 `liftgram-…-110301.dump.part`(644) 잔존
- 같은 원인으로 매일 실패하면 실행마다 새 이름의 부분 파일이 백업 디스크(/home)에 쌓여 결국 `low_disk` 를 스스로 부른다. 늦게 죽은 덤프는 거의 전체 크기다. 또 쓰는 동안 남이 읽을 수 있다(기존부터 있던 문제지만 이번에 이 파일을 손봤다).
- 수정안: 맨 위 `umask 077` · `record()` 에서 `rm -f "$DIR"/daily/*.part`(또는 `$f.part`) · 회전에서도 하루 넘은 `.part` 정리. 사진 tar 도 같은 umask 로 덮인다.

### M-3. 첫 배포 순서 — 복원 시험을 먼저 돌리면 「복원 시험 실패」가 한 달 동안 붙는다
- 근거: `src/scripts/deploy-h2500-3.sh:155`(「두 스크립트를 손으로 한 번씩」 — 순서 없음) · `src/scripts/restore-test-h2500-3.sh:77`(가장 새 파일) · `:89`(counts 없으면 실패) · `service.go:292-298`(마지막 restore_test 줄이 실패면 다음 달까지 `restore_failed`)
- 운영의 기존 덤프들은 이 커밋 전 스크립트가 만들어 counts 줄이 없다. 배포 직후 복원 시험을 먼저 돌리면 `no_counts` 로 ok=false 가 남고, 다음 달 1일까지 빨간 점이 `restore_failed` 로 유지된다(한 번 더 돌리면 풀리지만 절차가 그걸 말하지 않는다). 아무것도 안 돌리면 `daily_none` 은 다음 04:17까지, `restore_none` 은 **다음 달 1일까지** 켜진다.
- 수정안: 안내 문구를 「① backup-h2500-3.sh → ② restore-test-h2500-3.sh 순서로」로 고치고, 배포 스크립트가 `ops_backup_runs` 에 restore_test 줄이 하나도 없을 때만 ①→② 를 한 번 돌려 주는 선택지(`FIRST_BACKUP=1`)를 두거나 최소한 `/ops` 의 restore_none 문구에 「첫 시험 전」 표시. 구현 보고서·README 의 첫 배포 절차에도 같은 순서를 적는다.

### M-4. 복원 시험이 「실패한 날의 덤프」를 고를 수 있다
- 근거: `restore-test-h2500-3.sh:77`(ls -1t 최신 파일) · `backup-h2500-3.sh:134-139`(mv 뒤 verify — 빈 덤프도 `.dump` 로 남는다)
- 가장 새 daily 가 verify 에서 실패했으면 그 파일이 최신이고 counts 줄은 ok=false 라 `no_counts` → 복원 시험이 「실패」로 기록된다. 실제로 되살릴 수 있는 어제 덤프가 있는데도 그렇다. 판정이 「백업 실패」와 「복원 불가」를 섞는다.
- 수정안: 덤프 선택을 DB 에서 — `SELECT detail FROM ops_backup_runs WHERE kind='daily' AND ok AND counts IS NOT NULL ORDER BY id DESC LIMIT 1` 의 `file=` 로 파일을 찾고, 그 파일이 없으면 실패. 그리고 backup 쪽은 verify 를 `.part` 단계에서 하고 통과해야 mv.

---

## L — 다음에

- **L-1** `backup-h2500-3.sh:65` `exec 3>&- 2>/dev/null` 은 「명령 없는 exec」라 **셸의 stderr 를 그 뒤 계속 /dev/null 로 돌린다** → 기록 insert 의 psql 오류가 로그에 안 남고 `RECORD_FAILED` 한 줄만 남는다. `exec 3>&-` 만 쓰고 오류 억제가 필요하면 `{ exec 3>&-; } 2>/dev/null`.
- **L-2** 두 스크립트 모두 `trap record EXIT` 가 `cd`·`.env` 읽기 **뒤**에 걸린다(`backup:34-39`·`:92`, `restore:21-24`·`:62`). 거기서 죽으면 줄이 없다(36시간 뒤 `daily_stale` 로는 드러남). trap 을 맨 앞으로 옮기고 U·D 가 비면 기록만 건너뛰게.
- **L-3** `deploy-h2500-3.sh:143-148` cron 경로가 `$HOME/liftgram` 고정 — `REMOTE` 를 바꿔 배포하면 cron 이 엉뚱한 곳을 본다. 또 주석 처리한 줄(`# 17 4 … backup-h2500-3.sh`)도 「있음」으로 봐서 사람이 꺼 둔 cron 이 조용히 계속 꺼져 있다(의도면 안내 문구에 「주석 줄도 있음으로 본다」 표시). `crontab -l` 이 빈 crontab 이 아닌 이유(권한 등)로 실패해도 `|| true` 라 기존 줄을 덮어쓸 수 있다 — `crontab -l` 의 표준오류가 "no crontab" 일 때만 빈 것으로.
- **L-4** `restore-test-h2500-3.sh:94` 여유 = 덤프×3 — `-Fc` 압축 덤프는 복원 후 인덱스 포함 5~10배가 흔하다. 지금 규모(100KB대)는 무관하나 DB 가 커지면 운영 DB 디스크를 채울 수 있다(같은 클러스터·같은 디스크). ×10 또는 `pg_restore -l` 로 추정.
- **L-5** `EmailHint`(`service.go:437-447`) — 로컬 부분이 3자 이하면 전부 드러난다(`ab@…` → `ab…`). 최대 `min(3, len−1)` 자로.
- **L-6** 탈퇴 직후 아직 살아 있는 access 토큰으로 보고하면 FK 위반 → 500(내부 오류 로그). `UserRole` 처럼 없는 사용자는 조용히 무시.
- **L-7** e2e `ops-status.spec.ts` — 「빨강 채움 금지」를 `ops-summary` 바탕 하나만 잰다(메모리 「색 규칙 가드는 전 채널」: li·AppText 바탕·테두리도). 비admin 이 `GetOpsAlert` 를 **부르지 않는다**는 것(qa spec L-5)도 네트워크로 확인하지 않는다 — 일반 계정 테스트에 `page.on('request')` 로 `OpsService/GetOpsAlert` 0건 단언 추가.
- **L-8** Go 핸들러 변환(`handler.go:109-126` pending −1 · `last_ok_daily_at`)에 테스트가 없다. 서비스 테스트는 충분하다.
- **L-9** 동기가 **인증 단계에서** 죽은 기기(refresh 회수 등)는 보고 RPC 도 같은 인증이라 못 보낸다 — 운영 화면의 사용자 목록 `last_sync_at`·`last_active_at` 으로만 보인다. 설계 한계로 SRS-088 또는 /ops 문구에 명시.

---

## 확인한 것(문제 없음)

- **admin 검사**: `GetOpsStatus`·`GetOpsAlert` 둘 다 `requireAdmin`(빈 id 401 → claim≠admin 403 → DB `role` 재확인 403). 보고 RPC 는 역할 무관·로그인 필수. 실측으로 강등 즉시 거절.
- **남용 방지**: 정규식 기기 id · 버전 32/오류 200(룬·제어문자 제거) · 실패·pending 범위 · 나이 10년 상한 · 사용자당 8줄(upsert 와 같은 트랜잭션 · 실DB 테스트 통과) · 분당 6회(정규화 실패는 횟수에 안 셈). 계약 상한(4000 등)은 본문 크기만 묶음.
- **개인정보**: 응답에 전체 이메일 없음 · 기기 id 는 sha256(id+user) 16자(보안 문맥 없으면 FNV — 목적에 맞음).
- **SQL**: 서버는 전부 sqlc 바인딩. 스크립트 insert 는 psql `:'var'` 인용(표준입력) — detail 에 따옴표가 들어가도 안전. 정리 쿼리도 `:'pfx'` + 정규식 이중 검사로 다른 DB 를 못 건드림.
- **판정 일치**: Go `IsStalled` ↔ core `isBackupStalled` 식·경계표 10줄이 줄 단위로 같다. `useSyncHealth` 는 원본 주석 보존 후 core 호출로 교체(§3.6 준수).
- **시각**: 서버가 `now − age` 로 재계산 · 음수→now · 상한. `first_reported_at` 은 upsert SET 에 없어 보존(실DB 테스트).
- **경계**: daily 36h(`>`)·restore 40일·`daily_none`/`restore_none`/`restore_failed`·`low_disk`(마지막 daily detail) — 서비스 테스트에 경계 있음.
- **pg_dump --snapshot**: 같은 컨테이너에서 REPEATABLE READ 세션이 `pg_export_snapshot()` 을 내보내고 덤프가 끝날 때까지 열어 둔 채 같은 스냅샷으로 센다 — 타당하고, 실측에서 스냅샷 경로로 성공·세션 정리됨. 실패 시 근사 경로(`counts_approx`)도 있음.
- **복원 시험**: 같은 클러스터·다른 이름 · `--no-owner --exit-on-error` · `-d` 대상 명시 · 남은 DB 정리 · 항상 drop(trap) · 판정은 덤프 때 counts 와 정확 일치 · 운영 DB 쓰기는 결과 한 줄.
- **docker exec·.env**: 컨테이너 이름·`.env` 의 `POSTGRES_USER/DB` 만 읽고 값 미출력. 운영 이미지 `pgvector/pgvector:pg18`(Debian) 이라 컨테이너 안 GNU `df -B1 --output` 동작(로컬 같은 이미지로 확인).
- **배포 cron**: 기존 줄 보존·중복 방지·빈 crontab 처리 실측 통과.
- **마이그레이션 0020**: 새 표 2개·인덱스만(`IF NOT EXISTS`) — 기존 데이터 무변경. `users` FK 생성은 빈 표라 잠금이 순간적. 되돌리기 = 옛 바이너리가 표를 무시(이 저장소 관례상 down 없음) · 필요 시 `DROP TABLE client_health, ops_backup_runs`.
- **프런트**: 보고 = 시도 끝(값 변화) 뒤 미동기 수 갱신 대기(≤2s) · 로그인·온라인일 때만 · 실패 삼킴 · 보내는 중 끝난 시도는 큐. `blocked` 도 `SyncBlockedError` 로 실패가 늘어 보고됨. 첫 구독 값은 기준만(엔진이 저장된 실패 수를 구독 전에 복원). `opsAlert` 는 viewer=admin 일 때만 묻고, 권한 거절이면 끔. 탭 점: 운영 빨강이 업데이트 회색보다 우선(같이면 빨강만) · sr-only 문구. `/ops` 이유는 빨강 **글자**·채움 없음. 탭 match 에 `/ops` 추가.

## 요약표

| ID | 등급 | 한 줄 |
|---|---|---|
| H-1 | H | 서버가 끊긴 보고를 「지금」으로 판정 → 이탈·재설치·배포 순간 실패가 90일 상시 경보 |
| M-1 | M | 분당 상한으로 버린 보고를 기기가 「보냄」으로 적음 → 3회 문턱 보고 소실 가능 |
| M-2 | M | 실패 시 `.dump.part` 잔존·누적 · 쓰는 동안 644 |
| M-3 | M | 첫 배포 순서 미명시 — 복원 시험 먼저면 한 달간 `restore_failed`, 안 돌리면 한 달간 `restore_none` |
| M-4 | M | 복원 시험이 verify 실패한 최신 덤프를 골라 「복원 불가」로 오판 |
| L-1~9 | L | stderr 영구 차단 · trap 위치 · cron 경로/주석/덮어쓰기 · 디스크 배수 · 짧은 이메일 · 탈퇴 FK 500 · e2e 가드 · 핸들러 테스트 · 인증 죽은 기기 한계 |
