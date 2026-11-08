// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 세트 로그 — append-only 원자 단위 (SRS-003, ADR-002). @plm SRS-003
import { Model, Relation, associations } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';
import type WorkoutExercise from './WorkoutExercise';

export default class SetLog extends Model {
  static table = 'set_logs';
  static associations = associations(['workout_exercises', { type: 'belongs_to', key: 'workout_exercise_id' }]);

  @field('workout_exercise_id') declare workoutExerciseId: string;
  @field('set_number') declare setNumber: number;
  @field('weight_kg') declare weightKg: number; // 정규 kg
  @field('reps') declare reps: number;
  @field('rpe') declare rpe: number | null;
  @field('is_warmup') declare isWarmup: boolean;
  @field('is_failed') declare isFailed: boolean;
  @field('is_drop') declare isDrop: boolean | null; // v4: 드롭세트(세트타입 표시용)
  // v6: 로깅 정밀도 (SRS-029). @plm SRS-029
  @field('strict_reps') declare strictReps: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('load_adjust_kg') declare loadAdjustKg: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('partial_reps') declare partialReps: number | null; // v9: 부분반복(깔짝) — 볼륨/PR 제외 표시전용
  @field('duration_sec') declare durationSec: number | null; // v10: 유산소 수행 시간(초) — 볼륨/PR 제외. @plm SRS-030
  @field('distance_m') declare distanceM: number | null; // v10: 유산소 거리(미터·정규 저장). @plm SRS-030
  @field('incline_pct') declare inclinePct: number | null; // v13: 러닝머신 등 경사(%). @plm SRS-030
  @field('level') declare level: number | null; // v13: 사이클·천국의 계단 등 단계. @plm SRS-030
  @field('speed_kmh') declare speedKmh: number | null; // v15: 러닝머신 속도(km/h). @plm SRS-030
  @field('arm') declare arm: string | null; // v8: 세트별 편측 — 'uni'(원암/원레그), null=투암/투레그(기본)
  @field('grip') declare grip: string | null; // v11: 세트별 그립 — over/under/neutral/wide/close, null=종목 칸을 따름(ADR-055 · 볼륨·PR 키에는 안 들어간다)
  // v16: 처방 어휘 — 세트 타입·목표 RIR. null=비처방(기존 세트·기존 동작 불변). @plm SRS-043
  @field('set_type') declare setType: string | null; // 'warmup'|'top'|'backoff'
  @field('target_rir') declare targetRir: number | null; // 0~6
  @field('load_multiplier') declare loadMultiplier: number | null; // v22: 무게 배수(플레이트 한쪽=2) — null=1(QA B1). @plm SRS-058
  @field('user_edited') declare userEdited: boolean | null; // v25: 사람이 무게·횟수를 고쳤다(false=자동 채움 · null=옛 세트) @plm SRS-067
  // v26: 실제 RIR(0~10, 0.5 단위). null = 적지 않음(옛 세트 전부) — rpe 만 있으면 domain/effort.effectiveRir 가 환산(ADR-038). @plm SRS-073
  @field('rir') declare rir: number | null;
  // v27: 값 출처(domain/lockScreen ValueSource) — 표시 칸 중 가장 약한 것. null = 옛 세트(SPEC-017 · SRS-096)
  @field('value_source') declare valueSource: string | null;
  // v28: 기록 확인 상태 — null 보통 · 'suspect' 확인 필요 · 'confirmed:<효과 무게>x<횟수>' 사람이 「제대로 적었어요」(그때 값 지문)(SPEC-044 · SRS-109)
  @field('check_state') declare checkState: string | null;
  @field('done') declare done: boolean | null; // v3: 수행 완료 체크. null(레거시)=수행됨
  @field('completed_at') declare completedAt: number | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;

  @immutableRelation('workout_exercises', 'workout_exercise_id') declare workoutExercise: Relation<WorkoutExercise>;
}
