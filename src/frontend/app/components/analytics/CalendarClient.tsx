"use client";
// @plm SRS-011  캘린더 탭 — app의 features/analytics/CalendarTabScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// "언제 · 얼마나 · 무엇으로" 운동했는지 한 달 단위로 보여 준다. 숫자를 늘리는 화면이 아니라
// **끊기지 않게 하는 화면**이다 — 그래서 연속일과 이번 주 목표가 맨 위에 있다.
//
// 날짜 셀의 점 세 가지:
//   파랑  앱으로 기록한 세션이 있는 날
//   초록  앱 없이 한 운동을 **직접 표시**한 날(수동 표시 — 통계·스트릭에는 넣지 않는다)
//   회색  메모만 있는 날
//
// 스트릭·주간 진행은 도메인이 계산한다(computeStreak·weeklyProgress). 주말 제외 여부는
// 기기-로컬 설정이라 localStorage에 둔다(app과 같은 키).
// ─────────────────────────────────────────────────────────────────────────────
import {
  WEEKLY_GOAL_DEFAULT,
  WEEKLY_GOAL_MAX,
  WEEKLY_GOAL_MIN,
  computeStreak,
  dayNumber,
  formatWeight,
  weeklyProgress,
} from "@app/core";
import { CALENDAR_NOTE_MAX_LEN } from "@app/core/db/models/_sanitizers";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { getPref, setPref } from "@/lib/prefs";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText, Card, Tag } from "../ui/primitives";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");

interface WorkoutRow {
  id: string;
  name: string | null;
  completedAt: number | null;
  startedAt: number;
  totalVolumeKg: number;
  durationSeconds: number | null;
  prCount: number;
}

const GOAL_KEY = "liftgram.weeklyGoal";
const SKIP_WEEKENDS_KEY = "liftgram.streakSkipWeekends";

/** 하루를 가리키는 열쇠 — 로컬 시간 기준이다(자정을 넘겨 기록해도 그 날로 묶이게). */
function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarClient() {
  const { weightUnit, user, manualWorkoutDays, calendarNotes, refresh } = useUser();
  const toast = useToast();
  const [repo, setRepo] = useState<AnalyticsRepo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/analyticsRepository").then((m) => !cancelled && setRepo(m));
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useQueryData(() => (repo ? repo.queryWorkoutHistory() : null), [repo]);
  const workouts: WorkoutRow[] = useMemo(() => models.map((m) => m as unknown as WorkoutRow), [models]);

  // 기기-로컬 설정 — 서버에 보낼 것도, 스키마에 넣을 것도 아니다.
  const [weeklyGoal, setWeeklyGoalState] = useState(WEEKLY_GOAL_DEFAULT);
  const [skipWeekends, setSkipWeekendsState] = useState(false);
  useEffect(() => {
    const g = Number.parseInt(getPref(GOAL_KEY) ?? "", 10);
    if (Number.isFinite(g)) setWeeklyGoalState(Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, g)));
    setSkipWeekendsState(getPref(SKIP_WEEKENDS_KEY) === "1");
  }, []);
  const setWeeklyGoal = (n: number) => {
    const c = Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, Math.round(n)));
    setWeeklyGoalState(c);
    setPref(GOAL_KEY, String(c));
  };
  const setSkipWeekends = (v: boolean) => {
    setSkipWeekendsState(v);
    setPref(SKIP_WEEKENDS_KEY, v ? "1" : "0");
  };

  const manualSet = useMemo(() => new Set(manualWorkoutDays), [manualWorkoutDays]);

  const byDay = useMemo(() => {
    const m = new Map<string, WorkoutRow[]>();
    for (const w of workouts) {
      const key = dayKeyOf(w.completedAt ?? w.startedAt);
      const arr = m.get(key);
      if (arr) arr.push(w);
      else m.set(key, [w]);
    }
    return m;
  }, [workouts]);

  // 오늘은 클라이언트에서만 확정한다(서버와 시간대가 다를 수 있다).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!now) return;
    setView((v) => v ?? { y: now.getFullYear(), m: now.getMonth() });
    setSelected((s) => s ?? dayKeyOf(now.getTime()));
  }, [now]);

  const { streak, week } = useMemo(() => {
    const nums = workouts.map((w) => dayNumber(w.completedAt ?? w.startedAt));
    const todayNum = dayNumber(now?.getTime() ?? Date.now());
    return {
      streak: computeStreak(nums, todayNum, skipWeekends),
      week: weeklyProgress(nums, todayNum, weeklyGoal),
    };
  }, [workouts, weeklyGoal, skipWeekends, now]);

  const [noteDraft, setNoteDraft] = useState("");
  const selectedDate = useMemo(() => {
    if (!selected) return null;
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y, m, d);
  }, [selected]);
  const selectedDayNum = selectedDate ? dayNumber(selectedDate.getTime()) : 0;
  useEffect(() => setNoteDraft(calendarNotes[String(selectedDayNum)] ?? ""), [selectedDayNum, calendarNotes]);

  const saveSetting = async (patch: Record<string, unknown>) => {
    if (!user) return;
    try {
      const userRepo = await import("@app/core/data/userRepository");
      await userRepo.updateUserSettings(user.id, patch);
      const { flushLocalDb } = await import("@/lib/localDb");
      await flushLocalDb();
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  // 서버 렌더 시점에는 오늘이 없다 — 달력이 흔들리지 않게 그때는 그리지 않는다.
  if (!now || !view || !selected || !selectedDate) return null;

  const todayKey = dayKeyOf(now.getTime());
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString("ko-KR", { weekday: "narrow" }),
  );

  // 1일이 무슨 요일인지에 따라 앞을 비운다. 뒤는 비울 필요가 없다 —
  // 셀 폭이 정확히 1/7이라 줄바꿈이 알아서 맞는다(RN에서는 채워야 했다).
  const startPad = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthPrefix = `${view.y}-${view.m}-`;
  const monthEntries = [...byDay.entries()].filter(([k]) => k.startsWith(monthPrefix));
  // 수동 표시일도 "운동한 날"로 센다 — 다만 세션 수·볼륨에는 넣지 않는다(수행 내용이 없으므로).
  let monthManual = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    if (
      !byDay.has(`${view.y}-${view.m}-${d}`) &&
      manualSet.has(dayNumber(new Date(view.y, view.m, d).getTime()))
    )
      monthManual += 1;
  }
  const monthDaysTotal = monthEntries.length + monthManual;
  const monthSessions = monthEntries.reduce((n, [, ws]) => n + ws.length, 0);

  const selectedWorkouts = byDay.get(selected) ?? [];
  const selectedLabel = selectedDate.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const barPct = Math.min(100, week.goal > 0 ? (week.done / week.goal) * 100 : 0);
  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <AppText variant="display" className="mb-[var(--spacing-md)] block">
        {t("nav.calendar")}
      </AppText>

      {/* 연속일 + 이번 주 목표 */}
      <Card className="mb-[var(--spacing-sm)]">
        <div className="flex items-stretch">
          <div className="min-w-[92px]">
            <div className="flex items-center gap-[var(--spacing-xs)]">
              <Icon
                name="flame"
                size={22}
                color={streak.current > 0 ? "var(--color-warn)" : "var(--color-ink3)"}
              />
              <AppText variant="title" data-testid="streak-current">
                {String(streak.current)}
              </AppText>
            </div>
            <AppText variant="caption" color="textMuted" className="block">
              {t("calendar.streakLabel")}
            </AppText>
            {streak.longest > 1 ? (
              <AppText variant="caption" color="textFaint" className="mt-[2px] block">
                {t("calendar.longest", { days: streak.longest })}
              </AppText>
            ) : null}
          </div>

          <div className="mx-[var(--spacing-md)] w-px bg-(--color-line)" />

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <AppText variant="label" color="textMuted">
                {t("calendar.weeklyGoalTitle")}
              </AppText>
              <div className="flex items-center gap-[var(--spacing-sm)]">
                <button
                  type="button"
                  aria-label="목표 줄이기"
                  disabled={weeklyGoal <= WEEKLY_GOAL_MIN}
                  onClick={() => setWeeklyGoal(weeklyGoal - 1)}
                  className="disabled:opacity-45"
                >
                  <Icon
                    name="remove-circle"
                    size={22}
                    color={weeklyGoal <= WEEKLY_GOAL_MIN ? "var(--color-ink3)" : "var(--color-brand)"}
                  />
                </button>
                <AppText variant="label" className="font-bold" data-testid="weekly-goal">
                  {t("calendar.goalDays", { days: weeklyGoal })}
                </AppText>
                <button
                  type="button"
                  aria-label="목표 늘리기"
                  disabled={weeklyGoal >= WEEKLY_GOAL_MAX}
                  onClick={() => setWeeklyGoal(weeklyGoal + 1)}
                  className="disabled:opacity-45"
                >
                  <Icon
                    name="add-circle"
                    size={22}
                    color={weeklyGoal >= WEEKLY_GOAL_MAX ? "var(--color-ink3)" : "var(--color-brand)"}
                  />
                </button>
              </div>
            </div>
            <div className="my-[var(--spacing-xs)] h-2 rounded-[var(--radius-pill)] bg-(--color-surface-alt)">
              <span
                style={{
                  width: `${barPct}%`,
                  backgroundColor: week.reached ? "var(--color-ok)" : "var(--color-brand)",
                }}
                className="block h-2 rounded-[var(--radius-pill)]"
              />
            </div>
            <AppText variant="caption" color={week.reached ? "success" : "textMuted"}>
              {week.reached
                ? t("calendar.goalReached")
                : t("calendar.weeklyProgress", { done: week.done, goal: week.goal })}
            </AppText>
          </div>
        </div>
      </Card>

      {/* 주말만 쉰 것을 연속으로 볼지 */}
      <div className="mb-[var(--spacing-md)] flex items-center justify-between">
        <AppText variant="caption" color="textMuted">
          {t("calendar.weekendStreak")}
        </AppText>
        <div className="flex gap-[2px] rounded-[var(--radius-pill)] bg-(--color-surface-alt) p-[2px]">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setSkipWeekends(v)}
              style={{ backgroundColor: skipWeekends === v ? "var(--color-brand)" : "transparent" }}
              className="rounded-[var(--radius-pill)] px-[var(--spacing-md)] py-[4px]"
            >
              <AppText
                variant="caption"
                style={{ color: skipWeekends === v ? "var(--color-on-brand)" : "var(--color-ink2)" }}
                className={skipWeekends === v ? "font-bold" : ""}
              >
                {t(v ? "calendar.weekendExclude" : "calendar.weekendInclude")}
              </AppText>
            </button>
          ))}
        </div>
      </div>

      {/* 월 이동 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => shiftMonth(-1)}
          className="p-[var(--spacing-sm)]"
        >
          <Icon name="chevron-back" size={20} color="var(--color-ink)" />
        </button>
        <button
          type="button"
          data-testid="month-label"
          onClick={() => {
            setView({ y: now.getFullYear(), m: now.getMonth() });
            setSelected(todayKey);
          }}
        >
          <AppText variant="heading">{monthLabel}</AppText>
        </button>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => shiftMonth(1)}
          className="p-[var(--spacing-sm)]"
        >
          <Icon name="chevron-forward" size={20} color="var(--color-ink)" />
        </button>
      </div>
      <AppText variant="caption" color="textMuted" center className="mb-[var(--spacing-sm)] block">
        {t("calendar.monthSummary", { days: monthDaysTotal, sessions: monthSessions })}
      </AppText>

      <Card className="mb-[var(--spacing-lg)]">
        <div className="flex">
          {weekdays.map((w, i) => (
            <span key={w} className="flex-1 text-center">
              <AppText variant="label" color={i === 0 ? "danger" : "textFaint"}>
                {w}
              </AppText>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap" data-testid="calendar-grid">
          {startPad > 0 ? <span style={{ width: `${startPad * (100 / 7)}%` }} /> : null}
          {days.map((d) => {
            const key = `${view.y}-${view.m}-${d}`;
            const count = byDay.get(key)?.length ?? 0;
            const dn = dayNumber(new Date(view.y, view.m, d).getTime());
            // 기록이 있으면 그것이 우선 — 수동 표시·메모 점은 기록이 없는 날에만 뜬다.
            const manual = count === 0 && manualSet.has(dn);
            const noted = count === 0 && !manual && !!calendarNotes[String(dn)];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const hasMarker = count > 0 || manual || noted;
            return (
              <button
                key={key}
                type="button"
                data-testid={`day-${d}`}
                onClick={() => setSelected(key)}
                className="w-[14.28%] py-[var(--spacing-xs)]"
              >
                <span
                  style={{
                    backgroundColor: isSelected ? "var(--color-brand)" : undefined,
                    borderColor: isToday && !isSelected ? "var(--color-brand)" : "transparent",
                  }}
                  className="mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-[var(--radius-pill)] border"
                >
                  <AppText
                    variant="caption"
                    color={isSelected ? "text" : count || manual ? "text" : "textMuted"}
                    style={isSelected ? { color: "var(--color-on-brand)" } : undefined}
                    className={count || manual ? "font-bold" : ""}
                  >
                    {String(d)}
                  </AppText>
                  {/* 점은 **표시할 것이 있을 때만** 찍는다. 고른 날이면 배경과 대비되게 흰 점으로.
                      자리는 항상 비워 둬야 숫자가 위아래로 흔들리지 않는다. */}
                  <span
                    style={{
                      backgroundColor: !hasMarker
                        ? "transparent"
                        : isSelected
                          ? "var(--color-on-brand)"
                          : count > 0
                            ? "var(--color-brand)"
                            : manual
                              ? "var(--color-ok)"
                              : "var(--color-ink3)",
                    }}
                    className="mt-[1px] h-[4px] w-[4px] rounded-full"
                  />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 고른 날 */}
      <AppText variant="heading" className="mb-[var(--spacing-sm)] block" data-testid="selected-day">
        {selectedLabel}
      </AppText>

      <textarea
        data-testid="day-note"
        value={noteDraft}
        rows={2}
        maxLength={CALENDAR_NOTE_MAX_LEN}
        placeholder={t("calendar.dayNotePlaceholder")}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          const text = noteDraft.trim().slice(0, CALENDAR_NOTE_MAX_LEN);
          if (text === (calendarNotes[String(selectedDayNum)] ?? "")) return;
          const next = { ...calendarNotes };
          if (text) next[String(selectedDayNum)] = text;
          else delete next[String(selectedDayNum)];
          void saveSetting({ calendarNotes: next });
        }}
        className="mb-[var(--spacing-sm)] w-full rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface-alt) p-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
      />

      {selectedWorkouts.length === 0 ? (
        manualSet.has(selectedDayNum) ? (
          <Card>
            <div className="flex items-center gap-[var(--spacing-sm)]">
              <span className="h-[6px] w-[6px] rounded-full bg-(--color-ok)" />
              <AppText variant="body" className="flex-1 font-bold">
                {t("calendar.manualMarkedTag")}
              </AppText>
              <Button
                title={t("calendar.unmark")}
                size="sm"
                variant="ghost"
                fullWidth={false}
                testId="btn-unmark-day"
                onPress={() =>
                  void saveSetting({
                    manualWorkoutDays: [...manualSet].filter((n) => n !== selectedDayNum),
                  })
                }
              />
            </div>
            <AppText variant="caption" color="textMuted" className="mt-[4px] block">
              {t("calendar.manualMarkedDesc")}
            </AppText>
          </Card>
        ) : (
          <div>
            <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
              {t("calendar.noWorkout")}
            </AppText>
            {/* 아직 오지 않은 날은 표시할 수 없다. */}
            {selectedDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) ? (
              <div className="mt-[var(--spacing-sm)]">
                <Button
                  title={t("calendar.markWorkedOut")}
                  icon="checkmark-circle-outline"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  testId="btn-mark-day"
                  onPress={() => void saveSetting({ manualWorkoutDays: [...manualSet, selectedDayNum] })}
                />
              </div>
            ) : null}
          </div>
        )
      ) : (
        selectedWorkouts.map((w) => (
          <a key={w.id} href={`/history/${w.id}`} className="block">
            <Card className="mb-[var(--spacing-md)]">
              <div className="flex items-center gap-[var(--spacing-sm)]">
                <AppText variant="heading" className="min-w-0 flex-1 truncate">
                  {w.name || t("analytics.workoutNameFallback")}
                </AppText>
                {w.prCount > 0 ? <Tag label={`PR ${w.prCount}`} tone="pr" /> : null}
                <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
              </div>
              <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-lg)]">
                <AppText variant="caption" color="textMuted">
                  {`${t("analytics.metaVolume")} ${formatWeight(w.totalVolumeKg, weightUnit)}`}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {`${t("analytics.metaDuration")} ${
                    w.durationSeconds
                      ? t("common.minutesShort", { minutes: Math.round(w.durationSeconds / 60) })
                      : "-"
                  }`}
                </AppText>
              </div>
            </Card>
          </a>
        ))
      )}
    </div>
  );
}
