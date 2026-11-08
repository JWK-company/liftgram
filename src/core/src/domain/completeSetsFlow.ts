// 세트 완료 흐름 하나로(SPEC-017 §10 · rev2 H-4 · 2차 M-7) — 화면(ExerciseBlock·ActiveWorkout)과 잠금 카드 drain(Phase 3)이 같이 쓴다.
//
// ① 완료(완료 시각 = at · 이미 완료된 세트는 시각을 덮지 않는다 — 판정과 쓰기가 같은 write 안)
// ② 처방 다시 채우기 — planRoundFills(시뮬레이션 planLockQueueValues 와 **같은 함수**). 이미 완료한 멤버로도 다시 채우는 화면 동작 그대로.
// ③ 휴식은 값으로 돌려주기만 한다(restSec) — 화면은 이 값으로 startRest 를 부르고 drain 은 무시한다.
// 축하(PR)·제안 칩은 화면 전용이라 이 흐름 밖에 둔다. 저장소는 주입한다(DB 없는 단위 테스트 · node 메모리 DB 테스트).
import { planRoundFills, type SimBlock } from './lockScreen';
import type { LoadFill } from './prescription';
import { restSecondsForSetType, restSecondsForRx, type PrescribedSetType } from './prescription';

export interface CompleteSetsRepo {
  completeSupersetRound(
    entries: { setLogId: string; weightKg?: number; reps?: number }[],
    done: boolean,
    completedAt?: number,
  ): Promise<string[]>;
  loadSimBlocks(workoutExerciseIds: string[]): Promise<(SimBlock & { restSec: number })[]>;
  /** 실제로 쓴 세트 id 를 돌려준다(그 사이 사람이 고친 세트는 건너뛴다). */
  applyLoadFills(fills: { setLogId: string; weightKg: number }[]): Promise<string[]>;
  /** 튀는 기록 판정(SPEC-044) — 있으면 완료 직후·채우기 전에 부른다(확인 필요 세트는 채우기 근거가 되지 않는다 · 잠금 drain 도 같은 길) */
  judgeSetSuspect?(setId: string, opts?: { values?: { weightKg?: number; reps?: number } }): Promise<unknown>;
}

export interface CompleteSetsInput {
  /** 관련 블록(묶음이면 멤버 전부 · 화면 묶음 순서). */
  workoutExerciseIds: string[];
  /** 완료할 세트 — 이미 완료된 것은 저장소가 건너뛴다(noop). */
  setIds: string[];
  /** 처방 다시 채우기 기준 세트(라운드 전부 · 이미 완료한 짝 포함). 없으면 setIds. */
  fillSetIds?: string[];
  /** 완료 시각(잠금 중 누른 시각 — 호출자가 clampCompletedAt 으로 자른다). */
  at: number;
  /** 휴식 기준 세트(누른 칸). 없으면 setIds[0]. */
  pressedSetId?: string;
  /** 화면 입력 중 값 — 채우기 계산에 쓴다. writeValues 면 완료와 같은 write 로 저장도 한다(사람 입력 · 출처 user). */
  values?: Map<string, { weightKg?: number; reps?: number }>;
  writeValues?: boolean;
  /** 완료 쓰기가 끝난 직후(채우기 계산 전) — 화면이 휴식을 바로 건다(REV-005 화면 M-1). */
  onCompleted?: (changed: string[]) => void;
}

export interface CompleteSetsResult {
  /** 이번에 상태가 바뀐 세트(빈 배열 = 전부 이미 완료 — noop). */
  changed: string[];
  restSec: number;
  fills: (LoadFill & { weId: string })[];
  /** 채우기가 실패했으면 그 오류(완료는 끝났다 · 진단 로그용). */
  fillError?: unknown;
}

export async function completeSetsFlow(repo: CompleteSetsRepo, input: CompleteSetsInput): Promise<CompleteSetsResult> {
  const values = input.values ?? new Map();
  const entries = input.setIds.map((id) => {
    const v = input.writeValues ? values.get(id) : undefined;
    return { setLogId: id, weightKg: v?.weightKg, reps: v?.reps };
  });
  const changed = await repo.completeSupersetRound(entries, true, input.at);
  try {
    input.onCompleted?.(changed);
  } catch {
    // 화면 콜백 실패는 흐름과 무관
  }
  // 튀는 기록 판정 — 완료한 세트만 · 화면값으로 · 실패해도 흐름은 그대로(SPEC-044 · REV-079 C-4·D-8)
  if (repo.judgeSetSuspect) {
    for (const id of changed) {
      try {
        await repo.judgeSetSuspect(id, { values: values.get(id) });
      } catch {
        // 판정 실패는 완료·채우기와 무관
      }
    }
  }
  // 완료 뒤 상태로 다시 읽는다 — 시뮬레이션도 「완료 표시 → 채우기」 순서다.
  // 채우기 실패는 완료를 깨지 않는다(옛 화면이 try/catch 로 삼키던 것 · REV-005 화면 H-1) — 완료 실패만 던진다.
  // [원본] const blocks = await repo.loadSimBlocks(…); const fills = planRoundFills(…); await repo.applyLoadFills(fills);
  let blocks: (SimBlock & { restSec: number })[] = [];
  let fills: (LoadFill & { weId: string })[] = [];
  let fillError: unknown = null;
  try {
    blocks = await repo.loadSimBlocks(input.workoutExerciseIds);
    const planned = planRoundFills(blocks, input.fillSetIds ?? input.setIds, values);
    const applied = new Set(await repo.applyLoadFills(planned));
    fills = planned.filter((f) => applied.has(f.setLogId));
  } catch (e) {
    fillError = e;
  }
  const pressed = input.pressedSetId ?? input.setIds[0];
  const block = blocks.find((b) => b.sets.some((s) => s.id === pressed));
  const set = block?.sets.find((s) => s.id === pressed);
  // [원본] const restSec = block && set ? restSecondsForSetType((set.setType ?? null) as PrescribedSetType | null, block.restSec) : 0;
  // [개선] 다음 세트가 드롭이면 쉬지 않는다 — 드롭은 무게만 내려 바로 잇는다(SPEC-041)
  // [개선] 처방이 드롭인 줄로 좁힌다 — 손으로 드롭을 표시해 쓰던 루틴의 휴식은 그대로(REV-076 화면 M-6)
  const sorted = block ? [...block.sets].sort((a, b) => a.setNumber - b.setNumber) : [];
  const setIdx = set ? sorted.findIndex((x) => x.id === set.id) : -1;
  const nextIdx = setIdx >= 0 ? sorted.findIndex((x, i) => i > setIdx && x.done !== true) : -1;
  const nextRxDrop = nextIdx >= 0 && block?.rx?.[nextIdx]?.setType === 'drop' && sorted[nextIdx].isDrop === true;
  const restSec =
    block && set
      ? nextRxDrop && set.isWarmup !== true
        ? 0
        : // [원본] restSecondsForSetType(…) — 세트 방식 근력 줄은 최소 180초(REV-076 코치 7)
          restSecondsForRx((set.setType ?? null) as PrescribedSetType | null, block.restSec, block.rx?.[setIdx] ?? null)
      : 0;
  return { changed, restSec, fills, fillError };
}
