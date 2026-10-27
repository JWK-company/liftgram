# P4 서버 보고 — 성과 요약 저장·전달 · 회원 원본 레코드 (SRS-080 · ADR-040·041)

- 커밋: `9de1998` (브랜치 feat/opengym-recs · 미배포 · push·merge 안 함)
- 작업 폴더: /Users/woobi/Desktop/tarae/liftgram-wt-opengym (src/backend·proto·database·생성물만)

## 바꾼 파일
- 새 파일: `database/migrations/0017_progress_summaries.sql` · `backend/internal/coaching/{summary,records}.go` · 테스트 `coaching/{summary_test,summary_pg_test,handler_summary_test}.go` · `dm/summary_test.go` · `sync/merge_test.go`
- 수정: `proto/{coaching,dm,notification}/v1/*.proto` · `database/queries/{coaching,dm}.sql` · `coaching/{service,repo,handler,report,service_test}.go` · `dm/{service,handler,repo}.go` · `notification/{service,handler}.go` · `errs/errs.go`(ResourceExhausted) · `middleware/errors.go`(매핑) · `cmd/server/main.go`
- 생성물: `backend/gen/{coaching,dm,notification}` · `contracts/gen/{coaching,dm,notification}` · `backend/internal/db/sqlcgen/{coaching.sql,dm.sql,models}.go`

## 테스트 수치
- `go test ./...`: 통과 310 · 실패 0 · 건너뜀 2(실제 Postgres 테스트 2건, 환경변수가 있을 때만 돎). `go vet ./...` 깨끗. `make proto-check` 통과(커밋 뒤).
- 새 테스트 30개: coaching 20(summary 17 · handler 2 · pg 1) · dm 7 · sync 3.
- 실제 Postgres(스크래치 DB `e2e_og_p4_*`, src-db-1:5433, 끝난 뒤 DROP): 마이그레이션 두 번 적용(두 번째는 skip) · 0017을 psql로 다시 넣어도 멱등 · `LIFTGRAM_TEST_DATABASE_URL`로 통합 테스트 통과(`-race -count=15` 포함). 보내기/재전송/동시 2요청 → 메시지 1건 · 알림 1건 · 감사 1건. 해지 → 재계약 → 옛 요약은 거부, 새 요약은 열림. µs 커서. DM 미리보기에 SUMMARY와 ref_id가 실림.
- 변이 확인: consent 비교와 `recorded` 검사를 각각 꺼 보면 해당 테스트가 실패한다.

## 새 RPC 계약 (coaching.v1.CoachingService · 넷 다 POST · 응답 `Cache-Control: no-store`)
기간은 모두 epoch ms이고 [start, end) 구간이다. 오류 코드는 Connect 코드다.

| RPC | 요청 | 응답 | 오류 |
|---|---|---|---|
| SendProgressSummary | trainer_id(1–64) · period_start/end(>0) · schema_version(≥1, 서버 지원 {1}) · snapshot_json(2B–64KB) · client_id(uuid) | summary_id | invalid_argument(판·JSON·객체 아님·최상위 schemaVersion 불일치·`\u0000`·기간 거꾸로/400일 초과/끝이 now+1일 넘음·자기 자신) · permission_denied(관계 없음·해지·logView 꺼짐·차단) · already_exists(같은 client_id에 다른 트레이너·기간·스냅샷) · resource_exhausted(최근 24시간 20건) · DM 실패 시 internal(행은 미전달 상태로 남음 → 같은 client_id로 재전송하면 그때 감) |
| GetProgressSummary | id | summary{id, member_id, trainer_id, period_start, period_end, schema_version, snapshot_json, created_at} | not_found(없음 ∨ 당사자 아님 — 같은 회원의 다른 트레이너도 여기) · permission_denied(받은 트레이너인데 해지·logView 꺼짐·재계약 전 요약) |
| ListSentSummaries | cursor(≤200, 비우면 최신부터) | summaries[]{id, trainer_id, period_start, period_end, schema_version, delivered, created_at}(최대 50 · 스냅샷 없음) · next_cursor(끝이면 "") | invalid_argument(깨진 커서) |
| GetMemberRecords | member_id · period_start · period_end | workouts[] · workout_exercises[] · set_logs[] · exercises[](각 원소 = 허용 칸만 남긴 JSON 문자열, 기기 raw와 같은 snake_case 키) · served_start · served_end | invalid_argument(기간) · permission_denied(관계·logView) · resource_exhausted(응답 2MB 초과 → 「기간을 줄여 주세요」) |

- 허용 칸: workouts={id,state,started_at,completed_at,duration_seconds,total_volume_kg,pr_count,routine_id,source} · workout_exercises={id,workout_id,exercise_id,sort_order,weight_unit,variant_key/equipment/grip/arm/load/attach} · set_logs={id,workout_exercise_id,set_number,weight_kg,reps,rpe,rir,is_warmup,is_failed,is_drop,set_type,done,load_multiplier,load_adjust_kg,strict_reps,partial_reps,duration_sec,distance_m} · exercises={id,name_ko,name_en,primary_muscles,secondary_muscles,equipment,kind,load_mode}. 레코드에 없는 칸은 키째 없다(null로 채우지 않음).
- dm.v1: `MESSAGE_KIND_SUMMARY = 3` · `Message.ref_id = 8`(SUMMARY일 때 요약 id). 클라이언트 SendMessage(kind=SUMMARY) → invalid_argument.
- notification.v1: `NOTIFICATION_KIND_COACHING_SUMMARY = 4`(actor=회원 · post_id 빈 값).
- 감사 action(snake_case): `summary_send`(첫 실제 전달 때만 · 회원 · detail {summaryId, periodStart, periodEnd}) · `summary_view`(받은 트레이너가 열 때만) · `records_view`(detail {servedStart, servedEnd, workouts, workoutExercises, setLogs, exercises}).

## 스펙과 다르게 한 것 · 이유
1. **0017에 `messages.ref_id text` 칸도 넣음** — 스펙은 0017에 progress_summaries 칸만 적었지만 `Message.ref_id`를 저장할 곳이 필요했다. 스펙의 progress_summaries 칸은 그대로다. 회원 목록과 커서용 인덱스 `(member_id, created_at DESC, id DESC)` 하나도 더했다.
2. **동시 2요청 멱등은 결정적 메시지 id로 막음** — 메시지 id를 `"summary-" + 요약 id`로 두고 `ON CONFLICT (id) DO NOTHING`(dm.sql `CreateRefMessage`)으로 넣는다. `message_id IS NULL` 검사만으로는 동시 두 요청이 둘 다 DM을 보낼 수 있다(기록은 하나지만 메시지는 둘). 알림·감사는 `SetMessageID`가 실제로 1행을 바꿨을 때만 남는다. 따라서 `SendSummaryNotice`는 `(messageID, created, err)`를 돌려준다.
3. **스냅샷 해시 칸을 두지 않음** — 「같은 client_id 다른 내용」은 저장된 jsonb와 요청 JSON을 **내용으로** 비교한다(디코드 뒤 DeepEqual). jsonb가 키 순서와 공백을 바꿔 저장하므로 바이트 해시는 맞지 않는다.
4. **buf.validate schema_version은 `gte: 1`만** — 지원 판({1})은 서버 상수가 판정한다. 새 판을 열 때 계약을 바꾸지 않아도 된다.
5. **GetMemberRecords 응답 = 컬렉션별 `repeated string`(투영된 JSON)** — 타입 있는 proto 메시지 대신 이 형태를 택했다. 기기 raw 레코드와 같은 snake_case 키라 core가 로컬 레코드와 같은 함수로 계산할 수 있다(memberReportFromRecords). projection은 허용 칸 map을 새로 만들어 지킨다.
6. **ReadMaxBytes 256KB는 코칭 서비스에만** — 전역으로 걸면 sync push(최대 5000 레코드)가 정상적으로 상한을 넘는다. 상수는 `coaching.ReadMaxBytes`다.
7. **errs에 `ResourceExhausted` 코드를 새로 둠** — 하루 상한과 2MB 상한용이다. middleware 매핑도 한 줄 늘었다.
8. Send에서 트레이너 이름 없이 trainer_id만 돌려준다. ListSentSummaries도 스냅샷과 이름을 싣지 않는다(목록 크기 때문). 이름은 화면이 ListGrants의 peer로 채운다.
9. 옛 GetMemberReport·buildReport는 손대지 않았다(ADR-040 개정). reportCollections에는 주석만 달았다.

## 프론트 단계에서 알아야 할 것
- **i18n 키가 아직 없다**: `coaching.action.summary_send`·`summary_view`·`records_view`, 알림 `coaching_summary` 문구. core i18n 범위라 손대지 않았다.
- DM: `kind === MessageKind.SUMMARY`면 body를 무시하고 `refId`로 `getProgressSummary`를 부른다. 대화 목록 미리보기는 kind로 「성과 요약」을 띄운다(옛 앱에는 body의 대체 문구 「성과 요약을 보냈어요 — 앱을 새로 고치면 볼 수 있어요 · Sent a progress summary — refresh the app to view」가 보인다. 숫자는 없다). 메시지 id는 `summary-<uuid>` 형식이다(uuid가 아님).
- Get 오류 처리: `PermissionDenied` → 「코칭이 끝나 볼 수 없어요」. `NotFound` → 없음. 오프라인 대기열은 `PermissionDenied`·`InvalidArgument`·`AlreadyExists`를 **영구 실패**로 빼야 한다(S-4). `ResourceExhausted`는 「내일 다시」, internal/unavailable은 재시도 대상이다.
- 재전송은 **같은 client_id·같은 내용**이어야 한다. 섹션 토글을 바꿔 다시 보내려면 새 client_id를 쓴다(아니면 AlreadyExists).
- 알림 `NotificationKind.COACHING_SUMMARY`는 postId가 비어 있다. actor.id(=회원)로 그 회원과의 대화를 연다(`getOrCreateDirect(actor.id)`).
- GetMemberRecords는 요청 기간의 **두 배 길이**를 돌려준다(served_start = start − 길이). 직전 기간 비교에 쓴다. 숫자 칸은 기기 raw 그대로라 `done`·`is_warmup`이 없는 옛 세트가 있다(core 쪽 null 처리). `primary_muscles`는 직렬화된 문자열이다(`"[\"chest\"]"`). 시드 종목은 응답에 없다 — 기기 카탈로그로 해석한다.
- 응답과 원본은 컴포넌트 상태에만 둔다(S-20). 서버는 no-store를 붙인다.
- 통합 테스트 다시 돌리기: 빈 스크래치 DB에 `make migrate DB_URL=…` 뒤 `LIFTGRAM_TEST_DATABASE_URL=… go test ./internal/coaching ./internal/sync -run Postgres`. 운영·개발 DB에는 쓰지 말 것(행을 만들고 지운다).
- 알려진 한계(그대로 둠): assertActiveGrant는 구독 여부를 보지 않는다(SRS-048 기존 부채). GetMemberRecords는 회원의 4개 컬렉션을 통째로 읽고 Go에서 거른다(느려지면 `payload->>'started_at'` 인덱스를 0018로).
