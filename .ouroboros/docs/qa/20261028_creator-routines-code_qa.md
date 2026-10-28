# QA code — 크리에이터 루틴 (feat/creator-routines · e06e59a..bf45aa2)

- 날짜: 2026-10-28 · 대상 worktree `/Users/woobi/Desktop/tarae/liftgram-wt-creator` (커밋 4c312d9·e6f4a20·bf45aa2)
- 검토 역할: 프론트엔드·데이터 정확성 검토자 / 콘텐츠 출처·약관 검토자
- 기준: spec `20261028_creator-routines/spec.md` §7 rev1·§8 rev2, spec qa, ADR-045, SRS-091·092
- 실행: `node --import tsx --test creatorRoutines.test.ts importRoutineRepo.test.ts` → 8/8 통과 · `node scripts/check-creator-routines.mjs` → 7개 중 실패 0 · 경고 1(draft) · 종료 0
- 판정: **조건부 통과** — High 없음, Med 3건 조치 권장(배포 전 M-1·M-2 권장)

## 1. 출처 대조

### Fitness Volt 기사 ↔ `cr-shoulders-olympia` (creatorRoutines.ts:170-174)
| 기사 (목록) | 데이터 | 일치 |
|---|---|---|
| Seated DB Shoulder Press — 1 warm-up, 4×6-9 | seed-dumbbell-shoulder-press 4×6–9 · 「앉아서 · 워밍업 1세트 뒤」 | ✓ |
| Band Shoulder Internal Rotation — 1 warm-up set | (없음) | 워밍업이라 뺀 것 — 타당 |
| Shoulder Press Machine — 1 warm-up, 3×8-10 | seed-shoulder-press-machine 3×8–10 · 「워밍업 1세트 뒤」 | ✓ |
| Seated DB Lateral Raise — 4×7-10 | seed-side-lateral-raise 4×7–10 · 「앉아서」 | ✓ |
| Machine Reverse Fly — 3×8-10 (본문은 「three sets of 7-10」) | seed-reverse-pec-deck 3×8–10 | ✓(목록 기준) — 기사 내부 불일치 있음(L-6) |
| Standing Lateral Raise Machine — 1×7 | seed-machine-lateral-raise 1×7 · 「선 채로 마무리 1세트」 | ✓ |

기사 문구 "Reps and sets were listed as accurately as possible using the footage" — basis 라벨의 「영상 분석 기사」·추정 성격 설명과 맞다. 발행일 2022-06-28 일치. 6연패(2019–2024) 사실 맞음.

### oEmbed (check 스크립트 실측)
7개 videoId 전부 제목·채널이 oEmbed 와 정확히 일치. 정규식은 `basis` 추가 뒤에도 7/7 해석(선언 수 대조 가드도 동작).

### 설명란 근거 항목 (직접 확인 불가 — 내부 일관성만)
- `src: 'video'` 칸: 메루치 5×5(데드 sets 만 'default' + 메모), 핏블리 전신(5×15·4×15). 나머지 공개 3개(이장민·킹유진·덕코치)는 전 칸 'default' → 화면에 모든 줄 「기본값」 칩. 종목 순서만 설명란 근거라는 뜻이라 규칙과 모순은 없다.
- 단, **'video' 의 정의가 파일 안에서 세 가지로 갈린다** → M-3.

## 2. 결함

### Med

**M-1 · 종목 확인 전에 저장하면 0개 저장** — `CreatorRoutineSheet.tsx:106,141,280`
- `active` 는 비동기 조회 전까지 `null`. 저장 버튼은 그동안에도 눌린다. `filter((i) => active?.has(...))` 가 전부 false → 모든 Day `continue` → `onSaved(0, total)` → 「루틴 1개 중 0개만 저장했어요」 토스트, 아무것도 안 생김.
- 시나리오: 느린 기기·첫 진입에서 버전을 고르자마자 「내 루틴에 저장」 탭.
- 권장: `disabled={active === null}`(또는 `loading={saving || active === null}`), 혹은 `save()` 안에서 `active` 가 null 이면 `getActiveExerciseIds` 를 직접 기다려 쓰기(옛 ConceptDialog 방식, RoutinesClient.tsx:1257).

**M-2 · 중복 이름 확인창에서 「저장」 연타 시 루틴 중복 생성** — `CreatorRoutineSheet.tsx:132-135,171-181`
- 중복 확인창(`ConfirmDialog`)의 확인 버튼에는 loading/disabled 가 없고 `save()` 에 재진입 가드가 없다. 확인창은 `onSaved` 가 시트를 닫을 때까지 떠 있고, 그 사이 동적 import + Day 마다 `database.write` 가 돈다 → 두 번 탭하면 같은 루틴 세트가 두 벌.
- (옛 ConceptDialog 도 같은 구조 — 기존 위험을 복사함.)
- 권장: `save` 첫 줄 `if (saving) return;`(ref 로 — state 는 같은 틱 연타에 늦음) + 확인 시 `setDupe(false)` 후 버전 화면의 loading 버튼으로 돌아가게 하거나 ConfirmDialog 에 `loading` 전달.

**M-3 · `src: 'video'` 의 정의가 서로 다르고 화면 문구가 실제 근거와 어긋남** — `creatorRoutines.ts:5,93-94,159` · `ko.ts creator.verified`
- 5행: 「사람이 **영상을 보고** 확인한 칸은 'video'」 / 93-94행: 「수치는 **설명란**에 있을 때만 'video' · 영상만 보고 확인한 값은 없다」 / olympia(170-174)는 **기사** 근거인데 'video'.
- 화면은 모든 버전에 「영상 기준 정리 · 확인 2026-10-28」(en "Summarized from the video · checked …")을 띄운다. 실제로는 설명란(또는 기사) 기준이고 영상 본편과 대조한 사람은 없다(94행이 스스로 밝힘). `verifiedAt` 주석(50행 「사람이 영상과 대조한 날짜」)도 같은 문제 — draft MQ 에도 같은 날짜가 찍혀 있다.
- 출처 표시 정확성(약관·정정 요청 대응) 관점에서 과장 표시가 된다.
- 권장: 정의 하나로 통일 — 'video' = 「원 출처(설명란·basis 자료)에 명시된 값」, 'default' = 우리가 채운 값. 화면 문구를 「영상 설명 기준 정리 · 확인 {date}」 류로, basis 있는 버전은 basis 줄이 그 자리를 대신하도록. 주석 5·50·93행 동기.

### Low

**L-1 · en 로케일: 영어 영상에 「Korean content」, 주제 설명이 「Korean fitness creators」** — `CreatorRoutineSheet.tsx:215-219` · `creatorRoutines.ts:66-67` · 1행 주석
- olympia(Chris Bumstead, 영어 영상)에도 "Korean content" 캡션이 붙고, boulder-shoulders 의 blurbEn 은 "from Korean fitness creators" — 사실과 다름. 권장: 버전별 `lang?: 'ko'|'en'` 칸(또는 olympia 만 예외)으로 캡션 결정, blurbEn 문구 수정. 이 경우 요약은 한국어인데 영상은 영어임을 en 화면에서 알려 줄 방법도 같이.

**L-2 · 데이터 주석과 스크립트 동작 불일치(draft)** — `creatorRoutines.ts:8` vs `check-creator-routines.mjs:28-33`
- 주석은 「check 스크립트도 실패로 본다」, 스크립트는 경고로 세고(rev2 결정과 일치) 출력 기호만 `✗`. 권장: 주석을 「경고」로, 출력 기호를 `!` 로.

**L-3 · 저장 예외를 삼킴** — `CreatorRoutineSheet.tsx:154-156`
- `catch {}` 가 원인을 버린다. 부분 토스트는 뜨지만 진단 불가. 권장: `console.warn`/기존 에러 리포터. 또 `made===0` 일 때 「N개 중 0개만 저장」 대신 「저장하지 못했어요」 문구가 자연스럽다(카탈로그 미동기 기기에서도 이 경로).

**L-4 · 접근성·터치 영역 소소** — `CreatorRoutineSheet.tsx:188-195,205-213`
- basis 링크: 새 창인데 aria 안내 없음, `min-h` 없음(xs 글씨 한 줄 ≈ 16px 터치 영역), `--color-ink3` 작은 글씨 대비 확인 필요(다크 포함).
- 「‹」 문자가 이름 앞에 읽힘 — `<span aria-hidden>‹</span>` 권장.
- 같은 종목이 여러 Day 에 있으면 `data-testid=creator-item-${exerciseId}` 가 중복(5×5 스쿼트) — 테스트 선택자 모호.

**L-5 · e2e 빈틈·약한 단언** — `e2e/creator-routines.spec.ts`
- 다룬 것: 첫 버전(단일 Day) 저장·출처·고지·원본 링크·메모·세트 수. 안 다룬 것: basis 링크(올림피아), 다중 Day 저장(5×5 → 2개 루틴·이름 「3대 5×5 — A/B」), 중복 확인창, 없는 종목 흐림/제외, en 로케일 캡션, 좁은 화면 가로 넘침.
- 53행 `list.locator("[data-testid^=routine-]").first()` — 새 루틴이 첫 행이라는 가정(sortOrder=count 라 맨 끝) + `routine-` 접두 다른 testid 와 충돌 가능. 라벨 텍스트로 찾기 권장.
- 59행 `toContainText(String(firstSets))` — "4" 는 다른 숫자에도 맞는다. 정확 값 비교 권장.
- 버전 순서 의존(`first()`) — 데이터 순서 바뀌면 검증 대상이 조용히 바뀜. testid 로 고정 권장.

**L-6 · 콘텐츠 메모** — `creatorRoutines.ts:173`
- Fitness Volt 기사 안에서 리버스 플라이가 목록 8–10 / 본문 7–10 으로 엇갈린다. 목록을 따른 것은 타당 — 근거로 남기려면 noteKo 또는 주석 1줄.

**L-7 · core 테스트 빈틈** — `__tests__/creatorRoutines.test.ts`
- 다운로드 경로 검사(88-112행)는 파일이 없으면 `continue` 로 조용히 통과 — 경로가 바뀌면 검사 무력화. 존재 단언 권장.
- `basis` 칸 규칙(basis 있으면 'video' 근거가 basis 라는 것), `creatorRoutineName` 다중 Day 형식, en 문구에 대가성 단어 없음은 테스트 없음(bf45aa2 는 gear.test T4 가 잡았음).

## 3. 확인되어 문제없음
- importRoutine 확장(`routineRepository.ts:196-224`): 새 칸은 모두 선택 + `??` 기본값(12·120·null). 기존 호출 — 옛 ConceptDialog(RoutinesClient.tsx:1270, `{exerciseId}` 만), feed/WorkoutBox.tsx:193(`targetRepsMax`·`restSeconds` 안 넘김) — 결과 불변. 회귀 테스트(importRoutineRepo.test.ts) 통과. §3.6 보존 주석 형식 준수.
- 저장 이름에 채널명 없음(`labelKo` / `labelKo — dayName`), 테스트가 채널명 조각까지 검사. notes = `출처: {channel} 「{title}」 {watchUrl}` — spec H-2 일치.
- 고지 문구 ko/en(M-5 상위 호환), 원본 링크 `target=_blank rel=noopener noreferrer`, aria-label 에 보이는 글자 포함(label-in-name 충족).
- Data API 출력: youtube-describe.mjs 는 stdout 만, 파일 쓰기 없음. 데이터 파일에 설명란 원문·썸네일 없음. scripts·컴포넌트에 다운로드 경로 문자열 없음.
- 시트 단계 전환: 한 시트 안 `picked` 상태 · 「‹ 목록」 · 닫기/Escape = 전체 닫기 — M-3 충족. 버전 0개 주제 숨김 동작.
- 다크 모드: 모두 디자인 토큰(`--color-*`) 사용, 하드코딩 색 없음. 좁은 화면: `min-w-0`·`truncate`·`flex-wrap`·`basis-full` 로 넘침 방지.
- 사용자 결정대로 비하인드 넥 프레스 메모 없음 · MQ draft 는 `creatorRoutinesFor` 에서 제외되고 스크립트는 경고만.

## 권장 조치 순서
M-1 → M-2(같은 파일 몇 줄) → M-3(문구·주석 통일) → L-1·L-2 → e2e 보강(L-5).

## 조치 (작성자 · 2026-10-28)
- M-1: 종목 조회 전 「저장」 비활성 + save() 가 active=null 이면 돌아감.
- M-2: savingRef 재진입 가드 · 확인창은 저장 시작 시 닫음 — e2e 「확인 연타에도 한 벌만 더」(2 → 4 · 1.5초 뒤에도 4).
- M-3: 'video' 정의 하나로(출처 = 설명란 또는 basis 로 밝힌 분석 자료에 적힌 값) · 문구 「영상 설명란 기준 정리」 / basis 가 있으면 「영상 확인 {date}」 + 근거 줄 · 고지의 「기본값」 설명을 「출처에 수치가 없어」로.
- Low: en 「Korean content」→「Summary in Korean」 · draft 주석을 스크립트 동작(경고)과 일치 · catch 에 console.error · basis 링크 터치 높이 32px · e2e 에 basis·여러 날·중복 확인창 추가.
- 보류: 나머지 Low(보고서 본문) — 시범 범위에서 영향 없음.
