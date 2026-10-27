# /qa code R1 서버 조치 보고 (CS-1~CS-9 + sync 숫자 검사)

- 2026-10-27 · 브랜치 feat/opengym-recs · 커밋 `49737ae` · 범위: src/backend·src/database(+sqlc 생성물). proto 는 바꾸지 않았다. 0017 마이그레이션도 고칠 필요가 없었다.
- 배포·merge·push 는 하지 않았다. 다른 에이전트의 src/core·src/frontend 파일은 add 하지 않았다.

## 지적별 조치

| ID | 조치 | 내용 |
|---|---|---|
| CS-1 높음 | ✅ 고침 | 새 패키지 `internal/jsonguard`. 바이트를 한 번 훑어 숫자 **글자**를 잰다. 글자 ≤ 32자, \|지수\| ≤ 30, float64 로 유한해야 한다. 스냅샷은 여기에 \|값\| ≤ 1e15 를 더 본다(epoch ms ≈1.8e12 때문에 1e12 가 아니라 1e15). 값만 보면 `0e-99999`(값은 0인데 PG 가 10만 자로 펼침)가 빠져나가므로 글자 모양으로 막는다. `InsertProgressSummary` 는 `RETURNING id, created_at` 만 돌려받는다. 재전송 비교(`GetProgressSummaryByMemberClient`)는 스냅샷을 싣지 않고 SQL `snapshot = @snapshot::jsonb` 결과만 받는다(`same_snapshot`). Go 의 sameJSON·reflect 비교는 없앴다. GetProgressSummary(열기)는 스냅샷이 꼭 필요해서 `SELECT *` 를 그대로 둔다. 들어오는 숫자를 막았으니 크기가 정해져 있다 |
| CS-2 중간 | ✅ 고침 | 같은 검사기가 문자열 속 `\uD800-\uDFFF` 짝을 본다. 짝 없는 높은 쪽·낮은 쪽, 키 안의 것까지 Validation 으로 돌린다(PG 오류 → Internal 이 되지 않는다) |
| CS-3 중간 | ✅ 고침 | `assertCoachingAccess` = assertActiveGrant + 양방향 차단 검사를 만들었다. 요약 보내기, 트레이너 쪽 Get, GetMemberRecords, 옛 GetMemberReport·ListMemberRoutines·SetMemberPrescription 이 모두 이것을 쓴다. 회원 본인은 자기 요약을 계속 연다. 차단할 때 grant 를 revoke 하는 근본 해결(feed→coaching 의존)은 하지 않았다 |
| CS-4 중간 | ✅ 고침 | 새 쿼리 3개를 만들었다. ① `ListMemberWorkoutsStartedIn`: 완료이고 `(payload->'started_at')::numeric` 이 [from,to) 안. 글자를 만드는 `->>` 대신 jsonb 를 바로 numeric 으로 바꾸고, CASE 로 평가 순서를 지켜 글자 started_at 에서 캐스트 오류가 나지 않게 했다. ② `ListMemberRecordsByParent`: 블록은 workout_id, 세트는 workout_exercise_id 가 부모 id 목록 안. ③ `ListMemberRecordsByIDs`: 쓰인 종목. 모두 record_id 키셋으로 500개씩 읽고, 읽은 payload 바이트를 **16MB 읽기 예산**에서 빼다가 넘으면 다음 페이지를 읽지 않고 ResourceExhausted 를 돌린다. Go 필터(selectMemberRecords)와 2MB 응답 상한은 방어로 그대로 둔다. 표현식 인덱스는 넣지 않았다(이유는 아래). 옛 GetMemberReport·루틴은 여전히 전 이력을 읽는다(기존 부채, 손대지 않음) |
| CS-5 낮음 | ✅ 고침 | 저장소 InsertProgressSummary 를 한 트랜잭션으로 바꿨다. `pg_advisory_xact_lock(hashtextextended(member_id, 80))` → 하루 개수 세기 → 넣기 순서다. 상한에 걸리면 같은 client_id 행이 있는지 다시 보고, 없을 때만 ResourceExhausted |
| CS-6 낮음 | ✅ 고침 | 기존 행 경로(재전송·동시 충돌)에서 `checkExistingSummary` 가 본다. 내용이 다르면 Conflict, `g.ConsentAt ≠ row.GrantConsentAt` 이면 Forbidden. 전달·알림·감사가 남지 않는다 |
| CS-7 낮음 | ✅ 고침 | `CreateAuditOnce`(INSERT … WHERE NOT EXISTS)를 넣었다. summary_view 는 같은 요약(detail 일치)이면 24시간에 1건, records_view 는 같은 트레이너·grant 면 기간이 달라도 10분에 1건만 남긴다. summary_send·request 같은 다른 감사는 그대로다. ListAudit 커서는 달지 않았다 |
| CS-8 낮음 | ✅ 고침 | `coaching.NewConnectHandler(svc, opts...)` 가 256KB 상한을 **마지막에** 붙인다. 그래서 opts 에 더 큰 값을 줘도 덮어쓰지 못한다. main.go 와 테스트가 같은 생성자를 쓴다. 테스트는 일부러 64MB 상한을 넘겨도 256KB 에서 막히는지 본다 |
| CS-9 낮음 | ◐ 문서화만 | 동작은 바꾸지 않았다. 내주는 기간이 최대 800일이고 동의 이전 기록도 포함된다는 점, 그 근거를 records.go 머리 주석에 적었다. 근거는 core periodSummary 의 직전 대비가 같은 길이를 요구한다는 것, 그리고 옛 리포트도 동의 이전 기록을 집계했다는 것이다. 이유: 요청 상한을 200일로 줄이면 core `periodSummary` 최대 400일 계약과 화면이 깨진다(다른 에이전트 범위). **ADR-040 개정에 「served ≤ 800일 · consent 이전 포함」 한 줄을 넣는 일이 남아 있다**(원래 폴더 문서라 손대지 않음) |
| 추가 · sync push | ✅ 넣음 | `parseRecord` 에 같은 숫자 글자 검사를 넣었다. 값 크기 상한은 없고 서로게이트는 보지 않는다. 기존 정상 데이터 근거: 개발 DB(liftgram-db-1 app, 읽기 전용 조회) sync_records 68,717행·330명의 숫자를 컬렉션마다 봤다. 글자 최대 13자, 값 최대 1.79e12(epoch ms). JS JSON.stringify 는 지수 ±308 안이라도 30을 넘는 지수를 만들 수 있지만, 그것은 1e31 이상이나 1e-30 미만의 값일 때뿐이다. 무게·횟수·ms·id(글자)에서는 나오지 않는다. 테스트는 MAX_SAFE_INTEGER·찌꺼기 소수·1e+21·음수를 받고, 1e130000·0e-99999·1e400·41자를 거부하는지 본다. 서로게이트는 바꾸지 않았다(지금도 PG 가 거부해 push 가 500 으로 실패한다). 오류 코드를 Validation 으로 바꾸면 클라이언트 대기열 처리가 달라질 수 있어 범위 밖으로 남겼다 |
| 추가 · dm 교착 | ✅ 고침(발견) | CS-5 동시 25건 PG 테스트에서 **실제 교착**을 찾았다. `dm.FindOrCreateDirect` 는 첫 DM 대화를 동시에 만들다 유일 제약에 걸리면, 실패한 tx 연결을 쥔 채 풀에서 새 연결을 기다린다. 동시 요청 수가 풀 크기보다 많으면 모두가 서로를 기다려 멈춘다(pg_stat_activity: 11개가 `idle in transaction (aborted)`). 다시 조회하기 전에 `tx.Rollback` 하는 한 줄로 고쳤다 |

### 표현식 인덱스를 넣지 않은 이유(CS-4)
(user_id, collection, record_id) 유일 인덱스가 회원·컬렉션까지 좁혀 준다. 0017 에 sync_records 표현식 인덱스를 넣으면 배포 때 운영 큰 표에 잠금을 잡고 인덱스를 만든다(CONCURRENTLY 는 마이그레이션 러너 트랜잭션과 맞지 않는다). 응답 시간이 문제 되면 새 마이그레이션으로 넣는다(records.go 주석).

## 테스트 수치
- `go test ./...` 전부 통과, `go vet ./...` 0, `make proto-check` ✓, `make docs-check` 「문서와 코드가 일치한다」.
- 실제 PG(src-db-1 · `e2e_og_fix_<시각>` · 17개 마이그레이션 적용): `LIFTGRAM_TEST_DATABASE_URL` 로 전체 `./...` 통과. coaching·sync·dm·jsonguard 는 `-race -count=3` 도 통과. 끝난 뒤 DROP 했고 남은 `e2e_og_fix_%` 는 0개.
  - 펼침 재현(가벼운 판): `'{"a":1e100000}'::jsonb` 는 저장 ≤ 64B 인데 글로는 ≥ 100,000자다. 서비스는 1e130000·0e-99999·`\ud800`·1e20 을 모두 Validation 으로 거부하고 행 0개.
  - jsonb 동등 재전송: 키 순서·공백·1.0/1 이 달라도 같은 id, 값이 다르면 Conflict.
  - 동시 25건(client_id 다름) → 성공 20 · ResourceExhausted 5 · 행 20 · 메시지 20.
  - SQL 필터: 운동 w1·w2만(진행 중·90일 전·글자 started_at·옛 `1e130000` 행 제외) · 블록 we1·we2(숫자 부모 id 제외) · 세트 s1(지운 것 제외) · 종목 cx1 · 예산 10B → ResourceExhausted · 세트 1,201개를 키셋 페이지로 빠짐·겹침 없이 읽음.
  - 감사: 원본 5회 → records_view 1건, 같은 요약 3회 → summary_view 1건. 차단 → 요약·원본 Forbidden.
- 새 단위 테스트: `jsonguard_test.go` 4개(실제 값 받음 · 숫자 거부 11종 · MaxAbs · 서로게이트 6종), `summary_qa_test.go` 5개(큰 숫자·서로게이트 10종 + 정상 스냅샷 · 차단 4경로 · 읽기 예산 조기 중단 · 재계약 재전송 Forbidden · 감사 창), sync 1개(거부 4종 + 실제 값 4레코드).
- 변이(스크래치 사본) 10건: 잠금 제거 · 숫자 검사 끔 · 서로게이트 끔 · 차단 검사 끔 · 감사 합치기 끔 · 재계약 검사 끔 · 읽기 예산 끔 · SQL 기간 필터 끔 · sync 숫자 검사 끔 · 핸들러 상한 끔 → **10건 모두 잡힘**. 「SQL 기간 필터 끔」은 처음에 살아남았다(Go 필터가 한 번 더 걸러서). 그래서 저장소 단계를 직접 보는 단언을 PG 테스트에 더했고, 그 뒤로는 잡힌다.

## 남은 일 · 알림
- ADR-040 개정: CS-9 한 줄(위).
- 옛 GetMemberReport·ListMemberRoutines 는 여전히 전 이력을 읽는다(기존 부채). 같은 기간 쿼리로 옮길 수 있다.
- sync push 의 짝 없는 서로게이트는 아직 PG 500 이다(위 이유).
- 클라이언트 영향: 하루 상한·재계약 재전송·차단은 이미 영구 실패로 다루는 코드(ResourceExhausted·PermissionDenied)로 돌아온다. 새 코드는 없다.
