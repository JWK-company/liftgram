// 기본 운동 카탈로그 시드 (SRS-001). 한/영 명칭 + 근육군 + 기구. 첫 실행 시 1회 주입.
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
  // 가슴
  { nameKo: '바벨 벤치프레스', nameEn: 'Barbell Bench Press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell' },
  { nameKo: '인클라인 덤벨 프레스', nameEn: 'Incline Dumbbell Press', primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { nameKo: '덤벨 플라이', nameEn: 'Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
  { nameKo: '체스트 프레스 머신', nameEn: 'Chest Press Machine', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'machine' },
  { nameKo: '딥스', nameEn: 'Dips', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'bodyweight' },
  // 등
  { nameKo: '데드리프트', nameEn: 'Deadlift', primaryMuscles: ['back'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { nameKo: '풀업', nameEn: 'Pull Up', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { nameKo: '랫 풀다운', nameEn: 'Lat Pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { nameKo: '바벨 로우', nameEn: 'Barbell Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '시티드 케이블 로우', nameEn: 'Seated Cable Row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  // 어깨
  { nameKo: '오버헤드 프레스', nameEn: 'Overhead Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { nameKo: '덤벨 숄더 프레스', nameEn: 'Dumbbell Shoulder Press', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '사이드 레터럴 레이즈', nameEn: 'Side Lateral Raise', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '리어 델트 플라이', nameEn: 'Rear Delt Fly', primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { nameKo: '페이스 풀', nameEn: 'Face Pull', primaryMuscles: ['shoulders'], secondaryMuscles: ['traps'], equipment: 'cable' },
  // 다리
  { nameKo: '바벨 스쿼트', nameEn: 'Barbell Squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hamstrings'], equipment: 'barbell' },
  { nameKo: '레그 프레스', nameEn: 'Leg Press', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { nameKo: '루마니안 데드리프트', nameEn: 'Romanian Deadlift', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'back'], equipment: 'barbell' },
  { nameKo: '레그 익스텐션', nameEn: 'Leg Extension', primaryMuscles: ['quads'], equipment: 'machine' },
  { nameKo: '레그 컬', nameEn: 'Leg Curl', primaryMuscles: ['hamstrings'], equipment: 'machine' },
  { nameKo: '런지', nameEn: 'Lunge', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'dumbbell' },
  { nameKo: '힙 쓰러스트', nameEn: 'Hip Thrust', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], equipment: 'barbell' },
  { nameKo: '스탠딩 카프 레이즈', nameEn: 'Standing Calf Raise', primaryMuscles: ['calves'], equipment: 'machine' },
  // 팔
  { nameKo: '바벨 컬', nameEn: 'Barbell Curl', primaryMuscles: ['biceps'], equipment: 'barbell' },
  { nameKo: '덤벨 컬', nameEn: 'Dumbbell Curl', primaryMuscles: ['biceps'], equipment: 'dumbbell' },
  { nameKo: '해머 컬', nameEn: 'Hammer Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], equipment: 'dumbbell' },
  { nameKo: '트라이셉스 푸시다운', nameEn: 'Triceps Pushdown', primaryMuscles: ['triceps'], equipment: 'cable' },
  { nameKo: '오버헤드 트라이셉스 익스텐션', nameEn: 'Overhead Triceps Extension', primaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { nameKo: '클로즈 그립 벤치프레스', nameEn: 'Close Grip Bench Press', primaryMuscles: ['triceps'], secondaryMuscles: ['chest'], equipment: 'barbell' },
  // 코어
  { nameKo: '플랭크', nameEn: 'Plank', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '행잉 레그 레이즈', nameEn: 'Hanging Leg Raise', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  { nameKo: '케이블 크런치', nameEn: 'Cable Crunch', primaryMuscles: ['abs'], equipment: 'cable' },
  { nameKo: '러시안 트위스트', nameEn: 'Russian Twist', primaryMuscles: ['abs'], equipment: 'bodyweight' },
  // 전신/기타
  { nameKo: '케틀벨 스윙', nameEn: 'Kettlebell Swing', primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'back'], equipment: 'kettlebell' },
  { nameKo: '바벨 슈러그', nameEn: 'Barbell Shrug', primaryMuscles: ['traps'], equipment: 'barbell' },
];
