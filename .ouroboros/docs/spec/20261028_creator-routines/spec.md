# Feature Spec — 크리에이터 루틴 (URS-028 · SRS-091·092 · SAD-026 · ADR-045)

> 등급 Feature(파일 5+ · 프론트+core · 서버/스키마 변경 없음) · worktree `../liftgram-wt-creator`(feat/creator-routines · 웹 3300)
> 사용자 답(2026-10-28): Q1 = A(YouTube Data API 키로 설명란 → 정리 → 사용자 검수) · Q2 = 제안 채널 목록(박재훈·씨범은 찾으면 추가 · 황철순 제외) · **Q3 = 기존 AI 콘셉트 4개는 버림** · Q4 = 배포 전 사용자 검수.
> 병행 세션(기록 보호 2차 · wt-safety)과 파일 겹침 없음(그쪽: ActiveWorkout·ProfileClient·TabBar·tabGuard 등).

## 1. 데이터 — `core/src/domain/creatorRoutines.ts`(신규 · @plm SRS-091 SRS-092)
```ts
type Prescribed = { exerciseId: string; sets: number; repsMin: number; repsMax: number; restSec?: number; from: 'video' | 'default' };
interface CreatorRoutine {
  id: string;                 // 'cr-<topic>-<channel>'
  topicId: CreatorTopicId;    // 'boulder-shoulders' | 'big3-500' | 'after-work'
  source: { videoId: string; title: string; channel: string; channelUrl: string; verifiedAt: string /* YYYY-MM-DD */ };
  summaryKo: string;          // 우리 말 요약 1~2문장(대본 인용 금지 · 웰니스 카피 게이트)
  days: { nameKo: string; items: Prescribed[] }[];
}
CREATOR_TOPICS: { id, nameKo, nameEn, blurbKo, blurbEn }[]   // 3개
creatorRoutinesFor(topicId) · youtubeWatchUrl(videoId)
```
- 기존 `CONCEPT_ROUTINES`·타입은 **보존**(코드 보존 규칙) — 화면 호출부만 주석. catalogGap 테스트는 그대로 통과(데이터 불변).
- 콘텐츠: 설명란(공식 Data API)·영상 확인으로 적은 값만 `from:'video'`, 나머지는 우리 기본값 `from:'default'`(화면에 「기본값」 표시).

## 2. 저장 — `core/data/routineRepository.ts`
- `ImportRoutineExercise` 에 선택 필드 `targetRepsMax?`·`restSeconds?` · `importRoutine(name, exercises, opts?: { notes?: string | null })`.
- 기존 줄 보존: `// [원본] re.targetRepsMax = 12;` → `re.targetRepsMax = ex.targetRepsMax ?? 12;` (restSeconds·notes 동일). 기존 호출 2곳 결과 불변.

## 3. 화면 — `RoutinesClient.tsx`
- 「콘셉트 루틴」 그리드: `CREATOR_TOPICS` 카드(이름 + 「영상 루틴 N개」) — testId `concept-topic-<id>`. [원본] CONCEPT_ROUTINES 그리드·ConceptDialog 호출은 주석.
- 주제 시트(`creator-topic-sheet`): blurb + 버전 줄(채널 · 영상 제목 2줄 말줄임 · 「N일 구성」) testId `creator-version-<id>`.
- 버전 시트(`creator-sheet`): 「출처: {채널} · 「{제목}」」 · 「영상 기준 정리 · 확인 {verifiedAt}」 · 요약 · 일별 종목 표(표시 이름 = getExerciseDisplayNameMap · 「4×8–10」 · from=default 는 「기본값」 칩) · 「원본 영상 보기」(`<a href=https://www.youtube.com/watch?v=… target=_blank rel="noopener noreferrer">` · testId `creator-open-video`) · 「내 루틴에 저장」(`creator-save`).
- 저장: 일마다 루틴 1개 「{주제} · {채널} — {일 이름}」 · 세트·반복·휴식 · 루틴 notes = 「출처: {채널} 「{제목}」 https://www.youtube.com/watch?v=…」 · 이름 중복이면 기존 확인 대화상자 · 없는 종목은 조용히 빼기(기존 규칙).
- 문구 i18n `creator.*`(ko/en).

## 4. 점검 스크립트 — `scripts/check-creator-routines.mjs`
- 데이터 파일에서 videoId·title·channel 을 읽어 oEmbed 조회 → 404/401(삭제·비공개)·제목/채널 불일치 보고 · 종료 코드 1. 다운로드 코드 없음.
- (보조) `scripts/youtube-describe.mjs <videoId…>` — `YOUTUBE_API_KEY` 로 Data API `videos.list?part=snippet` 설명란 출력(큐레이션용 · 앱 런타임 미사용).

## 5. 테스트
- core `creatorRoutines.test.ts`: 주제 3 · 주제당 서로 다른 채널 ≥2 · 모든 exerciseId 활성 시드 · videoId `/^[A-Za-z0-9_-]{11}$/` · 출처 필드 · sets 1~10 · repsMin≤repsMax · summary 의료 단정 없음.
- e2e `creator-routines.spec.ts`: 주제 → 버전 → 출처·링크 href · 저장 → 루틴 목록에 이름 · 루틴 상세 세트×횟수 · 옛 `routines.spec.ts:86` 콘셉트 단계는 새 흐름으로 교체([원본] 주석).

## 6. 순서
데이터 골격·코드·테스트(지금) → 키 도착 → 설명란 읽기·정리 → **사용자 검수(표)** → 반영 → 독립 qa code → ff-only → 배포(다음 minor).

## 7. rev1 — qa spec 반영 (`qa/20261028_creator-routines-spec_qa.md` · 조건부 → 아래로 해소) · 앞 절을 덮어씀
- **H-1** 기획 4건(SRS-091·UCS-026·SAD-026·ADR-045)을 Q3 로 개정 완료 · 버전 0개 주제 숨김 · 되돌림 = 호출부 주석 교대.
- **H-2** 저장 루틴 이름 = `{version.labelKo} — {day.nameKo}`(채널명·실명 없음 · labelKo 는 우리가 붙인 이름 예 「어깨 볼륨 5종」) · 출처는 notes 에만. 데이터 테스트: labelKo·summaryKo·day 이름에 channel 문자열이 들어가지 않는다.
- **H-3** 정적 데이터에 두는 값 = oEmbed 의 제목·채널 + 우리가 쓴 루틴·요약뿐 · Data API 출력(설명란)은 파일로 보관하지 않음(youtube-describe 는 화면 출력만) · `verifiedAt` 30일 넘으면 check 스크립트가 경고 · 키는 .env(커밋 금지).
- **M-1** 칸별 출처: `src: { sets: 'video'|'default'; reps: 'video'|'default' }` · 화면은 default 칸에만 「기본값」.
- **M-2** 비균일 처방(피라미드·탑셋)은 균일 근삿값 + `src.reps='default'` + 종목 `noteKo`(예 「영상은 12-10-8 피라미드」 → 루틴 종목 메모로 저장) · 하루 안 exerciseId 중복 금지(테스트).
- **M-3** SheetShell 하나 + `step: 'list' | versionId` 상태 · 버전 단계 맨 위 「‹ 목록」 버튼 · Escape/닫기 = 시트 전체 닫기.
- **M-4** `hidden?: true` 칸(삭제·비공개 확인 시 데이터에서 숨김) · check: 404 = 실패(숨김 필요) · 401/403 = 경고(퍼가기 금지일 수 있음 — 링크는 동작) · 배포 전 check 필수.
- **M-5** 버전 화면 하단 고지: 「채널과 제휴하거나 보증받은 루틴이 아니에요. 영상 내용을 우리가 정리했어요. 정정·삭제 요청: admin@tarae.org」 · 제외 채널 목록(EXCLUDED_CHANNELS) 테스트 · 영상 제목은 인용이라 문구 게이트 대상 아님(summaryKo·labelKo 만).
- **M-6** core 테스트: importRoutine 기존 호출 결과 불변(새 선택 인자 없을 때 targetRepsMax 12·restSeconds 120·notes null) + 새 인자 반영 · 스크립트·코드에 다운로드 경로 없음(`ytdl|youtube-dl|yt-dlp|timedtext|captions` 문자열 검사).
- **L-2** 저장 루프 catch → 「n개 중 m개 저장」 토스트 · **L-4** 링크 aria-label 「원본 영상 보기 (YouTube, 새 창)」 · **L-5** 시트도 활성 종목 집합으로 걸러 없는 종목 흐림 · en 로케일은 「한국어 콘텐츠」 캡션(요약·이름은 한국어 그대로) · **L-1** e2e 의 세트×횟수 검증은 루틴 편집기에서.

## 8. rev2 — 콘텐츠 확정 (사용자 검수 2026-10-28)
- 근거 = 공식 Data API 설명란(타임스탬프·요약) · 루틴 목록이 없던 영상(제로범TV 2편·준규빌더·조피터=자세 영상)은 제외 · 대체: 킹유진(어깨)·웨이트연구소 덕코치(퇴근 후).
- 공개 6: 이장민·킹유진·**씨범(Chris Bumstead 공식 채널 hpvAcZtNcPY)**(어깨) · 메루치 5×5(3대) · 핏블리·덕코치(퇴근 후). MQ 5×5 는 draft(설명란에 구성 없음 · 화면 미노출).
- 씨범: 공식 설명란에 루틴 없음 → Fitness Volt 영상 분석 기사(2022-06-28 · 추정치라고 밝힘) 기준 · `basis {labelKo,url}` 칸 추가 · 화면 「세트·횟수: … 기준」 링크.
- 사용자 결정: 종목 부상 위험은 앱이 감수하지 않음(비하인드 넥 프레스 그대로 · 메모 안 붙임).
- 종목 메모는 각 종목 아래 · 점검 스크립트의 draft 는 경고(화면 미노출은 creatorRoutinesFor·테스트가 보증).
- e2e: 저장 직후 새로고침 전 내려쓰기 대기(LokiJS 비동기 flush).
