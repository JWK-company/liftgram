# /qa code — 종목 갭 보강 106종목 (SRS-094 · v0.56.0)

- 대상: worktree `liftgram-wt-catalog` · `git diff 8ba8a60..13be6e6`(0f9438f appUpdate lint · 13be6e6 카탈로그 +106)
- 근거: 스펙 `docs/spec/20261030_catalog-gap/spec.md` · 스펙 검토 `docs/qa/20261030_catalog-gap-spec_qa.md`(조치 절은 다시 적지 않고 반영 여부만 확인)
- 방식: 코드 읽기, 직접 실행, 픽토그램 렌더. 파일은 고치지 않았다.
  - `node --import tsx --test core/src/domain/__tests__/*.test.ts` → **553/553 통과**
  - `node scripts/gen-catalog.mjs --check` → 생성물 = 정본(586행 · family 320 · 예외 1)
  - v0.55.0(8ba8a60)의 `catalog.generated.ts`로 지문을 직접 계산해 보니 `71dec135…`(480행)이었다. 테스트의 `BEFORE_SHA1`과 같다. 그러니 이 지문은 「바뀐 뒤 값을 박아 둔 것」이 아니고, 실제 옛 표와 맞는다.
  - 모든 행의 id가 `seedIdOf(nameEn)`과 같고, nameEn 중복은 0이다. 그래서 기기 top-up이 만드는 id와 서버 id가 갈라지지 않는다.
  - 0021 SQL: 586행, name_ko 중복 0. 0014 대비 바뀐 기존 행은 별칭을 더한 7행뿐이고 이름은 하나도 안 바뀐다(임시 이름 단계가 아무 행도 건드리지 않음). 빠진 id도 0이다.
  - 새 원형과 의심 매핑 7개를 SVG로 그려 눈으로 확인했다(스크래치).
- 판정: **승인 — 단, M 3건은 배포 전에 조치하거나 결정을 스펙에 남긴다.** H는 없다.

## 참여 전문가
| 역할 | 전문 분야 | 관점 |
|---|---|---|
| 카탈로그 데이터·마이그레이션 리뷰어 | master/families CSV, 생성기·무결성, 생성 SQL, 기록 이관 규칙, 픽토그램 원형 | 생성기·무결성이 못 잡는 의미 오류, 운영 DB 멱등 적용, 기존 기록 버킷 |
| 프런트엔드·오프라인 동기 리뷰어 | 기기 시드 top-up/refresh, catalogSync 페이지, 피커·검색·별칭 표시 이름, e2e | 부팅·동기 경로에서 깨지는 곳, 테스트가 정말 의도를 지키는가 |

## 요약
| 등급 | 개수 |
|---|---|
| H | 0 |
| M | 3 |
| L | 9 |

## 스펙 검토 조치 확인
| 항목 | 확인 |
|---|---|
| H-1 family×기구 유일 | 맞다 — `catalogGapOpengym.test.ts:177-187`이 `buildCatalogIndex` 형제 맵을 직접 단언한다 |
| H-2 별칭 전환 | 6종목이 빠졌고 기존 7행에는 별칭만 붙었다. 지문 테스트로 강제된다. 다만 「인클라인 클로즈그립」은 그립 칸이 함축되지 않는다 → **M-1** |
| M-4 랜드마인·풀 스루·45도 분리 | 맞다(각자 family) |
| M-5 원형 3개 | `back_lever`·`tibialis_raise`·`vacuum`을 그려 보니 의도대로다. 그런데 같은 종류의 오류가 다른 4개 family에 남아 있다 → **M-2** |
| M-6 표·커밋 분리 | 맞다. appUpdate는 별도 커밋이고 마이그레이션 파일도 하나뿐이다 |
| M-7 검색 표 | 14건이 통과한다. `triceps press` 별칭은 삭제됐다 |
| L-2·L-4·L-5·L-6·L-8·L-9 | 반영됐다 |
| L-10 2페이지 | 수동으로만 확인했다. 요청한 자동 단언은 없다 → **L-5** |

---

## H — 없음

---

## M — 배포 전에 조치하거나 스펙에 결정을 남긴다

### M-1. 「인클라인 클로즈그립 벤치프레스」 별칭이 그립 칸을 함축하지 않는다 — 기록 버킷과 표시 이름이 서로 다르게 된다
- 근거
  - `core/src/data/catalog/catalog.master.csv:3`: 「인클라인 클로즈그립 벤치프레스·인클라인 클로즈 벤치·incline close grip bench press」를 `Incline Press`의 **일반 별칭**으로만 달았다. 스펙 §2.5는 이것을 「인클라인 프레스 + 그립 칸」으로 처리한다고 적었다.
  - 별칭이 축을 함축하는 경로는 하나뿐이다. **보관(merge) 행의 `implied_axes`** 다(`core/src/data/exerciseNames.ts:126-133` — `isArchived && mergeInto && impliedAxes`인 행만 표에 올린다). 선례도 있다. `catalog.master.csv:29` 「클로즈그립 풀다운」은 merge 행이고 `grip=close`를 갖는다.
  - 그 결과, 사용자가 피커에서 「인클라인 클로즈그립 벤치프레스」를 정확히 쳐서 고르면 두 가지가 생긴다.
    - `exerciseNames.ts:119`: 바벨 인클라인 프레스의 **표시 이름이 이 별칭으로 바뀐다**. 이 표시 이름은 그 종목의 모든 기록에 적용된다.
    - 그립 칸은 비어 있다. 그래서 클로즈그립 세트가 일반 그립 버킷(`exerciseId::variantKey`)에 섞이고, PR과 지난 무게 프리필도 일반 그립 것과 섞인다.
- 수정안(둘 중 하나)
  - (a) 선례대로 merge 행을 하나 추가한다. `merge,Incline Close Grip Bench Press,인클라인 클로즈그립 벤치프레스,…,merge_into=Incline Press,implied_axes=grip=close`이고, 별칭은 대상 행에 그대로 둔다. 보관 행이 하나 늘어난다(587행 · 활성 575). 그러면 `catalogRevamp.test.ts:90-91`과 `catalogGapOpengym.test.ts`의 ADDED/지문 범위도 고치고 `make catalog`로 SQL을 다시 만든다.
  - (b) 이 별칭 3개를 빼고, 그립 칩으로 고르라고 스펙에 적는다.
  - 단위 테스트를 하나 추가한다: `impliedAxesForAlias('seed-incline-press','인클라인 클로즈그립 벤치프레스')` → `{grip:'close'}`.

### M-2. 새 원형 매핑 4개가 반대 동작이나 다른 자세를 그린다 — 스펙 검토 M-5와 같은 종류의 오류
직접 렌더해서 확인했다(end 프레임).

| family(종목 수) | 매핑 `core/src/data/pictograms/render.ts` | 그려지는 것 | 실제 동작 |
|---|---|---|---|
| `crab_walk`(1) | `:345` → `bear_crawl` | 엎드려 네발 기기 | **바로 누운 채**(배가 위로) 손발로 걷기 — 방향이 반대 |
| `butt_kick`(1) | `:346` → `high_knees` | 무릎을 **앞으로** 든다 | 뒤꿈치를 **엉덩이 쪽 뒤로** 찬다 — 방향이 반대 |
| `standing_knee_to_elbow`(1) | `:368` → `bicycle` | **누워서** 하는 바이시클 크런치 | **서서** 무릎을 팔꿈치에 붙인다 |
| `kneeling_hip_thrust`(3) | `:332` → `pull_through` | **선** 자세(풀 스루 끝) | **무릎 꿇고** 엉덩이를 민다 |

- 수정안: 이번 M-5처럼 전용 원형을 단다.
  - crab_walk: `bear_crawl`의 몸통을 뒤집는다(t를 반대로, 손은 엉덩이 뒤).
  - butt_kick: `stand` + 한쪽 무릎을 뒤로 접는다(`l2: [90, -60, 0]` 계열).
  - standing_knee_to_elbow: `stand` + 반대쪽 무릎 들기와 몸통 비틀기.
  - kneeling_hip_thrust: `knee_push_up`의 하체를 써서 무릎 꿇고 엉덩이를 접었다 편다.
  - 이번에 원형을 그릴 수 없으면 해당 6종목을 `media=none`으로 바꾸고, pictograms 테스트에 예외 목록을 둔다.
  - 덧붙여 `reverse_plank: 'plank'`(`:254`, 기존 매핑)도 같은 문제가 있다. 바로 누운 원형을 하나 만들면 crab_walk와 함께 해결된다.

### M-3. e2e 「그림과 함께」 단언이 공허하다 — 픽토그램이 없어도 통과한다
- 근거: `frontend/e2e/catalog-gap.spec.ts:22` `expect(sld.locator("svg").first()).toBeVisible()`. 피커 행에서 픽토그램이 없으면 `Icon name="barbell-outline"`으로 폴백한다(`frontend/app/components/ExercisePickerScreen.tsx:475-482`). 이 Icon은 react-icons라서 svg를 낸다. 그래서 `hasPictogram`이 false가 되거나 FAMILY_ARCH 매핑이 빠져도 이 단언은 녹색이다.
- 수정안: `await expect(sld.locator("[data-picto]")).toBeVisible()`로 바꾼다. 픽토그램만 `data-picto`를 단다(`frontend/app/components/Pictogram.tsx:107`). 새 원형도 지키려면 같은 단언을 `pick-seed-tibialis-raise`·`pick-seed-stomach-vacuum`·`pick-seed-back-lever`에도 건다.

---

## L — 다음에 하거나 기록만

| # | 내용 | 근거 | 수정안 |
|---|---|---|---|
| L-1 | 떼어 낸 `behind_neck_pulldown`이 랫풀다운 축을 그대로 복사했다. V·뉴트럴 바·싱글·mag_close 부착물과 neutral·under 그립은 비하인드 넥에서 성립하지 않는다(그립 칩은 기구와 상관없이 늘 보인다 — `RecordSlotSelector.tsx:146`) | `catalog.families.csv:23` vs `:162` | attachments `lat_bar;straight` · grips `wide;close` 정도로 줄인다 |
| L-2 | 닐링 레그 컬의 보조근이 calves다. 다른 레그 컬 3종은 보조근이 비어 있어서, 근육 지도에서 이 종목만 종아리를 칠한다 | `catalog.master.csv:539` | secondary를 비운다 |
| L-3 | 티비알리스 레이즈: 스펙 검토 L-2에서 패턴은 뺐지만 `similar=calf_raise`라서 「비슷한 운동」에 반대 동작(카프 레이즈)이 뜬다. 스무고개도 「종아리/서서」에 있다 | `catalog.master.csv:546` · `exerciseFinder.ts:54` | similar를 비우거나, 의도라면 스펙에 적는다 |
| L-4 | 「L-싯 풀업」·「행잉 오블리크 니 레이즈」·「비하인드 백 슈러그」 같은 **변형을 뜻하는** 한글 별칭을 정확히 쳐서 고르면, 그 종목의 표시 이름이 사용자의 모든 기록에 그 별칭으로 바뀐다 | `exerciseNames.ts:119` | 기존 설계(「와이드 풀업」 선례)와 같으니 허용한다. 다만 스펙 §2.5에 「별칭 = 사용자 표시 이름이 될 수 있음」을 명시한다 |
| L-5 | catalog-gap e2e는 서버 경로를 증명하지 못한다. 부팅 top-up(`seedRunner.ts:60-72`)이 번들에서 106행을 만들기 때문에, 0021이 적용되지 않았거나 2페이지(`catalogSync.ts:81-87`)가 실패해도 통과한다. 스펙 검토 L-10이 요청한 자동 단언은 수동 확인으로 대체됐다 | `catalog-gap.spec.ts:6-9` | `page.on('request')`로 `PullCatalog`를 세어 2회 이상(첫 1건 + 500 + 나머지)인지 보고, 응답 본문에 `seed-stomach-vacuum`이 있는지 단언한다. 아니면 `localStorage['liftgram.catalog.revision']`이 `586:`으로 시작하는지 본다 |
| L-6 | 「세트가 저장된다」인데 `aria-pressed`만 본다. 새로고침 뒤 값이 남는지는 확인하지 않는다 | `catalog-gap.spec.ts:31-33` | reload → `set-reps` 값이 `12`인지 단언한다(채우기 e2e는 기본값과 다른 값으로 시작한다는 메모리 교훈에 따라 12 유지) |
| L-7 | top-up의 `haveEn`에 커스텀 행까지 들어간다. 가져오기로 만든 `cx-*` 커스텀의 nameEn이 새 시드 nameEn(예: Single Leg Deadlift)과 같으면, 오프라인 기기에는 그 시드가 생기지 않는다. 온라인이 되면 catalogSync가 id로 채운다 | `seedRunner.ts:62-65` | 기존 동작이다. 기록만 하고, 다음에 `is_custom=false`로 거른다 |
| L-8 | 이관 규칙 2·3의 dry-run(774블록 · 0건)은 서버 `sync_records`만 봤다. 비로그인 기기나 아직 동기하지 않은 로컬 블록은 부팅 정규화 때 새 형제로 옮겨질 수 있다. 옮겨지는 방향(덤벨 런지+맨몸 → 맨몸 런지, 핵 스쿼트+스미스 → 스미스 핵 스쿼트, 덤벨 인클라인 플라이+브랜드 → 머신 인클라인 플라이)은 의미상 맞다 | `catalogMigrationPlan.ts:138,155` | 기록만 |
| L-9 | 새 행 34개는 similar에 **자기 family**를 넣었다(기존 480행은 0건). `similarFor`가 같은 family를 이미 넣고 중복을 걸러 내므로 동작에는 영향이 없다. 하지만 「떼어 낸 family는 similar 첫 칸 = 원래 family」라는 스펙 규칙을 눈으로 검토하기 어려워진다. 또 배포 직전에는 서버에 이름이 겹치는 커스텀이 없는지 다시 본다 — `INSERT … ON CONFLICT (id)`는 name_ko UNIQUE 충돌을 피하지 못해서, 커스텀 행이 하나만 겹쳐도 0021 전체가 실패한다(`CreateCustom` RPC가 살아 있다) | `exerciseSearch.ts:224` · `0021_…sql:612-627` · `backend/internal/exercise/repo.go` CreateCustom | 자기 family 참조는 빼거나 그대로 둔다. 배포 직전 `SELECT name_ko FROM exercises WHERE is_custom AND name_ko = ANY($새 106 이름)` → 0건을 확인한다 |

---

## 운영 영향 점검(중점 2)
| 경로 | 결과 |
|---|---|
| 0021 멱등 | 0014와 같은 2단계 구조다(임시 이름 → 바뀐 행만 upsert). 이름이 바뀌는 행이 0이라 1단계는 아무것도 하지 않는다. 별칭이 바뀐 7행만 `updated_at`이 오르고, 106행은 INSERT된다. 다시 돌려도 달라지는 것이 없다. `ON COMMIT DROP` 임시 표는 0014와 같은 방식이다(운영에서 이미 검증됨) |
| name_ko UNIQUE | SQL 586행 사이에 겹침이 없다. 서버 커스텀과 겹치면 실패한다(L-9 — 직전 재확인) |
| 개정 번호 | `count + max(updated_at)`이라 행 수(586)와 시각이 모두 바뀐다. 기존 기기는 한 번 전량을 받는다 |
| 500 페이지 경계 | 커서 = 마지막 `name_ko`, 다음 페이지 = `name_ko >`. 이름이 유일하고 정렬 기준이 같은 쿼리라서 빠지거나 겹치는 행이 없다(`service.go:243-260`). 첫 페이지 501건을 받으면 nextCursor를 둔다. 실패하면 개정을 저장하지 않고 다음에 다시 받는다. 화면은 번들 top-up으로 유지된다 |
| 기기 top-up / refresh | 새 id = `seedIdOf(nameEn)`로 서버와 같다. refresh는 판 해시가 바뀐 뒤 한 번만 돌며 7행 별칭을 맞춘다. 커스텀 행은 건드리지 않는다 |
| nameKo 키 데이터(미디어·대체) | 새 이름 106개가 `core/src/data/*.ts`의 nameKo 키와 겹치지 않는다. 사진이 잘못 붙지 않는다 |

## appUpdate.ts(중점 4)
`setWaiting`(`:165`)과 `onControllerChange`(`:247`)는 둘 다 `void`를 반환한다. 그래서 `return f();`를 `f(); return;`으로 바꿔도 동작이 같다. **동작 변경 없음.**

---

## 조치 (2026-10-30 · 구현 세션)
| 항목 | 조치 |
|---|---|
| M-1 | 통합(보관) 행 `Barbell Incline Close Grip Bench Press`(옛 이름 「인클라인 클로즈그립 벤치프레스」 → 인클라인 프레스 · implied `grip=close`) 추가 — 「클로즈그립 풀다운」 선례. 함축이 없는 별칭 「인클라인 클로즈 벤치」는 뺐다. 테스트로 보관·대상·함축·옛 이름 = 대상 별칭을 단언 |
| M-2 | 전용 원형 4개 추가(crab_walk · butt_kick · standing_knee_to_elbow · kneeling_hip_thrust) — 그려서 눈으로 확인(크랩 워크는 손이 바닥에 닿게 두 번 조정) |
| M-3 | `[data-picto]` 로 단언 |
| L-1 | behind_neck_pulldown 축 = 부착물 lat_bar;straight · 그립 wide;close |
| L-2 | 닐링 레그 컬 보조근 비움 |
| L-3 | 티비알리스 레이즈 similar 비움 |
| L-5 | e2e: 기기 카탈로그 판 `587:` · PullCatalog 3회 이상 · 응답에 새 종목 |
| L-6 | e2e: 새로고침 뒤 반복 수 12 유지 |
| L-9 | 배포 직전 서버 `exercises` 이름 겹침 재조회(배포 절차에 넣음) |
| 기록만 | L-4(변형 뜻 별칭이 표시 이름이 됨 — 기존 설계) · L-7 · L-8 |
