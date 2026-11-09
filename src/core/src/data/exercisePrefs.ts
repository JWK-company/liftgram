// @plm SRS-058  사용자 × 종목 선호 중 「플레이트 한쪽 무게로 입력」(ADR-037).
//
// 표시 이름과 같은 행(exercise_user_prefs, id = `pref-<exercise_id>`)의 다른 칸이다 — 계정과 함께 동기되고,
// 한 번 켜면 그 종목에서 계속 유지된다. 켜고 끄는 것은 앞으로 쓸 세트의 배수만 바꾼다(과거 세트는 저장된 배수로 의미 보존).
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { ExerciseUserPref } from '../db/models';
import { exercisePrefId } from '../db/models/ExerciseUserPref';
import { markLocalWins } from '../sync/localWins';

const prefs = () => database.get<ExerciseUserPref>('exercise_user_prefs');

export async function getPlateOneSide(exerciseId: string): Promise<boolean> {
  try {
    const p = await prefs().find(exercisePrefId(exerciseId));
    return p.plateOneSide === true;
  } catch {
    return false;
  }
}

/** 여러 종목을 한 번에 — 세션 시작처럼 종목이 여럿일 때. */
export async function getPlateOneSideMap(exerciseIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const uniq = [...new Set(exerciseIds)].filter(Boolean);
  if (!uniq.length) return out;
  const rows = await prefs().query(Q.where('exercise_id', Q.oneOf(uniq))).fetch();
  for (const r of rows) out.set(r.exerciseId, r.plateOneSide === true);
  return out;
}

/** 선호를 쓴다(행이 없으면 만든다). 같은 값이면 쓰지 않는다 — 동기를 흔들지 않게. */
export async function setPlateOneSide(exerciseId: string, on: boolean): Promise<void> {
  await database.write(async () => {
    let row: ExerciseUserPref | null = null;
    try {
      row = await prefs().find(exercisePrefId(exerciseId));
    } catch {
      row = null;
    }
    if (row) {
      if ((row.plateOneSide === true) === on) return;
      await row.update((p) => {
        p.plateOneSide = on;
      });
      return;
    }
    if (!on) return; // 행이 없으면 이미 꺼진 상태다
    await prefs().create((p) => {
      p._raw.id = exercisePrefId(exerciseId);
      p.exerciseId = exerciseId;
      p.displayName = null;
      p.plateOneSide = true;
      // 같은 id 의 원격 행(서버 이관·다른 기기)이 와도 이 칸은 로컬이 이긴다 — 이름 칸은 원격을 받는다(/qa code M-2)
      markLocalWins(p._raw, ['plate_one_side']);
    });
  });
}

// ── 입력 방식 선택(tri-state · 2026-10-27 피드백 #63) ─────────────────────────────
// 「아직 안 정함(null)」과 「양쪽 합으로 정함(false)」을 구분해야 한 번만 물을 수 있다. 위 getPlateOneSide(Map)은 null 을 false 로
// 접고, setPlateOneSide(off)는 행이 없으면 쓰지 않아 「양쪽 합」 답이 기억되지 않는다 — 그래서 따로 둔다(옛 함수는 보존). @plm SRS-084

/** 이 종목의 입력 방식 선택 — true 한쪽 · false 양쪽 합·핀 · null 아직 안 정함. */
export async function getPlateOneSideChoice(exerciseId: string): Promise<boolean | null> {
  try {
    const p = await prefs().find(exercisePrefId(exerciseId));
    return p.plateOneSide ?? null;
  } catch {
    return null;
  }
}

/** 여러 종목을 한 번에(선택이 없는 종목은 키가 없거나 null). */
export async function getPlateOneSideChoiceMap(exerciseIds: string[]): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const uniq = [...new Set(exerciseIds)].filter(Boolean);
  if (!uniq.length) return out;
  const rows = await prefs().query(Q.where('exercise_id', Q.oneOf(uniq))).fetch();
  for (const r of rows) out.set(r.exerciseId, r.plateOneSide ?? null);
  return out;
}

/** 선택을 쓴다 — 「양쪽 합(false)」도 행을 만들어 기억한다. 같은 값이면 쓰지 않는다. */
export async function setPlateOneSideChoice(exerciseId: string, on: boolean): Promise<void> {
  await database.write(async () => {
    let row: ExerciseUserPref | null = null;
    try {
      row = await prefs().find(exercisePrefId(exerciseId));
    } catch {
      row = null;
    }
    if (row) {
      if (row.plateOneSide === on) return;
      await row.update((p) => {
        p.plateOneSide = on;
      });
      return;
    }
    await prefs().create((p) => {
      p._raw.id = exercisePrefId(exerciseId);
      p.exerciseId = exerciseId;
      p.displayName = null;
      p.plateOneSide = on;
      markLocalWins(p._raw, ['plate_one_side']);
    });
  });
}

// ── 기본 종목 숨기기(/qa code M-4) ─────────────────────────────────────
// 시드 종목 행은 사용자 동기에 싣지 않는다(D10 — 카탈로그 정본은 서버). 그래서 「감추기」를 종목 행에만 적으면 다른 기기로
// 가지 않고, 카탈로그를 다시 받으면 풀렸다. 숨김은 계정과 함께 동기되는 선호 행에 적고, 로컬 종목 행에도 반영한다
// (목록·고르기 필터는 지금처럼 is_archived 를 본다 — 반영은 catalogSync·정규화가 맞춘다). @plm SRS-056

/** 이 계정이 숨긴 종목 id. */
export async function getHiddenExerciseIds(): Promise<Set<string>> {
  const rows = await prefs().query(Q.where('hidden', true)).fetch();
  return new Set(rows.map((r) => r.exerciseId));
}

/** 숨김을 쓴다(행이 없으면 만든다). 같은 값이면 쓰지 않는다. */
export async function setExerciseHidden(exerciseId: string, hidden: boolean): Promise<void> {
  await database.write(async () => {
    let row: ExerciseUserPref | null = null;
    try {
      row = await prefs().find(exercisePrefId(exerciseId));
    } catch {
      row = null;
    }
    if (row) {
      if ((row.hidden === true) === hidden) return;
      await row.update((p) => {
        p.hidden = hidden;
      });
      return;
    }
    if (!hidden) return;
    await prefs().create((p) => {
      p._raw.id = exercisePrefId(exerciseId);
      p.exerciseId = exerciseId;
      p.displayName = null;
      p.plateOneSide = null;
      p.hidden = true;
      markLocalWins(p._raw, ['hidden']);
    });
  });
}

/**
 * 기본 종목 「보관(숨김)」을 모두 푼다 — S-145(2026-11-09)에서 기본 종목 보관을 없앴다. 되살릴 곳이 없어 숨긴 종목을 다시 찾을 수 없었다.
 * 선호 행의 hidden 을 끄고(계정 동기로 다른 기기에도 간다), 이 기기의 종목 행도 바로 보이게 한다(내가 만든 종목은 그대로).
 * 돌려준 값 = 푼 종목 수.
 */
export async function unhideAllExercises(): Promise<number> {
  const rows = await prefs().query(Q.where('hidden', true)).fetch();
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.exerciseId);
  const exRows = await database
    .get<import('../db/models').Exercise>('exercises')
    .query(Q.where('id', Q.oneOf(ids)))
    .fetch();
  await database.write(async () => {
    await database.batch(
      ...rows.map((r) =>
        r.prepareUpdate((p) => {
          p.hidden = false;
        }),
      ),
      ...exRows
        .filter((e) => !e.isCustom && e.isArchived)
        .map((e) =>
          e.prepareUpdate((rec) => {
            rec.isArchived = false;
          }),
        ),
    );
  });
  return rows.length;
}
