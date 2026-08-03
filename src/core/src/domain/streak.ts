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

// 요일 판정(TZ 안전) — dayNumber는 UTC자정 일련번호이므로 getUTCDay(0=일·6=토).
function isWeekend(dayNum: number): boolean {
  const dow = new Date(dayNum * 86400000).getUTCDay();
  return dow === 0 || dow === 6;
}

// prev ≤ next. 두 날 사이(배타적)에 '요구되는 날'이 하나도 비어 있지 않으면 연결(스트릭 유지).
// skipWeekends면 주말은 요구되지 않는 날 → 주말만으로 이뤄진 공백은 스트릭을 끊지 않는다
// (평일이 하루라도 비면 끊김). 주말에 운동하면 그 자체는 정상적으로 카운트된다.
function isConnected(prev: number, next: number, skipWeekends: boolean): boolean {
  for (let d = prev + 1; d < next; d += 1) {
    if (!skipWeekends || !isWeekend(d)) return false;
  }
  return true;
}

// dayNumbers=완료 세션들의 dayNumber(중복 허용), today=오늘의 dayNumber.
// skipWeekends=true면 '연속'을 주말 제외로 판정(주말만 쉰 건 연속 유지).
export function computeStreak(dayNumbers: number[], today: number, skipWeekends = false): StreakStats {
  const uniq = [...new Set(dayNumbers)].sort((a, b) => a - b);
  if (uniq.length === 0) return { current: 0, longest: 0 };

  // 최장 — 연결된 운동일의 최대 연속 길이.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i += 1) {
    if (isConnected(uniq[i - 1], uniq[i], skipWeekends)) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // 현재 — 가장 최근 운동일이 오늘과 연결돼 있으면(오늘 미완료는 유예) 그 체인 길이.
  const last = uniq[uniq.length - 1];
  let current = 0;
  if (last <= today && isConnected(last, today, skipWeekends)) {
    current = 1;
    for (let i = uniq.length - 1; i > 0; i -= 1) {
      if (isConnected(uniq[i - 1], uniq[i], skipWeekends)) current += 1;
      else break;
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
