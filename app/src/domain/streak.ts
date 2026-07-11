// 스트릭·주간 목표 계산 (SRS-011 책임감 루프). 완료 세션의 로컬 '날짜'만으로 순수 계산.
// @plm SRS-011  연속 운동일(streak)·이번 주 목표 진행 — 지속성 가시화 지표.

// 로컬 달력 날짜(Y/M/D)를 타임존 무관 정수 '일련번호'로 변환.
// Date.UTC로 로컬 날짜부품을 UTC자정 ms→/일ms → 연속 로컬 날짜가 연속 정수가 된다(DST/TZ 안전).
export function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export interface StreakStats {
  current: number; // 오늘(또는 어제)에서 이어지는 연속 운동일
  longest: number; // 역대 최장 연속 운동일
}

// dayNumbers=완료 세션들의 dayNumber(중복 허용), today=오늘의 dayNumber.
export function computeStreak(dayNumbers: number[], today: number): StreakStats {
  const uniq = [...new Set(dayNumbers)].sort((a, b) => a - b);
  if (uniq.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i] === uniq[i - 1] + 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  const set = new Set(uniq);
  // 오늘 아직 안 했어도 어제까지 이어졌으면 스트릭 유지(오늘 하면 연장, 이틀 비면 리셋).
  let anchor: number | null = null;
  if (set.has(today)) anchor = today;
  else if (set.has(today - 1)) anchor = today - 1;

  let current = 0;
  if (anchor != null) {
    let d = anchor;
    while (set.has(d)) {
      current += 1;
      d -= 1;
    }
  }
  return { current, longest };
}

export interface WeeklyProgress {
  done: number; // 이번 주(월~오늘) 운동한 '일수'
  goal: number;
  reached: boolean;
}

// 월요일 시작 주(analyticsRepository.weekStartMs와 동일 관례). done=이번 주 운동한 '고유 일수'.
export function weeklyProgress(dayNumbers: number[], today: number, goal: number): WeeklyProgress {
  const dow = new Date(today * 86400000).getUTCDay(); // 0=일 (today는 UTC자정 일련번호이므로 getUTCDay 안전)
  const mondayOffset = (dow + 6) % 7; // 월=0
  const weekStart = today - mondayOffset;
  const done = new Set(dayNumbers.filter((d) => d >= weekStart && d <= today)).size;
  return { done, goal, reached: done >= goal };
}

export const WEEKLY_GOAL_MIN = 1;
export const WEEKLY_GOAL_MAX = 7;
export const WEEKLY_GOAL_DEFAULT = 3; // 입문자 표준(주 3일)
