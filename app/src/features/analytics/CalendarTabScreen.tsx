// @plm SRS-011  운동 캘린더 — 월별 달력에 '언제·얼마나·어떤 루틴으로' 운동했는지 시각화(책임감 루프).
// 완료 세션을 로컬 날짜로 버킷팅 → 날짜 셀 마커 + 선택일 상세(루틴명·볼륨·시간·PR). 지속성 가시화.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Tag, Button, TextField } from '../../components';
import { CALENDAR_NOTE_MAX_LEN } from '../../db/models/_sanitizers';
import type { TabScreenProps } from '../../navigation/types';
import { analyticsRepo, userRepo } from '../../data';
import type { Workout } from '../../db/models';
import { useQueryData } from '../../db/hooks';
import { useUser } from '../../state/userContext';
import { formatWeight, dayNumber, computeStreak, weeklyProgress, WEEKLY_GOAL_MIN, WEEKLY_GOAL_MAX } from '../../domain';
import { serverApi } from '../../sync/serverApi';
import { authErrorKey } from '../../sync/apiError'; // 오프라인/서버오류 → 친화 메시지. @plm SRS-006
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';
import { useWeeklyGoal, useStreakSkipWeekends } from './useWeeklyGoal';

function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarTabScreen({ navigation }: TabScreenProps<'CalendarTab'>) {
  const { t, lang } = useT();
  const { weightUnit, user, manualWorkoutDays, calendarNotes, refresh } = useUser();
  const locale = lang === 'en' ? 'en-US' : 'ko-KR';
  const workouts = useQueryData(() => analyticsRepo.queryWorkoutHistory(), []);

  // v19: 수동 '운동했어요' 표시일(dayNumber) — 앱으로 기록 못한 운동일 백필. 표시 전용(통계·스트릭 미반영). @plm SRS-011
  const manualSet = useMemo(() => new Set(manualWorkoutDays), [manualWorkoutDays]);
  async function toggleManualDay(dayNum: number, add: boolean) {
    if (!user) return;
    const next = add ? [...manualSet, dayNum] : [...manualSet].filter((n) => n !== dayNum);
    try {
      await userRepo.updateUserSettings(user.id, { manualWorkoutDays: next });
      await refresh();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

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
  const [skipWeekends, setSkipWeekends] = useStreakSkipWeekends();
  const { streak, week } = useMemo(() => {
    const nums = workouts.map((w) => dayNumber(w.completedAt ?? w.startedAt));
    const todayNum = dayNumber(Date.now());
    return { streak: computeStreak(nums, todayNum, skipWeekends), week: weeklyProgress(nums, todayNum, weeklyGoal) };
  }, [workouts, weeklyGoal, skipWeekends]);
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
  // 수동 표시일도 '이번 달 운동일수'에 합산(명시적 표시 = 운동한 날) — 앱 기록일과 중복은 제외(union).
  // 세션 수·볼륨에는 미반영(수행 내용이 없으므로), 연속일 스트릭도 기존대로 앱 기록만.
  const monthManualDays = useMemo(() => {
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    let n = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      if (!byDay.has(`${view.y}-${view.m}-${d}`) && manualSet.has(dayNumber(new Date(view.y, view.m, d).getTime()))) n += 1;
    }
    return n;
  }, [view, byDay, manualSet]);
  const monthDaysTotal = monthDays + monthManualDays;
  const monthSessions = useMemo(
    () => [...byDay.entries()].filter(([k]) => k.startsWith(monthPrefix)).reduce((n, [, ws]) => n + ws.length, 0),
    [byDay, monthPrefix],
  );
  const monthVolume = useMemo(
    () =>
      [...byDay.entries()]
        .filter(([k]) => k.startsWith(monthPrefix))
        .reduce((sum, [, ws]) => sum + ws.reduce((a, w) => a + (w.totalVolumeKg ?? 0), 0), 0),
    [byDay, monthPrefix],
  );

  // 이번 달 자랑하기 — 월 결산(일수·횟수·볼륨)을 피드에 공유(책임감·동기). @plm SRS-007/SRS-011
  const [bragging, setBragging] = useState(false);
  async function shareMonth() {
    if (bragging || monthSessions === 0) return;
    setBragging(true);
    try {
      if (!(await serverApi.isLoggedIn())) {
        Alert.alert(t('calendar.bragTitle'), t('session.shareLoginRequired'));
        return;
      }
      const caption = t('calendar.bragCaption', {
        month: monthLabel,
        days: monthDaysTotal,
        sessions: monthSessions,
        volume: formatWeight(monthVolume, weightUnit),
      });
      await serverApi.createPost({
        kind: 'text',
        caption,
        data: { month: monthPrefix, days: monthDaysTotal, sessions: monthSessions, volumeKg: monthVolume },
      });
      Alert.alert(t('calendar.bragTitle'), t('calendar.bragDone'));
    } catch (e) {
      Alert.alert(t('common.error'), t(authErrorKey(e)));
    } finally {
      setBragging(false);
    }
  }

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
  const selectedDayNum = dayNumber(selectedDate.getTime()); // 수동 표시 조회·토글용(v19 dayNumber 저장). @plm SRS-011

  // v20: 날짜별 간단 메모 — 선택일 변경 시 로드, blur 시 저장(비우면 삭제). 프로필 동기 경로. @plm SRS-011
  const [noteDraft, setNoteDraft] = useState('');
  useEffect(() => setNoteDraft(calendarNotes[String(selectedDayNum)] ?? ''), [selectedDayNum, calendarNotes]);
  async function saveDayNote() {
    if (!user) return;
    const text = noteDraft.trim().slice(0, CALENDAR_NOTE_MAX_LEN);
    if (text === (calendarNotes[String(selectedDayNum)] ?? '')) return;
    const next = { ...calendarNotes };
    if (text) next[String(selectedDayNum)] = text;
    else delete next[String(selectedDayNum)];
    try {
      await userRepo.updateUserSettings(user.id, { calendarNotes: next });
      await refresh();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

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

      {/* 연속일 주말 포함/제외 — 주말만 쉰 건 연속 유지할지 선택 */}
      <View style={styles.weekendRow}>
        <AppText variant="caption" color="textMuted">
          {t('calendar.weekendStreak')}
        </AppText>
        <View style={styles.segToggle}>
          {[false, true].map((v) => {
            const active = skipWeekends === v;
            return (
              <Pressable key={String(v)} onPress={() => setSkipWeekends(v)} style={[styles.seg, active && styles.segActive]}>
                <AppText
                  variant="caption"
                  weight={active ? 'bold' : 'regular'}
                  style={{ color: active ? colors.onPrimary : colors.textMuted }}
                >
                  {t(v ? 'calendar.weekendExclude' : 'calendar.weekendInclude')}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

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
        {t('calendar.monthSummary', { days: monthDaysTotal, sessions: monthSessions })}
      </AppText>
      {monthSessions > 0 ? (
        <Button
          title={t('calendar.brag')}
          icon="megaphone-outline"
          variant="secondary"
          loading={bragging}
          onPress={shareMonth}
          style={styles.bragBtn}
        />
      ) : null}

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
            const dn = dayNumber(new Date(view.y, view.m, d).getTime());
            const manual = count === 0 && manualSet.has(dn); // 기록 세션이 있으면 기본 점이 우선
            const noted = count === 0 && !manual && !!calendarNotes[String(dn)]; // v20: 메모만 있는 날 — 회색 점
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <Pressable key={i} style={styles.cell} onPress={() => setSelected(key)}>
                <View style={[styles.dayInner, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday]}>
                  <AppText variant="caption" weight={count || manual ? 'bold' : 'regular'} color={isSelected ? 'onPrimary' : count || manual ? 'text' : 'textMuted'} center>
                    {d}
                  </AppText>
                  {count > 0 ? (
                    <View style={[styles.dot, isSelected && styles.dotOnSel]} />
                  ) : manual ? (
                    <View style={[styles.dot, styles.dotManual, isSelected && styles.dotOnSel]} />
                  ) : noted ? (
                    <View style={[styles.dot, styles.dotNote, isSelected && styles.dotOnSel]} />
                  ) : (
                    <View style={styles.dotSpacer} />
                  )}
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
      {/* v20: 날짜별 간단 메모 — 컨디션·특이사항. blur 저장, 비우면 삭제(운동 유무 무관 상시). @plm SRS-011 */}
      <TextField
        value={noteDraft}
        onChangeText={setNoteDraft}
        onBlur={saveDayNote}
        placeholder={t('calendar.dayNotePlaceholder')}
        multiline
        maxLength={CALENDAR_NOTE_MAX_LEN}
        containerStyle={{ marginBottom: spacing.sm }}
      />
      {selectedWorkouts.length === 0 ? (
        manualSet.has(selectedDayNum) ? (
          /* 수동 표시일 — 앱 기록 없이 직접 표시한 운동일(다른 색 마커). 해제 가능. @plm SRS-011 */
          <Card style={styles.manualCard}>
            <View style={styles.wTop}>
              <View style={styles.manualDot} />
              <AppText variant="body" weight="bold" style={{ flex: 1 }}>
                {t('calendar.manualMarkedTag')}
              </AppText>
              <Button title={t('calendar.unmark')} size="sm" variant="ghost" fullWidth={false} onPress={() => toggleManualDay(selectedDayNum, false)} />
            </View>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 4 }}>
              {t('calendar.manualMarkedDesc')}
            </AppText>
          </Card>
        ) : (
          <View>
            <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
              {t('calendar.noWorkout')}
            </AppText>
            {/* 미래 날짜는 표시 불가 — 지난/오늘 빈 날짜만 '이 날도 운동 했어요'. */}
            {selectedDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) ? (
              <Button
                title={t('calendar.markWorkedOut')}
                icon="checkmark-circle-outline"
                size="sm"
                variant="secondary"
                fullWidth={false}
                onPress={() => toggleManualDay(selectedDayNum, true)}
                style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        )
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
  weekendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, marginTop: -spacing.xs },
  segToggle: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 2, gap: 2 },
  seg: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm - 1, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.primary },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { textAlign: 'center', marginBottom: spacing.sm },
  bragBtn: { marginBottom: spacing.md },
  calCard: { paddingVertical: spacing.sm, marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayInner: { width: 40, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 3 },
  dotManual: { backgroundColor: colors.warning }, // 수동 표시일 — 기록 세션(primary)과 구분되는 색
  dotNote: { backgroundColor: colors.textFaint }, // v20: 메모만 있는 날 — 회색 점
  dotOnSel: { backgroundColor: colors.onPrimary },
  dotSpacer: { height: 6, marginTop: 3 },
  manualCard: { borderColor: colors.warning, borderWidth: 1, marginTop: spacing.xs, marginBottom: spacing.md },
  manualDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  detailTitle: { marginBottom: spacing.sm },
  wCard: { marginBottom: spacing.md },
  wTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wMeta: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
});
