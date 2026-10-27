// @plm SRS-081 SRS-082  다른 앱 기록 가져오기 — 묶음 쓰기 · 되돌리기 · 부팅 정리 · 가져오기 전 조건(ADR-042·043 개정).
//
// ── 쓰기 전략(ADR-043 개정 · D-11) ──────────────────────────────────────────
// 웹 어댑터는 LokiJS 이고 메인 스레드에서 동기적으로 돌며 트랜잭션이 없다(batch 실패 시 드라이버가 망가짐 상태). 그래서
//   ① import_batches 행을 status='writing' 으로 먼저 만들고(커스텀 종목·별칭도 같은 write)
//   ② 운동 단위 묶음(≤2000행)씩 write + 사이 양보(setTimeout 0)
//   ③ 마지막에 status='done'.
// 탭이 닫히거나 예외가 나면 status='writing' 이 남는다 → 부팅 정리(cleanupUnfinishedImports)가 그 행들을 지우고 묶음도 지운다.
// 쓰는 동안 동기는 멈춘다(pauseSync) — 반쯤 쓴 묶음이 서버로 가지 않게. 그래서 부팅 정리가 지우는 created 행은 서버에 없다.
//
// ── 원격 우선(ADR-042 개정 · D-4) ───────────────────────────────────────────
// 가져온 운동·종목 줄·세트에는 markLocalWins 를 쓰지 않는다(내용이 같아 무해하고, 다른 기기의 사람 수정이 보존된다).
// 사람이 고른 값만 지킨다: import_aliases.exercise_id · 사람이 이름을 붙인 커스텀 종목의 name_ko.
//
// ── 이미 있는 id(D-2·D-3) ───────────────────────────────────────────────────
// 각 write 안에서 다시 본다 — 보이는 행 + 로컬 삭제 표시(adapter.getDeletedRecords). 걸리는 운동은 통째로 건너뛴다.
// Loki 는 삭제 표시가 남은 id 로 다시 만들면 드라이버가 망가진다. 삭제 표시는 동기로 올라간 뒤 사라지니 「동기 후 다시」다.
//
// 원본 파일 내용은 여기 오지 않는다(계획은 칸 값뿐) — 오류에도 싣지 않는다.
import { Q } from '@nozbe/watermelondb';
import type { Collection, Model } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise, ImportAlias, ImportBatch, RoutineExercise, SetLog, Workout, WorkoutExercise } from '../db/models';
import type { LoadMode } from '../domain/types';
import type { SearchableExercise } from '../domain/exerciseSearch';
import { resolveBodyweightKg } from '../domain/bodyweight';
import { chunkPlannedWorkouts, plannedIds, type ImportPlan, type SkippedWorkout } from '../domain/import/plan';
import { markLocalWins } from '../sync/localWins';
import { isSyncLoggedIn, pauseSync, scheduleSync, syncWithServer } from '../sync/syncEngine';
import { prepareCustomExercise } from './exerciseRepository';
import { getOrCreateLocalUser } from './userRepository';

const batches = () => database.get<ImportBatch>('import_batches');
const aliasesCol = () => database.get<ImportAlias>('import_aliases');
const exercisesCol = () => database.get<Exercise>('exercises');
const workoutsCol = () => database.get<Workout>('workouts');
const weCol = () => database.get<WorkoutExercise>('workout_exercises');
const setsCol = () => database.get<SetLog>('set_logs');
const routineExCol = () => database.get<RoutineExercise>('routine_exercises');

/** 한 write 에 넣는 최대 행 수(쓰기·지우기 공통 · ADR-043 개정) */
export const IMPORT_WRITE_MAX_ROWS = 2000;

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

type RawStatus = { _status?: string };
const rawStatus = (m: Model): string | undefined => (m._raw as unknown as RawStatus)._status;

// ── 오류 ───────────────────────────────────────────────────────────────────
export type ImportBlockReason =
  /** 진행 중인 운동이 있다(U-19) */
  | 'active_workout'
  /** 오프라인인데 이 계정에 되돌린 묶음이 있다 — 「온라인에서 다시 시도」(D-2) */
  | 'offline_with_undone'
  /** 다른 가져오기·되돌리기가 진행 중이다 */
  | 'import_in_progress'
  /** 가져오기 직전 동기가 실패했다(로그인 상태 · D-2) */
  | 'sync_failed'
  /** 쓰다가 실패했고 정리도 못 했다 — 새로고침하면 부팅 정리가 지운다(그때까지 동기는 멈춘 채) */
  | 'write_failed_reload'
  /** 쓰다가 실패했지만 이번 묶음은 정리했다 */
  | 'write_failed';

export class ImportBlockedError extends Error {
  constructor(public readonly reason: ImportBlockReason) {
    super(`가져오기 막힘: ${reason}`);
    this.name = 'ImportBlockedError';
  }
}

// ── 가져오기 전 조건(화면이 파일 고르기 전에도 부른다) ─────────────────────────
export interface ImportReadiness {
  ok: boolean;
  reason: Exclude<ImportBlockReason, 'sync_failed' | 'write_failed' | 'write_failed_reload'> | null;
  /** 로그인 + 온라인 → 가져오기 직전에 동기 한 번(importPlan 이 스스로 한다) */
  needsSync: boolean;
  loggedIn: boolean;
}

let busy = false;

/** 진행 중인 운동이 있나(active·paused) — workoutRepository.getActiveWorkout 과 같은 조건 */
async function hasActiveWorkout(): Promise<boolean> {
  const n = await workoutsCol().query(Q.where('state', Q.oneOf(['active', 'paused']))).fetchCount();
  return n > 0;
}

/** 되돌린 묶음이 있나 */
export async function hasUndoneImportBatch(): Promise<boolean> {
  return (await batches().query(Q.where('status', 'undone')).fetchCount()) > 0;
}

/**
 * 가져오기를 시작해도 되나. `online` 은 화면이 navigator.onLine 으로 준다.
 * 순서: 진행 중 작업 → 진행 중 운동 → (로그인 ∧ 오프라인 ∧ 되돌린 묶음) → 통과(로그인 ∧ 온라인이면 동기 필요).
 */
export async function checkImportReadiness(opts: { online: boolean }): Promise<ImportReadiness> {
  return evaluateReadiness(opts.online, false);
}

/** selfBusy=이 호출이 busy 를 켰다(importPlan 안) — busy 자체로는 막지 않는다 */
async function evaluateReadiness(online: boolean, selfBusy: boolean): Promise<ImportReadiness> {
  const loggedIn = await isSyncLoggedIn();
  const base = { needsSync: loggedIn && online, loggedIn };
  if ((busy && !selfBusy) || (await batches().query(Q.where('status', 'writing')).fetchCount()) > 0)
    return { ok: false, reason: 'import_in_progress', ...base };
  if (await hasActiveWorkout()) return { ok: false, reason: 'active_workout', ...base };
  if (loggedIn && !online && (await hasUndoneImportBatch())) return { ok: false, reason: 'offline_with_undone', ...base };
  return { ok: true, reason: null, ...base };
}

// ── 계획 재료(화면 → Worker) ────────────────────────────────────────────────
/** 계획·맞추기에 필요한 것 — 직렬화 가능(Worker 로 보낸다) */
export interface ImportContext {
  /** 검색 색인 재료(buildExerciseSearchIndex) */
  exercises: SearchableExercise[];
  /** 종목 id → 기구·하중 모드(볼륨) */
  exerciseInfo: Record<string, { equipment: string; loadMode: LoadMode | null }>;
  /** 케이블 종목 id → 부착물 허용 목록(family 메타) */
  attachments: Record<string, string[]>;
  /** 별칭 id → 종목 id(가리키는 종목이 있는 것만 · D-9) */
  aliases: Record<string, string>;
  /** 가져올 때의 체중(resolveBodyweightKg) */
  bodyweightKg: number | null;
  /** 쓸 수 없는 운동 id — 이미 가져온 운동 + 로컬 삭제 표시(요약 표시용 · 쓰기 안에서 다시 본다) */
  takenWorkoutIds: string[];
}

export async function loadImportContext(): Promise<ImportContext> {
  const [exs, aliasRows, imported, deletedWorkouts] = await Promise.all([
    exercisesCol().query().fetch(),
    aliasesCol().query().fetch(),
    workoutsCol().query(Q.where('import_batch_id', Q.notEq(null))).fetchIds(),
    database.adapter.getDeletedRecords('workouts'),
  ]);
  const exercises: SearchableExercise[] = [];
  const exerciseInfo: ImportContext['exerciseInfo'] = {};
  const attachments: ImportContext['attachments'] = {};
  const { getFamilyMeta } = await import('./catalogMeta');
  for (const e of exs) {
    exercises.push({
      id: e.id,
      nameKo: e.nameKo,
      nameEn: e.nameEn,
      aliases: e.aliases ?? [],
      family: e.family,
      equipment: e.equipment,
      similar: e.similar ?? [],
      isArchived: e.isArchived,
    });
    exerciseInfo[e.id] = { equipment: e.equipment, loadMode: e.loadMode ?? null };
    if (e.equipment === 'cable' && e.family) {
      const meta = await getFamilyMeta(e.family);
      if (meta?.attachments?.length) attachments[e.id] = [...meta.attachments];
    }
  }
  const live = new Set(exs.map((e) => e.id));
  const aliases: Record<string, string> = {};
  for (const a of aliasRows) if (a.exerciseId && live.has(a.exerciseId)) aliases[a.id] = a.exerciseId;

  const { listBodyweightLogs, toBodyweightLogLike } = await import('./bodyweightRepository');
  const profile = await database.get('user_profiles').query(Q.sortBy('created_at', Q.asc), Q.take(1)).fetch();
  const logs = (await listBodyweightLogs()).map(toBodyweightLogLike);
  const bodyweightKg = resolveBodyweightKg(
    (profile[0] as unknown as { bodyweightKg: number | null } | undefined) ?? null,
    logs,
  );
  return {
    exercises,
    exerciseInfo,
    attachments,
    aliases,
    bodyweightKg,
    takenWorkoutIds: [...new Set([...imported, ...deletedWorkouts.filter((id) => id.startsWith('imp-'))])],
  };
}

// ── 묶음 쓰기 ───────────────────────────────────────────────────────────────
export interface ImportProgress {
  phase: 'sync' | 'writing' | 'finishing';
  /** 끝낸 쓰기 묶음 / 전체 */
  chunk: number;
  chunks: number;
  workoutsDone: number;
  workoutsTotal: number;
}

export interface ImportRunOptions {
  /** navigator.onLine(기본 true) */
  online?: boolean;
  /** 끝나면 디스크로 내려쓴다(웹: lib/localDb.flushLocalDb) — 동기 재개 전에 기다린다 */
  flush?: () => Promise<void>;
  /** 시험 전용 — n번째(1부터) 쓰기 묶음의 batch 뒤에 예외(e2e 「n번째 묶음 실패 → 부팅 정리」) */
  faultInjection?: { throwAfterChunk?: number };
}

export interface ImportResult {
  /** 쓴 것이 하나도 없으면 null(묶음 행도 남기지 않는다) */
  batchId: string | null;
  workouts: number;
  workoutExercises: number;
  sets: number;
  customExercisesCreated: number;
  aliasesWritten: number;
  /** 계획에서 이미 건너뛴 것 + 쓰기 안에서 걸린 것 */
  skipped: SkippedWorkout[];
}

/**
 * 계획을 쓴다. 가져오기 전 조건 확인 → (로그인 ∧ 온라인) 동기 한 번 → 프로필 확보(write 밖) → 동기 멈춤 → 묶음 쓰기 →
 * flush → 동기 재개. 진행 중 운동이 있으면 시작하지 않는다.
 * @throws ImportBlockedError
 */
export async function importPlan(
  plan: ImportPlan,
  onProgress?: (p: ImportProgress) => void,
  opts: ImportRunOptions = {},
): Promise<ImportResult> {
  if (busy) throw new ImportBlockedError('import_in_progress');
  busy = true;
  try {
    const ready = await evaluateReadiness(opts.online ?? true, true);
    if (!ready.ok) throw new ImportBlockedError(ready.reason ?? 'import_in_progress');
    if (ready.needsSync) {
      onProgress?.({ phase: 'sync', chunk: 0, chunks: 0, workoutsDone: 0, workoutsTotal: plan.workouts.length });
      try {
        await syncWithServer(); // 예전 되돌리기의 삭제 표시를 먼저 받는다(D-2)
      } catch {
        throw new ImportBlockedError('sync_failed');
      }
    }
    // 프로필은 write 밖에서 먼저 확보한다 — 없으면 getOrCreateLocalUser 가 write 를 연다(교착 방지 · D-8).
    await getOrCreateLocalUser();

    const release = await pauseSync();
    let keepPaused = false;
    try {
      // 동기를 멈춘 뒤에 다시 본다 — 그사이 다른 기기의 진행 중 운동이 오지는 않지만(동기는 완료 운동만 받는다) 이 기기에서 시작했을 수 있다.
      if (await hasActiveWorkout()) throw new ImportBlockedError('active_workout');
      try {
        return await writePlan(plan, onProgress, opts);
      } catch (e) {
        if (e instanceof ImportBlockedError) throw e;
        // 이번 묶음을 바로 정리해 본다. 정리도 실패하면(드라이버 망가짐 등) 동기를 멈춘 채 둔다 — 반쯤 쓴 행이 올라가지 않게.
        try {
          await removeBatch(plan.batch.id, 'cleanup', false);
        } catch {
          keepPaused = true;
          throw new ImportBlockedError('write_failed_reload');
        }
        throw new ImportBlockedError('write_failed');
      }
    } finally {
      if (!keepPaused) {
        try {
          await opts.flush?.();
        } catch {
          // 내려쓰기 실패는 다음 자동 저장이 다시 한다 — 동기 재개는 막지 않는다.
        }
        release();
        scheduleSync(0);
      }
    }
  } finally {
    busy = false;
  }
}

async function existingIdsIn(col: Collection<Model>, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  return col.query(Q.where('id', Q.oneOf(ids))).fetchIds();
}

async function writePlan(plan: ImportPlan, onProgress: ((p: ImportProgress) => void) | undefined, opts: ImportRunOptions) {
  const b = plan.batch;
  const now = Date.now();
  const unavailableCustom = new Set<string>();
  let customCreated = 0;
  let aliasesWritten = 0;

  // ① 묶음 행(writing) + 커스텀 종목 + 별칭
  await database.write(async () => {
    if ((await existingIdsIn(batches() as unknown as Collection<Model>, [b.id])).length) throw new Error('같은 묶음 id 가 이미 있다');
    const ops: Model[] = [
      batches().prepareCreateFromDirtyRaw({
        id: b.id,
        source: b.source,
        file_label: b.fileLabel,
        workout_count: 0,
        set_count: 0,
        status: 'writing',
        undone_at: null,
        weight_unit: b.weightUnit,
        tz_offset_min: b.tzOffsetMin,
        created_at: now,
        updated_at: now,
      }),
    ];
    const cxIds = plan.customExercises.map((c) => c.id);
    const deletedEx = new Set(await database.adapter.getDeletedRecords('exercises'));
    const haveEx = new Set(await existingIdsIn(exercisesCol() as unknown as Collection<Model>, cxIds));
    for (const c of plan.customExercises) {
      if (haveEx.has(c.id)) continue; // 다른 묶음이 만든 같은 종목 — 다시 쓴다(import_batch_id 는 처음 묶음 그대로 · D-9)
      if (deletedEx.has(c.id)) {
        unavailableCustom.add(c.id); // 지운 표시가 남았다 — 동기 뒤 다시
        continue;
      }
      const e = prepareCustomExercise(
        { nameKo: c.nameKo, nameEn: c.nameEn, primaryMuscles: c.primaryMuscles, equipment: c.equipment },
        { id: c.id, importBatchId: b.id },
      );
      if (c.nameEn != null) markLocalWins(e._raw as unknown as { _changed?: string }, ['name_ko']); // 사람이 붙인 이름
      ops.push(e);
      customCreated++;
    }
    const deletedAl = new Set(await database.adapter.getDeletedRecords('import_aliases'));
    const alIds = plan.aliases.map((a) => a.id);
    const haveAl = alIds.length ? await aliasesCol().query(Q.where('id', Q.oneOf(alIds))).fetch() : [];
    const byId = new Map(haveAl.map((a) => [a.id, a]));
    for (const a of plan.aliases) {
      if (unavailableCustom.has(a.exerciseId) || deletedAl.has(a.id)) continue;
      const cur = byId.get(a.id);
      if (cur) {
        if (cur.exerciseId !== a.exerciseId) {
          // update 는 _changed 를 스스로 기록한다 — 칸 단위로 로컬이 이긴다.
          ops.push(
            cur.prepareUpdate((r) => {
              r.exerciseId = a.exerciseId;
            }),
          );
          aliasesWritten++;
        }
        continue;
      }
      const rec = aliasesCol().prepareCreateFromDirtyRaw({
        id: a.id,
        source: a.source,
        source_name: a.sourceName,
        exercise_id: a.exerciseId,
        created_at: now,
        updated_at: now,
      });
      markLocalWins(rec._raw as unknown as { _changed?: string }, ['exercise_id']); // 사람이 고른 값(ADR-042 개정)
      ops.push(rec);
      aliasesWritten++;
    }
    await database.batch(...ops);
  });

  // ② 운동 단위 묶음
  const skipped: SkippedWorkout[] = [...plan.skipped];
  const chunks = chunkPlannedWorkouts(plan.workouts, IMPORT_WRITE_MAX_ROWS);
  let workoutsDone = 0;
  let written = 0;
  let writtenWe = 0;
  let writtenSets = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    await database.write(async () => {
      const wIds = chunk.map((w) => w.id);
      const weIds = chunk.flatMap((w) => w.exercises.map((r) => r.id as string));
      const setIds = chunk.flatMap((w) => w.sets.map((r) => r.id as string));
      const deleted = new Set<string>();
      const visible = new Set<string>();
      for (const [col, table, ids] of [
        [workoutsCol(), 'workouts', wIds],
        [weCol(), 'workout_exercises', weIds],
        [setsCol(), 'set_logs', setIds],
      ] as const) {
        for (const id of await database.adapter.getDeletedRecords(table)) deleted.add(id);
        for (const id of await existingIdsIn(col as unknown as Collection<Model>, ids)) visible.add(id);
      }
      const ops: Model[] = [];
      for (const w of chunk) {
        const ids = plannedIds(w);
        if (ids.some((id) => deleted.has(id))) {
          skipped.push({ id: w.id, localStart: w.localStart, reason: 'deleted_pending' });
          continue;
        }
        if (ids.some((id) => visible.has(id))) {
          skipped.push({ id: w.id, localStart: w.localStart, reason: 'exists' });
          continue;
        }
        if (w.customIds.some((id) => unavailableCustom.has(id))) {
          skipped.push({ id: w.id, localStart: w.localStart, reason: 'custom_unavailable' });
          continue;
        }
        ops.push(workoutsCol().prepareCreateFromDirtyRaw(w.row));
        for (const r of w.exercises) ops.push(weCol().prepareCreateFromDirtyRaw(r));
        for (const r of w.sets) ops.push(setsCol().prepareCreateFromDirtyRaw(r));
        written++;
        writtenWe += w.exercises.length;
        writtenSets += w.sets.length;
      }
      if (ops.length) await database.batch(...ops);
      if (opts.faultInjection?.throwAfterChunk === ci + 1) throw new Error('시험용 실패 주입');
    });
    workoutsDone += chunk.length;
    onProgress?.({ phase: 'writing', chunk: ci + 1, chunks: chunks.length, workoutsDone, workoutsTotal: plan.workouts.length });
    await yieldToUi();
  }

  // ③ 끝 — 쓴 것이 없으면 묶음 행을 남기지 않는다(재실행 「전부 건너뜀」이 기록을 늘리지 않게)
  onProgress?.({ phase: 'finishing', chunk: chunks.length, chunks: chunks.length, workoutsDone, workoutsTotal: plan.workouts.length });
  const keep = written > 0 || customCreated > 0;
  await database.write(async () => {
    const row = await batches().find(b.id);
    if (!keep) {
      await database.batch(rawStatus(row) === 'created' ? row.prepareDestroyPermanently() : row.prepareMarkAsDeleted());
      return;
    }
    await database.batch(
      row.prepareUpdate((r) => {
        r.status = 'done';
        r.workoutCount = written;
        r.setCount = writtenSets;
      }),
    );
  });
  return {
    batchId: keep ? b.id : null,
    workouts: written,
    workoutExercises: writtenWe,
    sets: writtenSets,
    customExercisesCreated: customCreated,
    aliasesWritten,
    skipped,
  };
}

// ── 되돌리기 · 부팅 정리 ────────────────────────────────────────────────────
export interface UndoPreview {
  batchId: string;
  status: 'writing' | 'done' | 'undone';
  workouts: number;
  sets: number;
  /** 가져온 뒤 사람이 고친 세트(user_edited) — 있으면 화면이 먼저 묻는다(D-9) */
  userEditedSets: number;
  /** 지울 커스텀 종목(묶음 밖 참조 0) / 남길 종목(참조가 있어 import_batch_id 만 비운다) */
  customExercises: { remove: string[]; keep: string[] };
  /** 지울 별칭(지울 종목을 가리키는 것만) */
  aliasesToRemove: number;
}

interface BatchRows {
  batch: ImportBatch;
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: SetLog[];
  customRemove: Exercise[];
  customKeep: Exercise[];
  aliases: ImportAlias[];
}

async function collectBatchRows(batchId: string): Promise<BatchRows> {
  const batch = await batches().find(batchId);
  const workouts = await workoutsCol().query(Q.where('import_batch_id', batchId)).fetch();
  const wIds = workouts.map((w) => w.id);
  const workoutExercises = wIds.length ? await weCol().query(Q.where('workout_id', Q.oneOf(wIds))).fetch() : [];
  const weIds = workoutExercises.map((x) => x.id);
  const sets = weIds.length ? await setsCol().query(Q.where('workout_exercise_id', Q.oneOf(weIds))).fetch() : [];
  const customs = await exercisesCol().query(Q.where('import_batch_id', batchId)).fetch();
  const cIds = customs.map((c) => c.id);
  // 묶음 밖 참조(D-9): 다른 묶음·앱 운동의 종목 줄 + 루틴 줄
  const inBatch = new Set(wIds);
  const refs = new Set<string>();
  if (cIds.length) {
    const outsideWe = await weCol().query(Q.where('exercise_id', Q.oneOf(cIds))).fetch();
    for (const x of outsideWe) if (!inBatch.has(x.workoutId)) refs.add(x.exerciseId);
    const re = await routineExCol().query(Q.where('exercise_id', Q.oneOf(cIds))).fetch();
    for (const x of re) refs.add(x.exerciseId);
  }
  const customRemove = customs.filter((c) => !refs.has(c.id));
  const customKeep = customs.filter((c) => refs.has(c.id));
  const removeIds = customRemove.map((c) => c.id);
  const aliases = removeIds.length ? await aliasesCol().query(Q.where('exercise_id', Q.oneOf(removeIds))).fetch() : [];
  return { batch, workouts, workoutExercises, sets, customRemove, customKeep, aliases };
}

function statusOf(b: ImportBatch): UndoPreview['status'] {
  return b.status === 'writing' ? 'writing' : b.status === 'undone' ? 'undone' : 'done';
}

function previewOf(r: BatchRows): UndoPreview {
  return {
    batchId: r.batch.id,
    status: statusOf(r.batch),
    workouts: r.workouts.length,
    sets: r.sets.length,
    userEditedSets: r.sets.filter((s) => s.userEdited === true).length,
    customExercises: { remove: r.customRemove.map((c) => c.id), keep: r.customKeep.map((c) => c.id) },
    aliasesToRemove: r.aliases.length,
  };
}

/** 되돌리기 전에 무엇이 지워지는지(화면 확인 문구 · user_edited 경고). 묶음이 없으면 null */
export async function previewUndoImportBatch(batchId: string): Promise<UndoPreview | null> {
  try {
    return previewOf(await collectBatchRows(batchId));
  } catch {
    return null;
  }
}

/**
 * 행 하나를 지우는 준비. 서버에 간 적 없는 created 행은 영구 삭제(삭제 표시를 남기면 같은 id 재가져오기가 막힌다 · D-3),
 * 그 밖에는 삭제 표시(동기로 다른 기기에 전한다). 로그인 기기의 되돌리기는 created 여도 삭제 표시다 — 나눠 보내기 중간 실패로
 * 서버에 이미 간 행일 수 있다.
 */
function prepareRemove(m: Model, permanentIfCreated: boolean): Model {
  return permanentIfCreated && rawStatus(m) === 'created' ? m.prepareDestroyPermanently() : m.prepareMarkAsDeleted();
}

async function removeInChunks(models: Model[], permanentIfCreated: boolean): Promise<void> {
  for (let i = 0; i < models.length; i += IMPORT_WRITE_MAX_ROWS) {
    const part = models.slice(i, i + IMPORT_WRITE_MAX_ROWS);
    await database.write(async () => {
      await database.batch(...part.map((m) => prepareRemove(m, permanentIfCreated)));
    });
    await yieldToUi();
  }
}

/**
 * 묶음의 행을 지운다. mode='undo' → 묶음 행은 status='undone'·undone_at 으로 남긴다(가져오기 기록 · 다른 기기 D-2 판단).
 * mode='cleanup' → 묶음 행도 지운다(부팅 정리 · 끝나지 않은 묶음). 커스텀 종목은 묶음 밖 참조를 **마지막 write 안에서 다시 세어**
 * 0 일 때만 지우고, 남으면 import_batch_id 를 비운다(D-9).
 */
async function removeBatch(batchId: string, mode: 'undo' | 'cleanup', loggedIn: boolean): Promise<UndoPreview | null> {
  // 묶음 행이 없으면(첫 write 전에 실패) 지울 것도 없다 — 묶음 행·커스텀 종목·별칭은 같은 batch 로 만들어진다.
  if ((await batches().query(Q.where('id', batchId)).fetchCount()) === 0) return null;
  const rows = await collectBatchRows(batchId);
  const preview = previewOf(rows);
  // cleanup: 쓰는 동안 동기가 멈춰 있었으므로 created 행은 서버에 없다 → 영구 삭제. undo: 로그인 기기면 삭제 표시.
  const permanent = mode === 'cleanup' || !loggedIn;
  await removeInChunks(rows.sets, permanent);
  await removeInChunks(rows.workoutExercises, permanent);
  await removeInChunks(rows.workouts, permanent);
  await database.write(async () => {
    const again = await collectBatchRows(batchId); // write 안에서 참조를 다시 센다
    const ops: Model[] = [];
    // 그사이 다른 쓰기가 같은 묶음 행을 남겼으면(없어야 정상) 같이 지운다
    for (const m of [...again.sets, ...again.workoutExercises, ...again.workouts]) ops.push(prepareRemove(m, permanent));
    for (const c of again.customRemove) ops.push(prepareRemove(c, permanent));
    for (const c of again.customKeep)
      ops.push(
        c.prepareUpdate((r) => {
          r.importBatchId = null;
        }),
      );
    for (const a of again.aliases) ops.push(prepareRemove(a, permanent));
    if (mode === 'cleanup') ops.push(prepareRemove(again.batch, true));
    else
      ops.push(
        again.batch.prepareUpdate((r) => {
          r.status = 'undone';
          r.undoneAt = Date.now();
        }),
      );
    await database.batch(...ops);
  });
  return preview;
}

export type UndoResult = { status: 'needs_confirm'; preview: UndoPreview } | { status: 'undone'; preview: UndoPreview };

/**
 * 묶음 되돌리기. 가져온 뒤 사람이 고친 세트가 있으면 `confirmUserEdited` 없이는 지우지 않고 'needs_confirm' 을 돌려준다.
 * 이미 되돌렸으면 아무것도 안 하고 'undone'. 쓰는 동안 동기를 멈추고, 끝나면 flush 뒤 재개한다.
 * @throws ImportBlockedError('import_in_progress') — 다른 가져오기·되돌리기 중이거나 묶음이 아직 쓰는 중
 */
export async function undoImportBatch(
  batchId: string,
  opts: { confirmUserEdited?: boolean; flush?: () => Promise<void> } = {},
): Promise<UndoResult> {
  if (busy) throw new ImportBlockedError('import_in_progress');
  busy = true;
  try {
    const preview = previewOf(await collectBatchRows(batchId));
    if (preview.status === 'undone') return { status: 'undone', preview };
    if (preview.status === 'writing') throw new ImportBlockedError('import_in_progress');
    if (preview.userEditedSets > 0 && !opts.confirmUserEdited) return { status: 'needs_confirm', preview };
    const loggedIn = await isSyncLoggedIn();
    const release = await pauseSync();
    try {
      const done = await removeBatch(batchId, 'undo', loggedIn);
      return { status: 'undone', preview: done ?? preview };
    } finally {
      try {
        await opts.flush?.();
      } catch {
        // 다음 자동 저장이 다시 내려쓴다
      }
      release();
      scheduleSync(0);
    }
  } finally {
    busy = false;
  }
}

/**
 * 부팅 정리 — status='writing' 묶음(탭이 닫혔거나 쓰다 실패)의 행을 지우고 묶음도 지운다. 부팅 파이프라인이 첫 동기 전에 부른다.
 * 지운 묶음 수를 돌려준다. @plm SRS-082
 */
export async function cleanupUnfinishedImports(): Promise<number> {
  if (busy) return 0;
  const writing = await batches().query(Q.where('status', 'writing')).fetch();
  let n = 0;
  for (const b of writing) {
    await removeBatch(b.id, 'cleanup', false);
    n++;
  }
  return n;
}

// ── 가져오기 기록(화면 「가져오기 기록」) ───────────────────────────────────
export interface ImportBatchSummary {
  id: string;
  source: string | null;
  fileLabel: string | null;
  workoutCount: number;
  setCount: number;
  status: 'writing' | 'done' | 'undone';
  createdAt: number;
  undoneAt: number | null;
  weightUnit: 'kg' | 'lb' | null;
}

export async function listImportBatches(): Promise<ImportBatchSummary[]> {
  const rows = await batches().query(Q.sortBy('created_at', Q.desc)).fetch();
  return rows.map((b) => ({
    id: b.id,
    source: b.source,
    fileLabel: b.fileLabel,
    workoutCount: b.workoutCount ?? 0,
    setCount: b.setCount ?? 0,
    status: statusOf(b),
    createdAt: b.createdAt?.getTime?.() ?? 0,
    undoneAt: b.undoneAt,
    weightUnit: b.weightUnit,
  }));
}

/** observe() 용 쿼리 */
export function queryImportBatches() {
  return batches().query(Q.sortBy('created_at', Q.desc));
}
