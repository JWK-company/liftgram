# SPEC-047 — 루틴 늘리기 + 운동 팁 — 프로·초보자 영상 루틴 보강, 스트레칭·워밍업·자세·부상 예방·회복 팁 구역과 종목 상세·시작 전 연결

> 타입 Spec · 그룹 liftgram/루틴-늘리기-운동팁 · ADStudio가 `SPEC-047.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-045, SRS-091, SRS-092, SRS-112

### 목표

- 영상 루틴이 적은 주제를 채운다 — 프로 전신(2개)·초보자 분할(5개)·프로 푸시(6개)는 주제마다 7~8개까지, 나머지 8개 주제는 2개씩 더한다(약 +26개).
- 루틴이 아닌 운동 지식(스트레칭·워밍업·자세 교정·부상 예방·회복)을 「운동 팁」으로 모은다. 팁마다 원본 영상 링크를 루틴처럼 단다(SRS-112).
- 팁을 필요한 순간에 다시 보여 준다 — 종목 상세 「관련 팁」, 루틴 미리보기 「시작 전」 한 줄.

등급 근거: core 데이터·도우미 새 파일, 화면 세 곳(운동 탭·종목 상세·루틴 미리보기), 새 시트, i18n, 점검 스크립트, 테스트까지 5개 넘는 파일 · 새 화면 요소 → Feature. 서버·DB·스키마 변경은 없다(ADR-045 정적 데이터).

### 범위

| 파일 | 바꾸는 것 |
| --- | --- |
| `src/core/src/domain/creatorTips.ts` | 새 파일 — 팁 주제·팁 데이터·조회 도우미 |
| `src/core/src/domain/index.ts` | `creatorTips` 다시 내보내기 한 줄 |
| `src/core/src/domain/creatorRoutines.ts` | 새 영상 루틴 추가 · 새 채널의 한국어 이름(`CHANNEL_NAMES_KO`) · `youtubeWatchUrl` 에 시각 인자(선택) 추가 |
| `src/core/src/domain/__tests__/creatorTips.test.ts` | 새 파일 — 팁 데이터 무결성·도우미 테스트 |
| `src/core/src/domain/__tests__/creatorRoutines.test.ts` | 주제별 최소 개수 기준 갱신(늘린 만큼) |
| `src/core/src/data/exerciseRepository.ts` | `getExercisePrimaryMuscles(ids)` 추가(미리보기 「시작 전」 팁 고르기) |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | `tips.*` 문구 |
| `src/frontend/app/components/routines/CreatorTipSheet.tsx` | 새 파일 — 주제 시트(팁 목록) · 팁 상세 시트(`TipDetailSheet`) |
| `src/frontend/app/components/routines/RoutinesClient.tsx` | 초보자 루틴 다음에 「운동 팁」 구역 |
| `src/frontend/app/components/routines/RelatedTips.tsx` | 새 파일 — 종목 상세의 「관련 팁」 카드(클라이언트) |
| `src/frontend/app/exercise/[id]/page.tsx` | 「자세 설명」 다음에 `RelatedTips` |
| `src/frontend/app/components/routines/RoutinePreviewSheet.tsx` | 시작 버튼 위 「시작 전」 한 줄 |
| `src/frontend/e2e/creator-tips.spec.ts` | 새 파일 — 세 곳 e2e |
| `src/scripts/check-creator-routines.mjs` | `creatorTips.ts` 영상도 같은 oEmbed 점검 |
| `src/frontend/package.json` | 버전 0.82.0 → 0.84.0(기능 = minor · 작업 중 다른 세션이 0.83.0 배포) |

범위 밖: 서버 API·DB·관리 화면, 임베드 재생·썸네일, 피드 공식 글, 옛 Expo 앱(`app/`).

### 설계

#### 데이터 — `src/core/src/domain/creatorTips.ts`

```ts
export type TipTopicId = 'stretch' | 'warmup' | 'form' | 'injury' | 'recovery';
export interface TipTopic { id: TipTopicId; nameKo: string; nameEn: string; blurbKo: string; blurbEn: string }
export type TipMoment = 'before' | 'after' | 'anytime';
export interface CreatorTip {
  id: string;                 // 'tip-<짧은 이름>' · 유일
  topicId: TipTopicId;
  titleKo: string;            // 우리가 붙인 제목(채널명·실명 금지)
  pointsKo: { text: string; from: 'desc' | 'chapter' | 'basis' }[]; // 요점 2~5줄 · 줄마다 근거(설명란·챕터·basis 기사) · 한 줄 60자 안팎
  cautionKo?: string;         // 출처에 적힌 주의(있을 때만)
  muscles: MuscleGroup[];     // 관련 부위 ≥1 · 'other' 금지 · 'fullBody' = 일반 팁(약한 겹침)
  exerciseIds?: string[];     // 관련 종목(seed id · 활성 카탈로그)
  moment: TipMoment;          // 「시작 전」 한 줄은 before 만
  chapters?: { sec: number; labelKo: string }[]; // 설명란 챕터 → 시각 링크
  source: { videoId: string; title: string; channel: string; channelUrl: string; verifiedAt: string };
  basis?: { labelKo: string; url: string };
  draft?: true; hidden?: true;
}
export const TIP_TOPICS: TipTopic[];
export const CREATOR_TIPS: CreatorTip[];
export function tipsFor(topicId): CreatorTip[];                  // draft·hidden 제외
export function visibleTipTopics(): TipTopic[];                  // 팁 0개 주제 숨김
export function tipsForExercise(id: string, muscles: readonly MuscleGroup[], limit = 3): CreatorTip[]; // 순위 = (종목 지목, 겹친 부위 수) 내림차순 → 데이터 순서 · fullBody 만 겹치는 팁은 제외
export function preWorkoutTip(exerciseIds: string[], muscles: readonly MuscleGroup[], dayNum: number): CreatorTip | null; // before 만 · 점수 = 지목 종목 수×2 + 겹친 부위 수 (+0.5 fullBody 일반 팁) · 최고점 후보[dayNum mod n](데이터 순서) · 점수 0 이면 null · dayNum = streak.ts dayNumber(Date.now())
export function tipWatchUrl(tip, sec?): string;                  // youtubeWatchUrl(videoId, sec)
```

`youtubeWatchUrl(videoId, sec?)` 는 `sec` 가 양의 정수면 `&t={sec}s` 를 붙인다(기존 호출은 그대로 동작). 채널 한국어 이름은 `creatorChannelLabel` 을 같이 쓴다(표 하나).

근육 값: 종목 상세의 `exercise.primaryMuscles` 는 proto enum 이라 `src/frontend/lib/contractMap.ts` 의 `toMuscles()` 로 core `MuscleGroup[]` 로 바꿔 넘긴다. 미리보기는 core 저장소 값(이미 MuscleGroup)이다.

출처 규칙(ADR-045·SRS-092 그대로): 찾기 = 공식 Data API search.list(`src/scripts/youtube-search.mjs` 새 보조 스크립트), 제목·채널 = 공식 oEmbed 값, 내용 근거 = 공식 Data API 설명란·챕터(`src/scripts/youtube-describe.mjs`) 또는 영상 분석 기사(`basis`). 댓글은 쓰지 않는다(제3자 저작물). 자막·음성 수집·받아쓰기 안 함. 설명란에 요점이 없는 영상은 싣지 않는다(사용자가 준 영상도 같은 기준). 설명란 원문·API 응답은 저장하지 않고 우리가 쓴 요약과 챕터 시각만 둔다 — 30일마다 다시 확인(점검 스크립트 경고). 설명란 문장을 그대로 옮기거나 번역하지 않는다 — 사실·동작 단서만 짧게, 요점·챕터 이름에도 실명 금지.

정정·삭제: 고지의 연락처로 요청이 오면 2영업일 안에 그 팁·루틴을 `hidden: true` 로 배포하고 할 일 문서(TODO)에 기록한다. 점검 스크립트는 `hidden` 행의 404 를 실패가 아닌 경고로 낸다(삭제된 영상을 숨긴 상태가 ✗ 로 남지 않게).

문구 안전: 팁 전용 금지어(통증 해결·통증이 사라·디스크 치료·재활 효과·교정 효과·예방 효과·부상 방지 보장 등)를 `creatorTips.test.ts` 가 `containsMedicalClaim` 과 함께 검사한다. 팁 상세에는 늘 「통증·저림이 있으면 멈추고 전문가와 상담하세요」 안전 고지를 둔다.

#### 루틴 데이터

기존 `CREATOR_ROUTINES` 형식 그대로 추가한다. 종목은 활성 시드 id 만, 하루 안 같은 종목 두 번 금지, 설명란에 없는 세트·횟수는 `src: 'default'`. 새 영상은 기존 영상과 겹치지 않고, 저장 이름(`labelKo`)도 겹치지 않는다.

#### 화면

- 운동 탭: 초보자 루틴 구역 다음에 `SectionLabel` 「운동 팁」 + 소개 한 줄(「루틴이 아닌 짧은 운동 지식이에요 · 원본 영상으로 이어져요」) + 루틴과 같은 2칸 카드(주제 이름 · 「팁 {n}개」) — `data-testid="tip-section"` · 카드 `tip-topic-<id>`.
- 주제 시트(`CreatorTipSheet`): 소개 한 줄 + 팁 목록(제목 · 부위 · 「출처: {채널}」). 누르면 같은 시트 안에서 팁 상세로 — 상세에서 기기 뒤로·바깥 누르기·「‹ 목록」은 모두 목록으로 돌아간다(상세 단계의 `SheetShell onClose` = 목록으로).
- 팁 상세(`TipDetail` — 시트 안에 넣는 본문 컴포넌트): 요점 목록 · 주의(있으면) · 관련 부위 칩(무채) · 챕터 링크 목록(머리에 「유튜브에서 열려요 ↗」 한 번 · `aria-label` 에 시각과 「새 창」) · 출처 인용 · 확인 날짜 · 「원본 영상 보기」(새 창 · 루틴 시트와 같은 무채 테두리 버튼) · 안전 고지 · 제휴 아님·정정 연락처 고지. 단독 시트(`TipDetailSheet`)는 종목 상세에서만 쓴다.
- 종목 상세: 서버에서 `tipsForExercise(exercise.id, toMuscles(exercise.primaryMuscles))` 를 계산해 0개면 카드 자체를 렌더하지 않는다. 1개 이상이면 「자세 설명」 다음에 카드(`data-testid="related-tips"`)를 두고, 줄을 눌러 `TipDetailSheet` 를 여는 부분만 작은 클라이언트 컴포넌트(`RelatedTips` — 팁 id 목록을 받는다).
- 루틴 미리보기: 부위 읽기(`getExercisePrimaryMuscles`)를 `useRoutineLines` 의 `withKinds` 읽기와 같은 비동기 단계에 넣어 `ready` 조건에 포함한다 — 목록·「시작 전」 한 줄·버튼이 같은 순간에 나타나고 늦게 끼어들지 않는다. 팁이 있으면 목록과 버튼 사이에 한 줄 「시작 전 · {팁 제목}」(`routine-preview-tip`). 누르면 시트를 겹치지 않고 같은 미리보기 시트 안에서 팁 상세로 바뀌며 「‹ 루틴」·기기 뒤로가 미리보기로 돌아온다.

색 규칙: 팁 화면에는 주 행동이 없어 강조색 0개 — 카드·칩·챕터 링크·「원본 영상 보기」 모두 무채(화면 정리 P4 · 루틴 시트와 같은 링크 모양).

### 작업 단계

#### Phase 1 — 팁 데이터·도우미·점검

- [x] `src/core/src/domain/creatorTips.ts` 타입·주제 5개·도우미
- [x] 팁 ≥20개 큐레이션(주제마다 채널 ≥2 · 첫 팁 = 사용자가 준 영상 `zJgwAAM_tNY`) — 설명란은 `src/scripts/youtube-describe.mjs` 로만 읽는다
- [x] `youtubeWatchUrl` 시각 인자 · `src/core/src/domain/index.ts` 내보내기
- [x] `src/core/src/domain/__tests__/creatorTips.test.ts` — 무결성(id 유일·영상 id·출처 필드·source 키 순서 videoId→title→channel→channelUrl→verifiedAt·종목 id 활성 시드·부위에 other 없음·챕터 초 오름차순·요점 2~5줄·줄마다 from) · 문구(웰니스+팁 금지어·제목/요점/챕터에 채널명·실명 없음) · 다운로드 경로 없음(새 파일 포함) · 순위·결정성(같은 dayNum 같은 팁·다음 날 다른 팁(후보 ≥2)·점수 0 → null·음수/큰 수 안전·draft/hidden 제외·limit) · `youtubeWatchUrl` 시각(0·실수·없음)
- [x] `src/scripts/check-creator-routines.mjs` 가 파일 목록(루틴·팁)을 돌며 파일마다 `declared === rows` 검사 · hidden 행 404 = 경고 · `src/scripts/youtube-search.mjs` 새 보조 스크립트

완료 기준: core 테스트 통과 · 점검 스크립트 ✗ 0.

#### Phase 2 — 화면 세 곳

- [x] `src/frontend/app/components/routines/CreatorTipSheet.tsx`(주제 시트·팁 상세·단독 시트)
- [x] `src/frontend/app/components/routines/RoutinesClient.tsx` 「운동 팁」 구역
- [x] `src/frontend/app/components/routines/RelatedTips.tsx` + `src/frontend/app/exercise/[id]/page.tsx`
- [x] `src/core/src/data/exerciseRepository.ts` `getExercisePrimaryMuscles` + `src/frontend/app/components/routines/RoutinePreviewSheet.tsx` 「시작 전」 한 줄
- [x] `tips.*` 문구(ko·en)
- [x] `src/frontend/e2e/creator-tips.spec.ts`

완료 기준: 타입 검사·lint 통과 · e2e 세 곳(구역→주제→상세→원본 링크 주소·기기 뒤로 = 목록 · 종목 상세 관련 팁 · 미리보기 시작 전 줄이 있는지만 — 날마다 바뀌는 제목은 보지 않는다) 통과 · 휴대폰 폭 가로 넘침 없음.

#### Phase 3 — 영상 루틴 보강

- [x] 프로 전신 +5 · 초보자 분할 +3 · 프로 푸시 +2 · 나머지 8개 주제 +2(설명란에 종목이 적힌 영상만)
- [x] 새 채널 `CHANNEL_NAMES_KO`
- [x] `src/core/src/domain/__tests__/creatorRoutines.test.ts` 주제별 최소 개수 기준(프로 전신·푸시·초보자 분할 ≥7)
- [x] 점검 스크립트 · 버전 0.84.0(다른 세션이 0.83.0 을 먼저 배포)

완료 기준: core 테스트 통과 · 점검 스크립트 ✗ 0 · 운동 탭에서 주제별 개수가 늘어난 것을 확인.

### 수용 기준

| 기준 | 연결 |
| --- | --- |
| 운동 탭 「운동 팁」 구역 · 주제 5개 · 팁 ≥20 · 주제마다 채널 ≥2 | SRS-112 |
| 팁 상세 출처 인용·확인 날짜·원본 영상 링크(새 창)·챕터 시각 링크·고지 | SRS-112 · SRS-091 |
| 종목 상세 관련 팁 ≤3 · 없으면 카드 없음 | SRS-112 |
| 루틴 미리보기 「시작 전」 한 줄 → 팁 상세 | SRS-112 |
| 프로 전신·푸시·초보자 분할 ≥7 · 나머지 주제 +2 | SRS-091 |
| 자막·영상 다운로드 경로 없음 · oEmbed 점검 ✗ 0 | SRS-092 · ADR-045 |

### 테스트 계획

- core 단위: `cd src && bun run test:core`(= `node --import tsx --test core/src/domain/__tests__/*.test.ts`) 에서 `creatorTips.test.ts`(무결성·도우미 순위·`preWorkoutTip` 결정성·`youtubeWatchUrl` 시각) · `creatorRoutines.test.ts`(늘린 개수).
- 점검: `node src/scripts/check-creator-routines.mjs`(루틴+팁 영상 oEmbed).
- frontend: 타입 검사·lint(`make verify` 중 frontend 부분) · e2e `src/frontend/e2e/creator-tips.spec.ts`(로컬 dev 3100 또는 운영 빌드 3200).
- 배포 뒤: 운영 주소에서 운동 탭 「운동 팁」 구역이 보이는지 확인.

### 위험·주의

- 근거 없는 요점: 기존 루틴과 같이 「영상 설명란 기준 정리」로 싣는다(본편 대조 아님 — 화면에 그렇게 표시). 요점은 줄마다 근거(from)를 남기고 설명란·챕터·기사에 적힌 것만 쓴다. 설명란이 빈약한 영상은 버린다. SRS-092 의 사람 검수는 배포 뒤 사용자 검수표로 받는다(스펙 리뷰 보류 항목).
- 의학적 표현: 「치료·교정 보장·통증 해결」 같은 단정 금지 — 웰니스 게이트(`containsMedicalClaim`) 테스트로 막는다. 출처의 주의 문구(전문가 상담 등)는 살린다.
- Data API 할당량: search 1회 = 100 단위(하루 10,000) — 검색은 60회 이내로.
- 실명 노출: 팁·루틴 이름에 채널명·실명 금지, 출처 줄에만(ADR-045).
- 영상 삭제: 점검 스크립트가 잡는다 → `hidden: true`.
- 미리보기 깜빡임: 부위를 다 읽은 뒤에만 줄을 그린다(로드 전 []≠0개 교훈).
