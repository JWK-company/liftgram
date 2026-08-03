// 기본 운동 카탈로그 시드 (SRS-001). 한/영 명칭 + 근육군 + 기구.
// seedRunner가 매 실행 멱등 top-up(nameEn=안정 키 기준 없는 종목만 추가)하므로 자유롭게 확장 가능.
// 단 신규 nameEn이 기존과 충돌하면 top-up 미생성+자동 rename으로 KEY 계약이 깨진다(catalogGap 슬러그 유일성 테스트가 강제).
import type { EquipmentType, ExerciseKind, LoadMode, MuscleGroup } from '../../domain';

export interface SeedExercise {
  nameKo: string;
  nameEn: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  category?: string;
  kind?: ExerciseKind; // v10: 'cardio'=유산소(시간·거리 기록). 미지정=근력. @plm SRS-030
  loadMode?: LoadMode; // v12: 'assisted'(체중-무게)|'bodyweight'(체중+무게). 미지정=기구로 파생. @plm SRS-033
}

export const SEED_EXERCISES: SeedExercise[] = [
  // ── 가슴 (chest) ───────────────────────────────────────────────
  { nameKo: '바벨 벤치프레스', nameEn: 'Barbell Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell' },
  // 인클라인 프레스 — 다기구: 기구별 별도 엔트리(리스트 '인클라인 프레스 (기구)' → 루틴선 '인클라인 프레스'+기구 태그). @plm SRS-028
  // (바벨 엔트리는 nameEn='Incline Press' 유지 → id 불변·기존 기록 보존. 나머지는 paren형 신규 nameEn으로 과거 soft-delete와 id 충돌 회피.)
  { nameKo: '인클라인 프레스 (바벨)', nameEn: 'Incline Press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'barbell' },
  { nameKo: '인클라인 프레스 (덤벨)', nameEn: 'Incline Press (Dumbbell)', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { nameKo: '인클라인 프레스 (머신)', nameEn: 'Incline Press (Machine)', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'machine' },
  { nameKo: '인클라인 프레스 (스미스)', nameEn: 'Incline Press (Smith)', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'smith' },
  { nameKo: '디클라인 프레스 (바벨)', nameEn: 'Decline Barbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '덤벨 벤치프레스', nameEn: 'Dumbbell Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'dumbbell' },
  { nameKo: '디클라인 프레스 (덤벨)', nameEn: 'Decline Dumbbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
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
  { nameKo: '덤벨 레터럴 레이즈', nameEn: 'Side Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '케이블 레터럴 레이즈', nameEn: 'Cable Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'cable' },
  { nameKo: '머신 레터럴 레이즈', nameEn: 'Machine Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'machine' },
  { nameKo: '프론트 레이즈 (덤벨)', nameEn: 'Front Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '덤벨 리어 델트 플라이', nameEn: 'Rear Delt Fly', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '리버스 펙 덱', nameEn: 'Reverse Pec Deck', primaryMuscles: ['shoulders'], equipment: 'machine' },
  { nameKo: '페이스 풀', nameEn: 'Face Pull', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'cable' },
  { nameKo: '업라이트 로우 (바벨)', nameEn: 'Upright Row', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'barbell' },

  // ── 이두 (biceps) ──────────────────────────────────────────────
  { nameKo: '바벨 컬', nameEn: 'Barbell Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '이지바 컬', nameEn: 'EZ-Bar Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '덤벨 컬', nameEn: 'Dumbbell Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '해머 컬 (덤벨)', nameEn: 'Hammer Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { nameKo: '인클라인 덤벨 컬', nameEn: 'Incline Dumbbell Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '프리처 컬 (바벨)', nameEn: 'Preacher Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
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
  { nameKo: '스컬 크러셔 (바벨)', nameEn: 'Skull Crusher', primaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '트라이셉스 킥백 (덤벨)', nameEn: 'Triceps Kickback', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '벤치 딥스', nameEn: 'Bench Dip', primaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '다이아몬드 푸시업', nameEn: 'Diamond Push Up', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'bodyweight' },

  // ── 전완 (forearms) ────────────────────────────────────────────
  { nameKo: '리스트 컬 (바벨)', nameEn: 'Wrist Curl', primaryMuscles: ['forearms'], equipment: 'barbell' },
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
  { nameKo: '런지 (덤벨)', nameEn: 'Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '워킹 런지', nameEn: 'Walking Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '불가리안 스플릿 스쿼트 (덤벨)', nameEn: 'Bulgarian Split Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '스미스 스쿼트', nameEn: 'Smith Machine Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'smith' },
  { nameKo: '스텝업', nameEn: 'Step Up', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },

  // ── 햄스트링 (hamstrings) ──────────────────────────────────────
  { nameKo: '루마니안 데드리프트 (바벨)', nameEn: 'Romanian Deadlift', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'back'], equipment: 'barbell' },
  { nameKo: '스티프 레그 데드리프트', nameEn: 'Stiff Leg Deadlift', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '라잉 레그 컬', nameEn: 'Lying Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '시티드 레그 컬', nameEn: 'Seated Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '레그 컬', nameEn: 'Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '노르딕 컬', nameEn: 'Nordic Curl', primaryMuscles: ['hamstrings'], equipment: 'bodyweight' },

  // ── 둔근 (glutes) ──────────────────────────────────────────────
  { nameKo: '힙 쓰러스트 (바벨)', nameEn: 'Hip Thrust', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'barbell' },
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

  // ── 보조(어시스트) 종목 — 중량=보조하중, 유효무게=체중-보조하중(loadMode='assisted'). @plm SRS-001 SRS-033 ───
  { nameKo: '어시스트 풀업', nameEn: 'Assisted Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine', loadMode: 'assisted' },
  { nameKo: '어시스트 친업', nameEn: 'Assisted Chin Up', primaryMuscles: ['biceps'], secondaryMuscles: ['back'], equipment: 'machine', loadMode: 'assisted' },
  { nameKo: '어시스트 딥스', nameEn: 'Assisted Dip', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'machine', loadMode: 'assisted' },

  // ── 추가 상용 종목(#2) — 등 ────────────────────────────────────
  { nameKo: '하이 로우', nameEn: 'High Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '로우 로우', nameEn: 'Low Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '체스트 서포티드 로우', nameEn: 'Chest Supported Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'machine' },
  { nameKo: '인버티드 로우', nameEn: 'Inverted Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '원암 랫풀다운', nameEn: 'Single-arm Lat Pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '덤벨 풀오버', nameEn: 'Dumbbell Pullover', primaryMuscles: ['back'], secondaryMuscles: ['chest'], equipment: 'dumbbell' },
  // 주의: '인클라인 바벨/덤벨 프레스'는 consolidateExercisesV8이 '인클라인 프레스'(기구 변형)로 흡수하는
  // 통합 소스라 시드에 두면 안 됨(생성→soft-delete→재부팅 재생성 시 id 충돌). 인클라인은 변형에서 선택.
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

  // ── 유산소 (cardio) — 시간·거리 기록. 볼륨/PR 제외. @plm SRS-030 ────
  // 주의: '로잉 머신'은 기존 시드(근력)라 여기 다시 넣지 않고 backfillCardioKindV10이 kind='cardio'로 승격.
  // 러닝머신 — 경사·속도 기록(nameEn 'Treadmill Running' 유지로 기존 기록·id 승계, nameKo만 갱신). @plm SRS-030
  { nameKo: '러닝머신', nameEn: 'Treadmill Running', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'calves'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '러닝', nameEn: 'Running', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'calves'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '걷기', nameEn: 'Walking', primaryMuscles: ['fullBody'], secondaryMuscles: ['calves'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '실내 사이클', nameEn: 'Indoor Cycling', primaryMuscles: ['quads'], secondaryMuscles: ['calves'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '일립티컬', nameEn: 'Elliptical', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '천국의 계단', nameEn: 'Stair Climber', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'calves'], equipment: 'machine', kind: 'cardio' }, // 구 '스텝밀' — nameEn 유지로 기록 승계
  { nameKo: '줄넘기', nameEn: 'Jump Rope', primaryMuscles: ['calves'], secondaryMuscles: ['fullBody'], equipment: 'other', kind: 'cardio' },
  { nameKo: '어썰트 바이크', nameEn: 'Assault Bike', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '스텝퍼', nameEn: 'Stepper', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'calves'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '스키에르그', nameEn: 'SkiErg', primaryMuscles: ['back'], secondaryMuscles: ['triceps', 'fullBody'], equipment: 'machine', kind: 'cardio' },
  // ── 다기구 변형 보강 (SRS-028) — 리스트엔 기구별 별도, 루틴선 베이스명+기구 태그. paren형 novel nameEn(id 충돌 회피). ──
  { nameKo: '로우 (스미스)', nameEn: 'Row (Smith)', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'smith' },
  { nameKo: '숄더 프레스 (스미스)', nameEn: 'Shoulder Press (Smith)', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'smith' },
  { nameKo: '프론트 레이즈 (케이블)', nameEn: 'Front Raise (Cable)', primaryMuscles: ['shoulders'], equipment: 'cable' },
  { nameKo: '프론트 레이즈 (바벨)', nameEn: 'Front Raise (Barbell)', primaryMuscles: ['shoulders'], equipment: 'barbell' },
  { nameKo: '업라이트 로우 (케이블)', nameEn: 'Upright Row (Cable)', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'cable' },
  { nameKo: '업라이트 로우 (덤벨)', nameEn: 'Upright Row (Dumbbell)', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'dumbbell' },
  { nameKo: '프리처 컬 (덤벨)', nameEn: 'Preacher Curl (Dumbbell)', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '스컬 크러셔 (덤벨)', nameEn: 'Skull Crusher (Dumbbell)', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '트라이셉스 킥백 (케이블)', nameEn: 'Triceps Kickback (Cable)', primaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '리스트 컬 (덤벨)', nameEn: 'Wrist Curl (Dumbbell)', primaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { nameKo: '런지 (바벨)', nameEn: 'Lunge (Barbell)', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '런지 (스미스)', nameEn: 'Lunge (Smith)', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'smith' },
  { nameKo: '불가리안 스플릿 스쿼트 (바벨)', nameEn: 'Bulgarian Split Squat (Barbell)', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '불가리안 스플릿 스쿼트 (스미스)', nameEn: 'Bulgarian Split Squat (Smith)', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'smith' },
  { nameKo: '루마니안 데드리프트 (덤벨)', nameEn: 'Romanian Deadlift (Dumbbell)', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'back'], equipment: 'dumbbell' },
  { nameKo: '힙 쓰러스트 (머신)', nameEn: 'Hip Thrust (Machine)', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '슈러그 (스미스)', nameEn: 'Shrug (Smith)', primaryMuscles: ['traps'], equipment: 'smith' },

  // ── 카탈로그 갭 이관 (SRS-047 — RapidOverload 실탐색 대조, BS-004 C1) ────────────────
  // 규약: 기존 nameKo 불변(rename 0)·기구 변형=별도 엔트리·novel nameEn(id 충돌 회피).
  // 넥 컬/넥 익스텐션: MuscleGroup 'neck' 확장은 하지 않기로 확정(필터 UI 전면 영향 — 2026-08 카탈로그 대확장 결정).
  // 라잉 넥 컬/익스텐션은 primary 'other'로 아래 대확장 블록에 편입. @plm SRS-047
  { nameKo: '해머스트렝스 체스트 프레스', nameEn: 'Hammer Strength Chest Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '디클라인 체스트 프레스 머신', nameEn: 'Decline Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '라잉 체스트 프레스 머신', nameEn: 'Lying Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '컨버징 체스트 프레스 머신', nameEn: 'Converging Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '원암 체스트 프레스 머신', nameEn: 'Single-arm Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '시티드 케이블 체스트 프레스', nameEn: 'Seated Cable Chest Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '스탠딩 케이블 체스트 프레스', nameEn: 'Standing Cable Chest Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '라잉 케이블 체스트 프레스', nameEn: 'Lying Cable Chest Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '라슨 프레스', nameEn: 'Larsen Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '피트 업 벤치프레스', nameEn: 'Feet-up Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '디클라인 프레스 (스미스)', nameEn: 'Decline Press (Smith)', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'smith' },
  { nameKo: '와이드 그립 푸시업', nameEn: 'Wide Grip Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'], equipment: 'bodyweight' },
  { nameKo: '데피싯 푸시업', nameEn: 'Deficit Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '체스트 서포티드 티바 로우', nameEn: 'Chest Supported T-Bar Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '체스트 서포티드 로우 (덤벨)', nameEn: 'Chest Supported Row (Dumbbell)', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '싯업', nameEn: 'Sit Up', primaryMuscles: ['abs'], equipment: 'bodyweight' },

  // ── 카탈로그 대확장 (2026-08 · spec 20260801 — 타 앱 77장 스크린샷 전수 통합, 신규 153종) ──────
  // 규약: 기존 nameKo·nameEn 불변(추가만)·nameEn=novel(슬러그 유일성 테스트 강제)·세트 속성 흡수
  // (그립·원암/원레그·(중량)/(어시스트)·파셜은 별도 엔트리 금지, 독립 스킬 칼리스데닉스만 예외).
  // 표기·분류 정본 = spec 신규 표(153종). @plm SRS-001 SRS-047
  // ── 가슴 (13) ──
  { nameKo: '디클라인 푸시업', nameEn: 'Decline Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'bodyweight' },
  { nameKo: '클랩 푸시업', nameEn: 'Clap Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '닐링 푸시업', nameEn: 'Kneeling Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '원암 푸시업', nameEn: 'One Arm Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'abs'], equipment: 'bodyweight' }, // 독립 스킬 칼리스데닉스 예외(원칙 3)
  { nameKo: '플랭크 푸시업', nameEn: 'Plank Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['abs'], equipment: 'bodyweight' }, // =업다운 플랭크(이명 — 보류 항목)
  { nameKo: '링 푸시업', nameEn: 'Ring Push Up', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'abs'], equipment: 'other' },
  { nameKo: '플로어 프레스', nameEn: 'Floor Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' }, // 덤벨=변형 축
  { nameKo: '덤벨 스퀴즈 프레스', nameEn: 'Dumbbell Squeeze Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' }, // =헥스 프레스 통합(이명 — 보류 항목)
  { nameKo: '스벤드 프레스', nameEn: 'Svend Press', primaryMuscles: ['chest'], equipment: 'other' }, // =플레이트 프레스 통합
  { nameKo: '디클라인 덤벨 플라이', nameEn: 'Decline Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
  { nameKo: '시티드 케이블 플라이', nameEn: 'Seated Cable Fly', primaryMuscles: ['chest'], equipment: 'cable' },
  { nameKo: '덤벨 어라운드 더 월드', nameEn: 'Dumbbell Around the World', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '링 딥스', nameEn: 'Ring Dip', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'other' },
  // ── 등 (15) ──
  { nameKo: '랜드마인 로우', nameEn: 'Landmine Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '메도우스 로우', nameEn: 'Meadows Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '씰 로우', nameEn: 'Seal Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' }, // 덤벨=변형 축
  { nameKo: '고릴라 로우', nameEn: 'Gorilla Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'kettlebell' },
  { nameKo: '레니게이드 로우', nameEn: 'Renegade Row', primaryMuscles: ['back'], secondaryMuscles: ['abs', 'biceps'], equipment: 'dumbbell' },
  { nameKo: '풀오버 머신', nameEn: 'Machine Pullover', primaryMuscles: ['back'], secondaryMuscles: ['chest'], equipment: 'machine' },
  { nameKo: '네거티브 풀업', nameEn: 'Negative Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' }, // 독립 스킬 — loadMode:assisted 아님(맨몸)
  { nameKo: '스캐퓰러 풀업', nameEn: 'Scapular Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['traps'], equipment: 'bodyweight' },
  { nameKo: '키핑 풀업', nameEn: 'Kipping Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps', 'fullBody'], equipment: 'bodyweight' },
  { nameKo: '스터넘 풀업', nameEn: 'Sternum Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '머슬업', nameEn: 'Muscle Up', primaryMuscles: ['back'], secondaryMuscles: ['fullBody'], equipment: 'bodyweight' },
  { nameKo: '링 풀업', nameEn: 'Ring Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'other' },
  { nameKo: '데드 행', nameEn: 'Dead Hang', primaryMuscles: ['back'], secondaryMuscles: ['forearms'], equipment: 'bodyweight' }, // 시간 위주 — kind strength 유지(스텝에 명시)
  { nameKo: '백 익스텐션 머신', nameEn: 'Back Extension Machine', primaryMuscles: ['back'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '슈퍼맨', nameEn: 'Superman', primaryMuscles: ['back'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  // ── 어깨 (11 — 숄더 탭은 primary abs, 발급 편의상 이 블록 유지) ──
  { nameKo: '파이크 푸시업', nameEn: 'Pike Push Up', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '핸드스탠드 푸시업', nameEn: 'Handstand Push Up', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' }, // 독립 스킬 칼리스데닉스
  { nameKo: '핸드스탠드 홀드', nameEn: 'Handstand Hold', primaryMuscles: ['shoulders'], secondaryMuscles: ['abs'], equipment: 'bodyweight' }, // 물구나무 서기
  { nameKo: '푸시 프레스', nameEn: 'Push Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps', 'quads'], equipment: 'barbell' },
  { nameKo: '밴드 풀 어파트', nameEn: 'Band Pull Apart', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'band' },
  { nameKo: '케이블 Y 레이즈', nameEn: 'Cable Y Raise', primaryMuscles: ['shoulders'], equipment: 'cable' },
  { nameKo: '체스트 서포티드 Y 레이즈', nameEn: 'Chest Supported Y Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '프론트 레이즈 (플레이트)', nameEn: 'Plate Front Raise', primaryMuscles: ['shoulders'], equipment: 'other' }, // 기존 (덤벨)/(케이블)/(바벨) 계열 확장
  { nameKo: '오버헤드 플레이트 레이즈', nameEn: 'Overhead Plate Raise', primaryMuscles: ['shoulders'], equipment: 'other' },
  { nameKo: '숄더 탭', nameEn: 'Shoulder Taps', primaryMuscles: ['abs'], secondaryMuscles: ['shoulders'], equipment: 'bodyweight' }, // 플랭크 계열 — 부위 브라우징 정합(qa)
  { nameKo: '케틀벨 헤일로', nameEn: 'Kettlebell Halo', primaryMuscles: ['shoulders'], secondaryMuscles: ['abs'], equipment: 'kettlebell' },
  // ── 이두 (8) ──
  { nameKo: '드래그 컬', nameEn: 'Drag Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '조트맨 컬', nameEn: 'Zottman Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { nameKo: '크로스 바디 해머 컬', nameEn: 'Cross Body Hammer Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'dumbbell' }, // =핀휠 컬 통합
  { nameKo: '웨이터 컬', nameEn: 'Waiter Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '21 컬', nameEn: 'Bicep Curl 21s', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '오버헤드 케이블 컬', nameEn: 'Overhead Cable Curl', primaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '비하인드 백 케이블 컬', nameEn: 'Behind the Back Cable Curl', primaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '플레이트 컬', nameEn: 'Plate Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'other' },
  // ── 삼두 (3) · 전완 (4) · 승모 (2) · 목 (2) ──
  { nameKo: '리버스 그립 푸시다운', nameEn: 'Reverse Grip Pushdown', primaryMuscles: ['triceps'], equipment: 'cable' }, // 국내·타 앱 통용 독립 종목(집행 시 흡수 재판정 허용)
  { nameKo: '트라이셉스 익스텐션 머신', nameEn: 'Triceps Extension Machine', primaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '와이드 엘보 트라이셉스 프레스', nameEn: 'Wide-Elbow Triceps Press', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '리스트 롤러', nameEn: 'Wrist Roller', primaryMuscles: ['forearms'], equipment: 'other' },
  { nameKo: '비하인드 백 리스트 컬', nameEn: 'Behind the Back Wrist Curl', primaryMuscles: ['forearms'], equipment: 'barbell' },
  { nameKo: '리버스 컬 (덤벨)', nameEn: 'Reverse Curl (Dumbbell)', primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'], equipment: 'dumbbell' }, // 기존 '리버스 바벨 컬'(forearms)과 부위 통일(qa) — 이번 신설 괄호 계열
  { nameKo: '리버스 컬 (케이블)', nameEn: 'Reverse Curl (Cable)', primaryMuscles: ['forearms'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '슈러그 (머신)', nameEn: 'Shrug (Machine)', primaryMuscles: ['traps'], equipment: 'machine' }, // 기존 (스미스) 괄호 선례 확장
  { nameKo: '점프 슈러그', nameEn: 'Jump Shrug', primaryMuscles: ['traps'], secondaryMuscles: ['fullBody'], equipment: 'barbell' },
  { nameKo: '라잉 넥 컬', nameEn: 'Lying Neck Curl', primaryMuscles: ['other'], equipment: 'bodyweight' }, // (중량)=loadMode 파생 흡수(bodyweight)
  { nameKo: '라잉 넥 익스텐션', nameEn: 'Lying Neck Extension', primaryMuscles: ['other'], equipment: 'bodyweight' },
  // ── 대퇴사두·런지 (18) ──
  { nameKo: '박스 스쿼트', nameEn: 'Box Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '포즈 스쿼트', nameEn: 'Pause Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { nameKo: '오버헤드 스쿼트', nameEn: 'Overhead Squat', primaryMuscles: ['quads'], secondaryMuscles: ['fullBody'], equipment: 'barbell' },
  { nameKo: '저처 스쿼트', nameEn: 'Zercher Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'abs'], equipment: 'barbell' },
  { nameKo: '스모 스쿼트', nameEn: 'Sumo Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' }, // 바벨/케틀벨=변형 축·맨몸=기본 버킷 무게 0
  { nameKo: '피스톨 스쿼트', nameEn: 'Pistol Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' }, // 독립 스킬 칼리스데닉스(어시스티드=동일 취급)
  { nameKo: '월 싯', nameEn: 'Wall Sit', primaryMuscles: ['quads'], equipment: 'bodyweight' },
  { nameKo: '점프 스쿼트', nameEn: 'Jump Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '박스 점프', nameEn: 'Box Jump', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '레터럴 박스 점프', nameEn: 'Lateral Box Jump', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '프로그 점프', nameEn: 'Frog Jump', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '레터럴 스쿼트', nameEn: 'Lateral Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '리버스 런지', nameEn: 'Reverse Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' }, // 덤벨/바벨=변형 축
  { nameKo: '레터럴 런지', nameEn: 'Lateral Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '커시 런지', nameEn: 'Curtsy Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '점프 런지', nameEn: 'Jump Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '오버헤드 런지', nameEn: 'Overhead Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'shoulders'], equipment: 'dumbbell' },
  { nameKo: '스플릿 스쿼트', nameEn: 'Split Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' }, // 불가리안과 별개(뒷발 지면)
  // ── 햄스트링·둔근 (16) ──
  { nameKo: '글루트 햄 레이즈', nameEn: 'Glute Ham Raise', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '스탠딩 레그 컬', nameEn: 'Standing Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '케이블 풀 스루', nameEn: 'Cable Pull Through', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'cable' },
  { nameKo: '리버스 하이퍼익스텐션', nameEn: 'Reverse Hyperextension', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'back'], equipment: 'machine' },
  { nameKo: '데드리프트 하이 풀', nameEn: 'Deadlift High Pull', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'traps'], equipment: 'barbell' },
  { nameKo: '힙 쓰러스트 (덤벨)', nameEn: 'Hip Thrust (Dumbbell)', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'dumbbell' }, // 기존 (바벨)/(머신) 계열 확장
  { nameKo: '파이어 하이드런트', nameEn: 'Fire Hydrant', primaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '클램셸', nameEn: 'Clamshell', primaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '프로그 펌프', nameEn: 'Frog Pump', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'dumbbell' },
  { nameKo: '버드 독', nameEn: 'Bird Dog', primaryMuscles: ['glutes'], secondaryMuscles: ['abs', 'back'], equipment: 'bodyweight' }, // 추출 원문 분류(둔근) 우선 — qa 기각 항목 사유 기록
  { nameKo: '글루트 킥백 머신', nameEn: 'Glute Kickback Machine', primaryMuscles: ['glutes'], equipment: 'machine' }, // 기존 '케이블 킥백'과 별개
  { nameKo: '글루트 킥백', nameEn: 'Glute Kickback', primaryMuscles: ['glutes'], equipment: 'bodyweight' }, // 바닥(네발 자세)
  { nameKo: '케이블 힙 어브덕션', nameEn: 'Cable Hip Abduction', primaryMuscles: ['glutes'], equipment: 'cable' },
  { nameKo: '케이블 힙 어덕션', nameEn: 'Cable Hip Adduction', primaryMuscles: ['glutes'], equipment: 'cable' },
  { nameKo: '레터럴 레그 레이즈', nameEn: 'Lateral Leg Raise', primaryMuscles: ['glutes'], equipment: 'bodyweight' },
  { nameKo: '레터럴 밴드 워크', nameEn: 'Lateral Band Walk', primaryMuscles: ['glutes'], equipment: 'band' },
  // ── 복근 (23) ──
  { nameKo: '데드 버그', nameEn: 'Dead Bug', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: 'V 싯업', nameEn: 'V Sit Up', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '할로우 락', nameEn: 'Hollow Rock', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '플러터 킥', nameEn: 'Flutter Kick', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '시저 킥', nameEn: 'Scissor Kick', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '토 터치', nameEn: 'Toe Touch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '힐 터치', nameEn: 'Heel Tap', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '사이드 크런치', nameEn: 'Side Crunch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '사이드 벤드', nameEn: 'Side Bend', primaryMuscles: ['abs'], equipment: 'dumbbell' }, // 통용 표기 '벤드'(band 축과 혼동 방지 — qa)
  { nameKo: '디클라인 크런치', nameEn: 'Decline Crunch', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '라잉 니 레이즈', nameEn: 'Lying Knee Raise', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '행잉 니 레이즈', nameEn: 'Hanging Knee Raise', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '패러럴 바 니 레이즈', nameEn: 'Parallel Bar Knee Raise', primaryMuscles: ['abs'], equipment: 'other' }, // nameEn Captain's Chair 금지(기구 오지칭 — qa)
  { nameKo: '패러럴 바 레그 레이즈', nameEn: 'Parallel Bar Leg Raise', primaryMuscles: ['abs'], equipment: 'other' },
  { nameKo: '드래곤 플래그', nameEn: 'Dragon Flag', primaryMuscles: ['abs'], secondaryMuscles: ['fullBody'], equipment: 'bodyweight' },
  { nameKo: '리버스 플랭크', nameEn: 'Reverse Plank', primaryMuscles: ['abs'], secondaryMuscles: ['glutes', 'back'], equipment: 'bodyweight' },
  { nameKo: '엘보 투 니', nameEn: 'Elbow to Knee', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '스파이더맨 플랭크', nameEn: 'Spiderman Plank', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '팔로프 프레스', nameEn: 'Pallof Press', primaryMuscles: ['abs'], equipment: 'cable' },
  { nameKo: '랜드마인 180', nameEn: 'Landmine 180', primaryMuscles: ['abs'], secondaryMuscles: ['shoulders'], equipment: 'barbell' },
  { nameKo: '토즈 투 바', nameEn: 'Toes to Bar', primaryMuscles: ['abs'], secondaryMuscles: ['forearms'], equipment: 'bodyweight' },
  { nameKo: 'L-싯 홀드', nameEn: 'L-Sit Hold', primaryMuscles: ['abs'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  { nameKo: '토르소 로테이션 머신', nameEn: 'Torso Rotation Machine', primaryMuscles: ['abs'], equipment: 'machine' },
  // ── 전신·올림픽·컨디셔닝 (18) ──
  // ⚠ '파워 클린'은 신규 아님 — 기존 '바벨 클린'의 nameEn이 이미 'Power Clean'(동일 종목·스킵 재판정, qa 3인 일치).
  { nameKo: '행 클린', nameEn: 'Hang Clean', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'quads'], equipment: 'barbell' },
  { nameKo: '클린 앤 프레스', nameEn: 'Clean and Press', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'quads'], equipment: 'barbell' }, // '클린 앤 저크'와 별개
  { nameKo: '클린 풀', nameEn: 'Clean Pull', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'traps'], equipment: 'barbell' },
  { nameKo: '파워 스내치', nameEn: 'Power Snatch', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'back'], equipment: 'barbell' },
  { nameKo: '행 스내치', nameEn: 'Hang Snatch', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'back'], equipment: 'barbell' },
  { nameKo: '스플릿 저크', nameEn: 'Split Jerk', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'quads'], equipment: 'barbell' },
  { nameKo: '프레스 언더', nameEn: 'Press Under', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders'], equipment: 'barbell' },
  { nameKo: '랜드마인 스쿼트 앤 프레스', nameEn: 'Landmine Squat to Press', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'shoulders'], equipment: 'barbell' },
  { nameKo: '케틀벨 하이 풀', nameEn: 'Kettlebell High Pull', primaryMuscles: ['fullBody'], secondaryMuscles: ['traps', 'shoulders'], equipment: 'kettlebell' },
  { nameKo: '터키시 겟업', nameEn: 'Turkish Get Up', primaryMuscles: ['fullBody'], secondaryMuscles: ['abs', 'shoulders'], equipment: 'kettlebell' },
  { nameKo: '케틀벨 어라운드 더 월드', nameEn: 'Kettlebell Around the World', primaryMuscles: ['fullBody'], secondaryMuscles: ['abs'], equipment: 'kettlebell' },
  { nameKo: '슬레드 푸시', nameEn: 'Sled Push', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads'], equipment: 'other' },
  { nameKo: '슬레드 풀', nameEn: 'Sled Pull', primaryMuscles: ['fullBody'], secondaryMuscles: ['back'], equipment: 'other' },
  { nameKo: '수트케이스 캐리', nameEn: 'Suitcase Carry', primaryMuscles: ['fullBody'], secondaryMuscles: ['forearms', 'abs'], equipment: 'dumbbell' },
  { nameKo: '월 볼', nameEn: 'Wall Ball', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'shoulders'], equipment: 'other' },
  { nameKo: '메디신 볼 슬램', nameEn: 'Medicine Ball Slam', primaryMuscles: ['fullBody'], secondaryMuscles: ['abs'], equipment: 'other' },
  { nameKo: '베어 크롤', nameEn: 'Bear Crawl', primaryMuscles: ['fullBody'], secondaryMuscles: ['abs', 'shoulders'], equipment: 'bodyweight' },
  { nameKo: '프론트 레버 홀드', nameEn: 'Front Lever Hold', primaryMuscles: ['back'], secondaryMuscles: ['abs'], equipment: 'bodyweight' },
  // ── 맨몸 컨디셔닝·플라이오 (5) ──
  { nameKo: '버피 브로드 점프', nameEn: 'Burpee Broad Jump', primaryMuscles: ['fullBody'], equipment: 'bodyweight' },
  { nameKo: '버피 오버 더 바', nameEn: 'Burpee Over the Bar', primaryMuscles: ['fullBody'], equipment: 'bodyweight' },
  { nameKo: '점핑 잭', nameEn: 'Jumping Jack', primaryMuscles: ['fullBody'], secondaryMuscles: ['calves'], equipment: 'bodyweight' },
  { nameKo: '하이 니', nameEn: 'High Knees', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'calves'], equipment: 'bodyweight' },
  { nameKo: '프론트 레버 레이즈', nameEn: 'Front Lever Raise', primaryMuscles: ['back'], secondaryMuscles: ['abs'], equipment: 'bodyweight' },
  // ── 유산소 (15 — 전부 kind:'cardio' · 지표 정본은 domain/cardio.ts CARDIO_METRICS_BY_NAME_EN) ──
  // 요가·필라테스·스트레칭 kind 근거: 시간 기록형 활동의 실용 배정(무게 UI 배제 — kind 어휘가 strength|cardio 2종뿐).
  { nameKo: '수영', nameEn: 'Swimming', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'shoulders'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '복싱', nameEn: 'Boxing', primaryMuscles: ['fullBody'], secondaryMuscles: ['shoulders', 'abs'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '클라이밍', nameEn: 'Climbing', primaryMuscles: ['fullBody'], secondaryMuscles: ['back', 'forearms'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '하이킹', nameEn: 'Hiking', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'calves'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '스프린트', nameEn: 'Sprint', primaryMuscles: ['fullBody'], secondaryMuscles: ['quads', 'hamstrings'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '야외 사이클', nameEn: 'Outdoor Cycling', primaryMuscles: ['quads'], secondaryMuscles: ['calves'], equipment: 'other', kind: 'cardio' },
  { nameKo: '리컴번트 바이크', nameEn: 'Recumbent Bike', primaryMuscles: ['quads'], secondaryMuscles: ['calves'], equipment: 'machine', kind: 'cardio' },
  { nameKo: '히트 (HIIT)', nameEn: 'HIIT', primaryMuscles: ['fullBody'], equipment: 'bodyweight', kind: 'cardio' }, // nameKo 한글 병기(검색성 — qa)
  { nameKo: '에어로빅', nameEn: 'Aerobics', primaryMuscles: ['fullBody'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '요가', nameEn: 'Yoga', primaryMuscles: ['fullBody'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '필라테스', nameEn: 'Pilates', primaryMuscles: ['fullBody'], secondaryMuscles: ['abs'], equipment: 'bodyweight', kind: 'cardio' },
  { nameKo: '스케이팅', nameEn: 'Skating', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'other', kind: 'cardio' },
  { nameKo: '스키', nameEn: 'Skiing', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'other', kind: 'cardio' },
  { nameKo: '스노우보드', nameEn: 'Snowboarding', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'abs'], equipment: 'other', kind: 'cardio' },
  { nameKo: '스트레칭', nameEn: 'Stretching', primaryMuscles: ['fullBody'], equipment: 'bodyweight', kind: 'cardio' },
];
