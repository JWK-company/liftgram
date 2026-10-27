// 슈퍼셋 「같은 번호」 짝짓기(순수 · /qa code M3) — 화면에 보이는 번호끼리 묶는다. @plm SRS-062
//
// 세트 번호(set_number)는 워밍업까지 센다. 화면은 일반 세트만 1·2·3 으로 세고 나머지는 W/D/F/T 로 보인다
// (ExerciseBlock 의 표시 규칙). 한쪽에만 워밍업이 있으면 set_number 로 짝지을 때 화면 「1」과 「2」가 함께 완료됐다.
// 그래서 짝 키 = 표시 규칙의 번호: 일반 세트 `n:k`, 탑셋 `t:k`(k 번째 T). 워밍업·드롭·실패는 짝이 없다(그 종목만).
export interface RoundSet {
  id: string;
  setNumber: number;
  isWarmup?: boolean | null;
  isDrop?: boolean | null;
  isFailed?: boolean | null;
  setType?: string | null;
}

function keys<T extends RoundSet>(sets: T[]): Map<string, string | null> {
  const sorted = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  let normal = 0;
  let top = 0;
  const out = new Map<string, string | null>();
  for (const s of sorted) {
    if (s.isWarmup || s.isDrop === true || s.isFailed) out.set(s.id, null);
    else if (s.setType === 'top') out.set(s.id, `t:${++top}`);
    else out.set(s.id, `n:${++normal}`);
  }
  return out;
}

/** 이 세트의 짝 키 — 워밍업·드롭·실패면 null(짝 없음). */
export function roundKeyOf(sets: RoundSet[], setId: string): string | null {
  return keys(sets).get(setId) ?? null;
}

/** 묶음 멤버마다 같은 키의 세트. 키가 null 이거나 짝이 없는 멤버는 빠진다. */
export function pickRoundSets<T extends RoundSet>(
  members: { workoutExerciseId: string; sets: T[] }[],
  key: string | null,
): { workoutExerciseId: string; setLogId: string; set: T }[] {
  if (!key) return [];
  const out: { workoutExerciseId: string; setLogId: string; set: T }[] = [];
  for (const m of members) {
    const k = keys(m.sets);
    const hit = m.sets.find((s) => k.get(s.id) === key);
    if (hit) out.push({ workoutExerciseId: m.workoutExerciseId, setLogId: hit.id, set: hit });
  }
  return out;
}

/** PR 칩 채움 대상(/qa code L1) — 워밍업이 아닌 첫 미완료 세트, 없으면 첫 미완료 세트. */
export function firstOpenWorkingSet<T extends { done: boolean | null; isWarmup?: boolean | null }>(sets: T[]): T | null {
  const open = sets.filter((s) => s.done !== true);
  return open.find((s) => !s.isWarmup) ?? open[0] ?? null;
}
