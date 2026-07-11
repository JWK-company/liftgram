// @plm SRS-011  운동 캘린더 — 월별 달력에 '언제·얼마나·어떤 루틴으로' 운동했는지 시각화(책임감 루프).
// 완료 세션을 로컬 날짜로 버킷팅 → 날짜 셀 마커 + 선택일 상세(루틴명·볼륨·시간·PR). 지속성 가시화.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Tag } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { analyticsRepo } from '../../data';
import type { Workout } from '../../db/models';
import { useQueryData } from '../../db/hooks';
import { useUser } from '../../state/userContext';
import { formatWeight, dayNumber, computeStreak, weeklyProgress, WEEKLY_GOAL_MIN, WEEKLY_GOAL_MAX } from '../../domain';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';
import { useWeeklyGoal } from './useWeeklyGoal';

function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarTabScreen({ navigation }: TabScreenProps<'CalendarTab'>) {
  const { t, lang } = useT();
  const { weightUnit } = useUser();
  const locale = lang === 'en' ? 'en-US' : 'ko-KR';
  const workouts = useQueryData(() => analyticsRepo.queryWorkoutHistory(), []);

  // 완료 세션을 로컬 '날짜'로 그룹핑 (하루 여러 세션 가능).
  const byDay = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of workouts) {
      const key = dayKeyOf(w.completedAt ?? w.startedAt);
      const arr = m.get(key);
      if (arr) arr.push(w);
      else m.set(key, [w]);
    }
    return m;
  }, [workouts]);

  // 스트릭·주간 목표 — 완료 세션의 로컬 '날짜'만으로 계산(지속성 지표).
  const [weeklyGoal, setWeeklyGoal] = useWeeklyGoal();
  const { streak, week } = useMemo(() => {
    const nums = workouts.map((w) => dayNumber(w.completedAt ?? w.startedAt));
    const todayNum = dayNumber(Date.now());
    return { streak: computeStreak(nums, todayNum), week: weeklyProgress(nums, todayNum, weeklyGoal) };
  }, [workouts, weeklyGoal]);
  const barPct = Math.min(100, week.goal > 0 ? (week.done / week.goal) * 100 : 0);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const [view, setView] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [selected, setSelected] = useState<string>(todayKey);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: 'narrow' })),
    [locale],
  );

  // 달력 셀 — 앞 공백 패딩 + 1..말일, 7의 배수로 채움.
  const cells = useMemo(() => {
    const startPad = new Date(view.y, view.m, 1).getDay(); // 0=일
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startPad; i += 1) arr.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view]);

  const monthPrefix = `${view.y}-${view.m}-`;
  const monthDays = useMemo(() => [...byDay.keys()].filter((k) => k.startsWith(monthPrefix)).length, [byDay, monthPrefix]);
  const monthSessions = useMemo(
    () => [...byDay.entries()].filter(([k]) => k.startsWith(monthPrefix)).reduce((n, [, ws]) => n + ws.length, 0),
    [byDay, monthPrefix],
  );

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }
  function goToday() {
    setView({ y: now.getFullYear(), m: now.getMonth() });
    setSelected(todayKey);
  }

  const selectedWorkouts = byDay.get(selected) ?? [];
  const selectedDate = (() => {
    const [y, m, d] = selected.split('-').map(Number);
    return new Date(y, m, d);
  })();
  const selectedLabel = selectedDate.toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <Screen scroll>
      <AppText variant="display" style={{ marginBottom: spacing.md }}>
        {t('nav.calendar')}
      </AppText>

      {/* 스트릭 + 이번 주 목표 — 지속성/책임감 */}
      <Card style={styles.streakCard}>
        <View style={styles.streakSide}>
          <View style={styles.flameRow}>
            <Ionicons name="flame" size={22} color={streak.current > 0 ? colors.warning : colors.textFaint} />
            <AppText variant="title">{streak.current}</AppText>
          </View>
          <AppText variant="caption" color="textMuted">
            {t('calendar.streakLabel')}
          </AppText>
          {streak.longest > 1 ? (
            <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
              {t('calendar.longest', { days: streak.longest })}
            </AppText>
          ) : null}
        </View>

        <View style={styles.vDivider} />

        <View style={styles.goalSide}>
          <View style={styles.goalHeader}>
            <AppText variant="label" color="textMuted">
              {t('calendar.weeklyGoalTitle')}
            </AppText>
            <View style={styles.stepper}>
              <Pressable onPress={() => setWeeklyGoal(weeklyGoal - 1)} hitSlop={8} disabled={weeklyGoal <= WEEKLY_GOAL_MIN}>
                <Ionicons name="remove-circle" size={22} color={weeklyGoal <= WEEKLY_GOAL_MIN ? colors.textFaint : colors.primary} />
              </Pressable>
              <AppText variant="label" weight="bold" style={styles.goalNum}>
                {t('calendar.goalDays', { days: weeklyGoal })}
              </AppText>
              <Pressable onPress={() => setWeeklyGoal(weeklyGoal + 1)} hitSlop={8} disabled={weeklyGoal >= WEEKLY_GOAL_MAX}>
                <Ionicons name="add-circle" size={22} color={weeklyGoal >= WEEKLY_GOAL_MAX ? colors.textFaint : colors.primary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${barPct}%` }, week.reached && styles.barFillDone]} />
          </View>
          <AppText variant="caption" color={week.reached ? 'success' : 'textMuted'}>
            {week.reached ? t('calendar.goalReached') : t('calendar.weeklyProgress', { done: week.done, goal: week.goal })}
          </AppText>
        </View>
      </Card>

      {/* 월 이동 + 이번 달 요약 */}
      <View style={styles.monthBar}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={goToday} hitSlop={6}>
          <AppText variant="heading">{monthLabel}</AppText>
        </Pressable>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>
      <AppText variant="caption" color="textMuted" style={styles.summary}>
        {t('calendar.monthSummary', { days: monthDays, sessions: monthSessions })}
      </AppText>

      <Card style={styles.calCard}>
        {/* 요일 헤더 */}
        <View style={styles.weekRow}>
          {weekdays.map((w, i) => (
            <View key={i} style={styles.cell}>
              <AppText variant="label" color={i === 0 ? 'danger' : 'textFaint'} center>
                {w}
              </AppText>
            </View>
          ))}
        </View>
        {/* 날짜 그리드 */}
        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d == null) return <View key={i} style={styles.cell} />;
            const key = `${view.y}-${view.m}-${d}`;
            const count = byDay.get(key)?.length ?? 0;
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <Pressable key={i} style={styles.cell} onPress={() => setSelected(key)}>
                <View style={[styles.dayInner, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday]}>
                  <AppText variant="caption" weight={count ? 'bold' : 'regular'} color={isSelected ? 'onPrimary' : count ? 'text' : 'textMuted'} center>
                    {d}
                  </AppText>
                  {count > 0 ? <View style={[styles.dot, isSelected && styles.dotOnSel]} /> : <View style={styles.dotSpacer} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 선택일 상세 — 어떤 루틴으로 운동했는지 */}
      <AppText variant="heading" style={styles.detailTitle}>
        {selectedLabel}
      </AppText>
      {selectedWorkouts.length === 0 ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          {t('calendar.noWorkout')}
        </AppText>
      ) : (
        selectedWorkouts.map((w) => (
          <Pressable key={w.id} onPress={() => navigation.navigate('WorkoutDetail', { workoutId: w.id })}>
            <Card style={styles.wCard}>
              <View style={styles.wTop}>
                <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                  {w.name || t('analytics.workoutNameFallback')}
                </AppText>
                {w.prCount > 0 ? <Tag label={`PR ${w.prCount}`} tone="pr" /> : null}
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </View>
              <View style={styles.wMeta}>
                <AppText variant="caption" color="textMuted">
                  {t('analytics.metaVolume')} <AppText variant="caption" weight="medium">{formatWeight(w.totalVolumeKg, weightUnit)}</AppText>
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {t('analytics.metaDuration')}{' '}
                  <AppText variant="caption" weight="medium">
                    {w.durationSeconds ? t('common.minutesShort', { minutes: Math.round(w.durationSeconds / 60) }) : '-'}
                  </AppText>
                </AppText>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  streakCard: { flexDirection: 'row', alignItems: 'stretch', marginBottom: spacing.md, paddingVertical: spacing.md },
  streakSide: { width: 96, alignItems: 'center', justifyContent: 'center' },
  flameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.md },
  goalSide: { flex: 1, justifyContent: 'center', gap: spacing.xs },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  goalNum: { minWidth: 44, textAlign: 'center' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  barFillDone: { backgroundColor: colors.success },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { textAlign: 'center', marginBottom: spacing.md },
  calCard: { paddingVertical: spacing.sm, marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayInner: { width: 40, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 3 },
  dotOnSel: { backgroundColor: colors.onPrimary },
  dotSpacer: { height: 6, marginTop: 3 },
  detailTitle: { marginBottom: spacing.sm },
  wCard: { marginBottom: spacing.md },
  wTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wMeta: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
});
