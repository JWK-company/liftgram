// 세션 매니저 + 세트 로깅 데이터 접근 (SRS-003/004). 무결성의 핵심.
// 세트는 append-only(ADR-002), 완료 시 볼륨·시간·PR을 계산해 캐시. @plm SRS-003 SRS-004
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Workout, WorkoutExercise, SetLog, Routine, RoutineExercise, Exercise } from '../db/models';
import { getExercise } from './exerciseRepository';
import {
  totalVolumeKg,
  snapshotFromSets,
  detectNewPRs,
  effectiveWeightKg,
  effectiveReps,
  EMPTY_PR,
  type LoggedSet,
  type PRResult,
  type PRSnapshot,
  type EquipmentType,
} from '../domain';
import { legacyMachineVariantToV6, variantColumns, type VariantDims } from '../domain/variants'; // @plm SRS-028
import { scheduleSync } from '../sync/syncEngine'; // 운동 완료 후 서버 동기 트리거(@plm SRS-006)

const workouts = () => database.get<Workout>('workouts');
const workoutExercises = () => database.get<WorkoutExercise>('workout_exercises');
const setLogs = () => database.get<SetLog>('set_logs');
const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

function toLoggedSet(s: SetLog): LoggedSet {
  return {
    weightKg: s.weightKg,
    reps: s.reps,
    rpe: s.rpe,
    isWarmup: s.isWarmup,
    isFailed: s.isFailed,
    strictReps: s.strictReps, // v6 정밀도 @plm SRS-029
    loadAdjustKg: s.loadAdjustKg,
  };
}

// 수행 완료된 세트 판정 — done===false(프리레이 미완료 템플릿)만 제외.
// null(레거시 세트)·true는 모두 '수행됨'으로 취급(하위호환). 볼륨/PR/이력은 이것만 센다.
function isPerformed(s: SetLog): boolean {
  return s.done !== false;
}

// v6: 종목 변형 버킷 키 — variant_key 우선, 레거시 machine_variant는 즉석 승계(compute-on-read). @plm SRS-028
function effectiveVariantKey(rec: { variantKey: string | null; machineVariant: string | null }): string | null {
  return rec.variantKey ?? legacyMachineVariantToV6(rec.machineVariant).key;
}

// v6 무손실 백필(멱등) — 레거시(machine_variant만 있는) 행에 variant_key/variant_equipment를 채워
// 신규 선택(equip:<brand>)과 같은 버킷으로 병합. 부팅 시 1회. variant_key가 이미 있거나
// machine_variant가 없는 행은 건너뜀(기본 버킷=null 유지). @plm SRS-028
export async function backfillVariantKeysV6(): Promise<number> {
  let n = 0;
  for (const coll of [workoutExercises(), routineExercises()] as const) {
    const rows = await coll.query(Q.where('variant_key', null), Q.where('machine_variant', Q.notEq(null))).fetch();
    if (!rows.length) continue;
    await database.write(async () => {
      await database.batch(
        ...rows.map((r) =>
          r.prepareUpdate((rec: WorkoutExercise | RoutineExercise) => {
            const { dims, key } = legacyMachineVariantToV6(rec.machineVariant);
            rec.variantEquipment = dims.equipment ?? null;
            rec.variantKey = key;
          }),
        ),
      );
    });
    n += rows.length;
  }
  return n;
}

// #13 종목 통합(멱등) — 잘게 쪼개진 종목을 '기구 변형'으로 흡수. 예: 인클라인 바벨/덤벨/머신 프레스
// → '인클라인 프레스' 1개. 기존 참조(운동·루틴)를 통합 종목으로 재지정하고 variant_equipment로
// 기구를 보존(이전기록·PR 버킷 유지). 이미 사용자가 고른 변형은 건드리지 않는다. 원본 종목은 삭제.
// 신규 설치엔 원본이 없어 no-op. 부팅 시 seedExercisesIfNeeded 다음에 1회.
interface ExerciseConsolidation {
  targetNameKo: string;
  sources: { nameKo: string; equipment: EquipmentType }[];
}
const EXERCISE_CONSOLIDATIONS: ExerciseConsolidation[] = [
  {
    targetNameKo: '인클라인 프레스',
    sources: [
      { nameKo: '인클라인 바벨 프레스', equipment: 'barbell' },
      { nameKo: '인클라인 덤벨 프레스', equipment: 'dumbbell' },
      { nameKo: '인클라인 체스트 프레스 머신', equipment: 'machine' },
    ],
  },
];

export async function consolidateExercisesV8(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  let moved = 0;
  for (const c of EXERCISE_CONSOLIDATIONS) {
    const [target] = await exercises.query(Q.where('name_ko', c.targetNameKo), Q.where('is_custom', false)).fetch();
    if (!target) continue; // 통합 종목이 아직 시드 안 됨 — 건너뜀
    for (const src of c.sources) {
      const [srcEx] = await exercises.query(Q.where('name_ko', src.nameKo), Q.where('is_custom', false)).fetch();
      if (!srcEx || srcEx.id === target.id) continue;
      const cols = variantColumns({ equipment: src.equipment });
      const wes = await workoutExercises().query(Q.where('exercise_id', srcEx.id)).fetch();
      const res = await routineExercises().query(Q.where('exercise_id', srcEx.id)).fetch();
      await database.write(async () => {
        await database.batch(
          ...[...wes, ...res].map((r) =>
            (r as WorkoutExercise | RoutineExercise).prepareUpdate((rec: WorkoutExercise | RoutineExercise) => {
              rec.exerciseId = target.id;
              // 기구 변형이 비어있을 때만 기존 기구를 변형으로 승계(사용자가 이미 고른 변형은 보존).
              if (!rec.variantEquipment && !rec.variantKey) {
                rec.variantKey = cols.variantKey;
                rec.variantEquipment = cols.variantEquipment;
                rec.machineVariant = cols.variantEquipment;
              }
            }),
          ),
          srcEx.prepareMarkAsDeleted(),
        );
      });
      moved += wes.length + res.length;
    }
  }
  return moved;
}

// ── 조회 / 반응형 ──────────────────────────────────────────────────
export function getWorkout(id: string): Promise<Workout> {
  return workouts().find(id);
}

// 진행 중(active/paused) 세션 1건 — 앱 재시작 시 복구 대상 (SRS-004).
export async function getActiveWorkout(): Promise<Workout | null> {
  const res = await workouts()
    .query(Q.where('state', Q.oneOf(['active', 'paused'])), Q.sortBy('started_at', Q.desc), Q.take(1))
    .fetch();
  return res[0] ?? null;
}

export function queryWorkoutExercises(workoutId: string): Query<WorkoutExercise> {
  return workoutExercises().query(Q.where('workout_id', workoutId), Q.sortBy('sort_order', Q.asc));
}

export function querySetLogs(workoutExerciseId: string): Query<SetLog> {
  return setLogs().query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc));
}

// 운동 중 종목 순서 교체(#11) — 화살표로 위/아래 이동. sort_order 재기입.
export async function reorderWorkoutExercises(orderedIds: string[]): Promise<void> {
  await database.write(async () => {
    const records = await Promise.all(orderedIds.map((id) => workoutExercises().find(id)));
    await database.batch(
      ...records.map((we, i) =>
        we.prepareUpdate((rec) => {
          rec.sortOrder = i;
        }),
      ),
    );
  });
}

// 진행 중 세션의 실시간 총 볼륨(#5) — 완료(done)·워킹 세트만, 보정무게·정자세 반복 반영(SRS-029). @plm SRS-004
export async function getWorkoutLiveVolume(workoutId: string): Promise<number> {
  const wes = await workoutExercises().query(Q.where('workout_id', workoutId)).fetch();
  if (!wes.length) return 0;
  const sets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch();
  let v = 0;
  for (const s of sets) {
    if (!isPerformed(s) || s.isWarmup || s.isFailed) continue;
    v += Math.max(0, s.weightKg + (s.loadAdjustKg ?? 0)) * (s.strictReps ?? s.reps);
  }
  return v;
}

// 직전 세션의 같은 종목 마지막 세트(자동표시·자동채움용 — SRS-003).
export async function getPreviousExerciseSnapshot(
  exerciseId: string,
  variant?: string | null,
): Promise<{ weightKg: number; reps: number } | null> {
  const completed = await workouts()
    .query(Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc))
    .fetch();
  for (const w of completed) {
    const clauses = [Q.where('workout_id', w.id), Q.where('exercise_id', exerciseId)];
    if (variant !== undefined) clauses.push(Q.where('variant_key', variant)); // v6: 변형별 기록 분리(null=기본 버킷)
    const wes = await workoutExercises().query(...clauses).fetch();
    if (!wes.length) continue;
    const sets = (
      await setLogs()
        .query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id))), Q.sortBy('set_number', Q.desc))
        .fetch()
    ).filter(isPerformed);
    const last = sets.find((s) => !s.isWarmup && !s.isFailed) ?? sets[0];
    if (last) return { weightKg: last.weightKg, reps: last.reps };
  }
  return null;
}

// 직전 완료 세션의 같은 종목 '전체 세트'(세트수·무게·반복 — 재시작 시 표시·순차 프리필용).
// ExerciseBlock이 읽어 지난 기록을 보여주고, 로깅할 때마다 다음 세트 값으로 입력을 미리 채운다.
// set_logs를 미리 만들지는 않는다(이중 계상 방지). 이력 없으면 빈 배열.
// 수퍼셋/중복 종목이면 첫 인스턴스(sort_order 최소) 하나만 취한다 — 여러 인스턴스를 병합하면
// set_number가 겹쳐 시퀀스가 뒤섞이므로 단일 블록으로 스코프.
export async function getPreviousExerciseSets(exerciseId: string, variant?: string | null): Promise<LogSetInput[]> {
  const completed = await workouts()
    .query(Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc))
    .fetch();
  for (const w of completed) {
    const clauses = [Q.where('workout_id', w.id), Q.where('exercise_id', exerciseId), Q.sortBy('sort_order', Q.asc)];
    if (variant !== undefined) clauses.push(Q.where('variant_key', variant)); // v6: 변형별 기록 분리(null=기본 버킷)
    const wes = await workoutExercises().query(...clauses).fetch();
    if (!wes.length) continue;
    const sets = (
      await setLogs().query(Q.where('workout_exercise_id', wes[0].id), Q.sortBy('set_number', Q.asc)).fetch()
    ).filter(isPerformed);
    if (sets.length) {
      return sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
        isFailed: s.isFailed,
      }));
    }
  }
  return [];
}

// 세션이 시작된 루틴의 종목별 목표 반복범위(점진 제안용 — SRS-010). 블랭크 세션이면 빈 맵.
export async function getWorkoutExerciseTargets(
  workoutId: string,
): Promise<Map<string, { repMin: number; repMax: number }>> {
  const map = new Map<string, { repMin: number; repMax: number }>();
  const w = await workouts().find(workoutId);
  if (!w.routineId) return map;
  const res = await routineExercises().query(Q.where('routine_id', w.routineId)).fetch();
  for (const re of res) {
    const min = re.targetRepsMin ?? 0;
    const max = re.targetRepsMax ?? 0;
    if (min > 0 || max > 0) {
      map.set(re.exerciseId, { repMin: min || max, repMax: max || min });
    }
  }
  return map;
}

// 종목 개인 최고(PR) — 완료 세션 전체에서 가장 무거운 수행 워킹 세트(무게 우선, 동률 시 반복 많은 것).
// variant 지정 시 그 기구의 기록만(머신 브랜드별 PR 분리). undefined=기구 무관 전체.
export async function getExercisePR(
  exerciseId: string,
  variant?: string | null,
): Promise<{ weightKg: number; reps: number } | null> {
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  if (!completed.length) return null;
  const clauses = [Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(completed.map((w) => w.id)))];
  if (variant !== undefined) clauses.push(Q.where('variant_key', variant)); // v6: 변형별 PR 분리
  const wes = await workoutExercises().query(...clauses).fetch();
  if (!wes.length) return null;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch())
    .filter(isPerformed)
    .filter((s) => !s.isWarmup);
  let best: { weightKg: number; reps: number } | null = null;
  for (const s of sets) {
    const ls = toLoggedSet(s);
    const w = effectiveWeightKg(ls); // v6: 보정무게 반영 @plm SRS-029
    const r = effectiveReps(ls);
    if (!best || w > best.weightKg || (w === best.weightKg && r > best.reps)) best = { weightKg: w, reps: r };
  }
  return best;
}

// ── 세션 시작 ──────────────────────────────────────────────────────
// 종목에 템플릿 세트를 프리레이(done=false, 미완료). 무게/반복 = 루틴 target 우선 →
// 없으면 지난 세션의 해당 세트값 → 없으면 지난 세션 마지막 세트 → 기본(20kg/8회).
function prepareTemplateSets(
  weId: string,
  count: number,
  routineWeightKg: number | null,
  routineReps: number | null,
  prevSets: LogSetInput[],
  prevSnap: { weightKg: number; reps: number } | null,
): SetLog[] {
  const recs: SetLog[] = [];
  for (let i = 0; i < count; i++) {
    const prev = prevSets[i];
    const weight = routineWeightKg ?? prev?.weightKg ?? prevSnap?.weightKg ?? 20;
    const reps = routineReps ?? prev?.reps ?? prevSnap?.reps ?? 8;
    recs.push(
      setLogs().prepareCreate((s) => {
        s.workoutExerciseId = weId;
        s.setNumber = i + 1;
        s.weightKg = weight;
        s.reps = reps;
        s.rpe = null;
        s.isWarmup = false;
        s.isFailed = false;
        s.done = false;
        s.completedAt = null;
      }),
    );
  }
  return recs;
}

export async function startWorkoutFromRoutine(routineId: string): Promise<Workout> {
  const routine = await routines().find(routineId);
  const res = await routineExercises()
    .query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  // (종목×기구)별 지난 세션 스냅샷 + 전체 세트를 write 전에 미리 조회(프리레이 값 폴백용).
  const vkey = (re: (typeof res)[number]) => `${re.exerciseId}::${effectiveVariantKey(re) ?? ''}`;
  const prevSnapByKey = new Map<string, { weightKg: number; reps: number } | null>();
  const prevSetsByKey = new Map<string, LogSetInput[]>();
  for (const re of res) {
    const k = vkey(re);
    if (!prevSnapByKey.has(k)) {
      prevSnapByKey.set(k, await getPreviousExerciseSnapshot(re.exerciseId, effectiveVariantKey(re)));
      prevSetsByKey.set(k, await getPreviousExerciseSets(re.exerciseId, effectiveVariantKey(re)));
    }
  }
  return database.write(async () => {
    const now = Date.now();
    const workout = await workouts().create((w) => {
      w.routineId = routineId;
      w.name = routine.name;
      w.state = 'active';
      w.startedAt = now;
      w.accumulatedPauseMs = 0;
      w.totalVolumeKg = 0;
      w.prCount = 0;
      w.userId = null;
    });
    // 종목 인스턴스에 루틴 target(세트/반복/무게/휴식)을 복사 저장 + 스냅샷.
    const weRecords = res.map((re, i) =>
      workoutExercises().prepareCreate((we) => {
        we.workoutId = workout.id;
        we.exerciseId = re.exerciseId;
        we.sortOrder = i;
        const prev = prevSnapByKey.get(vkey(re)) ?? null;
        we.prevWeightKg = prev?.weightKg ?? null;
        we.prevReps = prev?.reps ?? null;
        we.targetSets = re.targetSets;
        we.targetRepsMin = re.targetRepsMin;
        we.targetRepsMax = re.targetRepsMax;
        we.targetWeightKg = re.targetWeightKg;
        we.restSeconds = re.restSeconds;
        we.machineVariant = re.machineVariant; // 레거시 미러
        // v6: 루틴의 변형 선택 복사(버킷 키). 레거시 루틴(machine_variant만)은 즉석 승계.
        we.variantKey = effectiveVariantKey(re);
        we.variantEquipment = re.variantEquipment ?? legacyMachineVariantToV6(re.machineVariant).dims.equipment ?? null;
        we.variantGrip = re.variantGrip ?? null;
        we.variantArm = re.variantArm ?? null;
        we.supersetGroup = re.supersetGroup; // v7: 루틴 슈퍼셋 그룹 복사(#20)
      }),
    );
    // 각 종목에 target_sets 개수만큼 템플릿 세트 프리레이(Hevy식).
    const setRecords: SetLog[] = [];
    res.forEach((re, i) => {
      const count = Math.max(1, re.targetSets || 1);
      setRecords.push(
        ...prepareTemplateSets(
          weRecords[i].id,
          count,
          re.targetWeightKg,
          re.targetRepsMin,
          prevSetsByKey.get(vkey(re)) ?? [],
          prevSnapByKey.get(vkey(re)) ?? null,
        ),
      );
    });
    await database.batch(...weRecords, ...setRecords);
    return workout;
  });
}

export async function startBlankWorkout(): Promise<Workout> {
  return database.write(async () =>
    workouts().create((w) => {
      w.routineId = null;
      w.name = '빠른 운동';
      w.state = 'active';
      w.startedAt = Date.now();
      w.accumulatedPauseMs = 0;
      w.totalVolumeKg = 0;
      w.prCount = 0;
      w.userId = null;
    }),
  );
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  const prevSnap = await getPreviousExerciseSnapshot(exerciseId);
  const prevSets = await getPreviousExerciseSets(exerciseId);
  return database.write(async () => {
    const count = await workoutExercises().query(Q.where('workout_id', workoutId)).fetchCount();
    const setsCount = Math.max(1, prevSets.length || 1); // 지난 세션 세트수(없으면 1) — 블랭크/중간추가 종목
    const we = workoutExercises().prepareCreate((rec) => {
      rec.workoutId = workoutId;
      rec.exerciseId = exerciseId;
      rec.sortOrder = count;
      rec.prevWeightKg = prevSnap?.weightKg ?? null;
      rec.prevReps = prevSnap?.reps ?? null;
      rec.targetSets = setsCount;
      rec.targetRepsMin = prevSnap?.reps ?? null;
      rec.targetRepsMax = null;
      rec.targetWeightKg = null;
      rec.restSeconds = 120;
      rec.machineVariant = null; // 레거시
      // v6: 즉석 추가 종목은 기본(미지정) — 헤더에서 변형(기구·그립·팔) 선택
      rec.variantKey = null;
      rec.variantEquipment = null;
      rec.variantGrip = null;
      rec.variantArm = null;
    });
    const setRecords = prepareTemplateSets(we.id, setsCount, null, prevSnap?.reps ?? null, prevSets, prevSnap);
    await database.batch(we, ...setRecords);
    return we;
  });
}

export async function removeWorkoutExercise(id: string): Promise<void> {
  await database.write(async () => {
    const we = await workoutExercises().find(id);
    const sets = await setLogs().query(Q.where('workout_exercise_id', id)).fetch();
    await database.batch(...sets.map((s) => s.prepareMarkAsDeleted()), we.prepareMarkAsDeleted());
  });
}

// 운동 중 종목 교체(BS-002 #22) — 삭제·재추가 없이 이 인스턴스의 종목만 교체. 세트는 유지(새 종목 기록으로),
// 변형·이전기록 스냅샷은 새 종목 기준으로 초기화(다른 종목이므로 변형 맥락 리셋). @plm SRS-004
export async function swapWorkoutExercise(workoutExerciseId: string, newExerciseId: string): Promise<void> {
  const prevSnap = await getPreviousExerciseSnapshot(newExerciseId); // 새 종목 최신 기록(변형 무관)
  await database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    await we.update((rec) => {
      rec.exerciseId = newExerciseId;
      rec.prevWeightKg = prevSnap?.weightKg ?? null;
      rec.prevReps = prevSnap?.reps ?? null;
      rec.variantKey = null;
      rec.variantEquipment = null;
      rec.variantGrip = null;
      rec.variantArm = null;
      rec.machineVariant = null;
    });
  });
}

// ── 세트 편집 (템플릿 프리레이 + 완료 체크 — Hevy식) ────────────────
export interface LogSetInput {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
  isFailed?: boolean;
}

// 운동 중 세트 추가 — 기본은 미완료(done=false) 템플릿. 값 미지정 시 마지막 세트 복제.
export async function addSet(
  workoutExerciseId: string,
  input: { weightKg?: number; reps?: number; isWarmup?: boolean; done?: boolean } = {},
): Promise<SetLog> {
  return database.write(async () => {
    const existing = await setLogs()
      .query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc))
      .fetch();
    const last = existing[existing.length - 1];
    const done = input.done ?? false;
    return setLogs().create((s) => {
      s.workoutExerciseId = workoutExerciseId;
      s.setNumber = existing.length + 1;
      s.weightKg = input.weightKg ?? last?.weightKg ?? 20;
      s.reps = input.reps ?? last?.reps ?? 8;
      s.rpe = null;
      s.isWarmup = input.isWarmup ?? false;
      s.isFailed = false;
      s.done = done;
      s.completedAt = done ? Date.now() : null;
    });
  });
}

// 세트 완료 체크 토글 — 볼륨/PR/이력은 done인 세트만 센다.
export async function setSetDone(id: string, done: boolean): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      rec.done = done;
      rec.completedAt = done ? Date.now() : null;
    });
  });
}

// 세트 타입(일반/워밍업/드롭/실패) — 상호 배타. 표시 W/숫자/D/F.
export type SetType = 'normal' | 'warmup' | 'drop' | 'failed';
export async function setSetType(id: string, type: SetType): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      rec.isWarmup = type === 'warmup';
      rec.isDrop = type === 'drop';
      rec.isFailed = type === 'failed';
    });
  });
}

// 세션 중 종목의 변형(기구·그립·팔) 변경 — 이전기록·PR이 해당 변형 것으로 갱신된다. @plm SRS-028
export async function setVariant(workoutExerciseId: string, dims: VariantDims): Promise<void> {
  const cols = variantColumns(dims);
  await database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    await we.update((rec) => {
      rec.variantKey = cols.variantKey;
      rec.variantEquipment = cols.variantEquipment;
      rec.variantGrip = cols.variantGrip;
      rec.variantArm = cols.variantArm;
      rec.machineVariant = cols.variantEquipment; // 레거시 미러(기구 차원)
    });
  });
}

// 레거시 호환 — 기구(브랜드)만 바꾸는 경로(그립/팔은 초기화).
export async function setMachineVariant(workoutExerciseId: string, variant: string | null): Promise<void> {
  await setVariant(workoutExerciseId, { equipment: variant });
}

// 세션 종목 메모 저장(BS-002 #7/#24) — 그날의 느낌·포인트. @plm SRS-004
export async function setWorkoutExerciseNote(workoutExerciseId: string, note: string): Promise<void> {
  await database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    await we.update((rec) => {
      rec.note = note.trim() || null;
    });
  });
}

// 이 종목(+변형)의 지난 세션 메모 — '다시 뜨게' 하는 참고 표시용. 없으면 null. @plm SRS-004
export async function getPreviousExerciseNote(exerciseId: string, variantKey?: string | null): Promise<string | null> {
  const completed = await workouts().query(Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc)).fetch();
  for (const w of completed) {
    const clauses = [Q.where('workout_id', w.id), Q.where('exercise_id', exerciseId)];
    if (variantKey !== undefined) clauses.push(Q.where('variant_key', variantKey));
    const wes = await workoutExercises().query(...clauses).fetch();
    const note = wes.map((x) => x.note?.trim()).find((n) => n);
    if (note) return note;
  }
  return null;
}

export async function updateSetLog(
  id: string,
  patch: {
    weightKg?: number;
    reps?: number;
    rpe?: number | null;
    isWarmup?: boolean;
    isFailed?: boolean;
    strictReps?: number | null; // v6 정밀도: 정자세 반복. @plm SRS-029
    loadAdjustKg?: number | null; // v6 정밀도: 보정무게(어시스티드−/가중+).
  },
): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      if (patch.weightKg !== undefined) rec.weightKg = patch.weightKg;
      if (patch.reps !== undefined) rec.reps = patch.reps;
      if (patch.rpe !== undefined) rec.rpe = patch.rpe;
      if (patch.isWarmup !== undefined) rec.isWarmup = patch.isWarmup;
      if (patch.isFailed !== undefined) rec.isFailed = patch.isFailed;
      if (patch.strictReps !== undefined) rec.strictReps = patch.strictReps;
      if (patch.loadAdjustKg !== undefined) rec.loadAdjustKg = patch.loadAdjustKg;
    });
  });
}

// 세트 삭제 후 남은 세트 번호 재정렬.
export async function deleteSetLog(id: string): Promise<void> {
  await database.write(async () => {
    const target = await setLogs().find(id);
    const weId = target.workoutExerciseId;
    await target.markAsDeleted();
    const remaining = await setLogs()
      .query(Q.where('workout_exercise_id', weId), Q.sortBy('set_number', Q.asc))
      .fetch();
    await database.batch(...remaining.map((s, i) => s.prepareUpdate((rec) => { rec.setNumber = i + 1; })));
  });
}

// ── 일시정지 / 재개 (SRS-004) ──────────────────────────────────────
export async function pauseWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    if (w.state !== 'active') return;
    await w.update((rec) => {
      rec.state = 'paused';
      rec.pausedAt = Date.now();
    });
  });
}

export async function resumeWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    if (w.state !== 'paused') return;
    const pausedAt = w.pausedAt;
    const accumulated = w.accumulatedPauseMs;
    await w.update((rec) => {
      rec.state = 'active';
      if (pausedAt) rec.accumulatedPauseMs = accumulated + (Date.now() - pausedAt);
      rec.pausedAt = null;
    });
  });
}

export async function discardWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    const wes = await workoutExercises().query(Q.where('workout_id', id)).fetch();
    const weIds = wes.map((x) => x.id);
    const sets = weIds.length
      ? await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(weIds))).fetch()
      : [];
    await database.batch(
      ...sets.map((s) => s.prepareMarkAsDeleted()),
      ...wes.map((x) => x.prepareMarkAsDeleted()),
      w.prepareMarkAsDeleted(),
    );
  });
  scheduleSync(); // 삭제(완료기록 삭제 포함)를 서버·다른 기기에 반영
}

// ── 세션 종료 + 요약/PR (SRS-004/005) ──────────────────────────────
async function historicalSnapshotForExercise(
  exerciseId: string,
  excludeWorkoutId: string,
  variant?: string | null,
): Promise<PRSnapshot> {
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  const ids = completed.map((w) => w.id).filter((id) => id !== excludeWorkoutId);
  if (!ids.length) return EMPTY_PR;
  const clauses = [Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(ids))];
  if (variant !== undefined) clauses.push(Q.where('variant_key', variant)); // v6: 변형별 PR 비교
  const wes = await workoutExercises().query(...clauses).fetch();
  if (!wes.length) return EMPTY_PR;
  const sets = (
    await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()
  ).filter(isPerformed);
  return snapshotFromSets(sets.map(toLoggedSet));
}

export interface WorkoutPRDetail {
  exerciseId: string;
  exerciseName: string;
  prs: PRResult[];
}

export interface WorkoutSummary {
  workoutId: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  prs: WorkoutPRDetail[];
}

export async function completeWorkout(id: string): Promise<WorkoutSummary> {
  const workout = await workouts().find(id);
  const wes = await workoutExercises()
    .query(Q.where('workout_id', id), Q.sortBy('sort_order', Q.asc))
    .fetch();

  let totalVolume = 0;
  let workingSets = 0;
  const prDetails: WorkoutPRDetail[] = [];
  const undone: SetLog[] = []; // 미완료(done=false) 프리레이 세트 — 수행 안 함 → 완료 시 삭제.
  const emptyWEs: WorkoutExercise[] = []; // 완료 후 수행 세트 0개 종목 → 삭제(피드 종목수 과대·빈 카드 방지).
  // PR은 (종목 × 기구) 단위 1회 — 같은 종목이라도 머신 기구가 다르면 별도 기록으로 비교.
  const performedByVariant = new Map<string, { exerciseId: string; variant: string | null; logged: LoggedSet[] }>();

  for (const we of wes) {
    const all = await setLogs().query(Q.where('workout_exercise_id', we.id)).fetch();
    const performed = all.filter(isPerformed);
    for (const s of all) if (!isPerformed(s)) undone.push(s);
    if (performed.length === 0) {
      emptyWEs.push(we);
      continue;
    }
    const logged = performed.map(toLoggedSet);
    totalVolume += totalVolumeKg(logged);
    workingSets += logged.filter((s) => !s.isWarmup && !s.isFailed).length;
    const vk = effectiveVariantKey(we); // v6: (종목×변형) 버킷 키
    const key = `${we.exerciseId}::${vk ?? ''}`;
    const entry = performedByVariant.get(key);
    if (entry) entry.logged.push(...logged);
    else performedByVariant.set(key, { exerciseId: we.exerciseId, variant: vk, logged: [...logged] });
  }

  // PR 감지는 (종목,기구)별 1회 — 같은 조합이 여러 인스턴스(수퍼셋·중복)여도 합쳐 비교해 이중계상 방지.
  for (const { exerciseId, variant, logged } of performedByVariant.values()) {
    const current = snapshotFromSets(logged);
    const hist = await historicalSnapshotForExercise(exerciseId, id, variant);
    const prs = detectNewPRs(current, hist);
    if (prs.length) {
      let name = '운동';
      try {
        name = (await getExercise(exerciseId)).nameKo;
      } catch {
        /* 종목이 삭제된 경우 기본명 유지 */
      }
      prDetails.push({ exerciseId, exerciseName: name, prs });
    }
  }

  const now = Date.now();
  const durationSeconds = Math.max(
    0,
    Math.round((now - workout.startedAt - workout.accumulatedPauseMs) / 1000),
  );
  const prCount = prDetails.reduce((n, d) => n + d.prs.length, 0);

  await database.write(async () => {
    // 체크 안 한 템플릿 세트 + 세트 0개 종목은 실제 수행이 아니므로 기록에서 제거(이력·볼륨·피드 오염 방지).
    const dels = [
      ...undone.map((s) => s.prepareMarkAsDeleted()),
      ...emptyWEs.map((we) => we.prepareMarkAsDeleted()),
    ];
    if (dels.length) await database.batch(...dels);
    await workout.update((rec) => {
      rec.state = 'completed';
      rec.completedAt = now;
      rec.totalVolumeKg = totalVolume;
      rec.durationSeconds = durationSeconds;
      rec.prCount = prCount;
    });
  });

  scheduleSync(); // 운동 완료 → 서버 백업·다른 기기 반영(디바운스·로그인 가드·비차단)
  return { workoutId: id, totalVolumeKg: totalVolume, durationSeconds, workingSets, prCount, prs: prDetails };
}
