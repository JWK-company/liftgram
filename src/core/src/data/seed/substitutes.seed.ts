// 대체운동 큐레이션 (SRS-001 · 기구기반 추천 SRS-013). 종목 id -> 대체 종목 id[].
// 카탈로그 개편 P2(ADR-033): 키를 nameKo 에서 **seed id** 로 옮겼다 — 이름을 바꿔도(별칭·대표 이름) 끊기지 않는다.
// seedRunner 가 로컬에 있는 id 만 substituteIds 에 멱등 적용한다. 보관(병합) 종목은 대상 id 로 접었다. @plm SRS-001 SRS-013 SRS-055
/* eslint-disable */
export const SUBSTITUTES: Record<string, string[]> = {
  "seed-barbell-bench-press": ["seed-dumbbell-bench-press","seed-smith-machine-bench-press","seed-chest-press-machine","seed-push-up","seed-dips"], // 바벨 벤치프레스
  "seed-incline-press": ["seed-barbell-bench-press","seed-dumbbell-bench-press","seed-chest-press-machine","seed-push-up","seed-dips"], // 바벨 인클라인 프레스
  "seed-decline-barbell-press": ["seed-decline-dumbbell-press","seed-barbell-bench-press","seed-dumbbell-bench-press","seed-dips","seed-chest-press-machine"], // 바벨 디클라인 프레스
  "seed-dumbbell-bench-press": ["seed-barbell-bench-press","seed-smith-machine-bench-press","seed-chest-press-machine","seed-push-up","seed-incline-press"], // 덤벨 벤치프레스
  "seed-decline-dumbbell-press": ["seed-decline-barbell-press","seed-dumbbell-bench-press","seed-dips","seed-chest-press-machine","seed-barbell-bench-press"], // 덤벨 디클라인 프레스
  "seed-dumbbell-fly": ["seed-cable-crossover","seed-pec-deck-fly","seed-low-cable-fly","seed-incline-dumbbell-fly","seed-chest-press-machine"], // 덤벨 플라이
  "seed-incline-dumbbell-fly": ["seed-low-cable-fly","seed-dumbbell-fly","seed-cable-crossover","seed-pec-deck-fly","seed-incline-press"], // 덤벨 인클라인 플라이
  "seed-cable-crossover": ["seed-pec-deck-fly","seed-dumbbell-fly","seed-low-cable-fly","seed-incline-dumbbell-fly","seed-chest-press-machine"], // 케이블 크로스오버
  "seed-low-cable-fly": ["seed-cable-crossover","seed-incline-dumbbell-fly","seed-pec-deck-fly","seed-dumbbell-fly","seed-incline-press"], // 케이블 로우 투 하이 플라이
  "seed-pec-deck-fly": ["seed-cable-crossover","seed-dumbbell-fly","seed-low-cable-fly","seed-incline-dumbbell-fly","seed-chest-press-machine"], // 펙 덱 플라이
  "seed-chest-press-machine": ["seed-smith-machine-bench-press","seed-barbell-bench-press","seed-dumbbell-bench-press","seed-push-up","seed-incline-press","seed-lying-chest-press-machine","seed-pec-deck-fly","seed-lying-cable-chest-press","seed-seated-cable-chest-press"], // 머신 체스트 프레스
  "seed-smith-machine-bench-press": ["seed-barbell-bench-press","seed-dumbbell-bench-press","seed-chest-press-machine","seed-push-up","seed-dips"], // 스미스 벤치프레스
  "seed-dips": ["seed-push-up","seed-chest-press-machine","seed-decline-barbell-press","seed-bench-dip","seed-barbell-bench-press"], // 딥스
  "seed-push-up": ["seed-incline-push-up","seed-dips","seed-chest-press-machine","seed-dumbbell-bench-press","seed-barbell-bench-press","seed-deficit-push-up","seed-decline-push-up"], // 푸시업
  "seed-incline-push-up": ["seed-push-up","seed-chest-press-machine","seed-incline-press","seed-dips","seed-dumbbell-bench-press"], // 인클라인 푸시업
  "seed-deadlift": ["seed-sumo-deadlift","seed-rack-pull","seed-romanian-deadlift","seed-barbell-row","seed-good-morning"], // 바벨 데드리프트
  "seed-sumo-deadlift": ["seed-deadlift","seed-rack-pull","seed-romanian-deadlift","seed-kettlebell-swing","seed-good-morning"], // 바벨 스모 데드리프트
  "seed-rack-pull": ["seed-deadlift","seed-sumo-deadlift","seed-barbell-row","seed-romanian-deadlift","seed-good-morning"], // 바벨 랙 풀
  "seed-barbell-row": ["seed-pendlay-row","seed-dumbbell-row","seed-t-bar-row","seed-machine-row","seed-seated-cable-row"], // 바벨 로우
  "seed-pendlay-row": ["seed-barbell-row","seed-t-bar-row","seed-dumbbell-row","seed-machine-row","seed-seated-cable-row"], // 바벨 펜들레이 로우
  "seed-t-bar-row": ["seed-barbell-row","seed-pendlay-row","seed-machine-row","seed-seated-cable-row","seed-dumbbell-row"], // 티바 로우
  "seed-dumbbell-row": ["seed-seated-cable-row","seed-machine-row","seed-barbell-row","seed-t-bar-row","seed-pendlay-row"], // 덤벨 로우
  "seed-seated-cable-row": ["seed-machine-row","seed-dumbbell-row","seed-barbell-row","seed-t-bar-row","seed-pendlay-row"], // 케이블 시티드 로우
  "seed-lat-pulldown": ["seed-pull-up","seed-chin-up","seed-machine-row","seed-seated-cable-row"], // 케이블 랫풀다운
  "seed-straight-arm-pulldown": ["seed-lat-pulldown","seed-pull-up","seed-seated-cable-row","seed-dumbbell-row"], // 케이블 스트레이트 암 풀다운
  "seed-pull-up": ["seed-chin-up","seed-lat-pulldown","seed-machine-row"], // 풀업
  "seed-chin-up": ["seed-pull-up","seed-lat-pulldown","seed-machine-row"], // 친업
  "seed-machine-row": ["seed-seated-cable-row","seed-dumbbell-row","seed-barbell-row","seed-t-bar-row","seed-pendlay-row"], // 머신 시티드 로우
  "seed-hyperextension": ["seed-good-morning","seed-romanian-deadlift","seed-stiff-leg-deadlift","seed-deadlift","seed-glute-bridge"], // 하이퍼익스텐션
  "seed-good-morning": ["seed-romanian-deadlift","seed-stiff-leg-deadlift","seed-hyperextension","seed-deadlift","seed-rack-pull"], // 바벨 굿모닝
  "seed-overhead-press": ["seed-dumbbell-shoulder-press","seed-shoulder-press-machine","seed-arnold-press"], // 바벨 오버헤드 프레스
  "seed-dumbbell-shoulder-press": ["seed-arnold-press","seed-overhead-press","seed-shoulder-press-machine"], // 덤벨 숄더 프레스
  "seed-arnold-press": ["seed-dumbbell-shoulder-press","seed-shoulder-press-machine","seed-overhead-press"], // 덤벨 아놀드 프레스
  "seed-shoulder-press-machine": ["seed-dumbbell-shoulder-press","seed-overhead-press","seed-arnold-press"], // 머신 숄더 프레스
  "seed-side-lateral-raise": ["seed-cable-lateral-raise","seed-machine-lateral-raise","seed-upright-row","seed-front-raise"], // 덤벨 레터럴 레이즈
  "seed-cable-lateral-raise": ["seed-side-lateral-raise","seed-machine-lateral-raise","seed-upright-row","seed-front-raise"], // 케이블 레터럴 레이즈
  "seed-machine-lateral-raise": ["seed-side-lateral-raise","seed-cable-lateral-raise","seed-upright-row","seed-front-raise"], // 머신 레터럴 레이즈
  "seed-front-raise": ["seed-side-lateral-raise","seed-cable-lateral-raise","seed-overhead-press","seed-dumbbell-shoulder-press"], // 덤벨 프론트 레이즈
  "seed-rear-delt-fly": ["seed-reverse-pec-deck","seed-face-pull","seed-barbell-row","seed-seated-cable-row"], // 덤벨 리어 델트 플라이
  "seed-reverse-pec-deck": ["seed-rear-delt-fly","seed-face-pull","seed-barbell-row","seed-seated-cable-row"], // 리버스 펙 덱
  "seed-face-pull": ["seed-reverse-pec-deck","seed-rear-delt-fly","seed-barbell-row","seed-upright-row"], // 케이블 페이스 풀
  "seed-upright-row": ["seed-side-lateral-raise","seed-cable-lateral-raise","seed-machine-lateral-raise","seed-face-pull"], // 바벨 업라이트 로우
  "seed-barbell-curl": ["seed-ez-bar-curl","seed-dumbbell-curl","seed-cable-curl","seed-machine-curl","seed-preacher-curl"], // 바벨 컬
  "seed-ez-bar-curl": ["seed-barbell-curl","seed-dumbbell-curl","seed-cable-curl","seed-preacher-curl","seed-machine-curl"], // EZ바 컬
  "seed-dumbbell-curl": ["seed-barbell-curl","seed-ez-bar-curl","seed-cable-curl","seed-incline-dumbbell-curl","seed-machine-curl"], // 덤벨 컬
  "seed-hammer-curl": ["seed-dumbbell-curl","seed-reverse-barbell-curl","seed-cable-curl","seed-barbell-curl","seed-concentration-curl"], // 덤벨 해머 컬
  "seed-incline-dumbbell-curl": ["seed-dumbbell-curl","seed-spider-curl","seed-concentration-curl","seed-cable-curl","seed-preacher-curl"], // 덤벨 인클라인 컬
  "seed-preacher-curl": ["seed-spider-curl","seed-machine-curl","seed-ez-bar-curl","seed-barbell-curl","seed-cable-curl"], // 바벨 프리처 컬
  "seed-concentration-curl": ["seed-dumbbell-curl","seed-spider-curl","seed-preacher-curl","seed-incline-dumbbell-curl","seed-cable-curl"], // 덤벨 컨센트레이션 컬
  "seed-cable-curl": ["seed-dumbbell-curl","seed-barbell-curl","seed-ez-bar-curl","seed-machine-curl","seed-preacher-curl"], // 케이블 컬
  "seed-spider-curl": ["seed-preacher-curl","seed-concentration-curl","seed-incline-dumbbell-curl","seed-dumbbell-curl","seed-cable-curl"], // 덤벨 스파이더 컬
  "seed-machine-curl": ["seed-cable-curl","seed-preacher-curl","seed-barbell-curl","seed-ez-bar-curl","seed-dumbbell-curl"], // 머신 컬
  "seed-close-grip-bench-press": ["seed-skull-crusher","seed-diamond-push-up","seed-dips","seed-triceps-pushdown","seed-bench-dip"], // 바벨 클로즈그립 벤치프레스
  "seed-triceps-pushdown": ["seed-skull-crusher","seed-overhead-triceps-extension","seed-cable-overhead-extension","seed-bench-dip","seed-triceps-kickback-cable","seed-triceps-extension-machine"], // 케이블 푸시다운
  "seed-overhead-triceps-extension": ["seed-cable-overhead-extension","seed-skull-crusher","seed-triceps-pushdown","seed-triceps-kickback"], // 덤벨 오버헤드 트라이셉스 익스텐션
  "seed-cable-overhead-extension": ["seed-overhead-triceps-extension","seed-triceps-pushdown","seed-skull-crusher","seed-triceps-kickback"], // 케이블 오버헤드 트라이셉스 익스텐션
  "seed-skull-crusher": ["seed-overhead-triceps-extension","seed-triceps-pushdown","seed-close-grip-bench-press","seed-cable-overhead-extension"], // 바벨 스컬크러셔
  "seed-triceps-kickback": ["seed-triceps-pushdown","seed-overhead-triceps-extension","seed-bench-dip","seed-skull-crusher"], // 덤벨 트라이셉스 킥백
  "seed-bench-dip": ["seed-dips","seed-diamond-push-up","seed-triceps-pushdown","seed-close-grip-bench-press"], // 벤치 딥스
  "seed-diamond-push-up": ["seed-bench-dip","seed-dips","seed-close-grip-bench-press","seed-push-up","seed-triceps-pushdown"], // 다이아몬드 푸시업
  "seed-wrist-curl": ["seed-reverse-wrist-curl","seed-reverse-barbell-curl","seed-farmer-s-walk"], // 바벨 리스트 컬
  "seed-reverse-wrist-curl": ["seed-wrist-curl","seed-reverse-barbell-curl","seed-hammer-curl","seed-farmer-s-walk"], // 바벨 리버스 리스트 컬
  "seed-reverse-barbell-curl": ["seed-hammer-curl","seed-reverse-wrist-curl","seed-barbell-curl","seed-wrist-curl","seed-ez-bar-curl"], // 바벨 리버스 컬
  "seed-farmer-s-walk": ["seed-barbell-shrug","seed-dumbbell-shrug","seed-wrist-curl","seed-reverse-wrist-curl"], // 덤벨 파머스 워크
  "seed-barbell-squat": ["seed-front-squat","seed-smith-machine-squat","seed-hack-squat","seed-leg-press","seed-goblet-squat"], // 바벨 스쿼트
  "seed-front-squat": ["seed-barbell-squat","seed-goblet-squat","seed-hack-squat","seed-smith-machine-squat","seed-leg-press"], // 바벨 프론트 스쿼트
  "seed-hack-squat": ["seed-leg-press","seed-smith-machine-squat","seed-barbell-squat","seed-front-squat","seed-leg-extension"], // 핵 스쿼트
  "seed-leg-press": ["seed-hack-squat","seed-smith-machine-squat","seed-barbell-squat","seed-goblet-squat","seed-leg-extension","seed-bulgarian-split-squat"], // 레그 프레스
  "seed-leg-extension": ["seed-hack-squat","seed-leg-press","seed-goblet-squat","seed-bulgarian-split-squat","seed-lunge"], // 레그 익스텐션
  "seed-goblet-squat": ["seed-front-squat","seed-barbell-squat","seed-leg-press","seed-bulgarian-split-squat","seed-lunge"], // 덤벨 고블릿 스쿼트
  "seed-lunge": ["seed-walking-lunge","seed-bulgarian-split-squat","seed-step-up","seed-goblet-squat","seed-leg-press"], // 덤벨 런지
  "seed-walking-lunge": ["seed-lunge","seed-bulgarian-split-squat","seed-step-up","seed-goblet-squat","seed-leg-press"], // 덤벨 워킹 런지
  "seed-bulgarian-split-squat": ["seed-lunge","seed-walking-lunge","seed-step-up","seed-goblet-squat","seed-leg-press"], // 덤벨 불가리안 스플릿 스쿼트
  "seed-smith-machine-squat": ["seed-hack-squat","seed-barbell-squat","seed-leg-press","seed-front-squat","seed-goblet-squat"], // 스미스 스쿼트
  "seed-step-up": ["seed-lunge","seed-walking-lunge","seed-bulgarian-split-squat","seed-goblet-squat","seed-leg-press"], // 덤벨 스텝업
  "seed-romanian-deadlift": ["seed-stiff-leg-deadlift","seed-good-morning","seed-deadlift","seed-kettlebell-swing","seed-lying-leg-curl","seed-seated-leg-curl"], // 바벨 루마니안 데드리프트
  "seed-stiff-leg-deadlift": ["seed-romanian-deadlift","seed-good-morning","seed-deadlift","seed-nordic-curl","seed-lying-leg-curl","seed-kettlebell-swing"], // 바벨 스티프 레그 데드리프트
  "seed-lying-leg-curl": ["seed-seated-leg-curl","seed-nordic-curl","seed-romanian-deadlift","seed-stiff-leg-deadlift"], // 라잉 레그 컬
  "seed-seated-leg-curl": ["seed-lying-leg-curl","seed-nordic-curl","seed-romanian-deadlift","seed-stiff-leg-deadlift"], // 시티드 레그 컬
  "seed-nordic-curl": ["seed-lying-leg-curl","seed-seated-leg-curl","seed-stiff-leg-deadlift","seed-romanian-deadlift"], // 노르딕 컬
  "seed-hip-thrust": ["seed-glute-bridge","seed-kettlebell-swing","seed-cable-kickback","seed-romanian-deadlift","seed-stiff-leg-deadlift"], // 바벨 힙 쓰러스트
  "seed-glute-bridge": ["seed-hip-thrust","seed-kettlebell-swing","seed-cable-kickback","seed-romanian-deadlift","seed-hip-abduction-machine"], // 바벨 글루트 브릿지
  "seed-cable-kickback": ["seed-hip-abduction-machine","seed-glute-bridge","seed-hip-thrust","seed-kettlebell-swing"], // 케이블 글루트 킥백
  "seed-hip-abduction-machine": ["seed-cable-kickback","seed-glute-bridge","seed-hip-thrust","seed-kettlebell-swing"], // 머신 힙 어브덕션
  "seed-kettlebell-swing": ["seed-romanian-deadlift","seed-hip-thrust","seed-glute-bridge","seed-stiff-leg-deadlift","seed-deadlift"], // 케틀벨 스윙
  "seed-standing-calf-raise": ["seed-leg-press-calf-raise","seed-seated-calf-raise","seed-dumbbell-calf-raise"], // 머신 카프 레이즈
  "seed-seated-calf-raise": ["seed-standing-calf-raise","seed-leg-press-calf-raise","seed-dumbbell-calf-raise"], // 머신 시티드 카프 레이즈
  "seed-leg-press-calf-raise": ["seed-standing-calf-raise","seed-seated-calf-raise","seed-dumbbell-calf-raise"], // 레그 프레스 카프 레이즈
  "seed-dumbbell-calf-raise": ["seed-standing-calf-raise","seed-leg-press-calf-raise","seed-seated-calf-raise"], // 덤벨 카프 레이즈
  "seed-plank": ["seed-side-plank","seed-ab-wheel-rollout","seed-mountain-climber"], // 플랭크
  "seed-side-plank": ["seed-plank","seed-russian-twist","seed-bicycle-crunch","seed-mountain-climber"], // 사이드 플랭크
  "seed-crunch": ["seed-cable-crunch","seed-decline-sit-up","seed-reverse-crunch","seed-bicycle-crunch","seed-hanging-leg-raise"], // 크런치
  "seed-bicycle-crunch": ["seed-crunch","seed-russian-twist","seed-reverse-crunch","seed-mountain-climber","seed-hanging-leg-raise"], // 바이시클 크런치
  "seed-hanging-leg-raise": ["seed-reverse-crunch","seed-decline-sit-up","seed-crunch","seed-cable-crunch","seed-ab-wheel-rollout"], // 행잉 레그 레이즈
  "seed-reverse-crunch": ["seed-hanging-leg-raise","seed-crunch","seed-decline-sit-up","seed-bicycle-crunch","seed-cable-crunch"], // 리버스 크런치
  "seed-cable-crunch": ["seed-crunch","seed-decline-sit-up","seed-hanging-leg-raise","seed-reverse-crunch","seed-ab-wheel-rollout"], // 케이블 크런치
  "seed-russian-twist": ["seed-bicycle-crunch","seed-side-plank","seed-mountain-climber"], // 러시안 트위스트
  "seed-ab-wheel-rollout": ["seed-plank","seed-hanging-leg-raise","seed-cable-crunch","seed-crunch","seed-reverse-crunch"], // 앱 휠 롤아웃
  "seed-decline-sit-up": ["seed-crunch","seed-cable-crunch","seed-hanging-leg-raise","seed-reverse-crunch","seed-bicycle-crunch"], // 디클라인 싯업
  "seed-mountain-climber": ["seed-plank","seed-bicycle-crunch","seed-russian-twist","seed-hanging-leg-raise","seed-reverse-crunch"], // 마운틴 클라이머
  "seed-barbell-shrug": ["seed-dumbbell-shrug","seed-rack-pull","seed-farmer-s-walk","seed-upright-row"], // 바벨 슈러그
  "seed-dumbbell-shrug": ["seed-barbell-shrug","seed-farmer-s-walk","seed-upright-row","seed-rack-pull"], // 덤벨 슈러그
  "seed-power-clean": ["seed-clean-and-jerk","seed-snatch","seed-deadlift","seed-thruster","seed-kettlebell-swing"], // 바벨 파워 클린
  "seed-clean-and-jerk": ["seed-power-clean","seed-snatch","seed-thruster","seed-kettlebell-swing","seed-deadlift"], // 바벨 클린 앤 저크
  "seed-snatch": ["seed-power-clean","seed-clean-and-jerk","seed-thruster","seed-kettlebell-swing","seed-deadlift"], // 바벨 스내치
  "seed-thruster": ["seed-power-clean","seed-clean-and-jerk","seed-overhead-press","seed-goblet-squat","seed-burpee"], // 바벨 쓰러스터
  "seed-burpee": ["seed-mountain-climber","seed-thruster","seed-battle-rope","seed-kettlebell-swing","seed-rowing-machine"], // 버피
  "seed-battle-rope": ["seed-kettlebell-swing","seed-rowing-machine","seed-burpee","seed-mountain-climber"], // 배틀 로프
  "seed-rowing-machine": ["seed-battle-rope","seed-burpee","seed-kettlebell-swing","seed-seated-cable-row","seed-mountain-climber"], // 로잉 머신
  "seed-decline-push-up": ["seed-push-up","seed-pike-push-up","seed-deficit-push-up","seed-incline-press-dumbbell","seed-incline-press"], // 디클라인 푸시업
  "seed-clap-push-up": ["seed-push-up","seed-deficit-push-up","seed-dumbbell-bench-press","seed-barbell-bench-press"], // 클랩 푸시업
  "seed-kneeling-push-up": ["seed-incline-push-up","seed-push-up","seed-chest-press-machine","seed-dumbbell-bench-press"], // 닐링 푸시업
  "seed-one-arm-push-up": ["seed-deficit-push-up","seed-clap-push-up","seed-chest-press-machine","seed-push-up","seed-dumbbell-bench-press"], // 원암 푸시업
  "seed-plank-push-up": ["seed-push-up","seed-plank","seed-shoulder-taps","seed-mountain-climber"], // 플랭크 푸시업
  "seed-ring-push-up": ["seed-push-up","seed-deficit-push-up","seed-ring-dip","seed-dumbbell-bench-press"], // 링 푸시업
  "seed-floor-press": ["seed-barbell-bench-press","seed-dumbbell-bench-press","seed-close-grip-bench-press","seed-dumbbell-squeeze-press","seed-push-up"], // 바벨 플로어 프레스
  "seed-dumbbell-squeeze-press": ["seed-svend-press","seed-dumbbell-bench-press","seed-close-grip-bench-press","seed-pec-deck-fly","seed-diamond-push-up"], // 덤벨 스퀴즈 프레스
  "seed-svend-press": ["seed-dumbbell-squeeze-press","seed-pec-deck-fly","seed-cable-crossover","seed-diamond-push-up"], // 플레이트 스벤드 프레스
  "seed-decline-dumbbell-fly": ["seed-cable-crossover","seed-dumbbell-fly","seed-pec-deck-fly","seed-decline-dumbbell-press","seed-dips"], // 덤벨 디클라인 플라이
  "seed-seated-cable-fly": ["seed-pec-deck-fly","seed-cable-crossover","seed-dumbbell-fly","seed-low-cable-fly"], // 케이블 시티드 플라이
  "seed-dumbbell-around-the-world": ["seed-dumbbell-fly","seed-incline-dumbbell-fly","seed-cable-crossover","seed-pec-deck-fly"], // 덤벨 어라운드 더 월드
  "seed-ring-dip": ["seed-dips","seed-assisted-dip","seed-dip-machine","seed-ring-push-up","seed-close-grip-bench-press"], // 링 딥스
  "seed-landmine-row": ["seed-t-bar-row","seed-barbell-row","seed-meadows-row","seed-dumbbell-row","seed-machine-row"], // 랜드마인 로우
  "seed-meadows-row": ["seed-dumbbell-row","seed-landmine-row","seed-t-bar-row","seed-barbell-row","seed-machine-row"], // 메도우스 로우
  "seed-seal-row": ["seed-chest-supported-row","seed-chest-supported-row-dumbbell","seed-chest-supported-t-bar-row","seed-machine-row","seed-barbell-row"], // 바벨 씰 로우
  "seed-gorilla-row": ["seed-dumbbell-row","seed-renegade-row","seed-barbell-row","seed-pendlay-row"], // 케틀벨 고릴라 로우
  "seed-renegade-row": ["seed-dumbbell-row","seed-gorilla-row","seed-inverted-row","seed-shoulder-taps"], // 덤벨 레니게이드 로우
  "seed-machine-pullover": ["seed-dumbbell-pullover","seed-straight-arm-pulldown","seed-lat-pulldown"], // 머신 풀오버
  "seed-negative-pull-up": ["seed-assisted-pull-up","seed-lat-pulldown","seed-inverted-row","seed-scapular-pull-up","seed-dead-hang"], // 네거티브 풀업
  "seed-scapular-pull-up": ["seed-dead-hang","seed-negative-pull-up","seed-straight-arm-pulldown","seed-assisted-pull-up"], // 스캐퓰러 풀업
  "seed-kipping-pull-up": ["seed-pull-up","seed-assisted-pull-up","seed-negative-pull-up","seed-lat-pulldown"], // 키핑 풀업
  "seed-sternum-pull-up": ["seed-pull-up","seed-chin-up","seed-inverted-row","seed-lat-pulldown"], // 스터넘 풀업
  "seed-muscle-up": ["seed-pull-up","seed-dips","seed-kipping-pull-up","seed-ring-pull-up","seed-negative-pull-up"], // 머슬업
  "seed-ring-pull-up": ["seed-pull-up","seed-chin-up","seed-assisted-pull-up","seed-lat-pulldown"], // 링 풀업
  "seed-dead-hang": ["seed-scapular-pull-up","seed-farmer-s-walk","seed-negative-pull-up","seed-wrist-roller"], // 데드 행
  "seed-back-extension-machine": ["seed-hyperextension","seed-good-morning","seed-romanian-deadlift","seed-superman","seed-reverse-hyperextension"], // 머신 백 익스텐션
  "seed-superman": ["seed-hyperextension","seed-back-extension-machine","seed-bird-dog","seed-reverse-hyperextension","seed-good-morning"], // 슈퍼맨
  "seed-front-lever-hold": ["seed-front-lever-raise","seed-dragon-flag","seed-straight-arm-pulldown","seed-toes-to-bar","seed-hanging-leg-raise"], // 프론트 레버 홀드
  "seed-front-lever-raise": ["seed-front-lever-hold","seed-straight-arm-pulldown","seed-dragon-flag","seed-toes-to-bar","seed-hanging-leg-raise"], // 프론트 레버 레이즈
  "seed-pike-push-up": ["seed-handstand-push-up","seed-dumbbell-shoulder-press","seed-overhead-press","seed-shoulder-press-machine","seed-arnold-press"], // 파이크 푸시업
  "seed-handstand-push-up": ["seed-pike-push-up","seed-overhead-press","seed-dumbbell-shoulder-press","seed-shoulder-press-machine","seed-push-press"], // 핸드스탠드 푸시업
  "seed-handstand-hold": ["seed-pike-push-up","seed-handstand-push-up","seed-overhead-press","seed-dumbbell-shoulder-press","seed-shoulder-taps"], // 핸드스탠드 홀드
  "seed-push-press": ["seed-overhead-press","seed-dumbbell-shoulder-press","seed-thruster","seed-shoulder-press-machine"], // 바벨 푸시 프레스
  "seed-band-pull-apart": ["seed-face-pull","seed-reverse-pec-deck","seed-rear-delt-fly","seed-cable-rear-delt-fly"], // 밴드 풀 어파트
  "seed-cable-y-raise": ["seed-chest-supported-y-raise","seed-cable-lateral-raise","seed-side-lateral-raise","seed-front-raise","seed-machine-lateral-raise"], // 케이블 Y 레이즈
  "seed-chest-supported-y-raise": ["seed-cable-y-raise","seed-side-lateral-raise","seed-cable-lateral-raise","seed-rear-delt-fly","seed-machine-lateral-raise"], // 덤벨 Y 레이즈
  "seed-plate-front-raise": ["seed-front-raise","seed-front-raise-cable","seed-front-raise-barbell","seed-overhead-plate-raise","seed-dumbbell-shoulder-press"], // 플레이트 프론트 레이즈
  "seed-overhead-plate-raise": ["seed-plate-front-raise","seed-front-raise","seed-front-raise-cable","seed-dumbbell-shoulder-press","seed-kettlebell-halo"], // 플레이트 오버헤드 레이즈
  "seed-kettlebell-halo": ["seed-kettlebell-around-the-world","seed-overhead-plate-raise","seed-arnold-press","seed-turkish-get-up"], // 케틀벨 헤일로
  "seed-drag-curl": ["seed-barbell-curl","seed-ez-bar-curl","seed-cable-curl","seed-spider-curl","seed-dumbbell-curl"], // 바벨 드래그 컬
  "seed-zottman-curl": ["seed-hammer-curl","seed-reverse-curl-dumbbell","seed-dumbbell-curl","seed-cross-body-hammer-curl","seed-reverse-barbell-curl"], // 덤벨 조트맨 컬
  "seed-cross-body-hammer-curl": ["seed-hammer-curl","seed-cable-hammer-curl","seed-zottman-curl","seed-dumbbell-curl","seed-reverse-curl-dumbbell"], // 덤벨 크로스 바디 해머 컬
  "seed-waiter-curl": ["seed-dumbbell-curl","seed-ez-bar-curl","seed-barbell-curl","seed-cable-curl","seed-plate-curl"], // 덤벨 웨이터 컬
  "seed-bicep-curl-21s": ["seed-barbell-curl","seed-ez-bar-curl","seed-dumbbell-curl","seed-cable-curl","seed-machine-curl"], // 바벨 21 컬
  "seed-overhead-cable-curl": ["seed-cable-curl","seed-spider-curl","seed-preacher-curl","seed-concentration-curl","seed-incline-dumbbell-curl"], // 케이블 오버헤드 컬
  "seed-behind-the-back-cable-curl": ["seed-cable-curl","seed-incline-dumbbell-curl","seed-drag-curl","seed-dumbbell-curl","seed-barbell-curl"], // 케이블 비하인드 백 컬
  "seed-plate-curl": ["seed-dumbbell-curl","seed-hammer-curl","seed-waiter-curl","seed-barbell-curl"], // 플레이트 컬
  "seed-triceps-extension-machine": ["seed-triceps-pushdown","seed-skull-crusher","seed-overhead-triceps-extension","seed-dip-machine"], // 머신 트라이셉스 익스텐션
  "seed-wide-elbow-triceps-press": ["seed-skull-crusher-dumbbell","seed-overhead-triceps-extension","seed-jm-press","seed-close-grip-bench-press","seed-triceps-pushdown"], // 덤벨 와이드 엘보 트라이셉스 프레스
  "seed-wrist-roller": ["seed-wrist-curl","seed-reverse-wrist-curl","seed-farmer-s-walk","seed-behind-the-back-wrist-curl","seed-dead-hang"], // 리스트 롤러
  "seed-behind-the-back-wrist-curl": ["seed-wrist-curl","seed-wrist-curl-dumbbell","seed-reverse-wrist-curl","seed-wrist-roller","seed-farmer-s-walk"], // 바벨 비하인드 백 리스트 컬
  "seed-reverse-curl-dumbbell": ["seed-reverse-barbell-curl","seed-reverse-curl-cable","seed-hammer-curl","seed-zottman-curl","seed-reverse-wrist-curl"], // 덤벨 리버스 컬
  "seed-reverse-curl-cable": ["seed-reverse-barbell-curl","seed-reverse-curl-dumbbell","seed-cable-hammer-curl","seed-hammer-curl","seed-reverse-wrist-curl"], // 케이블 리버스 컬
  "seed-shrug-machine": ["seed-barbell-shrug","seed-dumbbell-shrug","seed-cable-shrug","seed-shrug-smith","seed-farmer-s-walk"], // 머신 슈러그
  "seed-jump-shrug": ["seed-barbell-shrug","seed-deadlift-high-pull","seed-hang-clean","seed-kettlebell-high-pull","seed-dumbbell-shrug"], // 바벨 점프 슈러그
  "seed-lying-neck-curl": ["seed-face-pull","seed-barbell-shrug","seed-dumbbell-shrug"], // 라잉 넥 컬
  "seed-lying-neck-extension": ["seed-face-pull","seed-dumbbell-shrug","seed-barbell-shrug"], // 라잉 넥 익스텐션
  "seed-box-squat": ["seed-barbell-squat","seed-pause-squat","seed-smith-machine-squat","seed-hack-squat","seed-leg-press"], // 바벨 박스 스쿼트
  "seed-pause-squat": ["seed-barbell-squat","seed-box-squat","seed-front-squat","seed-smith-machine-squat"], // 바벨 포즈 스쿼트
  "seed-overhead-squat": ["seed-front-squat","seed-barbell-squat","seed-goblet-squat","seed-overhead-lunge"], // 바벨 오버헤드 스쿼트
  "seed-zercher-squat": ["seed-front-squat","seed-goblet-squat","seed-barbell-squat","seed-hack-squat"], // 바벨 저처 스쿼트
  "seed-sumo-squat": ["seed-goblet-squat","seed-sumo-deadlift","seed-barbell-squat","seed-leg-press","seed-hip-adduction-machine"], // 덤벨 스모 스쿼트
  "seed-pistol-squat": ["seed-bulgarian-split-squat","seed-split-squat","seed-step-up","seed-leg-press","seed-goblet-squat"], // 피스톨 스쿼트
  "seed-wall-sit": ["seed-leg-extension","seed-sissy-squat","seed-goblet-squat","seed-leg-press"], // 월 싯
  "seed-jump-squat": ["seed-box-jump","seed-jump-lunge","seed-frog-jump","seed-barbell-squat"], // 점프 스쿼트
  "seed-box-jump": ["seed-jump-squat","seed-lateral-box-jump","seed-frog-jump","seed-step-up"], // 박스 점프
  "seed-lateral-box-jump": ["seed-box-jump","seed-jump-squat","seed-lateral-lunge","seed-lateral-squat","seed-frog-jump"], // 레터럴 박스 점프
  "seed-frog-jump": ["seed-jump-squat","seed-box-jump","seed-jump-lunge","seed-burpee"], // 프로그 점프
  "seed-lateral-squat": ["seed-lateral-lunge","seed-curtsy-lunge","seed-sumo-squat","seed-goblet-squat"], // 레터럴 스쿼트
  "seed-reverse-lunge": ["seed-lunge","seed-walking-lunge","seed-split-squat","seed-bulgarian-split-squat","seed-step-up"], // 리버스 런지
  "seed-lateral-lunge": ["seed-lateral-squat","seed-curtsy-lunge","seed-lunge","seed-hip-abduction-machine"], // 레터럴 런지
  "seed-curtsy-lunge": ["seed-reverse-lunge","seed-lateral-lunge","seed-bulgarian-split-squat","seed-step-up"], // 커시 런지
  "seed-jump-lunge": ["seed-jump-squat","seed-box-jump","seed-walking-lunge","seed-reverse-lunge"], // 점프 런지
  "seed-overhead-lunge": ["seed-lunge","seed-walking-lunge","seed-overhead-squat","seed-split-squat","seed-reverse-lunge"], // 덤벨 오버헤드 런지
  "seed-split-squat": ["seed-bulgarian-split-squat","seed-lunge","seed-reverse-lunge","seed-walking-lunge","seed-step-up"], // 덤벨 스플릿 스쿼트
  "seed-glute-ham-raise": ["seed-nordic-curl","seed-lying-leg-curl","seed-romanian-deadlift","seed-stiff-leg-deadlift","seed-hyperextension"], // 글루트 햄 레이즈
  "seed-standing-leg-curl": ["seed-lying-leg-curl","seed-seated-leg-curl","seed-nordic-curl","seed-romanian-deadlift"], // 스탠딩 레그 컬
  "seed-cable-pull-through": ["seed-romanian-deadlift","seed-kettlebell-swing","seed-hip-thrust","seed-good-morning","seed-glute-bridge"], // 케이블 풀 스루
  "seed-reverse-hyperextension": ["seed-hyperextension","seed-back-extension-machine","seed-glute-bridge","seed-hip-thrust","seed-cable-pull-through"], // 리버스 하이퍼익스텐션
  "seed-hip-thrust-dumbbell": ["seed-hip-thrust","seed-hip-thrust-machine","seed-smith-hip-thrust","seed-glute-bridge","seed-cable-pull-through"], // 덤벨 힙 쓰러스트
  "seed-fire-hydrant": ["seed-clamshell","seed-cable-hip-abduction","seed-hip-abduction-machine","seed-lateral-band-walk","seed-lateral-leg-raise"], // 파이어 하이드런트
  "seed-clamshell": ["seed-fire-hydrant","seed-hip-abduction-machine","seed-cable-hip-abduction","seed-lateral-band-walk","seed-lateral-leg-raise"], // 클램셸
  "seed-frog-pump": ["seed-glute-bridge","seed-hip-thrust-dumbbell","seed-hip-thrust","seed-cable-pull-through"], // 덤벨 프로그 펌프
  "seed-bird-dog": ["seed-superman","seed-dead-bug","seed-glute-kickback","seed-plank"], // 버드 독
  "seed-glute-kickback-machine": ["seed-cable-kickback","seed-glute-kickback","seed-hip-thrust","seed-glute-bridge","seed-cable-pull-through"], // 머신 글루트 킥백
  "seed-glute-kickback": ["seed-cable-kickback","seed-glute-kickback-machine","seed-fire-hydrant","seed-glute-bridge","seed-hip-thrust-dumbbell"], // 글루트 킥백
  "seed-cable-hip-abduction": ["seed-hip-abduction-machine","seed-lateral-band-walk","seed-clamshell","seed-lateral-leg-raise","seed-fire-hydrant"], // 케이블 힙 어브덕션
  "seed-cable-hip-adduction": ["seed-hip-adduction-machine","seed-sumo-squat","seed-sumo-deadlift","seed-lateral-lunge"], // 케이블 힙 어덕션
  "seed-lateral-leg-raise": ["seed-clamshell","seed-fire-hydrant","seed-cable-hip-abduction","seed-hip-abduction-machine","seed-lateral-band-walk"], // 레터럴 레그 레이즈
  "seed-lateral-band-walk": ["seed-cable-hip-abduction","seed-hip-abduction-machine","seed-clamshell","seed-lateral-leg-raise","seed-fire-hydrant"], // 밴드 레터럴 워크
  "seed-shoulder-taps": ["seed-plank","seed-spiderman-plank","seed-mountain-climber","seed-dead-bug","seed-pallof-press"], // 숄더 탭
  "seed-dead-bug": ["seed-bird-dog","seed-plank","seed-hollow-rock","seed-lying-knee-raise","seed-ab-wheel-rollout"], // 데드 버그
  "seed-v-sit-up": ["seed-sit-up","seed-toe-touch","seed-hanging-leg-raise","seed-decline-sit-up","seed-hollow-rock"], // V 싯업
  "seed-hollow-rock": ["seed-dead-bug","seed-v-sit-up","seed-flutter-kick","seed-l-sit-hold","seed-ab-wheel-rollout"], // 할로우 락
  "seed-flutter-kick": ["seed-scissor-kick","seed-lying-leg-raise","seed-lying-knee-raise","seed-hollow-rock","seed-reverse-crunch"], // 플러터 킥
  "seed-scissor-kick": ["seed-flutter-kick","seed-lying-leg-raise","seed-reverse-crunch","seed-hollow-rock","seed-lying-knee-raise"], // 시저 킥
  "seed-toe-touch": ["seed-crunch","seed-v-sit-up","seed-sit-up","seed-cable-crunch","seed-reverse-crunch"], // 토 터치
  "seed-heel-tap": ["seed-side-crunch","seed-russian-twist","seed-bicycle-crunch","seed-side-bend","seed-side-plank"], // 힐 터치
  "seed-side-crunch": ["seed-heel-tap","seed-bicycle-crunch","seed-russian-twist","seed-side-bend","seed-side-plank"], // 사이드 크런치
  "seed-side-bend": ["seed-side-crunch","seed-side-plank","seed-russian-twist","seed-cable-woodchopper","seed-heel-tap"], // 덤벨 사이드 벤드
  "seed-decline-crunch": ["seed-decline-sit-up","seed-crunch","seed-cable-crunch","seed-ab-crunch-machine","seed-reverse-crunch"], // 디클라인 크런치
  "seed-lying-knee-raise": ["seed-lying-leg-raise","seed-reverse-crunch","seed-hanging-knee-raise","seed-flutter-kick","seed-dead-bug"], // 라잉 니 레이즈
  "seed-hanging-knee-raise": ["seed-hanging-leg-raise","seed-parallel-bar-knee-raise","seed-lying-knee-raise","seed-toes-to-bar","seed-reverse-crunch"], // 행잉 니 레이즈
  "seed-parallel-bar-knee-raise": ["seed-hanging-knee-raise","seed-parallel-bar-leg-raise","seed-hanging-leg-raise","seed-lying-knee-raise","seed-reverse-crunch"], // 패러럴 바 니 레이즈
  "seed-parallel-bar-leg-raise": ["seed-hanging-leg-raise","seed-parallel-bar-knee-raise","seed-lying-leg-raise","seed-toes-to-bar","seed-reverse-crunch"], // 패러럴 바 레그 레이즈
  "seed-dragon-flag": ["seed-hanging-leg-raise","seed-toes-to-bar","seed-ab-wheel-rollout","seed-hollow-rock","seed-lying-leg-raise"], // 드래곤 플래그
  "seed-reverse-plank": ["seed-plank","seed-glute-bridge","seed-side-plank","seed-superman","seed-bird-dog"], // 리버스 플랭크
  "seed-elbow-to-knee": ["seed-bicycle-crunch","seed-side-crunch","seed-russian-twist","seed-mountain-climber","seed-crunch"], // 엘보 투 니
  "seed-spiderman-plank": ["seed-plank","seed-mountain-climber","seed-shoulder-taps","seed-side-plank","seed-elbow-to-knee"], // 스파이더맨 플랭크
  "seed-pallof-press": ["seed-cable-woodchopper","seed-russian-twist","seed-landmine-180","seed-torso-rotation-machine","seed-side-plank"], // 케이블 팔로프 프레스
  "seed-landmine-180": ["seed-cable-woodchopper","seed-pallof-press","seed-russian-twist","seed-torso-rotation-machine","seed-medicine-ball-slam"], // 랜드마인 180
  "seed-toes-to-bar": ["seed-hanging-leg-raise","seed-hanging-knee-raise","seed-parallel-bar-leg-raise","seed-lying-leg-raise","seed-dragon-flag"], // 토즈 투 바
  "seed-l-sit-hold": ["seed-hollow-rock","seed-parallel-bar-leg-raise","seed-hanging-leg-raise","seed-v-sit-up","seed-plank"], // L-싯 홀드
  "seed-torso-rotation-machine": ["seed-cable-woodchopper","seed-russian-twist","seed-pallof-press","seed-landmine-180","seed-bicycle-crunch"], // 머신 토르소 로테이션
  "seed-deadlift-high-pull": ["seed-kettlebell-high-pull","seed-clean-pull","seed-kettlebell-swing","seed-upright-row","seed-jump-shrug"], // 바벨 데드리프트 하이 풀
  "seed-hang-clean": ["seed-power-clean","seed-clean-pull","seed-clean-and-jerk","seed-kettlebell-swing","seed-jump-shrug"], // 바벨 행 클린
  "seed-clean-and-press": ["seed-clean-and-jerk","seed-thruster","seed-push-press","seed-power-clean","seed-landmine-squat-to-press"], // 바벨 클린 앤 프레스
  "seed-clean-pull": ["seed-deadlift-high-pull","seed-power-clean","seed-jump-shrug","seed-deadlift","seed-kettlebell-swing"], // 바벨 클린 풀
  "seed-power-snatch": ["seed-snatch","seed-hang-snatch","seed-power-clean","seed-kettlebell-swing","seed-deadlift-high-pull"], // 바벨 파워 스내치
  "seed-hang-snatch": ["seed-power-snatch","seed-snatch","seed-hang-clean","seed-kettlebell-swing","seed-deadlift-high-pull"], // 바벨 행 스내치
  "seed-split-jerk": ["seed-push-press","seed-clean-and-jerk","seed-press-under","seed-thruster","seed-overhead-press"], // 바벨 스플릿 저크
  "seed-press-under": ["seed-split-jerk","seed-push-press","seed-overhead-squat","seed-overhead-press"], // 바벨 프레스 언더
  "seed-landmine-squat-to-press": ["seed-thruster","seed-landmine-press","seed-clean-and-press","seed-goblet-squat","seed-push-press"], // 랜드마인 스쿼트 앤 프레스
  "seed-kettlebell-high-pull": ["seed-deadlift-high-pull","seed-kettlebell-swing","seed-upright-row-dumbbell","seed-clean-pull","seed-jump-shrug"], // 케틀벨 하이 풀
  "seed-turkish-get-up": ["seed-overhead-lunge","seed-kettlebell-halo","seed-overhead-squat","seed-suitcase-carry"], // 케틀벨 터키시 겟업
  "seed-kettlebell-around-the-world": ["seed-kettlebell-halo","seed-dumbbell-around-the-world","seed-russian-twist","seed-pallof-press"], // 케틀벨 어라운드 더 월드
  "seed-sled-push": ["seed-walking-lunge","seed-leg-press","seed-bear-crawl","seed-farmer-s-walk","seed-step-up"], // 슬레드 푸시
  "seed-sled-pull": ["seed-farmer-s-walk","seed-seated-cable-row","seed-inverted-row","seed-kettlebell-swing"], // 슬레드 풀
  "seed-suitcase-carry": ["seed-farmer-s-walk","seed-side-bend","seed-side-plank","seed-pallof-press"], // 덤벨 수트케이스 캐리
  "seed-wall-ball": ["seed-thruster","seed-medicine-ball-slam","seed-jump-squat","seed-goblet-squat","seed-push-press"], // 월 볼
  "seed-medicine-ball-slam": ["seed-wall-ball","seed-kettlebell-swing","seed-battle-rope","seed-burpee","seed-cable-woodchopper"], // 메디신 볼 슬램
  "seed-bear-crawl": ["seed-mountain-climber","seed-spiderman-plank","seed-plank","seed-sled-push","seed-burpee"], // 베어 크롤
  "seed-burpee-broad-jump": ["seed-burpee","seed-burpee-over-the-bar","seed-frog-jump","seed-box-jump","seed-jump-squat"], // 버피 브로드 점프
  "seed-burpee-over-the-bar": ["seed-burpee","seed-burpee-broad-jump","seed-lateral-box-jump","seed-box-jump","seed-jump-squat"], // 버피 오버 더 바
  "seed-jumping-jack": ["seed-high-knees","seed-mountain-climber","seed-jump-squat","seed-burpee","seed-battle-rope"], // 점핑 잭
  "seed-high-knees": ["seed-jumping-jack","seed-mountain-climber","seed-burpee","seed-jump-squat","seed-battle-rope"], // 하이 니
  "seed-incline-press-dumbbell": ["seed-incline-press","seed-incline-press-machine","seed-incline-press-smith","seed-dumbbell-bench-press","seed-incline-dumbbell-fly"], // 덤벨 인클라인 프레스
  "seed-incline-press-machine": ["seed-incline-press","seed-incline-press-dumbbell","seed-incline-press-smith","seed-chest-press-machine"], // 머신 인클라인 프레스
  "seed-incline-press-smith": ["seed-incline-press","seed-incline-press-dumbbell","seed-incline-press-machine","seed-smith-machine-bench-press","seed-chest-press-machine"], // 스미스 인클라인 프레스
  "seed-decline-chest-press-machine": ["seed-decline-barbell-press","seed-decline-dumbbell-press","seed-decline-press-smith","seed-chest-press-machine","seed-dips"], // 머신 디클라인 프레스
  "seed-lying-chest-press-machine": ["seed-chest-press-machine","seed-smith-machine-bench-press","seed-barbell-bench-press"], // 머신 라잉 체스트 프레스
  "seed-seated-cable-chest-press": ["seed-standing-cable-chest-press","seed-lying-cable-chest-press","seed-chest-press-machine","seed-cable-crossover"], // 케이블 시티드 체스트 프레스
  "seed-standing-cable-chest-press": ["seed-seated-cable-chest-press","seed-lying-cable-chest-press","seed-cable-crossover","seed-chest-press-machine","seed-push-up"], // 케이블 체스트 프레스
  "seed-lying-cable-chest-press": ["seed-seated-cable-chest-press","seed-standing-cable-chest-press","seed-chest-press-machine","seed-dumbbell-bench-press","seed-barbell-bench-press"], // 케이블 라잉 체스트 프레스
  "seed-larsen-press": ["seed-barbell-bench-press","seed-floor-press","seed-smith-machine-bench-press","seed-dumbbell-bench-press","seed-chest-press-machine"], // 바벨 라슨 프레스
  "seed-feet-up-bench-press": ["seed-barbell-bench-press","seed-larsen-press","seed-floor-press","seed-dumbbell-bench-press","seed-smith-machine-bench-press"], // 바벨 피트 업 벤치프레스
  "seed-decline-press-smith": ["seed-decline-barbell-press","seed-decline-dumbbell-press","seed-decline-chest-press-machine","seed-smith-machine-bench-press","seed-dips"], // 스미스 디클라인 프레스
  "seed-deficit-push-up": ["seed-push-up","seed-ring-push-up","seed-dumbbell-bench-press","seed-dips"], // 데피싯 푸시업
  "seed-assisted-pull-up": ["seed-pull-up","seed-lat-pulldown","seed-negative-pull-up","seed-chin-up"], // 어시스트 풀업
  "seed-high-row": ["seed-machine-row","seed-seated-cable-row","seed-low-row","seed-lat-pulldown","seed-chest-supported-row"], // 머신 하이 로우
  "seed-low-row": ["seed-seated-cable-row","seed-machine-row","seed-high-row","seed-chest-supported-row","seed-dumbbell-row"], // 머신 로우 로우
  "seed-chest-supported-row": ["seed-machine-row","seed-chest-supported-row-dumbbell","seed-chest-supported-t-bar-row","seed-seal-row","seed-seated-cable-row"], // 머신 체스트 서포티드 로우
  "seed-inverted-row": ["seed-barbell-row","seed-machine-row","seed-seated-cable-row","seed-dumbbell-row","seed-chest-supported-row"], // 인버티드 로우
  "seed-dumbbell-pullover": ["seed-machine-pullover","seed-straight-arm-pulldown","seed-lat-pulldown","seed-seated-cable-row"], // 덤벨 풀오버
  "seed-row-smith": ["seed-barbell-row","seed-pendlay-row","seed-t-bar-row","seed-machine-row","seed-seated-cable-row"], // 스미스 로우
  "seed-chest-supported-t-bar-row": ["seed-t-bar-row","seed-chest-supported-row","seed-seal-row","seed-machine-row","seed-barbell-row"], // 체스트 서포티드 티바 로우
  "seed-chest-supported-row-dumbbell": ["seed-dumbbell-row","seed-chest-supported-row","seed-seal-row","seed-machine-row","seed-seated-cable-row"], // 덤벨 체스트 서포티드 로우
  "seed-landmine-press": ["seed-overhead-press","seed-dumbbell-shoulder-press","seed-shoulder-press-machine","seed-arnold-press","seed-push-press"], // 랜드마인 프레스
  "seed-cable-rear-delt-fly": ["seed-rear-delt-fly","seed-reverse-pec-deck","seed-face-pull","seed-band-pull-apart"], // 케이블 리어 델트 플라이
  "seed-shoulder-press-smith": ["seed-overhead-press","seed-shoulder-press-machine","seed-dumbbell-shoulder-press","seed-arnold-press"], // 스미스 숄더 프레스
  "seed-front-raise-cable": ["seed-front-raise","seed-front-raise-barbell","seed-plate-front-raise","seed-cable-y-raise","seed-side-lateral-raise"], // 케이블 프론트 레이즈
  "seed-front-raise-barbell": ["seed-front-raise","seed-front-raise-cable","seed-plate-front-raise","seed-overhead-plate-raise","seed-side-lateral-raise"], // 바벨 프론트 레이즈
  "seed-upright-row-cable": ["seed-upright-row","seed-upright-row-dumbbell","seed-cable-lateral-raise","seed-side-lateral-raise","seed-face-pull"], // 케이블 업라이트 로우
  "seed-upright-row-dumbbell": ["seed-upright-row","seed-upright-row-cable","seed-side-lateral-raise","seed-cable-lateral-raise","seed-machine-lateral-raise"], // 덤벨 업라이트 로우
  "seed-assisted-chin-up": ["seed-chin-up","seed-pull-up","seed-assisted-pull-up","seed-lat-pulldown"], // 어시스트 친업
  "seed-cable-hammer-curl": ["seed-hammer-curl","seed-cross-body-hammer-curl","seed-cable-curl","seed-dumbbell-curl","seed-machine-curl"], // 케이블 해머 컬
  "seed-preacher-curl-dumbbell": ["seed-preacher-curl","seed-spider-curl","seed-incline-dumbbell-curl","seed-concentration-curl","seed-machine-curl"], // 덤벨 프리처 컬
  "seed-wrist-curl-dumbbell": ["seed-wrist-curl","seed-reverse-wrist-curl","seed-behind-the-back-wrist-curl","seed-wrist-roller","seed-farmer-s-walk"], // 덤벨 리스트 컬
  "seed-assisted-dip": ["seed-dips","seed-bench-dip","seed-dip-machine","seed-diamond-push-up","seed-triceps-pushdown"], // 어시스트 딥스
  "seed-jm-press": ["seed-skull-crusher","seed-close-grip-bench-press","seed-skull-crusher-dumbbell","seed-triceps-pushdown","seed-cable-overhead-extension"], // 바벨 JM 프레스
  "seed-dip-machine": ["seed-dips","seed-assisted-dip","seed-bench-dip","seed-triceps-extension-machine","seed-triceps-pushdown"], // 머신 딥스
  "seed-skull-crusher-dumbbell": ["seed-skull-crusher","seed-overhead-triceps-extension","seed-jm-press","seed-cable-overhead-extension","seed-triceps-pushdown"], // 덤벨 스컬크러셔
  "seed-triceps-kickback-cable": ["seed-triceps-kickback","seed-triceps-pushdown","seed-cable-overhead-extension"], // 케이블 트라이셉스 킥백
  "seed-sissy-squat": ["seed-leg-extension","seed-hack-squat","seed-leg-press","seed-pendulum-squat","seed-barbell-squat"], // 시시 스쿼트
  "seed-pendulum-squat": ["seed-hack-squat","seed-leg-press","seed-belt-squat","seed-barbell-squat","seed-smith-machine-squat"], // 펜듈럼 스쿼트
  "seed-belt-squat": ["seed-hack-squat","seed-pendulum-squat","seed-leg-press","seed-goblet-squat","seed-barbell-squat"], // 벨트 스쿼트
  "seed-lunge-barbell": ["seed-lunge","seed-lunge-smith","seed-walking-lunge","seed-bulgarian-split-squat-barbell","seed-split-squat"], // 바벨 런지
  "seed-lunge-smith": ["seed-lunge","seed-lunge-barbell","seed-bulgarian-split-squat-smith","seed-walking-lunge","seed-split-squat"], // 스미스 런지
  "seed-bulgarian-split-squat-barbell": ["seed-bulgarian-split-squat","seed-bulgarian-split-squat-smith","seed-lunge-barbell","seed-split-squat","seed-walking-lunge"], // 바벨 불가리안 스플릿 스쿼트
  "seed-bulgarian-split-squat-smith": ["seed-bulgarian-split-squat","seed-bulgarian-split-squat-barbell","seed-lunge-smith","seed-split-squat","seed-step-up"], // 스미스 불가리안 스플릿 스쿼트
  "seed-romanian-deadlift-dumbbell": ["seed-romanian-deadlift","seed-stiff-leg-deadlift","seed-good-morning","seed-glute-ham-raise","seed-kettlebell-swing"], // 덤벨 루마니안 데드리프트
  "seed-hip-adduction-machine": ["seed-cable-hip-adduction","seed-sumo-squat","seed-lateral-squat","seed-goblet-squat"], // 머신 힙 어덕션
  "seed-smith-hip-thrust": ["seed-hip-thrust","seed-hip-thrust-machine","seed-hip-thrust-dumbbell","seed-glute-bridge","seed-cable-pull-through"], // 스미스 힙 쓰러스트
  "seed-hip-thrust-machine": ["seed-hip-thrust","seed-smith-hip-thrust","seed-hip-thrust-dumbbell","seed-glute-bridge","seed-reverse-hyperextension"], // 머신 힙 쓰러스트
  "seed-lying-leg-raise": ["seed-reverse-crunch","seed-hanging-leg-raise","seed-lying-knee-raise","seed-flutter-kick","seed-parallel-bar-leg-raise"], // 라잉 레그 레이즈
  "seed-cable-woodchopper": ["seed-russian-twist","seed-pallof-press","seed-landmine-180","seed-torso-rotation-machine","seed-side-bend"], // 케이블 우드촙
  "seed-ab-crunch-machine": ["seed-cable-crunch","seed-crunch","seed-decline-crunch","seed-sit-up","seed-reverse-crunch"], // 머신 크런치
  "seed-sit-up": ["seed-crunch","seed-decline-sit-up","seed-v-sit-up","seed-ab-crunch-machine","seed-reverse-crunch"], // 싯업
  "seed-cable-shrug": ["seed-barbell-shrug","seed-dumbbell-shrug","seed-shrug-machine","seed-shrug-smith","seed-jump-shrug"], // 케이블 슈러그
  "seed-shrug-smith": ["seed-barbell-shrug","seed-dumbbell-shrug","seed-shrug-machine","seed-cable-shrug"], // 스미스 슈러그
};
