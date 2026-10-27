// @plm SRS-077 SRS-078  체중 이력 계산 — 최신값·목표까지 남은 차이·주간 변화·체크인 스텝, 그리고 미러 규칙(D-10)의 판정부.
//
// 「내 체중」 규칙은 하나다(D-10): measured_at 이 가장 큰 이력(동률이면 updated_at, 그다음 id)이고, 이력이 없으면 프로필 값.
// user_profiles.bodyweight_kg 는 그 값의 **캐시(미러)** 다. 미러를 맞추는 쓰기는 data/bodyweightRepository 한 곳이 하고,
// 무엇을 써야 하는지는 여기 순수 함수(planBodyweightMirror)가 정한다 — node 테스트로 고정할 수 있게(데코레이터 모델 불가).
// 문구는 평가·권고 없이 숫자만(웰니스 · guideCopy `bodyweight.`).
import { dayNumber } from './streak';
import { fromKg, toKg } from './units';
import type { WeightUnit } from './types';

/** 이력 출처 — null 은 manual(D-6). */
export type BodyweightLogSource = 'checkin' | 'manual' | 'legacy';

/** 이력 한 줄(모델 `_raw` 나 화면 값을 이 모양으로 넘긴다). */
export interface BodyweightLogLike {
  id: string;
  measuredAt: number | null | undefined;
  weightKg: number | null | undefined;
  /** 마지막으로 고친 시각(ms) — 동률 판정·옛 경로 흡수 판정 */
  updatedAt: number;
  source?: BodyweightLogSource | null;
}

/** 유효한 이력(측정 시각·무게가 있는 것)만 담은 모양 */
export interface ValidBodyweightLog extends BodyweightLogLike {
  measuredAt: number;
  weightKg: number;
}

/** 저장 가능한 체중 상한(kg) — 프로필 입력(NumberStepper max 300kg)과 같다. */
export const BODYWEIGHT_MAX_KG = 300;

/** 같은 체중으로 볼 오차(kg). lb 왕복·부동소수 차이를 흡수한다(0.01kg 보다 작게). */
export const BODYWEIGHT_EPSILON_KG = 0.005;

/** 체크인 스텝(표시 단위) — 시트의 [−1][−0.5][−0.1]/[+0.1][+0.5][+1] (lb 는 0.2·1·2). @plm SRS-078 */
export const BODYWEIGHT_STEPS: Record<WeightUnit, readonly [number, number, number]> = {
  kg: [0.1, 0.5, 1],
  lb: [0.2, 1, 2],
};

/** 주간 변화 창 — 최근 28일 */
export const WEEKLY_RATE_WINDOW_DAYS = 28;
/** 주간 변화를 계산하는 최소 기록 수(서로 다른 날 기준) */
export const WEEKLY_RATE_MIN_POINTS = 3;

const DAY_MS = 86_400_000;

export function isValidBodyweightKg(kg: number | null | undefined): kg is number {
  return typeof kg === 'number' && Number.isFinite(kg) && kg > 0 && kg <= BODYWEIGHT_MAX_KG;
}

export function isValidBodyweightLog(l: BodyweightLogLike): l is ValidBodyweightLog {
  return typeof l.measuredAt === 'number' && Number.isFinite(l.measuredAt) && isValidBodyweightKg(l.weightKg);
}

/** 최신 측정 쪽이 앞(음수)이 되는 비교 — measured_at ↓ · updated_at ↓ · id ↓(결정적). */
function newerFirst(a: ValidBodyweightLog, b: ValidBodyweightLog): number {
  return b.measuredAt - a.measuredAt || b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** 가장 최근에 **측정한** 이력(동률이면 나중에 고친 것). 유효한 이력이 없으면 null. */
export function latest<T extends BodyweightLogLike>(logs: readonly T[]): (T & ValidBodyweightLog) | null {
  let best: (T & ValidBodyweightLog) | null = null;
  for (const l of logs) {
    if (!isValidBodyweightLog(l)) continue;
    if (!best || newerFirst(l, best) < 0) best = l as T & ValidBodyweightLog;
  }
  return best;
}

/** 측정 시각 오름차순(그래프·목록용). 무효 행은 뺀다. */
export function sortBodyweightLogs<T extends BodyweightLogLike>(logs: readonly T[]): (T & ValidBodyweightLog)[] {
  return logs
    .filter((l): l is T & ValidBodyweightLog => isValidBodyweightLog(l))
    .sort((a, b) => -newerFirst(a, b));
}

/**
 * 「내 체중」(D-10) — 최신 측정 이력, 없으면 프로필 값. 볼륨 계산·체크인 「지난 값」·통계 카드가 모두 이 값을 쓴다.
 * (볼륨 계산은 이 값의 캐시인 프로필 미러를 읽는다 — 미러는 reconcileBodyweightMirror 가 맞춘다.)
 */
export function resolveBodyweightKg(
  profile: { bodyweightKg: number | null | undefined } | null | undefined,
  logs: readonly BodyweightLogLike[],
): number | null {
  const l = latest(logs);
  if (l) return l.weightKg;
  const p = profile?.bodyweightKg;
  return isValidBodyweightKg(p) ? p : null;
}

export interface GoalGap {
  /** 목표 − 현재(kg). 음수 = 목표가 더 가볍다 */
  remainingKg: number;
  /** |remainingKg| */
  absKg: number;
  /** 'reached' = 오차 0.05kg 안 */
  direction: 'up' | 'down' | 'reached';
}

/** 목표까지 남은 차이. 둘 중 하나라도 없으면 null. 평가 문구는 붙이지 않는다(웰니스). */
export function goalGap(currentKg: number | null | undefined, goalKg: number | null | undefined): GoalGap | null {
  if (!isValidBodyweightKg(currentKg) || !isValidBodyweightKg(goalKg)) return null;
  const remainingKg = goalKg - currentKg;
  const absKg = Math.abs(remainingKg);
  return { remainingKg, absKg, direction: absKg < 0.05 ? 'reached' : remainingKg > 0 ? 'up' : 'down' };
}

export interface WeeklyRate {
  /** 주당 변화(kg/주) — 최소제곱 기울기(kg/일) × 7 */
  kgPerWeek: number;
  /** 주당 변화(%) — 창 안 최신값 대비 */
  pctPerWeek: number;
  /** 계산에 쓴 날 수(같은 날 여러 번은 하루로 평균) */
  days: number;
}

/**
 * 최근 28일 주간 변화. 같은 날(로컬 날짜) 여러 번 잰 것은 그날 평균 한 점으로 합친다 —
 * 하루 안의 오르내림(아침·저녁)이 기울기를 크게 흔들지 않게. 서로 다른 날이 3개 미만이면 null.
 * x 는 로컬 날짜 일련번호(불규칙 간격 그대로), 창은 (now − 28일, now] 이다(미래 측정은 뺀다).
 */
export function weeklyRate(logs: readonly BodyweightLogLike[], now: number): WeeklyRate | null {
  const from = now - WEEKLY_RATE_WINDOW_DAYS * DAY_MS;
  const byDay = new Map<number, { sum: number; n: number }>();
  for (const l of logs) {
    if (!isValidBodyweightLog(l)) continue;
    if (l.measuredAt <= from || l.measuredAt > now) continue;
    const d = dayNumber(l.measuredAt);
    const cur = byDay.get(d) ?? { sum: 0, n: 0 };
    cur.sum += l.weightKg;
    cur.n += 1;
    byDay.set(d, cur);
  }
  if (byDay.size < WEEKLY_RATE_MIN_POINTS) return null;
  const pts = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([x, v]) => ({ x, y: v.sum / v.n }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const kgPerWeek = (sxy / sxx) * 7;
  const last = pts[n - 1].y;
  return { kgPerWeek, pctPerWeek: last > 0 ? (kgPerWeek / last) * 100 : 0, days: n };
}

/**
 * 체크인 스텝 한 번 — 표시 단위에서 더하고 소수 첫째 자리로 맞춘 뒤 kg 로 돌려준다(저장 kg).
 * 0 이하·상한 초과는 경계로 자른다. 「보이던 숫자 그대로면 쓰지 않음」은 화면이 blockUnit.enteredWeightToKg 로 한다(U-8).
 */
export function stepBodyweightKg(currentKg: number, step: number, unit: WeightUnit): number {
  const shown = Math.round(fromKg(currentKg, unit) * 10) / 10;
  const next = Math.round((shown + step) * 10) / 10;
  const max = Math.round(fromKg(BODYWEIGHT_MAX_KG, unit) * 10) / 10;
  const minStep = BODYWEIGHT_STEPS[unit][0];
  const clamped = Math.min(max, Math.max(minStep, next));
  return toKg(clamped, unit);
}

// ── 미러 규칙 판정부(D-10) ─────────────────────────────────────────────────

/** 첫 정리 때 프로필 값을 옮겨 심는 줄의 결정적 id — 기기 여럿이 같은 id 라 중복이 없다. */
export function bodyweightInitLogId(profileId: string): string {
  return `bw-init-${profileId}`;
}

/** 옛 경로(프로필 칸 직접 수정)를 흡수하는 줄의 결정적 id — 같은 수정을 본 기기들이 같은 줄을 만든다. */
export function bodyweightLegacyLogId(profileId: string, profileUpdatedAt: number): string {
  return `bw-legacy-${profileId}-${Math.floor(profileUpdatedAt)}`;
}

export interface MirrorProfile {
  id: string;
  bodyweightKg: number | null | undefined;
  /** 프로필 updated_at(ms) */
  updatedAt: number;
}

export interface MirrorPlan {
  /** 새로 심을 이력(legacy) — 없으면 null */
  create: { id: string; measuredAt: number; weightKg: number; source: 'legacy'; reason: 'init' | 'legacy' } | null;
  /** 정리 뒤 미러 값 */
  mirrorKg: number | null;
  /** 프로필 칸을 써야 하는가(값이 다를 때만 — 멱등) */
  updateMirror: boolean;
}

function sameKg(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= BODYWEIGHT_EPSILON_KG;
}

/**
 * 미러를 어떻게 맞출지 정한다(순수 · 멱등). 규칙:
 *  1. 유효 이력 0 ∧ 프로필 값 있음 → `bw-init-<profileId>` 한 줄(measured_at = 프로필 updated_at, source=legacy). 미러는 그대로.
 *  2. 이력 있음 ∧ 프로필 updated_at > 최신 이력 updated_at ∧ 값이 최신 이력과 다름 ∧ **어느 이력 값과도 다름** →
 *     옛 경로 수정으로 보고 `bw-legacy-<profileId>-<updated_at>` 한 줄로 흡수.
 *     「어느 이력 값과도 다름」은 스펙에 덧붙인 조건이다 — 다른 기기가 최신 이력을 받기 전의 **낡은 미러**를 다른 설정과 함께
 *     올리면(프로필은 행 전체를 올린다) updated_at 만 보고는 옛 경로 수정과 구분되지 않아 낡은 값이 「최신 측정」이 된다.
 *  3. 미러 = 위를 반영한 resolveBodyweightKg. 값이 같으면 쓰지 않는다.
 *  · `unavailableIds`: 이 기기에서 지운 표시가 남은 id(같은 id 로 다시 만들 수 없다). init 이 막히면 legacy id 로, legacy 가 막히면 심지 않는다.
 *  · 이력이 0 이고 프로필 값도 없으면 아무것도 하지 않는다(마지막 기록을 지운 뒤 = 미설정).
 *  · `allowCreate=false`: 서버 이력을 아직 다 받지 못한 기기(v26 첫 동기 전) — **아무것도 하지 않는다**. 심으면 서버에 이미 있는
 *    이력 옆에 bw-init 한 줄이 더 생기고(중복), 미러를 덮으면 옛 경로가 고친 값(흡수할 증거)이 사라진다. 동기 뒤 정리가 맡는다.
 */
export function planBodyweightMirror(
  profile: MirrorProfile,
  logs: readonly BodyweightLogLike[],
  unavailableIds: ReadonlySet<string> = new Set(),
  allowCreate = true,
): MirrorPlan {
  const valid = logs.filter(isValidBodyweightLog);
  const p = isValidBodyweightKg(profile.bodyweightKg) ? profile.bodyweightKg : null;
  let create: MirrorPlan['create'] = null;

  if (!allowCreate) return { create: null, mirrorKg: profile.bodyweightKg ?? null, updateMirror: false };
  if (!valid.length) {
    if (p != null) {
      const initId = bodyweightInitLogId(profile.id);
      const id = unavailableIds.has(initId) ? bodyweightLegacyLogId(profile.id, profile.updatedAt) : initId;
      if (!unavailableIds.has(id))
        create = { id, measuredAt: profile.updatedAt, weightKg: p, source: 'legacy', reason: id === initId ? 'init' : 'legacy' };
    }
  } else {
    const top = latest(valid) as ValidBodyweightLog;
    const legacyEdit =
      p != null &&
      profile.updatedAt > top.updatedAt &&
      !sameKg(p, top.weightKg) &&
      !valid.some((l) => sameKg(l.weightKg, p));
    if (legacyEdit) {
      const id = bodyweightLegacyLogId(profile.id, profile.updatedAt);
      if (!unavailableIds.has(id) && !valid.some((l) => l.id === id))
        create = { id, measuredAt: profile.updatedAt, weightKg: p as number, source: 'legacy', reason: 'legacy' };
    }
  }

  const after: BodyweightLogLike[] = create
    ? [...valid, { id: create.id, measuredAt: create.measuredAt, weightKg: create.weightKg, updatedAt: Number.MAX_SAFE_INTEGER }]
    : valid;
  const top = latest(after);
  // 이력이 하나도 없으면 미러는 프로필 값 그대로(심지 못한 경우 포함) — 지우는 쓰기(마지막 기록 삭제)만 null 로 만든다.
  const mirrorKg = top ? top.weightKg : p;
  const cur = profile.bodyweightKg ?? null;
  return { create, mirrorKg, updateMirror: !sameKg(cur, mirrorKg) };
}

/** 이력 쓰기(추가·수정·삭제) 직후 미러 값 — 남은 이력의 최신값, 하나도 없으면 null(「체중 미설정으로 돌아가요」 U-9). */
export function mirrorAfterLogWrite(logs: readonly BodyweightLogLike[]): number | null {
  return latest(logs)?.weightKg ?? null;
}
