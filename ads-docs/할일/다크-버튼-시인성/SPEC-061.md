# SPEC-061 — 다크 모드에서도 버튼으로 보이게 — 글자 단추 상자·메타 밑줄·줄 꺾쇠·업데이트 단추

> 타입 Spec · 그룹 할일/다크-버튼-시인성 · ADStudio가 `SPEC-061.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-069, SRS-072, SRS-111

### 목표

다크 모드에서 「누르는 것」이 안내 글과 구별되게 한다. 사용자 지적(메시지 2069): 「업데이트 있음」이 다크에서 그냥 문구로 보여 버튼인 줄 모른다. 시안(https://claude.ai/artifact/Ws4877ejmwqBLprK5DedSR)에서 사용자가 권장안 1A 2A 3A 4A 를 골랐다(메시지 2084).

- 1A 글자만 있는 동작 버튼 → 회색 테두리 상자(4px 모서리 · 입력칸과 같은 모양 — SPEC-057 R1 규칙 그대로)
- 2A 누를 수 있는 메타 글자 → 얇은 밑줄(SPEC-057 R6 「상자·밑줄 없음」을 바꾼다)
- 3A 시트를 여는 줄에도 꺾쇠 ›(SPEC-057 R5 「꺾쇠는 이동만」을 바꾼다)
- 4A 라이트·다크 둘 다 같은 규칙

### 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/frontend/app/components/ui/Button.tsx` | `quiet` 변형 = 회색 테두리 상자(글자 ink) · `ghost` 변형 = 브랜드 테두리 상자 · 직접 그린 단추용 `actionBoxClass(tone)` 내보내기 |
| `src/frontend/app/components/ui/quiet.tsx` | `MetaAction` muted 글자에 밑줄(색 ink3 · 두께 1px · 간격 3px) |
| `src/frontend/app/components/appdist/AppUpdateCard.tsx` | 누를 수 있을 때(업데이트·다시 설치·전용 앱으로 바꾸기) 브랜드 채운 작은 단추 + 꺾쇠 › · 못 누를 때(최신·개발·플레이)는 지금처럼 색 글자 |
| `src/frontend/app/components/coaching/CoachingClient.tsx` | 시트를 여는 `RowMain` 단추에 꺾쇠 › |
| `src/frontend/app/components/routines/RoutinesClient.tsx` | 루틴 카드 제목 단추(미리보기 열기) 두 곳에 꺾쇠 › |
| 직접 그린 글자 단추 17곳 | `actionBoxClass` 로: `src/frontend/app/components/OnboardingOverlay.tsx`(건너뛰기) · `src/frontend/app/components/TabElsewhereOverlay.tsx`(닫기) · `src/frontend/app/components/auth/SecurityCard.tsx`(연결 해제) · `src/frontend/app/components/appdist/AppDistBanner.tsx`(받기·나중에·다시 묻지 않기) · `src/frontend/app/components/routines/RoutineImport.tsx`(운동 추가) · `src/frontend/app/components/routines/PrescriptionRows.tsx`(되돌리기) · `src/frontend/app/components/feed/PostCard.tsx`(팔로우) · `src/frontend/app/components/sync/SyncHealthBanner.tsx`(나중에) · `src/frontend/app/components/analytics/CalendarClient.tsx`(＋ 이 날 메모) · `src/frontend/app/components/moderation/ReportSheet.tsx`(취소) · `src/frontend/app/components/session/LockNotices.tsx`(넘기기) · `src/frontend/app/components/session/LockReadiness.tsx` · `src/frontend/app/components/session/ActiveWorkout.tsx`(슈퍼세트 풀기) · `src/frontend/app/components/session/RirSheet.tsx`(닫기·지우기) · `src/frontend/app/components/coaching/CoachComments.tsx`(숨기기) |
| `src/frontend/e2e/button-affordance.spec.ts` | 새 가드 — 라이트·다크에서 글자만 있는 단추가 없는지 |
| `src/frontend/package.json` | 0.100.0 |

그대로 두는 것: 스위치가 붙은 줄(스위치가 단추), 이미 꺾쇠·▾·‹·▶ 가 있는 단추, 이미 밑줄 링크, 탭·kg│lb 같은 고르는 칸, 세트 줄의 값 칸, 금색 PR 글자, 아이콘 단추, 「답글」 같은 댓글 관례 글자.

### 설계

#### 공용 상자 모양

- 테두리 1px `--color-line-strong`(라이트 #747474 · 다크 #A8A8A8 — 바탕 대비 3:1 이상), 모서리 `--radius-sm`(4px), 바탕 없음, 글자 `--color-ink` 굵게. 최소 높이 36px(작은 곳) · 44px(누르는 자리 — 바깥 여백으로 채움).
- 브랜드 단추(받기·팔로우·ghost)는 테두리·글자 `--color-brand`.
- `actionBoxClass(tone: "neutral" | "brand" | "bad")` 는 클래스 문자열만 돌려준다(새 컴포넌트를 만들지 않아 각 자리의 testId·aria 를 그대로 둔다).

#### Button 변형

- [원본] quiet = 바탕 없음·글자 ink2 · ghost = 바탕 없음·글자 brand. [개선] quiet = 테두리 line-strong·글자 ink, ghost = 테두리·글자 brand(outline 과 같은 모양). hover 바탕은 그대로.

#### MetaAction

- muted 일 때 `underline decoration-(--color-ink3) decoration-1 underline-offset-[3px]`. 꺾쇠(▾·›)는 그대로. pr 톤은 금색이 신호라 밑줄 없음.

#### 줄 꺾쇠

- `ListRow` 와 같은 `<Icon name="chevron-forward" size={18} color="var(--color-ink3)" />` 를 줄 오른쪽 끝에.

#### 업데이트 줄

- actionable 이면 배지 대신 `<span className={actionBoxClass("brandFill")}>` 「업데이트」(다시 설치·바꾸기는 각 문구) + 꺾쇠. brandFill = 바탕 brand · 글자 on-brand.
- 접근성 이름은 버튼 전체(제목 + 단추 글자)로 그대로 읽힌다.

#### 리뷰 반영(REV-149)

- tone 은 넷: neutral(회색 테두리·진한 글자 — 대부분) · brand(브랜드 테두리 — 화면에 하나뿐인 주 행동 옆 보조) · bad(위험) · brandFill(채움 — 화면의 주 행동 하나, 프로필 「업데이트」). 반복되는 행동(피드 「팔로우」)은 neutral.
- quiet 상자는 secondary 와 같은 모양이다(위계는 크기). ghost 는 바꾸지 않는다 — 루틴 카드 「▶ 시작」은 판 없는 빨강 글자로 정한 자리(▶ 아이콘이 신호).
- 3A 는 줄(row)에만 — 시트를 여는 작은 메타 단추(「다른 조합」)는 꺾쇠 대신 밑줄.
- 「다시 설치」는 회색 상자. 업데이트 줄은 누를 수 있을 때 `aria-haspopup="dialog"`. 채운 단추 span 은 `data-affordance="box"`(flat-design 가드 예외 — button·a 안일 때만).
- 더한 곳: `src/frontend/app/components/analytics/BodyweightCard.tsx` 「기록」 · `src/frontend/app/components/guide/PracticeBlock.tsx` 「다시 해 보기」 · `src/frontend/app/components/session/RestBar.tsx` 「+15초」·「건너뛰기」(뒤집힌 띠라 `--color-bg` 테두리) · 루틴 탭 주제·팁 칸 꺾쇠. 뺀 곳: `src/frontend/app/components/coaching/CoachComments.tsx`(숨기기는 SPEC-059 에서 없앰).
- 제목 지름길(달력 달 제목 · 잘린 운동 이름 펼치기)은 `data-affordance="text"` 로 글자 그대로.
- 가드: 다크는 `liftgram.theme` init script, 검사 전 마우스를 치움, 비활성·스위치 줄·달력 칸·값 없는 칸 제외, 시트 안 단추 포함, 카나리아 시험.

### 작업 단계

#### Phase 1 — 공용 모양과 줄

- [ ] `src/frontend/app/components/ui/Button.tsx` quiet·ghost 변형 · `actionBoxClass`
- [ ] `src/frontend/app/components/ui/quiet.tsx` MetaAction 밑줄
- [ ] `src/frontend/app/components/appdist/AppUpdateCard.tsx` 업데이트 단추 + 꺾쇠
- [ ] `src/frontend/app/components/coaching/CoachingClient.tsx` · `src/frontend/app/components/routines/RoutinesClient.tsx` 꺾쇠
- 완료 기준: `bun run typecheck` · 관련 e2e(`src/frontend/e2e/app-distribution.spec.ts` · `src/frontend/e2e/routines.spec.ts`) 통과.

#### Phase 2 — 직접 그린 단추·가드·배포

- [ ] 직접 그린 글자 단추 17곳 `actionBoxClass`
- [ ] `src/frontend/e2e/button-affordance.spec.ts` — 홈·운동 중·프로필·달력을 라이트·다크로 열고, `main` 안의 보이는 `button` 중 글자가 있고 아이콘·꺾쇠가 없으면서 테두리·바탕·밑줄이 모두 없는 것을 모은다(허용: role=switch·role=tab·aria-pressed·고르는 칸 data-card·세트 값 칸·data-affordance="text" 로 표시한 관례 글자). 0개여야 한다.
- [ ] 다크·라이트 화면 사진 확인(프로필 업데이트 줄 · 운동 중 블록 · 배너)
- [ ] `src/frontend/package.json` 0.100.0 · 배포
- 완료 기준: 가드 e2e 통과 · 기존 `src/frontend/e2e/flat-design.spec.ts` · `src/frontend/e2e/shape-guard.spec.ts` 통과(단추는 그 가드의 허용 대상).

### 수용 기준

- SRS-069·SRS-072(화면 정리·모양 통일): 누르는 것과 정보 글이 모양으로 갈린다 — 가드 e2e 가 라이트·다크 둘 다에서 0건.
- SRS-111: 「업데이트 있음」 상태에서 프로필 앱 줄에 채운 「업데이트」 단추와 꺾쇠가 보인다(`src/frontend/e2e/app-distribution.spec.ts` 에 확인 더함).

### 테스트 계획

- `cd src/frontend && bun run typecheck && bun run lint`
- `bunx playwright test e2e/button-affordance.spec.ts e2e/flat-design.spec.ts e2e/shape-guard.spec.ts e2e/app-distribution.spec.ts e2e/routines.spec.ts e2e/declutter-block.spec.ts`
- 화면 사진: 다크·라이트 각 3장 눈으로.

### 위험·주의

- 기존 e2e 가 글자 색(ink2)이나 「상자 없음」을 재는 곳이 있으면 깨진다 — 바꾼 규칙에 맞춰 기대값을 고친다(`src/frontend/e2e/declutter-*.spec.ts` 의 MetaAction 검사 확인).
- 옅은 판(surface-alt) 위에 neutral 상자를 올리면 라이트 대비가 4.17 로 낮아진다 — 판 위 배치는 피한다.
- 단추가 상자가 되면서 줄 높이가 늘 수 있다 — 바깥 여백 음수(-my)를 쓰는 자리는 상자 높이를 36px 로.
- SPEC-057 의 R5·R6 규칙을 바꾸므로 그 스펙의 원칙 문단을 이 스펙이 대신한다(옛 코드는 [원본] 주석으로 남긴다).
