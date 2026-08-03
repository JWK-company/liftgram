// 주단위 스케줄·블록(디로딩) — 요일→루틴 매핑과 블록 주차 계산 (순수 로직·테스트 대상). @plm SRS-044
// 디로딩 주의 볼륨 조정은 자동 산출하지 않는다 — 표시만 하고 값은 루틴 작성자(사람)가 정한다(ADR-028).
// 요일 인덱스는 월=0(한국 관습). JS Date.getDay()(일=0)와의 보정은 이 모듈이 담당한다.
// 주차 계산은 ms 나눗셈(KR 무DST 전제 — 웰니스 수준 정확도, 회계 아님)을 사용한다.

export type ScheduleDay = string | 'rest' | null; // routineId | 휴식 | 미배정

export interface WeeklySchedule {
  days: ScheduleDay[]; // 길이 7 · 월=0
  blockWeeks: number | null; // 운동 주 수(4/5/6). null=블록 없음(디로딩 없음)
  blockStartAt: number | null; // 블록 시작 ms. 최초 설정·주기 변경 시 기록(모듈로 롤오버 — 불변=이력 보존)
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function sanitizeWeeklySchedule(raw: unknown): WeeklySchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const rawDays = Array.isArray(o.days) ? o.days : [];
  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = rawDays[i];
    return d === 'rest' ? 'rest' : typeof d === 'string' && d.length > 0 ? d : null;
  });
  const bw = o.blockWeeks;
  const blockWeeks = typeof bw === 'number' && Number.isFinite(bw) && bw >= 1 ? Math.round(bw) : null;
  const bs = o.blockStartAt;
  const blockStartAt = typeof bs === 'number' && Number.isFinite(bs) && bs > 0 ? bs : null;
  const hasAny = days.some((d) => d !== null) || blockWeeks != null;
  return hasAny ? { days, blockWeeks, blockStartAt } : null;
}

// 오늘 계획 — 월=0 보정: JS getDay() 일=0 → (getDay()+6)%7.
export type TodayPlan = { kind: 'routine'; routineId: string } | { kind: 'rest' } | { kind: 'none' };

export function todayPlan(schedule: WeeklySchedule | null, now: number): TodayPlan {
  if (!schedule) return { kind: 'none' };
  const dayIdx = (new Date(now).getDay() + 6) % 7;
  const entry = schedule.days[dayIdx] ?? null;
  if (entry === 'rest') return { kind: 'rest' };
  if (typeof entry === 'string' && entry.length > 0) return { kind: 'routine', routineId: entry };
  return { kind: 'none' };
}

// ── 놓친 루틴 캐치업 (두 카드 UX) ────────────────────────────────────
// "가장 최근의 루틴 배정일(오늘 제외·최대 6일 역추적)에 완료 운동이 0건"이면 그 루틴을 캐치업 후보로.
// 배정일에 무엇이든 완료했으면(다른 루틴이어도) 대체 수행으로 보고 null(오탐·잔소리 방지).
// 여러 날을 놓쳤어도 가장 최근 1건만 — 밀린 카드가 쌓이면 동기부여가 아니라 죄책감 UX가 된다.
export interface MissedPlan {
  routineId: string;
  dayIdx: number; // 놓친 요일(월=0)
  daysAgo: number; // 1=어제
}

export function missedCatchUp(
  schedule: WeeklySchedule | null,
  completedDayNums: ReadonlySet<number>, // dayNumber(완료 시각) 집합 (streak.dayNumber 관례)
  now: number,
): MissedPlan | null {
  if (!schedule) return null;
  for (let ago = 1; ago <= 6; ago += 1) {
    const ms = now - ago * 24 * 60 * 60 * 1000;
    const dayIdx = (new Date(ms).getDay() + 6) % 7;
    const entry = schedule.days[dayIdx] ?? null;
    if (entry === 'rest' || entry == null) continue; // 휴식·미배정일은 놓친 게 아님 — 더 과거로
    return completedDayNums.has(dayNumberOf(ms)) ? null : { routineId: entry, dayIdx, daysAgo: ago };
  }
  return null;
}

// streak.dayNumber와 동일 관례(로컬 달력일 일련번호) — 순환 import 회피용 내부 사본.
function dayNumberOf(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// 현재 블록 주차 — 사이클 = blockWeeks(운동) + 1(디로딩). 모듈로 롤오버(blockStartAt 불변).
export interface BlockWeekInfo {
  week: number; // 1-based (사이클 내)
  cycleWeeks: number; // blockWeeks + 1
  isDeload: boolean; // 마지막 주 = 디로딩
}

export function currentBlockWeek(schedule: WeeklySchedule | null, now: number): BlockWeekInfo | null {
  if (!schedule || schedule.blockWeeks == null || schedule.blockStartAt == null) return null;
  if (now < schedule.blockStartAt) return null;
  const cycleWeeks = schedule.blockWeeks + 1;
  const weeksSince = Math.floor((now - schedule.blockStartAt) / WEEK_MS);
  const week = (weeksSince % cycleWeeks) + 1;
  return { week, cycleWeeks, isDeload: week === cycleWeeks };
}
