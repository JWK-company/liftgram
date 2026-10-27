// @plm SRS-081 SRS-082  가져오기 계획 — 파싱 결과 + 종목 결정 → 쓸 행(칸 이름 그대로) 목록. 순수 함수(Worker·node 공통).
//
// ── 칸 값 계약(D-12 · 테스트로 고정) ───────────────────────────────────────────
// workouts      state='completed' · started_at=원본(현지 시각 → epoch) · completed_at=started+duration(없으면 started) ·
//               duration_seconds · total_volume_kg=core 볼륨 함수(가져올 때의 체중 = 호출자가 resolveBodyweightKg 로 넘긴 값) ·
//               pr_count=0(통계는 읽을 때 계산) · accumulated_pause_ms=0 · source · import_batch_id · created_at=updated_at=가져온 시각
// set_logs      done=true · completed_at=null · user_edited=false · is_warmup·is_drop·is_failed = W/D/F ·
//               set_type 은 처방 어휘(warmup|top|backoff)라 warmup 만 · rpe=원본 · rir=null(읽을 때 effectiveRir 가 rpe 로 환산 —
//               rir 칸은 「사람이 적은 RIR」이다 · ADR-038) · weight_kg=kg 정규화(lb 면 환산)
// workout_exercises  weight_unit='lb'(lb 로 가져왔을 때만 · 아니면 null=kg) · 변형 칸은 결정이 준 것만(ADR-034)
// import_batches     tz_offset_min · weight_unit · file_label(40자)
//
// ── id(ADR-042 개정 · D-7) ──────────────────────────────────────────────────
// 운동 `imp-<source>-<sha16(정규화 현지 시각)>`(같은 시각 두 번이면 `#n`) · 하위 id 는 **파일 안 원래 순번** 파생(종목 줄·세트 —
// 「가져오지 않기」 결정과 무관 · P5-3) · 커스텀 종목 `cx-…` · 별칭 `ia-…`.
// 시간대는 epoch 변환에만 쓴다 — 같은 파일은 어느 시간대의 기기에서도 같은 id 집합이 된다.
import type { EquipmentType, LoadMode, LoggedSet, MuscleGroup } from '../types';
import { resolveLoadMode, totalVolumeKg } from '../volume';
import { lbToKg } from '../units';
import { variantColumns, type VariantDims } from '../variants';
import { localParts, type ImportFormat, type ImportSourceKind, type ImportWeightUnit, type ParseIssue, type ParseResult } from './common';
import {
  importAliasId,
  importCustomExerciseId,
  importSetId,
  importWorkoutExerciseId,
  importWorkoutId,
} from './hash';
import { parseEquipmentHint } from './match';

/** 칸 이름(snake_case) → 값. prepareCreateFromDirtyRaw 에 그대로 넣는다. */
export type RawRow = Record<string, string | number | boolean | null>;

export type ExerciseDecision =
  /** 우리 종목으로. remember=사람이 고르거나 확인했다 → 별칭으로 남긴다(다음 가져오기가 다시 쓴다) */
  | { kind: 'existing'; exerciseId: string; variant?: VariantDims | null; remember?: boolean }
  /** 내 종목 만들기(근육 미지정 허용) */
  | { kind: 'custom'; nameKo?: string; equipment?: EquipmentType; primaryMuscles?: MuscleGroup[] }
  /** 이 종목은 가져오지 않는다 */
  | { kind: 'skip' };

export interface ExerciseInfo {
  equipment: string;
  loadMode?: LoadMode | null;
}

export interface PlanInput {
  parsed: ParseResult;
  /** 사용자가 고른 무게 단위. 파일이 단위를 밝혔으면 생략 가능(그 단위). 밝히지 않았는데 없으면 오류 */
  weightUnit?: ImportWeightUnit;
  /** 원본 종목 이름 → 결정. 없는 이름은 skip 으로 본다 */
  decisions: ReadonlyMap<string, ExerciseDecision>;
  /** 결정에 쓴 우리 종목의 기구·하중 모드(볼륨 계산용) */
  exerciseInfo: ReadonlyMap<string, ExerciseInfo>;
  /** 가져올 때의 체중(resolveBodyweightKg) — 맨몸·어시스트 볼륨 */
  bodyweightKg: number | null;
  /** 이미 있는 별칭 id → 종목 id(같은 결정이면 다시 쓰지 않는다) */
  existingAliases?: ReadonlyMap<string, string>;
  /** 미리 아는 「쓸 수 없는 id」(보이는 행 + 로컬 삭제 표시). 쓰기 안에서 다시 판정한다 — 여기서는 요약 표시용 */
  existingIds?: ReadonlySet<string>;
  /** 표시용 라벨(importFileLabel 로 만든 것) */
  fileLabel: string;
  now: number;
  /** 묶음 id(없으면 now 로 만든다) */
  batchId?: string;
  /** 시간대를 직접 정한다(분, 동쪽 +). 없으면 기기 시간대. 파일이 오프셋을 밝힌 시각은 그 오프셋 */
  tzOffsetMin?: number;
}

export interface PlannedWorkout {
  id: string;
  localStart: string;
  startedAt: number;
  row: RawRow;
  exercises: RawRow[];
  sets: RawRow[];
  /** 이 운동이 쓰는 행 수(운동 1 + 종목 줄 + 세트) */
  rowCount: number;
  /** 이 운동이 쓰는 커스텀 종목 id */
  customIds: string[];
}

export interface PlannedCustomExercise {
  id: string;
  sourceName: string;
  nameKo: string;
  nameEn: string | null;
  equipment: EquipmentType;
  primaryMuscles: MuscleGroup[];
}

export interface PlannedAlias {
  id: string;
  source: ImportSourceKind;
  sourceName: string;
  exerciseId: string;
}

export type SkipReason = 'exists' | 'no_exercises' | 'deleted_pending' | 'custom_unavailable';

export interface SkippedWorkout {
  id: string;
  localStart: string;
  reason: SkipReason;
}

export interface ImportPlan {
  version: 1;
  source: ImportSourceKind;
  format: ImportFormat | null;
  batch: {
    id: string;
    source: ImportSourceKind;
    fileLabel: string;
    weightUnit: ImportWeightUnit;
    tzOffsetMin: number;
    createdAt: number;
  };
  workouts: PlannedWorkout[];
  customExercises: PlannedCustomExercise[];
  aliases: PlannedAlias[];
  skipped: SkippedWorkout[];
  stats: {
    workouts: number;
    workoutExercises: number;
    sets: number;
    totalVolumeKg: number;
    /** 계획한 행 수(운동·종목 줄·세트 — 묶음·커스텀·별칭 제외) */
    rows: number;
    /** 결정이 skip(또는 없음)이라 빠진 원본 종목 이름 */
    skippedExerciseNames: string[];
  };
  issues: ParseIssue[];
}

export class ImportPlanError extends Error {
  constructor(public readonly code: 'unit_required' | 'unreadable') {
    super(code === 'unit_required' ? '무게 단위를 골라야 합니다' : '읽을 수 없는 파일입니다');
    this.name = 'ImportPlanError';
  }
}

const M_PER = { m: 1, km: 1000, mile: 1609.344 } as const;

/** 정규화 현지 시각 → epoch(ms). offsetMin 이 있으면 그 오프셋, 없으면 기기 시간대(서머타임 반영). */
export function localToEpoch(local: string, offsetMin: number | null | undefined): number {
  const [y, mo, d, h, mi, s] = localParts(local);
  if (offsetMin != null) return Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60_000;
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

function num(v: number | null): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/** 계획을 만든다. 같은 입력이면 같은 계획(now·batchId 제외)이다. */
export function buildImportPlan(input: PlanInput): ImportPlan {
  const { parsed } = input;
  if (parsed.fatal || !parsed.source) throw new ImportPlanError('unreadable');
  const weightUnit = parsed.fileWeightUnit ?? input.weightUnit;
  if (!weightUnit) throw new ImportPlanError('unit_required');
  const source = parsed.source;
  const distUnit = parsed.fileDistanceUnit ?? (weightUnit === 'lb' ? 'mile' : 'km');
  const now = input.now;
  const batchId = input.batchId ?? `ib-${source}-${now.toString(36)}`;
  const existing = input.existingIds ?? new Set<string>();

  const customById = new Map<string, PlannedCustomExercise>();
  const aliases = new Map<string, PlannedAlias>();
  const skippedNames = new Set<string>();

  /** 원본 이름 → (종목 id · 변형 · 볼륨용 하중 모드) */
  const resolved = new Map<string, { exerciseId: string; variant: VariantDims | null; loadMode: LoadMode } | null>();
  const resolve = (name: string) => {
    if (resolved.has(name)) return resolved.get(name) ?? null;
    const d = input.decisions.get(name);
    let out: { exerciseId: string; variant: VariantDims | null; loadMode: LoadMode } | null = null;
    if (d?.kind === 'existing') {
      const info = input.exerciseInfo.get(d.exerciseId);
      out = {
        exerciseId: d.exerciseId,
        variant: d.variant ?? null,
        loadMode: resolveLoadMode({ equipment: info?.equipment ?? 'other', loadMode: info?.loadMode ?? null }),
      };
      if (d.remember) {
        const id = importAliasId(source, name);
        if (input.existingAliases?.get(id) !== d.exerciseId) aliases.set(id, { id, source, sourceName: name, exerciseId: d.exerciseId });
      }
    } else if (d?.kind === 'custom') {
      const id = importCustomExerciseId(source, name);
      const equipment = d.equipment ?? parseEquipmentHint(name).equipment ?? 'other';
      const nameKo = d.nameKo?.trim() || name;
      customById.set(id, {
        id,
        sourceName: name,
        nameKo,
        nameEn: nameKo === name ? null : name,
        equipment,
        primaryMuscles: d.primaryMuscles ?? [],
      });
      const aid = importAliasId(source, name);
      if (input.existingAliases?.get(aid) !== id) aliases.set(aid, { id: aid, source, sourceName: name, exerciseId: id });
      out = { exerciseId: id, variant: null, loadMode: resolveLoadMode({ equipment }) };
    } else skippedNames.add(name);
    resolved.set(name, out);
    return out;
  };

  // 같은 시각의 운동 순번(파일 순서) — 두 번째부터 `#n`
  const ordinalOf = new Map<string, number>();
  const workouts: PlannedWorkout[] = [];
  const skipped: SkippedWorkout[] = [];
  let firstOffset: number | null = null;
  let firstStartedAt: number | null = null;
  let sumVolume = 0;
  let sumWe = 0;
  let sumSets = 0;

  for (const pw of parsed.workouts) {
    const ordinal = (ordinalOf.get(pw.localStart) ?? 0) + 1;
    ordinalOf.set(pw.localStart, ordinal);
    const wid = importWorkoutId(source, pw.localStart, ordinal);
    const offset = pw.explicitOffsetMin ?? input.tzOffsetMin ?? null;
    const startedAt = localToEpoch(pw.localStart, offset);
    if (firstStartedAt == null) {
      firstStartedAt = startedAt;
      firstOffset = offset;
    }

    const weRows: RawRow[] = [];
    const setRows: RawRow[] = [];
    const customIds = new Set<string>();
    const logged: LoggedSet[] = [];
    let weIndex = 0;
    // [원본] 종목 줄 id 가 「가져온 줄」 순번(weIndex)이라 「가져오지 않기」 결정에 따라 밀렸다 — 두 기기가 다른 결정으로 가져오면
    //        같은 id 가 다른 원본 줄을 가리켜 종목·세트가 섞였다(P5-3).
    // for (const pe of pw.exercises) {
    // [개선] id 는 파일 안 원래 순번(빠진 줄도 센다) — 결정과 무관하게 같은 id = 같은 원본 줄. sort_order 는 가져온 줄 순번 그대로
    //        (빈 자리 없이 0..n-1 — 기록 화면의 종목 추가가 count 를 sort_order 로 쓴다).
    for (const [peIndex, pe] of pw.exercises.entries()) {
      const r = resolve(pe.name);
      if (!r || pe.sets.length === 0) continue;
      // [원본] const weId = importWorkoutExerciseId(wid, weIndex);
      const weId = importWorkoutExerciseId(wid, peIndex);
      if (customById.has(r.exerciseId)) customIds.add(r.exerciseId);
      const notes = [pe.note, ...pe.sets.map((s) => s.note)].filter((n): n is string => !!n);
      const vc = variantColumns(r.variant ?? {});
      weRows.push({
        id: weId,
        workout_id: wid,
        exercise_id: r.exerciseId,
        sort_order: weIndex,
        note: notes.length ? [...new Set(notes)].join(' / ') : null,
        prev_weight_kg: null,
        prev_reps: null,
        variant_key: vc.variantKey,
        variant_equipment: vc.variantEquipment,
        variant_grip: vc.variantGrip,
        variant_arm: vc.variantArm,
        variant_load: vc.variantLoad,
        variant_attach: vc.variantAttach,
        machine_variant: null,
        superset_group: pe.supersetKey ? `${wid}-ss${pe.supersetKey}` : null,
        weight_unit: weightUnit === 'lb' ? 'lb' : null,
        unit_by_user: null,
        created_at: now,
        updated_at: now,
      });
      pe.sets.forEach((s, j) => {
        const rawW = num(s.weight) ?? 0;
        const weightKg = weightUnit === 'lb' ? lbToKg(rawW) : rawW;
        const reps = Math.max(0, Math.round(num(s.reps) ?? 0));
        const rpe = num(s.rpe);
        const dist = num(s.distance);
        const dur = num(s.durationSec);
        const row: RawRow = {
          id: importSetId(weId, j),
          workout_exercise_id: weId,
          set_number: j + 1,
          weight_kg: weightKg,
          reps,
          rpe: rpe != null && rpe > 0 && rpe <= 10 ? rpe : null,
          rir: null,
          is_warmup: s.kind === 'warmup',
          is_failed: s.kind === 'failure',
          is_drop: s.kind === 'drop',
          set_type: s.kind === 'warmup' ? 'warmup' : null,
          target_rir: null,
          partial_reps: null,
          duration_sec: dur != null && dur > 0 ? Math.round(dur) : null,
          distance_m: dist != null && dist > 0 ? dist * M_PER[distUnit] : null,
          load_multiplier: null,
          user_edited: false,
          done: true,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        setRows.push(row);
        logged.push({
          weightKg,
          reps,
          rpe: row.rpe as number | null,
          isWarmup: row.is_warmup as boolean,
          isFailed: row.is_failed as boolean,
          durationSec: row.duration_sec as number | null,
          distanceM: row.distance_m as number | null,
          loadMode: r.loadMode,
          bodyweightKg: input.bodyweightKg,
        });
      });
      weIndex++;
    }

    if (weRows.length === 0) {
      skipped.push({ id: wid, localStart: pw.localStart, reason: 'no_exercises' });
      continue;
    }
    const ids = [wid, ...weRows.map((r) => r.id as string), ...setRows.map((r) => r.id as string)];
    if (ids.some((id) => existing.has(id))) {
      skipped.push({ id: wid, localStart: pw.localStart, reason: 'exists' });
      continue;
    }
    const volume = totalVolumeKg(logged);
    const completedAt = pw.durationSec ? startedAt + pw.durationSec * 1000 : startedAt;
    workouts.push({
      id: wid,
      localStart: pw.localStart,
      startedAt,
      row: {
        id: wid,
        user_id: null,
        routine_id: null,
        name: pw.title,
        state: 'completed',
        started_at: startedAt,
        paused_at: null,
        accumulated_pause_ms: 0,
        completed_at: completedAt,
        total_volume_kg: volume,
        duration_seconds: pw.durationSec,
        pr_count: 0,
        notes: pw.note,
        source,
        import_batch_id: batchId,
        created_at: now,
        updated_at: now,
      },
      exercises: weRows,
      sets: setRows,
      rowCount: 1 + weRows.length + setRows.length,
      customIds: [...customIds],
    });
    sumVolume += volume;
    sumWe += weRows.length;
    sumSets += setRows.length;
  }

  // 실제로 쓰는 운동이 참조하는 커스텀 종목만 만든다.
  const usedCustom = new Set(workouts.flatMap((w) => w.customIds));
  const tz = firstOffset ?? input.tzOffsetMin ?? -new Date(firstStartedAt ?? now).getTimezoneOffset();
  return {
    version: 1,
    source,
    format: parsed.format,
    batch: { id: batchId, source, fileLabel: input.fileLabel, weightUnit, tzOffsetMin: tz, createdAt: now },
    workouts,
    customExercises: [...customById.values()].filter((c) => usedCustom.has(c.id)),
    aliases: [...aliases.values()],
    skipped,
    stats: {
      workouts: workouts.length,
      workoutExercises: sumWe,
      sets: sumSets,
      totalVolumeKg: sumVolume,
      rows: workouts.reduce((n, w) => n + w.rowCount, 0),
      skippedExerciseNames: [...skippedNames],
    },
    issues: parsed.issues,
  };
}

/** 쓰기 묶음 상한(행) — 운동 단위로 자른다. 운동 하나가 상한보다 크면 그 운동 혼자 한 묶음이다(ADR-043 개정). */
export const IMPORT_WRITE_CHUNK_ROWS = 2000;

export function chunkPlannedWorkouts<T extends { rowCount: number }>(workouts: readonly T[], maxRows = IMPORT_WRITE_CHUNK_ROWS): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let rows = 0;
  for (const w of workouts) {
    if (cur.length && rows + w.rowCount > maxRows) {
      out.push(cur);
      cur = [];
      rows = 0;
    }
    cur.push(w);
    rows += w.rowCount;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 계획의 모든 id(운동·종목 줄·세트) — 쓰기 안 재판정·재실행 시험용 */
export function plannedIds(w: PlannedWorkout): string[] {
  return [w.id, ...w.exercises.map((r) => r.id as string), ...w.sets.map((r) => r.id as string)];
}
