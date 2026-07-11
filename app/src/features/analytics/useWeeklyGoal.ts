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
