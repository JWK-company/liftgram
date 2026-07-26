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
