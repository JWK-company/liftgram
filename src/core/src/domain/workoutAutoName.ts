// @plm SRS-071  빠른 운동 자동 이름 — 마친 운동이 모두 「빠른 운동」 으로 남아 기록 목록·피드에서 구분되지 않던 것(화면 정리 F7)
//
// 규칙: 완료한 워킹 세트가 많은 주 근육 상위 2개를 「·」로 잇고, 뒤에 종목 수 — 「가슴·삼두 · 2종목」.
// 주 근육이 없으면(맨몸·기타뿐) 「2종목」. 수행한 종목이 없으면 null(이름을 바꾸지 않는다).
// 사용자가 운동 중 이름을 바꿨으면 그 이름을 지킨다 — 기본 이름일 때만 바꾼다(새 완료분부터 · /qa spec L1~L3).
import { muscleLabel } from './labels';
import type { AppLanguage, MuscleGroup } from './types';

/** 빠른 운동이 시작될 때 붙는 기본 이름(저장소 startBlankWorkout·renameWorkout 의 폴백과 같다). */
export const DEFAULT_QUICK_WORKOUT_NAMES: readonly string[] = ['빠른 운동', 'Quick workout'];

export function isDefaultWorkoutName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  return n === '' || DEFAULT_QUICK_WORKOUT_NAMES.includes(n);
}

export interface AutoNameBlock {
  primaryMuscle: MuscleGroup | null;
  /** 완료한 워킹 세트 수(워밍업 제외). 0 이면 수행하지 않은 종목으로 본다. */
  workingSets: number;
}

export function autoWorkoutName(blocks: AutoNameBlock[], lang: AppLanguage = 'ko'): string | null {
  const done = blocks.filter((b) => b.workingSets > 0);
  if (done.length === 0) return null;
  const bySets = new Map<MuscleGroup, number>();
  for (const b of done) {
    if (!b.primaryMuscle || b.primaryMuscle === 'other') continue;
    bySets.set(b.primaryMuscle, (bySets.get(b.primaryMuscle) ?? 0) + b.workingSets);
  }
  // 세트가 같으면 먼저 한 종목의 부위가 앞(Map 은 넣은 순서를 지킨다 — sort 는 안정 정렬)
  const top = [...bySets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m]) => muscleLabel(m, lang));
  const count = lang === 'ko' ? `${done.length}종목` : `${done.length} exercise${done.length === 1 ? '' : 's'}`;
  return top.length ? `${top.join('·')} · ${count}` : count;
}
