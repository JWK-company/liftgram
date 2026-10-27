# /qa code R1 — 권한·보안 코드 감사 (openGym 추천 · P4 성과 요약 서버)

> 2026-10-27 · 검토자: **권한·보안 코드 감사관(Go·Connect RPC·Postgres·sqlc)**
> 대상: `/Users/woobi/Desktop/tarae/liftgram-wt-opengym` 브랜치 feat/opengym-recs · `git diff df4bf7e..HEAD -- src/backend src/proto src/database src/contracts`(생성물은 훑기만)
> 기준: 스펙 Phase 4 · 스펙 보안 검토 S-1~S-20(`20261027_opengym-spec_security.md`) · ADR-040·041 · 구현 보고 p4-server·go-followup
> 실행한 것: `go test ./internal/coaching ./internal/dm` 통과 · 백엔드 사본(스크래치)에서 변이 8건 · src-db-1(PG 18.4)에 스크래치 DB `e2e_og_qa_<시각>`을 만들어 pgx 왕복을 확인하고 DROP함(남은 `e2e_og_qa_%` 0개). 저장소 파일은 고치지 않았다.

## 핵심 의견

인가 설계는 탄탄하다. 받는 트레이너에 묶기, consent_at 비교, 당사자가 아니면 NotFound, 저장 전 가드·차단 검사, 결정적 메시지 id로 한 번만 전달, 허용 컬렉션·칸 projection, no-store, SUMMARY 직접 전송 거부가 모두 코드에 있다. 변이를 넣으면 해당 테스트가 실패한다. 옛 GetMemberReport는 주석 말고는 바뀌지 않았다.

다만 **배포를 막아야 할 구멍이 하나 있다(CS-1)**. 스냅샷 검사가 JSON **숫자의 크기**를 보지 않는다. Postgres jsonb는 `1e130000`을 작게 저장하지만, 글로 내보낼 때 13만 자리로 펼친다. 그래서 64KB 스냅샷 하나가 `INSERT … RETURNING *` 한 번에 **약 910MB**로 불어나 Go 메모리에 올라온다(실측). 같은 일이 Get 할 때마다 다시 일어난다. 공격자는 계정 두 개(하나가 다른 하나의 트레이너)만 있으면 화면 없이 RPC로 서버 프로세스를 OOM으로 떨어뜨릴 수 있다. 그 밖에 차단한 뒤에도 트레이너 쪽 읽기 경로가 열려 있는 문제(CS-3), 원본 레코드를 전부 메모리에 올린 뒤에야 2MB를 검사하는 문제(CS-4)는 중간이다.

## S-1~S-20 반영 대조

| ID | 반영 | 근거(코드) · 메모 |
|---|---|---|
| S-1 받는 트레이너 묶기 | ✅ | summary.go:274-290 `switch viewerID {member / trainer / default NotFound}`. 변이(아무 active 트레이너 허용) → 테스트 3개 실패 |
| S-2 컬렉션·칸·기간 최소화 | ✅(단서) | records.go:39·43-61 상수 허용 목록, 요청에 컬렉션 칸 없음, Go 필터(완료 운동→블록→세트→쓰인 커스텀 종목). 단서는 CS-9(실제 내주는 기간은 최대 800일) |
| S-3 PR·직전 대비 범위 | ◐ | 서버는 `[start−길이, end)`를 내준다(records.go:92). served 기간을 감사 detail에 남긴다. PR 기준선은 서버가 주지 않는다. 어느 안을 택했는지는 core·화면 몫이라 이번 범위 밖 |
| S-4 오프라인 대기열 계정 분리 | — | 클라이언트 몫(화면 없음). 서버 쪽 대응으로 PermissionDenied·InvalidArgument·AlreadyExists를 영구 실패 코드로 갈라 둔 것은 맞다 |
| S-5 저장–DM 멱등 | ✅ | 저장 전 가드·차단 → Insert/기존 행 → 결정적 id `summary-<id>` + `ON CONFLICT(id) DO NOTHING` → `SET message_id WHERE IS NULL`이 실제로 기록됐을 때만 알림·감사. 재시도·동시 요청 테스트 있음 |
| S-6 입력 검사 | ◐ | uuid·판·기간·객체·schemaVersion·NUL·64KB·ReadMaxBytes 256KB(코칭에만, 압축을 푼 크기까지 connect-go가 검사 — envelope.go/compression.go 확인). **숫자 크기·짝 없는 서로게이트는 빠짐 → CS-1·CS-2** |
| S-7 DM·목록·푸시에 숫자 없음 | ✅ | dm/service.go `SummaryFallbackBody` 상수, 테스트 `TestSummaryFallbackBody_숫자가_없다`. 「카드 표시 때마다 Get → 감사 넘침」은 CS-7 |
| S-8 옛 앱 대체 문구·ref_id·toProtoKind | ✅ | dm.proto `MESSAGE_KIND_SUMMARY=3`·`ref_id=8`, handler.go toProtoKind/fromProtoKind SUMMARY 분기, 매핑 표 테스트 |
| S-9 감사 action | ✅ | `summary_send`(첫 실제 전달 때만)·`summary_view`(트레이너가 열 때만)·`records_view`(기간·행 수). i18n 키는 화면 몫이라 아직 없음 |
| S-10 옛 GetMemberReport | ✅ | 안 ①(그대로 둠). report.go·service.go diff는 주석과 필드 추가뿐 → 회귀 없음 |
| S-11 체중 기본 꺼짐 | — | 화면 몫 |
| S-12 맨몸 볼륨 | — | core 몫. 서버는 `total_volume_kg`를 허용 칸으로 내준다 |
| S-13 재계약 뒤 옛 요약 | ✅ | `grant_consent_at` 칸 + `g.ConsentAt.Equal(row.GrantConsentAt)`(summary.go:283). 변이 확인 보고 있음. 재전송 경로의 틈은 CS-6 |
| S-14 SendAs 좁히기 | ✅ | `SummaryMessenger` 메서드 하나, kind·body 고정, uuid 검사, 차단 검사. 클라이언트 SendMessage(kind=SUMMARY) → Validation. 클라이언트가 ref_id를 줄 길은 없다(SendMessageRequest에 칸이 없고, CreateMessage SQL이 ref_id를 넣지 않음) |
| S-15 응답 크기 | ◐ | 2MB 상한은 있다. 하지만 전부 읽고 디코드한 **뒤에** 잰다 → CS-4 |
| S-16 알림 post_id | ✅ | `Notify(..., "")` · `NOTIFICATION_KIND_COACHING_SUMMARY=4` |
| S-17 NotFound/PermissionDenied 구분 | ✅ | 없는 id와 남의 id 모두 NotFound(테스트 있음) |
| S-18 받는 쪽 스냅샷 검증 | — | core·화면 몫 |
| S-19 CASCADE·목록 상한·하루 20건 | ✅(단서) | FK ON DELETE CASCADE, 50개+µs 커서, 하루 20건. 단서는 CS-5(세기와 넣기 사이 경쟁) |
| S-20 캐시 | ✅ | NO_SIDE_EFFECTS 없음(POST), 응답 4개 모두 `Cache-Control: no-store` |

마이그레이션 0017: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS ref_id text`는 NULL 허용이고 기본값이 없어 PG 11+에서 테이블을 다시 쓰지 않는다(잠깐 ACCESS EXCLUSIVE를 잡을 뿐이다). 기존 행은 NULL이고 인덱스 영향도 없다. ref_id로 조회하는 곳이 없어 인덱스도 필요 없다. 시각 칸은 모두 timestamptz이고 FK는 둘 다 users ON DELETE CASCADE다. `messages.kind`에 CHECK 제약이 없어 'summary'가 그대로 들어간다(문제 없음). 문제 없다.

## 지적 목록

### CS-1 · 높음 · jsonb 숫자 펼침으로 64KB 스냅샷이 ~910MB가 된다 — 서버 OOM(DoS)
- 위치: `src/backend/internal/coaching/summary.go:341-366`(checkSnapshot이 숫자를 보지 않는다) · `src/database/queries/coaching.sql:114`(`InsertProgressSummary … RETURNING *`) · 같은 파일 GetProgressSummary·GetProgressSummaryByMemberClient(`SELECT *`) · summary.go:399-408(sameJSON)
- 원리: `json.Valid`와 `UseNumber` 디코드는 `1e130000`을 그대로 통과시킨다. Postgres numeric은 이 값을 몇 바이트로 저장하지만, jsonb를 글로 내보낼 때(pgx 바이너리 형식도 jsonb_send가 글을 만든다) 13만 자리로 펼친다.
- 실측(PG 18.4 · src-db-1):
  - `'{"a":1e100000}'::jsonb` → 저장 30B, 글 100,008자
  - `1e130000` × 7,000개(입력 ≈ 63KB, 64KB 안) → 글 **910,021,007자, PG CPU 15초**
  - pgx v5.10 실제 왕복: 입력 9,025B → `INSERT … RETURNING snapshot`이 Go에 **130,003,027B**(0.6초)를 돌려줌
- 공격 시나리오: 계정 A·B를 만든다 → B가 A에게 코칭을 요청하고 A가 수락한다(trainer_intent는 누구나 켤 수 있다) → B가 SendProgressSummary로 위 스냅샷을 보낸다 → Insert RETURNING만으로 서버가 ~1GB를 할당한다. 이어서 B(회원)나 A(트레이너)가 GetProgressSummary를 반복하면 매번 같은 펼침이 일어난다. 하루 20건 상한은 계정당이라 계정을 늘리면 우회되고, 한 건이면 이미 충분하다. 1GB를 넘기는 값은 PG가 오류를 내지만 그 전에 CPU와 메모리를 다 쓴다. 화면이 없어도 RPC는 열려 있다.
- 수정안:
  1. checkSnapshot에서 숫자를 걷는다. 각 `json.Number`가 `len ≤ 24`이고, 지수(e/E)가 없거나 `|x| < 1e15`이며, `strconv.ParseFloat`로 유한값이어야 한다. 아니면 Validation. 스냅샷 숫자는 kg·횟수·ms이므로 1e15 미만이면 충분하다.
  2. `InsertProgressSummary`는 `RETURNING id, created_at`만 돌려받고(스냅샷은 이미 요청에 있다), 재전송 비교 조회에서는 스냅샷 대신 `snapshot = @snapshot::jsonb`(jsonb 동등 비교)를 SQL로 판정한다. 이러면 펼친 글을 읽을 일이 줄어든다.
  3. 테스트: `{"schemaVersion":1,"a":1e400}`과 `1e20` → Validation. 변이(숫자 검사 끄기) → 실패.
  4. 참고: **sync_records.payload도 같은 구멍이 있다**(기존 부채 · 범위 밖). push가 숫자를 보지 않아 회원이 자기 레코드에 `1e130000`을 넣으면 pull·GetMemberReport·이번 GetMemberRecords(ListMemberRecords가 payload를 글로 읽는다)가 펼친 값을 메모리에 올린다. 같은 숫자 검사를 sync `parseRecord`에도 넣기를 별도 작업으로 권한다.

### CS-2 · 중간 · 짝 없는 서로게이트 `\ud800`이 검사를 통과해 Postgres에서 500(Internal)이 된다
- 위치: `summary.go:345-360`
- 재현: 스냅샷 `{"schemaVersion":1,"x":"\ud800"}` → Go `json.Valid`는 true, 디코드하면 U+FFFD라 hasNUL도 통과한다 → PG가 `invalid input syntax for type json — Unicode low surrogate must follow a high surrogate`로 거부한다(실측) → Internal. 하루 상한을 세기 전에 거부되는 게 아니라 Insert에서 터지므로, 오류 로그·알림 소음을 마음대로 만들 수 있다. S-6이 막으려던 「\u0000 → 500」과 같은 종류다.
- 수정안: 원문 바이트에서 `\ud[89ab][0-9a-f]{2}` 다음에 `\ud[c-f]..`가 오지 않는 경우와, 단독 `\ud[c-f]..`를 거부한다. 더 간단하게는 디코드한 값을 Go `json.Marshal`로 다시 직렬화한 **정규형을 저장**한다(서로게이트는 U+FFFD로 바뀐다). 숫자 검사(CS-1)와 같은 걸음에서 처리하면 된다. 테스트를 한 줄 더한다.

### CS-3 · 중간 · 차단한 뒤에도 트레이너가 요약·원본 레코드를 계속 읽는다
- 위치: `summary.go:277-288`(트레이너 Get은 차단을 보지 않음) · `records.go:82`(GetMemberRecords도 같음) · `feed/service.go:644-655`(SetBlock은 팔로우만 끊고 coaching grant는 건드리지 않음)
- 시나리오: 회원이 DM으로 괴롭히는 트레이너를 차단한다. Send는 막히지만(summary.go:170), grant가 active로 남아 트레이너는 GetMemberRecords로 최대 800일 원본을, GetProgressSummary로 예전 요약을 계속 가져간다. 회원은 「차단 = 끊김」을 기대한다. SRS-048의 3조건에도 차단이 들어 있다.
- 수정안: 둘 중 하나. ① assertActiveGrant 옆에 `Blocked(viewer, member)` 검사를 두는 공통 가드 `assertReadable`을 만들어 새 RPC 둘과 옛 리포트·루틴이 함께 쓴다(Forbidden). ② SetBlock 때 양방향 coaching grant를 revoke한다(감사 `revoke` 남김). ②가 근본 해결이지만 feed 패키지가 coaching을 알아야 한다. 이번에는 ①을 권한다. 테스트: 차단 → Get·Records 모두 Forbidden.

### CS-4 · 중간 · GetMemberRecords가 회원의 4개 컬렉션 **전 이력**을 메모리에 올린 뒤에 2MB를 잰다
- 위치: `records.go:87`(ListMemberRecords에 기간 조건이 없음) · `records.go:117-127`(모든 행을 `map[string]json.RawMessage`로 디코드) · `records.go:207-209`(상한 검사는 projection 뒤)
- 시나리오: 공격자의 회원 계정이 sync push로 레코드를 쌓는다(레코드당 256KB × push당 5,000 · 회원당 총량 상한 없음). 공격자의 트레이너 계정이 GetMemberRecords를 짧은 기간으로 반복 호출한다. 응답은 작아 2MB에 안 걸리지만, 서버는 매번 전 이력(수백 MB~GB)을 읽고 디코드한다. CS-1의 숫자 펼침이 sync payload에 있으면 더 커진다. 옛 GetMemberReport에도 같은 모양이 있지만(기존 부채), 이번에 같은 비용의 두 번째 공개 경로가 생겼다.
- 수정안: (단기) SQL에 `sum(octet_length(payload::text))`나 행 수를 먼저 세는 사전 검사를 둔다(예: 행 20만 또는 64MB를 넘으면 ResourceExhausted). 또는 `pgx.Rows`로 흘려 읽으며 누적 바이트가 넘으면 중단한다. (중기) 0018에 `(user_id, collection, ((payload->>'started_at')::bigint))` 표현식 인덱스를 넣고 workouts를 SQL에서 기간으로 거른 뒤, 자식은 `payload->>'workout_id' = ANY(...)`로 읽는다. RPC별 rate limit(트레이너당 분당 N회)도 권한다.

### CS-5 · 낮음 · 하루 20건 상한이 「세기 → 넣기」라 동시 요청으로 넘길 수 있다
- 위치: `summary.go:192-200`
- 시나리오: client_id만 다른 요청 50개를 동시에 보내면 모두 Count=19를 읽고 50건이 들어간다 → 트레이너에게 DM·알림 50건. 전역 rate limiter가 일부를 막겠지만 이 상한의 목적(도배 방지)은 깨진다.
- 수정안: Insert 앞에서 같은 트랜잭션으로 `pg_advisory_xact_lock(hashtext(member_id))`를 잡거나, `INSERT … SELECT … WHERE (SELECT count(*) …) < 20` 한 문장으로 바꾼다. 테스트는 실제 PG `-race` 동시 25건 → 20건.

### CS-6 · 낮음 · 재계약 뒤 옛 client_id를 재전송하면 열 수 없는 옛 요약이 새 관계에 전달된다
- 위치: `summary.go:166`(지금 grant g를 씀) · `summary.go:185-190·221-224`(기존 행이면 consent를 비교하지 않고 deliverSummary)
- 시나리오: 오프라인으로 보냄(DM 실패, message_id NULL) → 해지 → 재요청·수락 → 기기가 재전송 → 가드 통과(지금 active) → 옛 consent의 요약이 DM으로 가고 summary_send 감사·알림이 남는다 → 트레이너가 누르면 Forbidden. 새는 데이터는 없다. 하지만 회원이 해지로 「거둔」 요약을 다시 내민 꼴이고, 감사 이력도 혼란스럽다.
- 수정안: 기존 행 경로에서 `!g.ConsentAt.Equal(row.GrantConsentAt)`이면 `Forbidden("summary belongs to an earlier coaching relation")`으로 끝낸다(대기열은 영구 실패로 버린다). 테스트를 한 줄 더한다.

### CS-7 · 낮음 · 열람 감사가 호출마다 쌓여 회원 이력(최근 100개)을 밀어낸다
- 위치: `summary.go:286-287`(summary_view) · `records.go:98-106`(records_view) · `coaching.sql:75`(ListAudit `LIMIT 100`)
- 시나리오: 트레이너 화면이 DM 카드를 그릴 때마다 Get을 부르거나, 트레이너가 일부러 Records를 100번 부르면 회원의 코칭 이력 화면에서 request·accept·scope 변경 같은 의미 있는 기록이 밀려 보이지 않는다. 기록 자체는 사실이지만 이력의 쓸모가 떨어진다. 감사 표도 끝없이 커진다.
- 수정안: 같은 (grant, actor, action, 대상 id) 감사는 10분 안이면 새로 쓰지 않는다(`INSERT … WHERE NOT EXISTS (… created_at > now()-'10 min')`). 또는 ListAudit에 커서를 단다. 화면 쪽에는 「카드는 고정 문구, 펼칠 때만 Get」(S-7 ①)을 고정한다.

### CS-8 · 낮음(테스트 품질) · 256KB 본문 상한 테스트가 main.go 조립을 보지 않는다
- 위치: `handler_summary_test.go:38-41`(테스트가 직접 `connect.WithReadMaxBytes(ReadMaxBytes)`를 끼움) · `cmd/server/main.go:266-267`
- 문제: main.go에서 `connect.WithReadMaxBytes(...)`를 지워도 모든 테스트가 통과한다. 지금 코드는 맞게 걸려 있지만(확인함), 회귀를 막는 장치가 없다.
- 수정안: `coaching.NewConnectHandler(svc, opts...)`처럼 상한을 **안에서** 붙이는 생성자를 두고, main.go와 테스트가 둘 다 이것을 쓴다.

### CS-9 · 낮음 · 실제로 내주는 기간이 최대 800일이고, 관계를 맺기 전 이력도 포함한다
- 위치: `records.go:78·92`(기간 ≤ 400일을 검사한 뒤 served = 2배)
- 문제: S-2의 「길이 ≤ 400일」은 내보내는 범위의 상한이라는 취지였다. 지금은 요청 400일 → 응답 800일이다. 옛 리포트는 8주였다. 회원이 동의한 시점(consent_at)보다 훨씬 앞선 기록까지 트레이너 기기로 원본이 간다. ADR-040 개정이 「직전 기간 포함」을 허용했더라도, 상한이 두 배가 된다는 사실은 문서에 없다.
- 수정안: 요청 길이 상한을 200일로 낮추거나(served ≤ 400일), ADR-040에 「served ≤ 800일」을 명시하고 회원 동의 화면 문구에 반영한다. served_start가 consent_at보다 앞서는 것을 허용할지도 ADR에 한 줄 결정해 둔다.

### 참고 (지적 아님)
- 변이 확인(스크래치 사본): Send 차단 검사 끄기 · 받는 트레이너 묶기 제거 · sameSummary 항상 true · hasNUL 끄기 · 하루 상한 끄기 · projection 끄기 · 기간 상한 끄기 — **7건 모두 테스트가 잡음**. `dm.Send`의 `m.RefID = ""`를 지워도 통과하는데, 클라이언트가 ref_id를 줄 길(proto 칸·SQL 칸)이 없어 방어용 한 줄이므로 문제가 아니다.
- 결정적 메시지 id는 서버만 만든다(클라이언트 메시지 id는 `s.newID()`). 그래서 `summary-<uuid>` PK를 선점당할 수 없다.
- 옛 앱: protobuf-es는 모르는 enum 3을 그대로 두고, Bubble은 IMAGE가 아니면 body를 글로 그린다. 대체 문구가 보이고 숫자는 없다.
- 알려진 한계(기존 부채 · 보고서에 이미 있음): assertActiveGrant는 구독 여부를 보지 않는다.

## 판정

**조건부 통과 — CS-1을 고치기 전에는 배포 불가.** 높음 1(CS-1 jsonb 숫자 펼침 DoS) · 중간 3(CS-2 서로게이트 500 · CS-3 차단 뒤 읽기 · CS-4 전 이력 적재) · 낮음 5(CS-5~CS-9). CS-1과 CS-2는 checkSnapshot의 같은 걸음(숫자·서로게이트 검사, 또는 정규형으로 다시 직렬화)에서 테스트와 함께 고칠 수 있다. CS-3은 이번 배포에 넣기를 강하게 권한다(가드 한 줄 + 테스트). CS-4는 단기 사전 검사로 충분하다. 인가 핵심(S-1·S-5·S-13·S-14·S-17)은 코드와 테스트 모두 합격이고, 옛 GetMemberReport는 회귀가 없다.
