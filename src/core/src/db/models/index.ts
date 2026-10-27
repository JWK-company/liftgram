// 모델 배럴 + Database modelClasses 배열.
import Exercise from './Exercise';
import Routine from './Routine';
import RoutineExercise from './RoutineExercise';
import Workout from './Workout';
import WorkoutExercise from './WorkoutExercise';
import SetLog from './SetLog';
import UserProfile from './UserProfile';
import ExerciseUserPref from './ExerciseUserPref'; // v22 @plm SRS-056
import BodyweightLog from './BodyweightLog'; // v26 @plm SRS-077
import ImportBatch from './ImportBatch'; // v26 @plm SRS-081 SRS-082
import ImportAlias from './ImportAlias'; // v26 @plm SRS-081

export {
  Exercise,
  Routine,
  RoutineExercise,
  Workout,
  WorkoutExercise,
  SetLog,
  UserProfile,
  ExerciseUserPref,
  BodyweightLog,
  ImportBatch,
  ImportAlias,
};

export const models = [
  Exercise,
  Routine,
  RoutineExercise,
  Workout,
  WorkoutExercise,
  SetLog,
  UserProfile,
  ExerciseUserPref,
  BodyweightLog, // v26
  ImportBatch, // v26
  ImportAlias, // v26
];
