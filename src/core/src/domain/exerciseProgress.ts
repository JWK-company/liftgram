// 분석 탭 심화 분석 계산(SRS-101 · ADR-051) — 종목 변화 · 최고 기록이 그대로인 종목 · 근육별 주간 세트.
//
// 사실 숫자만 낸다. 평가·권고 문장은 여기에도 화면에도 없다(웰니스 규칙).
// 입력의 추정 1RM 은 저장소가 종목 상세 추세(getExercise1RMTrend)와 같은 식으로 만든다 — 줄을 눌러 들어간 화면과 숫자가 맞게.
import { setsByMuscle, MAP_MUSCLES, type MapMuscle, type MuscleLoadItem } from './muscleLoad';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** 이 차이보다 작으면 화면 숫자가 같아 「변화」로 치지 않는다(무게 표시 단위 0.5kg). */
export const MIN_CHANGE_KG = 0.5;
export const CHANGE_LIMIT = 5;
export const PLATEAU_LIMIT = 5;
export const PLATEAU_MIN_WEEKS = 4;
export const PLATEAU_MIN_SESSIONS = 3;
export const PLATEAU_ACTIVE_DAYS = 28;
export const WEEKLY_WEEKS = 8;

/** 종목별 운동 한 번의 최고 추정 1RM */
export interface E1rmPoint {
  exerciseId: string;
  atMs: number;
  value: number;
}

export interface ExerciseChange {
  exerciseId: string;
  firstKg: number;
  lastKg: number;
  changeKg: number;
  /** 첫 값 대비 % */
  changePct: number;
  sessions: number;
}

export interface ExerciseChanges {
  up: ExerciseChange[];
  down: ExerciseChange[];
  /** 기간에 두 번 이상 해서 비교한 종목 수 — 0 이면 「두 번 이상 한 종목 없음」, 아니면 「달라진 종목 없음」 */
  compared: number;
}

function byExercise(points: readonly E1rmPoint[]): Map<string, E1rmPoint[]> {
  const map = new Map<string, E1rmPoint[]>();
  for (const p of points) {
    if (!(p.value > 0)) continue;
    const list = map.get(p.exerciseId);
    if (list) list.push(p);
    else map.set(p.exerciseId, [p]);
  }
  for (const list of map.values()) list.sort((a, b) => a.atMs - b.atMs);
  return map;
}

/** 기간(sinceMs 이후, null = 전체) 첫 운동과 마지막 운동의 추정 1RM 비교. 변화율 절댓값이 큰 순. */
export function exerciseChanges(
  points: readonly E1rmPoint[],
  sinceMs: number | null,
  limit: number = CHANGE_LIMIT,
): ExerciseChanges {
  const inRange = sinceMs == null ? points : points.filter((p) => p.atMs >= sinceMs);
  const all: ExerciseChange[] = [];
  let compared = 0;
  for (const [exerciseId, list] of byExercise(inRange)) {
    if (list.length < 2) continue;
    compared += 1;
    const firstKg = list[0].value;
    const lastKg = list[list.length - 1].value;
    const changeKg = lastKg - firstKg;
    if (Math.abs(changeKg) < MIN_CHANGE_KG) continue;
    all.push({ exerciseId, firstKg, lastKg, changeKg, changePct: (changeKg / firstKg) * 100, sessions: list.length });
  }
  const byPct = (a: ExerciseChange, b: ExerciseChange) =>
    Math.abs(b.changePct) - Math.abs(a.changePct) || a.exerciseId.localeCompare(b.exerciseId);
  return {
    up: all.filter((c) => c.changeKg > 0).sort(byPct).slice(0, limit),
    down: all.filter((c) => c.changeKg < 0).sort(byPct).slice(0, limit),
    compared,
  };
}

export interface PlateauedExercise {
  exerciseId: string;
  bestKg: number;
  bestAtMs: number;
  /** 최고 기록을 세운 뒤 지난 주 수(내림) */
  weeks: number;
  /** 최고 기록 뒤에 한 운동 수 */
  sessionsSince: number;
}

/**
 * 최고 추정 1RM 을 세운 뒤 오래 지났지만 계속 하고 있는 종목. 전체 기록 기준(고른 기간과 무관).
 * 최고 갱신은 최근 PR(getRecentPRs)과 같이 조금이라도 높으면 갱신이다 — 같은 화면의 「최근 갱신」과 어긋나지 않게.
 */
export function plateauedExercises(points: readonly E1rmPoint[], nowMs: number, limit: number = PLATEAU_LIMIT): PlateauedExercise[] {
  const out: PlateauedExercise[] = [];
  for (const [exerciseId, list] of byExercise(points)) {
    let bestKg = 0;
    let bestAtMs = 0;
    let sessionsSince = 0;
    for (const p of list) {
      if (p.value > bestKg + 1e-6) {
        bestKg = p.value;
        bestAtMs = p.atMs;
        sessionsSince = 0;
      } else {
        sessionsSince += 1;
      }
    }
    const lastAt = list[list.length - 1].atMs;
    if (nowMs - lastAt > PLATEAU_ACTIVE_DAYS * DAY_MS) continue; // 그만둔 종목은 그대로인 게 아니다
    const weeks = Math.floor((nowMs - bestAtMs) / WEEK_MS);
    if (weeks < PLATEAU_MIN_WEEKS || sessionsSince < PLATEAU_MIN_SESSIONS) continue;
    out.push({ exerciseId, bestKg, bestAtMs, weeks, sessionsSince });
  }
  return out.sort((a, b) => a.bestAtMs - b.bestAtMs || a.exerciseId.localeCompare(b.exerciseId)).slice(0, limit);
}

/** 로컬 시각 월요일 0시 */
export function localWeekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** 이번 주를 끝 칸으로 하는 주 시작 시각 목록(오래된 순). 날짜로 빼서 서머타임에도 월요일 0시를 지킨다. */
export function recentWeekStarts(nowMs: number, weeks: number = WEEKLY_WEEKS): number[] {
  const thisWeek = localWeekStart(nowMs);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return d.getTime();
  });
}

export interface WeeklyMuscleItem extends MuscleLoadItem {
  atMs: number;
}

export interface WeeklyMuscleSets {
  /** 주 시작 시각(오래된 순 · 끝 칸 = 이번 주) */
  weeks: number[];
  /** 세트가 있는 근육만, 많은 순 */
  rows: { muscle: MapMuscle; sets: number[] }[];
  /** 전신 종목 세트(지도 근육이 아니라 따로) */
  fullBody: number[];
}

/** 주별 근육 세트 — 세트 계산은 근육 균형 카드와 같은 setsByMuscle(주근육 1 · 보조근 0.5 · 워밍업·실패 제외). */
export function weeklyMuscleSets(items: readonly WeeklyMuscleItem[], nowMs: number, weeks: number = WEEKLY_WEEKS): WeeklyMuscleSets {
  const starts = recentWeekStarts(nowMs, weeks);
  const buckets = starts.map(() => [] as WeeklyMuscleItem[]);
  for (const it of items) {
    const i = starts.indexOf(localWeekStart(it.atMs));
    if (i >= 0) buckets[i].push(it);
  }
  const loads = buckets.map((b) => setsByMuscle(b));
  const rows = MAP_MUSCLES.map((muscle) => ({ muscle, sets: loads.map((l) => l.byMuscle[muscle]) }))
    .filter((r) => r.sets.some((n) => n > 0))
    .map((r) => ({ r, total: r.sets.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .map(({ r }) => r);
  return { weeks: starts, rows, fullBody: loads.map((l) => l.fullBody) };
}
