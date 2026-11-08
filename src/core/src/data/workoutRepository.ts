// 세션 매니저 + 세트 로깅 데이터 접근 (SRS-003/004). 무결성의 핵심.
// 세트는 append-only(ADR-002), 완료 시 볼륨·시간·PR을 계산해 캐시. @plm SRS-003 SRS-004
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Workout, WorkoutExercise, SetLog, Routine, RoutineExercise, Exercise, UserProfile } from '../db/models';
import type { CardioTargetJson } from '../db/models/_sanitizers';
import { getExercise } from './exerciseRepository';
import {
  totalVolumeKg,
  setVolumeKg,
  snapshotFromSets,
  detectMajorPRs,
  mergeSnapshots,
  effectiveWeightKg,
  effectiveReps,
  resolveLoadMode,
  EMPTY_PR,
  type LoggedSet,
  type LoadMode,
  type PRResult,
  type PRSnapshot,
  type EquipmentType,
  type MuscleGroup,
  type PrescribedSet, // v16: 처방 어휘(프리레이·복사). @plm SRS-043
} from '../domain';
import { pickPrSets, countMajorPrs, sweepPrCounts, type PrSweepWorkout } from '../domain/personalRecords'; // PR 2종 칩 · PR 수 재계산 @plm SRS-061
import { resolvePrescribedLoad, planPrescribedLoadFills, roundLoadKg } from '../domain/prescription'; // 처방 무게 기준 @plm SRS-063
import type { PrescribedSetType, SchemeId } from '../domain/prescription';
import { remainingSchemeRows, schemeAllowed, schemeOf, type DoneSetKind } from '../domain/setSchemes'; // 세트 방식(SPEC-041)
import { roundKeyOf, pickRoundSets } from '../domain/supersetRound'; // 슈퍼셋 화면 번호 짝 @plm SRS-062
import { cardioMetricsFor } from '../domain/cardio'; // 잠금 카드 — 유산소 지표(SPEC-017)
import { planReplay, planFromSpec, routineLinesToStartRows, type ReplaySourceBlock, type StartRow } from '../domain/replay'; // 그대로 다시 시작·피드 바로 시작 @plm SRS-065
import { bestEstimatedOneRepMax, estimateOneRepMax } from '../domain/oneRepMax';
import { autoWorkoutName, inheritedWorkoutName, isDefaultWorkoutName } from '../domain/workoutAutoName'; // 빠른 운동 자동 이름 @plm SRS-071
import { pickStartUnit, planUnitSwitch, planUnitSwitchV2, isUserTouched } from '../domain/blockUnit'; // 블록별 kg/lb @plm SRS-067
import {
  legacyMachineVariantToV6,
  variantColumns,
  normalizeVariantDims,
  normalizeVariantDimsV34,
  dimsFromColumns,
  MACHINE_BRAND_VARIANT_KEYS,
  type VariantDims,
  type GripKey,
  type ArmKey,
} from '../domain/variants'; // @plm SRS-028
import {
  pickStartSlot,
  // [원본] 배수·환산·동기 계획 V1 — 원복 시 아래 V2 대신 되살린다(피드백 #63 · SRS-084)
  // blockLoadMultiplier,
  // carryWeightAcrossMultiplier,
  // planBlockMultiplierResync,
  blockLoadMultiplierV2,
  carryWeightAcrossMultiplierV2,
  planBlockMultiplierResyncV2,
  planBlockMultiplierRetag,
  needsPlateOneSideQuestion,
  plateChangeMode,
  adoptLegacyMultiplier,
  summarizeSlots,
  pickRecentBrands,
  type SlotSummary,
} from '../domain/recordSlots'; // ADR-034 지난 조합 · ADR-037 한쪽 입력 @plm SRS-057 SRS-058
import { scheduleSync } from '../sync/syncEngine'; // 운동 완료 후 서버 동기 트리거(@plm SRS-006)
import { randomId } from '../utils/id';
import { decodeValueSource, encodeValueSource, withFieldSource, lockValueWrite, type ValueSource, type SimBlock } from '../domain/lockScreen'; // v27 값 출처(잠금화면 「앱 열기」 · SPEC-017)
import {
  clampCompletedAt,
  groupSessionRows,
  judgeLockAction,
  lockRoundOf,
  planRoundFills,
  sameAtDisplayPrecision,
  type LockAction,
  type LockApplyVerdict,
  type LockExpect,
  type LockRowInput,
  type LockSnapshotBlock,
  type LockSnapshotSet,
  type LockWatermark,
} from '../domain/lockScreen'; // 잠금 카드 적용기·스냅샷 재료(SPEC-017 Phase 3)
import { getExerciseDisplayNameMap } from './exerciseNames';

const workouts = () => database.get<Workout>('workouts');
const workoutExercises = () => database.get<WorkoutExercise>('workout_exercises');
const setLogs = () => database.get<SetLog>('set_logs');
const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

// loadMode·bodyweightKg를 주입하면 유효무게가 어시스트(체중-무게)/맨몸(체중+무게) 반영. 미주입=raw. @plm SRS-033
function toLoggedSet(s: SetLog, loadMode: LoadMode | null = null, bodyweightKg: number | null = null): LoggedSet {
  return {
    weightKg: s.weightKg,
    reps: s.reps,
    rpe: s.rpe,
    rir: s.rir, // v26: 실제 RIR(null = 적지 않음) @plm SRS-073
    isWarmup: s.isWarmup,
    isFailed: s.isFailed,
    partialReps: s.partialReps, // v9: 부분반복(깔짝) — 표시전용, 볼륨/PR 제외 @plm SRS-029
    durationSec: s.durationSec, // v10: 유산소 시간 — 볼륨/PR 제외 @plm SRS-030
    distanceM: s.distanceM, // v10: 유산소 거리 — 볼륨/PR 제외 @plm SRS-030
    loadMode, // v12: 하중모드 @plm SRS-033
    bodyweightKg, // v12: 계산 시점 체중 @plm SRS-033
    loadMultiplier: s.loadMultiplier, // v22: 플레이트 한쪽 입력 배수(null=1) @plm SRS-058
  };
}

// 사용자 체중(kg) — 어시스트/맨몸 유효무게 계산용. 미입력=null → raw 무게 폴백. @plm SRS-033
export async function getUserBodyweightKg(): Promise<number | null> {
  try {
    const [u] = await database.get<UserProfile>('user_profiles').query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
    return u?.bodyweightKg ?? null;
  } catch {
    return null;
  }
}

// 주어진 종목 id들의 하중모드 맵(load_mode 명시 우선, 없으면 기구로 파생). @plm SRS-033
async function loadModeByExerciseId(exerciseIds: string[]): Promise<Map<string, LoadMode>> {
  const uniq = [...new Set(exerciseIds)];
  const map = new Map<string, LoadMode>();
  if (!uniq.length) return map;
  const exs = await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf(uniq))).fetch();
  for (const e of exs) map.set(e.id, resolveLoadMode(e));
  return map;
}

// 주어진 종목 id 중 유산소(kind='cardio')인 것들의 집합. PR 감지에서 유산소를 배제하는 데 쓴다. @plm SRS-030
async function cardioExerciseIdSet(exerciseIds: string[]): Promise<Set<string>> {
  const uniq = [...new Set(exerciseIds)];
  const set = new Set<string>();
  if (!uniq.length) return set;
  const exs = await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf(uniq))).fetch();
  for (const e of exs) if (e.kind === 'cardio') set.add(e.id);
  return set;
}

// 수행 완료된 세트 판정 — done===false(프리레이 미완료 템플릿)만 제외.
// null(레거시 세트)·true는 모두 '수행됨'으로 취급(하위호환). 볼륨/PR/이력은 이것만 센다.
/** 사람이 고친 세트인가 — v25 user_edited 우선, 옛 세트는 updated_at 판정(/qa code H-3) @plm SRS-067 */
function touchedByUser(s: SetLog): boolean {
  return isUserTouched({
    done: s.done,
    userEdited: s.userEdited,
    updatedAt: s.updatedAt?.getTime?.() ?? null,
    createdAt: s.createdAt?.getTime?.() ?? null,
  });
}

/**
 * 세트 값 쓰기 헬퍼(SPEC-017 §8 · REV-003 저장소 M-4) — 무게·횟수(·유산소 시간·거리)를 쓸 때 **사람이 고쳤는지(user_edited)와
 * 값 출처(value_source)를 함께** 찍는다. 출처는 표시 칸 중 가장 약한 것(weakestValueSource)이다. 저장소의 모든 값 쓰기가
 * 이것을 거친다 — 단위 환산·배수 동기·플레이트 정리처럼 숫자만 옮기는 쓰기는 출처를 바꾸지 않으므로 부르지 않는다.
 */
// [원본] 세트의 가장 약한 출처 하나를 덮어썼다 — 처방이 무게만 채워도 횟수 칸 출처를 알 수 없어 default 에 머물렀다(REV-005 H-1).
// [개선] 칸별로(「무게,횟수」 · domain/lockScreen encodeValueSource) — 쓴 칸의 출처만 바꾼다.
export function writeSetValues(
  rec: SetLog,
  values: { weightKg?: number; reps?: number },
  source: ValueSource,
): void {
  if (values.weightKg !== undefined) {
    rec.weightKg = values.weightKg;
    rec.valueSource = withFieldSource(rec.valueSource, 'weight', source);
  }
  if (values.reps !== undefined) {
    rec.reps = values.reps;
    rec.valueSource = withFieldSource(rec.valueSource, 'reps', source);
  }
  if (source === 'user' && (values.weightKg !== undefined || values.reps !== undefined)) rec.userEdited = true;
}

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

// v10: 유산소 종목 승격(멱등) — 기존 설치의 '로잉 머신' 등 유산소성 종목에 kind='cardio'를 채운다.
// 신규 시드 유산소 종목(러닝머신 등)은 seedRunner가 kind='cardio'로 생성하므로 여기선 레거시 승격만. @plm SRS-030
// '러닝머신'·'트레드밀 러닝' 둘 다 포함 — syncSeedNames 리네임 전/후 어느 순서든 백필이 놓치지 않게. @plm SRS-030
const CARDIO_SEED_NAMES = ['seed-rowing-machine', 'seed-treadmill-running', 'seed-running', 'seed-walking', 'seed-indoor-cycling', 'seed-elliptical', 'seed-stair-climber', 'seed-jump-rope', 'seed-assault-bike', 'seed-stepper', 'seed-skierg']; // P2: seed id(ADR-033)
export async function backfillCardioKindV10(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  // kind!=null 필터는 어댑터별 NULL 의미차(SQL은 NULL을 notEq에서 제외)로 위험 → 전건 조회 후 JS 필터.
  const rows = await exercises.query(Q.where('is_custom', false)).fetch();
  const targets = rows.filter((e) => e.kind !== 'cardio' && CARDIO_SEED_NAMES.includes(e.id));
  if (!targets.length) return 0;
  await database.write(async () => {
    await database.batch(...targets.map((e) => e.prepareUpdate((rec) => { rec.kind = 'cardio'; })));
  });
  return targets.length;
}

// v12: 어시스트 종목 하중모드 승격(멱등) — 기존 설치의 '어시스트 X'에 load_mode='assisted'를 채운다.
// (맨몸 모드는 equipment='bodyweight'로 파생하므로 백필 불필요. 신규 시드는 seedRunner가 채움.) @plm SRS-033
const ASSISTED_SEED_NAMES = ['seed-assisted-pull-up', 'seed-assisted-chin-up', 'seed-assisted-dip']; // P2: seed id(ADR-033)
export async function backfillLoadModeV12(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const rows = await exercises.query(Q.where('is_custom', false)).fetch();
  const targets = rows.filter((e) => e.loadMode !== 'assisted' && ASSISTED_SEED_NAMES.includes(e.id));
  if (!targets.length) return 0;
  await database.write(async () => {
    await database.batch(...targets.map((e) => e.prepareUpdate((rec) => { rec.loadMode = 'assisted'; })));
  });
  return targets.length;
}

// v11: 그립·팔이 세트별(set_logs)로 이동 → 종목 변형 버킷은 기구만. 레거시 workout/routine_exercises의
// variant_grip/variant_arm을 버킷 키에서 제거(기구만으로 재계산·컬럼 null)해 신규/즉석/루틴이 한 버킷으로
// 통합되게 한다(같은 종목이 출처에 따라 다른 이전기록/PR을 보이던 문제 해소). 멱등. @plm SRS-028
export async function backfillDropGripArmV11(): Promise<number> {
  let n = 0;
  for (const coll of [workoutExercises(), routineExercises()] as const) {
    // NULL 의미차(어댑터별) 회피 위해 전건 조회 후 JS 필터(grip/arm 잔존 레코드만).
    const all = await coll.query().fetch();
    const rows = all.filter((r) => r.variantGrip != null || r.variantArm != null);
    if (!rows.length) continue;
    await database.write(async () => {
      await database.batch(
        ...rows.map((r) =>
          (r as WorkoutExercise | RoutineExercise).prepareUpdate((rec: WorkoutExercise | RoutineExercise) => {
            rec.variantKey = variantColumns({ equipment: rec.variantEquipment }).variantKey; // 기구만으로 재계산
            rec.variantGrip = null;
            rec.variantArm = null;
          }),
        ),
      );
    });
    n += rows.length;
  }
  return n;
}

// v22: 고유 기구 버킷 병합(멱등) — variant_equipment가 종목의 고유 기구와 같은 행(예: '바벨 벤치프레스'에
// equip:barbell)을 기본 버킷(null)으로 정규화한다. 선택기는 2026-07-18부터 고유 기구를 null로 저장하지만
// 그 이전에 저장된 루틴·세션 행이 남아 같은 종목이 두 버킷으로 갈라졌고, 그 결과 "루틴 A로는 이전기록이
// 보이는데 루틴 B로 시작하면 안 보인다"가 발생했다(2026-08-01 사용자 리포트).
// machine_variant(레거시 미러)도 함께 비운다 — 남겨두면 backfillVariantKeysV6/effectiveVariantKey가
// 다음 부팅에 equip:<고유기구>를 되살려 정규화가 무효화된다. @plm SRS-028
export async function backfillNormalizeIntrinsicEquipmentV22(): Promise<number> {
  const exs = await database.get<Exercise>('exercises').query().fetch();
  const equipById = new Map(exs.map((e) => [e.id, e.equipment as string | null]));
  let n = 0;
  for (const coll of [workoutExercises(), routineExercises()] as const) {
    // NULL 의미차(어댑터별) 회피 위해 전건 조회 후 JS 필터.
    const all = await coll.query().fetch();
    const rows = all.filter((r) => {
      const eq = (r.variantEquipment ?? '').trim();
      return !!eq && eq === equipById.get(r.exerciseId);
    });
    if (!rows.length) continue;
    await database.write(async () => {
      await database.batch(
        ...rows.map((r) =>
          (r as WorkoutExercise | RoutineExercise).prepareUpdate((rec: WorkoutExercise | RoutineExercise) => {
            // 그립·팔은 v11 이후 항상 null이지만, 남아 있어도 손실 없이 보존하고 기구 축만 병합.
            rec.variantKey = variantColumns({
              equipment: null,
              grip: rec.variantGrip as GripKey | null,
              arm: rec.variantArm as ArmKey | null,
            }).variantKey;
            rec.variantEquipment = null;
            rec.machineVariant = null; // 레거시 미러도 비워야 V6 백필이 되살리지 않는다
          }),
        ),
      );
    });
    n += rows.length;
  }
  return n;
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
  const bw = await getUserBodyweightKg(); // v12: 어시스트/맨몸 유효무게 반영 @plm SRS-033
  const modeByEx = await loadModeByExerciseId(wes.map((w) => w.exerciseId));
  const modeByWe = new Map(wes.map((w) => [w.id, modeByEx.get(w.exerciseId) ?? 'external']));
  const sets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch();
  let v = 0;
  for (const s of sets) {
    if (!isPerformed(s) || s.isWarmup || s.isFailed) continue;
    v += setVolumeKg(toLoggedSet(s, modeByWe.get(s.workoutExerciseId) ?? null, bw)); // 유효무게×정자세reps
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
        partialReps: s.partialReps,
        durationSec: s.durationSec, // v10: 유산소 이전기록. @plm SRS-030
        distanceM: s.distanceM,
        inclinePct: s.inclinePct, // v13: 유산소 경사 이전기록. @plm SRS-030
        level: s.level, // v13: 유산소 단계 이전기록. @plm SRS-030
        speedKmh: s.speedKmh, // v15: 유산소 속도 이전기록. @plm SRS-030
        arm: s.arm, // 세트별 편측(원암/투암) — 이전기록에 옵션 표시. @plm SRS-028
        grip: s.grip, // 세트별 그립 — 이전기록에 옵션 표시. @plm SRS-028
        loadMultiplier: s.loadMultiplier ?? null, // v22: 그 세트를 한쪽으로 적었는지 — 프리필 환산용 @plm SRS-058
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
  const bw = await getUserBodyweightKg(); // v12: 어시스트/맨몸 유효무게 반영 @plm SRS-033
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch())
    .filter(isPerformed)
    .filter((s) => !s.isWarmup);
  let best: { weightKg: number; reps: number } | null = null;
  for (const s of sets) {
    const ls = toLoggedSet(s, loadMode, bw);
    const w = effectiveWeightKg(ls); // v12: 하중모드(어시스트/맨몸) 반영 @plm SRS-033
    const r = effectiveReps(ls);
    if (!best || w > best.weightKg || (w === best.weightKg && r > best.reps)) best = { weightKg: w, reps: r };
  }
  return best;
}

// ── PR 2종 칩(#50·#51) ── @plm SRS-061
// getExercisePR(보존)은 「중량 하나」만 돌려준다. 칩은 중량 PR·볼륨 PR 을 따로 보이고, 누르면 입력 칸에 채우고,
// 「기록 보기」로 그 세트가 있는 운동으로 간다 — 그래서 세트 출처까지 돌려준다(QA Q4: 입력 무게·계산 무게 분리).
export interface PrSetRef {
  inputWeightKg: number; // 그 세트에 적은 무게(한쪽 입력이면 한쪽)
  effectiveKg: number; // 계산 무게(배수·하중모드 반영) — 칩에 보이는 값
  reps: number;
  volumeKg: number;
  loadMultiplier: number | null;
  setLogId: string;
  workoutId: string;
  completedAt: number | null;
}
export async function getExercisePRs(
  exerciseId: string,
  variant?: string | null,
): Promise<{ weight: PrSetRef | null; volume: PrSetRef | null }> {
  const none = { weight: null, volume: null };
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  if (!completed.length) return none;
  const doneAt = new Map(completed.map((w) => [w.id, w.completedAt ?? null]));
  const clauses = [Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(completed.map((w) => w.id)))];
  if (variant !== undefined) clauses.push(Q.where('variant_key', variant));
  const wes = await workoutExercises().query(...clauses).fetch();
  if (!wes.length) return none;
  const workoutOf = new Map(wes.map((x) => [x.id, x.workoutId]));
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()).filter(
    isPerformed,
  );
  const cands = sets.map((s) => ({ ...toLoggedSet(s, loadMode, bw), _s: s }));
  const picked = pickPrSets(cands);
  const ref = (c: (typeof cands)[number] | null): PrSetRef | null => {
    if (!c) return null;
    const workoutId = workoutOf.get(c._s.workoutExerciseId) ?? '';
    return {
      inputWeightKg: c._s.weightKg,
      effectiveKg: effectiveWeightKg(c),
      reps: effectiveReps(c),
      volumeKg: setVolumeKg(c),
      loadMultiplier: c._s.loadMultiplier ?? null,
      setLogId: c._s.id,
      workoutId,
      completedAt: doneAt.get(workoutId) ?? null,
    };
  };
  return { weight: ref(picked.weight), volume: ref(picked.volume) };
}

// 사용자 무게 단위 — 처방 무게 반올림(lb 원판) 용. 못 읽으면 kg.
async function getUserWeightUnit(): Promise<'kg' | 'lb'> {
  try {
    const [u] = await database.get<UserProfile>('user_profiles').query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
    return u?.weightUnit === 'lb' ? 'lb' : 'kg';
  } catch {
    return 'kg';
  }
}

// ── 블록별 무게 단위(kg|lb) ── @plm SRS-067
// 한 헬스장 안에 kg·lb 기구가 섞여 있다 — 단위는 프로필 하나가 아니라 **블록**마다 있다(v25 workout_exercises.weight_unit, null=kg).
// 칸별 기억은 따로 저장하지 않고 **완료한 블록**에서 유도한다(블록이 이미 동기되므로 기기 간 같다). 규칙은 domain/blockUnit.

/** 이 블록의 단위 — 비어 있으면 kg(운영 기존 기록은 전부 kg 로 적혔다 · 2026-10-27 확인). */
export function blockWeightUnit(we: { weightUnit?: string | null }): 'kg' | 'lb' {
  return we.weightUnit === 'lb' ? 'lb' : 'kg';
}

/** 같은 종목·같은 기록 칸으로 가장 최근에 완료한 블록의 단위(없으면 예전 프로필 단위 → kg). */
export async function getBlockStartUnit(exerciseId: string, variantKey: string | null): Promise<'kg' | 'lb'> {
  const legacy = await getUserWeightUnit();
  const blocks = await workoutExercises().query(Q.where('exercise_id', exerciseId), Q.where('weight_unit', Q.notEq(null))).fetch();
  if (!blocks.length) return legacy;
  const wids = [...new Set(blocks.map((b) => b.workoutId))];
  const done = await workouts().query(Q.where('id', Q.oneOf(wids)), Q.where('state', 'completed')).fetch();
  const doneAt = new Map(done.map((w) => [w.id, w.completedAt ?? w.startedAt]));
  return pickStartUnit(
    blocks.map((b) => ({
      variantKey: effectiveVariantKey(b),
      weightUnit: b.weightUnit === 'lb' ? 'lb' : b.weightUnit === 'kg' ? 'kg' : null,
      completedAt: doneAt.get(b.workoutId) ?? null,
    })),
    variantKey,
    legacy,
  );
}

/** 단위가 비어 있는 (진행 중) 블록에 기본 단위를 정한다 — **환산 없음**(실제 무게 그대로, 표시만). 종목 추가·교체 경로 공용. */
export async function ensureBlockUnit(workoutExerciseId: string): Promise<'kg' | 'lb'> {
  const we = await workoutExercises().find(workoutExerciseId);
  if (we.weightUnit === 'kg' || we.weightUnit === 'lb') return we.weightUnit;
  const unit = await getBlockStartUnit(we.exerciseId, effectiveVariantKey(we));
  await database.write(async () => {
    const cur = await workoutExercises().find(workoutExerciseId);
    if (cur.weightUnit) return; // 그 사이 다른 쪽이 정했다
    await cur.update((rec) => {
      rec.weightUnit = unit;
    });
  });
  return unit;
}

/**
 * 기록 칸이 바뀐 뒤 — 그 블록에 완료한 세트가 없으면 새 칸이 기억하는 단위로(환산 없음). 완료 세트가 있으면 그대로 둔다
 * (이미 적은 숫자의 의미를 흔들지 않는다).
 */
export async function adoptSlotUnitV1(workoutExerciseId: string): Promise<'kg' | 'lb'> {
  const we = await workoutExercises().find(workoutExerciseId);
  const cur = blockWeightUnit(we);
  const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
  if (sets.some((x) => x.done === true)) return cur;
  const unit = await getBlockStartUnit(we.exerciseId, effectiveVariantKey(we));
  if (unit === we.weightUnit) return unit;
  await database.write(async () => {
    const rec0 = await workoutExercises().find(workoutExerciseId);
    await rec0.update((rec) => {
      rec.weightUnit = unit;
    });
  });
  return unit;
}
// [개선] 사람이 이번 운동에서 단위를 골랐으면(unit_by_user) 칸이 바뀌어도 그대로 — lb 를 누르고 그립을 바꾸면 kg 로
// 되돌아가 100 이 45.36 으로 보였다(/qa code H-2). 판단은 writer 안에서(그 사이 토글이 끼어들어도 최신 상태로). @plm SRS-067
export async function adoptSlotUnit(workoutExerciseId: string): Promise<'kg' | 'lb'> {
  const we0 = await workoutExercises().find(workoutExerciseId);
  const unit = await getBlockStartUnit(we0.exerciseId, effectiveVariantKey(we0));
  return database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    const cur = blockWeightUnit(we);
    if (we.unitByUser === true) return cur;
    const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
    if (sets.some((x) => x.done === true)) return cur;
    if (unit === we.weightUnit) return unit;
    await we.update((rec) => {
      rec.weightUnit = unit;
    });
    return unit;
  });
}

/**
 * 사람이 누른 토글(Q4 B) — 그 블록 세트(완료 포함)의 **보이는 숫자는 그대로, 단위만** 바꾼다. 저장 kg 를 다시 환산한다.
 * 한 번의 write(블록 단위 + 세트). 진행 중 운동만 — 지난 운동 기록은 바꾸지 않는다.
 */
export async function switchBlockWeightUnitV1(workoutExerciseId: string, to: 'kg' | 'lb'): Promise<void> {
  const we = await workoutExercises().find(workoutExerciseId);
  const w = await workouts().find(we.workoutId);
  if (w.state === 'completed') throw new Error('완료한 운동의 단위는 바꿀 수 없어요');
  const from = blockWeightUnit(we);
  if (from === to && we.weightUnit === to) return;
  const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
  const plan = planUnitSwitch(sets.map((x) => ({ id: x.id, weightKg: x.weightKg })), from, to);
  const byId = new Map(sets.map((x) => [x.id, x]));
  await database.write(async () => {
    const rec0 = await workoutExercises().find(workoutExerciseId);
    await database.batch(
      rec0.prepareUpdate((rec) => {
        rec.weightUnit = to;
      }),
      ...plan.map((p) =>
        (byId.get(p.id) as SetLog).prepareUpdate((rec) => {
          rec.weightKg = p.weightKg;
        }),
      ),
    );
  });
}

/**
 * [개선] 토글 v2(/qa code H-1·H-3·M-4) — 읽기·판단·계획·쓰기를 **한 writer 안에서**. writer 는 줄을 서므로 연타·입력
 * 커밋과 겹쳐도 뒤 호출은 앞 호출이 쓴 상태를 본다(옛 판은 밖에서 읽고 계획해 DB lb·화면 kg 로 어긋났다).
 *   · `expectedFrom`: 화면이 본 단위. DB 단위가 다르면(그 사이 다른 토글이 이겼다) 아무것도 안 하고 DB 단위를 돌려준다.
 *   · 사람이 적었거나 완료한 세트는 숫자 그대로·단위만(Q4 B). 손대지 않은 자동 채움은 실제 무게 그대로 새 단위 원판으로 반올림(H-3).
 *   · 블록에 「사람이 고른 단위」 표식(unit_by_user) — 칸을 바꿔도 유지(H-2).
 * 돌려주는 값 = 쓰고 난 뒤의 블록 단위(화면은 이것을 따른다).
 */
export async function switchBlockWeightUnit(
  workoutExerciseId: string,
  to: 'kg' | 'lb',
  expectedFrom?: 'kg' | 'lb',
): Promise<'kg' | 'lb'> {
  const we0 = await workoutExercises().find(workoutExerciseId);
  const ex = await database.get<Exercise>('exercises').find(we0.exerciseId).catch(() => null);
  const equipment = ex?.equipment ?? null;
  return database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    const w = await workouts().find(we.workoutId);
    if (w.state === 'completed') throw new Error('완료한 운동의 단위는 바꿀 수 없어요');
    const from = blockWeightUnit(we);
    if (expectedFrom && from !== expectedFrom) return from; // 화면이 옛 상태를 봤다 — 최신 단위로 맞춘다
    if (from === to && we.weightUnit === to && we.unitByUser === true) return to;
    const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
    const plan = planUnitSwitchV2(
      sets.map((x) => ({ id: x.id, weightKg: x.weightKg, touched: touchedByUser(x) })),
      from,
      to,
      (kg, unit) => roundLoadKg(kg, equipment, unit),
    );
    const byId = new Map(sets.map((x) => [x.id, x]));
    await database.batch(
      we.prepareUpdate((rec) => {
        rec.weightUnit = to;
        rec.unitByUser = true;
      }),
      ...plan.map((p) =>
        (byId.get(p.id) as SetLog).prepareUpdate((rec) => {
          rec.weightKg = p.weightKg;
        }),
      ),
    );
    return to;
  });
}

// 같은 칸(종목×조합)의 완료 기록으로 추정한 1RM(계산 무게 kg) — 처방 「1RM 의 N%」 기준(#56-3 A). 없으면 0. @plm SRS-063
export async function estimatedOneRmForSlot(exerciseId: string, variant?: string | null): Promise<number> {
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  if (!completed.length) return 0;
  const clauses = [Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(completed.map((w) => w.id)))];
  if (variant !== undefined) clauses.push(Q.where('variant_key', variant));
  const wes = await workoutExercises().query(...clauses).fetch();
  if (!wes.length) return 0;
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()).filter(
    isPerformed,
  );
  return bestEstimatedOneRepMax(sets.map((s) => toLoggedSet(s, loadMode, bw)));
}

/**
 * 1RM 추정(V2 · /qa code M-2) — 옛 기록(배수 null)을 이번 블록 배수로 읽는다(adoptLegacyMultiplier). 프리필과 같은 규칙:
 * 플레이트 머신의 옛 null 기록은 「예전과 같은 숫자」로 보인다 → 1RM % 처방 입력 숫자가 절반이 되지 않는다.
 * 고정 kg 처방은 「실제 계산 무게(양쪽 합)」 뜻이라 지금처럼 블록 배수로 나눈다(스펙 Q13). @plm SRS-084
 */
export async function estimatedOneRmForSlotV2(
  exerciseId: string,
  variant: string | null | undefined,
  blockMultiplier: number | null | undefined,
): Promise<number> {
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  if (!completed.length) return 0;
  const clauses = [Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(completed.map((w) => w.id)))];
  if (variant !== undefined) clauses.push(Q.where('variant_key', variant));
  const wes = await workoutExercises().query(...clauses).fetch();
  if (!wes.length) return 0;
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()).filter(
    isPerformed,
  );
  return bestEstimatedOneRepMax(adoptLegacyMultiplier(sets.map((s) => toLoggedSet(s, loadMode, bw)), blockMultiplier));
}

// 탑셋을 마쳤을 때 — 같은 블록에서 **아직 손대지 않은**(done=false 이고 만든 뒤 고친 적 없는 · QA Q5) 세트 중
// 「탑셋의 N%」, 그리고 기록이 없어 기다리던 「1RM 의 N%」 세트에 무게를 채운다(첫 완료 세트로 1RM 추정 · #56-2).
// 사람이 이미 고친 세트는 건드리지 않는다 — 화면은 제안 칩으로 보인다. 채운 세트 id 와 근거를 돌려준다. @plm SRS-063
// [원본] 워밍업·실패 세트로도 1RM 을 추정했다(/qa code H1) — 호출은 아래 새 함수로 바뀌었다. 원복 시 이름을 되돌린다.
export async function fillPrescribedLoadsAfterV1(
  workoutExerciseId: string,
  doneSetId: string,
  doneWeightKg: number,
  doneReps: number,
): Promise<{ setLogId: string; weightKg: number; reasonKey: string; params: Record<string, number> }[]> {
  const we = await workoutExercises().find(workoutExerciseId);
  const rx = we.prescription;
  if (!rx?.some((r) => r.loadBasis === 'pctTop' || r.loadBasis === 'pct1rm')) return [];
  const ex = await database.get<Exercise>('exercises').find(we.exerciseId).catch(() => null);
  if (!ex || ex.kind === 'cardio' || resolveLoadMode(ex) !== 'external') return [];
  const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc)).fetch();
  const doneIdx = sets.findIndex((s) => s.id === doneSetId);
  if (doneIdx < 0) return [];
  const done = sets[doneIdx];
  const mult = done.loadMultiplier && done.loadMultiplier > 0 ? done.loadMultiplier : 1;
  const doneCalcKg = doneWeightKg * mult; // 화면 입력 무게(blur 경합 대비) × 배수
  const isTop = rx[doneIdx]?.setType === 'top' || done.setType === 'top';
  const unit = await getUserWeightUnit();
  const has1rm = (await estimatedOneRmForSlot(we.exerciseId, effectiveVariantKey(we))) > 0;
  const est = estimateFromSet(doneCalcKg, doneReps);
  const out: { setLogId: string; weightKg: number; reasonKey: string; params: Record<string, number> }[] = [];
  const updates: SetLog[] = [];
  for (let i = doneIdx + 1; i < sets.length; i++) {
    const s = sets[i];
    const r = rx[i];
    if (!r?.loadBasis || s.done !== false) continue;
    if (s.updatedAt.getTime() !== s.createdAt.getTime()) continue; // 사람이 고친 세트는 그대로(QA Q5)
    let got: ReturnType<typeof resolvePrescribedLoad> | null = null;
    if (r.loadBasis === 'pctTop' && isTop) {
      got = resolvePrescribedLoad({ basis: 'pctTop', pct: r.loadPct, topKg: doneCalcKg, equipment: ex.equipment, unit });
    } else if (r.loadBasis === 'pct1rm' && !has1rm) {
      got = resolvePrescribedLoad({ basis: 'pct1rm', pct: r.loadPct, est1rmKg: est, equipment: ex.equipment, unit });
    }
    if (!got || !('weightKg' in got) || got.weightKg <= 0) continue;
    const sm = s.loadMultiplier && s.loadMultiplier > 0 ? s.loadMultiplier : 1;
    const input = got.weightKg / sm;
    updates.push(s.prepareUpdate((rec) => { rec.weightKg = input; }));
    out.push({ setLogId: s.id, weightKg: input, reasonKey: got.reasonKey, params: got.params });
  }
  if (updates.length) await database.write(async () => { await database.batch(...updates); });
  return out;
}
// [개선] 채울 무게는 순수 계획(planPrescribedLoadFills)이 정한다 — 마친 세트가 워밍업·실패면 채우지 않는다(H1). @plm SRS-063
export async function fillPrescribedLoadsAfter(
  workoutExerciseId: string,
  doneSetId: string,
  doneWeightKg: number,
  doneReps: number,
): Promise<{ setLogId: string; weightKg: number; reasonKey: string; params: Record<string, number> }[]> {
  const we = await workoutExercises().find(workoutExerciseId);
  const rx = we.prescription;
  if (!rx?.some((r) => r.loadBasis === 'pctTop' || r.loadBasis === 'pct1rm')) return [];
  const ex = await database.get<Exercise>('exercises').find(we.exerciseId).catch(() => null);
  if (!ex || ex.kind === 'cardio' || resolveLoadMode(ex) !== 'external') return [];
  const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc)).fetch();
  const doneIdx = sets.findIndex((s) => s.id === doneSetId);
  if (doneIdx < 0) return [];
  const done = sets[doneIdx];
  const mult = done.loadMultiplier && done.loadMultiplier > 0 ? done.loadMultiplier : 1;
  const plan = planPrescribedLoadFills({
    rx,
    sets: sets.map((x) => ({
      id: x.id,
      done: x.done,
      // [원본] touched: x.updatedAt.getTime() !== x.createdAt.getTime(), — 시스템 쓰기(단위·배수 환산)도 updated_at 을 바꿔
      // 토글 뒤 처방 채움이 멈췄다(/qa code H-3)
      touched: touchedByUser(x), // 사람이 고친 세트는 그대로(QA Q5) @plm SRS-067
      loadMultiplier: x.loadMultiplier,
    })),
    doneIdx,
    done: { isWarmup: done.isWarmup, isDrop: done.isDrop, isFailed: done.isFailed, setType: done.setType },
    doneCalcKg: doneWeightKg * mult, // 화면 입력 무게(blur 경합 대비) × 배수
    doneReps,
    has1rm: (await estimatedOneRmForSlot(we.exerciseId, effectiveVariantKey(we))) > 0,
    equipment: ex.equipment,
    // [원본] unit: await getUserWeightUnit(),
    // [개선] 원판 반올림 단위 = 이 블록의 단위(프로필 단위 선택은 없어졌다 · /qa spec Q3) @plm SRS-067
    unit: we.weightUnit ? blockWeightUnit(we) : await getUserWeightUnit(),
  });
  if (!plan.length) return [];
  const byId = new Map(sets.map((x) => [x.id, x]));
  await database.write(async () => {
    await database.batch(
      // [원본] ...plan.map((f) => (byId.get(f.setLogId) as SetLog).prepareUpdate((rec) => { rec.weightKg = f.weightKg; })),
      // [개선] v27: 처방이 채운 무게 — 출처 rx(횟수 칸이 더 약하면 그대로 · 가장 약한 칸 규칙) · SPEC-017 §8
      ...plan.map((f) =>
        (byId.get(f.setLogId) as SetLog).prepareUpdate((rec) => {
          writeSetValues(rec, { weightKg: f.weightKg }, 'rx'); // 무게 칸만 rx(REV-005 H-1)
        }),
      ),
    );
  });
  return plan;
}
// ── 잠금화면·완료 흐름 공용(SPEC-017 §5·§10) ──────────────────────────────────
// 시뮬레이션(domain/lockScreen.planLockQueueValues)과 실제 완료(domain/completeSetsFlow)가 **같은 입력**을 쓰도록 블록을 모은다.
// 처방 채우기 조건(무게 기준 있는 처방 · 외부 무게 종목)은 fillPrescribedLoadsAfter 와 같다 — 아니면 rx 를 null 로 넘겨 채우지 않는다.
export async function loadSimBlocks(workoutExerciseIds: string[]): Promise<(SimBlock & { restSec: number; exerciseId: string })[]> {
  if (!workoutExerciseIds.length) return [];
  const wes = await workoutExercises().query(Q.where('id', Q.oneOf(workoutExerciseIds))).fetch();
  const all = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(workoutExerciseIds)), Q.sortBy('set_number', Q.asc)).fetch();
  const out: (SimBlock & { restSec: number; exerciseId: string })[] = [];
  for (const id of workoutExerciseIds) {
    const we = wes.find((x) => x.id === id);
    if (!we) continue;
    const ex = await database.get<Exercise>('exercises').find(we.exerciseId).catch(() => null);
    const fillable =
      !!we.prescription?.some((r) => r.loadBasis === 'pctTop' || r.loadBasis === 'pct1rm') &&
      !!ex &&
      ex.kind !== 'cardio' &&
      resolveLoadMode(ex) === 'external';
    out.push({
      weId: id,
      exerciseId: we.exerciseId,
      restSec: we.restSeconds ?? 120, // 화면 기본값과 같다(ExerciseBlock)
      rx: fillable ? we.prescription : null,
      has1rm: fillable ? (await estimatedOneRmForSlot(we.exerciseId, effectiveVariantKey(we))) > 0 : false,
      equipment: ex?.equipment ?? null,
      unit: we.weightUnit ? blockWeightUnit(we) : await getUserWeightUnit(),
      sets: all
        .filter((x) => x.workoutExerciseId === id)
        .map((x) => ({
          id: x.id,
          setNumber: x.setNumber,
          done: x.done,
          isWarmup: x.isWarmup,
          isDrop: x.isDrop,
          isFailed: x.isFailed,
          setType: x.setType,
          weightKg: x.weightKg,
          reps: x.reps,
          seconds: x.durationSec ?? null,
          touched: touchedByUser(x),
          loadMultiplier: x.loadMultiplier,
          valueSource: x.valueSource,
        })),
    });
  }
  return out;
}

/** 처방 채우기 계획(planRoundFills)을 저장한다 — 출처 rx(횟수 칸이 더 약하면 그대로). 사람이 그 사이 고친 세트는 건너뛴다. */
export async function applyLoadFills(fills: { setLogId: string; weightKg: number }[]): Promise<string[]> {
  if (!fills.length) return [];
  return database.write(async () => {
    const recs = await setLogs().query(Q.where('id', Q.oneOf(fills.map((f) => f.setLogId)))).fetch();
    const byId = new Map(recs.map((r) => [r.id, r]));
    const ok = fills
      .map((f) => ({ f, rec: byId.get(f.setLogId) }))
      .filter((x): x is { f: (typeof fills)[number]; rec: SetLog } => !!x.rec && x.rec.done === false && !touchedByUser(x.rec));
    const ups = ok.map(({ f, rec }) =>
        rec.prepareUpdate((r) => {
          writeSetValues(r, { weightKg: f.weightKg }, 'rx'); // 무게 칸만 rx(REV-005 H-1)
        }),
      );
    if (ups.length) await database.batch(...ups);
    // 실제로 쓴 세트 — 화면 근거 문구는 이것만(REV-005 화면 L-1 · 쓰기 전에 고른 것)
    return ok.map((x) => x.f.setLogId);
  });
}

// ── 잠금 카드 적용기·스냅샷 재료(SPEC-017 Phase 3 §5·§6·§9) ──────────────────────
// 워터마크·dbEpoch 는 Watermelon 로컬 저장소(database.localStorage — 같은 Loki DB · 동기 안 함)에 둔다.
// 새 표(lock_state)를 만들면 동기 push 가 서버로 올려 버린다(§6). DB 를 새로 만들거나 계정을 비우면(unsafeResetDatabase)
// 로컬 저장소도 비어 dbEpoch 가 새로 생긴다 — 옛 DB 의 조작은 그것으로 버려진다.
const LOCK_EPOCH_KEY = 'lockDbEpoch';
const LOCK_WATERMARK_KEY = 'lockAppliedSeq';

/** 이 로컬 DB 의 id — 없으면 만든다(created=true 면 호출자가 네이티브 대기열을 비운다 · §6). */
export async function getLockDbEpoch(): Promise<{ epoch: string; created: boolean }> {
  const cur = await database.localStorage.get<string>(LOCK_EPOCH_KEY);
  if (typeof cur === 'string' && cur) return { epoch: cur, created: false };
  const epoch = `e-${randomId()}`;
  await database.localStorage.set(LOCK_EPOCH_KEY, epoch);
  return { epoch, created: true };
}

/** 만들지 않고 읽기만 — 스냅샷용(epoch 생성은 drain 한 곳 · REV-006 동시성 H-1). */
export async function peekLockDbEpoch(): Promise<string | null> {
  const cur = await database.localStorage.get<string>(LOCK_EPOCH_KEY);
  return typeof cur === 'string' && cur ? cur : null;
}

export async function getLockWatermark(): Promise<LockWatermark | null> {
  const v = await database.localStorage.get<LockWatermark>(LOCK_WATERMARK_KEY);
  return v && typeof v === 'object' && typeof v.seq === 'number' ? v : null;
}

export async function setLockWatermark(wm: LockWatermark): Promise<void> {
  await database.localStorage.set(LOCK_WATERMARK_KEY, wm);
}

export interface LockMismatch {
  setId: string;
  weId: string;
  exerciseId: string;
  unit: 'kg' | 'lb';
  seen: LockExpect;
  saved: LockExpect;
  workoutId?: string;
  oneSide?: boolean;
}

export interface LockApplyResult {
  verdict: LockApplyVerdict;
  setIds: string[];
  changed: string[];
  mismatches: LockMismatch[];
  /** 처방 다시 채우기 기준 — 조작 세트의 라운드 전부(이미 완료한 짝 포함 · REV-005 도메인 L-1) */
  roundSetIds: string[];
  workoutExerciseIds: string[];
}

/**
 * 잠금 조작 하나를 **한 database.write 안에서** 판정·비교·완료한다(§6 「noop 판정과 쓰기는 같은 write」 · REV-005 도메인 M-8).
 * - 판정: 다른 dbEpoch · 끝난/다른 세션 · 없는 세트 → discarded / 남은 세트가 전부 완료 → noop(완료 시각을 덮지 않는다)
 * - 비교: 카드에 보인 값(expect)과 **완료 직전 저장값**을 블록 단위 표시 정밀도로 — 다르면 완료는 하고 mismatches 로 돌려준다(§5)
 * - 값은 덮지 않는다(drain 은 값을 쓰지 않는다 · §5).
 */
export async function applyLockAction(action: LockAction, dbEpoch: string, now: number = Date.now()): Promise<LockApplyResult> {
  return database.write(async () => {
    const empty: LockApplyResult = { verdict: 'discarded', setIds: [], changed: [], mismatches: [], roundSetIds: [], workoutExerciseIds: [] };
    const active = await getActiveWorkout();
    const recs = action.setIds.length ? await setLogs().query(Q.where('id', Q.oneOf(action.setIds))).fetch() : [];
    const weIds = [...new Set(recs.map((r) => r.workoutExerciseId))];
    const wes = weIds.length ? await workoutExercises().query(Q.where('id', Q.oneOf(weIds))).fetch() : [];
    const weById = new Map(wes.map((w) => [w.id, w]));
    const sets = new Map(
      recs.map((r) => [r.id, { done: r.done, sessionId: weById.get(r.workoutExerciseId)?.workoutId ?? '' }]),
    );
    const j = judgeLockAction({
      action,
      activeSessionId: active?.id ?? null,
      sessionActive: !!active,
      epochMatches: action.dbEpoch === dbEpoch,
      sets,
    });
    if (j.verdict === 'discarded' || !active) return empty;
    const present = recs.filter((r) => j.setIds.includes(r.id));
    // 라운드(이미 완료한 짝 포함) — 같은 묶음 블록 전부의 세트로 화면 짝 키를 다시 계산한다
    const groups = new Set(wes.map((w) => w.supersetGroup).filter((g): g is string => !!g));
    const groupWes = groups.size
      ? await workoutExercises().query(Q.where('workout_id', active.id), Q.where('superset_group', Q.oneOf([...groups])), Q.sortBy('sort_order', Q.asc)).fetch()
      : [];
    const memberIds = [...new Set([...wes.map((w) => w.id), ...groupWes.map((w) => w.id)])];
    const memberSets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(memberIds)), Q.sortBy('set_number', Q.asc)).fetch();
    const blockOf = (weId: string) => ({
      weId,
      sets: memberSets
        .filter((x) => x.workoutExerciseId === weId)
        .map((x) => ({ id: x.id, setNumber: x.setNumber, done: x.done, isWarmup: x.isWarmup, isDrop: x.isDrop, isFailed: x.isFailed, setType: x.setType })),
    });
    const round = new Set<string>();
    for (const r of present) {
      const we = weById.get(r.workoutExerciseId);
      const members = we?.supersetGroup ? groupWes.filter((w) => w.supersetGroup === we.supersetGroup).map((w) => blockOf(w.id)) : [blockOf(r.workoutExerciseId)];
      for (const id of lockRoundOf(members, r.id)) round.add(id);
    }
    const roundWeIds = [...new Set(memberSets.filter((x) => round.has(x.id)).map((x) => x.workoutExerciseId))];
    const base = { setIds: j.setIds, roundSetIds: [...round], workoutExerciseIds: roundWeIds.length ? roundWeIds : weIds };
    if (j.verdict === 'noop') return { ...base, verdict: 'noop', changed: [], mismatches: [] };

    const legacyUnit = await getUserWeightUnit();
    const at = clampCompletedAt(action.at, active.startedAt, now);
    const mismatches: LockMismatch[] = [];
    const ups: SetLog[] = [];
    for (const r of present) {
      if (r.done === true) continue; // 이미 완료 — 시각을 덮지 않는다
      const we = weById.get(r.workoutExerciseId);
      const unit = we?.weightUnit ? blockWeightUnit(we) : legacyUnit;
      // [원본] 잠금 운동 화면에서 사람이 바꾼 값(SPEC-019) — values 가 있으면 무조건 덮어쓰고 「다름」 비교를 통째로 건너뛰었다
      //   (고치지 않은 칸도 표시 반올림값·출처 user 로 바뀌고, 남은 칸의 다름을 놓쳤다 — REV-014 #38·#39)
      // const edited = action.values?.find((v) => v.setId === r.id);
      // const write = edited ? lockValueToSaved(edited, unit) : null;
      // if (write) { ups.push(r.prepareUpdate((rec) => { writeSetValues(rec, write, 'user'); rec.done = true; rec.completedAt = at; })); continue; }
      // [개선] 칸마다 — 다를 때만 쓰고(출처 user), 사람이 정한 칸만 비교에서 뺀다. 시간(유산소) 세트의 values 는 무시(#42).
      const seen = action.expect.find((e) => e.setId === r.id);
      const saved: LockExpect = { weightKg: r.weightKg, reps: r.reps, seconds: r.durationSec ?? null };
      // [원본] const cardioSet = r.durationSec != null || seen?.seconds != null; — 거리만 재는 유산소가 빠졌다(REV-015 정합성 #5)
      const cardioSet = r.durationSec != null || r.distanceM != null || seen?.seconds != null;
      const edited = cardioSet ? undefined : action.values?.find((v) => v.setId === r.id);
      const ev = edited ? lockValueWrite(edited, saved, unit) : null;
      const write = ev && (ev.write.weightKg !== undefined || ev.write.reps !== undefined) ? ev.write : null;
      if (seen) {
        const cmp = {
          weightKg: ev?.covered.weight ? saved.weightKg : seen.weightKg,
          reps: ev?.covered.reps ? saved.reps : seen.reps,
          seconds: seen.seconds,
        };
        // 안내의 본 값 = 사람이 정한 칸은 정한 값 · 저장 값 = 쓴 뒤 — 「본 값으로 바꾸기」가 잠금에서 고친 칸을 되돌리지 않게(REV-015 정합성 #1)
        const seenOut = {
          weightKg: ev?.covered.weight ? (ev.chosen.weightKg ?? seen.weightKg) : seen.weightKg,
          reps: ev?.covered.reps ? (ev.chosen.reps ?? seen.reps) : seen.reps,
          seconds: seen.seconds,
        };
        const savedOut: LockExpect = { ...saved, ...(write ?? {}) };
        if (!sameAtDisplayPrecision(cmp, saved, unit))
          mismatches.push({ setId: r.id, weId: r.workoutExerciseId, exerciseId: we?.exerciseId ?? '', unit, seen: seenOut, saved: savedOut, workoutId: active.id, oneSide: (r.loadMultiplier ?? 1) > 1 });
      }
      ups.push(
        r.prepareUpdate((rec) => {
          if (write) writeSetValues(rec, write, 'user');
          rec.done = true;
          rec.completedAt = at;
        }),
      );
    }
    if (ups.length) await database.batch(...ups);
    return { ...base, verdict: 'apply', changed: ups.map((u) => u.id), mismatches };
  });
}

/** 「본 값으로 바꾸기」(§5) — 카드에 보인 값을 사람이 고른 값으로 저장한다(출처 user). */
export async function applyLockSeenValues(items: { setId: string; seen: LockExpect }[]): Promise<void> {
  if (!items.length) return;
  await database.write(async () => {
    // 진행 중인 운동의 세트만 — 끝난 운동의 기록(PR·요약·동기)을 고치지 않는다(REV-006 화면 M-5)
    const active = await getActiveWorkout();
    if (!active) return;
    const all = await setLogs().query(Q.where('id', Q.oneOf(items.map((i) => i.setId)))).fetch();
    const wes = all.length ? await workoutExercises().query(Q.where('id', Q.oneOf([...new Set(all.map((r) => r.workoutExerciseId))]))).fetch() : [];
    const mine = new Set(wes.filter((w) => w.workoutId === active.id).map((w) => w.id));
    const recs = all.filter((r) => mine.has(r.workoutExerciseId));
    const ups = recs.map((rec) => {
      const it = items.find((i) => i.setId === rec.id);
      return rec.prepareUpdate((r) => {
        const v: { weightKg?: number; reps?: number } = {};
        if (it?.seen.weightKg != null) v.weightKg = it.seen.weightKg;
        if (it?.seen.reps != null) v.reps = it.seen.reps;
        writeSetValues(r, v, 'user');
        if (it?.seen.seconds != null) r.durationSec = it.seen.seconds;
      });
    });
    if (ups.length) await database.batch(...ups);
  });
}

/** 「본 값으로 바꾸기」 뒤 처방을 다시 채운다 — drain 은 옛 저장값 기준으로 채웠으므로(REV-006 저장소 M-2). 실제로 쓴 세트 id. */
export async function refillLoadsAfter(setIds: string[]): Promise<string[]> {
  if (!setIds.length) return [];
  const recs = await setLogs().query(Q.where('id', Q.oneOf(setIds))).fetch();
  const weIds = [...new Set(recs.map((r) => r.workoutExerciseId))];
  const blocks = await loadSimBlocks(weIds);
  return applyLoadFills(planRoundFills(blocks, setIds, new Map()));
}

/**
 * 스냅샷 재료(§9) — 화면 행 순서(groupSessionRows) · 블록(loadSimBlocks + 이름·출처·사람 손·유산소) · 일시정지.
 * 화면이 안 떠 있어도 셸이 저장소에서 바로 만든다.
 */
export async function loadLockSnapshotInput(workoutId: string): Promise<{
  title: string;
  startedAt: number;
  accumulatedPauseMs: number;
  pausedAt: number | null;
  paused: boolean;
  rows: LockRowInput<LockSnapshotSet>[];
  blocks: LockSnapshotBlock[];
} | null> {
  const w = await workouts().find(workoutId).catch(() => null);
  if (!w || (w.state !== 'active' && w.state !== 'paused')) return null;
  const wes = await queryWorkoutExercises(workoutId).fetch();
  const sim = await loadSimBlocks(wes.map((x) => x.id));
  const names = await getExerciseDisplayNameMap(wes.map((x) => x.exerciseId));
  const recs = wes.length ? await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch() : [];
  const recById = new Map(recs.map((r) => [r.id, r]));
  const exs = await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf([...new Set(wes.map((x) => x.exerciseId))]))).fetch();
  const cardio = new Set(exs.filter((e) => e.kind === 'cardio').map((e) => e.id));
  // 종목별 유산소 지표 — 시간만 재는 종목은 거리 없이도 잠금 완료(REV-007 표시 H-2)
  const metricsOf = new Map(exs.map((e) => [e.id, cardioMetricsFor(e) as string[]]));
  const groupOf = new Map(wes.map((x) => [x.id, x.supersetGroup]));
  const blocks: LockSnapshotBlock[] = sim.map((b) => {
    const isCardio = cardio.has(b.exerciseId);
    const grp = groupOf.get(b.weId);
    return {
      ...b,
      groupWeIds: grp ? wes.filter((x) => x.supersetGroup === grp).map((x) => x.id) : undefined,
      exerciseName: names.get(b.exerciseId) ?? '',
      sets: b.sets.map((s) => {
        const r = recById.get(s.id);
        return {
          ...s,
          userEdited: r?.userEdited ?? null,
          valueSource: r?.valueSource ?? null,
          cardio: isCardio ? { distance: r?.distanceM ?? null, seconds: r?.durationSec ?? null, metrics: metricsOf.get(b.exerciseId) } : null,
        };
      }),
    };
  });
  const byWe = new Map(blocks.map((b) => [b.weId, b]));
  const rows: LockRowInput<LockSnapshotSet>[] = groupSessionRows(wes).flatMap((row): LockRowInput<LockSnapshotSet>[] => {
    if (row.kind === 'single') {
      const b = byWe.get(row.we.id);
      return b ? [{ kind: 'single', block: { weId: b.weId, sets: b.sets } }] : [];
    }
    const members = row.members.map((m) => byWe.get(m.id)).filter((b): b is LockSnapshotBlock => !!b);
    return [{ kind: 'group', members: members.map((b) => ({ weId: b.weId, sets: b.sets })) }];
  });
  return {
    title: w.name ?? '',
    startedAt: w.startedAt,
    accumulatedPauseMs: w.accumulatedPauseMs ?? 0,
    pausedAt: w.pausedAt ?? null,
    paused: w.state === 'paused',
    rows,
    blocks,
  };
}

/** 블록 휴식(초)을 이번 운동 행에 저장한다 — 휴식 시트를 **닫을 때 한 번**(SPEC-017 §7 · REV-003 저장소 M-5). 같으면 쓰지 않는다. */
export async function setWorkoutExerciseRestSeconds(workoutExerciseId: string, seconds: number): Promise<boolean> {
  if (!Number.isFinite(seconds) || seconds < 0) return false;
  const sec = Math.round(seconds);
  return database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    if (we.restSeconds === sec) return false;
    await we.update((r) => {
      r.restSeconds = sec;
    });
    return true;
  });
}

function estimateFromSet(kg: number, reps: number): number {
  return bestEstimatedOneRepMax([{ weightKg: kg, reps, isWarmup: false, isFailed: false }]);
}

// ── 세션 시작 ──────────────────────────────────────────────────────
// 종목에 템플릿 세트를 프리레이(done=false, 미완료). 무게/반복 = 루틴 target 우선 →
// 없으면 지난 세션의 해당 세트값 → 없으면 지난 세션 마지막 세트 → 기본(20kg/8회).
// 종목이 유산소인지 — kind='cardio'면 세트는 무게/횟수 대신 시간·거리로 기록(생성 시 weight/reps=0). @plm SRS-030
async function isCardioExerciseId(exerciseId: string): Promise<boolean> {
  try {
    const e = await database.get<Exercise>('exercises').find(exerciseId);
    return e.kind === 'cardio';
  } catch {
    return false;
  }
}

// 맨몸 종목(equipment='bodyweight')인지 — 맨몸은 무게 기본 0으로 프리레이(20kg 오프리필 방지 → 볼륨 대신 총횟수 표시). @plm SRS-005
/** 줄마다 무게를 재는 종목인가 — 시작 무게(start)는 이런 종목에만 쓴다(맨몸·어시스트 제외 · SPEC-023). */
async function isExternalLoadExerciseId(exerciseId: string): Promise<boolean> {
  try {
    const e = await database.get<Exercise>('exercises').find(exerciseId);
    return resolveLoadMode({ loadMode: e.loadMode ?? null, equipment: e.equipment }) === 'external';
  } catch {
    return true;
  }
}

async function isBodyweightExerciseId(exerciseId: string): Promise<boolean> {
  try {
    const e = await database.get<Exercise>('exercises').find(exerciseId);
    return e.equipment === 'bodyweight';
  } catch {
    return false;
  }
}

function prepareTemplateSets(
  weId: string,
  count: number,
  routineWeightKg: number | null,
  routineReps: number | null,
  prevSets: LogSetInput[],
  prevSnap: { weightKg: number; reps: number } | null,
  isCardio = false,
  isBodyweight = false,
  cardioTarget: CardioTargetJson | null = null,
  prescription: PrescribedSet[] | null = null, // v16: 세트별 처방(사람 작성 — 렌더·휴식·RIR 라벨 근거). @plm SRS-043
  loadMultiplier: number | null = null, // v22: 이 블록의 배수(플레이트 한쪽=2 · ADR-037) @plm SRS-058
  rxLoadKg: (number | null)[] = [], // 처방 무게 기준으로 계산한 세트별 무게(계산 kg · 없으면 null) @plm SRS-063
  warmupCount = 0, // 앞의 몇 세트를 워밍업으로(「그대로 다시 시작」 — 원본에서 한 워밍업 수 · 처방이 있으면 처방이 정한다) @plm SRS-065
  allowStart = true, // 시작 무게(start)를 쓰는 종목인가(SPEC-023)
): SetLog[] {
  const recs: SetLog[] = [];
  for (let i = 0; i < count; i++) {
    const prev = prevSets[i];
    const rx = prescription?.[i] ?? null; // 이 세트의 처방(없으면 비처방 — 기존 동작 그대로)
    // 프리레이 값 우선순위: 지난 세션의 세트별 실제값(prev)을 최우선 → 같은 루틴 반복 시 이전 무게·횟수가
    // 그대로 유지돼 꾸준한 진척(progressive)이 된다. 없으면(첫 수행) 루틴 목표 → 스냅샷 → 기본. @plm SRS-010
    // 유산소는 무게·횟수 0(시간·거리는 수행 중). 맨몸은 무게 기본 0(가중 시 사용자가 입력) — 20kg 오프리필 방지.
    const bwDefault = isBodyweight ? 0 : 20;
    // [원본] const weight = isCardio ? 0 : prev?.weightKg ?? routineWeightKg ?? prevSnap?.weightKg ?? bwDefault;
    // [개선] 지난 세트를 다른 입력 방식(양쪽 합 ↔ 한쪽)으로 적었으면 이번 방식으로 환산 — 계산 무게가 같게 @plm SRS-058
    // const prevWeight = prev ? carryWeightAcrossMultiplier(prev.weightKg, prev.loadMultiplier, loadMultiplier) : undefined;
    // [개선] 지난 배수가 null(옛 기록·모름)이면 숫자 그대로 — 옛 하이로우 「40」은 실제로 한쪽 40 이었다(피드백 #63) @plm SRS-084
    const prevWeight = prev ? carryWeightAcrossMultiplierV2(prev.weightKg, prev.loadMultiplier, loadMultiplier) : undefined;
    // [원본] const weight = isCardio ? 0 : prevWeight ?? routineWeightKg ?? prevSnap?.weightKg ?? bwDefault;
    // [개선] 사람이 쓴 처방 무게(1RM 의 N%·직접)가 있으면 그 무게가 먼저다 — 입력 칸은 한쪽 입력 배수로 나눈다 @plm SRS-063
    const rxKg = rxLoadKg[i];
    const rxInput = rxKg != null && rxKg > 0 ? rxKg / (loadMultiplier && loadMultiplier > 0 ? loadMultiplier : 1) : null;
    // [원본] const weight = isCardio ? 0 : rxInput ?? prevWeight ?? routineWeightKg ?? prevSnap?.weightKg ?? bwDefault;
    // [개선] 루틴 표의 시작 무게(start)는 지난 기록 다음 — 입력칸 값 그대로다(SPEC-023). 맨몸은 쓰지 않는다.
    // [원본] const rxStart = !isBodyweight && rx?.loadBasis === 'start' && … — 어시스트가 빠졌다(REV-028)
    const rxStart = allowStart && rx?.loadBasis === 'start' && rx.loadKg && rx.loadKg > 0 ? rx.loadKg : null;
    // 표에서 비운 줄(start·0)은 블록 값을 물려받지 않는다 — 웜업이 작업 무게로 시작하지 않게(REV-028)
    const rxBlank = allowStart && rx?.loadBasis === 'start' && !(rx.loadKg && rx.loadKg > 0);
    const blockWeight = rxBlank ? null : routineWeightKg;
    const blockSnap = rxBlank ? null : prevSnap?.weightKg;
    // [개선] 세트 방식 작업 줄은 지난번 같은 자리 작업 세트가 더 무거웠으면 그 무게 — 1RM % 는 「역대 최고 추정」이라
    //   5×5 를 다 성공해 무게를 올려도 다음 운동에 옛 % 무게로 돌아갔다(REV-076 코치 1 · 선형 증량)
    const schemeWork = !!rx?.scheme && (rx.setType === 'normal' || rx.setType === 'top' || rx.setType === 'backoff');
    const prevHeavier =
      schemeWork && rxInput != null && prevWeight != null && prev && !prev.isWarmup && !prev.isFailed && prevWeight > rxInput
        ? prevWeight
        : null;
    // [원본] const weight = isCardio ? 0 : rxInput ?? prevWeight ?? rxStart ?? blockWeight ?? blockSnap ?? bwDefault;
    const weight = isCardio ? 0 : prevHeavier ?? rxInput ?? prevWeight ?? rxStart ?? blockWeight ?? blockSnap ?? bwDefault;
    // v16: 처방 세트는 반복 프리필 폴백에 처방 하한(repMin)을 우선 반영(이전 실측이 최우선은 유지). @plm SRS-043
    // [원본] const reps = isCardio ? 0 : prev?.reps ?? rx?.repMin ?? routineReps ?? prevSnap?.reps ?? 8;
    // [개선] 세트 방식 줄은 그 줄의 목표 횟수가 먼저다 — 지난번 같은 자리가 웜업 10회였어도 탑세트 3~5회로 시작한다(SPEC-041)
    const schemeReps = rx?.scheme && rx.repMin != null ? rx.repMin : null;
    const reps = isCardio ? 0 : schemeReps ?? prev?.reps ?? rx?.repMin ?? routineReps ?? prevSnap?.reps ?? 8;
    // v27: 칸마다 어디서 온 값인지 — 가장 약한 칸이 세트의 출처(REV-003 저장소 H-2 · 예: 무게=루틴 목표 · 횟수=기본 8 → default)
    const weightSource: ValueSource =
      prevHeavier != null ? 'prev' : rxInput != null ? 'rx' : prevWeight != null ? 'prev' : rxStart != null ? 'rx' : blockWeight != null ? 'routine' : blockSnap != null ? 'prev_snap' : 'default';
    const repsSource: ValueSource =
      schemeReps != null ? 'rx' : prev?.reps != null ? 'prev' : rx?.repMin != null ? 'rx' : routineReps != null ? 'routine' : prevSnap?.reps != null ? 'prev_snap' : 'default';
    const cardioSource: ValueSource =
      prev?.durationSec != null || prev?.distanceM != null
        ? 'prev'
        : cardioTarget?.durationSec != null || cardioTarget?.distanceM != null
          ? 'routine'
          : 'default';
    // [원본] const valueSource = isCardio ? cardioSource : weakestValueSource(weightSource, repsSource); — 칸별로 담는다(REV-005 H-1)
    const valueSource = isCardio ? encodeValueSource(cardioSource, cardioSource) : encodeValueSource(weightSource, repsSource);
    recs.push(
      setLogs().prepareCreate((s) => {
        s.workoutExerciseId = weId;
        s.setNumber = i + 1;
        s.weightKg = weight;
        s.reps = reps;
        s.rpe = null;
        s.isWarmup = false;
        s.isFailed = false;
        // 유산소 프리레이: 지난 세션 실제값 우선 → 루틴 유산소 목표(cardioTarget). @plm SRS-030
        if (isCardio) {
          s.durationSec = prev?.durationSec ?? cardioTarget?.durationSec ?? null;
          s.distanceM = prev?.distanceM ?? cardioTarget?.distanceM ?? null;
          s.inclinePct = prev?.inclinePct ?? cardioTarget?.incline ?? null;
          s.level = prev?.level ?? cardioTarget?.level ?? null;
          s.speedKmh = prev?.speedKmh ?? cardioTarget?.speed ?? null;
        }
        // 지난 세션 세트별 그립·팔을 새 세트에 미리 채움(꾸준한 진척 + 옵션 유지, 사용자가 변경 가능). @plm SRS-028
        s.arm = prev?.arm ?? null;
        // [원본] s.grip = prev?.grip ?? null;
        // [원본] ADR-034: 손 그립은 블록 축(칸)이다 — 세트 그립은 옛 기록 표시용으로만 남기고 새로 채우지 않는다 @plm SRS-058
        // s.grip = null;
        // [원본] 세트 그립을 세트마다 쓴다(ADR-055) — 팔처럼 지난번 그 세트의 값을 잇는다
        // s.grip = prev?.grip ?? null;
        // [개선] 새 운동에는 잇지 않는다 — ADR-034 전 옛 세트 그립이 되살아나 복사되고, 칸과 어긋난다(REV-045 H-1·M-2).
        // 지난번 그립은 「이전」 칸에 함께 보인다.
        s.grip = null;
        s.loadMultiplier = isCardio ? null : loadMultiplier; // v22 @plm SRS-058
        s.userEdited = false; // v25: 자동 채움 — 사람이 고치면 true(/qa code H-3) @plm SRS-067
        s.valueSource = valueSource; // v27(SPEC-017 §8)
        // v16: 처방 세트 — 타입·목표 RIR 기입. warmup은 is_warmup 미러(기존 W 라벨·볼륨 제외 재사용). @plm SRS-043
        if (rx && rx.setType !== 'normal') {
          // [원본] s.setType = rx.setType;
          // [개선] 드롭은 is_drop 으로 심고 칸은 비운다(가져오기와 같은 방식 · SPEC-023)
          s.setType = rx.setType === 'drop' ? null : rx.setType;
          s.targetRir = rx.targetRir;
          // [원본] if (rx.setType === 'warmup') s.isWarmup = true;
          if (rx.setType === 'warmup' || rx.setType === 'feeder') s.isWarmup = true; // 피더도 준비 세트(SPEC-041)
          if (rx.setType === 'drop') s.isDrop = true;
        } else {
          s.setType = null;
          s.targetRir = rx?.targetRir ?? null;
        }
        if (!rx && i < warmupCount) s.isWarmup = true; // @plm SRS-065
        s.done = false;
        s.completedAt = null;
      }),
    );
  }
  return recs;
}

// [원본] 루틴 시작 — 「그대로 다시 시작」·피드 「바로 시작」이 같은 프리레이를 쓰도록 공통 시작(startWorkoutFromRows)으로
// 옮겼다(SRS-065 · 복붙 금지). 원복 시 아래 이름을 startWorkoutFromRoutine 으로 되돌리고 새 함수를 지운다.
export async function startWorkoutFromRoutineV1(routineId: string): Promise<Workout> {
  const routine = await routines().find(routineId);
  const res = await routineExercises()
    .query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  // 종목별 버킷 결정 — 루틴이 변형을 지정했으면 그대로, 미지정이면 마지막 수행 변형 승계(resolveStartVariant).
  const variantByRe = new Map<string, VariantColumns>();
  for (const re of res) {
    const legacy = legacyMachineVariantToV6(re.machineVariant);
    variantByRe.set(
      re.id,
      await resolveStartVariant(re.exerciseId, {
        variantKey: effectiveVariantKey(re),
        variantEquipment: re.variantEquipment ?? legacy.dims.equipment ?? null,
        variantGrip: re.variantGrip ?? null,
        variantArm: re.variantArm ?? null,
        variantLoad: re.variantLoad ?? null, // v22 @plm SRS-058
        variantAttach: re.variantAttach ?? null,
        machineVariant: re.machineVariant ?? null,
      }),
    );
  }
  const variantOf = (re: (typeof res)[number]) => variantByRe.get(re.id) as VariantColumns;
  // v22: 블록 배수 — 플레이트 칸 + 「한쪽 무게로 입력」 선호(ADR-037) @plm SRS-058
  // [원본] const { getPlateOneSideMap } = await import('./exercisePrefs');
  // const plateMap = await getPlateOneSideMap(res.map((re) => re.exerciseId));
  // const multiplierOf = (re: (typeof res)[number]) =>
  //   blockLoadMultiplier(dimsFromColumns(variantOf(re)), plateMap.get(re.exerciseId));
  // [개선] 플레이트 후보 머신은 기본이 한쪽(피드백 #63) — 선택(tri-state) × 후보 @plm SRS-084
  const plate = await plateInputsFor(res.map((re) => re.exerciseId));
  const multiplierOf = (re: (typeof res)[number]) =>
    blockLoadMultiplierV2(dimsFromColumns(variantOf(re)), plate.choice.get(re.exerciseId), plate.defaultLoad.get(re.exerciseId));
  // (종목×기구)별 지난 세션 스냅샷 + 전체 세트를 write 전에 미리 조회(프리레이 값 폴백용).
  const vkey = (re: (typeof res)[number]) => `${re.exerciseId}::${variantOf(re).variantKey ?? ''}`;
  const prevSnapByKey = new Map<string, { weightKg: number; reps: number } | null>();
  const prevSetsByKey = new Map<string, LogSetInput[]>();
  const cardioByExercise = new Map<string, boolean>(); // 종목별 유산소 여부(중복 조회 방지)
  const bwByExercise = new Map<string, boolean>(); // 종목별 맨몸 여부
  const externalByExercise = new Map<string, boolean>(); // 종목별 시작 무게 사용 여부(SPEC-023)
  for (const re of res) {
    const k = vkey(re);
    if (!prevSnapByKey.has(k)) {
      prevSnapByKey.set(k, await getPreviousExerciseSnapshot(re.exerciseId, variantOf(re).variantKey));
      prevSetsByKey.set(k, await getPreviousExerciseSets(re.exerciseId, variantOf(re).variantKey));
    }
    if (!cardioByExercise.has(re.exerciseId)) {
      cardioByExercise.set(re.exerciseId, await isCardioExerciseId(re.exerciseId));
      bwByExercise.set(re.exerciseId, await isBodyweightExerciseId(re.exerciseId));
      externalByExercise.set(re.exerciseId, await isExternalLoadExerciseId(re.exerciseId));
    }
  }
  // 처방 무게 기준(1RM 의 N%·직접) — 쓰기 전에 계산해 둔다(탑셋 % 는 탑셋을 한 뒤에 채운다) @plm SRS-063
  const rxLoadByRe = new Map<string, (number | null)[]>();
  {
    const unit = await getUserWeightUnit();
    for (const re of res) {
      const rx = re.prescription;
      if (!rx?.some((r) => r.loadBasis === 'pct1rm' || r.loadBasis === 'fixed')) continue;
      if (cardioByExercise.get(re.exerciseId)) continue;
      const ex = await database.get<Exercise>('exercises').find(re.exerciseId).catch(() => null);
      if (!ex || resolveLoadMode(ex) !== 'external') continue; // 맨몸·어시스트는 % 기준 없음
      // [원본] const est = … await estimatedOneRmForSlot(re.exerciseId, variantOf(re).variantKey) …
      // [개선] 옛 null 기록은 이번 블록 배수로(/qa code M-2) @plm SRS-084
      const est = rx.some((r) => r.loadBasis === 'pct1rm')
        ? await estimatedOneRmForSlotV2(re.exerciseId, variantOf(re).variantKey, multiplierOf(re))
        : 0;
      rxLoadByRe.set(
        re.id,
        rx.map((r) => {
          if (r.loadBasis !== 'pct1rm' && r.loadBasis !== 'fixed') return null;
          const got = resolvePrescribedLoad({
            basis: r.loadBasis,
            pct: r.loadPct,
            kg: r.loadKg,
            est1rmKg: est,
            equipment: ex.equipment,
            unit,
          });
          return 'weightKg' in got && got.weightKg > 0 ? got.weightKg : null;
        }),
      );
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
        // v6: 루틴의 변형 선택 복사(버킷 키). 레거시 루틴(machine_variant만)은 즉석 승계.
        // 미지정 종목은 마지막 수행 변형을 승계한 값(resolveStartVariant) — 이전기록·PR이 이어지도록.
        const v = variantOf(re);
        we.machineVariant = v.machineVariant; // 레거시 미러
        we.variantKey = v.variantKey;
        we.variantEquipment = v.variantEquipment;
        we.variantGrip = v.variantGrip;
        we.variantArm = v.variantArm;
        we.variantLoad = v.variantLoad ?? null; // v22 @plm SRS-058
        we.variantAttach = v.variantAttach ?? null;
        we.supersetGroup = re.supersetGroup; // v7: 루틴 슈퍼셋 그룹 복사(#20)
        we.routineExerciseId = re.id; // v24: 완료 때 루틴과 짝짓는 연결(종목을 바꿔도 같은 행이라 유지) @plm SRS-059
        we.note = re.note?.trim() || null; // 루틴 종목 메모·팁을 세션 메모에 시드(가져온 상급자 팁 노출 — 티칭). @plm SRS-004 SRS-007
        we.cardioTarget = re.cardioTarget ?? null; // v13: 루틴 유산소 목표 복사. @plm SRS-030
        we.prescription = re.prescription ?? null; // v16: 처방 복사(세션 렌더 근거 — 사람 작성분 그대로). @plm SRS-043
      }),
    );
    // 각 종목에 target_sets 개수만큼 템플릿 세트 프리레이(Hevy식). 유산소는 1세트에 목표값 프리레이.
    const setRecords: SetLog[] = [];
    res.forEach((re, i) => {
      const isCardioEx = cardioByExercise.get(re.exerciseId) ?? false;
      // v16: 처방이 있으면 처방 세트 수가 프리레이 기준(유산소 제외). @plm SRS-043
      const rx = !isCardioEx ? re.prescription : null;
      const count = isCardioEx ? 1 : rx && rx.length > 0 ? rx.length : Math.max(1, re.targetSets || 1);
      setRecords.push(
        ...prepareTemplateSets(
          weRecords[i].id,
          count,
          re.targetWeightKg,
          re.targetRepsMin,
          prevSetsByKey.get(vkey(re)) ?? [],
          prevSnapByKey.get(vkey(re)) ?? null,
          isCardioEx,
          bwByExercise.get(re.exerciseId) ?? false,
          re.cardioTarget ?? null,
          rx,
          multiplierOf(re),
          rxLoadByRe.get(re.id) ?? [],
          0,
          externalByExercise.get(re.exerciseId) ?? true,
        ),
      );
    });
    await database.batch(...weRecords, ...setRecords);
    return workout;
  });
}

// ── 공통 시작(SRS-065) ───────────────────────────────────────────────────────
// 「시작할 줄」 목록(domain/replay.StartRow) → 운동 1개. 루틴·「그대로 다시 시작」·피드 「바로 시작」이 모두 여기로 온다:
//   칸 결정(명시/지난 조합) · 한쪽 입력 배수 · 지난 기록 프리레이 · 처방 무게 · 슈퍼셋 · 루틴 줄 연결이 한 규칙이다.
const EMPTY_VARIANT: VariantColumns = {
  variantKey: null,
  variantEquipment: null,
  variantGrip: null,
  variantArm: null,
  variantLoad: null,
  variantAttach: null,
  machineVariant: null,
};

/**
 * 시작 옵션 — `replacing` 은 「폐기하고 새로 시작」에서 바꿀 진행 중 운동 id.
 * 새 운동을 **만든 같은 write 안에서** 그 운동을 지운다 — 시작이 실패하면(시작할 줄이 없음·종목 해석 실패·DB 오류)
 * 진행 중이던 운동은 그대로 남는다(QA H-1: 먼저 폐기하고 시작이 실패하면 운동만 사라졌다). @plm SRS-065
 */
export type StartOptions = { replacing?: string | null };

/** 진행 중(active·paused) 운동 id 전부. */
async function activeWorkoutIds(): Promise<string[]> {
  const res = await workouts().query(Q.where('state', Q.oneOf(['active', 'paused']))).fetch();
  return res.map((w) => w.id);
}

/**
 * 운동은 하나만 진행한다 — 바꿀 운동(replacing) 말고 진행 중인 것이 있으면 시작하지 않는다(QA L-5).
 * 화면 가드는 기기 메모리의 세션 상태만 보므로, 아직 그것을 다 읽기 전에 누른 경우를 여기서 막는다.
 */
async function assertCanStart(replacing: string | null | undefined): Promise<void> {
  const others = (await activeWorkoutIds()).filter((id) => id !== replacing);
  if (others.length) throw new Error('ACTIVE_EXISTS');
}

/** 운동 하나를 지울 준비(세트·블록·운동) — 부르는 쪽의 write 안에서 batch 로 함께 쓴다. */
async function prepareDiscardRecords(id: string): Promise<(Workout | WorkoutExercise | SetLog)[]> {
  const w = await workouts()
    .find(id)
    .catch(() => null);
  if (!w) return []; // 이미 없으면(다른 기기에서 지움) 지울 것도 없다
  const wes = await workoutExercises().query(Q.where('workout_id', id)).fetch();
  const weIds = wes.map((x) => x.id);
  const sets = weIds.length ? await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(weIds))).fetch() : [];
  return [...sets.map((x) => x.prepareMarkAsDeleted()), ...wes.map((x) => x.prepareMarkAsDeleted()), w.prepareMarkAsDeleted()];
}

async function startWorkoutFromRows(opts: {
  routineId: string | null;
  name: string;
  rows: StartRow[];
  replacing?: string | null;
}): Promise<Workout> {
  const rows = opts.rows; // 빈 루틴은 예전처럼 빈 운동으로 시작한다(다시 시작·피드는 부르기 전에 막는다)
  await assertCanStart(opts.replacing);
  // 칸 결정 — 다시 시작은 원본 칸 그대로(variantExact), 루틴·피드는 미지정이면 지난 조합 승계(resolveStartVariant).
  const variants: VariantColumns[] = [];
  for (const r of rows) {
    const stored: VariantColumns = r.variant ? { ...EMPTY_VARIANT, ...r.variant } : EMPTY_VARIANT;
    variants.push(r.variant && r.variantExact ? stored : await resolveStartVariant(r.exerciseId, stored));
  }
  // [원본] const { getPlateOneSideMap } = await import('./exercisePrefs');
  // const plateMap = await getPlateOneSideMap(rows.map((r) => r.exerciseId));
  // const multiplierAt = (i: number) => blockLoadMultiplier(dimsFromColumns(variants[i]), plateMap.get(rows[i].exerciseId));
  // [개선] 플레이트 후보 머신은 기본이 한쪽(피드백 #63) @plm SRS-084
  const plate = await plateInputsFor(rows.map((r) => r.exerciseId));
  const multiplierAt = (i: number) =>
    blockLoadMultiplierV2(dimsFromColumns(variants[i]), plate.choice.get(rows[i].exerciseId), plate.defaultLoad.get(rows[i].exerciseId));
  const vkey = (i: number) => `${rows[i].exerciseId}::${variants[i].variantKey ?? ''}`;
  const prevSnapByKey = new Map<string, { weightKg: number; reps: number } | null>();
  const prevSetsByKey = new Map<string, LogSetInput[]>();
  const cardioByExercise = new Map<string, boolean>();
  const bwByExercise = new Map<string, boolean>();
  const externalByExercise = new Map<string, boolean>();
  for (let i = 0; i < rows.length; i++) {
    const k = vkey(i);
    if (!prevSnapByKey.has(k)) {
      prevSnapByKey.set(k, await getPreviousExerciseSnapshot(rows[i].exerciseId, variants[i].variantKey));
      prevSetsByKey.set(k, await getPreviousExerciseSets(rows[i].exerciseId, variants[i].variantKey));
    }
    const exId = rows[i].exerciseId;
    if (!cardioByExercise.has(exId)) {
      cardioByExercise.set(exId, await isCardioExerciseId(exId));
      bwByExercise.set(exId, await isBodyweightExerciseId(exId));
      externalByExercise.set(exId, await isExternalLoadExerciseId(exId));
    }
  }
  // 블록별 시작 단위 — 같은 종목·칸으로 마지막에 완료한 블록의 단위(Q1 A). 처방 원판 반올림도 이 단위로. @plm SRS-067
  const unitAt: ('kg' | 'lb')[] = [];
  for (let i = 0; i < rows.length; i++) unitAt.push(await getBlockStartUnit(rows[i].exerciseId, variants[i].variantKey));
  // 처방 무게 기준(1RM 의 N%·직접) — 루틴 시작과 같은 계산 @plm SRS-063
  const rxLoadAt = new Map<number, (number | null)[]>();
  {
    // [원본] const unit = await getUserWeightUnit();
    for (let i = 0; i < rows.length; i++) {
      const unit = unitAt[i];
      const rx = rows[i].prescription;
      if (!rx?.some((r) => r.loadBasis === 'pct1rm' || r.loadBasis === 'fixed')) continue;
      if (cardioByExercise.get(rows[i].exerciseId)) continue;
      const ex = await database.get<Exercise>('exercises').find(rows[i].exerciseId).catch(() => null);
      if (!ex || resolveLoadMode(ex) !== 'external') continue;
      // [원본] const est = … await estimatedOneRmForSlot(rows[i].exerciseId, variants[i].variantKey) …
      // [개선] 옛 null 기록은 이번 블록 배수로(/qa code M-2) @plm SRS-084
      const est = rx.some((r) => r.loadBasis === 'pct1rm')
        ? await estimatedOneRmForSlotV2(rows[i].exerciseId, variants[i].variantKey, multiplierAt(i))
        : 0;
      rxLoadAt.set(
        i,
        rx.map((r) => {
          if (r.loadBasis !== 'pct1rm' && r.loadBasis !== 'fixed') return null;
          const got = resolvePrescribedLoad({
            basis: r.loadBasis,
            pct: r.loadPct,
            kg: r.loadKg,
            est1rmKg: est,
            equipment: ex.equipment,
            unit,
          });
          return 'weightKg' in got && got.weightKg > 0 ? got.weightKg : null;
        }),
      );
    }
  }
  // 묶음 표식(g:…)은 새 그룹 id 로 — 원본 세션·남의 글의 그룹 id 가 새 운동으로 새지 않게. 루틴의 그룹 id 는 그대로(기존 동작).
  const groupIds = new Map<string, string>();
  const groupOf = (g: string | null): string | null => {
    if (!g) return null;
    if (!g.startsWith('g:')) return g;
    let id = groupIds.get(g);
    if (!id) {
      id = randomId('ss_');
      groupIds.set(g, id);
    }
    return id;
  };
  const created = await database.write(async () => {
    const now = Date.now();
    const workout = await workouts().create((w) => {
      w.routineId = opts.routineId;
      w.name = opts.name;
      w.state = 'active';
      w.startedAt = now;
      w.accumulatedPauseMs = 0;
      w.totalVolumeKg = 0;
      w.prCount = 0;
      w.userId = null;
    });
    const weRecords = rows.map((r, i) =>
      workoutExercises().prepareCreate((we) => {
        we.workoutId = workout.id;
        we.exerciseId = r.exerciseId;
        we.sortOrder = i;
        const prev = prevSnapByKey.get(vkey(i)) ?? null;
        we.prevWeightKg = prev?.weightKg ?? null;
        we.prevReps = prev?.reps ?? null;
        we.targetSets = r.targetSets + r.warmupSets;
        we.targetRepsMin = r.targetRepsMin;
        we.targetRepsMax = r.targetRepsMax;
        we.targetWeightKg = r.targetWeightKg;
        we.restSeconds = r.restSeconds;
        const v = variants[i];
        we.machineVariant = v.machineVariant;
        we.variantKey = v.variantKey;
        we.variantEquipment = v.variantEquipment;
        we.variantGrip = v.variantGrip;
        we.variantArm = v.variantArm;
        we.variantLoad = v.variantLoad ?? null;
        we.variantAttach = v.variantAttach ?? null;
        we.supersetGroup = groupOf(r.supersetGroup);
        we.routineExerciseId = r.routineExerciseId; // v24 — 완료 때 루틴과 짝 @plm SRS-059
        we.weightUnit = unitAt[i]; // v25 블록 단위 @plm SRS-067
        we.note = r.note?.trim() || null;
        we.cardioTarget = (r.cardioTarget as CardioTargetJson | null) ?? null;
        we.prescription = r.prescription ?? null;
      }),
    );
    const setRecords: SetLog[] = [];
    rows.forEach((r, i) => {
      const isCardioEx = cardioByExercise.get(r.exerciseId) ?? false;
      const rx = !isCardioEx ? r.prescription : null;
      const count = isCardioEx ? 1 : rx && rx.length > 0 ? rx.length : Math.max(1, r.targetSets + r.warmupSets || 1);
      setRecords.push(
        ...prepareTemplateSets(
          weRecords[i].id,
          count,
          r.targetWeightKg,
          r.targetRepsMin,
          prevSetsByKey.get(vkey(i)) ?? [],
          prevSnapByKey.get(vkey(i)) ?? null,
          isCardioEx,
          bwByExercise.get(r.exerciseId) ?? false,
          (r.cardioTarget as CardioTargetJson | null) ?? null,
          rx,
          multiplierAt(i),
          rxLoadAt.get(i) ?? [],
          isCardioEx ? 0 : r.warmupSets,
          externalByExercise.get(r.exerciseId) ?? true,
        ),
      );
    });
    // 바꿀 운동은 새 운동과 **같은 batch** 로 지운다 — 둘 다 되거나 둘 다 안 된다(QA H-1).
    const discards = opts.replacing ? await prepareDiscardRecords(opts.replacing) : [];
    await database.batch(...weRecords, ...setRecords, ...discards);
    return workout;
  });
  if (opts.replacing) scheduleSync(); // 지운 운동을 서버·다른 기기에 반영
  return created;
}

// [개선] 루틴 시작 — 루틴 줄 → 시작할 줄 → 공통 시작(규칙은 V1 과 같다: 명시 칸 · 미지정이면 지난 조합 · 처방 · 메모 시드) @plm SRS-065
export async function startWorkoutFromRoutine(routineId: string, startOpts: StartOptions = {}): Promise<Workout> {
  const routine = await routines().find(routineId);
  const res = await routineExercises()
    .query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  // 줄 → 시작할 줄 매핑은 순수 함수(domain/replay.routineLinesToStartRows — 회귀 테스트로 고정 · QA M-4)
  const rows: StartRow[] = routineLinesToStartRows(
    res.map((re) => ({
      id: re.id,
      exerciseId: re.exerciseId,
      targetSets: re.targetSets,
      targetRepsMin: re.targetRepsMin,
      targetRepsMax: re.targetRepsMax,
      targetWeightKg: re.targetWeightKg,
      restSeconds: re.restSeconds,
      machineVariant: re.machineVariant ?? null,
      variantKey: re.variantKey ?? null,
      variantEquipment: re.variantEquipment ?? null,
      variantGrip: re.variantGrip ?? null,
      variantArm: re.variantArm ?? null,
      variantLoad: re.variantLoad ?? null,
      variantAttach: re.variantAttach ?? null,
      supersetGroup: re.supersetGroup ?? null,
      prescription: re.prescription ?? null,
      cardioTarget: re.cardioTarget ?? null,
      note: re.note ?? null,
    })),
  );
  return startWorkoutFromRows({ routineId, name: routine.name, rows, replacing: startOpts.replacing });
}

/** 시작한 루틴이 아직 있으면 그 id(보관·삭제면 null — 빠른 운동처럼). */
async function liveRoutineId(routineId: string | null): Promise<string | null> {
  if (!routineId) return null;
  try {
    const r = await routines().find(routineId);
    return r.isArchived ? null : r.id;
  } catch {
    return null;
  }
}

/**
 * 「이 운동 그대로 다시 시작」 — 지난 운동의 종목·순서·세트 수(워밍업 포함)·슈퍼셋·칸·목표로, 무게는 이전 기록으로.
 * 원본이 루틴에서 왔고 그 루틴이 남아 있으면 그 루틴에 잇는다(끝낼 때 루틴 반영이 그대로 돈다). @plm SRS-065
 */
export async function startWorkoutFromWorkout(sourceWorkoutId: string, startOpts: StartOptions = {}): Promise<Workout> {
  const source = await workouts().find(sourceWorkoutId);
  const wes = await workoutExercises()
    .query(Q.where('workout_id', sourceWorkoutId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  const sets = wes.length
    ? await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((w) => w.id)))).fetch()
    : [];
  const exIds = [...new Set(wes.map((w) => w.exerciseId))];
  const exRows = exIds.length ? await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf(exIds))).fetch() : [];
  const kindOf = new Map(exRows.map((e) => [e.id, e.kind]));
  // 루틴에 잇는 것은 **그 루틴의 가장 최근 운동**을 다시 할 때뿐 — 몇 주 전 운동을 다시 하고 끝내면 루틴 반영(SRS-059)이
  // 지금 루틴을 옛 구성으로 되돌리자고 묻게 된다(QA L-3). 그 밖에는 빠른 운동처럼 시작한다.
  let routineId = await liveRoutineId(source.routineId);
  if (routineId) {
    const latest = await workouts()
      .query(Q.where('routine_id', routineId), Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc), Q.take(1))
      .fetch();
    if (latest[0] && latest[0].id !== source.id) routineId = null;
  }
  const liveLines = routineId
    ? new Set((await routineExercises().query(Q.where('routine_id', routineId)).fetch()).map((re) => re.id))
    : new Set<string>();
  // 화면과 같은 순서(sort_order → 만든 시각) — 운동 중 지우고 추가해 sort_order 가 겹친 운동도 그날 순서대로
  const ordered = [...wes].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0),
  );
  const source_: ReplaySourceBlock[] = ordered.map((we, i) => ({
    id: we.id,
    exerciseId: we.exerciseId,
    sortOrder: i,
    supersetGroup: we.supersetGroup ?? null,
    routineExerciseId: we.routineExerciseId && liveLines.has(we.routineExerciseId) ? we.routineExerciseId : null,
    isCardio: kindOf.get(we.exerciseId) === 'cardio',
    targetRepsMin: we.targetRepsMin ?? null,
    targetRepsMax: we.targetRepsMax ?? null,
    restSeconds: we.restSeconds ?? null,
    prescription: we.prescription ?? null,
    cardioTarget: we.cardioTarget ?? null,
    variant: { ...EMPTY_VARIANT, ...variantColumnsOf(we), variantLoad: we.variantLoad ?? null, variantAttach: we.variantAttach ?? null },
    sets: sets.filter((st) => st.workoutExerciseId === we.id).map((st) => ({ done: st.done, isWarmup: st.isWarmup })),
  }));
  const rows = planReplay(source_);
  if (!rows.length) throw new Error('NOTHING_TO_REPLAY');
  // [원본] name: source.name?.trim() || '빠른 운동' — 자동 이름(「가슴·삼두 · 2종목」)까지 복사돼 종목이 바뀌어도 낡은 채 남았다(P3 QA M3)
  // [개선] 루틴 운동은 루틴 이름 그대로, 빠른 운동의 자동 이름은 기본 이름으로 — 완료 때 다시 짓는다 @plm SRS-071
  const name = routineId ? source.name?.trim() || '빠른 운동' : inheritedWorkoutName(source.name);
  return startWorkoutFromRows({ routineId, name, rows, replacing: startOpts.replacing });
}

/** 피드의 남의 운동으로 바로 시작 — 종목은 이미 내 기기 종목으로 해석된 뒤다. 루틴을 만들지 않는다. @plm SRS-065 */
export async function startWorkoutFromSpec(
  name: string,
  items: { exerciseId: string; sets: number; supersetGroup?: string | null }[],
  startOpts: StartOptions = {},
): Promise<Workout> {
  const rows = planFromSpec(items);
  if (!rows.length) throw new Error('NOTHING_TO_REPLAY');
  // [원본] name: name.trim() || '빠른 운동' — 남의 자동 이름을 그대로 받아 종목 수가 틀렸다(P3 QA M3) @plm SRS-071
  return startWorkoutFromRows({ routineId: null, name: inheritedWorkoutName(name), rows, replacing: startOpts.replacing });
}

/** 운동 총평(나만 보는 운동 한 줄 평 · 피드 글과 별개) — 2,000자 · 공백만이면 지운다. @plm SRS-064 */
export const WORKOUT_NOTE_MAX = 2000;
export async function setWorkoutNote(workoutId: string, text: string): Promise<void> {
  const v = text.trim().slice(0, WORKOUT_NOTE_MAX);
  await database.write(async () => {
    const w = await workouts().find(workoutId);
    if ((w.notes ?? '') === v) return;
    await w.update((rec) => {
      rec.notes = v || null;
    });
  });
  scheduleSync();
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

// 운동 도중 세션(루틴) 이름 변경 (@plm SRS-004). 빈 이름은 기본값으로 폴백.
export async function renameWorkout(workoutId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  await database.write(async () => {
    const w = await workouts().find(workoutId);
    await w.update((rec) => {
      rec.name = trimmed || '빠른 운동';
    });
  });
  scheduleSync(); // 이름 변경을 서버·다른 기기에 반영
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  // 즉석 추가도 '마지막 수행 변형'을 승계 — 그래야 프리레이에 쓴 이전기록과 블록이 조회하는 버킷이 같다
  // (구: 버킷 무관 조회 + 기본 버킷 저장 → 값은 채워졌는데 이전기록·PR은 비어 보였다). @plm SRS-028
  const variant = await resolveStartVariant(exerciseId, {
    variantKey: null,
    variantEquipment: null,
    variantGrip: null,
    variantArm: null,
    machineVariant: null,
  });
  const prevSnap = await getPreviousExerciseSnapshot(exerciseId, variant.variantKey);
  const prevSets = await getPreviousExerciseSets(exerciseId, variant.variantKey);
  const cardio = await isCardioExerciseId(exerciseId);
  const bodyweight = await isBodyweightExerciseId(exerciseId);
  // [원본] const { getPlateOneSide } = await import('./exercisePrefs');
  // const multiplier = blockLoadMultiplier(dimsFromColumns(variant), await getPlateOneSide(exerciseId)); // v22 @plm SRS-058
  // [개선] 플레이트 후보 머신은 기본이 한쪽(피드백 #63) @plm SRS-084
  const plate = await plateInputsFor([exerciseId]);
  const multiplier = blockLoadMultiplierV2(dimsFromColumns(variant), plate.choice.get(exerciseId), plate.defaultLoad.get(exerciseId));
  return database.write(async () => {
    // [원본] const count = await workoutExercises().query(Q.where('workout_id', workoutId)).fetchCount();
    // — 지운 종목의 번호를 다시 매기지 않아, 하나 지운 뒤 넣으면 남은 종목과 순서값이 겹쳤다(루틴과 같은 결함 · SRS-093 qa M-2)
    // [개선] 남은 종목의 가장 큰 순서값 다음
    const count = (await workoutExercises().query(Q.where('workout_id', workoutId)).fetch()).reduce(
      (m, r) => Math.max(m, (r.sortOrder ?? -1) + 1),
      0,
    );
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
      // v6: 기본(미지정) — 단, 이 종목을 변형으로만 수행해 왔다면 그 변형 승계(헤더에서 변경 가능)
      rec.machineVariant = variant.machineVariant; // 레거시 미러
      rec.variantKey = variant.variantKey;
      rec.variantEquipment = variant.variantEquipment;
      rec.variantGrip = variant.variantGrip;
      rec.variantArm = variant.variantArm;
      rec.variantLoad = variant.variantLoad ?? null; // v22 @plm SRS-058
      rec.variantAttach = variant.variantAttach ?? null;
    });
    const setRecords = prepareTemplateSets(
      we.id,
      setsCount,
      null,
      prevSnap?.reps ?? null,
      prevSets,
      prevSnap,
      cardio,
      bodyweight,
      null,
      null,
      multiplier,
    );
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

// 종목 인스턴스의 변형 컬럼 묶음 — 승계(교체·세션 시작)에서 통째로 복사한다. @plm SRS-028
export interface VariantColumns {
  variantKey: string | null;
  variantEquipment: string | null;
  variantGrip: string | null;
  variantArm: string | null;
  variantLoad?: string | null; // v22 @plm SRS-058
  variantAttach?: string | null; // v22 @plm SRS-058
  machineVariant: string | null;
}

const variantColumnsOf = (rec: WorkoutExercise): VariantColumns => ({
  variantKey: rec.variantKey,
  variantEquipment: rec.variantEquipment,
  variantGrip: rec.variantGrip,
  variantArm: rec.variantArm,
  variantLoad: rec.variantLoad, // v22: 지난 조합 승계에 적재 방식·부착물도 함께(ADR-034) @plm SRS-058
  variantAttach: rec.variantAttach,
  machineVariant: rec.machineVariant,
});

// 이 종목을 '실제로 수행한' 완료 세션 인스턴스들(최신순). 변형 승계·버킷 이력 판정의 공통 기반.
// 세션당 순회(완료 세션 수 × 쿼리)가 아니라 3쿼리로 모으므로 이력이 쌓여도 시작이 느려지지 않는다.
async function performedInstancesOf(exerciseId: string): Promise<{ we: WorkoutExercise; completedAt: number }[]> {
  const wes = await workoutExercises().query(Q.where('exercise_id', exerciseId)).fetch();
  if (!wes.length) return [];
  const wIds = [...new Set(wes.map((w) => w.workoutId))];
  const ws = await workouts().query(Q.where('id', Q.oneOf(wIds)), Q.where('state', 'completed')).fetch();
  const atById = new Map(ws.map((w) => [w.id, w.completedAt ?? w.startedAt]));
  const cands = wes.filter((w) => atById.has(w.workoutId));
  if (!cands.length) return [];
  const sets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(cands.map((c) => c.id)))).fetch();
  const performed = new Set(sets.filter(isPerformed).map((s) => s.workoutExerciseId));
  return cands
    .filter((c) => performed.has(c.id))
    .map((c) => ({ we: c, completedAt: atById.get(c.workoutId) as number }))
    .sort((a, b) => b.completedAt - a.completedAt);
}

// 칸 시트 「최근 쓴 브랜드」 — 이 종목을 수행한 완료 블록의 브랜드(최신순·중복 제거·최대 3) @plm SRS-071
export async function getRecentBrands(exerciseId: string, limit = 3): Promise<string[]> {
  const instances = await performedInstancesOf(exerciseId);
  return pickRecentBrands(
    instances.map(({ we }) => dimsFromColumns(variantColumnsOf(we)).equipment ?? null),
    MACHINE_BRAND_VARIANT_KEYS,
    limit,
  );
}

// 종목의 '가장 최근 수행' 변형 컨텍스트(완료 세션·수행 세트 있는 인스턴스 기준) — 종목 교체 시 승계용.
// 이전기록·PR은 (종목×변형) 버킷으로 분리 조회되므로, 버킷을 무조건 기본(null)으로 리셋하면
// 변형으로만 수행해 온 종목은 교체 직후 이전기록이 비어 보인다. 이력 없으면 null.
export async function getLatestVariantUsage(exerciseId: string): Promise<VariantColumns | null> {
  const [latest] = await performedInstancesOf(exerciseId);
  return latest ? variantColumnsOf(latest.we) : null;
}

// 세션 재료화(루틴 시작·즉석 추가) 시 버킷 결정 — 변형이 '미지정(기본 버킷)'인데 기본 버킷엔 수행 이력이
// 없고 다른 변형으로 수행한 이력이 있으면 마지막 수행 변형을 승계한다(종목 교체와 같은 규칙).
// 이게 없으면 "많이 해온 종목인데 이 루틴으로 시작하니 이전기록·PR이 안 보인다"가 된다(2026-08-01 리포트).
// 변형이 명시된 종목은 손대지 않는다 — 사용자가 고른 기구가 우선. @plm SRS-028
async function resolveStartVariant(exerciseId: string, stored: VariantColumns): Promise<VariantColumns> {
  // [원본] 기본 칸에 이력이 하나라도 있으면 기본 칸 — 로프로 해 온 사람이 다음에도 기본(부착물 없음) 칸에서 시작했다
  // if (stored.variantKey != null) return stored; // 명시 선택 존중
  // const instances = await performedInstancesOf(exerciseId);
  // if (!instances.length) return stored; // 이력 없음 — 기본 버킷
  // if (instances.some(({ we }) => we.variantKey == null)) return stored; // 기본 버킷에 이력 있음 — 그대로
  // return variantColumnsOf(instances[0].we); // 전부 다른 변형 → 마지막 수행 변형 승계
  // [개선] ADR-034: 지난번 수행 조합 승계(브랜드·적재 방식·부착물·그립) — 명시 칸이 있으면 그것 @plm SRS-058
  if (stored.variantKey != null) return stored;
  const [latest] = await performedInstancesOf(exerciseId);
  return pickStartSlot(stored, latest ? variantColumnsOf(latest.we) : null);
}

// 운동 중 종목 교체(BS-002 #22) — 삭제·재추가 없이 이 인스턴스의 종목만 교체. 세트는 유지(새 종목 기록으로),
// 변형은 새 종목의 '마지막 수행 변형'을 승계 — 교체 직후 그 기록의 이전기록·PR이 바로 보인다(이력 없으면 기본). @plm SRS-004 SRS-028
export async function swapWorkoutExercise(workoutExerciseId: string, newExerciseId: string): Promise<void> {
  const lastVariant = await getLatestVariantUsage(newExerciseId);
  // 스냅샷도 승계 버킷 기준(있으면) — 이전기록 표시·프리필과 같은 기록을 가리키게.
  const prevSnap = await getPreviousExerciseSnapshot(newExerciseId, lastVariant ? lastVariant.variantKey : undefined);
  await database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    await we.update((rec) => {
      rec.exerciseId = newExerciseId;
      rec.prevWeightKg = prevSnap?.weightKg ?? null;
      rec.prevReps = prevSnap?.reps ?? null;
      rec.variantKey = lastVariant?.variantKey ?? null;
      rec.variantEquipment = lastVariant?.variantEquipment ?? null;
      rec.variantGrip = lastVariant?.variantGrip ?? null;
      rec.variantArm = lastVariant?.variantArm ?? null;
      rec.variantLoad = lastVariant?.variantLoad ?? null; // v22 @plm SRS-058
      rec.variantAttach = lastVariant?.variantAttach ?? null;
      rec.machineVariant = lastVariant?.machineVariant ?? null;
    });
    // 세트 그립은 바꾸기 전 종목의 자세다 — 새 종목 기록에 남기지 않는다(REV-045 M-1)
    const gripped = (await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch()).filter((s) => s.grip);
    if (gripped.length > 0) {
      await database.batch(...gripped.map((s) => s.prepareUpdate((rec) => { rec.grip = null; })));
    }
  });
  // 입력한 세트는 이 블록에 그대로 남는다(새 종목 기록으로) — 새 칸의 입력 방식(한쪽/양쪽)에 배수를 맞춘다. @plm SRS-058
  await syncBlockLoadMultiplier(workoutExerciseId);
}

// ── 세트 편집 (템플릿 프리레이 + 완료 체크 — Hevy식) ────────────────
export interface LogSetInput {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
  isFailed?: boolean;
  partialReps?: number | null; // v9: 부분반복(깔짝) — 이전기록 표시 시 정자세와 구분
  durationSec?: number | null; // v10: 유산소 시간(초) — 이전기록 표시용. @plm SRS-030
  distanceM?: number | null; // v10: 유산소 거리(미터) — 이전기록 표시용. @plm SRS-030
  inclinePct?: number | null; // v13: 유산소 경사(%). @plm SRS-030
  level?: number | null; // v13: 유산소 단계. @plm SRS-030
  speedKmh?: number | null; // v15: 유산소 속도(km/h·러닝머신). @plm SRS-030
  arm?: string | null; // v8: 세트별 편측(원암/투암) — 이전기록에 옵션 표시. @plm SRS-028
  grip?: string | null; // v11: 세트별 그립(오버/언더/…) — 이전기록에 옵션 표시. @plm SRS-028
  loadMultiplier?: number | null; // v22: 무게 배수(플레이트 한쪽=2) — 프리필을 이번 입력 방식으로 환산 @plm SRS-058
}

// 운동 중 세트 추가 — 기본은 미완료(done=false) 템플릿. 값 미지정 시 마지막 세트 복제.
export async function addSet(
  workoutExerciseId: string,
  input: {
    weightKg?: number;
    reps?: number;
    isWarmup?: boolean;
    done?: boolean;
    cardio?: boolean;
    bodyweight?: boolean;
    /** v27: 넘긴 값의 출처(없으면 user — 사람이 적은 값) */
    source?: ValueSource;
  } = {},
): Promise<SetLog> {
  return database.write(async () => {
    const existing = await setLogs()
      .query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc))
      .fetch();
    const last = existing[existing.length - 1];
    const done = input.done ?? false;
    // 유산소 세트는 무게/횟수 대신 시간·거리로 기록 → 볼륨 오염 방지 위해 0으로 생성. @plm SRS-030
    const cardio = input.cardio ?? false;
    const bwDefault = input.bodyweight ? 0 : 20; // 맨몸은 첫 세트 기본 0(가중 시 입력). @plm SRS-005
    // v22: 블록의 배수(플레이트 한쪽=2) — 세트가 있으면 같은 블록의 마지막 세트를 따른다(블록 안에서 같게 유지된다) @plm SRS-058
    // [원본] const multiplier = cardio ? null : last ? last.loadMultiplier ?? null : await blockMultiplierOf(workoutExerciseId);
    const multiplier = cardio ? null : last ? last.loadMultiplier ?? null : await blockMultiplierOfV2(workoutExerciseId); // @plm SRS-084
    return setLogs().create((s) => {
      s.workoutExerciseId = workoutExerciseId;
      s.setNumber = existing.length + 1;
      s.weightKg = input.weightKg ?? (cardio ? 0 : last?.weightKg ?? bwDefault);
      s.reps = input.reps ?? (cardio ? 0 : last?.reps ?? 8);
      s.rpe = null;
      s.isWarmup = input.isWarmup ?? false;
      s.isFailed = false;
      // 마지막 세트의 그립·팔을 새 세트에 상속(같은 종목 이어서 하니 동일 옵션이 자연스러움). @plm SRS-028
      s.arm = cardio ? null : last?.arm ?? null;
      // [원본] s.grip = cardio ? null : last?.grip ?? null;
      // [원본] ADR-034: 손 그립은 블록 칸 — 세트 그립은 옛 기록 표시용으로만 남는다 @plm SRS-058
      // s.grip = null;
      // [개선] 세트 그립을 세트마다 쓴다(ADR-055) — 팔처럼 마지막 세트의 값을 잇는다
      s.grip = cardio ? null : last?.grip ?? null;
      s.loadMultiplier = multiplier;
      // v25: 값을 넘겨받았으면 사람이 적은 것, 아니면 앞 세트를 복제한 자동 채움(/qa code H-3) @plm SRS-067
      s.userEdited = input.weightKg !== undefined || input.reps !== undefined || done;
      // v27(SPEC-017 §8): 넘긴 값 → 넘긴 쪽 출처(없으면 user) · 직전 세트 복제 → 완료했거나 사람이 고친 세트면 user
      // (사람이 실제로 든 값 · REV-003 도메인 M-6), 아니면 직전 세트 출처(기본값이면 copied_default) · 첫 세트 기본값 → default
      // 칸별(REV-005 H-1): 넘긴 칸은 넘긴 쪽 출처, 나머지는 복제한 칸의 출처
      const copied = (v: ValueSource | null): ValueSource | null => (v === 'default' ? 'copied_default' : v);
      const lastSrc = decodeValueSource(last?.valueSource);
      const base: { weight: ValueSource | null; reps: ValueSource | null } = done
        ? { weight: 'user', reps: 'user' }
        : !last || cardio
          ? { weight: 'default', reps: 'default' }
          : last.done === true || last.userEdited === true
            ? { weight: 'user', reps: 'user' }
            : { weight: copied(lastSrc.weight), reps: copied(lastSrc.reps) };
      const passedSrc = input.source ?? 'user';
      s.valueSource = encodeValueSource(
        input.weightKg !== undefined ? passedSrc : base.weight,
        input.reps !== undefined ? passedSrc : base.reps,
      );
      s.done = done;
      s.completedAt = done ? Date.now() : null;
    });
  });
}

// 미완료(done=false) 세트 수 — 종료 확인 문구에 남은 세트를 보여준다(처방·비처방 공통). @plm SRS-043
export async function getWorkoutUndoneSetCount(workoutId: string): Promise<number> {
  const wes = await workoutExercises().query(Q.where('workout_id', workoutId)).fetch();
  if (wes.length === 0) return 0;
  return setLogs()
    .query(Q.where('workout_exercise_id', Q.oneOf(wes.map((w) => w.id))), Q.where('done', false))
    .fetchCount();
}

// 세트 완료 체크 토글 — 볼륨/PR/이력은 done인 세트만 센다.
// [원본] export async function setSetDone(id: string, done: boolean): Promise<void> {
//   await database.write(async () => {
//     const s = await setLogs().find(id);
//     await s.update((rec) => {
//       rec.done = done;
//       rec.completedAt = done ? Date.now() : null;
//     });
//   });
// }
// [개선] 완료 시각 인자(잠금 중 누른 시각 · SPEC-017 §10) · 이미 같은 상태면 아무것도 쓰지 않는다 — 판정과 쓰기가 같은 write 안
// (지금 완료된 세트의 완료 시각을 덮던 것 · REV-003 저장소 M-7). 바꿨으면 true.
export async function setSetDone(id: string, done: boolean, completedAt: number = Date.now()): Promise<boolean> {
  return database.write(async () => {
    const s = await setLogs().find(id);
    if ((s.done === true) === done) return false;
    await s.update((rec) => {
      rec.done = done;
      rec.completedAt = done ? completedAt : null;
    });
    return true;
  });
}

// ── 슈퍼셋 함께 완료(#48) ── @plm SRS-062
// 묶음의 같은 번호 세트를 한 번에 완료·해제한다. 멤버 칸에 **입력만 하고 아직 저장 안 된 값**(화면이 모아 준다 ·
// QA Q3)을 먼저 반영하고 done 을 바꾼다 — 한 번의 write 라 중간에 끊겨도 반쪽 상태가 남지 않는다.
export async function completeSupersetRound(
  entries: { setLogId: string; weightKg?: number; reps?: number }[],
  done: boolean,
  completedAt: number = Date.now(), // 잠금 중 누른 시각(SPEC-017 §10)
): Promise<string[]> {
  if (!entries.length) return [];
  return database.write(async () => {
    const now = completedAt;
    const recs = await setLogs().query(Q.where('id', Q.oneOf(entries.map((e) => e.setLogId)))).fetch();
    const byId = new Map(entries.map((e) => [e.setLogId, e]));
    // 이미 같은 상태이고 바꿀 값도 없는 세트는 건드리지 않는다 — 먼저 완료한 세트의 완료 시각을 덮지 않게(/qa code L6)
    const valid = (x: number | undefined) => (x != null && Number.isFinite(x) && x >= 0 ? x : undefined);
    // [원본] return (s.done === true) !== done || e?.weightKg != null || e?.reps != null;
    // [개선] 값이 **실제로 다를 때만** 쓴다 — 같은 값 재저장이 updated_at 을 바꿔 동기를 만들던 것(REV-005 저장소 L-3)
    const changed = recs.filter((s) => {
      const e = byId.get(s.id);
      const w = valid(e?.weightKg);
      const r = valid(e?.reps);
      return (s.done === true) !== done || (w !== undefined && w !== s.weightKg) || (r !== undefined && r !== s.reps);
    });
    const doneChanged = recs.filter((s) => (s.done === true) !== done).map((s) => s.id);
    await database.batch(
      ...changed.map((s) =>
        s.prepareUpdate((rec) => {
          const e = byId.get(s.id);
          // [원본] if (e?.weightKg != null && …) rec.weightKg = e.weightKg; if (e?.reps != null && …) rec.reps = e.reps;
          // [개선] 입력 중 값 저장은 사람이 적은 값 — user_edited·출처 user 를 함께(지금은 user_edited 도 안 바꿨다 · SPEC-017 §8)
          const w = valid(e?.weightKg);
          const r = valid(e?.reps);
          writeSetValues(
            rec,
            { weightKg: w !== undefined && w !== rec.weightKg ? w : undefined, reps: r !== undefined && r !== rec.reps ? r : undefined },
            'user',
          );
          // 이미 같은 상태인 세트는 완료 시각을 덮지 않는다(/qa code L6)
          if ((rec.done === true) !== done) {
            rec.done = done;
            rec.completedAt = done ? now : null;
          }
        }),
      ),
    );
    // 완료 상태가 바뀐 세트만(빈 배열 = 전부 이미 그 상태 — noop · REV-005 화면 L-2)
    return doneChanged;
  });
}

// 슈퍼셋 한 바퀴의 대상 — 묶음 멤버마다 같은 번호(set_number) 세트. 없는 멤버는 건너뛴다(#48 A). @plm SRS-062
export async function getSupersetRoundSets(
  workoutExerciseIds: string[],
  setNumber: number,
): Promise<{ workoutExerciseId: string; setLogId: string; done: boolean }[]> {
  if (!workoutExerciseIds.length) return [];
  const sets = await setLogs()
    .query(Q.where('workout_exercise_id', Q.oneOf(workoutExerciseIds)), Q.where('set_number', setNumber))
    .fetch();
  return sets.map((s) => ({ workoutExerciseId: s.workoutExerciseId, setLogId: s.id, done: s.done === true }));
}

// [개선] 짝은 **화면 번호**로 — 한쪽에만 워밍업이 있어도 화면 「1」끼리(/qa code M3). 워밍업·드롭·실패 칸은 그 종목만.
// 저장값(무게·횟수)도 돌려준다 — 묶음 완료 뒤 다른 멤버의 처방 무게 채움(M5)에 쓴다. @plm SRS-062
export async function getSupersetRoundSetsFor(
  workoutExerciseIds: string[],
  pressedSetId: string,
): Promise<{ workoutExerciseId: string; setLogId: string; done: boolean; weightKg: number; reps: number }[]> {
  if (!workoutExerciseIds.length) return [];
  const all = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(workoutExerciseIds))).fetch();
  const pressed = all.find((x) => x.id === pressedSetId);
  if (!pressed) return [];
  const members = workoutExerciseIds.map((id) => ({ workoutExerciseId: id, sets: all.filter((x) => x.workoutExerciseId === id) }));
  const own = members.find((m) => m.workoutExerciseId === pressed.workoutExerciseId);
  const key = own ? roundKeyOf(own.sets, pressedSetId) : null;
  // 짝이 없는 칸(워밍업 등)은 누른 세트만
  const picked = key ? pickRoundSets(members, key) : [{ workoutExerciseId: pressed.workoutExerciseId, setLogId: pressed.id, set: pressed }];
  return picked.map((p) => ({
    workoutExerciseId: p.workoutExerciseId,
    setLogId: p.setLogId,
    done: p.set.done === true,
    weightKg: p.set.weightKg,
    reps: p.set.reps,
  }));
}

// 세트 타입(일반/워밍업/드롭/실패/탑/백오프) — 상호 배타. 표시 W/숫자/D/F/T/B. 실패는 메뉴에서 뺐고 옛 호출만 남았다(SPEC-023).
// [원본] export type SetType = 'normal' | 'warmup' | 'drop' | 'failed' | 'top' | 'backoff';
// [개선] 피더(P) — 탑세트 앞 가벼운 준비 세트. 웜업 표시도 켜서 볼륨·PR·1RM·근육 부하·세트 수에서 빠진다(SPEC-041)
export type SetType = 'normal' | 'warmup' | 'drop' | 'failed' | 'top' | 'backoff' | 'feeder';
export async function setSetType(id: string, type: SetType): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      // [원본] rec.isWarmup = type === 'warmup';
      rec.isWarmup = type === 'warmup' || type === 'feeder';
      rec.isDrop = type === 'drop';
      rec.isFailed = type === 'failed';
      // setType 칸도 함께 맞춘다 — 처방 웜업을 일반으로 바꿔도 칸이 남으면 볼륨에는 들고 근육 부하에서는 빠졌다(SPEC-023)
      // [원본] rec.setType = type === 'top' || type === 'backoff' || type === 'warmup' ? type : null;
      rec.setType = type === 'top' || type === 'backoff' || type === 'warmup' || type === 'feeder' ? type : null;
    });
  });
}

// ── 운동 중 세트 방식 바꾸기(SPEC-041 · SRS-105) ──
// 끝낸 세트는 그대로 두고, 남은(안 한) 세트를 새 방식의 남은 줄로 바꾼다. 한 번의 쓰기 — 지우기·만들기·번호 다시 매기기·처방 다시 쓰기.
// 무게는 「추정 1RM 의 %」(그날 칸 기준) · 탑을 이미 했으면 「탑의 %」도 바로 채운다. 기록이 없으면 지금 무게를 둔다(첫 작업 세트 뒤 기존 흐름이 채운다).
export interface SchemeChangeInfo {
  /** 루틴 줄에 정한 세트 방식(없으면 null) */
  routineScheme: SchemeId | null;
  /** 지금 표의 세트 방식 */
  current: SchemeId | null;
  equipment: string | null;
  /** 무게 기준을 쓰는 종목인가(맨몸·어시스트·유산소는 false) */
  allowLoad: boolean;
  /** 안 한 세트 중 사람이 값을 고친 세트가 있나 — 있으면 화면이 먼저 묻는다 */
  editedPending: boolean;
}

export async function getSchemeChangeInfo(weId: string): Promise<SchemeChangeInfo> {
  const we = await workoutExercises().find(weId);
  const ex = await database.get<Exercise>('exercises').find(we.exerciseId).catch(() => null);
  const allowLoad = !!ex && resolveLoadMode(ex) === 'external' && !(await isCardioExerciseId(we.exerciseId));
  let routineScheme: SchemeId | null = null;
  if (we.routineExerciseId) {
    const re = await database.get<RoutineExercise>('routine_exercises').find(we.routineExerciseId).catch(() => null);
    routineScheme = schemeOf(re?.prescription ?? null);
  }
  const sets = await setLogs().query(Q.where('workout_exercise_id', weId)).fetch();
  return {
    routineScheme,
    current: schemeOf(we.prescription),
    equipment: ex?.equipment ?? null,
    allowLoad,
    editedPending: sets.some((x) => !x.done && touchedByUser(x)),
  };
}

export async function changeWorkoutScheme(
  weId: string,
  scheme: SchemeId,
  opts: { expectEditedPending?: boolean } = {},
): Promise<'done' | 'blocked' | 'stale'> {
  // [원본] 세트를 쓰기 잠금 밖에서 읽고 그 스냅샷으로 지웠다 — 그 사이 끝낸 세트가 지워지거나, 겹친 호출이 세트를
  //   한 벌 더 만들었다(REV-076 데이터 1). 읽기·계획·쓰기를 한 database.write 안에서 한다.
  const info0 = await getSchemeChangeInfo(weId);
  if (!schemeAllowed(scheme, info0.equipment)) return 'blocked'; // 기구 제한은 저장소에서도(REV-076 코치 8)
  const we0 = await workoutExercises().find(weId);
  if (await isCardioExerciseId(we0.exerciseId)) return 'blocked'; // 유산소는 세트 방식이 없다(REV-076 데이터 12)
  const unit = we0.weightUnit ? blockWeightUnit(we0) : await getUserWeightUnit(); // 블록 단위로 반올림(데이터 3)
  const blockMult = await blockMultiplierOfV2(weId);
  const est1rm = info0.allowLoad
    ? await estimatedOneRmForSlotV2(we0.exerciseId, effectiveVariantKey(we0), blockMult ?? 1) // 데이터 10
    : 0;
  return database.write(async () => {
    const we = await workoutExercises().find(weId);
    const sets = (await setLogs().query(Q.where('workout_exercise_id', weId)).fetch()).sort(
      (a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id),
    );
    // 화면이 물은 뒤 상태가 바뀌었으면(직접 고친 값이 새로 생김) 멈춘다 — 화면이 다시 묻는다
    const editedNow = sets.some((x) => !x.done && touchedByUser(x));
    if (opts.expectEditedPending === false && editedNow) return 'stale';
    const doneSets = sets.filter((x) => x.done);
    const pending = sets.filter((x) => !x.done);
    const doneKinds: DoneSetKind[] = doneSets.map((x) => ({
      setType: (x.setType as PrescribedSetType | null) ?? (x.isDrop ? 'drop' : x.isWarmup ? 'warmup' : 'normal'),
      isWarmup: x.isWarmup,
    }));
    const left = remainingSchemeRows(scheme, doneKinds, { allowLoad: info0.allowLoad });
    // 끝낸 자리의 처방 — 그 세트의 타입만 남기고 새 방식 표시를 단다(표 전체가 한 방식으로 읽히게)
    const doneRx: PrescribedSet[] = doneKinds.map((d) => ({
      setType: d.setType,
      targetRir: null,
      repMin: null,
      repMax: null,
      loadHint: null,
      ...(scheme !== 'straight' ? { scheme } : {}),
    }));
    const nextRx = [...doneRx, ...left];
    // [원본] 무게는 sets[0] 배수로 나누고 저장은 fallback 배수로 — 세트 0개·옛 null 행이면 계산 무게가 절반이 됐다(데이터 2)
    // [개선] 배수 하나(m)로 나누고 같은 값을 저장한다
    const m = sets.find((x) => x.loadMultiplier != null)?.loadMultiplier ?? blockMult ?? null;
    const div = m && m > 0 ? m : 1;
    // 1RM — 기록, 없으면 오늘 끝낸 작업 세트(준비·드롭·실패 제외)로(REV-076 코치 3)
    let est = est1rm;
    if (info0.allowLoad && !(est > 0)) {
      for (const x of doneSets) {
        if (x.isWarmup || x.isDrop || x.isFailed || !(x.reps > 0)) continue;
        est = Math.max(est, estimateOneRepMax(x.weightKg * (x.loadMultiplier ?? 1), x.reps));
      }
    }
    const top = [...doneSets].reverse().find((x) => x.setType === 'top');
    const topKg = top ? top.weightKg * (top.loadMultiplier ?? 1) : 0;
    const fallback = pending[0] ?? doneSets[doneSets.length - 1] ?? null;
    const tplTopPct = left.find((r) => r.setType === 'top')?.loadPct ?? null;
    /** 무게와 계산 성공 여부 — 근거가 없으면 준비·드롭 줄은 비우고(작업 무게로 웜업하지 않게) 작업 줄은 지금 무게 */
    const weightFor = (r: PrescribedSet): { kg: number; rx: boolean } => {
      if (info0.allowLoad && (r.loadBasis === 'pct1rm' || r.loadBasis === 'pctTop')) {
        // 탑이 아직 남았으면 「탑의 %」 줄은 틀의 탑 % × 백오프 % 로 임시(탑을 하면 다시 채운다)
        const got =
          r.loadBasis === 'pctTop' && !(topKg > 0) && tplTopPct != null
            ? resolvePrescribedLoad({ basis: 'pct1rm', pct: (tplTopPct * (r.loadPct ?? 0)) / 100, est1rmKg: est, equipment: info0.equipment, unit })
            : resolvePrescribedLoad({ basis: r.loadBasis, pct: r.loadPct, est1rmKg: est, topKg, equipment: info0.equipment, unit });
        if ('weightKg' in got && got.weightKg > 0) return { kg: got.weightKg / div, rx: true };
      }
      if (r.setType === 'warmup' || r.setType === 'feeder' || r.setType === 'drop') return { kg: 0, rx: false };
      return { kg: fallback?.weightKg ?? 0, rx: false };
    };
    // 「최대」 줄의 시작 횟수 — 바로 앞 작업 줄의 하한(피더 2회 같은 값을 물려받지 않게 · 데이터 11)
    const repsFor = (r: PrescribedSet, i: number): number => {
      if (r.repMin != null) return r.repMin;
      for (let j = i - 1; j >= 0; j--) if (left[j].repMin != null && !left[j].amrap) return left[j].repMin as number;
      return fallback?.reps ?? 8;
    };
    const ops = [
      ...pending.map((x) => x.prepareMarkAsDeleted()),
      // 번호가 바뀐 세트만 쓴다(데이터 12)
      ...doneSets.flatMap((x, i) => (x.setNumber === i + 1 ? [] : [x.prepareUpdate((rec) => { rec.setNumber = i + 1; })])),
      ...left.map((r, i) => {
        const w = weightFor(r);
        return setLogs().prepareCreate((n) => {
          n.workoutExerciseId = weId;
          n.setNumber = doneSets.length + i + 1;
          n.weightKg = w.kg;
          n.reps = repsFor(r, i);
          n.rpe = null;
          n.isWarmup = r.setType === 'warmup' || r.setType === 'feeder';
          n.isDrop = r.setType === 'drop';
          n.isFailed = false;
          n.setType = r.setType === 'normal' || r.setType === 'drop' ? null : r.setType;
          n.targetRir = null;
          n.arm = fallback?.arm ?? null;
          n.grip = fallback?.grip ?? null;
          n.loadMultiplier = m;
          n.userEdited = false;
          n.valueSource = encodeValueSource(w.rx ? 'rx' : 'copied_default', r.repMin != null ? 'rx' : 'copied_default');
          n.done = false;
          n.completedAt = null;
        });
      }),
      we.prepareUpdate((rec) => { rec.prescription = nextRx; }),
    ];
    await database.batch(...ops);
    return 'done' as const;
  });
}

// 운동 도중 슈퍼셋 묶기/해제 (SRS-004) — 세션 내 종목들을 같은 supersetGroup으로. 루틴과 독립.
export async function groupWorkoutExercisesAsSuperset(ids: string[]): Promise<string> {
  const group = randomId('ss_');
  await database.write(async () => {
    const recs = await Promise.all(ids.map((id) => workoutExercises().find(id)));
    await database.batch(...recs.map((we) => we.prepareUpdate((rec) => { rec.supersetGroup = group; })));
  });
  scheduleSync();
  return group;
}
export async function ungroupWorkoutExercisesSuperset(ids: string[]): Promise<void> {
  await database.write(async () => {
    const recs = await Promise.all(ids.map((id) => workoutExercises().find(id)));
    await database.batch(...recs.map((we) => we.prepareUpdate((rec) => { rec.supersetGroup = null; })));
  });
  scheduleSync();
}

// 세트별 편측(원암/원레그 ↔ 투암/투레그) 설정 — 같은 종목·세트라도 세트마다 다를 수 있어 세트 단위로 저장. @plm SRS-028
export async function setSetArm(id: string, arm: 'uni' | null): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      rec.arm = arm;
    });
  });
}

// 세트별 그립(over/under/neutral/wide/close ↔ 기본) — 팔처럼 세트마다 그립을 바꿀 수 있어 세트 단위 저장. @plm SRS-028
export async function setSetGrip(id: string, grip: string | null): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      rec.grip = grip;
    });
  });
}

// 종목의 고유 기구(카탈로그 기본 기구) — 변형 정규화 기준. 조회 실패는 null(정규화 생략). @plm SRS-028
async function baseEquipmentOf(exerciseId: string): Promise<string | null> {
  try {
    const e = await getExercise(exerciseId);
    return e.equipment ?? null;
  } catch {
    return null;
  }
}

// 세션 중 종목의 변형(기구·그립) 변경 — 이전기록·PR이 해당 변형 것으로 갱신된다. @plm SRS-028
// 고유 기구 선택은 기본 버킷(null)으로 정규화 — UI뿐 아니라 데이터 계층에서 보장(버킷 분열 방지).
export async function setVariant(workoutExerciseId: string, dims: VariantDims): Promise<void> {
  const target = await workoutExercises().find(workoutExerciseId);
  // [원본] const cols = variantColumns(normalizeVariantDims(dims, await baseEquipmentOf(target.exerciseId)));
  // [개선] ADR-034(P2): 허용 목록 밖 축·기구 값 제거 — 기구 바꾸기는 종목 바꾸기다(swapWorkoutExercise)
  const { variantAxesFor } = await import('./catalogMeta');
  const cols = variantColumns(normalizeVariantDimsV34(dims, await variantAxesFor(target.exerciseId)));
  // /qa code M-1: 아직 입력 방식을 안 정한 후보 종목이면 칸 변경은 질문 답과 같다 — 핀이면 「양쪽 합·핀」을 기록하고,
  // 세트는 숫자 그대로 배수만(기본 ×2 를 「사람이 정한 한쪽」으로 보고 환산하면 핀 50 이 100 이 됐다) @plm SRS-084
  const before = await plateInputsFor([target.exerciseId]);
  const mode = plateChangeMode(before.choice.get(target.exerciseId), before.defaultLoad.get(target.exerciseId));
  await database.write(async () => {
    const we = await workoutExercises().find(workoutExerciseId);
    await we.update((rec) => {
      rec.variantKey = cols.variantKey;
      rec.variantEquipment = cols.variantEquipment;
      rec.variantGrip = cols.variantGrip;
      rec.variantArm = cols.variantArm;
      rec.variantLoad = cols.variantLoad; // v22 @plm SRS-058
      rec.variantAttach = cols.variantAttach;
      // [원본] rec.machineVariant = cols.variantEquipment; // 레거시 미러(기구 차원)
      // [개선] ADR-034: 미러는 비운다 — 키가 정본이고, 미러를 쓰면 기록 정규화가 매번 다시 지우며 동기를 흔든다(QA H9)
      rec.machineVariant = null;
    });
  });
  // [원본] await syncBlockLoadMultiplier(workoutExerciseId); // 적재 방식이 바뀌면 한쪽 입력 배수도 따라간다 @plm SRS-058
  if (mode === 'retag') {
    if (cols.variantLoad === 'pin') {
      const { setPlateOneSideChoice } = await import('./exercisePrefs');
      await setPlateOneSideChoice(target.exerciseId, false);
    }
    await retagBlockLoadMultiplier(workoutExerciseId);
  } else await syncBlockLoadMultiplier(workoutExerciseId);
}

// ── 플레이트 한쪽 입력(ADR-037) ───────────────────────────────────────
// 블록의 배수 = (적재 방식 plate) × (사용자 × 종목 「한쪽 무게로 입력」). 블록 안 세트는 모두 같은 배수다 —
// 화면의 숫자를 어떻게 적는지가 블록 단위로 정해지기 때문이다. 과거 세션 세트는 저장된 배수로 의미가 보존된다. @plm SRS-058
// [원본] V1 — 플레이트 칸 + 「한쪽」을 켰을 때만 2. 원복 시 아래 호출부의 V2 를 이것으로(이름이 같은 V1 import 도 되살린다).
// async function blockMultiplierOf(workoutExerciseId: string): Promise<number | null> {
//   const we = await workoutExercises().find(workoutExerciseId);
//   const { getPlateOneSide } = await import('./exercisePrefs');
//   return blockLoadMultiplier(dimsFromColumns(we), await getPlateOneSide(we.exerciseId));
// }

/**
 * 배수 판단 재료 — 종목별 입력 방식 선택(tri-state)과 플레이트 후보 여부(피드백 #63). 화면도 같은 규칙을 쓴다. @plm SRS-084
 */
async function plateInputsFor(
  exerciseIds: string[],
): Promise<{ choice: Map<string, boolean | null>; defaultLoad: Map<string, 'plate' | 'pin' | null> }> {
  const [{ getPlateOneSideChoiceMap }, { plateDefaultLoadMap }] = await Promise.all([
    import('./exercisePrefs'),
    import('./catalogMeta'),
  ]);
  const [choice, defaultLoad] = await Promise.all([getPlateOneSideChoiceMap(exerciseIds), plateDefaultLoadMap(exerciseIds)]);
  return { choice, defaultLoad };
}

/** 블록 배수(V2) — 플레이트 후보 머신은 기본이 한쪽(×2) · 핀 칸 1 · 「양쪽 합」으로 정했으면 명시 1. @plm SRS-084 */
async function blockMultiplierOfV2(workoutExerciseId: string): Promise<number | null> {
  const we = await workoutExercises().find(workoutExerciseId);
  const plate = await plateInputsFor([we.exerciseId]);
  return blockLoadMultiplierV2(dimsFromColumns(we), plate.choice.get(we.exerciseId), plate.defaultLoad.get(we.exerciseId));
}

/** 블록 세트의 배수를 블록 규칙에 맞춘다(다른 것만 쓴다). */
export async function syncBlockLoadMultiplier(workoutExerciseId: string): Promise<void> {
  // [원본] 배수를 writer 밖에서 먼저 정했다 — 먼저 시작한 호출이 옛 선호(배수 1)로 나중에 써서 되돌릴 수 있었다
  // let m: number | null; try { m = await blockMultiplierOf(workoutExerciseId); } catch { return; }
  // [원본] 쓰기 밖에서 읽고 계획했다 — 두 호출(칸 바꾸기 + 한쪽 입력 켜기)이 겹치면 둘 다 옛 배수(1)를 읽고 둘 다 절반으로
  // 환산해 40kg 이 10kg 이 됐다(2026-10-27 블록 단위 작업 중 e2e 로 드러남 · 쓰기 사이 지연이 늘며 겹침이 잦아졌다).
  // const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
  // const plan = planBlockMultiplierResync(sets, m); … await database.write(async () => { … });
  // [개선] 읽기·계획·쓰기를 **한 writer 안에서** — writer 는 줄을 서므로 뒤 호출은 앞 호출이 바꾼 배수를 보고 할 일이 없다.
  // (/qa code M-1: 안 한 세트만 옮기고, 적힌 무게는 계산 무게가 같도록 환산 — 한 세트는 그 배수로 적은 그대로) @plm SRS-058
  await database.write(async () => {
    let m: number | null;
    try {
      // [원본] m = await blockMultiplierOf(workoutExerciseId); // 줄을 선 뒤의 최신 선호·칸으로
      m = await blockMultiplierOfV2(workoutExerciseId); // 줄을 선 뒤의 최신 선택·칸으로(피드백 #63) @plm SRS-084
    } catch {
      return; // 블록이 지워졌다
    }
    const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
    // [원본] const plan = planBlockMultiplierResync(sets, m);
    // [개선] 사람이 적은 숫자는 환산하지 않는다 — 켜고 곧바로 적은 40 을 늦게 도착한 환산이 10 으로 덮던 것(/qa code H-3 원칙) @plm SRS-067
    // [원본] const plan = planBlockMultiplierResync(…) — 옛 null 세트를 양쪽으로 보고 절반 환산했다
    // [개선] V2 — 옛 null 세트는 숫자 그대로 배수만(피드백 #63) @plm SRS-084
    const plan = planBlockMultiplierResyncV2(
      sets.map((x) => ({ id: x.id, done: x.done, weightKg: x.weightKg, loadMultiplier: x.loadMultiplier, touched: touchedByUser(x) })),
      m,
    );
    if (!plan.length) return;
    const byId = new Map(sets.map((x) => [x.id, x]));
    await database.batch(
      ...plan.map((u) =>
        (byId.get(u.id) as SetLog).prepareUpdate((rec) => {
          rec.loadMultiplier = u.loadMultiplier;
          rec.weightKg = u.weightKg;
        }),
      ),
    );
  });
}

/** 「한쪽 무게로 입력」을 켜고 끈다 — 선호를 쓰고, 진행 중인 운동의 그 종목 블록 세트 배수를 맞춘다. */
export async function setPlateOneSideForExercise(exerciseId: string, on: boolean): Promise<void> {
  const { setPlateOneSide } = await import('./exercisePrefs');
  await setPlateOneSide(exerciseId, on);
  const active = await getActiveWorkout();
  if (!active) return;
  const wes = await workoutExercises()
    .query(Q.where('workout_id', active.id), Q.where('exercise_id', exerciseId))
    .fetch();
  for (const we of wes) await syncBlockLoadMultiplier(we.id);
}

/**
 * 「한쪽 무게로 입력」 토글(V2 · 칸 시트) — 「양쪽 합(끔)」도 선택으로 기억하고(행이 없어도), 진행 중인 운동의 그 종목
 * 블록을 V2 규칙으로 맞춘다(안 한 세트만 · 한 세트 보존). 옛 setPlateOneSideForExercise 는 원복용으로 둔다. @plm SRS-084
 */
export async function setPlateOneSideForExerciseV2(exerciseId: string, on: boolean): Promise<void> {
  // /qa code M-1: 아직 안 정한 종목에서 토글을 바꾸면 질문 답과 같다(숫자 그대로 배수만) @plm SRS-084
  const before = await plateInputsFor([exerciseId]);
  if (plateChangeMode(before.choice.get(exerciseId), before.defaultLoad.get(exerciseId)) === 'retag') {
    await answerPlateOneSide(exerciseId, on);
    return;
  }
  const { setPlateOneSideChoice } = await import('./exercisePrefs');
  await setPlateOneSideChoice(exerciseId, on);
  const active = await getActiveWorkout();
  if (!active) return;
  const wes = await workoutExercises()
    .query(Q.where('workout_id', active.id), Q.where('exercise_id', exerciseId))
    .fetch();
  for (const we of wes) await syncBlockLoadMultiplier(we.id);
}

/**
 * 「원판 한쪽 무게로 적나요?」 답(피드백 #63) — 선택을 기억하고, 진행 중인 운동의 그 종목 블록 세트 **전부의 배수만**
 * 새 규칙으로 바꾼다(숫자 그대로 · 한 세트 포함 · /qa spec M-2). 답은 적은 숫자의 뜻을 밝힌 것이기 때문이다. @plm SRS-084
 */
export async function answerPlateOneSide(exerciseId: string, on: boolean): Promise<void> {
  const { setPlateOneSideChoice } = await import('./exercisePrefs');
  await setPlateOneSideChoice(exerciseId, on);
  const active = await getActiveWorkout();
  if (!active) return;
  const wes = await workoutExercises()
    .query(Q.where('workout_id', active.id), Q.where('exercise_id', exerciseId))
    .fetch();
  for (const we of wes) await retagBlockLoadMultiplier(we.id);
}

/** 블록 세트 전부(한 세트 포함)의 배수만 지금 규칙으로 — 숫자 그대로(질문 답 · 미정 상태의 칸·토글 변경 · /qa code M-1). @plm SRS-084 */
async function retagBlockLoadMultiplier(workoutExerciseId: string): Promise<void> {
  await database.write(async () => {
    let m: number | null;
    try {
      m = await blockMultiplierOfV2(workoutExerciseId);
    } catch {
      return;
    }
    const sets = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
    const plan = planBlockMultiplierRetag(
      sets.map((x) => ({ id: x.id, done: x.done, weightKg: x.weightKg, loadMultiplier: x.loadMultiplier })),
      m,
    );
    if (!plan.length) return;
    const byId = new Map(sets.map((x) => [x.id, x]));
    await database.batch(
      ...plan.map((u) =>
        (byId.get(u.id) as SetLog).prepareUpdate((rec) => {
          rec.loadMultiplier = u.loadMultiplier;
        }),
      ),
    );
  });
}

/**
 * 운동 완료 뒤 — 질문에 답하지 않은 플레이트 후보 종목(완료 세트가 있는 블록)은 기본(한쪽)을 답으로 기억한다.
 * 그래야 「한 번만」 묻는다(피드백 #63 · Q4). 실패해도 완료에는 영향이 없다. @plm SRS-084
 */
export async function settleUndecidedPlateOneSide(workoutId: string): Promise<string[]> {
  const wes = await workoutExercises().query(Q.where('workout_id', workoutId)).fetch();
  if (!wes.length) return [];
  const plate = await plateInputsFor(wes.map((we) => we.exerciseId));
  const settle: string[] = [];
  for (const we of wes) {
    if (settle.includes(we.exerciseId)) continue;
    if (!needsPlateOneSideQuestion(dimsFromColumns(we), plate.choice.get(we.exerciseId), plate.defaultLoad.get(we.exerciseId))) continue;
    const doneCount = await setLogs()
      .query(Q.where('workout_exercise_id', we.id), Q.where('done', true))
      .fetchCount();
    if (doneCount > 0) settle.push(we.exerciseId);
  }
  if (!settle.length) return [];
  const { setPlateOneSideChoice } = await import('./exercisePrefs');
  for (const id of settle) await setPlateOneSideChoice(id, true);
  return settle;
}

// ── 다른 조합 기록 보기(ADR-034) ─────────────────────────────────────
/** 이 종목의 수행 이력을 칸(조합)별로 — 최근 수행 칸이 먼저. 「다른 조합 기록 보기」 시트가 쓴다. @plm SRS-058 */
export async function getExerciseSlotSummaries(exerciseId: string): Promise<SlotSummary[]> {
  const instances = await performedInstancesOf(exerciseId);
  if (!instances.length) return [];
  const sets = await setLogs()
    .query(Q.where('workout_exercise_id', Q.oneOf(instances.map((i) => i.we.id))), Q.sortBy('set_number', Q.asc))
    .fetch();
  const byWe = new Map<string, SetLog[]>();
  for (const x of sets) {
    if (!isPerformed(x)) continue;
    const list = byWe.get(x.workoutExerciseId);
    if (list) list.push(x);
    else byWe.set(x.workoutExerciseId, [x]);
  }
  return summarizeSlots(
    instances.map(({ we, completedAt }) => ({
      variantKey: effectiveVariantKey(we),
      completedAt,
      weightUnit: we.weightUnit ?? null, // /qa code M-2 @plm SRS-067
      sets: (byWe.get(we.id) ?? []).map((x) => toLoggedSet(x)),
    })),
  );
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

// 이 종목(+변형)의 과거 메모·팁 타임라인 — 운동 중 '이전엔 뭐라 적었지' 확인용(최신순, 세션당 1개). @plm SRS-004
export interface ExerciseNoteEntry {
  completedAt: number;
  note: string;
}
export async function getExerciseNoteHistory(
  exerciseId: string,
  variantKey?: string | null,
  limit = 40,
): Promise<ExerciseNoteEntry[]> {
  const clauses = [Q.where('exercise_id', exerciseId)];
  if (variantKey !== undefined) clauses.push(Q.where('variant_key', variantKey));
  const wes = await workoutExercises().query(...clauses).fetch();
  const withNote = wes.filter((w) => w.note?.trim());
  if (!withNote.length) return [];
  const wIds = [...new Set(withNote.map((w) => w.workoutId))];
  const ws = await workouts().query(Q.where('id', Q.oneOf(wIds)), Q.where('state', 'completed')).fetch();
  const completedAtById = new Map(ws.map((w) => [w.id, w.completedAt ?? w.startedAt]));
  // 완료 세션당 1개(첫 비어있지 않은 메모), 최신순.
  const byWorkout = new Map<string, ExerciseNoteEntry>();
  for (const we of withNote) {
    const at = completedAtById.get(we.workoutId);
    if (at == null) continue; // 미완료(진행중·폐기) 세션 제외
    if (!byWorkout.has(we.workoutId)) byWorkout.set(we.workoutId, { completedAt: at, note: we.note!.trim() });
  }
  return [...byWorkout.values()].sort((a, b) => b.completedAt - a.completedAt).slice(0, limit);
}

export async function updateSetLog(
  id: string,
  patch: {
    weightKg?: number;
    reps?: number;
    rpe?: number | null;
    rir?: number | null; // v26: 실제 RIR(0~10, 0.5 단위 · null = 지우기). 사람이 고른 값이지만 무게·횟수가 아니라 user_edited 는 건드리지 않는다. @plm SRS-073
    isWarmup?: boolean;
    isFailed?: boolean;
    partialReps?: number | null; // v9: 부분반복(깔짝) — 볼륨/PR 제외 표시전용. @plm SRS-029
    durationSec?: number | null; // v10: 유산소 시간(초). @plm SRS-030
    distanceM?: number | null; // v10: 유산소 거리(미터). @plm SRS-030
    inclinePct?: number | null; // v13: 유산소 경사(%). @plm SRS-030
    level?: number | null; // v13: 유산소 단계. @plm SRS-030
    speedKmh?: number | null; // v15: 유산소 속도(km/h·러닝머신). @plm SRS-030
  },
): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      if (patch.weightKg !== undefined) rec.weightKg = patch.weightKg;
      if (patch.reps !== undefined) rec.reps = patch.reps;
      // v25: 사람이 무게·횟수를 적었다 — 이후 자동 환산·처방 채움이 이 숫자를 덮지 않는다(/qa code H-3) @plm SRS-067
      if (patch.weightKg !== undefined || patch.reps !== undefined) rec.userEdited = true;
      // v27: 사람이 값을 적었다 — 출처 user(유산소 시간·거리도 · SPEC-017 §8)
      // [개선] 칸별(REV-005 H-1) — 고친 칸만 user · 유산소 시간·거리는 두 칸 모두
      if (patch.weightKg !== undefined) rec.valueSource = withFieldSource(rec.valueSource, 'weight', 'user');
      if (patch.reps !== undefined) rec.valueSource = withFieldSource(rec.valueSource, 'reps', 'user');
      if (patch.durationSec !== undefined || patch.distanceM !== undefined) rec.valueSource = withFieldSource(rec.valueSource, 'both', 'user');
      if (patch.rpe !== undefined) rec.rpe = patch.rpe;
      if (patch.rir !== undefined) rec.rir = patch.rir; // v26 @plm SRS-073
      if (patch.isWarmup !== undefined) rec.isWarmup = patch.isWarmup;
      if (patch.isFailed !== undefined) rec.isFailed = patch.isFailed;
      if (patch.partialReps !== undefined) rec.partialReps = patch.partialReps;
      if (patch.durationSec !== undefined) rec.durationSec = patch.durationSec;
      if (patch.distanceM !== undefined) rec.distanceM = patch.distanceM;
      if (patch.inclinePct !== undefined) rec.inclinePct = patch.inclinePct;
      if (patch.level !== undefined) rec.level = patch.level;
      if (patch.speedKmh !== undefined) rec.speedKmh = patch.speedKmh;
    });
  });
}

// 세트 삭제 후 남은 세트 번호 재정렬.
export async function deleteSetLog(id: string): Promise<void> {
  await database.write(async () => {
    const target = await setLogs().find(id);
    const weId = target.workoutExerciseId;
    const before = await setLogs()
      .query(Q.where('workout_exercise_id', weId), Q.sortBy('set_number', Q.asc))
      .fetch();
    const at = before.findIndex((x) => x.id === id);
    await target.markAsDeleted();
    const remaining = await setLogs()
      .query(Q.where('workout_exercise_id', weId), Q.sortBy('set_number', Q.asc))
      .fetch();
    await database.batch(...remaining.map((s, i) => s.prepareUpdate((rec) => { rec.setNumber = i + 1; })));
    // 처방도 같은 자리를 뺀다 — 처방은 세트 번호 자리로 읽어서, 안 빼면 뒤 세트들이 한 칸씩 남의 처방을 읽는다(SPEC-041)
    const we = await workoutExercises().find(weId).catch(() => null);
    const rx = we?.prescription;
    if (we && Array.isArray(rx) && at >= 0 && at < rx.length) {
      await we.update((rec) => { rec.prescription = rx.filter((_, i) => i !== at); });
    }
  });
}

// ── 지난 운동의 세트를 고친 뒤(#51) ── @plm SRS-061
// 그 운동의 총 볼륨과, 그 종목이 들어 있는 **그 운동과 이후** 완료 운동들의 PR 수를 시간순으로 다시 센다.
// 이력은 「그 운동보다 먼저 끝난 운동」만 본다(QA Q2 — 기존 historicalSnapshotForExercise 는 이후 운동까지 섞는다).
// [원본] 운동마다 전체 이력을 다시 읽었다(O(이후 운동×종목×전체 운동) · /qa code M1). 원복 시 이름을 되돌린다.
export async function recomputeWorkoutTotalsV1(workoutId: string): Promise<void> {
  const target = await workouts().find(workoutId);
  const all = (await workouts().query(Q.where('state', 'completed')).fetch()).sort(
    (a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0),
  );
  const t0 = target.completedAt ?? 0;
  const later = all.filter((w) => (w.completedAt ?? 0) >= t0);
  const bw = await getUserBodyweightKg();
  // 이 운동에 든 종목만 영향을 받는다
  const targetWes = await workoutExercises().query(Q.where('workout_id', workoutId)).fetch();
  const touched = new Set(targetWes.map((x) => x.exerciseId));
  const updates: Workout[] = [];
  for (const w of later) {
    const wes = await workoutExercises().query(Q.where('workout_id', w.id)).fetch();
    let volume = 0;
    const groups = new Map<string, { exerciseId: string; variant: string | null; logged: LoggedSet[] }>();
    const modeAll = await loadModeByExerciseId(wes.map((x) => x.exerciseId));
    const cardioAll = await cardioExerciseIdSet(wes.map((x) => x.exerciseId));
    for (const we of wes) {
      const sets = (await setLogs().query(Q.where('workout_exercise_id', we.id)).fetch()).filter(isPerformed);
      const loadMode = modeAll.get(we.exerciseId) ?? null;
      const logged = sets.map((s) => toLoggedSet(s, loadMode, bw));
      volume += totalVolumeKg(logged);
      if (cardioAll.has(we.exerciseId)) continue;
      const vk = effectiveVariantKey(we);
      const key = `${we.exerciseId}::${vk ?? ''}`;
      const g = groups.get(key);
      if (g) g.logged.push(...logged);
      else groups.set(key, { exerciseId: we.exerciseId, variant: vk, logged: [...logged] });
    }
    const prGroups: { current: LoggedSet[]; historyBest: PRSnapshot }[] = [];
    for (const g of groups.values()) {
      prGroups.push({ current: g.logged, historyBest: await historicalSnapshotBefore(g.exerciseId, g.variant, w) });
    }
    const prCount = countMajorPrs(prGroups);
    const isTarget = w.id === workoutId;
    const affectsLater = [...groups.values()].some((g) => touched.has(g.exerciseId));
    if (!isTarget && !affectsLater) continue;
    if (Math.abs((w.totalVolumeKg ?? 0) - volume) > 1e-6 || w.prCount !== prCount) {
      updates.push(
        w.prepareUpdate((rec) => {
          rec.totalVolumeKg = volume;
          rec.prCount = prCount;
        }),
      );
    }
  }
  if (updates.length) await database.write(async () => { await database.batch(...updates); });
  scheduleSync();
}

// [개선] 완료 운동·종목·세트를 **한 번씩만** 읽고 시간순으로 한 번 훑는다(sweepPrCounts). 고친 종목이 없는 이후 운동은
// 손대지 않는다. 진행 중 세션의 PR 판정 캐시도 비운다 — 지운 120kg 이 남아 축하가 틀어지지 않게(M2). @plm SRS-061
export async function recomputeWorkoutTotals(workoutId: string): Promise<void> {
  const target = await workouts().find(workoutId);
  const all = await workouts().query(Q.where('state', 'completed')).fetch();
  const t0 = target.completedAt ?? 0;
  const bw = await getUserBodyweightKg();
  const wes = all.length ? await workoutExercises().query(Q.where('workout_id', Q.oneOf(all.map((w) => w.id)))).fetch() : [];
  const sets = wes.length
    ? (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()).filter(isPerformed)
    : [];
  const setsByWe = new Map<string, SetLog[]>();
  for (const s of sets) {
    const arr = setsByWe.get(s.workoutExerciseId);
    if (arr) arr.push(s);
    else setsByWe.set(s.workoutExerciseId, [s]);
  }
  const exIds = [...new Set(wes.map((x) => x.exerciseId))];
  const modeAll = await loadModeByExerciseId(exIds);
  const cardioAll = await cardioExerciseIdSet(exIds);
  const touched = new Set(wes.filter((x) => x.workoutId === workoutId).map((x) => x.exerciseId));
  const wesByWorkout = new Map<string, WorkoutExercise[]>();
  for (const we of wes) {
    const arr = wesByWorkout.get(we.workoutId);
    if (arr) arr.push(we);
    else wesByWorkout.set(we.workoutId, [we]);
  }
  const volumeOf = new Map<string, number>();
  const sweepIn: PrSweepWorkout[] = [];
  for (const w of all) {
    let volume = 0;
    const groups = new Map<string, LoggedSet[]>();
    for (const we of wesByWorkout.get(w.id) ?? []) {
      const loadMode = modeAll.get(we.exerciseId) ?? null;
      const logged = (setsByWe.get(we.id) ?? []).map((s) => toLoggedSet(s, loadMode, bw));
      volume += totalVolumeKg(logged);
      if (cardioAll.has(we.exerciseId)) continue;
      const key = `${we.exerciseId}::${effectiveVariantKey(we) ?? ''}`;
      const g = groups.get(key);
      if (g) g.push(...logged);
      else groups.set(key, [...logged]);
    }
    volumeOf.set(w.id, volume);
    sweepIn.push({
      id: w.id,
      completedAt: w.completedAt ?? 0,
      groups: [...groups.entries()].map(([key, logged]) => ({ key, current: snapshotFromSets(logged) })),
    });
  }
  const counts = sweepPrCounts(sweepIn);
  const updates: Workout[] = [];
  for (const w of all) {
    if ((w.completedAt ?? 0) < t0) continue;
    const isTarget = w.id === workoutId;
    const affects = (wesByWorkout.get(w.id) ?? []).some((x) => touched.has(x.exerciseId));
    if (!isTarget && !affects) continue;
    const volume = volumeOf.get(w.id) ?? 0;
    const prCount = counts.get(w.id) ?? 0;
    if (Math.abs((w.totalVolumeKg ?? 0) - volume) > 1e-6 || w.prCount !== prCount) {
      updates.push(
        w.prepareUpdate((rec) => {
          rec.totalVolumeKg = volume;
          rec.prCount = prCount;
        }),
      );
    }
  }
  if (updates.length) await database.write(async () => { await database.batch(...updates); });
  invalidateLivePrCache();
  scheduleSync();
}

/** 진행 중 세션의 PR 판정 캐시를 비운다 — 지난 기록을 고치거나 지운 뒤(/qa code M2). @plm SRS-061 */
export function invalidateLivePrCache(): void {
  liveHistCache.clear();
}

// 그 운동보다 **먼저 끝난** 완료 운동들의 같은 칸 최고치(QA Q2). 같은 시각이면 id 로 순서를 정한다.
async function historicalSnapshotBefore(exerciseId: string, variant: string | null, before: Workout): Promise<PRSnapshot> {
  const t = before.completedAt ?? 0;
  const prior = (await workouts().query(Q.where('state', 'completed')).fetch()).filter((w) => {
    const c = w.completedAt ?? 0;
    return w.id !== before.id && (c < t || (c === t && w.id < before.id));
  });
  if (!prior.length) return EMPTY_PR;
  const wes = await workoutExercises()
    .query(Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(prior.map((w) => w.id))), Q.where('variant_key', variant))
    .fetch();
  if (!wes.length) return EMPTY_PR;
  const sets = (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch()).filter(
    isPerformed,
  );
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  return snapshotFromSets(sets.map((s) => toLoggedSet(s, loadMode, bw)));
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
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  return snapshotFromSets(sets.map((s) => toLoggedSet(s, loadMode, bw)));
}

export interface WorkoutPRDetail {
  exerciseId: string;
  exerciseName: string;
  prs: PRResult[];
  /** 그 블록에 적은 단위(null=kg) — 요약의 중량 PR 줄이 이 단위로 보인다(Q2 A · /qa code M-2) @plm SRS-067 */
  weightUnit?: 'kg' | 'lb' | null;
  /** PR 버킷의 기록 칸 키(null=기본) — 요약이 (종목 × 칸) 줄에 PR 을 붙인다(화면 정리 P2 /qa code H-1) @plm SRS-070 */
  variantKey?: string | null;
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
  const performedByVariant = new Map<string, { exerciseId: string; variant: string | null; logged: LoggedSet[]; unit: 'kg' | 'lb' | null }>();
  const bw = await getUserBodyweightKg(); // v12: 어시스트/맨몸 유효무게 반영 @plm SRS-033
  const modeByEx = await loadModeByExerciseId(wes.map((w) => w.exerciseId));
  // 유산소는 무게/1RM PR 대상이 아니다(SRS-030 — 볼륨·PR·추정1RM 미기여). 러닝·걷기처럼
  // equipment='bodyweight'로 등재된 유산소는 유효무게가 '체중'으로 잡혀 체중이 그대로
  // maxWeight PR로 오탐되므로(체중 갱신 때마다 재발), PR 감지 대상에서 제외한다. @plm SRS-030
  const cardioIds = await cardioExerciseIdSet(wes.map((w) => w.exerciseId));
  /** 빠른 운동 자동 이름 재료 — 수행한 종목과 워킹 세트 수(화면 정리 F7) @plm SRS-071 */
  const autoNameInput: { exerciseId: string; workingSets: number }[] = [];

  for (const we of wes) {
    const all = await setLogs().query(Q.where('workout_exercise_id', we.id)).fetch();
    const performed = all.filter(isPerformed);
    for (const s of all) if (!isPerformed(s)) undone.push(s);
    if (performed.length === 0) {
      emptyWEs.push(we);
      continue;
    }
    const loadMode = modeByEx.get(we.exerciseId) ?? null;
    const logged = performed.map((s) => toLoggedSet(s, loadMode, bw));
    totalVolume += totalVolumeKg(logged);
    workingSets += logged.filter((s) => !s.isWarmup && !s.isFailed).length;
    autoNameInput.push({ exerciseId: we.exerciseId, workingSets: logged.filter((s) => !s.isWarmup && !s.isFailed).length });
    if (cardioIds.has(we.exerciseId)) continue; // 유산소는 PR 감지 제외(볼륨은 위에서 이미 합산 — reps=0이라 0)
    const vk = effectiveVariantKey(we); // v6: (종목×변형) 버킷 키
    const key = `${we.exerciseId}::${vk ?? ''}`;
    const entry = performedByVariant.get(key);
    if (entry) entry.logged.push(...logged);
    else performedByVariant.set(key, { exerciseId: we.exerciseId, variant: vk, logged: [...logged], unit: we.weightUnit ?? null });
  }

  // PR 감지는 (종목,기구)별 1회 — 같은 조합이 여러 인스턴스(수퍼셋·중복)여도 합쳐 비교해 이중계상 방지.
  for (const { exerciseId, variant, logged, unit } of performedByVariant.values()) {
    const current = snapshotFromSets(logged);
    const hist = await historicalSnapshotForExercise(exerciseId, id, variant);
    // [원본] 4종(중량·반복·세트볼륨·1RM) 검출 — 원복 시 아래를 해제하고 detectMajorPRs를 주석 처리
    // const prs = detectNewPRs(current, hist);
    // [개편] 종목별 중량·볼륨 2종만 PR로 인정(개수 부풀림 방지 — 2026-07 재개편)
    const prs = detectMajorPRs(current, hist);
    if (prs.length) {
      let name = '운동';
      try {
        // [원본] name = (await getExercise(exerciseId)).nameKo;
        // [개선] 표시 이름(ADR-033) — PR 축하·요약이 운동 화면과 같은 이름 @plm SRS-056
        const { getExerciseDisplayNameMap } = await import('./exerciseNames');
        name = (await getExerciseDisplayNameMap([exerciseId])).get(exerciseId) ?? (await getExercise(exerciseId)).nameKo;
      } catch {
        /* 종목이 삭제된 경우 기본명 유지 */
      }
      prDetails.push({ exerciseId, exerciseName: name, prs, weightUnit: unit, variantKey: variant });
    }
  }

  const now = Date.now();
  const durationSeconds = Math.max(
    0,
    Math.round((now - workout.startedAt - workout.accumulatedPauseMs) / 1000),
  );
  const prCount = prDetails.reduce((n, d) => n + d.prs.length, 0);

  // 빠른 운동이 기본 이름(「빠른 운동」)이면 부위·종목 수로 이름을 붙인다 — 사용자가 바꾼 이름·루틴 운동은 그대로(F7) @plm SRS-071
  let autoName: string | null = null;
  if (!workout.routineId && isDefaultWorkoutName(workout.name) && autoNameInput.length) {
    const muscles = new Map<string, MuscleGroup | null>();
    for (const { exerciseId } of autoNameInput) {
      if (muscles.has(exerciseId)) continue;
      try {
        muscles.set(exerciseId, (await getExercise(exerciseId)).primaryMuscles?.[0] ?? null);
      } catch {
        muscles.set(exerciseId, null); // 종목이 지워졌으면 부위 없이 센다
      }
    }
    autoName = autoWorkoutName(
      autoNameInput.map((b) => ({
        exerciseId: b.exerciseId,
        primaryMuscle: muscles.get(b.exerciseId) ?? null,
        workingSets: b.workingSets,
      })),
    );
  }

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
      if (autoName) rec.name = autoName;
    });
  });

  scheduleSync(); // 운동 완료 → 서버 백업·다른 기기 반영(디바운스·로그인 가드·비차단)
  const summary: WorkoutSummary = { workoutId: id, totalVolumeKg: totalVolume, durationSeconds, workingSets, prCount, prs: prDetails };
  lastCompletedSummary = summary; // 요약 화면이 종목별 PR 내역을 표시(휘발 — 재로드 시 prCount만)
  return summary;
}

// ── 라이브 PR 판정 (세트 완료 시 축하 이펙트용 — 휘발) @plm SRS-005 ──────
// 최종 PR '기록'은 completeWorkout(완료 저장)에서만 확정된다. 여기서는 아무것도 저장하지 않고
// "이 세트가 (과거 완료 운동 + 이번 세션의 앞선 세트) 최고치를 넘는가"만 답한다.
// 운동을 도중 폐기하면 축하는 이미 지나갔어도 기록엔 아무 흔적이 없다(사용자 요구).
let lastCompletedSummary: WorkoutSummary | null = null;

// 완료 직후 요약 화면용 종목별 PR 내역(메모리 캐시). 재로드 등으로 없으면 null → prCount만 표시.
export function getLastWorkoutSummary(workoutId: string): WorkoutSummary | null {
  return lastCompletedSummary?.workoutId === workoutId ? lastCompletedSummary : null;
}

const liveHistCache = new Map<string, PRSnapshot>(); // `${workoutId}::${ex}::${variant}` → 과거 최고(완료 운동만)
const liveCelebrated = new Set<string>(); // `${setId}:${type}` — 체크 해제→재체크 중복 축하 방지(휘발)

export async function evalLiveSetPr(
  workoutExerciseId: string,
  setId: string,
  uiWeightKg?: number,
  uiReps?: number,
): Promise<PRResult[]> {
  const we = await workoutExercises().find(workoutExerciseId);
  const exerciseId = we.exerciseId;
  if ((await cardioExerciseIdSet([exerciseId])).size > 0) return []; // 유산소 제외 @plm SRS-030
  const set = await setLogs().find(setId);
  if (set.isWarmup || set.isFailed) return []; // PR은 작업 세트만(스냅샷 규칙과 동일)
  const bw = await getUserBodyweightKg();
  const loadMode = (await loadModeByExerciseId([exerciseId])).get(exerciseId) ?? null;
  // 방금 완료된 세트 — 무게/반복은 UI 입력값 우선(블러 커밋 경합 대비. 처방 제안 로직과 같은 이유).
  const logged = toLoggedSet(set, loadMode, bw);
  if (uiWeightKg != null && uiWeightKg > 0) logged.weightKg = uiWeightKg;
  if (uiReps != null && uiReps >= 0) logged.reps = uiReps;
  const thisSet = snapshotFromSets([logged]);
  if (thisSet.maxVolumeSetKg <= 0 && thisSet.maxWeightKg <= 0) return [];

  const variant = effectiveVariantKey(we);
  const cacheKey = `${we.workoutId}::${exerciseId}::${variant ?? ''}`;
  let hist = liveHistCache.get(cacheKey);
  if (!hist) {
    hist = await historicalSnapshotForExercise(exerciseId, we.workoutId, variant);
    liveHistCache.set(cacheKey, hist);
  }
  // 이번 세션에서 앞서 수행한 같은 (종목×기구) 세트들 — 수퍼셋 중복 인스턴스 포함, 자기 자신 제외.
  const siblingWes = (
    await workoutExercises().query(Q.where('workout_id', we.workoutId), Q.where('exercise_id', exerciseId)).fetch()
  ).filter((x) => effectiveVariantKey(x) === variant);
  const priorSets = siblingWes.length
    ? (await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(siblingWes.map((x) => x.id)))).fetch()).filter(
        (s) => s.id !== setId && isPerformed(s),
      )
    : [];
  const sessionPrior = snapshotFromSets(priorSets.map((s) => toLoggedSet(s, loadMode, bw)));

  const prs = detectMajorPRs(thisSet, mergeSnapshots(hist, sessionPrior));
  // 같은 세트가 체크 해제→재체크로 같은 타입을 다시 넘겨도 축하는 1회만.
  return prs.filter((p) => {
    const k = `${setId}:${p.type}`;
    if (liveCelebrated.has(k)) return false;
    liveCelebrated.add(k);
    return true;
  });
}
