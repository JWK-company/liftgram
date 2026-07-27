// 주간 운동 목표(주 N일) 로컬 영속화 (SRS-011). 기기-로컬 설정 — 스키마 마이그레이션/싱크 불필요.
import { useEffect, useState } from 'react';
import { getPref, setPref } from '../../sync/prefs';
import { WEEKLY_GOAL_DEFAULT, WEEKLY_GOAL_MAX, WEEKLY_GOAL_MIN } from '../../domain';

const KEY = 'liftgram.weeklyGoal';

function clamp(n: number): number {
  return Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, Math.round(n)));
}

export function useWeeklyGoal(): [number, (n: number) => void] {
  const [goal, setGoalState] = useState(WEEKLY_GOAL_DEFAULT);

  useEffect(() => {
    let active = true;
    getPref(KEY).then((v) => {
      const n = v ? parseInt(v, 10) : NaN;
      if (active && Number.isFinite(n)) setGoalState(clamp(n));
    });
    return () => {
      active = false;
    };
  }, []);

  const setGoal = (n: number) => {
    const c = clamp(n);
    setGoalState(c);
    setPref(KEY, String(c));
  };

  return [goal, setGoal];
}

const MANUAL_DAYS_KEY = 'liftgram.manualWorkoutDays';

// '이 날도 운동 했어요' 수동 표시일(dayNumber 배열) — 앱으로 기록 못한 운동일의 보조 마커.
// 기록 세션과 다른 색 점으로 표시(통계·스트릭 미반영 — 표시 전용). 기기-로컬 설정. @plm SRS-011
export function useManualWorkoutDays(): [Set<number>, (dayNum: number, add: boolean) => void] {
  const [days, setDays] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    getPref(MANUAL_DAYS_KEY).then((v) => {
      if (!active || !v) return;
      try {
        const arr: unknown = JSON.parse(v);
        if (Array.isArray(arr)) setDays(new Set(arr.filter((x): x is number => Number.isFinite(x))));
      } catch {
        // 손상된 값은 무시(빈 상태로 시작)
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = (dayNum: number, add: boolean) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (add) next.add(dayNum);
      else next.delete(dayNum);
      setPref(MANUAL_DAYS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return [days, toggle];
}

const SKIP_WEEKENDS_KEY = 'liftgram.streakSkipWeekends';

// 연속운동일 스트릭에서 주말을 제외할지(주말만 쉰 건 연속 유지) — 기기-로컬 설정.
export function useStreakSkipWeekends(): [boolean, (v: boolean) => void] {
  const [skip, setSkipState] = useState(false);

  useEffect(() => {
    let active = true;
    getPref(SKIP_WEEKENDS_KEY).then((v) => {
      if (active && v != null) setSkipState(v === '1');
    });
    return () => {
      active = false;
    };
  }, []);

  const setSkip = (v: boolean) => {
    setSkipState(v);
    setPref(SKIP_WEEKENDS_KEY, v ? '1' : '0');
  };

  return [skip, setSkip];
}
