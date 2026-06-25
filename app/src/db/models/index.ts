// 모델 배럴 + Database modelClasses 배열.
import Exercise from './Exercise';
import Routine from './Routine';
import RoutineExercise from './RoutineExercise';
import Workout from './Workout';
import WorkoutExercise from './WorkoutExercise';
import SetLog from './SetLog';
import UserProfile from './UserProfile';

export { Exercise, Routine, RoutineExercise, Workout, WorkoutExercise, SetLog, UserProfile };

export const models = [Exercise, Routine, RoutineExercise, Workout, WorkoutExercise, SetLog, UserProfile];
