# SPEC-064 — 그룹 챌린지 MVP — 초대 그룹·앱 카메라 인증·하루 판정·만회·면제권·벌칙 기록·이의

> 타입 Spec · 그룹 할일/그룹-챌린지 · ADStudio가 `SPEC-064.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-065, SAD-027, SRS-118, SRS-119, SRS-120, SRS-121

### 목표

친구 2~10명이 초대 링크로 모여 기간과 목표를 정한다. 출석은 운동 중에 앱 카메라로 찍은 인증 사진과 서버에 동기된 운동 기록으로 인정한다. 빠진 날은 만회 운동·면제권·그룹이 정한 벌칙 기록으로 다룬다. 돈은 다루지 않는다(BS-010 결정 · ADR-065 · RM-021 1단계). REV-159의 채택 47건을 반영했다.

등급은 Project다. DB 새 표 8개, 새 RPC 서비스, 서버 루프, 비공개 사진 저장소, 앱 화면 3개와 카메라, 앱 껍데기 1.8.0까지 여러 영역에 걸치기 때문이다.

### 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/database/migrations/0038_challenges.sql` | 표 8개 · CHECK · 인덱스 · FK ON DELETE(아래 1) |
| `src/database/queries/challenge.sql` | 만들기·참가(FOR UPDATE)·상세·출석표·인증·판정 입력(sync_records JSON)·이의·벌칙·알림 기록·보관 삭제 |
| `src/proto/challenge/v1/challenge.proto` | ChallengeService |
| `src/proto/notification/v1/notification.proto` · `src/backend/internal/notification/service.go` · `handler.go` | 종류 12 REMIND · 13 MISSED · 14 PROOF_INVALID · 15 ENDED · 16 CANCELLED (ref_id = 챌린지 id) · Kind 상수 · toProtoKind |
| `src/backend/internal/challenge/{rules.go,service.go,repo.go,handler.go,photo.go,loop.go}` + 시험 | 규칙 순수 함수 · 서비스 · 저장소 · RPC · 사진(검사·재인코딩·dHash·비공개 저장·멤버 확인 읽기) · 판정/알림/보관 루프(RunOnce(now)) |
| `src/backend/internal/config/` | CHALLENGE_PHOTO_DIR(또는 S3 비공개 버킷) · CHALLENGE_LOOP_INTERVAL_SEC(기본 600) |
| `src/backend/cmd/server/main.go` | 서비스·핸들러·루프 연결 · `/challenge-proof/` 경로 · ReadMaxBytes 4.5MB · 속도 제한 |
| `src/backend/internal/auth/account.go` | 탈퇴 때 인증 사진 파일 삭제 |
| `src/backend/internal/moderation/` · 운영 웹 신고 검토 | 신고 대상 challenge_proof · 검토자용 사진 읽기 |
| `src/scripts/backup-h2500-3.sh` | 비공개 사진 디렉터리를 백업에서 뺀다(확인) |
| `src/frontend/lib/challengeClient.ts` | RPC 클라이언트 · 사진 fetch(Bearer) → blob URL |
| `src/frontend/app/challenges/page.tsx` · `[id]/page.tsx` · `join/[token]/page.tsx` | 목록·만들기 · 상세 · 초대 받기 |
| `src/frontend/app/components/challenge/*` | 만들기 시트 · 주간 출석표 · 인증 카메라(ProofCamera) · 사진 보기·이의 · 벌칙 목록 · 결과표 |
| `src/frontend/app/components/session/ActiveWorkout.tsx` · `WorkoutSummary.tsx` · 완료 확인창 | 「인증 사진」 줄(오늘 체중 줄 옆) · 완료할 때 미인증 안내 · 요약 화면 30분 |
| 진입점 | 운동 홈 「<챌린지> · 오늘 아직」 줄 · 피드 카드(AwardsFeedCard 자리 방식) · 프로필 메뉴 「챌린지」 · 알림 5종 글·이동 |
| `src/core/src/i18n/locales/{ko,en}.ts` | 문구 |
| `src/mobile/android/app/src/main/AndroidManifest.xml` · `src/mobile/ios/App/App/Info.plist` · AASA · `src/mobile/release.json` · `src/mobile/package.json` | CAMERA + uses-feature required=false · 앱 링크 /challenges/ · iOS 카메라 문구에 「챌린지 인증」 덧붙임 · 1.8.0(versionCode 16) |

### 설계

#### 1. 데이터

```sql
challenges(id text PK, owner_id text NULL REFERENCES users ON DELETE SET NULL, title text, starts_on date /* KST */,
  weeks int CHECK 1..8, rule_kind text CHECK IN ('daily','weekdays'),
  weekdays int CHECK (weekdays BETWEEN 1 AND 127) CHECK (rule_kind<>'daily' OR weekdays=127) /* 비트 0=월 … 6=일 */,
  min_sets int CHECK 1..30 DEFAULT 5, proof_mode text CHECK IN ('gym','any_photo','record'),
  penalty_text text CHECK (length(penalty_text)<=60), pass_per_week int CHECK IN (0,1),
  invite_token text UNIQUE /* 128비트 crypto/rand */, status text CHECK IN ('recruiting','active','ended','cancelled'),
  created_at, ended_at NULL, photos_purged_at NULL)
challenge_members(challenge_id ON DELETE CASCADE, user_id ON DELETE CASCADE, joined_at, left_at NULL, PK(challenge_id,user_id))
  INDEX (user_id) WHERE left_at IS NULL
challenge_prompts(id text PK /* 일회용 번호 */, challenge_id, user_id, workout_id, prompt_code, issued_at, used_at NULL)
  /* 끝난 챌린지의 지시는 보관 삭제 때 같이 지운다 */
challenge_proofs(id PK, challenge_id, user_id, workout_id, prompt_id UNIQUE, prompt_code, issued_at, captured_at /* 서버 */,
  storage_key NULL, dhash bigint, source text IN ('app','web'), dup_of NULL,
  status text IN ('ok','suspect_dup','invalid'), invalid_at NULL, created_at)
  INDEX (challenge_id, user_id), INDEX (user_id)
challenge_days(challenge_id, user_id, day, result text IN ('done','made_up','pass','missed_open','missed','rest'),
  final bool CHECK (result<>'missed_open' OR NOT final), workout_id NULL, sets int NULL, proof_id NULL,
  judged_at, PK(challenge_id,user_id,day))
challenge_flags(proof_id, voter_id, created_at, PK(proof_id,voter_id))
challenge_debts(challenge_id, user_id, day, paid_at NULL, paid_by NULL, PK(challenge_id,user_id,day))
challenge_notices(challenge_id, user_id, kind, ref text /* 날짜 또는 proof id, 끝/취소는 마지막 날 */, PK(challenge_id,user_id,kind,ref))
```

- 시간대는 Asia/Seoul로 고정한다. 하루 경계는 Go가 `time.Date(y,m,d,4,0,0,0,KST)`로 계산한다.
- 지시 코드는 서버의 고정 목록(손 모양 6 × 기구 종류 6, any_photo는 손 모양만)에서 고른다. 문구는 앱 i18n이 코드로 찾는다.
- 인증 사진은 media_assets에 넣지 않는다. 별도 Storage 인스턴스(디스크 `CHALLENGE_PHOTO_DIR` / S3 비공개 버킷)에 둔다. 공개 /media 경로로는 처음부터 닿을 수 없다(불변식 시험).

#### 2. 규칙(rules.go — DB 없이 시험, now 주입)

- `DayOf(t)` · `DayBounds(day)`: 04:00 KST 경계. `WeekIndex(day) = (day − starts_on)/7`. `IsRequired(ch, day)`: 기간 안이고 요일 비트가 켜졌는가.
- **판정 입력**은 sync_records의 JSON이다. workouts(state completed · source null · deleted false · started_at ms · 끝 시각 · duration ≤ 4시간)와 세트 수를 쓴다. 세트 수는 workouts → workout_exercises(workout_id, deleted false) → set_logs(workout_exercise_id, deleted false, 웜업 제외, done이 true이거나 null)로 센다. 기존 `src/database/queries/coaching.sql` ListMemberRecordsByParent의 부모 칸 방식을 쓴다. 끝 시각의 필드 이름은 Phase 1a에서 `src/core/src/db/schema.ts`로 확인한다.
- **사진 인정**: proof가 ok이거나 suspect_dup이다. 운동 started_at − 10분 ≤ prompt.issued_at이고, captured_at ≤ 운동 끝 + 30분이다. 인증 날짜는 DayOf(운동 started_at)다.
- **첫 판정**(D 끝 + 12시간): 그때 서버에 있는 기록만으로 판정하고 증거(workout_id·sets·proof_id)를 challenge_days에 남긴다. 결과는 rest / done / missed_open 중 하나다. 늦게 올라온 기록은 따로 거르지 않는다. 첫 판정 때 없었으면 인정하지 않는다.
- **확정**(D+1 끝 + 12시간, = D+1의 첫 판정과 같은 회차): missed_open인 D는 이렇게 처리한다. (1) D+1에 한 운동이 sets ≥ min×2면 made_up이다. (2) 아니면 그 주 면제권이 남았을 때 pass다. (3) 아니면 missed가 되고 벌칙 1. 그 뒤 final이다. 기간 마지막 날의 다음 날도 만회에 쓸 수 있다.
- **얼림**: final 행은 기록을 다시 읽지 않는다. 예외는 이의 무효뿐이다. 그 proof를 쓴 날을 같은 규칙으로 다시 판정하고, 벌칙도 고친다. 이미 확정된 다른 날의 면제권은 옮기지 않는다.
- **이의**: Flag는 그날이 final이 되기 전까지만 받는다. 과반 = floor(n/2)+1이고, n은 누른 순간 인증 주인을 뺀 활성 멤버 수다. 과반에 닿으면 invalid(되돌리지 않음)가 된다. Unflag는 무효 전에만 된다.
- **중복**: 서버가 다시 인코딩한 이미지의 dHash를 본인 지난 인증과 비교해 거리 ≤ 문턱(기본 4, Phase 1b에서 실제 사진으로 정함)이면 거부한다. 같은 그룹 다른 사람 사진과 가까우면 suspect_dup만 표시한다. 거리는 PG `bit_count(dhash # $1)`.
- **끝**: 마지막 날 확정과 같은 트랜잭션에서 status ended, ended_at, ENDED 알림 기록. 시작일 04:00에 활성 멤버가 2명 미만이면 cancelled와 CANCELLED 알림.

#### 3. 계약(challenge.v1)

- Create · Update(시작 전, 방장) · RotateInvite · GetInvite(token → 요약·인원 수만, 비로그인 허용, IP 속도 제한) · Join(token: 모집 중, `SELECT … FOR UPDATE`로 정원, 사용자 advisory xact lock으로 동시 5개) · Leave(방장은 진행 중이면 넘기기 필수, 모집 중이면 해산) · TransferOwner · Kick(시작 전, 방장)
- ListMine · Get(id) → 규칙 · 멤버 · 주 단위 결과(week 인자, 실시간 계산 + 확정값) · 멤버별 합계 · 내 남은 면제권 · 벌칙 목록 · 인증 목록(사진 id·지시 코드·표시)
- ActiveForWorkout → 오늘 인증이 필요한 진행 중 챌린지
- IssuePrompt(challenge_id, workout_id) → prompt_id · prompt_code · expires_at(3분). 운동이 서버에 없어도 발급한다.
- UploadProof(prompt_id, jpeg ≤4.5MB, source): 바이트 스니핑으로 jpeg 확인 → DecodeConfig(한 변 ≤4096 · ≤16MP) → 디코드 → 다시 인코딩 → dHash → 저장. 사용자당 분당 10회.
- Flag(proof_id) · Unflag · MarkDebtPaid(challenge_id, user_id, day, paid)
- 사진 읽기: `GET /challenge-proof/<proof id>`(Bearer, 멤버 확인, Cache-Control private, no-store). 앱은 fetch → blob URL로 보인다.
- 멤버가 아니면 모두 NotFound. 차단 관계면 참가를 거부한다.

#### 4. 루프(loop.go)

- `RunOnce(ctx, now)`가 판정·확정·21시 알림·시작/취소·끝을 한 번 돈다. 트랜잭션 안에서 `pg_try_advisory_xact_lock(7_321_064)`를 잡는다(기존 키 7_321_032·80과 다름).
- 알림은 challenge_notices INSERT … ON CONFLICT DO NOTHING RETURNING이 행을 돌려줄 때만 보낸다. 판정과 같은 트랜잭션에서 넣고, 알림은 커밋 뒤 보낸다. 21시 알림은 「now ≥ 21:00이고 기록 없음」 조건이라 재시작해도 놓치거나 겹치지 않는다.
- 보관 삭제는 하루 한 번. 끝·취소 30일이 지났고 처리 안 된 신고가 없는 사진 파일을 지운 뒤 storage_key를 NULL로 바꾸고, 지시 행도 지운다.
- 주기: CHALLENGE_LOOP_INTERVAL_SEC(기본 600, e2e는 2).

#### 5. 앱 화면

- /challenges: 진행·모집 카드 + 끝난 카드(접힘) + 「새 챌린지」. 만들기 시트 아래에 규칙 요약을 사람 말로 보인다.
- 규칙 문구(만들기·참가·상세 공통, 숫자는 실제 값으로): 「하루는 새벽 4시에 바뀌어요」 · 「빠진 날은 다음 날 한 운동에서 10세트를 하면 채워져요」 · 「못 채우면 면제권(주 1번)을 자동으로 써요」 · 「면제권도 없으면 벌칙 1개: 커피 쏘기」 · (2명이면) 「상대가 「인증 아닌 것 같아요」를 누르면 그 인증은 무효예요」 · 「미완료 알림은 앱 알림 목록에 보여요」.
- /challenges/join/[token]: 규칙 요약, 인원 수, 「참가」. 비로그인이면 「가입하고 참가」를 누르고 가입 뒤 같은 화면으로 돌아온다. 웹에서 참가했으면 「인증은 앱에서 · 앱 받기」.
- /challenges/[id]: 모집 중이면 「시작까지 n일 · n명 더 있어야 시작돼요」와 초대 링크 복사. 진행 중에는 머리(바탕 없는 글자: n일째/총 · 오늘 상태), 멤버별 합계 한 줄, **주간 출석표**(이름 열 72px sticky + 7칸 × 36px, ‹ › 주 넘김), 범례, 벌칙 목록(이행 체크)이 보인다. 끝나면 결과표, 「사진은 <날짜>에 지워져요」, 「같은 멤버로 다시 하기」.
- 칸: 기호와 색을 함께 쓴다. 완료 ✓ · 만회 ↺ · 면제 「면」 · 만회 가능 「!」 · 빠짐 ✕ · 쉼 · · 오늘은 굵은 테두리 · 동기 전은 「…」. 모서리 작은 글자로 「웹」·「의심」. 칸마다 aria-label(「민수 11월 3일 만회」). 칸을 누르면 사진 보기 시트(사진, 그때 지시 문구, 「인증 아닌 것 같아요」, 신고는 따로)가 열린다.
- ProofCamera: getUserMedia(environment) 미리보기 + 지시 + 남은 시간 + 셔터 → 다시 찍기 / 올리기. 파일 입력은 없다. 올리기에 실패하면 사진을 두고 「다시 올리기」, 지시가 만료되면 「새 지시로 다시 찍기」. 「다른 사람 얼굴이 나오지 않게 찍어 주세요」.
- 카메라 안내: 앱 버전이 1.8.0 미만이면 「앱을 업데이트해야 찍을 수 있어요 · 업데이트」. 권한을 거부했으면 기기별 설정 안내 + 「설정 열기」. 오프라인이면 「연결되면 찍을 수 있어요 · 운동 끝나고 30분까지 돼요」(연결되면 저절로 켜짐).
- 운동 화면: 본문 맨 위 오늘 체중 줄 옆에 「인증 사진」 상자 버튼을 둔다. 챌린지가 여럿이면 「인증 사진 (2)」 → 고르기. 인증했으면 바탕 없는 「인증함 ✓」 + 「다시 찍기」 버튼. 「완료」를 누를 때 인증이 없으면 확인창에 「챌린지 인증 사진을 아직 안 찍었어요 · 지금 찍기」. 운동 요약 화면에도 30분 동안 버튼을 둔다.

### 작업 단계

#### Phase 1a — DB·계약·규칙

- [x] 착수 때 전체 e2e 한 번 → 실패 목록을 EXE에 고정(회귀 기준선) (새로 돌리지 않고 b7d7b1e 지난 실행 — 알려진 실패 7 — 로 갈음 · EXE-129)
- [x] 0038 마이그레이션 · challenge.sql · make sqlc(카탈로그 판 제외 사본) · challenge.proto · 알림 12~16(proto·service.go·handler.go) · make proto
- [x] rules.go + rules_test.go(표 기반: 03:59/04:00 · 요일 · 첫 판정 · 만회 2배 · 마지막 날 다음 날 만회 · 면제권 확정 때·주 번호 · 얼림 · 이의 무효 재판정 · 과반)
- [x] repo 판정 입력 쿼리 + repo_pg_test.go(늦게 올라온 운동 · 지운 세트 · 웜업 · 가져온 기록 · 진행 중 · 같은 날 두 운동 · 경계)
- 완료 기준: `LIFTGRAM_TEST_DATABASE_URL`(이름에 test/e2e 확인)을 넣고 `go test -v ./internal/challenge/...`에서 SKIP 0 · go vet

#### Phase 1b — 서비스·사진·루프

- [x] service·handler(만들기~벌칙, 잠금·정원·5개·차단·넘기기·해산)
- [x] photo.go(스니핑·DecodeConfig·재인코딩·dHash·비공개 Storage·`/challenge-proof/`·no-store) · 실제 헬스장 사진 몇 장으로 문턱 정하기 · 탈퇴 삭제 · 신고 대상과 검토자 읽기
- [x] loop.go RunOnce(now) · xact lock · notices · 보관 삭제 · CHALLENGE_LOOP_INTERVAL_SEC
- 완료 기준: 서비스 시험(가짜 저장소) · photo_test(같은/다른/살짝 바뀐 사진, 폭탄 크기 거부, 재인코딩 뒤 EXIF 없음) · PG 시험(동시 Join 두 개 · 루프 두 개 동시 → 벌칙 1·알림 1 · 파일이 실제로 지워짐 · 공개 /media로 404) SKIP 0

#### Phase 2 — 앱 화면: 그룹

- [x] challengeClient.ts · /challenges · 만들기 시트 · join 화면(가입 뒤 돌아오기) · 상세(모집·진행·끝) · 주간 출석표 · 벌칙 · 넘기기/나가기 · 진입점 3곳 · 알림 5종 글·이동 · 문구 ko·en
- 완료 기준: tsc · e2e `src/frontend/e2e/challenges.spec.ts`(새 DB · 두 사용자: 만들기 → 링크로 참가 → 규칙 고치기 → psql로 starts_on을 과거로 + 루프 2초 → 진행 중·출석표 · 정원·차단은 psql로 멤버를 미리 넣고 거부 화면만 · 토큰 바꿈) · 버튼 모양·색 규칙 가드에 출석표 포함

#### Phase 3a — 인증 카메라 → 그날 완료

- [x] ProofCamera · 운동 화면 줄 · 완료 확인창 · 요약 화면 · 사진 보기 시트(blob)
- 완료 기준: e2e(사용자마다 `chromium.launch`에 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<사용자별 y4m>`. y4m 사이 dHash 거리가 문턱보다 큰지 photo_test로 고정): 운동 시작 → 인증 → 세트 5 → 마치기 → 동기 끝 대기 → 시각을 psql로 당김 → 그날 완료 · 같은 파일 두 번이면 거부 · 지시 만료 · 운동 없으면 버튼 없음 · 파일 입력 없음 · 남이 사진 주소를 열면 404

#### Phase 3b — 만회·면제권·이의·벌칙

- [x] 출석표 칸 → 이의 · 벌칙 이행 체크 · 끝 화면
- 완료 기준: e2e: 빠짐 → 다음 날 10세트로 만회 · 만회 없음 + 면제권 → 면제 · 면제권 없음 → 빠짐 + 벌칙 1 → 이행 체크 · 세 명 그룹에서 두 명 이의 → 무효 → 다시 판정 · 끝 → 결과표 · 옛 앱 버전 흉내 → 업데이트 안내 · 권한을 주지 않으면 설정 안내

#### Phase 3c — 앱 껍데기 1.8.0

- [ ] AndroidManifest CAMERA + uses-feature camera required=false · 앱 링크 /challenges/ · iOS Info.plist 문구 덧붙임 · AASA · release.json 1.8.0(16) · mobile/package.json · iOS 버전
- 완료 기준: 안드로이드 디버그 빌드를 실기기(또는 에뮬레이터)에 깔아 카메라 권한 창 → 인증 업로드까지 수동 확인하고 화면 캡처를 EXE에 남긴다 · minVersionCode는 올리지 않는다

#### Phase 4 — 보관·회귀

- [ ] 끝 + 30일 삭제(시각 당김) · 미처리 신고가 걸린 사진은 미룸 · 백업 제외 확인
- [ ] 전체 e2e 회귀 · core 단위 시험 · tsc(frontend·core)
- 완료 기준: 기준선 대비 새 실패 0

#### Phase 5 — 배포

- [ ] qa code · EXE · 버전(웹 0.105.0 · 앱 1.8.0) · 이 작업 파일만 커밋
- [ ] 배포 직전 수동 백업(`src/scripts/backup-h2500-3.sh`) · 웹 배포(`src/scripts/deploy-h2500-3.sh`). **웹 배포와 함께 안드로이드 1.8.0 APK가 사이트에 공개된다**
- [ ] 운영 확인: /challenges 열림 · 시험 계정으로 만든 뒤 해산 · `/media/` 경로로 인증 사진이 안 열림 · 비공개 사진 디렉터리 권한
- [ ] iOS는 빌드하고 TestFlight까지 올린 뒤 제출을 사용자에게 알린다
- 되돌림: 0038은 표만 더하므로 웹을 되돌려도 무해하다. 다만 옛 웹에서는 챌린지 알림이 일반 글로 보인다(받아들임).

### 수용 기준

| SRS | 확인 |
| --- | --- |
| SRS-118 | 시험: 정원 10(동시 Join) · 시작 전에만 고치기 · 2명 미만 취소 + 알림 · 토큰 바꾸면 옛 링크 무효 · 비로그인 요약은 인원 수만 · 비멤버 NotFound · 동시 5개 · 방장 넘기기/해산 |
| SRS-119 | 시험: 파일 입력 없음 · 지시 3분·일회용 · 인정 구간(시작 −10분 ≤ 발급, 받은 시각 ≤ 끝 +30분, 4시간 상한) · 재인코딩·EXIF 없음 · 크기 상한 · 본인 중복 거부 · 그룹 유사 의심 표시 |
| SRS-120 | 시험: 경계 · 첫 판정 증거 · 만회 2배 · 면제권은 확정 때 · 얼림 · 이의 마감·과반·무효 재판정 · 알림 키마다 한 번 · 루프 동시 실행에도 벌칙 하나 |
| SRS-121 | 시험: 남·나간 멤버 404 · 공개 /media 404 · no-store · 30일 뒤 파일 삭제(미처리 신고 미룸) · 탈퇴 삭제 · 백업 제외 · 신고 검토 읽기 |

### 테스트 계획

- Go: rules_test(표 기반, now 주입) · service_test(가짜 저장소) · photo_test · repo_pg_test(testpg, SKIP 0 확인)
- 앱 e2e: src/frontend/e2e/challenges.spec.ts. 서버 시각은 시험 DB 값을 psql로 옮겨서 다룬다. 시험 전용 RPC는 만들지 않는다. 가짜 카메라 파일은 사용자마다 따로. page.clock은 화면 표시에만 쓴다.
- 전체 e2e 회귀(기준선 비교) · core 단위 시험 · tsc · 안드로이드 실기기 수동 확인

### 위험·주의

- 운동 기록은 기기가 올리는 값이다. 사진, 서버 시각, 사람 이의를 겹쳐도 친구가 대신 찍는 것까지는 못 막는다(ADR-065에서 감수).
- 2명 그룹은 상대 한 명의 이의로 무효가 된다. 참가 전에 알리고, 이의는 확정 전까지만 받으며, 누가 이의했는지는 보이지 않는다.
- 앱 푸시가 없어서 21시 알림은 앱 안 목록에만 쌓인다. 푸시는 별도 범위로 보류했다(REV-159).
- 옛 앱(1.7.1)은 카메라 권한이 없다. 버전을 보고 업데이트를 안내한다. 사진 방식 그룹에서 옛 앱 사용자는 업데이트해야 인증할 수 있다.
- dHash 문턱이 너무 낮으면 다른 날 같은 각도로 찍은 사진이 거부된다. 실제 사진으로 재서 정하고, 문턱을 넘지 않는 유사 사진은 표시만 한다.
- 사진은 개인정보다. 로그에 키나 바이트를 남기지 않는다. 공개 미디어와 저장소를 나누고, 백업에서 뺀다.
