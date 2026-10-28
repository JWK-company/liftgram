# QA spec — 크리에이터 루틴 (20261028_creator-routines)

- 대상: `.ouroboros/docs/spec/20261028_creator-routines/spec.md` (+ URS-028 · UCS-026 · SRS-091 · SRS-092 · SAD-026 · ADR-045 · BIZ-001)
- 코드 근거: `/Users/woobi/Desktop/tarae/liftgram-wt-creator/src` (HEAD e06e59a — 아직 구현 전 상태)
- 검토 패널(역할): **프론트엔드/데이터 아키텍트** · **콘텐츠 법무·플랫폼 약관 검토자**
- 판정: **조건부 통과** — High 3건을 스펙에 반영한 뒤 /execute 권장. 나머지는 구현 중 반영 가능.

---

## 요약 표

| # | 등급 | 영역 | 한 줄 |
|---|------|------|-------|
| H-1 | High | 거버넌스 | Q3(옛 콘셉트 4개 버림)가 SRS-091·UCS-026·SAD-026·ADR-045 의 「리프트그램 기본 버전 유지」와 정면 충돌 |
| H-2 | High | 법무 | 루틴 이름에 채널명을 박으면 피드 공유(workoutName)로 이름만 퍼지고 출처 링크는 안 따라감 — SRS-091 「사람 이름을 상품명으로 앞세우지 않는다」 위반 소지 |
| H-3 | High | 약관 | YouTube API Services 정책의 저장 기간(약 30일 갱신·삭제) 규정 대비, Data API 로 읽은 값을 정적 데이터에 영구 보관할지 미정 — 확인 필요 |
| M-1 | Med | 데이터 | `from` 이 종목 단위 하나라 「세트는 영상, 횟수는 기본값」 같은 혼합을 표시 못 함 |
| M-2 | Med | 데이터 | 탑셋+백오프 등 균일하지 않은 처방은 target_* 로 표현 불가 — prescription 을 쓸지·제외할지 결정 필요 |
| M-3 | Med | 화면 | 시트 두 단계를 Overlay 두 개로 겹치면 Escape 한 번에 둘 다 닫힘·aria-modal 이중 |
| M-4 | Med | 운영 | 영상 삭제·비공개 시 「버전을 숨긴다」(SRS-092)의 실행 수단이 없음(점검 스크립트는 보고만) · oEmbed 401 은 「퍼가기 금지」일 수도 |
| M-5 | Med | 법무 | 제휴·보증 아님 고지, 정정·삭제 요청 경로가 스펙에 없음 |
| M-6 | Med | 테스트 | importRoutine 「기존 호출 결과 불변」·세션 시작 프리레이를 지키는 단위 테스트가 계획에 없음 |
| L-1~L-9 | Low | 여러 | 아래 |

---

## 1. importRoutine 확장과 세션 시작

### 확인된 사실 (문제 아님)
- 현재 `importRoutine(name, exercises)` 는 `targetRepsMax = 12`·`restSeconds = 120`·`notes = null` 고정 — `core/src/data/routineRepository.ts:200,212,214`.
- 호출처는 2곳: `RoutinesClient.tsx:1219`(콘셉트, `{ exerciseId }` 만 넘김), `feed/WorkoutBox.tsx:193`(`targetSets`·`targetRepsMin`·`targetWeightKg`·`note`). 둘 다 새 필드(`targetRepsMax`·`restSeconds`)와 세 번째 인자(`opts`)를 넘기지 않으므로 `?? 12` · `?? 120` · `?? null` 이면 **결과 불변**이 맞다.
- 세션 시작은 `startWorkoutFromRoutine`(`workoutRepository.ts:1285`) → `routineLinesToStartRows`(`domain/replay.ts:153`) → `startWorkoutFromRows`. 읽는 칸:
  - **세트 수**: 처방(prescription)이 있으면 그 길이, 없으면 `targetSets`(`workoutRepository.ts:1256`). → 크리에이터 루틴은 prescription=null 이므로 `targetSets` 가 그대로 쓰인다. OK.
  - **반복 프리필**: `prev?.reps ?? rx?.repMin ?? routineReps(=targetRepsMin) ?? …`(`workoutRepository.ts:880`, 인자 `r.targetRepsMin` 1262행). → `targetRepsMin` 사용. OK.
  - **반복 범위**: `we.targetRepsMin/Max` 복사(1233~1234) + 점진 제안 `getWorkoutExerciseTargets`(427~442)가 루틴 줄의 min/max 를 읽음. OK.
  - **휴식**: `we.restSeconds = r.restSeconds`(1235) → `ExerciseBlock.tsx:165` 가 `we.restSeconds ?? 120` 사용. OK.
- 결론: **target_* 로 넣는 방식은 세션 시작에서 제대로 쓰인다.** prescription 을 쓰지 않는 선택은 맞다(prescription 은 세트별 타입·RIR·무게 기준용이고, 넣으면 세트 수 기준까지 바뀐다 — `routineRepository.ts:146`).

### M-2 (Med) 균일하지 않은 처방
- 근거: `Prescribed = { sets; repsMin; repsMax }` 는 「4×8–10」 같은 균일 처방만 표현. 유튜브 루틴에는 「탑셋 1×5 + 백오프 3×8」, 「피라미드 12-10-8」이 흔하다.
- 위험: 운영자가 균일하게 뭉개 적으면 `from:'video'` 표시가 사실과 달라진다(출처 왜곡 — 크리에이터 입장에선 오표시).
- 권장: 스펙에 규칙 하나 — (a) 균일하지 않은 처방은 `from:'default'` 로 표시하고 요약에 「영상은 피라미드 방식」처럼 적는다, 또는 (b) 이번 범위에서 `prescription`(PrescribedSet[])로 저장(ADR-028: 사람 작성 — 운영자 검수도 사람이므로 허용). 시범은 (a) 권장.
- 덧붙여 같은 날 같은 종목 2줄(무거운/가벼운)을 허용하면 `getWorkoutExerciseTargets`(`workoutRepository.ts:433~440`)가 exerciseId 키로 합쳐 마지막 줄만 남는다 → 데이터 테스트에서 **하루 안 exerciseId 중복 금지**를 권장.

### L-1 (Low) 지난 기록이 처방을 덮음
- `workoutRepository.ts:880` — 반복 프리필은 지난 같은 종목·칸 기록(`prev.reps`)이 최우선. 이미 그 종목을 해 본 사용자는 시트에서 「4×8–10」을 보고도 첫 세션에 지난 횟수(예: 12)가 채워진다. 기존 설계(SRS-010)라 바꿀 필요는 없지만, e2e 「루틴 상세 세트×횟수」 검증은 **루틴 편집기**에서 하고 세션 프리필은 새 DB 기준으로만 검증할 것.

### L-2 (Low) 저장 중 실패 시 부분 저장
- `RoutinesClient.tsx:1215~1222` — 일마다 별도 `database.write`. 중간 실패 시 앞 날 루틴만 남고, `try/finally` 라 토스트 없이 예외가 새어 나간다(기존 동작). 크리에이터 저장도 같은 루프라면 `catch` 로 「n개 중 m개 저장」 토스트를 권장(필수 아님).

---

## 2. 루틴 notes 에 URL

### 확인된 사실
- 동기: 레코드 상한 256KB(`backend/internal/sync/service.go:45`) — URL 1줄은 무관.
- 트레이너 열람: 코칭 원본 레코드는 routines·notes 를 내주지 않음(`backend/internal/coaching/records.go:7~10`).
- 피드 공유: `SHARED_WORKOUT_KEYS` 에 notes 없음(`core/src/domain/sharePayload.ts:44~53`) — URL 은 새지 않는다.
- 복제: `duplicateRoutine` 은 notes 복사(`routineRepository.ts:309`) — 출처 유지, 좋음.

### H-2 (High) 이름은 퍼지고 출처는 안 퍼진다
- 근거: 스펙 §3 루틴 이름 = 「{주제} · {채널} — {일 이름}」. 세션 이름은 루틴 이름(`workoutRepository.ts` startWorkoutFromRows `w.name = opts.name`), 피드 공유는 `workoutName` 을 그대로 싣는다(`sharePayload.ts:34,63`). 다른 사용자가 그 글에서 「루틴 가져오기」하면 `WorkoutBox.tsx:67` 이 그 이름으로 루틴을 만든다 — **notes(출처 링크)는 안 따라간다.**
- 결과: 공개 피드에 「어깨깡패 · 박재훈 — Day 1」 같은 **실명 붙은 루틴**이 출처 링크 없이, 그리고 사용자가 고친 종목으로 돌아다닌다. SRS-091 「사람 이름을 루틴 상품명으로 앞세우지 않는다」 / ADR-045 「이름을 상품명으로 쓰는 것은 허락받은 채널만」과 충돌하고, 크리에이터가 하지 않은 구성이 그 이름으로 보일 수 있다(퍼블리시티·오인 표시 — 부정경쟁방지법 (타)목·표시광고 측면 **확인 필요**).
- 또한 UCS-026 은 이름을 「{채널} · {주제}」, 스펙은 「{주제} · {채널} — {일}」 — 기획 문서끼리도 다름.
- 권장: 루틴 이름에서 채널명을 빼고 「{주제} — {일 이름} (영상 루틴)」처럼 짓고, 출처는 notes 에만. 버전 구분이 필요하면 「A안/B안」 대신 notes 첫 줄로. UCS-026 도 같이 고친다.

### L-3 (Low) notes 표시·편집
- `RoutineEditor.tsx:286~292` — notes 는 한 줄 `TextField`, 링크 아님. 긴 「출처: … 「제목」 https://…」 가 한 줄로 잘린다. 또 `onBlur` 가 `notes.trim() && save(...)` 라 **사용자가 지워도 저장이 안 된다**(기존 버그 — 비워도 출처가 되살아남). 범위 밖이면 기록만.
- notes 문구가 저장 순간 언어로 고정(ko 문자열 「출처:」). en 사용자도 한국어로 남는다 — Low.

---

## 3. 화면 구조·접근성·외부 링크

### M-3 (Med) 두 단계 시트를 Overlay 두 개로 겹치지 말 것
- 근거: `Overlay` 는 각자 `document` 에 Escape 리스너를 단다(`ui/Dialog.tsx:38~42`). 주제 시트 위에 버전 시트를 **동시에 마운트**하면 Escape 한 번에 두 `onClose` 가 다 불려 둘 다 닫힌다. `role="dialog" aria-modal="true"` 도 둘(55~56행), 둘 다 `aria-labelledby` 없음.
- 기존 패턴은 「한 번에 하나」: `ConceptDialog` 는 중복 확인 때 시트를 **ConfirmDialog 로 바꿔 끼운다**(`RoutinesClient.tsx:1238~1249`).
- 권장: 상태 하나(`{ topicId, versionId|null }`)로 **SheetShell 하나**를 렌더하고 내용만 단계 전환 + 버전 단계 상단에 「‹ 버전 목록」 버튼. 단계 전환 시 제목으로 초점 이동. 중복 확인은 기존처럼 교체. e2e 에 Escape 1회 = 한 단계만 닫힘(또는 전부 닫힘 — 정책을 스펙에 명시)을 넣는다.
- 안드로이드 뒤로가기(`popstate`)는 Overlay 가 처리하지 않아 시트가 아니라 `/routines` 를 떠난다 — 기존 공통 한계, 두 단계가 되면 체감이 커짐. 이번 범위 밖이면 기록만.

### L-4 (Low) 외부 링크·PWA 독립 실행
- 같은 패턴 선례: `NearbyGymsClient.tsx:212`(`target="_blank" rel="noopener noreferrer"`). 독립 실행(standalone)에서 iOS 는 Safari/유튜브 앱으로, 안드로이드는 Chrome 탭/유튜브 앱으로 나간다 — 교차 출처라 SW 가 가로채지 않음. 문제 없음.
- 오프라인이면 브라우저 오류 화면 — UCS-026 대로 「브라우저에 맡김」이면 OK. 원하면 `navigator.onLine` false 때 링크 옆 「인터넷 연결 필요」 캡션.
- `<a>` 에 접근 가능한 이름: 「원본 영상 보기 (YouTube, 새 창)」처럼 새 창임을 `aria-label` 또는 숨은 텍스트로.

### L-5 (Low) 표시 이름 맵과 저장 필터 불일치
- `getExerciseDisplayNameMap`(`core/src/data/exerciseNames.ts:20~34`)은 보관(isArchived) 여부를 거르지 않고 `nameKo` 만 준다. 저장은 `getActiveExerciseIds` 로 활성만 남긴다(`RoutinesClient.tsx:1211`). → 시트에 보인 종목이 조용히 빠질 수 있다. 시트에서도 활성 집합으로 걸러 「이 기기에 없는 종목」을 흐리게 표시 권장.
- en 로케일에서도 한국어 이름(nameKo). `summaryKo`·`days[].nameKo` 만 있어 en 화면 전체가 한국어 — en 은 숨기거나 「Korean content」 표기를 스펙에 명시.
- 참고: 현재 콘셉트 시트는 **seed id 를 그대로 출력**한다(`RoutinesClient.tsx:1273` `d.exercises.join(" · ")`) — 교체되므로 해소되지만 원복 시 버그가 돌아온다.

---

## 4. 법적·약관

### H-1 (High) 기획 문서와 스펙 충돌 (Q3)
- 스펙 헤더: 「Q3 = 기존 AI 콘셉트 4개는 버림」, §3 「CONCEPT_ROUTINES 그리드 주석」.
- 그러나 SRS-091 요구 서술·UCS-026 대안 흐름·SAD-026 화면 = 「기존 AI 콘셉트 루틴은 같은 주제의 『리프트그램 기본』 버전으로 유지」, ADR-045 되돌림 = 「데이터 파일 비우면 기존 콘셉트 루틴만 남는다」(호출부를 주석 처리하면 거짓이 됨).
- 또한 주제 id 가 바뀐다(`after-work-30` → `after-work`, `profile-season` 삭제 — `conceptRoutines.ts:69,97`). SAD 는 `conceptId`, 스펙은 `topicId`.
- 권장: /execute 전에 SRS-091·UCS-026·SAD-026·ADR-045 를 Q3 결정으로 개정(또는 ADR-045 에 결과 개정 줄 추가). 되돌림 절차도 「호출부 주석 해제」로 고친다. 주제에 버전이 0개가 되면(전부 숨김) 카드 자체를 숨기는 규칙도 추가.

### H-3 (High · 확인 필요) Data API 저장 기간
- 스펙 §4: `youtube-describe.mjs` 가 Data API 로 설명란을 읽어 큐레이션 — 앱 런타임 미사용. 그러나 `source.title`·`channel` 은 정적 데이터에 **무기한** 저장된다.
- YouTube API Services Developer Policies 에는 API 로 받은 데이터를 일정 기간(정책 문구상 30일 내외) 넘게 보관하려면 갱신하거나 삭제하라는 저장 조항이 있는 것으로 안다 — **원문 대조 필요**(정책 III.E 「Data storage/refresh」류 조항). oEmbed 는 Data API 가 아니라 공개 엔드포인트지만 같은 약관 범위로 보는 해석도 있어 **확인 필요**.
- 권장(어느 해석이든 안전한 쪽):
  1. 저장하는 제목·채널은 **oEmbed 값만** 쓰고, Data API 응답(설명란 원문)은 파일로 남기지 않는다(스크립트 출력은 터미널만 · `.gitignore` · 리포지토리 커밋 금지).
  2. `check-creator-routines.mjs` 를 **배포마다 + 주 1회 정기**(CI 스케줄) 돌리고, `verifiedAt` 가 30일을 넘으면 경고(테스트로 강제하지는 말고 스크립트 경고). 불일치 시 제목을 갱신.
  3. `summaryKo` 는 설명란 문장을 옮기지 않는 「우리 말」 — 설명란 원문 대비 **연속 n자(예: 20자) 이상 일치 금지** 같은 기계 검사를 큐레이션 스크립트에 둔다(대본 인용 금지 규칙의 실행 수단).
- API 키: `YOUTUBE_API_KEY` 를 `NEXT_PUBLIC_*` 로 두지 말 것, `.env` 커밋 금지 — 스펙에 한 줄.

### M-5 (Med) 고지·요청 경로
- 출처 표기는 있으나 다음이 없다:
  - 「리프트그램이 영상을 보고 정리한 것으로, 채널과 제휴·보증 관계가 없습니다」 고지(버전 시트 하단 캡션). 실명 채널(박재훈·씨범 등)이 앱이 판매·추천하는 것처럼 보이는 오인 방지.
  - 「정정·삭제 요청」 경로(이메일 또는 피드백 링크) — 크리에이터·사용자가 오표시를 알릴 수단. 요청 시 데이터에서 내리는 절차(SLA 없어도 「다음 배포」)를 SRS-092 에 추가.
  - 제목 인용 시 원 제목에 과장·단정(「한 달 만에 어깨 2배」)이 있으면 웰니스 카피 게이트 대상인지: 인용(따옴표)은 우리 주장 아님 → 게이트 제외가 합리적이나 **스펙에 명시**할 것. 요약(summaryKo)은 게이트 대상.
- 채널명 표기: 채널 표시 이름(oEmbed `author_name`) 그대로, 「님」·직함·배지 붙이지 않기(ADR-045 「배지 금지」를 화면 규칙으로 명시). 유튜브 로고를 쓰면 YouTube 브랜드 가이드 준수 필요 — 텍스트 링크만이면 불필요.
- 논란 인물 배제(SRS-092): 현재는 사람 판단(Q2 황철순 제외)뿐. 데이터 테스트에 **제외 채널 목록 검사**를 두면 실수로 다시 들어오는 것을 막는다.

### M-4 (Med) 삭제·비공개 영상 처리
- SRS-092 「영상이 삭제·비공개되면 해당 버전을 숨긴다」 → 스펙 §4 는 점검 스크립트가 **종료 코드 1로 보고**만 한다. 숨김 수단(`hidden: true` 칸 또는 항목 삭제)과 실행 시점(배포 전 필수 단계? 정기?)이 없다.
- oEmbed 응답 해석: 401 은 「퍼가기(embed) 금지」 영상에서도 나는 것으로 알려져 있다 — 공개 영상인데 숨김 대상으로 오판할 수 있다(**확인 필요**). 401 은 「경고(수동 확인)」, 404 만 「실패」로 나누거나, 키가 있으면 Data API `videos.list?part=status` 로 `privacyStatus` 를 재확인.
- 권장: `CreatorRoutine.hidden?: boolean` + `creatorRoutinesFor` 가 숨김 제외 + 테스트. 스펙 §6 순서에 「배포 전 check 스크립트 통과」를 명시.

---

## 5. 테스트 계획의 빈틈

### M-6 (Med) 빠진 단위 테스트
1. **importRoutine 불변**: 옛 호출 모양(`{exerciseId}`, `{exerciseId,targetSets,targetRepsMin,note}`) → `targetRepsMax 12 · restSeconds 120 · routine.notes null` 고정 테스트. 새 모양 → 값이 그대로 들어가는지. (WatermelonDB node 테스트는 메모리 「WatermelonDB 이관 node 검증」 레시피 — LokiMemoryAdapter.)
2. **세션 시작 연결**: 크리에이터로 만든 루틴으로 `startWorkoutFromRoutine` → 세트 수 = sets, 첫 수행 반복 프리필 = repsMin, `we.restSeconds` = restSec(없으면 120), `prescription` null.
3. 데이터 테스트 보강: id 유일 · 하루 안 exerciseId 중복 금지(M-2) · days ≥1 · repsMin ≥1 · restSec 범위(예 30~600) · `verifiedAt` 형식 · `channelUrl` 가 `https://www.youtube.com/` 로 시작 · `title` 빈 문자열 금지 · 제외 채널 목록(M-5) · `summaryKo` 길이 상한(1~2문장 — 예 ≤160자) · from 혼합 표현(M-1 반영 시).
4. 「다운로드 경로 없음」(SRS-092 수용 기준 「리뷰 체크」)을 기계화: `scripts/` 와 `core/` 에 `ytdl|yt-dlp|timedtext|captions|youtube-dl` 문자열이 없음을 검사하는 테스트 1개.
5. 표시 형식: repsMin==repsMax → 「4×10」, 다를 때 「4×8–10」 단위 테스트(순수 함수로 분리).

### L-6 (Low) e2e 보강
- 중복 이름 확인 대화상자(`concept-dupe` 재사용 여부) 경로.
- 「기본값」 칩 표시, 링크 `target`·`rel` 속성, 「출처:」 줄 텍스트.
- 두 단계 시트 Escape/닫기 동작(M-3).
- 옛 `routines.spec.ts:80~92` 는 「행 수 == 2」를 새 DB 전제로 센다 — 새 흐름도 일 수만큼 행이 생기는지 같은 방식으로, 단 이름 접두가 바뀌므로 `toContainText` 대상 갱신.
- 루틴 편집기에서 notes(`routine-notes`)에 출처 URL 이 보이는지.

### L-7 (Low) catalogGap 의 옛 데이터
- `catalogGap.test.ts:63~76` 은 화면에서 안 쓰는 `CONCEPT_ROUTINES` 를 계속 검사한다(보존 규칙상 OK). 같은 검사를 `CREATOR_ROUTINES` 에도 적용하는 것이 스펙 §5 와 겹치므로 하나로 묶어도 된다.

### L-8 (Low) 점검 스크립트 자체
- 네트워크 의존이라 CI 기본 테스트에 넣지 말고, 응답 파싱(404/401/불일치 판정)을 순수 함수로 떼어 단위 테스트. Cloudflare 경유 엔드포인트가 아니라도 `user-agent` 명시(프로젝트 규칙).

### L-9 (Low) M-1 상세 — `from` 단위
- SRS-092 「확인하지 못한 세트·횟수는 우리 기본값임을 표시」. 실제로는 「4세트」만 말하고 횟수는 안 말하는 영상이 흔하다. `from: { sets: 'video'|'default'; reps: ...; rest?: ... }` 또는 `fromFields: ('sets'|'reps'|'rest')[]` 로 칸별 표시 권장. 화면 칩도 칸 옆에. (등급은 M-1 Med 로 본문 표에 반영.)

---

## 권장 스펙 수정 체크리스트
- [ ] H-1: SRS-091·UCS-026·SAD-026·ADR-045 를 Q3 로 개정 · 되돌림 절차 · 버전 0개 주제 숨김
- [ ] H-2: 루틴 이름에서 채널명 제거(출처는 notes) · UCS-026 이름 규칙 일치
- [ ] H-3: 저장 값은 oEmbed 만 · Data API 출력 비보관 · check 정기 실행·30일 경고 · 요약 원문 일치 검사 · 키 비공개 (정책 원문 확인)
- [ ] M-1/M-2: 칸별 from · 비균일 처방 규칙 · 하루 내 종목 중복 금지
- [ ] M-3: SheetShell 하나 + 단계 상태 · 초점 이동 · Escape 정책
- [ ] M-4: `hidden` 칸 · 401 경고/404 실패 분리 · 배포 전 check 필수
- [ ] M-5: 제휴·보증 아님 고지 · 정정/삭제 요청 경로 · 제외 채널 테스트 · 제목 인용은 게이트 제외 명시
- [ ] M-6: importRoutine 불변·세션 시작 단위 테스트 · 다운로드 문자열 검사
