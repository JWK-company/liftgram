// 기본 운동 카탈로그 시드 (SRS-001). 한/영 명칭 + 근육군 + 기구.
// seedRunner가 매 실행 멱등 top-up(nameKo 기준 없는 종목만 추가)하므로 자유롭게 확장 가능.
import type { EquipmentType, MuscleGroup } from '../../domain';

export interface SeedExercise {
  nameKo: string;
  nameEn: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  category?: string;
}

export const SEED_EXERCISES: SeedExercise[] = [
  // ── 가슴 (chest) ───────────────────────────────────────────────
  { nameKo: '바벨 벤치프레스', nameEn: 'Barbell Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell' },
  // 인클라인 프레스 — 기구(바벨/덤벨/머신)는 변형에서 선택(#13). 머신 선택 시 브랜드.
  { nameKo: '인클라인 프레스', nameEn: 'Incline Press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'barbell' },
  { nameKo: '디클라인 바벨 프레스', nameEn: 'Decline Barbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '덤벨 벤치프레스', nameEn: 'Dumbbell Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'dumbbell' },
  { nameKo: '디클라인 덤벨 프레스', nameEn: 'Decline Dumbbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '덤벨 플라이', nameEn: 'Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
  { nameKo: '인클라인 덤벨 플라이', nameEn: 'Incline Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
  { nameKo: '케이블 크로스오버', nameEn: 'Cable Crossover', primaryMuscles: ['chest'], equipment: 'cable' },
  { nameKo: '로우 케이블 플라이', nameEn: 'Low Cable Fly', primaryMuscles: ['chest'], equipment: 'cable' },
  { nameKo: '펙 덱 플라이', nameEn: 'Pec Deck Fly', primaryMuscles: ['chest'], equipment: 'machine' },
  { nameKo: '체스트 프레스 머신', nameEn: 'Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '스미스 벤치프레스', nameEn: 'Smith Machine Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'smith' },
  { nameKo: '딥스', nameEn: 'Dips', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '푸시업', nameEn: 'Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'bodyweight' },
  { nameKo: '인클라인 푸시업', nameEn: 'Incline Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },

  // ── 등 (back) ──────────────────────────────────────────────────
  { nameKo: '데드리프트', nameEn: 'Deadlift', primaryMuscles: ['back'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { nameKo: '스모 데드리프트', nameEn: 'Sumo Deadlift', primaryMuscles: ['back'], secondaryMuscles: ['glutes', 'quads'], equipment: 'barbell' },
  { nameKo: '랙 풀', nameEn: 'Rack Pull', primaryMuscles: ['back'], secondaryMuscles: ['traps'], equipment: 'barbell' },
  { nameKo: '바벨 로우', nameEn: 'Barbell Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '펜들레이 로우', nameEn: 'Pendlay Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '티바 로우', nameEn: 'T-Bar Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '덤벨 로우', nameEn: 'Dumbbell Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '시티드 케이블 로우', nameEn: 'Seated Cable Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '랫 풀다운', nameEn: 'Lat Pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '클로즈그립 풀다운', nameEn: 'Close Grip Pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '스트레이트암 풀다운', nameEn: 'Straight Arm Pulldown', primaryMuscles: ['back'], equipment: 'cable' },
  { nameKo: '풀업', nameEn: 'Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '친업', nameEn: 'Chin Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '머신 로우', nameEn: 'Machine Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '하이퍼익스텐션', nameEn: 'Hyperextension', primaryMuscles: ['back'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'bodyweight' },
  { nameKo: '굿모닝', nameEn: 'Good Morning', primaryMuscles: ['back'], secondaryMuscles: ['hamstrings', 'glutes'], equipment: 'barbell' },

  // ── 어깨 (shoulders) ───────────────────────────────────────────
  { nameKo: '오버헤드 프레스', nameEn: 'Overhead Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '밀리터리 프레스', nameEn: 'Military Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '덤벨 숄더 프레스', nameEn: 'Dumbbell Shoulder Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '아놀드 프레스', nameEn: 'Arnold Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '숄더 프레스 머신', nameEn: 'Shoulder Press Machine', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '사이드 레터럴 레이즈', nameEn: 'Side Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '케이블 레터럴 레이즈', nameEn: 'Cable Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'cable' },
  { nameKo: '머신 레터럴 레이즈', nameEn: 'Machine Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'machine' },
  { nameKo: '프론트 레이즈', nameEn: 'Front Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '리어 델트 플라이', nameEn: 'Rear Delt Fly', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '리버스 펙 덱', nameEn: 'Reverse Pec Deck', primaryMuscles: ['shoulders'], equipment: 'machine' },
  { nameKo: '페이스 풀', nameEn: 'Face Pull', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'cable' },
  { nameKo: '업라이트 로우', nameEn: 'Upright Row', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'barbell' },

  // ── 이두 (biceps) ──────────────────────────────────────────────
  { nameKo: '바벨 컬', nameEn: 'Barbell Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '이지바 컬', nameEn: 'EZ-Bar Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '덤벨 컬', nameEn: 'Dumbbell Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '해머 컬', nameEn: 'Hammer Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { nameKo: '인클라인 덤벨 컬', nameEn: 'Incline Dumbbell Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '프리처 컬', nameEn: 'Preacher Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '컨센트레이션 컬', nameEn: 'Concentration Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '케이블 컬', nameEn: 'Cable Curl', primaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '스파이더 컬', nameEn: 'Spider Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '머신 컬', nameEn: 'Machine Curl', primaryMuscles: ['biceps'], equipment: 'machine' },

  // ── 삼두 (triceps) ─────────────────────────────────────────────
  { nameKo: '클로즈 그립 벤치프레스', nameEn: 'Close Grip Bench Press', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'barbell' },
  { nameKo: '트라이셉스 푸시다운', nameEn: 'Triceps Pushdown', primaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '로프 푸시다운', nameEn: 'Rope Pushdown', primaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '오버헤드 트라이셉스 익스텐션', nameEn: 'Overhead Triceps Extension', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '케이블 오버헤드 익스텐션', nameEn: 'Cable Overhead Extension', primaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '스컬 크러셔', nameEn: 'Skull Crusher', primaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '트라이셉스 킥백', nameEn: 'Triceps Kickback', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '벤치 딥스', nameEn: 'Bench Dip', primaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '다이아몬드 푸시업', nameEn: 'Diamond Push Up', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'bodyweight' },

  // ── 전완 (forearms) ────────────────────────────────────────────
  { nameKo: '리스트 컬', nameEn: 'Wrist Curl', primaryMuscles: ['forearms'], equipment: 'barbell' },
  { nameKo: '리버스 리스트 컬', nameEn: 'Reverse Wrist Curl', primaryMuscles: ['forearms'], equipment: 'barbell' },
  { nameKo: '리버스 바벨 컬', nameEn: 'Reverse Barbell Curl', primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '파머스 워크', nameEn: "Farmer's Walk", primaryMuscles: ['forearms'], secondaryMuscles: ['traps'], equipment: 'dumbbell' },

  // ── 대퇴사두 (quads) ───────────────────────────────────────────
  { nameKo: '바벨 스쿼트', nameEn: 'Barbell Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { nameKo: '프론트 스쿼트', nameEn: 'Front Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '하이바 스쿼트', nameEn: 'High Bar Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '핵 스쿼트', nameEn: 'Hack Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '레그 프레스', nameEn: 'Leg Press', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '레그 익스텐션', nameEn: 'Leg Extension', primaryMuscles: ['quads'], equipment: 'machine' },
  { nameKo: '고블릿 스쿼트', nameEn: 'Goblet Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '런지', nameEn: 'Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '워킹 런지', nameEn: 'Walking Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '불가리안 스플릿 스쿼트', nameEn: 'Bulgarian Split Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '스미스 스쿼트', nameEn: 'Smith Machine Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'smith' },
  { nameKo: '스텝업', nameEn: 'Step Up', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },

  // ── 햄스트링 (hamstrings) ──────────────────────────────────────
  { nameKo: '루마니안 데드리프트', nameEn: 'Romanian Deadlift', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'back'], equipment: 'barbell' },
  { nameKo: '스티프 레그 데드리프트', nameEn: 'Stiff Leg Deadlift', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '라잉 레그 컬', nameEn: 'Lying Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '시티드 레그 컬', nameEn: 'Seated Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '레그 컬', nameEn: 'Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '노르딕 컬', nameEn: 'Nordic Curl', primaryMuscles: ['hamstrings'], equipment: 'bodyweight' },

  // ── 둔근 (glutes) ──────────────────────────────────────────────
  { nameKo: '힙 쓰러스트', nameEn: 'Hip Thrust', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'barbell' },
  { nameKo: '글루트 브릿지', nameEn: 'Glute Bridge', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'barbell' },
  { nameKo: '케이블 킥백', nameEn: 'Cable Kickback', primaryMuscles: ['glutes'], equipment: 'cable' },
  { nameKo: '힙 어브덕션 머신', nameEn: 'Hip Abduction Machine', primaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '케틀벨 스윙', nameEn: 'Kettlebell Swing', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'back'], equipment: 'kettlebell' },

  // ── 종아리 (calves) ────────────────────────────────────────────
  { nameKo: '스탠딩 카프 레이즈', nameEn: 'Standing Calf Raise', primaryMuscles: ['calves'], equipment: 'machine' },
  { nameKo: '시티드 카프 레이즈', nameEn: 'Seated Calf Raise', primaryMuscles: ['calves'], equipment: 'machine' },
  { nameKo: '레그 프레스 카프 레이즈', nameEn: 'Leg Press Calf Raise', primaryMuscles: ['calves'], equipment: 'machine' },
  { nameKo: '덤벨 카프 레이즈', nameEn: 'Dumbbell Calf Raise', primaryMuscles: ['calves'], equipment: 'dumbbell' },

  // ── 복근 (abs) ─────────────────────────────────────────────────
  { nameKo: '플랭크', nameEn: 'Plank', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '사이드 플랭크', nameEn: 'Side Plank', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '크런치', nameEn: 'Crunch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '바이시클 크런치', nameEn: 'Bicycle Crunch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '행잉 레그 레이즈', nameEn: 'Hanging Leg Raise', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '리버스 크런치', nameEn: 'Reverse Crunch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '케이블 크런치', nameEn: 'Cable Crunch', primaryMuscles: ['abs'], equipment: 'cable' },
  { nameKo: '러시안 트위스트', nameEn: 'Russian Twist', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '앱 휠 롤아웃', nameEn: 'Ab Wheel Rollout', primaryMuscles: ['abs'], equipment: 'other' },
  { nameKo: '디클라인 싯업', nameEn: 'Decline Sit Up', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '마운틴 클라이머', nameEn: 'Mountain Climber', primaryMuscles: ['abs'], secondaryMuscles: ['fullBody'], equipment: 'bodyweight' },

  // ── 승모 (traps) ───────────────────────────────────────────────
  { nameKo: '바벨 슈러그', nameEn: 'Barbell Shrug', primaryMuscles: ['traps'], equipment: 'barbell' },
  { nameKo: '덤벨 슈러그', nameEn: 'Dumbbell Shrug', primaryMuscles: ['traps'], equipment: 'dumbbell' },

  // ── 전신/기타 (fullBody / other) ───────────────────────────────
  { nameKo: '바벨 클린', nameEn: 'Power Clean', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'quads'], equipment: 'barbell' },
  { nameKo: '클린 앤 저크', nameEn: 'Clean and Jerk', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'quads'], equipment: 'barbell' },
  { nameKo: '스내치', nameEn: 'Snatch', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'back'], equipment: 'barbell' },
  { nameKo: '쓰러스터', nameEn: 'Thruster', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'shoulders'], equipment: 'barbell' },
  { nameKo: '버피', nameEn: 'Burpee', primaryMuscles: ['fullBody'], equipment: 'bodyweight' },
  { nameKo: '배틀 로프', nameEn: 'Battle Rope', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders'], equipment: 'other' },
  { nameKo: '로잉 머신', nameEn: 'Rowing Machine', primaryMuscles: ['fullBody'], secondaryMuscles: ['back'], equipment: 'machine' },

  // ── 보조(어시스트) 종목 — 어시스트 머신 중량=보조하중(설정 가능). @plm SRS-001 ───
  { nameKo: '어시스트 풀업', nameEn: 'Assisted Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '어시스트 친업', nameEn: 'Assisted Chin Up', primaryMuscles: ['biceps'], secondaryMuscles: ['back'], equipment: 'machine' },
  { nameKo: '어시스트 딥스', nameEn: 'Assisted Dip', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'machine' },

  // ── 추가 상용 종목(#2) — 등 ────────────────────────────────────
  { nameKo: '하이 로우', nameEn: 'High Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '로우 로우', nameEn: 'Low Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '체스트 서포티드 로우', nameEn: 'Chest Supported Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '인버티드 로우', nameEn: 'Inverted Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '원암 랫풀다운', nameEn: 'Single-arm Lat Pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '덤벨 풀오버', nameEn: 'Dumbbell Pullover', primaryMuscles: ['back'], secondaryMuscles: ['chest'], equipment: 'dumbbell' },
  // ── 가슴 ───────────────────────────────────────────────────────
  { nameKo: '인클라인 바벨 프레스', nameEn: 'Incline Barbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'barbell' },
  { nameKo: '인클라인 덤벨 프레스', nameEn: 'Incline Dumbbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  // ── 어깨 ───────────────────────────────────────────────────────
  { nameKo: '랜드마인 프레스', nameEn: 'Landmine Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['chest', 'triceps'], equipment: 'barbell' },
  { nameKo: '케이블 리어 델트 플라이', nameEn: 'Cable Rear Delt Fly', primaryMuscles: ['shoulders'], equipment: 'cable' },
  // ── 하체 ───────────────────────────────────────────────────────
  { nameKo: '시시 스쿼트', nameEn: 'Sissy Squat', primaryMuscles: ['quads'], equipment: 'bodyweight' },
  { nameKo: '펜듈럼 스쿼트', nameEn: 'Pendulum Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '벨트 스쿼트', nameEn: 'Belt Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '힙 어덕션 머신', nameEn: 'Hip Adduction Machine', primaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '스미스 힙 쓰러스트', nameEn: 'Smith Hip Thrust', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'smith' },
  // ── 팔 ─────────────────────────────────────────────────────────
  { nameKo: 'JM 프레스', nameEn: 'JM Press', primaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '딥 머신', nameEn: 'Dip Machine', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'machine' },
  { nameKo: '케이블 해머 컬', nameEn: 'Cable Hammer Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'cable' },
  // ── 복근 ───────────────────────────────────────────────────────
  { nameKo: '라잉 레그 레이즈', nameEn: 'Lying Leg Raise', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '케이블 우드촙', nameEn: 'Cable Woodchopper', primaryMuscles: ['abs'], equipment: 'cable' },
  { nameKo: '앱 크런치 머신', nameEn: 'Ab Crunch Machine', primaryMuscles: ['abs'], equipment: 'machine' },
  // ── 승모 ───────────────────────────────────────────────────────
  { nameKo: '케이블 슈러그', nameEn: 'Cable Shrug', primaryMuscles: ['traps'], equipment: 'cable' },
];
