// 처방 대 실제(SPEC-050 P4) — 코치가 보낸 루틴으로 한 운동 블록에서 「계획한 세트」와 「실제로 한 세트」를 줄마다 맞댄다.
//
// ── 근거 ────────────────────────────────────────────────────────────────────
//   계획 = 운동 블록에 복사된 workout_exercises.prescription(세트별 처방 · 루틴에서 시작할 때 복사 — REV-097 채택).
//          처방이 없으면 블록의 목표(target_sets·target_reps_min/max·target_weight_kg)로 일반 세트 N줄을 만든다.
//   실제 = 끝낸 세트(done === true)만, 세트 번호 순. done 이 null·없음이면 끝낸 세트가 아니다(리뷰 — 프리레이 줄을 실제로 세지 않게).
//   [원본] 짝 = 같은 순번끼리(1번 계획 ↔ 1번 실제) — 웜업을 건너뛰거나 더 하면 뒤 줄이 모두 밀렸다(리뷰)
//   [개선] 짝 = 묶음별 순번 — 준비 세트(계획 setType warmup·feeder ↔ 실제 is_warmup·set_type warmup·feeder)와
//          본 세트를 따로 줄 세워 그 안에서 순번으로 맞댄다. 처방에 없는 웜업(남는 준비 세트)은 「계획 밖」으로
//          준비 묶음 끝에 · 남는 본 세트는 맨 끝에 둔다(muscleLoad 의 웜업 판정과 같은 기준).
//
// ── 판단하지 않는다(ADR-028) ────────────────────────────────────────────────
//   「잘했다/못했다」가 아니라 사실만 — 횟수가 범위 안(hit)·아래(under)·위(over)·안 함(missed)·계획 밖(extra).
//   무게는 비교하지 않는다(처방 무게는 %1RM 처럼 기기가 그 자리에서 계산하는 값이 많다) — 화면이 나란히 보일 뿐이다.
import { sanitizePrescriptionValue, type PrescribedSet } from './prescription';

export interface ActualSetLike {
  weightKg: number | null;
  reps: number | null;
  rir?: number | null;
  done?: boolean | null;
  setNumber?: number | null;
  /** set_logs.is_warmup — 준비 세트 표시 */
  isWarmup?: boolean | null;
  /** set_logs.set_type — 처방 세트 종류(warmup·top·backoff…) · null = 비처방 세트 */
  setType?: string | null;
}

export type PlanVsActualStatus = 'hit' | 'under' | 'over' | 'missed' | 'extra' | 'done';

export interface PlanVsActualRow {
  index: number; // 0 부터
  plan: PrescribedSet | null;
  /** 처방이 없는 블록의 목표 무게(정규 kg) — 처방 줄의 고정 무게는 plan.loadKg */
  planWeightKg: number | null;
  actual: ActualSetLike | null;
  status: PlanVsActualStatus;
}

export interface PlanVsActual {
  rows: PlanVsActualRow[];
  planned: number;
  /** 계획 줄 가운데 실제로 한 줄 수 */
  done: number;
  /** 계획 줄 가운데 횟수가 범위 안인 줄 수(범위가 없으면 한 것으로 센다) */
  hit: number;
}

export interface BlockPlanInput {
  /** workout_exercises.prescription — 직렬화된 JSON 글자 또는 배열(서버 응답 · 로컬 모델 둘 다) */
  prescription: unknown;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
}

const MAX_ROWS = 30;

function pos(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** 블록의 계획 줄 — 처방이 있으면 처방, 없으면 목표로 만든 일반 세트. 둘 다 없으면 null(계획 없음). */
export function blockPlan(input: BlockPlanInput): { rows: PrescribedSet[]; weightKg: number | null } | null {
  let raw = input.prescription;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = null;
    }
  }
  const rx = sanitizePrescriptionValue(raw);
  if (rx) return { rows: rx.slice(0, MAX_ROWS), weightKg: null };
  const n = pos(input.targetSets);
  if (!n) return null;
  const repMin = pos(input.targetRepsMin);
  const repMax = pos(input.targetRepsMax);
  const row: PrescribedSet = { setType: 'normal', targetRir: null, repMin, repMax, loadHint: null };
  return {
    rows: Array.from({ length: Math.min(MAX_ROWS, Math.round(n)) }, () => ({ ...row })),
    weightKg: pos(input.targetWeightKg),
  };
}

function repsStatus(plan: PrescribedSet, reps: number | null): PlanVsActualStatus {
  if (plan.amrap) return reps && reps > 0 ? 'hit' : 'under';
  const lo = plan.repMin;
  const hi = plan.repMax;
  if (lo == null && hi == null) return 'done';
  const r = reps ?? 0;
  if (lo != null && r < lo) return 'under';
  if (hi != null && r > hi) return 'over';
  return 'hit';
}

const isPrepPlan = (p: PrescribedSet) => p.setType === 'warmup' || p.setType === 'feeder';
const isPrepActual = (a: ActualSetLike) => a.isWarmup === true || a.setType === 'warmup' || a.setType === 'feeder';

/** 계획 대 실제 — 계획이 없으면 null(화면이 줄을 그리지 않는다). */
export function planVsActual(input: BlockPlanInput & { sets: readonly ActualSetLike[] }): PlanVsActual | null {
  const plan = blockPlan(input);
  if (!plan) return null;
  // [원본] .filter((s) => s.done !== false) — done null(프리레이·옛 줄)도 실제로 셌다
  const done = input.sets
    .filter((s) => s.done === true)
    .slice()
    .sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
  // 묶음별 줄 — 준비 세트·본 세트
  const prepQ = done.filter(isPrepActual);
  const workQ = done.filter((a) => !isPrepActual(a));
  let prepAt = 0;
  let workAt = 0;
  type Draft = Omit<PlanVsActualRow, 'index'>;
  const drafts: Draft[] = [];
  let doneCount = 0;
  let hit = 0;
  const lastPrepPlan = plan.rows.reduce((last, p, i) => (isPrepPlan(p) ? i : last), -1);
  const extraPrep = (): Draft[] =>
    prepQ.slice(prepAt).map((a) => ({ plan: null, planWeightKg: null, actual: a, status: 'extra' as const }));
  if (lastPrepPlan < 0) {
    drafts.push(...extraPrep());
    prepAt = prepQ.length;
  }
  plan.rows.forEach((p, i) => {
    const a = isPrepPlan(p) ? (prepQ[prepAt++] ?? null) : (workQ[workAt++] ?? null);
    let status: PlanVsActualStatus;
    if (a) {
      status = repsStatus(p, a.reps);
      doneCount++;
      if (status === 'hit' || status === 'done') hit++;
    } else status = 'missed';
    drafts.push({ plan: p, planWeightKg: plan.weightKg, actual: a, status });
    if (i === lastPrepPlan) {
      drafts.push(...extraPrep());
      prepAt = prepQ.length;
    }
  });
  for (const a of workQ.slice(workAt)) drafts.push({ plan: null, planWeightKg: null, actual: a, status: 'extra' });
  const rows: PlanVsActualRow[] = drafts.slice(0, MAX_ROWS).map((d, index) => ({ index, ...d }));
  return { rows, planned: plan.rows.length, done: doneCount, hit };
}
