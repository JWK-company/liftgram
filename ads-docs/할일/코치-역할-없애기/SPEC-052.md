# SPEC-052 — 코치 역할 없애기 — 누구나 코칭 연결, 배지는 연결에서

> 타입 Spec · 그룹 할일/코치-역할-없애기 · ADStudio가 `SPEC-052.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-062, SRS-115
- **refs_legacy** → PLM:SRS-045, PLM:SRS-048

### 목적

「트레이너」라는 역할(직업)을 없앤다. 모두 같은 사용자이고, 코치·회원은 **연결(coaching_grants)이 맺어질 때만** 생긴다. 사용자가 승인한 권장안 1을 그대로 옮긴다.

### 지금(바꾸기 전)

- 서버 `src/backend/internal/coaching/service.go` 의 `assertTrainerEligible` 가 `users.trainer_intent` 를 보고 요청·수락·초대 코드 만들기를 막는다(「trainer has not enabled coaching」). `src/backend/internal/coaching/connect_v2.go` 의 `checkInviteUsable` 도 의향이 꺼지면 코드를 「없는 코드」로 본다.
- 화면: `src/frontend/app/components/coaching/CoachingClient.tsx` 가 의향을 켠 사람에게만 초대 카드(`src/frontend/app/components/coaching/InviteCard.tsx`)를 보인다. 사람 프로필(`src/frontend/app/components/feed/UserProfileClient.tsx`)은 상대·나의 의향으로 「코칭 요청」/「코칭 초대」 중 하나만 띄운다.
- 「코치」 배지(`CoachBadge`)는 `trainer_intent` 를 그대로 쓴다 — 스스로 켜는 표시다.
- 첫 실행 안내(`src/frontend/app/components/OnboardingOverlay.tsx`)에 「나는 회원을 구하고 싶어요 (트레이너·코치)」 질문이 있다.
- 홈 「담당 회원」 카드(`src/frontend/app/components/coaching/HomeMembersCard.tsx`)는 의향이 켜진 사용자만 연결 목록을 묻는다.

### 바꾼 뒤

1. **누구나** 초대 코드를 만들고, 누구에게나 「코칭 받기 요청」·「회원으로 초대」를 보낼 수 있다. 서버의 의향 검사는 「그 계정이 있는가」로 바뀐다. 지키는 규칙은 그대로: 나 자신 금지 · 차단 사이 금지 · 회원 한 명당 활성 코치 한 명(`HasOtherActiveCoach` + `coaching_grants_one_coach` 인덱스) · 같은 쌍 중복 요청 금지 · 수락 때 차단 재확인.
2. 프로필 「운동 경력」 시트의 의향 칩 → **「코치 찾기에 나를 보여 주기」**(기본 꺼짐) 하나. 열 `users.trainer_intent` 는 이름 그대로 두고 뜻만 「코치 검색 노출」. 코치 찾기(`SearchTrainers`)는 지금처럼 `trainer_intent = true` 인 사람만. 코치 소개·태그(`src/frontend/app/components/profile/CoachProfileFields.tsx`)는 켰을 때만 편집·표시(지금 그대로).
3. **「코치」 배지 = 파생값**: 활성 연결에서 코치(trainer)인 회원이 한 명 이상(`EXISTS coaching_grants WHERE trainer_id = u.id AND status = 'active'`). 서버가 계산해 새 칸 `is_coach` 로 내려 준다. 옛 칸 `trainer_intent` 는 뜻만 바뀐 채(노출 여부) 계속 내려간다(옛 앱 호환 · 새 화면은 배지에 쓰지 않는다).
4. 첫 실행 안내의 트레이너 질문을 없앤다(경력 질문은 남김). 저장할 때 의향을 보내지 않는다(이미 켠 사람의 값을 지우지 않게).
5. 홈 「담당 회원」 카드·점검 요청은 내 계정의 `is_coach`(코치로서 활성 연결이 있는가)로 판단한다 — 코칭 안 하는 사용자에게는 지금처럼 요청이 나가지 않는다.
6. 문구(ko·en): 의향·트레이너 문구를 새 뜻으로.

### 설계

#### 서버

- `src/database/queries/coaching.sql`: 새 질의 `IsActiveCoach`(`:one`, EXISTS · 기존 인덱스 `coaching_grants_trainer_idx (trainer_id, status)` 를 탄다). `SearchTrainers`·`GetCoachPeer` 에 `is_coach` 열, `ListGrantsForUser` 에 `trainer_is_coach`·`member_is_coach` 열.
- `src/database/queries/feed.sql`: `SearchUsers`·`ListFollowers`·`ListFollowing` 에 `is_coach` 열. 프로필은 `IsActiveCoach` 한 번.
- 스키마 변경 없음(열·인덱스가 이미 있다 — 0012 의 trainer 인덱스). **데이터 정리 마이그레이션 `src/database/migrations/0036_coach_role_cleanup.sql` 하나**: 노출을 끈(`trainer_intent = false`) 사람의 살아 있는 초대 코드를 회수한다 — 지금까지 의향을 끄면 코드가 죽었는데, 검사가 없어지면 배포 순간 되살아나기 때문이다(멱등 UPDATE). 0033~0035 는 손대지 않는다.
- 요청 제한: `RequestCoaching` 에도 초대 코드와 같은 분당 상한(사용자·IP 각 10)을 건다 — 누구에게나 버튼이 생겨 스팸 길이 넓어진다.
- 코치 소개·태그가 **보이는 곳 규칙 하나**: 노출을 켠 사람만. 서버가 코칭 `Peer`(코드 카드·범위 시트 머리·연결 줄·검색)를 만들 때 노출이 꺼져 있으면 소개·태그를 비워 보낸다(프로필은 화면이 이미 노출로 가린다).
- 피드 프로필의 `IsActiveCoach` 확인이 실패하면 배지만 빼고 프로필은 그대로(auth 와 같은 정책).
- `src/backend/internal/coaching/service.go` `assertTrainerEligible`: `[원본]` 의향 검사 → `[개선]` 계정이 있는지만(없으면 NotFound). `src/backend/internal/coaching/connect_v2.go` `checkInviteUsable` 도 같게 — 코치 계정이 없어졌을 때만 「없는 코드」. 저장소 `TrainerEligible` 은 「계정이 있다 = true」로(`[원본]` 보존).
- `Peer` 에 `IsCoach` 를 더하고 `src/proto/coaching/v1/coaching.proto` `Peer` 에 `bool is_coach = 8`. `src/proto/feed/v1/feed.proto` `SocialProfile`·`UserResult` 에 `is_coach`, `src/proto/auth/v1/auth.proto` `User` 에 `bool is_coach = 13`. 옛 `trainer_intent` 주석을 「코치 찾기 노출(코치 여부 아님)」으로.
- 내 계정 `is_coach`: `src/backend/internal/auth/service.go` 에 `WithCoachCheck(func(ctx, userID) (bool, error))` · 핸들러가 `User` 를 내보내는 곳(가입·로그인·갱신·Me·프로필 수정·로그인 코드 교환)에서 채운다. 검사 실패는 로그만 남기고 false(로그인을 막지 않는다). 조립은 `src/backend/cmd/server/main.go` 에서 `sqlcgen.New(pool).IsActiveCoach`.

#### 화면

- `src/frontend/app/components/coaching/CoachingClient.tsx`: 초대 카드를 누구에게나. 자리 = 「담당 회원」 목록 **아래**(회원을 받는 일이라 그 칸 · 목록을 밀어내지 않게). 코치가 아니면(`isCoach` 거짓) 「코드 만들기」는 보조 버튼(회원뿐인 사람 화면의 빨강 채움 0). 연결 목록을 읽은 뒤 「코치로서 활성 연결 수 > 0」 이 계정 사본 `isCoach` 와 다르면 `refreshMe()` — **화면을 열 때마다 한 번만**(useRef · 서버 확인 실패로 계속 어긋나도 고리가 돌지 않게). GrantRow 배지 = `roleOfMe === MEMBER && peer.isCoach`. 코치 찾기 결과·범위 시트 머리(CoachCard)의 배지도 `isCoach` 일 때만.
- `src/frontend/app/components/coaching/CoachBits.tsx` `CoachCard`: `coach?: boolean` 받아 배지를 그때만(`[원본]` 늘 배지).
- `src/frontend/app/components/coaching/JoinClient.tsx`: 초대 카드 머리 배지 = `peer.isCoach`.
- `src/frontend/app/components/feed/UserProfileClient.tsx` **한 줄 두 버튼**(보조 버튼 둘, 같은 너비, 아이콘 없음 — 360px·en 에서 한 줄 44px): 「코치로 요청」(`profile-coaching-request` · 범위 시트) · 「내 회원으로 초대」(`profile-coaching-invite` · 확인창 「{name}님을 내 회원으로 초대할까요?」 — 수락하면 내가 코치). 시트에서 「내가 코치/내가 회원」을 다시 고르게 하는 안은 한 번 더 누르게 해 기각. 이미 이 사람과 연결(대기·활성)이 있으면 지금처럼 상태 한 줄. 내게 이미 활성 코치가 있으면 요청 자리에 안내(`profile-coaching-has-coach`)를 두고 초대는 남긴다. 배지 = `profile.isCoach` · 소개·태그 = `profile.trainerIntent`(노출을 켠 사람만).
- `src/frontend/app/components/feed/PeopleClient.tsx`: 배지 = `u.isCoach`.
- `src/frontend/app/components/coaching/HomeMembersCard.tsx`: `[원본]` `user.trainerIntent` → `[개선]` `user.isCoach`. 코치가 아닌 사용자는 홈을 열 때·앱이 다시 보일 때 `refreshMe()`(모듈 메모리로 30초에 한 번 · 온라인·로그인일 때만) — 다른 곳에서 회원이 연결돼도 새로고침 없이 카드가 따라온다. 연결 목록·점검(ListGrants·ListMemberDigest)은 여전히 코치일 때만 묻는다.
- `src/frontend/app/components/profile/ProfileClient.tsx`: 칩 이름·요약 줄·힌트를 새 뜻으로(`trainer-intent` 시험 id 유지). **칩 상태는 로그인했으면 서버 계정 값**(`account.trainerIntent`) — 이제 개인정보 설정이라 「꺼져 보이는데 검색에 나옴」이 없어야 한다(로컬 값은 비로그인일 때만). 요약 줄의 하드코딩 「경력·코칭 의향을 알려 주세요」 → 새 키.
- `src/frontend/app/components/OnboardingOverlay.tsx`: 의향 칸·상태·저장 제거(`[원본]` 주석). 로컬 저장은 `trainerIntent` 키를 아예 빼고, 서버 요청에도 `setTrainerIntent` 를 보내지 않는다(이미 켠 값 유지).
- core: `src/core/src/i18n/locales/ko.ts`·`src/core/src/i18n/locales/en.ts` 문구. 로컬 DB 열 `trainer_intent` 는 그대로(스키마 변경 없음).

#### 문구(ko)

| 키 | 새 문구 |
| --- | --- |
| experience.title | 운동 경력·코치 찾기 |
| experience.intentLabel | 코치 찾기 |
| experience.intentYes | 코치 찾기에 나를 보여 주기 |
| experience.intentShort(새) | 코치 찾기에 보임 |
| experience.intentHint(새) | 켜면 코치 찾기 검색에 이름·소개·태그가 보여요. 꺼 두어도 초대 코드로 회원과 연결할 수 있어요. |
| experience.summaryEmpty(새) | 운동 경력을 알려 주세요 |
| experience.trainerDisclaimer | 「코치」 표시는 회원과 코칭으로 연결돼 있다는 뜻이에요 — 자격 보증이 아니에요. |
| coaching.myMembersEmpty | 아직 담당 회원이 없어요. 위 초대 코드를 보내거나 사람 프로필에서 「회원으로 초대」를 눌러 보세요. |
| coaching.myCoachesEmpty | 아직 연결된 코치가 없어요. 아래에서 코치를 찾거나 받은 코드를 넣어 보세요. |
| coaching.findTrainer | 코치 찾기 |
| coaching.profile.request · coaching.requestButton · coaching.scope.requestTitle | 코치로 요청 |
| coaching.profile.invite | 내 회원으로 초대 |
| coaching.profile.inviteTitle | {name}님을 내 회원으로 초대할까요? |
| coaching.profile.inviteMessage | 수락하면 내가 {name}님의 코치가 돼요. 보여 줄 범위는 {name}님이 골라요. |
| coaching.inviteSent | 회원 초대를 보냈어요 |
| coaching.invite.hint | 이 코드를 받은 사람이 내 회원으로 바로 연결돼요. |
| coaching.invite.empty | 아직 초대 코드가 없어요. 회원을 코칭하려면 코드를 만들어 보내세요. |
| onboarding.expSubtitle | 선택 사항이에요 — 맞춤 경험에 사용돼요. 나중에 프로필에서 바꿀 수 있어요. |
| onboarding.trainerIntentOption | (삭제 — `[원본]` 주석) |

#### 문구(en — 같은 키)

| 키 | 새 문구 |
| --- | --- |
| experience.title / intentLabel / intentYes | Experience & coach search / Coach search / Show me in coach search |
| experience.intentShort / intentHint / summaryEmpty | Shown in coach search / When on, your name, intro and tags appear in coach search… / Tell us your training experience |
| experience.trainerDisclaimer | The “Coach” label means this person is connected with a client through coaching — it is not a credential guarantee. |
| coaching.findTrainer | Find a coach |
| coaching.profile.request · requestButton · scope.requestTitle | Ask to coach me |
| coaching.profile.invite / inviteTitle | Invite as my client / Invite {name} as your client? |
| coaching.myMembersEmpty / myCoachesEmpty / invite.hint / invite.empty / inviteSent | 새 뜻으로(코치 역할·의향 언급 없음) |

### 스펙 리뷰 반영(REV-105)

- 채택: 요청 분당 제한 · 0036 초대 코드 정리 · 홈 카드 신선도(refreshMe 30초) · 배지 공개 범위는 사용자 결정 3 그대로 기록 · proto 번호 · 프로필 배지 확인 실패 정책 · PG 시험(노출 끈 사람·대기 중 거짓·해지) · refreshMe 한 번 · 칩 = 서버 값 · 방향이 보이는 라벨·아이콘 없음·360px · en 표 · 비코치 초대 카드 보조 버튼·목록 아래 · 소개 보이는 곳 규칙 하나 · 깨질 e2e 목록 · 새 e2e 행동 목록.
- 보류: 대기 요청 수 상한 · 서로 코칭(A↔B) 막기 · 차단 때 연결 자동 해지 · 칩을 role=switch 행으로 · 코칭 줄 높이 rAF 기록.
- 기각: 소개·태그 편집을 노출과 상관없이 늘 열기 — 사용자 결정 2(「켰을 때만 보이고 편집된다」)와 충돌.

### 고칠 기존 e2e

- `src/frontend/e2e/onboarding.spec.ts` — 의향 칸 0개 · UpdateProfile 요청에 setTrainerIntent 없음 · 경력만 남음.
- `src/frontend/e2e/coaching-v2.spec.ts` — 회원에게도 초대 카드(보조 버튼) · 연결 전 코드 카드 배지 0 · 코치 프로필 배지는 연결 뒤 · 회원이 코치 프로필에서 초대 버튼도 봄 · 사람 찾기 배지는 연결 뒤 · 연결된 적 없는 둘째 코치 배지 0 · 이미 코치 있음일 때 초대 버튼 남음 · 읽기 실패 때 초대 버튼도 숨김.
- `src/frontend/e2e/coaching.spec.ts`·`src/frontend/e2e/summary-card.spec.ts`·`src/frontend/e2e/opengym-summary.spec.ts` — 흐름 그대로(이름·주석만 새 뜻).

### 새 e2e(사용자 행동)

- (a) 노출을 끈 A 가 코드를 만들고 B 가 다른 기기에서 연결 → 배지 연결 전 0 · 뒤에 사람 찾기·프로필·연결 줄 · 해지하면 0.
- (b) A 가 홈에 머문 채(새로고침 없이) B 가 연결 → 앱이 다시 보이면 홈 「담당 회원 1명」.
- (c) 코칭 안 하는 사용자가 홈을 열면 ListGrants·ListMemberDigest 요청 0.
- (d) 코치 찾기 검색에 노출 끈 사람은 없음 · 켠 사람은 있음.
- (e) 사람 프로필 두 버튼 360px — 한 줄·같은 높이·44px 이상(ko).
- (f) 첫 실행 안내 둘째 장에 트레이너 질문 없음.

### 체크리스트

- [x] 서버: 의향 검사 → 계정 존재 · 초대 코드 누구나 · 규칙(한 코치·차단·자기 자신) 유지 · 요청 분당 제한 · 0036 코드 정리 · 소개 보이는 곳 규칙
- [x] 서버: `is_coach` 파생값(코칭 Peer·피드 프로필/사람 목록·내 계정) · 질의 + `make sqlc` · proto + `make proto`
- [x] 화면: 초대 카드 누구나 · 사람 프로필 두 버튼 · 배지 = isCoach · 홈 카드 = isCoach · 연결 뒤 refreshMe
- [x] 화면: 온보딩 트레이너 질문 제거 · 프로필 칩 새 이름 · 문구 ko·en
- [x] 시험: Go 단위·PG · core 단위 · tsc 3곳 · 기존 e2e 고침 · 새 e2e · 전체 e2e

### 수용 기준

1. 노출 스위치를 끈 사용자 A 가 /coaching 에서 초대 코드를 만들 수 있고, B 가 그 코드로 연결하면 그때부터 A 의 사람 화면·프로필·사람 찾기에 「코치」 배지가 붙는다(연결 전에는 없다). 해지하면 사라진다.
2. 코치 찾기 검색에는 스위치를 켠 사람만 나온다.
3. 첫 실행 안내 둘째 장에 트레이너·코치 질문이 없고, 경력만 저장된다(이미 켠 노출 값은 그대로).
4. 사람 프로필에서 연결이 없으면 「코칭 받기 요청」·「회원으로 초대」 둘 다 보인다. 내게 이미 코치가 있으면 요청 대신 안내, 초대는 남는다.
5. 서버: 의향이 꺼진 사람에게 요청·초대·수락·코드 연결이 모두 된다 · 회원 한 명당 코치 한 명·차단·자기 자신 거절은 그대로.
6. 코칭을 안 하는 사용자는 홈에서 연결 목록·점검을 묻지 않는다(기존 「오프라인 비코치: 요청 0」 의도 유지 + 홈 요청 0 검사).

### 범위 밖

- DB 열 이름 바꾸기·데이터 이전(뜻만 바꾼다).
- 로컬 DB 의 `trainer_intent` 를 서버 값으로 덮어쓰기(칩은 로그인 때 서버 값을 읽으므로 화면은 맞다).
- 대기 요청 수 상한 · 서로 코칭 막기 · 차단 때 연결 해지(REV-105 보류).
- 화면 지도(`ads-docs/liftgram/wireframe/.screen-map/data.py`) 수정 — 바꿀 화면 목록만 보고.
- 버전 올림·배포.
