// @plm SRS-004  세션 종료 요약 — 총 볼륨·소요시간·세트수·PR
// @plm SRS-005  종목별 볼륨·추정 1RM(웰니스 라벨)
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Screen,
  StatTile,
  Tag,
  TextField,
} from '../../components';
import { colors, spacing } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo, workoutRepo } from '../../data';
import type { WorkoutDetail } from '../../data';
import type { Workout } from '../../db/models';
import {
  formatWeight,
  variantLabelFromKey,
  dayNumber,
  computeStreak,
  weeklyProgress,
  type WeightUnit,
  type StreakStats,
  type WeeklyProgress,
} from '../../domain';
import { serverApi } from '../../sync/serverApi';
import { useWeeklyGoal, useStreakSkipWeekends } from '../analytics/useWeeklyGoal';
import { useT } from '../../i18n';

function formatDuration(durationSeconds: number | null): string {
  const s = Math.max(0, Math.round(durationSeconds ?? 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function workingSetCount(detail: WorkoutDetail): number {
  return detail.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !s.isWarmup && !s.isFailed).length,
    0,
  );
}

export default function WorkoutSummaryScreen({ navigation, route }: RootStackScreenProps<'WorkoutSummary'>) {
  const { t, lang } = useT();
  const { workoutId } = route.params;
  const { weightUnit, machineVariantLabels } = useUser();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [weeklyGoal] = useWeeklyGoal();
  const [skipWeekends] = useStreakSkipWeekends();
  const [streak, setStreak] = useState<StreakStats>({ current: 0, longest: 0 });
  const [week, setWeek] = useState<WeeklyProgress>({ done: 0, goal: weeklyGoal, reached: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [w, d] = await Promise.all([
          workoutRepo.getWorkout(workoutId),
          analyticsRepo.getWorkoutDetail(workoutId),
        ]);
        if (!alive) return;
        setWorkout(w);
        setDetail(d);
      } catch {
        /* 로드 실패 — 빈 상태 표시 */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workoutId]);

  // 완료 시점 스트릭·주간진행 — 완료 세션 전량으로 계산(CalendarTab과 동일 패턴). 실패해도 기본값(0)으로 안전.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await analyticsRepo.queryWorkoutHistory().fetch();
        const nums = all.map((w) => dayNumber(w.completedAt ?? w.startedAt));
        const todayNum = dayNumber(Date.now());
        if (!alive) return;
        setStreak(computeStreak(nums, todayNum, skipWeekends));
        setWeek(weeklyProgress(nums, todayNum, weeklyGoal));
      } catch {
        /* 조회 실패 — 기본값 유지(오프라인/빈 DB 안전) */
      }
    })();
    return () => {
      alive = false;
    };
  }, [weeklyGoal, skipWeekends]);

  // 오운완 → 피드 공유 (SRS-007). 원시 kg/초/카운트를 저장, 뷰어가 자기 단위로 렌더.
  async function shareToFeed() {
    if (!workout || !detail || sharing || shared) return;
    setSharing(true);
    setShareError(null);
    try {
      if (!(await serverApi.isLoggedIn())) {
        setShareError(t('session.shareLoginRequired'));
        return;
      }
      // 캡션 미입력 시 볼륨·PR·스트릭을 조합한 오운완 캡션 자동 생성 → '원탭 = 완성 포스트'.
      const autoCaption = [
        t('session.workoutComplete'),
        workout.name || undefined,
        `${t('session.totalVolume')} ${formatWeight(workout.totalVolumeKg, weightUnit)}`,
        workout.prCount > 0 ? t('session.prCount', { count: workout.prCount }) : undefined,
        streak.current > 0 ? t('session.streakDays', { count: streak.current }) : undefined,
      ]
        .filter(Boolean)
        .join(' · ');
      await serverApi.createPost({
        kind: 'workout',
        caption: caption.trim() || autoCaption,
        data: {
          name: workout.name ?? null,
          volumeKg: workout.totalVolumeKg,
          durationSeconds: workout.durationSeconds ?? 0,
          prCount: workout.prCount,
          streakDays: streak.current,
          weeklyReached: week.reached,
          setCount: workingSetCount(detail),
          exerciseCount: detail.exercises.length,
          // 루틴 전체(종목·세트)를 함께 저장 → 보는 사람이 펼쳐서 구경 가능(SRS-007).
          // 원시 kg 저장(뷰어가 자기 단위로 렌더). 세트 무게/반복만 담아 경량 유지.
          exercises: detail.exercises.map((ex) => ({
            // 변형(기구·그립) 선택 시 변형 라벨을 이름에 붙여 공유(보는 사람이 어떤 변형인지 알 수 있게).
            name: ex.variantKey
              ? `${ex.exerciseName} (${variantLabelFromKey(ex.variantKey, lang, machineVariantLabels)})`
              : ex.exerciseName,
            note: ex.note ?? undefined, // #3: 업로더 메모(확장 시 표시)
            sets: ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, isWarmup: s.isWarmup, partialReps: s.partialReps ?? undefined })),
          })),
        },
      });
      setShared(true);
      setCaption('');
    } catch (e) {
      setShareError(String(e));
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <EmptyState title={t('session.summaryLoading')} />
      </Screen>
    );
  }

  if (!workout || !detail) {
    return (
      <Screen>
        <EmptyState
          title={t('session.summaryLoadError')}
          action={<Button title={t('common.done')} onPress={() => navigation.navigate('Tabs')} />}
        />
      </Screen>
    );
  }

  const prCount = workout.prCount;

  return (
    <Screen scroll contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      {/* 축하 헤더 */}
      <View style={styles.hero}>
        <Ionicons name="trophy" size={40} color={colors.pr} />
        <AppText variant="display" center style={{ marginTop: spacing.sm }}>
          {t('session.workoutComplete')}
        </AppText>
        <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
          {new Date(workout.completedAt ?? workout.startedAt).toLocaleDateString('ko-KR')}
          {workout.name ? ` · ${workout.name}` : ''}
        </AppText>
        {prCount > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Tag label={t('session.prCount', { count: prCount })} tone="pr" />
          </View>
        ) : null}
        {streak.current > 0 ? (
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={18} color={colors.warning} />
            <Tag label={t('session.streakDays', { count: streak.current })} tone="primary" />
            {week.reached ? <Tag label={t('calendar.goalReached')} tone="pr" /> : null}
          </View>
        ) : null}
      </View>

      {/* 핵심 지표 */}
      <View style={styles.statRow}>
        <StatTile label={t('session.totalVolume')} value={formatWeight(workout.totalVolumeKg, weightUnit)} />
        <StatTile label={t('session.duration')} value={formatDuration(workout.durationSeconds)} />
        <StatTile label={t('session.setCount')} value={String(workingSetCount(detail))} />
      </View>

      {/* 오운완 공유 */}
      <Card style={{ marginTop: spacing.xl }}>
        {shared ? (
          <View style={styles.sharedRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <AppText variant="body" weight="medium" style={{ marginLeft: spacing.sm }}>
              {t('session.sharedToFeed')}
            </AppText>
          </View>
        ) : (
          <>
            <TextField
              value={caption}
              onChangeText={setCaption}
              placeholder={t('session.shareCaptionPlaceholder')}
              multiline
              containerStyle={{ marginBottom: spacing.sm }}
            />
            <Button
              title={t('session.shareToFeed')}
              icon="share-social-outline"
              loading={sharing}
              onPress={shareToFeed}
            />
            {shareError ? (
              <AppText variant="caption" style={{ color: colors.danger, marginTop: spacing.sm }}>
                {shareError}
              </AppText>
            ) : null}
          </>
        )}
      </Card>

      {/* 종목별 분해 */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        {t('session.perExerciseRecords')}
      </AppText>
      {detail.exercises.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('session.noExercisesRecorded')}
        </AppText>
      ) : (
        detail.exercises.map((ex) => (
          <ExerciseSummaryCard
            key={ex.workoutExerciseId}
            name={ex.exerciseName}
            setCount={ex.sets.length}
            volumeKg={ex.volumeKg}
            bestEstimated1RM={ex.bestEstimated1RM}
            weightUnit={weightUnit}
          />
        ))
      )}

      <Button title={t('common.done')} onPress={() => navigation.navigate('Tabs')} style={{ marginTop: spacing.xl }} />

      <AppText variant="caption" color="textFaint" center style={{ marginTop: spacing.lg }}>
        {t('wellness.safetyNotice')}
      </AppText>
    </Screen>
  );
}

function ExerciseSummaryCard({
  name,
  setCount,
  volumeKg,
  bestEstimated1RM,
  weightUnit,
}: {
  name: string;
  setCount: number;
  volumeKg: number;
  bestEstimated1RM: number;
  weightUnit: WeightUnit;
}) {
  const { t } = useT();
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <AppText variant="heading" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {t('session.exerciseSetsVolume', { count: setCount, volume: formatWeight(volumeKg, weightUnit) })}
      </AppText>
      {bestEstimated1RM > 0 ? (
        <>
          <Divider />
          <AppText variant="label" color="textMuted">
            {t('wellness.oneRepMaxLabel')}
          </AppText>
          <AppText variant="title" color="primary" style={{ marginTop: 2 }}>
            {formatWeight(bestEstimated1RM, weightUnit)}
          </AppText>
          <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
            {t('wellness.oneRepMaxCaption')}
          </AppText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  streakRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  sharedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
});
