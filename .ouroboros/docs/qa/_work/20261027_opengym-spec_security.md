# /qa spec — 권한·개인정보 보안 감사 (openGym 추천 스펙 · Phase 4 중심)

> 2026-10-27 · 검토자: **권한·개인정보 보안 감사관 겸 백엔드(Go·Connect RPC·Postgres) 검토자** (접근 제어 단일 가드 · 위임 권한 회수 · 스냅샷 최소화 · 메시지 채널 위조 · 멱등 전송)
> 대상: `.ouroboros/docs/spec/20261027_opengym-recs/spec.md`(Phase 4: 100–124행 · 충돌 방지 규칙 21–36행) · SAD-024·SAD-022 · ADR-040·041 · SRS-079·080·048
> 대조한 코드(읽기만): `backend/internal/coaching/{service,report,repo}.go` · `backend/internal/dm/{service,handler}.go` · `backend/internal/notification/service.go` · `database/queries/coaching.sql` · `database/migrations/{0008,0011,0012}` · `proto/{coaching,dm}/v1` · `frontend/app/components/{coaching,dm}` · `frontend/public/sw.js` · `core/src/sync/syncOwner.ts` · `core/src/domain/{volume,personalRecords}.ts`

## 핵심 의견

방향(계산은 core 한 곳, 서버는 가드와 스냅샷 보관, DM에는 id만)은 맞고, 보안 경계를 서버 가드 한 곳에 두는 원칙도 지켜집니다. 다만 Phase 4는 **「동의 범위 원본 레코드」를 실제로 어디까지 내주는지**(컬렉션·칸·기간·PR 계산에 필요한 과거 이력)가 비어 있습니다. 그리고 **GetProgressSummary 가드가 「그 요약을 받은 트레이너」가 아니라 「지금 active인 어떤 트레이너」로 적혀 있습니다**. 그대로 구현하면 회원의 다른 트레이너가 요약을 열 수 있고, 트레이너 리포트가 회원의 전 이력과 메모 글까지 끌어갑니다. 오프라인 대기열(localStorage)이 계정을 가리지 않아 다른 계정으로 다시 보내지는 구멍, 전송 도중 실패하면 DM이 영영 안 가는 멱등 구멍도 스펙 단계에서 막아야 합니다.

## 지적 목록

### S-1 · 높음 · GetProgressSummary 가드가 「받는 트레이너」에 묶여 있지 않다
- 근거: spec.md:110 「Get = 요청자가 회원 본인 ∨ **지금 active grant 트레이너**」 · ADR-041 「매번 가드를 다시 확인」 · service.go:297 `assertActiveGrant(trainerID, memberID, scope)`는 (요청자, 회원) 쌍만 본다.
- 문제: 회원 M에게 트레이너 A·B가 둘 다 active이면, A에게 보낸 요약 id를 B가 알 경우 「M에 대해 active인 트레이너」라 열린다. 지금은 id가 uuid라 추측하기 어려울 뿐이고, 권한 판정이 id를 모른다는 데 기대면 안 된다. Get 때 scope(logView)를 다시 보는지도 적혀 있지 않다(회원이 범위를 줄였을 때).
- 개선안: Get 판정을 `viewer == s.member_id` ∨ (`viewer == s.trainer_id` ∧ `assertActiveGrant(viewer, s.member_id, ScopeLogView)` 통과)로 못 박는다. 테스트를 추가한다: 같은 회원의 다른 active 트레이너 B가 Get → 거부 · scope에서 logView를 끄면 거부. 남이 부르면(회원도 받는 트레이너도 아님) NotFound를 돌려 존재 여부를 알리지 않는다(S-17).

### S-2 · 높음 · GetMemberRecords의 최소화 범위가 정해져 있지 않다(컬렉션·칸·기간)
- 근거: spec.md:109 `GetMemberRecords{member_id, period_start, period_end}(동의 범위 원본 레코드)` · ADR-040 「요청 기간만 … 필요한 칸만 보내 줄인다」 · coaching.sql:79-84 `ListMemberRecords`는 기간 조건 없이 그 회원의 컬렉션 전체를 읽는다 · schema.ts:119 `workouts.notes`, :131 `workout_exercises.note`, :50 `exercises.image_url`(자유 글·업로드 주소) · P1이 `bodyweight_logs`·`import_batches`·`import_aliases` 컬렉션을 새로 만든다(spec.md:41-45).
- 문제: (a) 지금 리포트는 서버 안에서 집계만 하고 밖으로 내보내는 것은 숫자뿐이었다. 원본을 내보내면 메모 글·사진 주소·처방·이전 세션 스냅샷까지 그대로 트레이너 브라우저에 간다. (b) 기간은 sync_records 칸이 아니라 payload 안에 있어(`started_at`, 세트는 workout_exercise→workout로 이어야 앎) Go가 payload를 읽어 걸러야 한다. 이 방법이 적혀 있지 않다. (c) 기간에 상한이 없어 `period_start=0`이면 전 이력을 가져간다. (d) 컬렉션 목록을 요청 값으로 받거나 나중에 넓히면 `bodyweight_logs`·`user_profiles`(체중·이메일·app_prefs·calendar_notes)가 새어 나간다. SRS-048은 「신체정보 기본 제외」를 요구한다.
- 개선안: 스펙에 아래를 고정한다.
  1. 컬렉션은 서버 상수 허용 목록 `workouts·workout_exercises·set_logs·exercises`만 쓰고, 요청에는 컬렉션 칸을 두지 않는다. `user_profiles`·`bodyweight_logs`·`import_*`은 영원히 넣지 않는다(상수 옆 주석과 Go 테스트로 고정).
  2. 칸 허용 목록(projection)을 둔다. 예: workouts={id,state,started_at,completed_at,duration_seconds,total_volume_kg,pr_count,routine_id,source}, workout_exercises={id,workout_id,exercise_id,sort_order,weight_unit,variant_*}, set_logs={id,workout_exercise_id,set_number,weight_kg,reps,rpe,rir,is_warmup,is_failed,is_drop,set_type,done,load_multiplier,load_adjust_kg,strict_reps,partial_reps,duration_sec,distance_m}, exercises(커스텀)={id,name_ko,name_en,primary_muscles,secondary_muscles,equipment,kind,load_mode} — **notes·note·image_url·prescription·prev_* 제외**. 허용 목록 밖의 칸이 응답에 없다는 Go 테스트를 둔다.
  3. 기간은 서버가 Go에서 걸러 낸다(완료된 workout → 그 workout_exercises → 그 set_logs → 실제로 쓰인 커스텀 exercises만). `start < end`, 길이 ≤ 400일, `end ≤ now+1일`을 넘으면 Validation으로 거부한다.
  4. 응답은 proto 구조체로 내보낸다(Go 구조체 JSON이 아니어서 PascalCase 함정은 없다). payload를 다시 직렬화할 때 `map[string]any` 대신 허용 칸 구조체를 쓰면 projection이 저절로 지켜진다.

### S-3 · 높음 · PR·직전 대비는 기간 밖 이력이 있어야 계산된다 — 최소화와 수용 기준이 서로 어긋난다
- 근거: spec.md:102 `delta(직전 같은 길이)`·`prs[]` · spec.md:124 「트레이너 리포트 숫자 = 회원 요약 숫자」 · personalRecords.ts:55 `detectNewPRs(current, historicalBest)`는 그 이전 최고 기록이 있어야 한다.
- 문제: GetMemberRecords가 요청 기간만 내주면 트레이너 쪽 prs는 「기간 안에서 처음 나온 값」이 되어 회원 요약과 달라지고, delta도 0이나 비교 불가가 된다. 같게 맞추려고 전 이력을 내주면 S-2의 기간 최소화가 무의미해진다. 스펙이 어느 쪽인지 정하지 않았다.
- 개선안(택1을 스펙에 명시):
  ① 응답 범위 = `[start − 길이, end)`(delta용)로 하고, PR은 이미 저장된 `workouts.pr_count`·완료 시 판정 결과를 쓴다. 트레이너 리포트에서는 「새 기록 목록」 대신 개수만 보이고, 수용 기준의 일치 대상에서 prs 목록을 뺀다.
  ② PR 기준선이 필요하면 서버가 **종목별 이전 최고값(숫자 몇 개)**만 덧붙인다. 다만 이건 Go 쪽 계산이라 ADR-032와 부딪히므로 ADR-040에 예외로 기록한다.
  어느 쪽이든 「서버가 실제로 내보내는 기간」을 감사 detail(S-9)에 남긴다.

### S-4 · 높음 · 오프라인 대기열이 계정을 가리지 않는다 — 다른 계정으로 다시 보내지고, 로그아웃 뒤에도 남는다
- 근거: spec.md:118 localStorage `liftgram.summaryOutbox` · syncOwner.ts:107-122 `wipeFor`는 Watermelon DB와 표식만 비우고 다른 localStorage 키는 건드리지 않는다 · 「앱 시작 시 재전송」.
- 문제: 같은 기기에서 회원 A가 오프라인으로 보낸 요약(체중 등 포함)이 남은 채 B가 로그인하면, B의 세션으로 재전송이 시도된다. 가드가 막더라도 A의 스냅샷이 B 세션의 요청 본문으로 서버 로그·오류 보고에 실린다. A와 B가 같은 트레이너에게 코칭을 받고 있으면 **B 이름으로 A의 기록이 전달된다**. 로그아웃해도 스냅샷이 평문으로 기기에 남는다.
- 개선안: 대기열 항목에 `ownerUserId`를 넣고, 재전송은 지금 로그인한 사람과 같을 때만 한다. 키를 `liftgram.summaryOutbox:<userId>`로 나누고, 로그아웃과 `wipeFor`(계정 전환) 때 지운다. 항목 수 ≤ 10, 7일이 지나면 버린다. e2e를 추가한다: A가 오프라인으로 보냄 → 로그아웃 → B 로그인 → 온라인 → 서버에 0건, 대기열 비어 있음.

### S-5 · 높음 · 「저장 → DM → 알림」이 원자적이지 않아 재전송해도 DM이 영영 안 갈 수 있다(SRS-080 「한 번만 도착」 위반)
- 근거: spec.md:108 `ON CONFLICT … DO NOTHING RETURNING / 재조회` · spec.md:110 「저장 · 감사 · DM 시스템 경로 호출 · 알림」 순서 · dm/service.go:135-141 `GetOrCreateDirect`는 차단이면 Forbidden.
- 문제: Insert는 성공했는데 SendAs가 실패하면(차단·DB 일시 오류·배포 재시작), 클라이언트가 같은 client_id로 다시 보낼 때 충돌로 「재조회」만 하고 끝나 DM이 0건이 된다. 반대로 충돌 경로에서 DM을 또 보내면 2건이 된다. 차단 관계면 요약은 저장되는데 전달은 안 되는 고아 행이 생긴다.
- 개선안: `progress_summaries.message_id text NULL`을 둔다. 흐름: (1) 가드와 **차단 검사를 Insert 전에** 한다. (2) Insert하거나 충돌이면 기존 행을 읽는다. (3) `message_id IS NULL`일 때만 SendAs를 부르고 `UPDATE … SET message_id=$1 WHERE id=$2 AND message_id IS NULL`로 한 번만 기록한다. (4) 알림·감사도 (3)에서 실제로 기록했을 때만 남긴다. 같은 client_id인데 trainer_id·기간·스냅샷 해시가 다르면 Conflict로 거부한다(조용히 옛 id를 돌려주지 않는다). Go 테스트를 추가한다: SendAs 1회 실패 → 재시도 → 메시지 1건 · 동시 두 요청 → 메시지 1건.

### S-6 · 중간 · client_id·기간·schema_version·스냅샷 검사가 덜 적혀 있다
- 근거: spec.md:107 `client_id text`(길이 무제한) · spec.md:109 요청에 schema_version 칸 없음(테이블에는 있음) · spec.md:113 「스냅샷은 jsonb 그대로 · 서버 해석 금지」 · 예시 dm.proto:108처럼 buf.validate를 쓰는 관례가 있다.
- 문제: schema_version을 알려면 서버가 스냅샷을 읽어야 해서 「해석 금지」와 부딪힌다. client_id·기간을 검사하지 않으면 큰 문자열이나 엉뚱한 값이 들어온다. Postgres jsonb는 `\u0000`이 든 JSON을 거부하는데, 이걸 잡지 않으면 500(Internal)이 된다.
- 개선안: 요청에 `int32 schema_version`을 따로 둔다(서버는 지원 목록 {1}만 받고, 스냅샷 최상위 `schemaVersion`과 같은지만 본다). buf.validate: `client_id` uuid · `snapshot_json` max_bytes 65536 · `trainer_id` min_len 1. 서비스: `json.Valid` ∧ 최상위가 객체 ∧ `\u0000` 없음 → 아니면 Validation · `period_start < period_end` · 길이 ≤ 400일. Connect 서버에 `connect.WithReadMaxBytes`(예: 256KB)를 걸어 64KB 검사 전에 큰 본문을 메모리에 다 올리지 않게 한다(지금 backend에 ReadMaxBytes 설정이 없다).

### S-7 · 중간 · DM 카드의 「핵심 숫자 3」을 어디서 가져오는지가 없다 — 본문에 실으면 해지 뒤에도 남고, 매번 Get하면 열람 기록이 넘친다
- 근거: spec.md:119 「DM 말풍선 kind=SUMMARY 카드(기간·핵심 숫자 3) → 누르면 GetProgressSummary」 · ADR-041 「body에는 요약 id만」 · SAD-024 「메시지에 숫자를 넣으면 해지 뒤에도 남는다」.
- 문제: 누르기 전에 숫자를 보이려면 body에 숫자가 있거나, 말풍선을 그릴 때마다 Get을 불러야 한다. 앞의 방법은 회수 원칙을 깨고, 뒤의 방법은 대화를 열 때마다 카드 수만큼 RPC와 (S-9를 반영하면) 열람 감사가 쌓인다.
- 개선안: 카드에는 고정 문구(「성과 요약 · 눌러서 보기」)만 두고 기간·숫자는 Get 결과에서만 그린다. 또는 화면에 보일 때 한 번 Get하되 감사는 「펼쳐 본 때」만 남긴다(`GetProgressSummary{id, view:true}` 같은 구분). 어느 쪽이든 **DM body·알림·대화 목록 미리보기·푸시에는 숫자를 넣지 않는다**를 스펙 문장으로 고정하고 Go 테스트로 확인한다(body가 uuid 형식인지).

### S-8 · 중간 · 구버전 클라이언트에서는 요약 id(uuid)가 그대로 글로 보인다 — 대체 문구 규칙이 스펙에서 빠졌다
- 근거: SAD-024 「구버전 클라이언트가 SUMMARY를 받으면 '…새로 고쳐 주세요' 텍스트」 · spec.md:111에는 이 규칙이 없다 · dm/handler.go:235-240 `toProtoKind`는 image가 아니면 전부 TEXT로 바꾼다 · ConversationsClient.tsx:113 미리보기 = `lastMessage.body` · ConversationClient.tsx:340 Bubble은 IMAGE가 아니면 body를 글로 그린다.
- 문제: body = id이면 옛 탭이나 서비스워커가 붙든 옛 번들에서는 말풍선과 목록 미리보기가 uuid 문자열로 보인다. `toProtoKind`를 고치지 않으면 새 클라이언트도 TEXT로 받는다.
- 개선안: `dm.v1.Message`에 `string ref_id`(요약 id)를 새로 두고, SUMMARY의 `body`에는 숫자 없는 대체 문구(서버 상수, 예: 「성과 요약을 보냈어요 — 앱을 새로 고치면 볼 수 있어요」)를 싣는다. 언어는 수신자 언어를 모르므로 ko·en을 함께 짧게 쓰거나 중립 기호를 쓴다. `toProtoKind`·`fromProtoKind`에 SUMMARY 분기를 넣고 매핑 표 테스트를 둔다. 새 클라이언트는 `kind==SUMMARY`면 body를 무시하고 ref_id로 Get한다.

### S-9 · 중간 · 열람 감사가 빠졌고, 새 action 이름이 기존 규약·i18n 경로와 맞지 않는다
- 근거: spec.md:110 감사는 `summary.send`만 적혀 있다 · service.go:49-57 「열람도 남긴다」, 기존 action은 snake_case(`report_view`) · CoachingClient.tsx:107 `t(\`coaching.action.${e.action}\`)` — 점이 든 action은 사전의 중첩 경로로 읽혀 키를 못 찾는다 · 0012_coaching.sql 주석의 action 목록.
- 문제: 트레이너가 GetMemberRecords로 원본을 가져가거나 요약을 열어도 회원의 코칭 이력에 남지 않는다(SRS-048 「모든 트레이너 접근 … 감사」 위반). `summary.send`는 이력 화면에 날 키로 보인다.
- 개선안: action을 `summary_send`·`summary_view`(트레이너가 Get할 때만)·`records_view`(GetMemberRecords, detail에 실제 내보낸 기간과 행 수)로 정한다. i18n `coaching.action.*`에 키를 추가하고 0012 주석 목록도 갱신한다. GetMemberReport 경로를 막을 때도 `report_view` 감사가 이중으로 남지 않게 한다.

### S-10 · 중간 · GetMemberReport를 막고 빈 값을 돌려주면 옛 화면이 「0회·0kg」이라는 거짓 사실을 보인다
- 근거: spec.md:112 「기존 응답 필드는 남겨 빈 값」 · ADR-040 「구버전 클라이언트가 깨지지 않게」 · CoachingClient.tsx:95-101은 `res.report`가 있으면 그대로 그린다.
- 문제: 옛 탭은 깨지지는 않지만 트레이너에게 「이 회원은 8주간 0회」로 보인다. 웰니스 원칙(사실만 표시)에 어긋나고, 트레이너가 잘못 판단할 근거가 된다.
- 개선안: 둘 중 하나를 고른다. ① 이관 기간에는 옛 RPC가 기존 Go 집계를 계속 돌린다(코드 보존 규칙과도 맞고, 새 클라이언트는 부르지 않는다). 다음 /reflect에서 호출을 막는다. ② 막는다면 빈 값 대신 `FailedPrecondition("app update required")`를 돌린다. 옛 코드는 catch → 오류 토스트로 끝나 거짓 0이 보이지 않는다. 어느 경우든 「구버전이 깨지지 않음」 e2e를 둔다(옛 RPC 호출 → 0이 아닌 값 또는 오류).

### S-11 · 중간 · 체중은 기본으로 빼야 한다(SRS-048 「신체정보 기본 제외」) — 보내기 토글 기본값이 스펙에 없다
- 근거: spec.md:118 「섹션 토글」(기본값 없음) · spec.md:124 e2e는 「체중 끄고 보내기」로 사람이 끄는 경우만 본다 · SRS-048 · 0012_coaching.sql:15 「신체 정보는 없다」.
- 문제: 코칭 권한 모델은 신체정보를 범위에서 아예 뺐는데, 요약 보내기가 기본으로 체중을 켜 두면 같은 트레이너에게 다른 경로로 신체정보가 흘러간다.
- 개선안: 체중 섹션의 기본값은 **꺼짐**으로 하고, 켤 때 「코치가 체중 변화를 보게 돼요」 한 줄을 보인다. 마지막으로 고른 값을 기억하더라도 처음은 꺼짐이다. e2e를 추가한다: 아무것도 건드리지 않고 보냄 → 서버 스냅샷에 `bodyweight` 키 없음.

### S-12 · 중간 · 맨몸·어시스트 종목 볼륨은 체중이 있어야 계산된다 — 트레이너 쪽에는 체중이 없어 「같은 숫자」가 깨진다
- 근거: volume.ts:25-31 `effectiveWeightKg`는 `bodyweightKg`로 맨몸+가중·체중−보조를 계산한다 · spec.md:124 트레이너 리포트 = 회원 요약 · S-2에 따라 트레이너는 user_profiles·bodyweight_logs를 받지 않는다.
- 문제: 같은 기간이어도 맨몸 종목이 있으면 총 볼륨·최고 세트가 다르다. 맞추려고 체중을 내주면 S-11·SRS-048을 어긴다.
- 개선안: 총 볼륨은 완료 시 저장된 `workouts.total_volume_kg` 캐시를 양쪽이 공통으로 쓴다(서버 레코드에 이미 있다 — report.go:184). 세트 단위 계산은 체중 없이 하는 규칙(맨몸=가중분만)을 `memberReportFromRecords`에 명시한다. 「같은 숫자」 수용 기준은 세션 수·총 볼륨(캐시)·부위별 세트 수로 한정하고, 맨몸 종목 표본을 테스트에 넣는다.

### S-13 · 중간 · 해지했다가 다시 맺으면 예전 관계 때 보낸 요약이 다시 열린다
- 근거: coaching.sql:47-58 `ReopenGrant`는 **같은 행**을 되살리고 `AcceptGrant`가 `consent_at`을 새로 찍는다 · spec.md:107 progress_summaries는 grant를 참조하지 않는다.
- 문제: 회원이 해지한 뒤, 몇 달 뒤 같은 트레이너와 다시 코칭을 시작하면 예전에 보낸 요약이 전부 다시 열린다. 회원 입장에서는 「해지하면 회수」를 믿었던 데이터다.
- 개선안: Get(트레이너) 조건에 `s.created_at >= grant.consent_at`(timestamptz끼리 비교)을 넣거나, 저장할 때 `grant_id`·`consent_at`을 같이 적고 지금 grant의 consent_at과 같을 때만 연다. 테스트를 추가한다: 보냄 → 해지 → 재요청·수락 → 옛 요약 Get 거부, 새 요약은 허용.

### S-14 · 중간 · `SendAs`가 아무 종류·아무 본문을 보낼 수 있는 공개 메서드다 — 우회 통로가 된다
- 근거: spec.md:111 `SendAs(ctx, senderID, recipientID, kind, body)` · dm/service.go:239-258 일반 Send는 종류별 검사(본문·사진 소유)를 하는데, SendAs는 이것을 건너뛴다.
- 문제: 나중에 다른 패키지가 SendAs로 TEXT나 IMAGE를 보내면 사진 소유 검사·길이 제한(2000)·참여자 검사를 우회한다. sender를 임의로 지정할 수 있어 「누가 보냈나」를 위조하는 서버 내부 통로가 된다.
- 개선안: 범용 SendAs 대신 `SendSummaryNotice(ctx, memberID, trainerID, summaryID)` 하나만 둔다(종류는 SUMMARY로 고정, summaryID는 uuid 형식 검사, 차단 검사 포함). coaching은 이 메서드만 가진 좁은 인터페이스(`SummaryMessenger`)로 주입받는다. 테스트를 추가한다: 차단 관계 → Forbidden · 클라이언트 SendMessage(kind=SUMMARY) → Validation(fromProtoKind가 ""로 떨어져 TEXT로 저장되지 않는지까지).

### S-15 · 중간 · 응답 크기·성능 — 원본을 내리면 지금보다 수백 배 커진다
- 근거: report.go:135-200 지금은 서버에서 세션 수·볼륨·부위 몇 줄·최근 세션 5개만 내보낸다(수백 바이트) · coaching.sql:79 회원 전체 레코드를 매번 다 읽는다 · ADR-040 트레이드오프 「응답이 커진다」.
- 추정: 주 4회 × 6종목 × 4세트, 3개월이면 set_logs 약 1,250행에 workout_exercises 약 300행이 붙는다. 행당 JSON 300–600B로 잡으면 0.5–1MB이고, 1년이면 2–4MB다(S-3의 「직전 기간」까지 내리면 두 배). 서버는 지금도 회원의 전 레코드를 메모리에 올리고(기간 필터 없음), 이제 직렬화 비용이 더해진다.
- 개선안: S-2의 projection·기간 상한을 적용하면 대략 1/3로 준다. 응답 상한(예: 2MB)을 넘으면 `ResourceExhausted`로 「기간을 줄여 주세요」를 보인다. Connect gzip 응답(Cloudflare 압축 포함)을 확인한다. 성능 측정을 검증 항목에 추가한다: 1년 표본의 응답 바이트·서버 시간·트레이너 기기 계산 시간을 기록하고, 360px 기기에서 1초 넘으면 기간 기본값을 4주로 둔다. 장기적으로는 SQL 단계에서 `payload->>'started_at'` 필터를 쓰려면 인덱스가 필요하다는 점을 주석으로 남긴다.

### S-16 · 낮음 · 알림이 `post_id` 칸을 빌려 쓰면 옛 앱에서 글 화면 404로 간다
- 근거: 0008_dm_notification.sql:54-63 notifications에는 `post_id`만 있다 · NotificationsClient.tsx:37-40 모르는 kind면 `routes.postComments(postId)`로 간다 · spec.md:110·121.
- 개선안: 요약 id를 알림에 싣지 않는다(옛 앱의 target은 `/feed`로 떨어진다). 새 앱은 kind `coaching_summary`면 그 회원과의 대화로 간다. 알림 행에는 숫자·문구가 없으므로(문장은 화면이 만든다) 회수 문제는 없다. proto `NotificationKind`에 값을 추가하고, 옛 앱은 `notif.generic`으로 보인다는 점을 스펙에 적는다. Notify는 S-5의 「실제 첫 전달」에서만 부른다.

### S-17 · 낮음 · 열람 거부 응답으로 요약이 있는지 없는지 알 수 있다
- 근거: spec.md:110 「아니면 PermissionDenied」.
- 개선안: 당사자(그 요약의 회원·받는 트레이너)인데 관계가 끝났으면 PermissionDenied를 돌린다(화면에 「코칭이 끝나 볼 수 없어요」). 당사자가 아니면 NotFound를 돌린다. 테스트 두 줄을 추가한다.

### S-18 · 낮음 · 트레이너 화면이 회원이 보낸 JSON을 그린다 — 받는 쪽 검증·표시 규칙이 없다
- 근거: spec.md:113 「서버 해석 금지」 · spec.md:119 SummaryView(회원·트레이너 공용).
- 문제: 회원이 고친 클라이언트로 숫자를 지어내거나, 아주 긴 배열·긴 이름·이상한 키를 보낼 수 있다. React가 이스케이프하므로 XSS 위험은 낮다. 다만 href·style에 값을 쓰거나 배열 길이를 믿으면 화면이 깨진다.
- 개선안: SummaryView 앞에 core `parseSummaryV1(json)`(모르는 키 버림 · 배열 상한 prs ≤ 50 · topExercises ≤ 5 · 문자열 ≤ 80자 · 숫자 유한값)을 두고 회원·트레이너 양쪽이 쓴다. 스냅샷 값으로 링크를 만들지 않는다. 카드에 「회원이 보낸 요약(보낸 시점)」 라벨을 달아 원본 기록(GetMemberRecords)과 구분한다.

### S-19 · 낮음 · 보관·삭제·목록 상한
- 근거: spec.md:107(FK·삭제 규칙 없음) · `ListSentSummaries{}`(페이지·상한 없음) · 0012의 원칙 「복사해 두면 해지 뒤에도 남는다」를 이번에 의도적으로 깨는 첫 테이블이다.
- 개선안: `member_id`·`trainer_id` → users ON DELETE CASCADE를 둔다(계정 삭제 시 함께 사라짐). List는 최근 50개와 커서로 나눈다. 받는 쪽 행 수 폭주를 막기 위해 회원당 하루 20건 같은 전송 상한을 둔다(트레이너 DM·알림 도배 방지). 회원이 「보낸 요약 거두기」로 직접 지울 수 있을지는 /reflect 후보로 남긴다(SRS 범위 밖이라 이번엔 기록만).

### S-20 · 낮음 · 응답 캐시와 트레이너 기기 잔존
- 근거: sw.js:94 GET만 가로채고 `/api/`는 제외(지금은 안전) · SAD-022 ① 「클라이언트 캐시 퍼지 신호」.
- 개선안: 새 RPC 4개에 `idempotency_level = NO_SIDE_EFFECTS`를 달지 않는다(달면 connect-web이 GET으로 바꿔 브라우저·CDN 캐시 대상이 된다). 서버 응답에 `Cache-Control: no-store`를 붙인다. 트레이너 쪽 `memberReportFromRecords` 결과와 원본 레코드는 컴포넌트 상태에만 두고 Watermelon·localStorage·IndexedDB에 쓰지 않는다(스펙 문장 + e2e로 트레이너 브라우저 저장소에 회원 id가 없는지 확인). 해지 뒤 열려 있던 다이얼로그는 다음 요청부터 거부되는 것으로 충분하다고 명시한다.

### 참고 (이번 범위 밖 · 기존 부채)
- `assertActiveGrant`(service.go:297-312)는 status·scope만 보고 SRS-048의 3조건 중 「프로 구독 활성」과 「차단 여부」를 보지 않는다. 새 RPC가 같은 가드를 쓰므로 구멍도 같이 물려받는다. 이번 스펙에서 고치지 않더라도 알려진 한계로 적어 둔다.
- 기간 경계를 로컬 날짜로 정하므로, 회원과 트레이너의 시간대가 다르면 「같은 기간」이 하루 어긋난다. 요청 기간은 ms(UTC) 절대값으로 주고받고, 날짜 경계는 회원 쪽 기준을 SummaryV1.range에 그대로 싣는다(보안 문제는 아니고 같은 숫자 기준에 걸린다).

## 판정

**조건부 통과** — 높음 5건(S-1 받는 트레이너 묶기 · S-2 컬렉션·칸·기간 최소화 · S-3 PR·직전 대비 이력 범위 · S-4 대기열 계정 분리 · S-5 저장–DM 멱등)을 스펙 Phase 4 본문에 반영해야 P4 `/execute`를 시작할 수 있다. 중간 10건(S-6~S-15)은 같은 개정에서 스펙 문장이나 테스트 항목으로 넣기를 권장한다. 낮음 5건(S-16~S-20)은 구현 중 처리해도 된다. P1~P3는 이 지적과 무관하므로 그대로 진행해도 된다. 다만 P1의 `bodyweight_logs` 컬렉션이 리포트 허용 목록에 들어가지 않는다는 주석·테스트(spec.md:47)는 S-2와 함께 고정한다.
