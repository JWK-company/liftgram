"use client";
// @plm SRS-054 SRS-011  운동 홈 요약 — 이번 주 목표·연속일·볼륨 한 장 + 최근 운동 줄 (결정 D3 요약형)
//
// 지금까지 이번 주 목표·연속일은 캘린더 탭 안에 숨어 있었다. 홈 첫 화면이 일을 하도록 올린다.
// 계산은 캘린더와 같은 도메인 함수(computeStreak·weeklyProgress)와 같은 설정 키(계정과 함께 동기)다 —
// 두 화면이 다른 숫자를 말하지 않게. 목표·주말 설정 바꾸기는 캘린더(기록 › 달력)에 그대로 있다.
import {
  WEEKLY_GOAL_DEFAULT,
  WEEKLY_GOAL_MAX,
  WEEKLY_GOAL_MIN,
  computeStreak,
  dayNumber,
  formatWeight,
  weeklyProgress,
} from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { getPref, PREFS_EVENT } from "@/lib/prefs";
import { Icon } from "../ui/Icon";
// [원본] KpiRow 도 썼다 — 주간 요약 KPI 3칸(화면 정리 D8 로 한 줄 메타)
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";
import { MetaLine } from "../ui/quiet";
import { formatWorkoutDuration } from "@/lib/duration";
// [원본] import { Tag } from "../ui/primitives"; — 최근 운동 PR 칩(금색 글자로 바꿈)

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
interface WorkoutRow {
  id: string;
  name: string | null;
  startedAt: number;
  completedAt: number | null;
  totalVolumeKg: number;
  durationSeconds: number | null;
  prCount: number;
}

const GOAL_KEY = "liftgram.weeklyGoal";
const SKIP_WEEKENDS_KEY = "liftgram.streakSkipWeekends";

function useWorkouts() {
  const [repo, setRepo] = useState<AnalyticsRepo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/analyticsRepository").then((m) => !cancelled && setRepo(m));
    return () => {
      cancelled = true;
    };
  }, []);
  const models = useQueryData(() => (repo ? repo.queryWorkoutHistory() : null), [repo]);
  return useMemo(() => models.map((m) => m as unknown as WorkoutRow), [models]);
}

function usePrefsGoal() {
  const [goal, setGoal] = useState(WEEKLY_GOAL_DEFAULT);
  const [skipWeekends, setSkip] = useState(false);
  useEffect(() => {
    const read = () => {
      const g = Number.parseInt(getPref(GOAL_KEY) ?? "", 10);
      if (Number.isFinite(g)) setGoal(Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, g)));
      setSkip(getPref(SKIP_WEEKENDS_KEY) === "1");
    };
    read();
    window.addEventListener(PREFS_EVENT, read);
    return () => window.removeEventListener(PREFS_EVENT, read);
  }, []);
  return { goal, skipWeekends };
}

// biome-ignore lint/correctness/noUnusedVariables: 원복용 보존(코드 변경 보존 규칙)
function minutes(sec: number | null): string {
  return sec && sec > 0 ? t("common.minutesShort", { minutes: Math.round(sec / 60) }) : "-";
}

export function WeekSummary() {
  const { weightUnit } = useUser();
  const workouts = useWorkouts();
  const { goal, skipWeekends } = usePrefsGoal();
  // 오늘은 클라이언트에서만 확정한다(서버와 시간대가 다를 수 있다).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const s = useMemo(() => {
    const today = now ?? Date.now();
    const nums = workouts.map((w) => dayNumber(w.completedAt ?? w.startedAt));
    const todayNum = dayNumber(today);
    const week = weeklyProgress(nums, todayNum, goal);
    const streak = computeStreak(nums, todayNum, skipWeekends);
    // 이번 주(월요일부터) 볼륨·세션 — 주간 목표와 같은 경계.
    const d = new Date(today);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const thisWeek = workouts.filter((w) => (w.completedAt ?? w.startedAt) >= monday);
    const volume = thisWeek.reduce((a, w) => a + (w.totalVolumeKg || 0), 0);
    return {
      week,
      streak,
      volume,
      sessions: thisWeek.length,
      prs: thisWeek.reduce((a, w) => a + (w.prCount || 0), 0),
    };
  }, [workouts, goal, skipWeekends, now]);

  const pct = Math.min(100, s.week.goal > 0 ? (s.week.done / s.week.goal) * 100 : 0);

  // [원본] 카드 안에 제목 줄 + 막대 + KPI 3칸(라벨·값 두 줄) — 홈 첫 화면에서 카드 하나가 ≈170px 를 썼다(화면 정리 D8).
  //        원복 시 아래 주석의 옛 return 을 되살린다.
  // [개선] 제목 줄 + 얇은 막대 + 숫자 메타 한 줄(볼륨 · 세션 · PR 금색) @plm SRS-071
  return (
    <section
      data-testid="week-summary"
      className="mb-[var(--spacing-lg)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) px-[var(--spacing-lg)] py-[var(--spacing-md)]"
    >
      <a
        href="/calendar"
        className="flex items-center gap-[var(--spacing-sm)]"
        data-testid="week-summary-link"
      >
        <span className="font-bold text-[length:var(--text-md)]">{t("calendar.weeklyGoalTitle")}</span>
        {s.streak.current > 0 ? (
          <span className="flex items-center gap-[2px] text-(--color-ink2) text-[length:var(--text-sm)]">
            <Icon name="flame" size={14} color="var(--color-warn)" />
            {s.streak.current}
          </span>
        ) : null}
        <span className="ml-auto text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("calendar.weeklyProgress", { done: s.week.done, goal: s.week.goal })}
        </span>
        <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
      </a>
      <div className="mt-[6px] h-1.5 overflow-hidden rounded-full bg-(--color-surface-alt)">
        <div
          className="h-full rounded-full bg-(--color-brand) transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <MetaLine testId="week-summary-meta" className="mt-[6px]">
        <span className="whitespace-nowrap">{formatWeight(s.volume, weightUnit)}</span>
        <span className="whitespace-nowrap">{t("home.weekSessions", { count: s.sessions })}</span>
        {s.prs > 0 ? (
          <span className="whitespace-nowrap font-semibold text-(--color-pr)">{`PR ${s.prs}`}</span>
        ) : null}
      </MetaLine>
    </section>
  );
  /* [원본]
  return (
    <section
      data-testid="week-summary"
      className="mb-[var(--spacing-lg)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-lg)]"
    >
      <a
        href="/calendar"
        className="flex items-center gap-[var(--spacing-sm)]"
        data-testid="week-summary-link"
      >
        <span className="font-bold text-[length:var(--text-md)]">{t("calendar.weeklyGoalTitle")}</span>
        {s.streak.current > 0 ? (
          <span className="flex items-center gap-[2px] text-(--color-warn) text-[length:var(--text-sm)]">
            <Icon name="flame" size={15} color="var(--color-warn)" />
            {t("calendar.streakLabel")} {s.streak.current}
          </span>
        ) : null}
        <span className="ml-auto text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("calendar.weeklyProgress", { done: s.week.done, goal: s.week.goal })}
        </span>
        <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
      </a>
      <div className="mt-[var(--spacing-sm)] h-2 overflow-hidden rounded-full bg-(--color-surface-alt)">
        <div
          className="h-full rounded-full bg-(--color-brand) transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <KpiRow
        className="mt-[var(--spacing-lg)]"
        items={[
          { label: t("session.totalVolume"), value: formatWeight(s.volume, weightUnit) },
          { label: "세션", value: String(s.sessions) },
          { label: "PR", value: String(s.prs) },
        ]}
      />
    </section>
  );
  */
}

/** 최근 운동 — 마친 세션 세 줄. 누르면 기록 상세. */
export function RecentWorkouts() {
  const { weightUnit } = useUser();
  const workouts = useWorkouts();
  const recent = workouts.slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <div className="mt-[var(--spacing-xl)]" data-testid="recent-workouts">
      <SectionLabel title="최근 운동" right={<a href="/history">전체 ›</a>} />
      <ListGroup>
        {recent.map((w) => {
          const at = w.completedAt ?? w.startedAt;
          const date = new Date(at).toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "short",
          });
          return (
            <ListRow
              key={w.id}
              href={`/history/${w.id}`}
              title={w.name || t("analytics.workoutNameFallback")}
              // [원본] subtitle={`${date} · ${minutes(w.durationSeconds)} · ${formatWeight(w.totalVolumeKg, weightUnit)}`}
              // [개선] 시간이 1분 미만·없으면 그 조각을 뺀다(「· - ·」 금지 · P3 QA M1) @plm SRS-071
              subtitle={[
                date,
                formatWorkoutDuration(w.durationSeconds),
                formatWeight(w.totalVolumeKg, weightUnit),
              ]
                .filter(Boolean)
                .join(" · ")}
              // [원본] trailing={w.prCount > 0 ? <Tag label={`PR ${w.prCount}`} tone="pr" /> : undefined}
              // [개선] 칩 대신 금색 글자 — PR 의미는 금색 하나(화면 정리 공용 규칙) @plm SRS-071
              trailing={
                w.prCount > 0 ? (
                  <span className="whitespace-nowrap font-semibold text-(--color-pr) text-[length:var(--text-sm)]">{`PR ${w.prCount}`}</span>
                ) : undefined
              }
              chevron
            />
          );
        })}
      </ListGroup>
    </div>
  );
}
