# SPEC-048 — 사람 화면과 새 메시지 — 피드 머리 👤 · ✎ 새 메시지로 1:1·단체 대화

> 타입 Spec · 그룹 할일/사람-새메시지 · ADStudio가 `SPEC-048.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-113

### 목표

SRS-113: 사람 찾기를 피드 머리 👤 사람 화면으로 꺼내고, 메시지 화면에서는 ✎ 「새 메시지」 하나로 1:1·단체 대화를 시작한다. 「그룹」이라는 말은 「단체 대화」로 바꾼다.

### 범위

- `src/frontend/app/components/feed/FeedClient.tsx` — 머리 HeadIcon 👤 추가
- `src/frontend/app/components/ui/AppBar.tsx` — 「오른쪽 아이콘 2개까지」 주석에 피드 예외(4개)를 적는다
- `src/frontend/app/people/page.tsx`(새) · `src/frontend/app/components/feed/PeopleClient.tsx`(새) — 사람 화면
- `src/frontend/app/components/dm/ConversationsClient.tsx` — 사람 아이콘 → ✎ 새 메시지 · 빈 목록 버튼 → `/people`
- `src/frontend/app/components/dm/NewGroupClient.tsx` — 새 메시지(1명 = 1:1, 2명+ = 단체 대화)로 바꾼다(파일 이름·주소 `/messages/new`는 그대로)
- `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` — people.* · dm.newMessage · group.* 문구
- e2e: `src/frontend/e2e/dm.spec.ts`(단체 대화 시험을 2명으로 · 1명 1:1), `src/frontend/e2e/people.spec.ts`(새)
- 등급 Feature: 새 화면 1개 + 화면 3개 변경 + 문구 + 시험(6파일 이상, 서버는 그대로).

### 설계

- **피드 머리**: `HeadIcon href="/people" icon="people-outline" testId="feed-people" label=t("people.title")`를 🔍와 💬 사이에. 아이콘 네 개 = 44 × 4 + 간격 2 × 3 = 182px, 360px 화면의 제목 자리 약 138px(「피드」 약 50px). 아이콘 묶음은 `shrink-0`, 제목은 truncate. 360px에서 제목과 같은 줄·겹침 없음을 e2e로 잰다. AppBar의 「오른쪽 아이콘 2개까지」 규칙에 피드 예외를 주석으로 적는다.
- **사람 화면** `PeopleClient`:

  - 로그인 전이면 피드와 같은 로그인 안내(로그인 / 가입 버튼)만 보인다. 신원이 정해지기 전(authLoading)에는 목록을 부르지 않는다(토큰 갱신 경합 방지 — ConversationsClient와 같은 규칙).

  - ScreenHeader(뒤로 = `/feed`) · TextField `people-query`(300ms 멈춘 뒤 `searchUsers`).

  - 검색어가 없으면 UnderlineTabs `people-tab-following`·`people-tab-followers` → `listFollows({userId: 나, mode})`. 탭은 주소 `?tab=followers`로 남긴다(뒤로·새로고침).

  - 서버는 목록을 50명까지만 준다(다음 쪽 없음). 50명이면 목록 끝에 「최근 50명까지 보여요 · 나머지는 이름으로 찾아 주세요」.

  - 줄 `people-row`: 아바타·이름 링크(프로필) · `following=false`면 `people-follow`(primary sm, 「팔로우」 — 팔로워 탭에서는 맞팔) · `people-message`(outline sm, 「메시지」) → `getOrCreateDirect` 뒤 `/messages/<id>`로. 누르는 동안 그 줄 「메시지」를 잠근다(연타해도 방 하나). 실패하면 서버 문구를 토스트로(차단한 사이 등).

  - 빈 목록 문구: 검색 0건(지금의 사람 찾기 문구) · 팔로잉 0명 「아직 팔로우한 사람이 없어요」 · 팔로워 0명 「아직 나를 팔로우한 사람이 없어요」. 오류는 ListState 「다시 시도」.

- **메시지 목록**: `dm-new-group`(people-outline) → [원본]으로 막고 `dm-new`(create-outline, aria-label 「새 메시지」) → `/messages/new`. 빈 목록 `dm-empty-discover` → `/people`.
- **새 메시지** `NewGroupClient`:

  - authLoading 이 끝난 뒤 `listFollows(나, FOLLOWING)` 목록을 먼저 보여 주고, 검색어가 있으면 `searchUsers` 결과 중 팔로우한 사람만(지금 규칙 유지 — 서버의 단체 대화 판정과 같게).

  - 고른 사람은 `Map<id, UserResult>`로 들고 위에 칩 `new-msg-chip`으로 보인다(누르면 빼기 · 검색어가 바뀌어도 이름이 남는다).

  - 1명이면 버튼 「대화 시작」(`dm-start`) → `getOrCreateDirect`. 2명 이상이면 대화 이름 칸 `group-title`이 나타나고 「단체 대화 만들기(N명)」(`group-create`) → `createGroup`. 2명→1명으로 줄면 칸은 숨기되 적은 이름은 지우지 않는다.

  - 제목 「새 메시지」. 기존 testid(`group-search`·`group-user`·`group-create`·`group-title`)는 그대로 둔다.

- **문구**: dm.newMessage 「새 메시지」, dm.startDirect 「대화 시작」, group.create 「단체 대화 만들기 ({count}명)」, people.title 「사람」, people.following·people.followers·people.message 「메시지」, people.emptyFollowing·people.emptyFollowers·people.capped. 「그룹」(en 「Group」)이 남은 화면 글을 grep으로 찾아 바꾼다.

### 작업 단계

#### Phase 1 — 사람 화면과 피드 머리 👤

- [x] `PeopleClient`·`/people` 주소(로그인 안내 · authLoading · 50명 안내 · 빈 목록 문구)
- [x] 피드 머리 `feed-people` · AppBar 주석
- [x] 메시지 빈 목록 버튼 → `/people`
- [x] e2e `people.spec.ts`: 검색 · 팔로잉/팔로워 탭(`?tab=followers` 새로고침 유지) · 팔로워 탭 맞팔 · 「메시지」로 1:1 열기(두 번 눌러도 같은 방) · 360px 머리 한 줄 · 로그인 전 /people
- 완료 기준: people.spec 통과, feed.spec·dm.spec 회귀 없음.

#### Phase 2 — ✎ 새 메시지(1:1·단체 대화 합침)와 말 바꾸기

- [x] ConversationsClient ✎ `dm-new`
- [x] NewGroupClient → 새 메시지(팔로잉 먼저 · 칩 · 1명 1:1 · 2명+ 단체 대화 · authLoading)
- [x] 문구 「그룹」→「단체 대화」(ko·en)
- [x] e2e dm.spec: 단체 대화 시험을 2명으로 · 1명 → 「대화 시작」 1:1 · 칩 빼기로 2→1명이면 버튼 글이 바뀐다
- 완료 기준: dm.spec·people.spec·feed.spec 통과.

### 수용 기준

- SRS-113 R1: 360px에서 네 아이콘 + 제목이 한 줄, 각 44px(people.spec).
- R2: 검색 결과와 두 탭이 나오고 「메시지」가 1:1 방을 연다(people.spec).
- R3·R4: 메시지 오른쪽 위는 `dm-new`만, 1명 → 1:1, 2명 → 단체 대화(dm.spec).
- R5: 화면 글에 「그룹」·「Group」이 남지 않는다(i18n grep).

### 테스트 계획

- 작업 트리(worktree) 운영 빌드(웹 3210·API 3211 — 다른 세션의 3200·3201과 겹치지 않게)에 e2e: people.spec(새) · dm.spec · feed.spec · sticky-bottom.spec · 기존 묶음 전체.
- tsc · biome(바꾼 파일만).

### 위험·주의

- 피드 머리 공간: 제목이 길면 줄어들 수 있다 — 제목은 truncate, 아이콘 묶음은 shrink-0.
- 1:1은 팔로우와 무관하게 열리지만 차단한 사이는 서버가 막는다 → 토스트로 서버 문구.
- 단체 대화는 팔로우한 사람만 — 새 메시지 화면은 팔로잉 기준(팔로워 탭에서 단체 대화를 고르지 않는다).
- 목록 50명 상한(서버) — 넘으면 검색으로 찾는다.

### 스펙 리뷰 반영(REV-092)

- 채택 11 · 보류 3 · 기각 1 — 자세한 것은 REV-092.
