# SPEC-054 — 영상·글에서 루틴 가져오기 — 규칙 해석 초안 · 확인 화면 · 영상 보며 받아 적기

> 타입 Spec · 그룹 liftgram/영상-루틴-가져오기 · ADStudio가 `SPEC-054.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-063, SRS-116

### 목표

사용자가 유튜브 영상을 보다가 그 루틴을 앱에 옮길 때, 유튜브와 앱을 오가며 기억에 의존하던 일을 한 화면으로 줄인다. 링크·글·「스크립트 표시」 복사본을 넣으면 **라이브 LLM 없이 규칙만으로** 초안을 만들고, 사람이 줄마다 확인·수정해 내 루틴으로 저장한다. 해석이 안 되는 영상은 앱 안 플레이어로 보면서 「+ 종목」으로 받아 적는다. 휴대폰에서는 설명란·스크립트를 복사하기 어렵다는 전제로(스펙 리뷰 U1) **링크 하나 → 초안, 안 되면 받아 적기**가 주 경로다.

### 범위

| 단계 | 파일 | 무엇을 |
| --- | --- | --- |
| 1 | `src/core/src/domain/videoImport/parse.ts`(새) | 줄·시각 · 스크립트 흐름(글자 위치 → 시각) · 처방 패턴(아래 표) · 날 머리 |
| 1 | `src/core/src/domain/videoImport/mention.ts`(새) | 종목 언급(한글 부분 일치 · 영문 낱말 묶음+어간) · 모호한 말 목록 · 기구 단서(조사 떼기) · family 형제 판정 · 자모 편집 거리 오타 허용 |
| 1 | `src/core/src/domain/videoImport/draft.ts`(새) | 언급·처방 묶기(앞뒤 창) · 칸별 신뢰도 · 뼈대 근거 고르기 · 「언급만」 종목 · 같은 종목 합치기 · 메모는 해석값으로만 생성 |
| 1 | `src/core/src/domain/videoImport/link.ts`(새) | 유튜브 링크 → videoId(watch·youtu.be·shorts·live·m.·music · si·t·list 버림) |
| 1 | `src/core/src/domain/videoImport/index.ts` | 내보내기(`@app/core/domain/videoImport/index`) |
| 1 | `src/core/src/domain/__tests__/videoImport.test.ts`(새) | 패턴 표(맞게 읽음·무시 짝) · 형식별 예문 3종 · 메모 원문 미포함 속성 테스트 — 예문은 직접 쓴 글 |
| 1 | `src/scripts/eval-video-import.mjs`(새) | 로컬 평가: 영상 루틴의 설명란(Data API) 해석 → 정답(큐레이션)과 비교 · 숫자만 출력 |
| 2 | `src/proto/video/v1/video.proto`(새) · 생성물 | `VideoService.DescribeVideo` |
| 2 | `src/backend/internal/video/`(새: `service.go` · `handler.go` · `client.go` · 테스트) | Data API `videos.list part=snippet,contentDetails,status` · 캐시 · 제한 · 예산 · 오류 매핑 |
| 2 | `src/backend/internal/config/config.go` · `src/.env.example` · `src/compose.yaml` · `src/backend/cmd/server/main.go` · `src/scripts/deploy-h2500-3.sh` | `YOUTUBE_API_KEY`(선택) · 조립 · 배포 경고 |
| 3 | `src/frontend/app/routines/import/page.tsx`(새) · `src/frontend/app/components/routines/RoutineImport.tsx`(새) · `src/frontend/app/components/routines/ImportRowSheet.tsx`(새) | 입력 → 초안 만들기 → 확인 화면 → 저장 · 줄 편집 하단 시트(확인·받아 적기 공용) |
| 3 | `src/frontend/lib/importDraft.ts`(새) | 초안 보존(sessionStorage · 원문 제외 · 1일 만료) |
| 3 | `src/frontend/app/components/ExercisePickerScreen.tsx` | `initialQuery?`(전체 선택 상태로 포커스 · 0건이면 「검색어 지우기」) |
| 3 | `src/frontend/app/components/routines/RoutinesClient.tsx` | 「새 루틴 만들기」 줄 아래 「영상·글로 가져오기」 글자 링크(homeReady 뒤 · 강조색 없음) |
| 3 | `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` · `src/frontend/app/privacy/` | `import.*` 문구 · 개인정보처리방침에 YouTube API 서비스 사용·Google 개인정보처리방침 링크 |
| 4 | `src/frontend/app/components/routines/VideoWatchRecorder.tsx`(새) | 임베드 플레이어 + 줄 목록 · 「+ 종목」 |
| 3·4 | `src/frontend/e2e/routine-import.spec.ts`(새) | 아래 테스트 계획 |

### 설계

#### 입력과 흐름

1. 입력 칸은 **하나**(링크·글·스크립트 복사본 모두). 스크립트 형식(시각 줄+글 줄)은 자동 감지해 「스크립트로 읽었어요」 표시. 칸 위 「붙여넣기」 버튼(`navigator.clipboard.readText`, 안 되면 숨김). 도움말(접힘): 「휴대폰: 링크만 붙여 넣으세요 · 컴퓨터: 영상 아래 …더보기 → 스크립트 표시 → 전체 선택 복사」.
2. 「초안 만들기」 버튼이 이 화면의 유일한 강조색(입력할 때마다 해석하지 않는다). 링크가 있으면 `DescribeVideo` 로 설명란·길이·임베드 가능 여부를 받는다(화면 대기 7초).
3. 해석 → 확인 화면. 해석 중에는 결과 자리 스켈레톤(로드 전 0개 깜빡임 금지 · loaded 플래그).
4. 저장 → 하루짜리는 그 루틴 편집기로 바로(replace) · 여러 날이면 루틴 목록 + 「루틴 N개를 저장했어요」(SRS-116 ⑤ 「편집으로 이어짐」 · U10).

| 상태 | 문구(ko) | 다음 길 |
| --- | --- | --- |
| 링크 형식 아님(글도 없음) | 「유튜브 링크를 알아보지 못했어요」 | 입력 칸 |
| 비공개·삭제(NotFound) | 「비공개거나 삭제된 영상이에요」 | 입력 칸 |
| 로그인 없음(Unauthenticated) | 「로그인하면 링크로 불러올 수 있어요 · 글은 지금도 붙여 넣을 수 있어요」 | 로그인 · 붙여넣기 |
| 요청 제한(ResourceExhausted) | 「잠시 뒤 다시 시도해 주세요」 | — |
| 키 없음·할당량·오류·오프라인(Unavailable·망) | 「영상 정보를 못 불러왔어요 — 영상을 보며 직접 적어 볼까요?」 | 받아 적기(주) · 붙여넣기 |
| 종목 0줄 | 「종목을 찾지 못했어요」 | 받아 적기(링크 있을 때) · 글 붙여넣기 · 직접 만들기 |

오류 문구는 `role="alert"`.

#### 해석 규칙(core · 순수 함수)

- **스크립트는 흐름으로**(P1): 시각 줄 글을 이어 붙인 한 흐름 + 글자 위치 → 시각 표. 종목은 흐름에서 찾고(줄을 넘는 이름도), 처방은 같은 문장 안이 먼저, 그다음 앞뒤 ±20초 안의 가장 가까운 언급에 붙인다. 설명란·글은 줄 단위(같은 줄 + 뒤 2줄).
- **스크립트 언급은 근거가 있어야 줄**(P3): 처방과 묶였거나 · 60초 안에 2번 이상 언급 · 챕터 제목과 일치. 나머지는 접힌 「영상에서 언급만 된 종목 N개」(누르면 줄로 추가). 영상 끝 10% 안의 재언급(정리 구간)은 버린다.
- **칸별 신뢰도**(P4): 형식 패턴(N×M · N sets of M · N세트 M회)이 어느 근거든 이기고, 말에서 읽은 수(「네 세트」)는 빈칸만 채운다. 설명란이나 글에 처방 줄이 2개 이상이면 그 근거가 종목 목록의 뼈대 · 스크립트는 atSec·빈칸만 보탠다. 뼈대가 없으면 스크립트 줄이 뼈대.
- **종목 언급**(P2·P5·P6): 한글은 공백 없앤 키 부분 일치(뒤에 「랙」이 붙으면 제외), 영문은 낱말 묶음(어간: -s/-es/-ies/flyes/-ing·겹자음/-ed — 색인도 같은 규칙). 길이로 거르지 않고 **모호한 말 목록**(일반어·자세 설명어와 겹치는 별칭 — 몸풀기·스트레칭·하이퍼·아놀드·외회전·인터벌·브릿지·stretch·clean·bench·walk·cluster 등, 카탈로그에서 뽑는 일회성 스크립트로 목록을 만들고 코드에 표로 둔다)은 같은 줄·문장에 처방이나 기구 단서가 있을 때만. 대문자 약어(RDL·OHP)는 원문 대문자+낱말 경계면 인정. 겹치면 긴 말.
- **기구**(P5): 단서는 조사를 떼고 읽는다(덤벨로·바벨로). 맞은 종목의 family 에 기구가 다른 형제가 있는데 단서가 없으면 「확인 필요」(후보 = 형제). 「~벤치에서 / on the bench」는 위치 표현 — 프레스류가 아니면 언급 아님.
- **오타 허용**(P10): 「못 찾음」 줄의 이름 후보에만 · 한글은 자모로 풀어 거리 ≤ 1(자모 8개 이상) · 카탈로그 안에서 서로 거리 ≤ 1 인 말(인클라인/디클라인)은 제외 · 결과는 늘 「확인 필요」.
- **같은 날 같은 종목** → 한 줄 + 메모 「이어서 N세트」. 앞 줄이 세트를 몰랐으면(챕터 줄 뒤 처방 목록) 뒤 줄 값을 쓴다.
- **날 나누기**(P9): 설명란·글은 줄 전체가 머리말일 때(Day N · N일차 · 요일 · Push/Pull/Legs day · 상체/하체 날 · 「가슴·삼두 데이」 · 24자 이하). 스크립트는 「N일차/Day N」만. 머리 아래 종목 0개면 앞 날에 합침. 「Week N」은 첫 주만 + 메모.
- **메모는 해석값으로 새로 만든다**(P12): 정해진 낱말·수만(「실패 지점까지 · 드롭세트 · RPE 8 · 피라미드 20·15·10 · 워밍업 2세트 따로 · 30초 유지 · 한쪽씩」) — 원문 조각을 넣지 않는다(속성 테스트).
- 세트·횟수 미기재: 3×10 기본 + 「영상에 표기 없음 — 기본 3×10」(SRS-091 과 같은 정직 표시).

#### 처방 패턴 표(테스트 데이터와 같다)

| 입력 | 읽기 |
| --- | --- |
| `4x8-10` · `4 × 8~10` · `3 by 10` · `4 sets of 8 to 12` · `3세트 12회` · `12회 3세트` · `4세트 8에서 12개` | 세트·횟수(범위) |
| `네 세트 열 개` · `four sets of ten` · `두세 세트`(→3) · `서너 세트`(→4) · `한 10개`(→10, 근삿값) · `a couple of sets`(→2) · `a dozen`(→12) | 수 낱말 |
| `3-4 sets` | 큰 값 + 메모 「3~4세트」 |
| `12-10-8` · `20/15/10` · `(15,12,10,8)` | 피라미드 — 세트=개수 · 횟수=최소~최대 · 메모 |
| `워밍업 2세트 뒤 작업 3세트` · `2 warm-up sets` | 작업 세트만 · 메모 「워밍업 2세트 따로」 |
| `한쪽 10개씩` · `10 each side` | 횟수 + 메모 「한쪽씩」 |
| `30초 플랭크 3세트` · `3x60s` · `1분 버티기` | 세트 + 메모 「30초 유지」 · 횟수 기본(휴식 아님) |
| `rest 90 sec` · `90s rest` · `2분 휴식` · `1분 30초 쉬고` | 휴식(10~600초) — 휴식 낱말이 있을 때만 |
| `3라운드` · `3 rounds` | 같은 날 모든 줄의 세트(빈칸만) |
| `100kg 5회` · `225 for 5` · `140x5` · `60에 10개` · `75% x 5` · `3x5 @ 100kg` | 무게 버림 · 횟수만 · N×M 에서 N>10 이면 「무게×횟수」로 다시 읽음 |
| `두 번째 세트` · `3세트째` · `set 2` · `마지막 세트` | 몇 번째 — 버림 |
| `3-1-1-0` · `3010` · `하나 둘 셋 넷` · `1 2 3 4 5` | 템포·세는 소리 — 버림(템포는 메모 「템포 3-1-1-0」) |
| `10% off code` · `2024` · `1:23` | 잡문·연도·시각 — 버림 |
| `to failure` · `실패 지점` · `AMRAP` · `drop set` · `superset` · `RPE 8` · `2 RIR` | 메모만(구조화하지 않음) |

#### 서버(단계 2)

```proto
service VideoService {
  // 공식 Data API videos.list(part=snippet,contentDetails,status) — 호출당 1단위. 자막(captions) 엔드포인트는 쓰지 않는다.
  rpc DescribeVideo(DescribeVideoRequest) returns (DescribeVideoResponse);
}
message DescribeVideoRequest {
  string video_id = 1 [(buf.validate.field).string.pattern = "^[A-Za-z0-9_-]{11}$"];
}
message DescribeVideoResponse {
  string video_id = 1;
  string title = 2;        // 200자
  string channel = 3;
  string description = 4;  // 5,000자
  int32 duration_sec = 5;  // 라이브·길이 0 이면 0
  bool embeddable = 6;     // status.embeddable · 지역·연령 제한 반영
}
```

- **키**(B1): `X-Goog-Api-Key` 헤더(주소에 넣지 않는다) · 바깥 오류는 키 없는 고정 오류로 바꿔 돌려준다 · 운영 키는 로컬 스크립트 키와 따로(GCP 에서 API·출구 IP 제한 — 대표 작업, 회신에 안내).
- **제한·예산**(B2): service 가 `Limiter` 를 받아 사용자당 분당 6회·하루 50회(바깥 호출만 센다 · 캐시 적중은 안 셈) · 서버 전체 하루 8,000회 · `quotaExceeded` 면 다음 태평양시 자정까지 멈춤 · `keyInvalid`·`accessNotConfigured` 면 10분 멈춤+경고 로그 · 같은 id 동시 호출은 `singleflight`.
- **캐시**(B11): 메모리 LRU 2,000개 · 있는 영상 24시간 · 없는 영상 10분(YouTube API 정책의 30일 상한 안) · 바깥 호출은 요청과 분리된 5초 컨텍스트 · 받는 본문 `io.LimitReader` 256KB · 요청 본문 4KB 상한.
- **오류 표**(B5): 형식 틀림 InvalidArgument · 항목 0개 NotFound · 사용자 제한 ResourceExhausted · 키 없음·할당량·거절·5xx·시간 초과 Unavailable · 로그인 없음 Unauthenticated(handler 가 `auth.UserIDFrom` → service) · 그 밖 Internal(로그는 키·설명란 없는 문장만).
- **경계**: `service.go` 는 HTTP·connect 를 모른다 — `Fetcher` 인터페이스(`client.go` 구현) · 설명란은 응답으로만, 로그·DB 에 쓰지 않는다(Go 테스트로 slog 가로채 확인).
- **배포**(B7): compose backend `YOUTUBE_API_KEY: ${YOUTUBE_API_KEY:-}` · 배포 스크립트는 비었으면 경고만 · 부팅 로그 `youtube=true/false`.

#### 저장·출처(YouTube API 정책 · B4)

- API 로 받은 제목·채널은 **화면에만** 보여 주고 기기·서버에 남기지 않는다(정책: 영상 id 외 API 데이터는 30일 넘게 저장하지 않음).
- 루틴 메모 = 「출처 영상: https://www.youtube.com/watch?v=<id>」(+ 사용자가 직접 고친 내용). 루틴 이름 기본값 = 「영상 루틴 · 11/10」(사용자가 고친 이름은 사용자 글). 붙여 넣은 글에서만 온 루틴은 「가져온 루틴 · 11/10」.
- 가져오기 화면에 「YouTube 서비스 약관」 링크 · 개인정보처리방침에 YouTube API 서비스 사용과 Google 개인정보처리방침 링크.
- 같은 이름 루틴이 있으면 기존 확인창(`concept.dupeTitle`) 재사용 · 여러 날이면 날마다 이름 칸(기본 「… · Day 1」).

#### 원문 미저장 · 초안 보존(ADR-063 · U2 · B8)

- 원문(붙여 넣은 글·설명란)은 컴포넌트 상태에만 · 어떤 RPC 에도 싣지 않는다(오류 보고·이용 기록·피드백 포함) · 서비스 워커는 `/api/*` 를 캐시하지 않는다는 전제를 `src/frontend/sw/sw.template.js` 주석에 남긴다.
- 초안 줄(종목 id·세트·횟수·휴식·메모·atSec·상태·근거 종류)과 videoId 는 원문이 아니므로 sessionStorage `liftgram.importDraft` 에 둔다(1일 만료 · 저장·버리기 때 지움). 다시 들어오면 「만들던 초안이 있어요 — 이어서 / 버리기」.
- 초안 줄이 1개 이상이면 나가기(뒤로·탭 막대) 확인창 — `src/frontend/app/components/routines/RoutineEditor.tsx` 와 같은 가드 칸 규약.

#### 확인 화면(단계 3)

- 머리: (링크면) 제목·채널 · 원본 링크(새 창 ↗) · 「YouTube 서비스 약관」 · 읽은 근거 요약(「설명란 · 스크립트로 읽었어요」).
- 줄은 **두 줄 카드**(U6): 1행 = 종목 이름 + 상태 칩(「확인 필요」 회색 · 「종목 고르기」) · 2행 = 세트×횟수 칩 · 「▶ m:ss」 · (기본값이면) 「표기 없음」 칩. 위·아래·지우기는 줄 끝 ⋯ 메뉴.
- 1행을 누르면: 「확인 필요」면 그 자리에서 후보 칩 3개 + 「다른 종목…」(전체 선택 창 · 검색어 채움) · 「못 찾음」이면 바로 전체 선택 창 · 확인된 줄은 「종목 바꾸기」 선택 창(U5).
- 2행 세트×횟수 칩 → 줄 편집 하단 시트(`ImportRowSheet`, U7): 세트 칩 1~6 + 「더」 · 횟수 칩 + 「범위」 토글(최소~최대) · 「실패 지점까지」 칩 · 휴식 칩 · `role=radiogroup` · 기본값을 고치면 「표기 없음」이 사라진다.
- 「▶ m:ss」: 임베드 가능 영상이면 받아 적기 화면을 그 시각으로 열고(U8), 아니면 새 창 ↗.
- 저장 버튼 = 유일한 강조색. 저장 확인: 「못 찾은 N줄은 빼고 · 확인 안 한 N줄은 첫 후보로 저장해요」.
- 접근성: ⋯·▶·칩의 aria-label 에 종목 이름 · 순서 이동 뒤 포커스 유지 + `aria-live` 「3번째로 옮겼어요」.

#### 영상 보며 받아 적기(단계 4)

- 플레이어는 위에 sticky(16:9 · 좌우 여백 없이 · 200×200 이상) · 줄 목록만 스크롤 · 하단 고정 바(safe-area)에 「+ 종목」= 이 화면의 유일한 강조색 · 저장은 확인 화면으로 돌아가서(U9).
- 임베드: `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&playsinline=1&rel=0&origin=<사이트>` + 공식 IFrame API(`https://www.youtube.com/iframe_api`, 이 화면에서만 지연 로드) · iframe `title="영상: …"`.
- 「+ 종목」: 누르면 즉시 「⏱ 1:23 · 종목 고르기」 빈 줄 추가 + `aria-live` 「1:23 시각을 적었어요」 — 종목은 나중에 그 줄을 눌러 고른다(영상 흐름을 끊지 않음 · U3). 「바로 고르기」 토글을 켜면 즉시 선택 창 + 「고르는 동안 잠깐 멈춤」(기본 켬, 닫으면 다시 재생).
- 줄의 「▶ m:ss」는 플레이어를 그 시각으로(seekTo).
- 받아 적기는 history 칸 하나(선택 창과 같은 `liftgramTop` 규약) — 뒤로 = 확인 화면으로, 줄은 그대로.
- 임베드 불가 감지: 서버 `embeddable=false` · IFrame API `onError` 101/150/153 · 8초 안에 준비 안 됨 → 「이 영상은 앱 안에서 재생할 수 없어요」 + 새 창 링크 · 받아 적기 줄은 시각 없이(수동 입력 가능).
- **iOS 앱**(B3): 앱은 `WKAppBoundDomains` 가 `liftgram.tarae.org` 하나라(`src/mobile/ios/App/App/Info.plist:39`) 임베드가 막힐 가능성이 높다 — 이번 판은 iOS 앱(UA `LiftgramApp/1.0 (ios)`)에서 **새 창 대체 화면을 기본**으로 하고, 유튜브 도메인 추가는 다음 네이티브 업데이트로(보류). 안드로이드 앱·웹은 임베드.

### 작업 단계

#### Phase 1 — 규칙 해석(core)

- [x] `parse.ts` 줄·시각·스크립트 흐름·패턴 표·날 머리
- [x] `mention.ts` 언급·어간·모호한 말 목록(카탈로그에서 뽑기)·기구 단서·family 형제·자모 오타
- [x] `draft.ts` 창 묶기·「언급만」·칸별 신뢰도·뼈대·합치기·메모 생성
- [x] `link.ts` 링크 → id
- [x] 테스트: 패턴 표 전부(맞게 읽음·버림 짝) · 형식별 예문(설명란·스크립트 조각·글 각 3개 이상, 한/영) · 메모 원문 미포함 속성 테스트
- [x] `src/scripts/eval-video-import.mjs` — 설명란에 처방이 있는 영상 대상 종목 정밀도·재현율(id·family 따로) · `src` 가 video 인 칸의 세트·횟수 정확도 · 날 수 일치 · atSec 차이

완료 기준: `cd src && bun run test:core` 통과 · 평가 합격선 **정밀도 0.8 이상 · 재현율 0.6 이상**(설명란에 처방 줄이 2개 이상인 영상) — 못 미치면 규칙을 고쳐 다시 잰다.

#### Phase 2 — 영상 정보 API(backend)

- [x] proto(+buf.validate) · `make proto`
- [x] service: 캐시·singleflight·제한·예산·정지·오류 표 · `service_test.go`(가짜 Fetcher·가짜 시계 · 설명란 로그 미기록)
- [x] client: 헤더 키·ISO 8601 길이·임베드 판정·크기 상한·403 사유 구분 · `client_test.go`(httptest · 주소에 키 없음)
- [x] handler(로그인 · 요청 본문 4KB) · 조립 · config · `.env.example` · compose · 배포 스크립트 경고 · 부팅 로그
- [x] `make verify`

완료 기준: Go 테스트 통과 · 키 없이 부팅·호출하면 Unavailable.

#### Phase 3 — 가져오기 화면

- [x] `/routines/import` 입력(한 칸·붙여넣기·스크립트 감지)·상태 문구·스켈레톤
- [x] 확인 화면(두 줄 카드·후보 칩·⋯ 메뉴·`ImportRowSheet`)·저장(이름·중복 확인·이동)
- [x] 초안 보존·나가기 확인
- [x] 선택 창 `initialQuery` · 루틴 탭 진입 링크 · 문구 ko/en · 개인정보처리방침 · YouTube 약관 링크
- [x] e2e(아래)

완료 기준: tsc·biome · e2e 통과(로컬 운영 빌드).

#### Phase 4 — 영상 보며 받아 적기

- [x] `VideoWatchRecorder.tsx`(sticky 플레이어·하단 바·빈 줄 추가·바로 고르기·잠깐 멈춤·seekTo·history 칸)
- [x] 임베드 불가 감지·iOS 앱 대체 화면
- [x] e2e(IFrame API 가짜 · 시각 읽기 · 360×640 에서 줄 3개 이상 · 플레이어 200×200 이상)

완료 기준: e2e 통과.

### 수용 기준

- SRS-116 ① 링크·글·스크립트 세 입력 모두 초안이 나온다(e2e · 링크는 가짜 응답).
- SRS-116 ② 패턴 표 전부 core 테스트 통과 · 평가 합격선 · LLM·외부 해석 서비스 호출 없음.
- SRS-116 ③ 줄마다 상태·근거 시각·기본값 표시 · 못 찾은 줄은 검색어가 채워진 선택 창.
- SRS-116 ④ 「+ 종목」이 플레이어 시각을 줄에 남긴다.
- SRS-116 ⑤ 저장 = 내 루틴(가져옴 표시) + 메모에 출처 영상 링크 · 하루짜리는 편집기로.
- ADR-063: 서버는 자막·음성을 읽지 않는다(snippet·contentDetails·status 만) · 붙여 넣은 원문은 저장소(localStorage·sessionStorage·IndexedDB·Cache Storage)와 보낸 요청 본문 어디에도 없다(e2e 표식 문장 검사).

### 테스트 계획

- `cd src && bun run test:core`
- `cd src/backend && go test ./internal/video/...` · `cd src && make verify`
- `node src/scripts/eval-video-import.mjs`(로컬 · 키 필요 · 숫자만)
- 로컬 운영 빌드 e2e — 웹 3230·API 3231·새 DB(3200·3210 은 다른 세션이 쓰고 있어 옮김): `e2e/routine-import.spec.ts`(글 → 확인 → 저장 · 못 찾은 줄 고르기 · 후보 칩 · 링크(가짜 응답) · 로그인 없음·NotFound 문구 · 새로고침 뒤 초안 복원 · 원문 미저장(저장소 4종 + 요청 본문) · 받아 적기) + 회귀 `e2e/creator-routines.spec.ts` · `e2e/routine-preview.spec.ts`

### 위험·주의

- 해석 정확도 — 말은 숫자가 세트인지 무게인지 헷갈린다. 확인 화면이 전제(자동 저장 없음) · 형식 패턴 우선 · 스크립트 단독 언급은 「언급만」.
- Data API 할당량 — 캐시·사용자당·서버 예산 · 소진 시 받아 적기·붙여넣기 안내.
- 운영 서버에 `YOUTUBE_API_KEY` 가 없으면 링크 해석만 꺼진다(배포 때 넣고, 없으면 그 값만 요청).
- iOS 앱 임베드 — 이번 판은 새 창 대체 · 네이티브 도메인 추가는 보류.
- 나중에 CSP 를 넣으면 `frame-src https://www.youtube-nocookie.com` · `script-src https://www.youtube.com` 가 필요 — `src/frontend/next.config.ts` 주석에 남긴다.
- 저작권 — 테스트 예문은 직접 쓴다 · 평가 스크립트는 숫자만 출력 · 메모는 해석값으로만.
