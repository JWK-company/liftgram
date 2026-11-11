# SPEC-059 — 코칭 정리 — 코멘트 숨기기 없애기·⋯ 대신 🗑·8칸 코드·코치 찾기 대신 프로필 요청

> 타입 Spec · 그룹 할일/코칭-정리 · ADStudio가 `SPEC-059.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-062, SRS-115

## 목표

할 일 #T19(사용자 결정 메시지 1904: 1b · 2a · 3a · 4a). 코칭 화면을 더 간결하게 만든다.

- **1b** 코치 코멘트 「숨기기」를 화면과 서버에서 모두 없앤다. 이미 숨긴 코멘트도 다시 보인다.
- **2a** 담당 회원·내 코치 목록의 ⋯ 메뉴를 없앤다.

  - 줄 오른쪽 ⋯ 자리에는 🗑(연결 끊기·요청 취소)를 둔다.

  - 코치 쪽: 기록 요약·루틴은 이미 회원 코칭 화면에 있다. 회원 쪽: 코치 이름을 누르면 작은 시트(범위 바꾸기·이력)가 열린다.

- **3a** 「이력」은 회원 코칭 화면 루틴 탭 맨 아래의 「연결 이력」 접기 칸에 둔다.
- 「코드로 연결」은 인증 코드처럼 8칸 입력으로 바꾼다.

  - 영문은 대문자로 바꾸고, 다음 칸으로 자동으로 넘어간다.

  - 붙여넣기(하이픈 있든 없든)를 받는다. 지우기(Backspace)는 앞 칸으로 돌아간다.

- **4a** 코칭 화면의 「코치 찾기」 검색을 없앤다.

  - 다른 사람 프로필의 「코치로 요청」은 그 사람이 「코칭 요청 받기」(옛 「코치 찾기에 나를 보여 주기」 · 열 `trainer_intent`)를 켰을 때만 보인다.

  - 연결 방법은 「코드로 연결」과 「프로필에서 요청」 두 가지다.

## 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/backend/internal/coaching/comments.go` · `src/backend/internal/coaching/handler_comments.go` · `src/backend/internal/coaching/comments_test.go` · `src/backend/internal/coaching/comments_pg_test.go` | 핸들러만 막음(Unimplemented) · `can_hide` 넣는 4곳 false · 가짜 저장소의 숨김 거름 [원본] · 시험 뒤집기 + RPC 거절 시험(REV-142 S1~S4) |
| `src/backend/internal/coaching/service.go` · `src/backend/internal/coaching/errs.go` | 회원이 요청할 때 상대 `trainer_intent` 가 꺼져 있으면 Forbidden(「코칭 요청을 받지 않는 사람이에요」) · Unimplemented 매핑 한 줄(REV-142 S5·S8) |
| `src/database/queries/coaching.sql` · `make sqlc` 생성물 | 코멘트 목록이 `hidden_at` 을 보지 않음(열·값은 남김 — 지우지 않는다) |
| `src/proto/coaching/v1/coaching.proto` | `HideCoachComment`·`can_hide` 에 「쓰지 않음(SPEC-059)」 주석만 — 모양은 그대로(옛 앱 호환) |
| `src/frontend/app/components/coaching/CoachComments.tsx` | 숨기기 버튼·확인창 제거([원본] 주석) |
| `src/frontend/app/components/coaching/CoachingClient.tsx` | ⋯ → 🗑 · 회원 쪽 이름 누름 시트(범위·이력) · 8칸 코드 입력 · 코치 찾기 구역 제거 + 안내 한 줄 · 빠른 보기 판(기록 요약·루틴) 진입 제거 |
| `src/frontend/app/components/coaching/CodeBoxes.tsx`(새) | 8칸 코드 입력 부품 |
| `src/frontend/app/components/coaching/MemberClient.tsx` | 루틴 탭 맨 아래 「연결 이력」 접기 칸(`listAudit`) |
| `src/frontend/app/components/feed/UserProfileClient.tsx` | 「코치로 요청」은 상대 `trainerIntent` 일 때만 · 「내 회원으로 초대」는 그대로 |
| `src/frontend/app/components/profile/ProfileClient.tsx` | 설정 이름 「코칭 요청 받기」로(뜻: 프로필에 「코치로 요청」 버튼 보이기) |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | 새 문구·바뀐 문구 |
| `src/frontend/e2e/helpers/coaching.ts`(새) | 공용 도우미 `내_id`·`프로필로_요청`·`코드로_연결`·`끊기`·`코치_시트` — 네 파일이 같이 씀(REV-142 T1) |
| `src/frontend/e2e/coaching.spec.ts` · `src/frontend/e2e/coaching-v2.spec.ts` · `src/frontend/e2e/coach-role.spec.ts` · `src/frontend/e2e/opengym-summary.spec.ts` · `src/frontend/e2e/summary-card.spec.ts` · `src/frontend/e2e/coaching-tidy.spec.ts`(새) | ⋯·숨기기·검색을 쓰던 시험을 새 흐름으로([원본] 주석 보존) |

## 설계

### 코멘트 숨기기(1b)

- 서버 `HideCoachComment` 핸들러만 `CodeUnimplemented`(「이 기능은 없어졌어요」)를 돌려준다(본문은 [원본] 주석). service·repo·쿼리의 숨김 함수는 **살려 두고 부르지 않는다** — 지우면 Go 시험이 컴파일되지 않는다(REV-142 S1).
- 가짜 저장소(`comments_test.go`)의 숨김 거름도 [원본] 으로 막는다. 시험은 「숨김 행을 직접 넣으면 두 목록에 보이고 `CanHide` 는 false」 · pg 시험은 `UPDATE … SET hidden_at=now()` 뒤 다시 보임 · 핸들러 거절 시험(DB·감사 그대로)(REV-142 S2·S4).
- 목록 쿼리에서 `AND hidden_at IS NULL` 을 걷는다. 숨김 기록(`hidden_at`)과 감사 로그는 지우지 않는다 — 되돌리면 그대로 다시 숨겨진다.
- `can_hide` 는 늘 false — 넣는 곳 4곳(`comments.go:228·253·272·305`) 모두 [원본]. 화면은 버튼을 그리지 않는다. 옛 앱 판이 버튼을 그려도 서버가 거절한다.
- 주석의 「숨긴 것 빼고」는 「숨김 기록은 남기되 목록은 보지 않음(SPEC-059)」으로(REV-142 S9). 연결 이력의 옛 「코멘트 숨김」 줄 문구는 「코멘트 숨김(지금은 다시 보여요)」(S7).

### 목록 줄(2a)

- `GrantRow` 의 `MoreMenu` 를 없애고 `IconButton icon="trash-outline"`(44px · ink2 · `coaching-revoke` testId 유지 · `aria-haspopup="dialog"`)을 둔다. 사용자가 고른 휴지통 그대로(아이콘 바꾸기 기각).

  - 이름표 세 가지: 활성 「{이름} 연결 끊기」 · 내가 보낸 대기 「{이름} 요청 취소」 · 상대가 보낸 대기 「{이름} 요청 거절」.

  - 확인창(`coaching-revoke-confirm`) 제목·본문도 같은 세 갈래 + 이름. 본문 끝에 「운동 기록은 지워지지 않아요」.

  - 「수락」과 🗑 사이 `spacing-md`(REV-142 U4).

- 코치 쪽 활성 회원: 이름 칸은 지금처럼 `/coaching/m/<id>` 링크. 대기 중: 링크 없음.
- 회원 쪽(내 코치) 활성: 이름 칸이 버튼(`coaching-coach-open` · `min-h-11` · `aria-haspopup="dialog"` · aria-label 「{이름} 코칭 설정」 · 상태 글자 describedby)이 되어 시트(`coaching-coach-sheet` · 제목 = 이름)를 연다. 항목은 「공유 범위 바꾸기」(`coaching-scope`)·「연결 이력」(`coaching-history-link`). 시트를 연다는 표시로 › 는 달지 않는다(SPEC-057 R5). 대기 중: 이름 칸 누름 없음(🗑 만).
- 「수락」 버튼은 그대로.
- ⋯ 의 「기록 요약」·「루틴」 빠른 보기 판(`MemberReportDialog`·`MemberRoutinesDialog`)은 이 화면에서 열리지 않는다(부품은 회원 화면이 계속 씀). 호출만 [원본] 주석.

### 이력(3a)

- `MemberClient.tsx` 루틴 탭 맨 아래(사용자 결정 3a — 공통 아래로 옮기자는 안은 기각) `<details data-testid="member-history">`(요약 「연결 이력」 · `min-h-11` · 직접 그린 ▾ `aria-hidden`). 루틴 편집 범위가 꺼진 갈래에도 넣는다. `onToggle` 에서 처음 펼칠 때 한 번 `listAudit({grantId})` 를 읽어 줄 30개까지. 읽는 동안 「불러오는 중」, 비면 「기록이 없어요」(`role="status"`). 코치 쪽 대기·끊긴 연결의 이력은 볼 곳이 없어진다 — 의도함. 줄 글은 `CoachingClient` 의 이력 줄 만들기를 공용 함수로 옮겨 같이 쓴다(`src/frontend/lib/coaching.ts`).

### 8칸 코드(CodeBoxes)

- **진짜 입력칸은 하나**(REV-142 U1): 투명하게 덮은 `input`(`data-testid="coaching-code-input"` · aria-label 「초대 코드 8자리」 · `autoComplete="one-time-code"` · `autoCapitalize="characters"` · `autoCorrect="off"` · `spellCheck={false}` · maxLength 없음) 위에 칸 8개를 `aria-hidden` 그림으로 그린다. 붙여넣기·자동완성·Backspace·IME·시험 `fill` 이 한 번에 풀린다.
- 값 정리: 영문·숫자만 남기고 대문자, 8자에서 자른다. 하이픈·공백은 버린다. 한글 조합 중(`compositionstart`~`end`)은 거르지 않고 기다린다. 영문·숫자가 아닌 글자를 치면 칸 아래 「영문·숫자로 입력해 주세요」(`aria-live="polite"`).
- 그림: 칸 8개 `flex-1 min-w-0 h-[48px]` · 틈 4px · 4칸 뒤 「–」(12px) · `--radius-sm` · 글자 16px 이상 굵게 · 다음에 칠 칸은 brand 테두리(초점이 있을 때) · 채운 칸 line-strong. 칸 폭은 360px 에서 약 36px — 44px 는 높이 48px·틈으로 대신한다(이 부품의 예외로 적음). 칸을 누르면 입력칸에 초점(그림 전체가 하나의 누르는 자리).
- 「확인」 버튼(`coaching-code-check`)은 칸 아래 줄 전체 너비 보조 버튼 · 8자일 때만 켜짐 · Enter 도 확인. **8자에서 저절로 확인하지 않는다** — 칸 넘김만 자동(사용자 요청 범위 · 시험의 확인 누르기 그대로).
- 오류 `coaching-code-error` 는 `role="alert"` · 입력칸 `aria-invalid`·`aria-describedby`.
- 서버 정규화(I·L→1, O→0)는 그대로 — 화면은 대문자만 바꾼다.

### 코치 찾기(4a)

- `CoachingClient` 의 「코치 찾기」 구역(검색칸·결과·요청)을 [원본] 주석. 그 자리에 안내 두 줄(`coaching-find-hint`): 「코치에게 코드를 받았다면 위 칸에 넣으세요.」 · 「코치 프로필에서 바로 요청할 수도 있어요」 + 「사람 찾기」 링크(`/people` · 44px)(REV-142 U9).
- 서버 `SearchTrainers` 는 남긴다(쓰지 않음 주석).
- 서버 `RequestCoaching`: 회원 쪽 요청에서 상대 `trainer_intent` 가 꺼져 있으면 Forbidden — 설정 이름이 「받기」라 API 로도 막는다. 코치의 초대·코드 연결은 그대로. 끈 뒤 남은 대기 요청은 그대로 둔다(REV-142 S5).
- 프로필 `CoachingLine`(`peerAccepts` prop 추가): 연결·대기 판단은 그대로. 「코치로 요청」 버튼과 「이미 코치가 있어요」 안내는 `profile.trainerIntent` 일 때만. 꺼져 있으면 요청 자리에 회색 한 줄 「코칭을 받으려면 초대 코드로 연결하세요」(`profile-coaching-code-hint` · /coaching 링크). 「내 회원으로 초대」는 누구에게나(혼자 남으면 전체 너비)(REV-142 U10·U11).
- 프로필 설정 문구: 「코치 찾기에 나를 보여 주기」 → 「코칭 요청 받기」 · 설명 「켜면 내 프로필에 「코치로 요청」 버튼과 코치 소개가 보여요. 꺼도 초대 코드로는 연결할 수 있어요」.

## 작업 단계

### Phase 1 — 코멘트 숨기기 없애기

- [x] 서버: 목록 쿼리 두 곳 `hidden_at` 조건 걷기([원본] 주석) · `make sqlc`(바뀐 것이 SQL 두 줄뿐인지 diff 확인) · 숨기기 핸들러 Unimplemented · `can_hide` 4곳 false · 가짜 저장소·Go 시험 뒤집기 · 핸들러 거절 시험
- [x] 화면: `CoachComments.tsx` 숨기기 버튼·확인창 [원본] 주석
- [x] 시험: `src/frontend/e2e/coaching-v2.spec.ts` 숨기기 시험(1927~2020 · `HideCoachComment` 응답 기다림 포함) → 「버튼 없음 · 숨기기 RPC 는 거절」

완료 기준: `go test ./internal/coaching/...` · 코멘트 e2e 통과

### Phase 2 — 목록 줄 정리·이력

- [x] `GrantRow` ⋯ → 🗑 · 회원 쪽 이름 시트(범위·이력) · 빠른 보기 판 진입 제거
- [x] `MemberClient.tsx` 루틴 탭 「연결 이력」 접기 칸 · 이력 줄 공용 함수
- [x] 공용 도우미 `src/frontend/e2e/helpers/coaching.ts` 먼저 — `끊기`(🗑)·`코치_시트`(이름 → 시트)
- [x] 시험: ⋯ 를 쓰던 시험을 🗑·이름 시트·회원 화면으로 — 코치 쪽 리포트·루틴 확인은 회원 화면 분석·루틴 탭(`report-ready` 같은 기간) · `src/frontend/e2e/opengym-summary.spec.ts`·`src/frontend/e2e/summary-card.spec.ts` 포함 · 360px 44px 검사 대상 `coaching-revoke` · 새 시험(🗑 이름표 세 갈래 · 회원 이름 시트 · 연결 이력 펼침)

완료 기준: 코칭 e2e 5개 파일 + 새 시험 통과 · 가드(`src/frontend/e2e/shape-guard.spec.ts`) 통과

### Phase 3 — 8칸 코드·코치 찾기 정리

- [x] 먼저 시험 도우미: 검색으로 요청하던 도우미(`coaching.spec.ts` `코칭요청` · `opengym-summary.spec.ts` `짝` · `summary-card.spec.ts`)를 `프로필로_요청` 으로 바꾸고 녹색 확인 → 그다음 화면에서 검색을 걷는다
- [x] `CodeBoxes.tsx` · 「코드로 연결」 구역 교체
- [x] 코치 찾기 구역 제거 + 안내 · 프로필 「코치로 요청」 조건·코드 안내 · 설정 문구 · 서버 요청 거절(의향 꺼짐)
- [x] 시험: 타이핑(소문자 → 대문자 · 칸 그림) · 붙여넣기(하이픈 포함) · Backspace · 8자에서 확인 켜짐 · 의향 꺼진 상대에겐 「코치로 요청」 없음 + API 거절 · `src/frontend/e2e/coach-role.spec.ts:34` 문구 「코칭 요청 받기」 · 검색 시험(83·coach-role 98)은 「켠 사람 프로필엔 요청 버튼, 끈 사람엔 없음」으로

완료 기준: 코칭 e2e 통과

### Phase 4 — 전체 시험·커밋

- [ ] 전체 e2e — 시작 기준선(이 스펙 시작 커밋)과 「파일+제목」 비교, 새 실패 0
- [ ] 이 스펙 파일만 커밋(`(#T19)`) · 버전은 배포할 때 minor(0.99.0)

완료 기준: 새 실패 0 · 커밋

## 수용 기준

- SRS-115: 코칭 연결(코드·프로필 요청)·끊기·범위·이력이 모두 동작하고, 숨기기 버튼이 어디에도 없으며, 전에 숨긴 코멘트가 보인다.
- 담당 회원·내 코치 줄에 ⋯ 이 없고 🗑 이 있다(44px · 이름이 든 aria-label).
- 코드 칸에 `ab12cd34` 를 치면 `AB12-CD34` 로 보이고 8자에서 코치 카드가 뜬다. `ab12-cd34` 붙여넣기도 같다.
- 코칭 화면에 「코치 찾기」 검색이 없다. 「코칭 요청 받기」를 끈 사람 프로필에는 「코치로 요청」이 없다.
- 360px 넘침 없음 · 다크 모드.

## 테스트 계획

- `cd src/backend && go test ./internal/coaching/...`
- `cd src/frontend && bunx tsc --noEmit -p .` · biome
- 로컬 운영 빌드(새 DB · 웹 3280 · API 3281)로 `src/frontend/e2e/coaching.spec.ts` · `src/frontend/e2e/coaching-v2.spec.ts` · `src/frontend/e2e/coach-role.spec.ts` · `src/frontend/e2e/coaching-tidy.spec.ts` · `src/frontend/e2e/shape-guard.spec.ts`. dev 3100 은 건드리지 않는다.
- Phase 4 전체 e2e 기준선 비교.

## 위험·주의

- **되돌리기**: 숨김 기록을 지우지 않으므로 쿼리 조건만 되살리면 원래대로 돌아간다.
- **옛 앱 판(안드로이드 1.5.6)**: 웹 껍데기라 같은 화면을 받는다 — 따로 할 일 없음.
- **시험 의존**: `coaching-grant-more` 를 쓰는 시험이 3개 파일에 많다 — 하나씩 새 흐름으로 바꾸고 [원본] 주석.
- **대기 요청 이력**: 이력은 회원 화면(코치 쪽)과 이름 시트(회원 쪽 · 코칭 중)에서만 본다 — 대기 중인 요청의 이력은 볼 곳이 없다(사용자 결정 2a·3a 범위 · REV-144 H3).
- **자동완성**: 8칸 입력은 `autoComplete="off"` — `one-time-code` 는 SMS 인증번호를 제안해 엉뚱한 값이 들어간다(REV-145 A5).
- **붙여넣기**: 모바일 자동완성(SMS 코드 등)은 첫 칸에 여러 글자가 들어온다 → 「여러 글자는 이어 채움」 규칙으로 받는다.
- 운영 배포: 할 일 진행 방식은 「커밋·배포 자동」이지만 프로젝트 `CLAUDE.md` 에 「할 일 자동 배포」 줄이 없어 커밋까지만 한다(배포는 다음 배포 요청 때).
