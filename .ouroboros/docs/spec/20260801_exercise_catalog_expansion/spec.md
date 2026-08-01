# 운동 카탈로그 대확장 — 타 앱 77장 스크린샷 전수 통합 (Feature)

- **등급**: Feature (assess_complexity 점수 6 — 파일 ~8, 구조 변경 없음, 대용량 데이터 통합)
- **추적(implements)**: SRS-001(운동 카탈로그), SRS-047(카탈로그 갭 보강·무브먼트 패턴), SRS-032(종목 미디어), SRS-031(종목 찾기 도우미)
- **작성**: 2026-08-01 · 근거 데이터 = 이 디렉토리의 `inventory_raw.json`(472행 추출 원본) · `_disposition_skip.tsv`(스킵 판정 전수) · `gap_*.txt`(자동 매칭)

## 목표

사용자 제공 타 앱 운동 목록 스크린샷 77장(≈472행, 중복 제거 446 종목)을 전수 분석하여, 현행 카탈로그(183종)에 없는 운동을 **모두** 앱의 분류·변형 체계에 맞게 추가하고, 운동방법(한국어 스텝)·미디어(free-exercise-db) 리소스를 통합한다.

**수치 요약** (스펙 시점 분석 완료 · qa 리뷰 반영 확정치):
| 구분 | 수 |
|---|---|
| 추출 원본 행 | 472 (에이전트 11·오류 0) |
| 고유 종목 | 446 |
| 현행 시드 실물 | **183종** (exercises.seed.ts nameKo 정본 — 매칭 기준 집합) |
| 자동 매칭(기보유) | 127 (`gap_matched.txt` 101 + `gap_matched2.txt` 26) |
| 수동 판정 | 319 (`gap_still.txt`) → 스킵/흡수/제외 166 + **신규 153** |
| 최종 카탈로그 | 183 → **336종** (Phase 1 테스트에 총수 하한 `>=336` assert) |

## 판정 원칙 (분류·변형 체계 정합 — 위반 시 무결성 테스트가 잡도록 확장)

1. **기존 nameKo = KEY, rename 절대 금지** — nameKo는 media·finder·substitutes·movementPatterns의 조회 키. 추가만 한다.
2. **신규 종목 = 대표 기구 1엔트리 + 기구 변형 축 흡수**가 기본. 예외(별도 엔트리)는 기존 선례가 괄호/기구별 엔트리인 계열의 확장: 힙 쓰러스트 (덤벨), 슈러그 (머신). 리버스 컬 (덤벨/케이블)은 **이번에 신설하는 괄호 계열**(기존 '리버스 바벨 컬'은 비괄호·KEY 불변 — 폴백으로 안 묶임을 인지하고 발급).
3. **세트 속성으로 흡수 → 별도 엔트리 금지**: `(중량)`/`(어시스트)` → loadMode · `싱글 암/레그` → uni(원암·원레그) 세트 속성 · `넓은/좁은/리버스 그립` → 그립 세트 속성 · `파셜` → partialReps. **예외**: 편측·네거티브라도 **독립 스킬로 통용되는 칼리스데닉스 종목**(원암 푸시업·피스톨 스쿼트·네거티브 풀업)은 별도 엔트리 — 난이도 자체가 종목 정체성인 경우.
   - `(중량)` 흡수에 loadMode 백필은 불필요 — resolveLoadMode가 equipment 'bodyweight'에서 자동 파생(하이퍼익스텐션·시시 스쿼트·푸시업 모두 해당, 검증 완료).
4. **변형 축(IMPLEMENT_KEYS)에 `band` 추가** — 스크린샷의 (밴드) 변형 다수를 축으로 흡수(variants.ts 1파일 2곳: IMPLEMENT_KEYS + IMPLEMENT_LABELS — 라벨 누락 시 원시 키 노출되므로 'KEYS 전건이 LABELS에 존재' 테스트 1줄 추가). 서스펜션(TRX)은 축 미추가 — 해당 행 스킵(사유 기재). 맨몸은 축이 아님 — 맨몸 수행은 기본 버킷에 무게 0으로 기록.
5. **nameEn은 결정적 seedId(`seed-<slug>`) 충돌 금지** — 기존·신규 전체에서 소문자-슬러그 유일성을 테스트로 강제(신규). ⚠ 기존 nameEn과의 완전 충돌도 검사 대상(사례: '파워 클린'은 기존 '바벨 클린'의 nameEn이 이미 'Power Clean'이라 신규 발급 불가 — 스킵 재판정됨. nameEn 충돌 시 top-up 미생성 + syncSeedNames가 기존 nameKo를 자동 rename해 KEY 계약 파괴).
6. muscle 라벨 매핑: 목→other · 허리→back · 외전근/내전근→glutes · 트랩→traps · 팔뚝→forearms · 심장강화운동→`kind:'cardio'`. **넥 결정**: MuscleGroup 'neck' 확장은 하지 않음(필터 UI 전면 영향 — other 유지 확정). 시드 230행의 "타입 확장 별도 결정" 주석을 이 결정으로 갱신.
7. 운동방법 카피는 의료 단정 금지(`containsMedicalClaim` 게이트 정신) — 지시문·팁 톤 유지, 치료·교정 효능 단정 문구 금지.

## 신규 추가 종목 (153종 — Phase 1 시드 정본)

표 규칙: `loadMode` 공란=기구 파생, `패턴` 공란=매핑 제외(자유 종목), 유산소는 `kind:cardio`. 괄호 신규 엔트리(힙 쓰러스트 (덤벨)·슈러그 (머신) 등)는 베이스명 폴백으로 기존 패턴에 자동 도달 — movementPatterns 매핑 추가 불요.
섹션 합계: 13+15+11+8+11+18+16+23+18+5+15 = **153**.

### 가슴 (13)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 디클라인 푸시업 | Decline Push Up | chest | bodyweight | 패턴 horizontalPress |
| 클랩 푸시업 | Clap Push Up | chest | bodyweight | 〃 |
| 닐링 푸시업 | Kneeling Push Up | chest | bodyweight | 〃 |
| 원암 푸시업 | One Arm Push Up | chest | bodyweight | 〃 |
| 플랭크 푸시업 | Plank Push Up | chest | bodyweight | 〃 (업다운 플랭크) |
| 링 푸시업 | Ring Push Up | chest | other | 〃 |
| 플로어 프레스 | Floor Press | chest | barbell | 〃 · 덤벨=변형 축 |
| 덤벨 스퀴즈 프레스 | Dumbbell Squeeze Press | chest | dumbbell | 〃 (=헥스 프레스 통합) |
| 스벤드 프레스 | Svend Press | chest | other | 〃 (=플레이트 프레스 통합) |
| 디클라인 덤벨 플라이 | Decline Dumbbell Fly | chest | dumbbell | 패턴 fly |
| 시티드 케이블 플라이 | Seated Cable Fly | chest | cable | 〃 |
| 덤벨 어라운드 더 월드 | Dumbbell Around the World | chest | dumbbell | 〃 |
| 링 딥스 | Ring Dip | chest | other | 패턴 horizontalPress (qa 리뷰 — TSV 판정분 표 복원) |

### 등 (15)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 랜드마인 로우 | Landmine Row | back | barbell | horizontalPull |
| 메도우스 로우 | Meadows Row | back | barbell | 〃 |
| 씰 로우 | Seal Row | back | barbell | 〃 · 덤벨=변형 축 |
| 고릴라 로우 | Gorilla Row | back | kettlebell | 〃 |
| 레니게이드 로우 | Renegade Row | back | dumbbell | 〃 |
| 풀오버 머신 | Machine Pullover | back | machine | verticalPull |
| 네거티브 풀업 | Negative Pull Up | back | bodyweight | 〃 · loadMode:assisted 아님(맨몸) |
| 스캐퓰러 풀업 | Scapular Pull Up | back | bodyweight | 〃 |
| 키핑 풀업 | Kipping Pull Up | back | bodyweight | 〃 |
| 스터넘 풀업 | Sternum Pull Up | back | bodyweight | 〃 |
| 머슬업 | Muscle Up | back | bodyweight | 〃 secondary fullBody |
| 링 풀업 | Ring Pull Up | back | other | 〃 |
| 데드 행 | Dead Hang | back | bodyweight | 시간 위주 — kind strength 유지, 미디어 스텝에 명시 |
| 백 익스텐션 머신 | Back Extension Machine | back | machine | hinge |
| 슈퍼맨 | Superman | back | bodyweight | core |

### 어깨 (11 — 숄더 탭은 primary abs지만 발급 편의상 이 표에 유지)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 파이크 푸시업 | Pike Push Up | shoulders | bodyweight | verticalPress |
| 핸드스탠드 푸시업 | Handstand Push Up | shoulders | bodyweight | 〃 |
| 핸드스탠드 홀드 | Handstand Hold | shoulders | bodyweight | 〃 (물구나무 서기) |
| 푸시 프레스 | Push Press | shoulders | barbell | 〃 |
| 밴드 풀 어파트 | Band Pull Apart | shoulders | band | fly(리어) |
| 케이블 Y 레이즈 | Cable Y Raise | shoulders | cable | lateralRaise |
| 체스트 서포티드 Y 레이즈 | Chest Supported Y Raise | shoulders | dumbbell | 〃 |
| 프론트 레이즈 (플레이트) | Plate Front Raise | shoulders | other | 〃 · 기존 (덤벨)/(케이블)/(바벨) 계열 확장 |
| 오버헤드 플레이트 레이즈 | Overhead Plate Raise | shoulders | other | 〃 |
| 숄더 탭 | Shoulder Taps | abs | bodyweight | core · secondary shoulders (플랭크 계열 — qa 리뷰, 부위 브라우징 정합) |
| 케틀벨 헤일로 | Kettlebell Halo | shoulders | kettlebell | — |

### 이두 (8)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 드래그 컬 | Drag Curl | biceps | barbell | curl |
| 조트맨 컬 | Zottman Curl | biceps | dumbbell | 〃 |
| 크로스 바디 해머 컬 | Cross Body Hammer Curl | biceps | dumbbell | 〃 (=핀휠 컬 통합) |
| 웨이터 컬 | Waiter Curl | biceps | dumbbell | 〃 |
| 21 컬 | Bicep Curl 21s | biceps | barbell | 〃 |
| 오버헤드 케이블 컬 | Overhead Cable Curl | biceps | cable | 〃 |
| 비하인드 백 케이블 컬 | Behind the Back Cable Curl | biceps | cable | 〃 |
| 플레이트 컬 | Plate Curl | biceps | other | 〃 |

### 삼두 (3) · 전완 (4) · 승모 (2) · 목 (2)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 리버스 그립 푸시다운 | Reverse Grip Pushdown | triceps | cable | extension · 원칙 3 예외 아님 — 별도 유지 사유: 타 앱·국내 통용 모두 독립 종목 취급(집행 시 흡수 재판정 허용) |
| 트라이셉스 익스텐션 머신 | Triceps Extension Machine | triceps | machine | 〃 |
| 와이드 엘보 트라이셉스 프레스 | Wide-Elbow Triceps Press | triceps | dumbbell | 〃 |
| 리스트 롤러 | Wrist Roller | forearms | other | — |
| 비하인드 백 리스트 컬 | Behind the Back Wrist Curl | forearms | barbell | curl |
| 리버스 컬 (덤벨) | Reverse Curl (Dumbbell) | forearms | dumbbell | curl · secondary biceps — 기존 '리버스 바벨 컬'(forearms)과 부위 통일 (qa 리뷰) |
| 리버스 컬 (케이블) | Reverse Curl (Cable) | forearms | cable | 〃 |
| 슈러그 (머신) | Shrug (Machine) | traps | machine | 기존 (스미스) 괄호 선례 확장 |
| 점프 슈러그 | Jump Shrug | traps | barbell | — |
| 라잉 넥 컬 | Lying Neck Curl | other | bodyweight | loadMode 파생(bodyweight) — 중량 흡수 |
| 라잉 넥 익스텐션 | Lying Neck Extension | other | bodyweight | 〃 |

### 대퇴사두·런지 (18)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 박스 스쿼트 | Box Squat | quads | barbell | squat |
| 포즈 스쿼트 | Pause Squat | quads | barbell | 〃 |
| 오버헤드 스쿼트 | Overhead Squat | quads | barbell | 〃 secondary fullBody |
| 저처 스쿼트 | Zercher Squat | quads | barbell | 〃 |
| 스모 스쿼트 | Sumo Squat | quads | dumbbell | 〃 · 바벨/케틀벨=변형 축, 맨몸=기본 버킷 무게 0(축 아님) |
| 피스톨 스쿼트 | Pistol Squat | quads | bodyweight | 〃 (어시스티드=동일 취급) |
| 월 싯 | Wall Sit | quads | bodyweight | 〃 |
| 점프 스쿼트 | Jump Squat | quads | bodyweight | 〃 |
| 박스 점프 | Box Jump | quads | bodyweight | squat (양발 플라이오 — 점프 스쿼트와 동조, qa 리뷰) |
| 레터럴 박스 점프 | Lateral Box Jump | quads | bodyweight | lungeStep |
| 프로그 점프 | Frog Jump | quads | bodyweight | squat |
| 레터럴 스쿼트 | Lateral Squat | quads | bodyweight | 〃 |
| 리버스 런지 | Reverse Lunge | quads | bodyweight | 〃 · 덤벨/바벨=변형 축 |
| 레터럴 런지 | Lateral Lunge | quads | bodyweight | 〃 |
| 커시 런지 | Curtsy Lunge | quads | bodyweight | 〃 |
| 점프 런지 | Jump Lunge | quads | bodyweight | 〃 |
| 오버헤드 런지 | Overhead Lunge | quads | dumbbell | 〃 |
| 스플릿 스쿼트 | Split Squat | quads | dumbbell | 〃 (불가리안과 별개) |

### 햄스트링·둔근 (16)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 글루트 햄 레이즈 | Glute Ham Raise | hamstrings | machine | — |
| 스탠딩 레그 컬 | Standing Leg Curl | hamstrings | machine | — |
| 케이블 풀 스루 | Cable Pull Through | glutes | cable | hinge |
| 리버스 하이퍼익스텐션 | Reverse Hyperextension | glutes | machine | hinge |
| 데드리프트 하이 풀 | Deadlift High Pull | fullBody | barbell | hinge |
| 힙 쓰러스트 (덤벨) | Hip Thrust (Dumbbell) | glutes | dumbbell | hinge(폴백 자동 — 매핑 추가 불요) · 기존 (바벨)/(머신) 계열 확장 |
| 파이어 하이드런트 | Fire Hydrant | glutes | bodyweight | — |
| 클램셸 | Clamshell | glutes | bodyweight | — |
| 프로그 펌프 | Frog Pump | glutes | dumbbell | — |
| 버드 독 | Bird Dog | glutes | bodyweight | — |
| 글루트 킥백 머신 | Glute Kickback Machine | glutes | machine | 기존 '케이블 킥백'과 별개 |
| 글루트 킥백 | Glute Kickback | glutes | bodyweight | 〃(바닥) |
| 케이블 힙 어브덕션 | Cable Hip Abduction | glutes | cable | — |
| 케이블 힙 어덕션 | Cable Hip Adduction | glutes | cable | — |
| 레터럴 레그 레이즈 | Lateral Leg Raise | glutes | bodyweight | — |
| 레터럴 밴드 워크 | Lateral Band Walk | glutes | band | — |

### 복근 (23)
| nameKo | nameEn | primary | equipment |
|---|---|---|---|
| 데드 버그 | Dead Bug | abs | bodyweight |
| V 싯업 | V Sit Up | abs | bodyweight |
| 할로우 락 | Hollow Rock | abs | bodyweight |
| 플러터 킥 | Flutter Kick | abs | bodyweight |
| 시저 킥 | Scissor Kick | abs | bodyweight |
| 토 터치 | Toe Touch | abs | bodyweight |
| 힐 터치 | Heel Tap | abs | bodyweight |
| 사이드 크런치 | Side Crunch | abs | bodyweight |
| 사이드 벤드 | Side Bend | abs | dumbbell |
| 디클라인 크런치 | Decline Crunch | abs | bodyweight |
| 라잉 니 레이즈 | Lying Knee Raise | abs | bodyweight |
| 행잉 니 레이즈 | Hanging Knee Raise | abs | bodyweight |
| 패러럴 바 니 레이즈 | Parallel Bar Knee Raise | abs | other |
| 패러럴 바 레그 레이즈 | Parallel Bar Leg Raise | abs | other |
| 드래곤 플래그 | Dragon Flag | abs | bodyweight |
| 리버스 플랭크 | Reverse Plank | abs | bodyweight |
| 엘보 투 니 | Elbow to Knee | abs | bodyweight |
| 스파이더맨 플랭크 | Spiderman Plank | abs | bodyweight |
| 팔로프 프레스 | Pallof Press | abs | cable |
| 랜드마인 180 | Landmine 180 | abs | barbell |
| 토즈 투 바 | Toes to Bar | abs | bodyweight |
| L-싯 홀드 | L-Sit Hold | abs | bodyweight |
| 토르소 로테이션 머신 | Torso Rotation Machine | abs | machine |

### 전신·올림픽·컨디셔닝 (18)
| nameKo | nameEn | primary | equipment | 비고 |
|---|---|---|---|---|
| 행 클린 | Hang Clean | fullBody | barbell | ⚠ '파워 클린'은 신규 아님 — 기존 '바벨 클린'(nameEn 'Power Clean')과 동일 종목으로 스킵 재판정(qa 리뷰 3인 일치) |
| 클린 앤 프레스 | Clean and Press | fullBody | barbell | '클린 앤 저크'와 별개 |
| 클린 풀 | Clean Pull | fullBody | barbell | — |
| 파워 스내치 | Power Snatch | fullBody | barbell | — |
| 행 스내치 | Hang Snatch | fullBody | barbell | — |
| 스플릿 저크 | Split Jerk | fullBody | barbell | — |
| 프레스 언더 | Press Under | fullBody | barbell | — |
| 랜드마인 스쿼트 앤 프레스 | Landmine Squat to Press | fullBody | barbell | — |
| 케틀벨 하이 풀 | Kettlebell High Pull | fullBody | kettlebell | — |
| 터키시 겟업 | Turkish Get Up | fullBody | kettlebell | — |
| 케틀벨 어라운드 더 월드 | Kettlebell Around the World | fullBody | kettlebell | — |
| 슬레드 푸시 | Sled Push | fullBody | other | — |
| 슬레드 풀 | Sled Pull | fullBody | other | — |
| 수트케이스 캐리 | Suitcase Carry | fullBody | dumbbell | carry |
| 월 볼 | Wall Ball | fullBody | other | — |
| 메디신 볼 슬램 | Medicine Ball Slam | fullBody | other | — |
| 베어 크롤 | Bear Crawl | fullBody | bodyweight | — |
| 프론트 레버 홀드 | Front Lever Hold | back | bodyweight | 레이즈는 맨몸 표에 단일 기재(이중 기재 정리 — qa 리뷰) |

### 맨몸 컨디셔닝·플라이오 (5)
| nameKo | nameEn | primary | equipment |
|---|---|---|---|
| 버피 브로드 점프 | Burpee Broad Jump | fullBody | bodyweight |
| 버피 오버 더 바 | Burpee Over the Bar | fullBody | bodyweight |
| 점핑 잭 | Jumping Jack | fullBody | bodyweight |
| 하이 니 | High Knees | fullBody | bodyweight |
| 프론트 레버 레이즈 | Front Lever Raise | back | bodyweight |

### 유산소 (15 — 전부 `kind:'cardio'`)

kind 근거: 요가·필라테스·스트레칭은 유산소가 아니나 kind 어휘가 strength|cardio 2종뿐이라 **시간 기록형 활동의 실용 배정**(무게 UI 배제 목적)이다 — Phase 4에서 '유산소' 라벨 노출 화면 표기 검토. 유산소 종목은 **미디어·스텝 작성 제외**(세션 hasTip이 유산소를 차단하는 현행 정책 유지).

| nameKo | nameEn | primary | equipment | 지표(cardioMetricsFor) |
|---|---|---|---|---|
| 수영 | Swimming | fullBody | bodyweight | duration+distance |
| 복싱 | Boxing | fullBody | bodyweight | duration |
| 클라이밍 | Climbing | fullBody | bodyweight | duration |
| 하이킹 | Hiking | fullBody | bodyweight | duration+distance |
| 스프린트 | Sprint | fullBody | bodyweight | duration+distance |
| 야외 사이클 | Outdoor Cycling | quads | other | duration+distance |
| 리컴번트 바이크 | Recumbent Bike | quads | machine | duration+distance |
| 히트 (HIIT) | HIIT | fullBody | bodyweight | duration · nameKo 한글 병기(검색성 — qa 리뷰) |
| 에어로빅 | Aerobics | fullBody | bodyweight | duration |
| 요가 | Yoga | fullBody | bodyweight | duration |
| 필라테스 | Pilates | fullBody | bodyweight | duration |
| 스케이팅 | Skating | quads | other | duration+distance |
| 스키 | Skiing | quads | other | duration+distance |
| 스노우보드 | Snowboarding | quads | other | duration |
| 스트레칭 | Stretching | fullBody | bodyweight | duration |

Phase 1 테스트: 이 15종 `kind==='cardio'` assert(무게 UI 노출 회귀 방지). duration-only 종목은 cardioMetricsFor 보강 필수(기본값이 시간+거리라 복싱·요가 등에 거리 입력이 노출됨 — '필요시'가 아니라 확정 작업).

## 스킵·흡수 판정 (전수는 `_disposition_skip.tsv`)

대표 유형: ① 표기 차이 동일종목(바이셉스 컬 (바벨)=바벨 컬, 벤트 오버 로우=바벨 로우, 락 풀=랙 풀, T 바 로우=티바 로우, 트레드밀=러닝머신, AB 휠=앱 휠 롤아웃, Vertical Traction=랫 풀다운 등) ② 세트 속성 흡수(싱글 암/레그 → uni, 와이드/좁은/리버스 그립 → 그립, (중량)/(어시스트) → loadMode) ③ 변형 축 흡수(기구 괄호 — 밴드 포함) ④ 자세 미세변형 동일 취급(시티드/스탠딩 프레스, 풀 스쿼트, 카프 프레스=레그 프레스 카프 레이즈) ⑤ 비종목(Warm Up) ⑥ 서스펜션(TRX) 계열 — 변형 축 미지원으로 이번 범위 제외(스펙 결정).

## 작업 목록 (Phase — 상세는 phase-N.md)

- **Phase 1 — 시드·변형 축·무결성 기반**: exercises.seed.ts에 신규 153 엔트리 · band 축(KEYS+LABELS) · **substitutes.seed 죽은 키 14·죽은 값 65 선행 정리**(실측 — 현재도 침묵 드롭 중인 실버그) · catalogGap.test 확장 5종(신규 존재·KEY 불변·슬러그 유일(기존 nameEn 완전충돌 포함)·SUBSTITUTES/FINDER_TREE/RAW_MEDIA ⊆ seed·nameKo 유일+총수 하한+cardio 15종 kind) · 시드/러너 헤더 주석 'nameEn 기준' 정정
- **Phase 2 — 분류 통합**: movementPatterns 매핑(**표의 패턴 컬럼 기재분만** — 공란·괄호 폴백 도달분 제외) · exerciseFinder FINDER_TREE 편입 · substitutes.seed 신규 종목 대체목록(각 3~5개)
- **Phase 3 — 운동방법·미디어**: free-exercise-db 매칭(실측 정확일치 ~23%·관대 포함 ~40% — 60~70% 추정 폐기) → **정확일치 외 전건 사람 검수**(매칭쌍 표→승인) + 기구·자세 토큰 불일치 negative 규칙 · 무매칭 ~90종은 스텝만 자체 작성(**steps-only 렌더 경로 신설 필요** — exerciseMedia.ts s/e optional + ExerciseTipPanel 초기 mode='steps') · RAW_MEDIA 전 엔트리 containsMedicalClaim 테스트 · 고위험 종목(핸드스탠드·머슬업·올림픽 리프팅 등) 안전 안내 톤 가이드
- **Phase 4 — 검증·배포**: tsc·전체 테스트 · 브라우저 e2e(신규 종목 검색→루틴 추가→기록, 밴드 변형 축, 유산소 시간 기록, **이미지 없는 종목 스텝 표시**) · '유산소' 라벨 노출 화면 표기 검토 · SemVer minor(v0.14.0) · Netlify draft→restore 배포

## 주의사항 (메모리·코드 분석 근거)

- **[gotcha c8635fe1 · 0.72]** 변형 버킷 축은 기구 하나뿐 — band 축 추가는 IMPLEMENT_KEYS 확장일 뿐 버킷 키 의미 불변(백필 불필요). 고유 기구 정규화(normalizeVariantEquipment)와 자동 정합.
- **[자동 메모리: exercise-catalog-variants]** nameKo는 finder/media/substitutes의 조회 KEY — rename 시 깨짐. 추가만. nameEn은 결정적 seedId — 과거 soft-delete 엔트리와 슬러그 충돌 회피(신규 nameEn 유일성 테스트로 기계 검증).
- seedRunner는 nameEn 기준 멱등 top-up — 기존 설치에도 자동 보강, 마이그레이션 불필요.
- exerciseMedia.data.ts는 "자동 생성·직접 수정 금지" 헤더이나 생성 스크립트는 repo에 없음 → Phase 3에서 **일회성 생성 스크립트를 scripts/에 신설**해 재현 가능하게(free-exercise-db exercises.json 매칭→코드젠).
- free-exercise-db는 Unlicense(퍼블릭 도메인) — 기존 선례 유지. GymVisual(ADR-029)은 이번 범위 아님(3D 움짤 오버레이는 별도 게이트).
- 유산소 지표는 위 표의 cardioMetricsFor 컬럼이 정본 — duration-only 종목 보강은 확정 작업(기본값 시간+거리).
- 대사량 급증으로 ExerciseListScreen 렌더 성능 점검(336종 — 기존 FlatList 가상화면 무리 없음, e2e에서 체감 확인만).
- (보류 — 구현 시 재검) 이명 검색성: '헥스 프레스'(=덤벨 스퀴즈 프레스)·'업다운 플랭크'(=플랭크 푸시업) 등 통용 이명이 nameKo 단일 검색에 안 걸릴 수 있음 — 검색이 nameEn도 매칭하는지 확인 후, 미커버 시 대표명 재선정 또는 finder 슬롯 편입으로 보완.

## 코드 영향 범위 (작업 범위 = scope)

| 파일 | 변경 |
|---|---|
| app/src/data/seed/exercises.seed.ts | 신규 153 엔트리 + 헤더 주석 정정 |
| app/src/data/seed/substitutes.seed.ts | 죽은 키·값 선행 정리 + 신규 종목 대체목록 |
| app/src/data/exerciseMedia.data.ts | RAW_MEDIA 확장(생성 스크립트 산출) |
| app/src/data/exerciseMedia.ts | s/e optional 완화(스텝만 엔트리 허용 — qa 리뷰) |
| app/src/features/session/ExerciseTipPanel.tsx | 이미지 없는 엔트리 초기 mode='steps' 렌더(qa 리뷰) |
| app/scripts/gen-exercise-media.js (신설) | free-exercise-db 매칭·코드젠 + 검수 매칭쌍 표 산출 |
| app/src/domain/movementPatterns.ts | 패턴 매핑 추가 |
| app/src/domain/exerciseFinder.ts | FINDER_TREE 슬롯 편입 |
| app/src/domain/variants.ts | IMPLEMENT_KEYS/LABELS band 추가 |
| app/src/domain/cardio.ts(cardioMetricsFor 소재 파일) | 유산소 지표 보강(필요시) |
| app/src/domain/__tests__/catalogGap.test.ts | 신규 무결성(존재·KEY 불변·슬러그 유일) |
| app/app.json + app/src/appInfo.ts | v0.14.0 |

## 딥링크 구현 계획 (추적 매핑)

| 파일/심볼 | realizes |
|---|---|
| exercises.seed.ts 신규 블록 | `@plm SRS-001 SRS-047` |
| movementPatterns/finder/substitutes 추가분 | `@plm SRS-047 SRS-031` |
| exerciseMedia.data.ts·생성 스크립트 | `@plm SRS-032` |
| variants.ts band 축 | `@plm SRS-028` |

구현 후 `/plm-hub:codescan`으로 Code 아티팩트·realizes 동기.
