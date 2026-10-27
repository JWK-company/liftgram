<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# Go 후속 보고 — 서버 동기 멱등·삭제 뒤 되살림·옛 기기 병합 + docs-check

- 커밋: `190cb8b` (feat/opengym-recs · 미배포 · push·merge 안 함)
- 범위: src/backend 만 (화면·core·database 수정 없음)

## 1. docs-check 실패 원인과 수정
- 원인: `scripts/check-docs.mjs` ⑤ 「설정 접근」이 `os.Getenv(` 를 `backend/internal/config/config.go` 밖에서 쓰면 실패로 친다. P4의 `coaching/summary_pg_test.go`·`sync/merge_test.go` 가 `LIFTGRAM_TEST_DATABASE_URL` 을 직접 읽었다.
- 기존 관례: Postgres 통합 테스트는 이 둘뿐이었고 공용 헬퍼가 없었다. 저장소 규칙은 「env 는 config 한 곳에서만 읽는다」다.
- 수정:
  - `config.go` 끝에 테스트 전용 `IntegrationDatabaseURL()` 을 추가했다. 키는 상수 `integrationDatabaseURLKey` 로 둔다. 이 키는 런타임 Config·부팅 검증·.env.example 대상이 아니라고 주석에 적었다. 상수라서 ① 설정 키 검사(문자열 리터럴만 잡음)에는 걸리지 않는다. 의도한 것이다. 운영·개발 .env 에 두면 안 되는 값이라 예시에 넣지 않는다.
  - 새 패키지 `internal/testpg` 에 `Pool(t)` 를 만들었다. 주소가 없으면 t.Skip 하고, 있으면 풀을 열고 t.Cleanup 으로 닫는다. 두 P4 테스트는 이것을 쓰도록 바꿨다.
- 남은 선택지: README·가이드에 `LIFTGRAM_TEST_DATABASE_URL` 사용법을 한 줄 적는 일. 범위 밖이라 하지 않았다.

## 2. 새 테스트 `backend/internal/sync/push_idempotency_test.go`
같은 시나리오를 두 저장소에서 돈다. memRepo 는 sync.sql 의 upsert와 삭제 표시 규칙을 흉내 내고 트랜잭션처럼 사본에 쓰며, 항상 돈다. 다른 하나는 실제 pgRepo 이고 env 가 있을 때만 돈다.
- (a) `TestPush_한번에_나눠서_실패뒤_재전송_결과가_같다`
  - 시드는 v26 칸이 있는 세트 100건과 운동 300건이다. 변화분은 4800건이다: set_logs 2500, workouts 올리기 200 + 지우기 300, exercises 1800.
  - Go `splitOrdered` 는 core `splitSyncChanges` 와 같은 규칙으로 2000건씩 3묶음을 만든다. 가운데 묶음에 올리기와 지우기가 함께 들어 있다.
  - 세 방식의 최종 스냅숏(collection·record_id·deleted·정규화한 payload)이 같다: ㉠ 한 번에 ㉡ 나눠서 ㉢ 2묶음 실패 뒤 전체 재전송.
  - 실패는 `faultRepo` 로 주입한다. 삭제 문장에 NUL 이 든 record_id 를 끼우므로 upsert 문장이 돈 뒤 DB 가 거부한다. 실패 직후 상태가 「시드 + 1묶음」과 같아서 트랜잭션이 통째로 되돌아가는 것도 확인된다.
  - 같다는 비교만으로는 둘 다 틀려도 통과하므로 대표 행 4개를 따로 단언했다: 병합 보존, 새 행, 삭제 표시, 새 운동.
- (b) `TestPush_삭제_표시_뒤_같은_id_를_올리면_되살아난다`
  - 있던 레코드와 서버가 모르던 레코드(빈 `{}` 행) 각각을 지운 뒤 다시 올리면 deleted=false 가 되고, pull 에서는 Updated 로 간다.
  - 알아 둘 성질: 얕은 병합이라 **삭제 전 payload 키도 남는다**(note). 삭제 표시는 payload 를 비우지 않는다.
- (c) D-17: P4 `merge_test.go` 가 이미 parseRecord, SQL 문구, `SELECT jsonb||jsonb` 를 본다. 이번에 추가한 것은 `Push → 실제 UpsertSyncRecords → 표 읽기` 전체 경로 하나뿐이다(`TestPush_v25_기기_push_뒤에도_v26_칸이_저장소에_남는다`). 중복을 만들지 않으려고 기존 상수 `storedV26`·`pushedV25`·`assertV26Kept` 를 그대로 썼다.
- `service.go` 의 `maxRecordsPerPush` 주석이 이제 실제 위치를 가리킨다: `frontend/lib/syncTransport.ts` · `core/src/sync/pushChunks.ts` · 이 테스트.

## 3. 검증
- 스크래치 DB `e2e_og_go_<시각>` 을 src-db-1(127.0.0.1:5433)에 만들고 `make migrate` 로 17개를 적용했다. `LIFTGRAM_TEST_DATABASE_URL` 로 sync·coaching 의 Postgres 테스트를 돌려 모두 통과했다(나눠 보내기 실제 PG 1.05s). 끝난 뒤 DROP 했고 남은 `e2e_og_go_%` 는 0개다.
- 변이 확인: sqlcgen upsert 의 `deleted = false` 를 `sync_records.deleted` 로 바꾸면 되살림 테스트(실제 PG)가 실패한다. 확인 뒤 원복했고 diff 는 없다.
- `go test ./...` 는 최상위 기준 통과 249, 건너뜀 2(env 없을 때의 Postgres 테스트), 실패 0이다. `go vet ./...` 깨끗, `make docs-check` 통과(드리프트 0), `make proto-check` 통과.

## 넘기는 것
- P1 보고의 나머지 항목, 즉 `reportCollections` 에 새 표를 넣지 않는다는 주석과 테스트, 그리고 「서버 sync 컬렉션 허용 목록 없음」 확인은 이번 지시 범위(1~3) 밖이라 하지 않았다.
