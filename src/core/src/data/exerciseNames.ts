// @plm SRS-056  표시 이름 — 사용자 × 종목 「내가 부르는 이름」(ADR-033 · QA M3).
//
// 같은 동작은 한 종목이고 별칭이 여럿이다. 사용자가 별칭으로 골랐으면 그 사람 화면에서는 그 이름으로 보인다
// (「롱풀」로 고른 사람에게 「케이블 시티드 로우」라고 바꿔 부르지 않는다). 기록은 종목 하나에 모인다.
//
// 저장: exercise_user_prefs.display_name(계정과 함께 동기) · 레코드 id = `pref-<exercise_id>`(여러 기기가 같은 행).
// null = 대표 이름. 모든 화면이 여기 한 곳을 지나야 「목록은 롱풀, 분석은 케이블 시티드 로우」가 생기지 않는다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise, ExerciseUserPref, SetLog, WorkoutExercise } from '../db/models';
import { exercisePrefId } from '../db/models/ExerciseUserPref';
import type { ImpliedAxes } from './catalog/catalogTypes';
import { dimsFromColumns, type AttachKey, type GripKey, type VariantDims } from '../domain/variants';
import { normalizeNameKey } from '../domain/nameKey';

const prefs = () => database.get<ExerciseUserPref>('exercise_user_prefs');

/** 종목 id → 화면에 보일 이름(표시 이름이 있으면 그것, 없으면 대표 이름). 없는 종목은 빠진다. */
export async function getExerciseDisplayNameMap(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return out;
  const exs = await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf(uniq))).fetch();
  for (const e of exs) out.set(e.id, e.nameKo);
  const ps = await prefs()
    .query(Q.where('exercise_id', Q.oneOf(uniq)))
    .fetch();
  for (const p of ps) {
    const n = p.displayName?.trim();
    if (n && out.has(p.exerciseId)) out.set(p.exerciseId, n);
  }
  return out;
}

/** 이 종목을 무엇이라 부를지 고르는 시트의 재료 — 대표 이름 + 한글 별칭(영문 제외) + 지금 고른 이름. */
export async function getExerciseNameChoices(
  exerciseId: string,
): Promise<{ nameKo: string; aliases: string[]; current: string | null } | null> {
  let ex: Exercise;
  try {
    ex = await database.get<Exercise>('exercises').find(exerciseId);
  } catch {
    return null;
  }
  const seen = new Set([normalizeNameKey(ex.nameKo)]);
  const aliases: string[] = [];
  for (const a of ex.aliases ?? []) {
    // 영문 별칭(검색용)은 고르는 이름에서 뺀다 — 한글 화면에 「BB bench」가 뜨지 않게
    if (!/[가-힣]/.test(a)) continue;
    const k = normalizeNameKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    aliases.push(a);
  }
  return { nameKo: ex.nameKo, aliases, current: await getStoredDisplayName(exerciseId) };
}

async function getStoredDisplayName(exerciseId: string): Promise<string | null> {
  try {
    const p = await prefs().find(exercisePrefId(exerciseId));
    return p.displayName?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 표시 이름을 정한다. null 이거나 대표 이름과 같으면 「대표 이름으로 보기」(null 저장).
 * 선호 행이 없으면 만든다(id = pref-<exercise_id>). 같은 값이면 쓰지 않는다(동기 흔들기 방지).
 */
export async function setExerciseDisplayName(exerciseId: string, name: string | null): Promise<void> {
  let ex: Exercise;
  try {
    ex = await database.get<Exercise>('exercises').find(exerciseId);
  } catch {
    return;
  }
  const trimmed = name?.trim() || null;
  const next = trimmed && normalizeNameKey(trimmed) !== normalizeNameKey(ex.nameKo) ? trimmed : null;
  await database.write(async () => {
    let row: ExerciseUserPref | null = null;
    try {
      row = await prefs().find(exercisePrefId(exerciseId));
    } catch {
      row = null;
    }
    if (row) {
      if ((row.displayName?.trim() || null) === next) return;
      await row.update((p) => {
        p.displayName = next;
      });
      return;
    }
    if (next == null) return; // 선호가 없으면 이미 대표 이름이다
    await prefs().create((p) => {
      p._raw.id = exercisePrefId(exerciseId);
      p.exerciseId = exerciseId;
      p.displayName = next;
      p.plateOneSide = null;
    });
  });
}

/**
 * 검색 결과에서 고른 직후 — 「마지막으로 고른 이름」을 표시 이름으로(ADR-033 D1).
 * 질의가 그 이름과 **정확히** 같을 때만 바꾼다: 「벤」처럼 일부만 친 말로 이름을 바꾸지 않는다.
 * 대표 이름을 정확히 쳐서 골랐으면 대표 이름으로 돌아간다.
 */
export async function applyPickedName(
  exerciseId: string,
  pick: { matched: string; matchedKind: 'name' | 'alias' | 'nameEn'; exact: boolean },
): Promise<void> {
  if (!pick.exact) return;
  if (pick.matchedKind === 'alias' && /[가-힣]/.test(pick.matched)) await setExerciseDisplayName(exerciseId, pick.matched);
  else if (pick.matchedKind === 'name') await setExerciseDisplayName(exerciseId, null);
}

// ── 별칭이 함축하는 기록 칸(D7) ── 「로프 푸시다운」 = 케이블 푸시다운 + 부착물 로프.
// 근거는 마스터 표의 통합(보관) 행: 그 옛 이름이 대상 종목의 별칭이고, implied_axes 가 축 값이다.
let impliedByKey: Map<string, { targetId: string; axes: ImpliedAxes }> | null = null;
async function impliedTable(): Promise<Map<string, { targetId: string; axes: ImpliedAxes }>> {
  if (impliedByKey) return impliedByKey;
  const { CATALOG } = await import('./catalog/catalog.generated');
  const m = new Map<string, { targetId: string; axes: ImpliedAxes }>();
  for (const r of CATALOG) {
    if (!r.isArchived || !r.mergeInto || !Object.keys(r.impliedAxes ?? {}).length) continue;
    for (const n of [r.nameKo, r.oldNameKo]) if (n) m.set(`${r.mergeInto}|${normalizeNameKey(n)}`, { targetId: r.mergeInto, axes: r.impliedAxes });
  }
  impliedByKey = m;
  return m;
}

/** 이 종목을 이 별칭으로 골랐을 때 함축되는 축 — 없으면 null. */
export async function impliedAxesForAlias(exerciseId: string, alias: string): Promise<ImpliedAxes | null> {
  const hit = (await impliedTable()).get(`${exerciseId}|${normalizeNameKey(alias)}`);
  return hit ? hit.axes : null;
}

/** 함축 축을 방금 만든 운동 블록에 — 칸 축은 블록 변형으로, 원암은 그 블록 세트의 팔로(ADR-034: 팔은 세트 속성). */
export async function applyImpliedAxesToWorkoutExercise(workoutExerciseId: string, axes: ImpliedAxes): Promise<void> {
  const { setVariant } = await import('./workoutRepository');
  const we = await database.get<WorkoutExercise>('workout_exercises').find(workoutExerciseId);
  const dims: VariantDims = { ...dimsFromColumns(we), ...axesToDims(axes) };
  if (axes.attach || axes.grip || axes.brand) await setVariant(workoutExerciseId, dims);
  if (axes.arm === 'uni') {
    const sets = await database.get<SetLog>('set_logs').query(Q.where('workout_exercise_id', workoutExerciseId)).fetch();
    if (sets.length)
      await database.write(async () => {
        await database.batch(
          ...sets.map((s) =>
            s.prepareUpdate((r) => {
              r.arm = 'uni';
            }),
          ),
        );
      });
  }
}

/** 루틴 종목에는 칸 축만(팔은 세트 속성이라 루틴 행에 두지 않는다). */
export async function applyImpliedAxesToRoutineExercise(routineExerciseId: string, axes: ImpliedAxes): Promise<void> {
  if (!(axes.attach || axes.grip || axes.brand)) return;
  const { setRoutineExerciseVariant } = await import('./routineRepository');
  const re = await database.get('routine_exercises').find(routineExerciseId);
  const dims: VariantDims = { ...dimsFromColumns(re as never), ...axesToDims(axes) };
  await setRoutineExerciseVariant(routineExerciseId, dims);
}

function axesToDims(axes: ImpliedAxes): VariantDims {
  const d: VariantDims = {};
  if (axes.brand) d.equipment = axes.brand;
  if (axes.attach) d.attach = axes.attach as AttachKey;
  if (axes.grip) d.grip = axes.grip as GripKey;
  return d;
}
