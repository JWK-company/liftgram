// 무브먼트 패턴 그룹 — "같은 패턴 대체운동" 조회의 기반 (순수 데이터·테스트 대상). @plm SRS-047
// SAD-021 편차(스펙 qa 결정): DB 컬럼 대신 도메인 정적 매핑(seed id KEY — P2 에서 nameKo 에서 옮김).
// 마이그레이션 불필요·오프라인 안전·커스텀 종목은 null.
export type MovementPattern =
  | 'horizontalPress' // 수평 프레스(벤치 계열)
  | 'verticalPress' // 수직 프레스(오버헤드)
  | 'horizontalPull' // 수평 당기기(로우)
  | 'verticalPull' // 수직 당기기(풀업·풀다운)
  | 'squat'
  | 'hinge' // 힌지(데드리프트·굿모닝)
  | 'lungeStep' // 런지·스텝
  | 'fly' // 가슴·후면 플라이
  | 'lateralRaise'
  | 'curl'
  | 'extension' // 삼두 신전
  | 'carry'
  | 'core'
  | 'calf';

// 매핑 키 = 종목 seed id(카탈로그 개편 P2 — nameKo 키 폐지 · ADR-033). 옛 이름 매핑(괄호 기구 폴백 포함)의 결과를
// 그대로 굳혔고, 신규 종목은 같은 동작 그룹(family)의 기존 종목 패턴을 이었다. 커스텀 종목은 null.
const PATTERN_BY_ID: Record<string, MovementPattern> = {
  "seed-barbell-bench-press": 'horizontalPress', // 바벨 벤치프레스
  "seed-incline-press": 'horizontalPress', // 바벨 인클라인 프레스
  "seed-incline-press-dumbbell": 'horizontalPress', // 덤벨 인클라인 프레스
  "seed-incline-press-machine": 'horizontalPress', // 머신 인클라인 프레스
  "seed-incline-press-smith": 'horizontalPress', // 스미스 인클라인 프레스
  "seed-decline-barbell-press": 'horizontalPress', // 바벨 디클라인 프레스
  "seed-dumbbell-bench-press": 'horizontalPress', // 덤벨 벤치프레스
  "seed-decline-dumbbell-press": 'horizontalPress', // 덤벨 디클라인 프레스
  "seed-dumbbell-fly": 'fly', // 덤벨 플라이
  "seed-incline-dumbbell-fly": 'fly', // 덤벨 인클라인 플라이
  "seed-cable-crossover": 'fly', // 케이블 크로스오버
  "seed-low-cable-fly": 'fly', // 케이블 로우 투 하이 플라이
  "seed-pec-deck-fly": 'fly', // 펙 덱 플라이
  "seed-chest-press-machine": 'horizontalPress', // 머신 체스트 프레스
  "seed-smith-machine-bench-press": 'horizontalPress', // 스미스 벤치프레스
  "seed-dips": 'horizontalPress', // 딥스
  "seed-push-up": 'horizontalPress', // 푸시업
  "seed-incline-push-up": 'horizontalPress', // 인클라인 푸시업
  "seed-deadlift": 'hinge', // 바벨 데드리프트
  "seed-sumo-deadlift": 'hinge', // 바벨 스모 데드리프트
  "seed-rack-pull": 'hinge', // 바벨 랙 풀
  "seed-barbell-row": 'horizontalPull', // 바벨 로우
  "seed-pendlay-row": 'horizontalPull', // 바벨 펜들레이 로우
  "seed-t-bar-row": 'horizontalPull', // 티바 로우
  "seed-dumbbell-row": 'horizontalPull', // 덤벨 로우
  "seed-seated-cable-row": 'horizontalPull', // 케이블 시티드 로우
  "seed-lat-pulldown": 'verticalPull', // 케이블 랫풀다운
  "seed-close-grip-pulldown": 'verticalPull', // 클로즈그립 풀다운
  "seed-pull-up": 'verticalPull', // 풀업
  "seed-chin-up": 'verticalPull', // 친업
  "seed-machine-row": 'horizontalPull', // 머신 시티드 로우
  "seed-good-morning": 'hinge', // 바벨 굿모닝
  "seed-overhead-press": 'verticalPress', // 바벨 오버헤드 프레스
  "seed-military-press": 'verticalPress', // 밀리터리 프레스
  "seed-dumbbell-shoulder-press": 'verticalPress', // 덤벨 숄더 프레스
  "seed-arnold-press": 'verticalPress', // 덤벨 아놀드 프레스
  "seed-shoulder-press-machine": 'verticalPress', // 머신 숄더 프레스
  "seed-side-lateral-raise": 'lateralRaise', // 덤벨 레터럴 레이즈
  "seed-cable-lateral-raise": 'lateralRaise', // 케이블 레터럴 레이즈
  "seed-machine-lateral-raise": 'lateralRaise', // 머신 레터럴 레이즈
  "seed-front-raise": 'lateralRaise', // 덤벨 프론트 레이즈
  "seed-rear-delt-fly": 'fly', // 덤벨 리어 델트 플라이
  "seed-reverse-pec-deck": 'fly', // 리버스 펙 덱
  "seed-close-grip-bench-press": 'horizontalPress', // 바벨 클로즈그립 벤치프레스
  "seed-diamond-push-up": 'horizontalPress', // 다이아몬드 푸시업
  "seed-barbell-squat": 'squat', // 바벨 스쿼트
  "seed-front-squat": 'squat', // 바벨 프론트 스쿼트
  "seed-high-bar-squat": 'squat', // 하이바 스쿼트
  "seed-hack-squat": 'squat', // 핵 스쿼트
  "seed-leg-press": 'squat', // 레그 프레스
  "seed-goblet-squat": 'squat', // 덤벨 고블릿 스쿼트
  "seed-lunge": 'lungeStep', // 덤벨 런지
  "seed-walking-lunge": 'lungeStep', // 덤벨 워킹 런지
  "seed-bulgarian-split-squat": 'lungeStep', // 덤벨 불가리안 스플릿 스쿼트
  "seed-smith-machine-squat": 'squat', // 스미스 스쿼트
  "seed-step-up": 'lungeStep', // 덤벨 스텝업
  "seed-romanian-deadlift": 'hinge', // 바벨 루마니안 데드리프트
  "seed-stiff-leg-deadlift": 'hinge', // 바벨 스티프 레그 데드리프트
  "seed-hip-thrust": 'hinge', // 바벨 힙 쓰러스트
  "seed-glute-bridge": 'hinge', // 바벨 글루트 브릿지
  "seed-kettlebell-swing": 'hinge', // 케틀벨 스윙
  "seed-assisted-pull-up": 'verticalPull', // 어시스트 풀업
  "seed-assisted-chin-up": 'verticalPull', // 어시스트 친업
  "seed-assisted-dip": 'horizontalPress', // 어시스트 딥스
  "seed-high-row": 'horizontalPull', // 머신 하이 로우
  "seed-low-row": 'horizontalPull', // 머신 로우 로우
  "seed-chest-supported-row": 'horizontalPull', // 머신 체스트 서포티드 로우
  "seed-inverted-row": 'horizontalPull', // 인버티드 로우
  "seed-single-arm-lat-pulldown": 'verticalPull', // 원암 랫풀다운
  "seed-landmine-press": 'verticalPress', // 랜드마인 프레스
  "seed-cable-rear-delt-fly": 'fly', // 케이블 리어 델트 플라이
  "seed-sissy-squat": 'squat', // 시시 스쿼트
  "seed-pendulum-squat": 'squat', // 펜듈럼 스쿼트
  "seed-belt-squat": 'squat', // 벨트 스쿼트
  "seed-smith-hip-thrust": 'hinge', // 스미스 힙 쓰러스트
  "seed-dip-machine": 'horizontalPress', // 머신 딥스
  "seed-row-smith": 'horizontalPull', // 스미스 로우
  "seed-shoulder-press-smith": 'verticalPress', // 스미스 숄더 프레스
  "seed-front-raise-cable": 'lateralRaise', // 케이블 프론트 레이즈
  "seed-front-raise-barbell": 'lateralRaise', // 바벨 프론트 레이즈
  "seed-lunge-barbell": 'lungeStep', // 바벨 런지
  "seed-lunge-smith": 'lungeStep', // 스미스 런지
  "seed-bulgarian-split-squat-barbell": 'lungeStep', // 바벨 불가리안 스플릿 스쿼트
  "seed-bulgarian-split-squat-smith": 'lungeStep', // 스미스 불가리안 스플릿 스쿼트
  "seed-romanian-deadlift-dumbbell": 'hinge', // 덤벨 루마니안 데드리프트
  "seed-hip-thrust-machine": 'hinge', // 머신 힙 쓰러스트
  "seed-hammer-strength-chest-press": 'horizontalPress', // 해머스트렝스 체스트 프레스
  "seed-decline-chest-press-machine": 'horizontalPress', // 머신 디클라인 프레스
  "seed-lying-chest-press-machine": 'horizontalPress', // 머신 라잉 체스트 프레스
  "seed-converging-chest-press-machine": 'horizontalPress', // 컨버징 체스트 프레스 머신
  "seed-single-arm-chest-press-machine": 'horizontalPress', // 원암 체스트 프레스 머신
  "seed-seated-cable-chest-press": 'horizontalPress', // 케이블 시티드 체스트 프레스
  "seed-standing-cable-chest-press": 'horizontalPress', // 케이블 체스트 프레스
  "seed-lying-cable-chest-press": 'horizontalPress', // 케이블 라잉 체스트 프레스
  "seed-larsen-press": 'horizontalPress', // 바벨 라슨 프레스
  "seed-feet-up-bench-press": 'horizontalPress', // 바벨 피트 업 벤치프레스
  "seed-decline-press-smith": 'horizontalPress', // 스미스 디클라인 프레스
  "seed-wide-grip-push-up": 'horizontalPress', // 와이드 그립 푸시업
  "seed-deficit-push-up": 'horizontalPress', // 데피싯 푸시업
  "seed-chest-supported-t-bar-row": 'horizontalPull', // 체스트 서포티드 티바 로우
  "seed-chest-supported-row-dumbbell": 'horizontalPull', // 덤벨 체스트 서포티드 로우
  "seed-decline-push-up": 'horizontalPress', // 디클라인 푸시업
  "seed-clap-push-up": 'horizontalPress', // 클랩 푸시업
  "seed-kneeling-push-up": 'horizontalPress', // 닐링 푸시업
  "seed-one-arm-push-up": 'horizontalPress', // 원암 푸시업
  "seed-plank-push-up": 'horizontalPress', // 플랭크 푸시업
  "seed-ring-push-up": 'horizontalPress', // 링 푸시업
  "seed-floor-press": 'horizontalPress', // 바벨 플로어 프레스
  "seed-dumbbell-squeeze-press": 'horizontalPress', // 덤벨 스퀴즈 프레스
  "seed-svend-press": 'horizontalPress', // 플레이트 스벤드 프레스
  "seed-decline-dumbbell-fly": 'fly', // 덤벨 디클라인 플라이
  "seed-seated-cable-fly": 'fly', // 케이블 시티드 플라이
  "seed-dumbbell-around-the-world": 'fly', // 덤벨 어라운드 더 월드
  "seed-ring-dip": 'horizontalPress', // 링 딥스
  "seed-landmine-row": 'horizontalPull', // 랜드마인 로우
  "seed-meadows-row": 'horizontalPull', // 메도우스 로우
  "seed-seal-row": 'horizontalPull', // 바벨 씰 로우
  "seed-gorilla-row": 'horizontalPull', // 케틀벨 고릴라 로우
  "seed-renegade-row": 'horizontalPull', // 덤벨 레니게이드 로우
  "seed-machine-pullover": 'verticalPull', // 머신 풀오버
  "seed-negative-pull-up": 'verticalPull', // 네거티브 풀업
  "seed-scapular-pull-up": 'verticalPull', // 스캐퓰러 풀업
  "seed-kipping-pull-up": 'verticalPull', // 키핑 풀업
  "seed-sternum-pull-up": 'verticalPull', // 스터넘 풀업
  "seed-muscle-up": 'verticalPull', // 머슬업
  "seed-ring-pull-up": 'verticalPull', // 링 풀업
  "seed-back-extension-machine": 'hinge', // 머신 백 익스텐션
  "seed-superman": 'core', // 슈퍼맨
  "seed-pike-push-up": 'verticalPress', // 파이크 푸시업
  "seed-handstand-push-up": 'verticalPress', // 핸드스탠드 푸시업
  "seed-handstand-hold": 'verticalPress', // 핸드스탠드 홀드
  "seed-push-press": 'verticalPress', // 바벨 푸시 프레스
  "seed-band-pull-apart": 'fly', // 밴드 풀 어파트
  "seed-cable-y-raise": 'lateralRaise', // 케이블 Y 레이즈
  "seed-chest-supported-y-raise": 'lateralRaise', // 덤벨 Y 레이즈
  "seed-plate-front-raise": 'lateralRaise', // 플레이트 프론트 레이즈
  "seed-overhead-plate-raise": 'lateralRaise', // 플레이트 오버헤드 레이즈
  "seed-shoulder-taps": 'core', // 숄더 탭
  "seed-drag-curl": 'curl', // 바벨 드래그 컬
  "seed-zottman-curl": 'curl', // 덤벨 조트맨 컬
  "seed-cross-body-hammer-curl": 'curl', // 덤벨 크로스 바디 해머 컬
  "seed-waiter-curl": 'curl', // 덤벨 웨이터 컬
  "seed-bicep-curl-21s": 'curl', // 바벨 21 컬
  "seed-overhead-cable-curl": 'curl', // 케이블 오버헤드 컬
  "seed-behind-the-back-cable-curl": 'curl', // 케이블 비하인드 백 컬
  "seed-plate-curl": 'curl', // 플레이트 컬
  "seed-reverse-grip-pushdown": 'extension', // 리버스 그립 푸시다운
  "seed-triceps-extension-machine": 'extension', // 머신 트라이셉스 익스텐션
  "seed-wide-elbow-triceps-press": 'extension', // 덤벨 와이드 엘보 트라이셉스 프레스
  "seed-reverse-curl-dumbbell": 'curl', // 덤벨 리버스 컬
  "seed-reverse-curl-cable": 'curl', // 케이블 리버스 컬
  "seed-box-squat": 'squat', // 바벨 박스 스쿼트
  "seed-pause-squat": 'squat', // 바벨 포즈 스쿼트
  "seed-overhead-squat": 'squat', // 바벨 오버헤드 스쿼트
  "seed-zercher-squat": 'squat', // 바벨 저처 스쿼트
  "seed-sumo-squat": 'squat', // 덤벨 스모 스쿼트
  "seed-pistol-squat": 'squat', // 피스톨 스쿼트
  "seed-wall-sit": 'squat', // 월 싯
  "seed-jump-squat": 'squat', // 점프 스쿼트
  "seed-box-jump": 'squat', // 박스 점프
  "seed-lateral-box-jump": 'lungeStep', // 레터럴 박스 점프
  "seed-frog-jump": 'squat', // 프로그 점프
  "seed-lateral-squat": 'squat', // 레터럴 스쿼트
  "seed-reverse-lunge": 'lungeStep', // 리버스 런지
  "seed-lateral-lunge": 'lungeStep', // 레터럴 런지
  "seed-curtsy-lunge": 'lungeStep', // 커시 런지
  "seed-jump-lunge": 'lungeStep', // 점프 런지
  "seed-overhead-lunge": 'lungeStep', // 덤벨 오버헤드 런지
  "seed-split-squat": 'lungeStep', // 덤벨 스플릿 스쿼트
  "seed-cable-pull-through": 'hinge', // 케이블 풀 스루
  "seed-reverse-hyperextension": 'hinge', // 리버스 하이퍼익스텐션
  "seed-deadlift-high-pull": 'hinge', // 바벨 데드리프트 하이 풀
  "seed-hip-thrust-dumbbell": 'hinge', // 덤벨 힙 쓰러스트
  "seed-suitcase-carry": 'carry', // 덤벨 수트케이스 캐리
  "seed-hyperextension": 'hinge', // 하이퍼익스텐션
  "seed-triceps-pushdown": 'extension', // 케이블 푸시다운
  "seed-reverse-barbell-curl": 'curl', // 바벨 리버스 컬
  "seed-dumbbell-pullover": 'verticalPull', // 덤벨 풀오버
  "seed-cable-incline-fly": 'fly', // 케이블 인클라인 플라이
  "seed-cable-lying-fly": 'fly', // 케이블 라잉 플라이
  "seed-dumbbell-floor-press": 'horizontalPress', // 덤벨 플로어 프레스
  "seed-cable-incline-chest-press": 'horizontalPress', // 케이블 인클라인 프레스
  "seed-band-chest-press": 'horizontalPress', // 밴드 체스트 프레스
  "seed-barbell-pullover": 'verticalPull', // 바벨 풀오버
  "seed-dumbbell-close-grip-press": 'horizontalPress', // 덤벨 클로즈그립 프레스
  "seed-smith-close-grip-bench-press": 'horizontalPress', // 스미스 클로즈그립 벤치프레스
  "seed-ez-bar-close-grip-press": 'horizontalPress', // EZ바 클로즈그립 프레스
  "seed-trap-bar-deadlift": 'hinge', // 트랩바 데드리프트
  "seed-dumbbell-deadlift": 'hinge', // 덤벨 데드리프트
  "seed-kettlebell-deadlift": 'hinge', // 케틀벨 데드리프트
  "seed-smith-deadlift": 'hinge', // 스미스 데드리프트
  "seed-kettlebell-sumo-deadlift": 'hinge', // 케틀벨 스모 데드리프트
  "seed-dumbbell-bent-over-row": 'horizontalPull', // 덤벨 벤트오버 로우
  "seed-kettlebell-one-arm-row": 'horizontalPull', // 케틀벨 원암 로우
  "seed-machine-lat-pulldown": 'verticalPull', // 머신 랫풀다운
  "seed-band-lat-pulldown": 'verticalPull', // 밴드 랫풀다운
  "seed-cable-high-row": 'horizontalPull', // 케이블 하이 로우
  "seed-band-seated-row": 'horizontalPull', // 밴드 시티드 로우
  "seed-ring-row": 'horizontalPull', // 링 로우
  "seed-band-assisted-pull-up": 'verticalPull', // 밴드 어시스트 풀업
  "seed-band-good-morning": 'hinge', // 밴드 굿모닝
  "seed-dumbbell-seal-row": 'horizontalPull', // 덤벨 씰 로우
  "seed-kettlebell-renegade-row": 'horizontalPull', // 케틀벨 레니게이드 로우
  "seed-kettlebell-shoulder-press": 'verticalPress', // 케틀벨 숄더 프레스
  "seed-band-shoulder-press": 'verticalPress', // 밴드 숄더 프레스
  "seed-cable-shoulder-press": 'verticalPress', // 케이블 숄더 프레스
  "seed-band-lateral-raise": 'lateralRaise', // 밴드 레터럴 레이즈
  "seed-band-rear-delt-fly": 'fly', // 밴드 리어 델트 플라이
  "seed-dumbbell-push-press": 'verticalPress', // 덤벨 푸시 프레스
  "seed-kettlebell-push-press": 'verticalPress', // 케틀벨 푸시 프레스
  "seed-ez-bar-reverse-curl": 'curl', // EZ바 리버스 컬
  "seed-band-pushdown": 'extension', // 밴드 푸시다운
  "seed-dumbbell-squat": 'squat', // 덤벨 스쿼트
  "seed-air-squat": 'squat', // 에어 스쿼트
  "seed-band-squat": 'squat', // 밴드 스쿼트
  "seed-safety-bar-squat": 'squat', // 세이프티바 스쿼트
  "seed-kettlebell-goblet-squat": 'squat', // 케틀벨 고블릿 스쿼트
  "seed-dumbbell-front-squat": 'squat', // 덤벨 프론트 스쿼트
  "seed-kettlebell-front-squat": 'squat', // 케틀벨 프론트 스쿼트
  "seed-smith-front-squat": 'squat', // 스미스 프론트 스쿼트
  "seed-barbell-sumo-squat": 'squat', // 바벨 스모 스쿼트
  "seed-kettlebell-sumo-squat": 'squat', // 케틀벨 스모 스쿼트
  "seed-barbell-hack-squat": 'squat', // 바벨 핵 스쿼트
  "seed-barbell-step-up": 'lungeStep', // 바벨 스텝업
  "seed-barbell-walking-lunge": 'lungeStep', // 바벨 워킹 런지
  "seed-dumbbell-reverse-lunge": 'lungeStep', // 덤벨 리버스 런지
  "seed-barbell-reverse-lunge": 'lungeStep', // 바벨 리버스 런지
  "seed-smith-reverse-lunge": 'lungeStep', // 스미스 리버스 런지
  "seed-dumbbell-lateral-lunge": 'lungeStep', // 덤벨 레터럴 런지
  "seed-smith-split-squat": 'lungeStep', // 스미스 스플릿 스쿼트
  "seed-barbell-split-squat": 'lungeStep', // 바벨 스플릿 스쿼트
  "seed-smith-romanian-deadlift": 'hinge', // 스미스 루마니안 데드리프트
  "seed-kettlebell-romanian-deadlift": 'hinge', // 케틀벨 루마니안 데드리프트
  "seed-dumbbell-stiff-leg-deadlift": 'hinge', // 덤벨 스티프 레그 데드리프트
  "seed-smith-stiff-leg-deadlift": 'hinge', // 스미스 스티프 레그 데드리프트
  "seed-bodyweight-glute-bridge": 'hinge', // 글루트 브릿지
  "seed-dumbbell-glute-bridge": 'hinge', // 덤벨 글루트 브릿지
  "seed-kettlebell-floor-press": 'horizontalPress', // 케틀벨 플로어 프레스
  "seed-band-deadlift": 'hinge', // 밴드 데드리프트
  "seed-cable-romanian-deadlift": 'hinge', // 케이블 루마니안 데드리프트
  "seed-band-hip-thrust": 'hinge', // 밴드 힙 쓰러스트
  "seed-dumbbell-swing": 'hinge', // 덤벨 스윙
  "seed-kettlebell-lunge": 'lungeStep', // 케틀벨 런지
  "seed-band-chest-fly": 'fly', // 밴드 체스트 플라이
  "seed-smith-good-morning": 'hinge', // 스미스 굿모닝
  "seed-band-assisted-dip": 'horizontalPress', // 밴드 어시스트 딥스
  "seed-band-pull-through": 'hinge', // 밴드 풀 스루
  "seed-band-front-raise": 'lateralRaise', // 밴드 프론트 레이즈
  "seed-smith-inverted-row": 'horizontalPull', // 스미스 인버티드 로우
  "seed-kettlebell-bent-over-row": 'horizontalPull', // 케틀벨 벤트오버 로우
  "seed-smith-sumo-squat": 'squat', // 스미스 스모 스쿼트
};

export function movementPatternOf(exerciseId: string): MovementPattern | null {
  return PATTERN_BY_ID[exerciseId] ?? null;
}

// 같은 패턴의 종목 id 목록(자기 자신 제외) — "이 기구가 없어요" 대체 후보의 상위 그룹.
export function samePatternIds(pattern: MovementPattern, excludeId?: string): string[] {
  return Object.entries(PATTERN_BY_ID)
    .filter(([id, p]) => p === pattern && id !== excludeId)
    .map(([id]) => id);
}

export function movementPatternMapKeys(): string[] {
  return Object.keys(PATTERN_BY_ID);
}
