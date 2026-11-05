# SPEC-028 — 특이 종목 46개 추가 — 동작이 다른 종목 보강

> 타입 Spec · 그룹 할일/특이-종목-보강 · ADStudio가 `SPEC-028.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-094

### 목표

오버헤드 슈러그처럼 동작 자체가 달라 변형 칸으로 표현할 수 없는 종목 46개를 별도 종목으로 추가한다(사용자 결정 2026-11-05, 4-가). 기존 동작에 기구만 더하는 행은 넣지 않는다. 새 동작은 카탈로그에 없으므로 그 동작의 기구판(바벨·덤벨)은 함께 넣는다.

### 범위

- `src/core/src/data/catalog/catalog.master.csv` — 46행 덧붙임, 기존 3행 별칭 추가
- `src/core/src/data/catalog/catalog.families.csv` — 새 family 42개. 기존 family는 넓히지 않는다
- `src/core/src/data/pictograms/render.ts` · `src/core/src/data/pictograms/poses.ts` — 원형 연결, 새 원형
- `src/core/src/domain/exerciseFinder.ts` · `src/core/src/domain/movementPatterns.ts` — 스무고개·패턴. 위험 종목은 패턴을 비운다
- `src/core/src/domain/exerciseCautions.ts` · `src/frontend/app/exercise/[id]/page.tsx` · `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` — 주의 문구
- `src/core/src/domain/__tests__/catalogRareMoves.test.ts` · `src/core/src/domain/__tests__/catalogGapOpengym.test.ts` · `src/core/src/domain/__tests__/catalogRevamp.test.ts` · `src/frontend/e2e/catalog-gap.spec.ts` — 시험
- 생성물 — `src/core/src/data/catalog/catalog.generated.ts` · `src/core/src/data/catalog/catalogRevision.ts` · `src/database/migrations/0023_catalog_rev_d991018a0c.sql`
- `src/frontend/package.json` — 배포 때 버전

### 설계

- 새 행은 master 끝에 status=new, media=gen으로 덧붙인다. 스키마 변경은 없다.
- family 축(그립·부착물·적재)은 모두 비운다. 머신 종목이 없으므로 적재 축도 필요 없다.
- 같은 동작의 다른 이름은 별칭으로 넣는다: 켈소 슈러그(덤벨 인클라인 슈러그) · 헬름스 로우(덤벨 체스트 서포티드 로우) · 좀비 스쿼트(바벨 프론트 스쿼트).
- 어깨·척추 가동범위를 많이 쓰거나 숙련이 필요한 12종목은 상세 화면에 주의 한 줄을 둔다. 위험이라 단정하지 않고 조건으로 쓴다.
- 그림은 렌더해 확인한다. 기준은 반대 동작이나 다른 자세가 없을 것이다(보드·블록 같은 소품까지 그리지는 않는다).

#### 추가 종목

| 이름 | 기구 | 주동근 | family | 원형 | 출처 |
| --- | --- | --- | --- | --- | --- |
| 바벨 오버헤드 슈러그 | barbell | traps | overhead_shrug | overhead_shrug | 오픈짐 C |
| 덤벨 오버헤드 슈러그 | dumbbell | traps | overhead_shrug | overhead_shrug | 추가 대조 |
| 바벨 보드 프레스 | barbell | chest | board_press | bench_press | 오픈짐 C |
| 바벨 기요틴 프레스 | barbell | chest | guillotine_press | bench_press | 오픈짐 C |
| 바벨 스포토 프레스 | barbell | chest | spoto_press | bench_press | 추가 대조 |
| 플란체 푸시업 | bodyweight | chest | full_planche_push_up | planche_push_up | 오픈짐 C |
| 코리안 딥스 | bodyweight | chest | korean_dip | korean_dip | 오픈짐 C |
| 스핑크스 푸시업 | bodyweight | triceps | sphinx_push_up | sphinx_push_up | 추가 대조 |
| 비하인드 넥 풀업 | bodyweight | back | behind_neck_pull_up | pull_up | 오픈짐 C |
| 커맨도 풀업 | bodyweight | back | commando_pull_up | pull_up | 추가 대조 |
| 타이프라이터 풀업 | bodyweight | back | typewriter_pull_up | pull_up | 추가 대조 |
| 덤벨 루 레이즈 | dumbbell | shoulders | lu_raise | lu_raise | 오픈짐 C |
| 바벨 브래드포드 프레스 | barbell | shoulders | bradford_press | overhead_press | 오픈짐 C |
| 플란체 | bodyweight | shoulders | planche | planche | 오픈짐 C |
| 케이블 리닝 레터럴 레이즈 | cable | shoulders | leaning_lateral_raise | leaning_lateral_raise | 추가 대조 |
| 덤벨 리닝 레터럴 레이즈 | dumbbell | shoulders | leaning_lateral_raise | leaning_lateral_raise | 추가 대조 |
| 덤벨 스캡션 | dumbbell | shoulders | scaption | front_raise | 추가 대조 |
| 덤벨 W 레이즈 | dumbbell | shoulders | w_raise | w_raise | 추가 대조 |
| 바이킹 프레스 | barbell | shoulders | viking_press | landmine_press | 추가 대조 |
| 케틀벨 바텀업 프레스 | kettlebell | shoulders | bottoms_up_press | overhead_press | 추가 대조 |
| 바벨 소츠 프레스 | barbell | shoulders | sots_press | sots_press | 추가 대조 |
| 플레이트 버스 드라이버 | other | shoulders | bus_driver | plate_raise | 추가 대조 |
| 케이블 라잉 컬 | cable | biceps | cable_lying_curl | cable_lying_curl | 오픈짐 C |
| 케이블 크로스 트라이셉스 익스텐션 | cable | triceps | cable_cross_triceps_extension | pushdown | 오픈짐 C |
| EZ바 디클라인 스컬크러셔 | ezbar | triceps | decline_skull_crusher | skull_crusher | 오픈짐 C |
| 스패니시 스쿼트 | band | quads | spanish_squat | spanish_squat | 추가 대조 |
| 바벨 앤더슨 스쿼트 | barbell | quads | anderson_squat | squat | 추가 대조 |
| 햇필드 스쿼트 | other | quads | hatfield_squat | hatfield_squat | 추가 대조 |
| 스텝다운 | bodyweight | quads | step_down | step_down | 추가 대조 |
| 폴리퀸 스텝업 | bodyweight | quads | poliquin_step_up | step_up | 추가 대조 |
| 바벨 제퍼슨 컬 | barbell | back | jefferson_curl | jefferson_curl | 추가 대조 |
| 덤벨 제퍼슨 컬 | dumbbell | back | jefferson_curl | jefferson_curl | 추가 대조 |
| 싱글 레그 힙 쓰러스트 | bodyweight | glutes | single_leg_hip_thrust | hip_thrust | 추가 대조 |
| 덤벨 싱글 레그 힙 쓰러스트 | dumbbell | glutes | single_leg_hip_thrust | hip_thrust | 추가 대조 |
| 사이드 플랭크 크런치 | bodyweight | abs | side_plank_crunch | side_plank | 오픈짐 C |
| 케틀벨 벤트 프레스 | kettlebell | shoulders | bent_press | windmill | 오픈짐 C |
| 케틀벨 피겨 8 | kettlebell | abs | figure_8 | figure_8 | 오픈짐 C |
| 휴먼 플래그 | bodyweight | abs | human_flag | human_flag | 오픈짐 C |
| 바벨 머슬 클린 | barbell | fullBody | muscle_clean | clean | 오픈짐 C |
| 바벨 머슬 스내치 | barbell | fullBody | muscle_snatch | muscle_snatch | 오픈짐 C |
| 바벨 블록 클린 | barbell | fullBody | block_clean | clean | 오픈짐 C |
| 바벨 블록 스내치 | barbell | fullBody | block_snatch | snatch | 오픈짐 C |
| 바벨 클러스터 | barbell | fullBody | cluster | thruster | 오픈짐 C |
| 요크 워크 | other | fullBody | yoke_walk | yoke_walk | 추가 대조 |
| 덤벨 맨 메이커 | dumbbell | fullBody | man_maker | man_maker | 추가 대조 |
| 핸드 그리퍼 | other | forearms | hand_gripper | hand_gripper | 추가 대조 |

### 작업 단계

- [x] master·families 반영, `make catalog`
- [x] 원형 연결·렌더 확인, 새 원형 추가
- [x] 스무고개·패턴·주의 문구
- [x] 단위 시험·e2e 갱신, `make verify`

### 수용 기준

- SRS-094: 46종목이 활성 근력 종목이고 「오버헤드 슈러그」 검색의 첫 결과가 바벨 오버헤드 슈러그다.
- 이름·별칭이 활성 종목끼리 겹치지 않고 family×기구가 유일하다.
- 기존 587행은 별칭 추가 외에 그대로다.
- 벤치프레스·슈러그·풀업·스쿼트·데드리프트·레터럴 레이즈·트위스트·핀의 첫 결과가 그대로다. 오버헤드·플래그·비하인드는 새 종목이 첫 결과가 될 수 있다(허용).
- 주의 대상 종목 상세에 주의 한 줄이 나온다.

### 테스트 계획

- `src/core/src/domain/__tests__/catalogRareMoves.test.ts`
- `make verify`
- `src/frontend/e2e/catalog-gap.spec.ts`
- 배포 직전 서버 이름 겹침 조회

### 위험·주의

- `make catalog`는 내용이 바뀔 때마다 새 번호 파일을 만든다. 커밋 전 미커밋 `*_catalog_rev_*` 파일을 지우고 마지막에 한 번만 만든다.
- 서버 사용자 커스텀 이름이 새 이름과 겹치면 표시가 두 줄이 된다. 배포 직전 다시 조회한다.
- 잠자는 프로그램 생성기는 새 고급 종목을 고를 수 있다. 입구가 닫혀 지금은 도달할 수 없고, 되살릴 때 제외 목록이 필요하다.
- 새 종목의 대체 운동은 큐레이션하지 않는다.
