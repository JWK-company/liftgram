// 데이터 계층 공개 API. 화면은 이 배럴(또는 개별 repository)만 import. DB 직접 접근 금지.
export * as exerciseRepo from './exerciseRepository';
export * as routineRepo from './routineRepository';
export * as workoutRepo from './workoutRepository';
export * as analyticsRepo from './analyticsRepository';
export * as userRepo from './userRepository';
export * as programRepo from './programRepository';

export type { ExerciseFilter, CustomExerciseInput } from './exerciseRepository';
export type { RoutineExerciseInput } from './routineRepository';
export type { LogSetInput, WorkoutSummary, WorkoutPRDetail } from './workoutRepository';
export type {
  AnalyticsOverview,
  TrendPoint,
  RecentPR,
  WorkoutDetail,
  WorkoutExerciseDetail,
} from './analyticsRepository';
export type { UserSettingsPatch } from './userRepository';
export type { AdoptRoutineInput } from './programRepository';
