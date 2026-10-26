// @plm SRS-058  사용자 × 종목 선호 중 「플레이트 한쪽 무게로 입력」(ADR-037).
//
// 표시 이름과 같은 행(exercise_user_prefs, id = `pref-<exercise_id>`)의 다른 칸이다 — 계정과 함께 동기되고,
// 한 번 켜면 그 종목에서 계속 유지된다. 켜고 끄는 것은 앞으로 쓸 세트의 배수만 바꾼다(과거 세트는 저장된 배수로 의미 보존).
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { ExerciseUserPref } from '../db/models';
import { exercisePrefId } from '../db/models/ExerciseUserPref';

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
    });
  });
}
