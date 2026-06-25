// 운동 선택(picker) 콜백 레지스트리. react-navigation 파라미터에 함수를 넣는 안티패턴 회피용.
// 사용법: 호출 측이 requestExercisePick(handler) 후 ExerciseList를 mode:'pick'으로 navigate,
// ExerciseList가 선택 시 resolveExercisePick(id) 호출 → handler 실행 + goBack.
type PickHandler = (exerciseId: string) => void;

let pending: PickHandler | null = null;

export function requestExercisePick(handler: PickHandler): void {
  pending = handler;
}

export function resolveExercisePick(exerciseId: string): void {
  const handler = pending;
  pending = null;
  handler?.(exerciseId);
}

export function cancelExercisePick(): void {
  pending = null;
}
