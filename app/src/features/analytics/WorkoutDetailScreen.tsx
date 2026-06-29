// @plm SRS-005  세션 상세 — 종목별 세트·볼륨·추정1RM
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  Screen,
  Card,
  AppText,
  Tag,
  Divider,
  StatTile,
  EmptyState,
} from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo } from '../../data';
import type { WorkoutDetail, WorkoutExerciseDetail } from '../../data';
import { formatWeight, type WeightUnit } from '../../domain';
import { colors, spacing } from '../../theme';
import { t, useT } from '../../i18n';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-';
  return t('common.minutesShort', { minutes: Math.round(seconds / 60) });
}

export default function WorkoutDetailScreen({ route }: RootStackScreenProps<'WorkoutDetail'>) {
  const { t } = useT();
  const { workoutId } = route.params;
  const { weightUnit } = useUser();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const d = await analyticsRepo.getWorkoutDetail(workoutId);
        if (!cancelled) setDetail(d);
      } catch {
        // 세션이 삭제/부재 — 빈 상태 표시
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutId]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen>
        <EmptyState title={t('analytics.sessionNotFoundTitle')} message={t('analytics.sessionNotFoundMessage')} />
      </Screen>
    );
  }

  const { workout } = detail;
  const dateStr = workout.completedAt
    ? new Date(workout.completedAt).toLocaleDateString('ko-KR')
    : '';

  return (
    <Screen scroll>
      <AppText variant="title" numberOfLines={2}>
        {workout.name || t('analytics.workoutFallbackName')}
      </AppText>
      <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
        {dateStr}
      </AppText>

      <View style={styles.tilesRow}>
        <StatTile label={t('analytics.totalVolumeLabel')} value={formatWeight(detail.totalVolumeKg, weightUnit)} />
        <StatTile label={t('analytics.durationLabel')} value={formatDuration(workout.durationSeconds)} />
      </View>

      {detail.exercises.length === 0 ? (
        <EmptyState title={t('analytics.noSetsTitle')} />
      ) : (
        detail.exercises.map((ex) => (
          <ExerciseCard key={ex.workoutExerciseId} ex={ex} weightUnit={weightUnit} />
        ))
      )}
    </Screen>
  );
}

function ExerciseCard({ ex, weightUnit }: { ex: WorkoutExerciseDetail; weightUnit: WeightUnit }) {
  const { t } = useT();
  return (
    <Card style={styles.exCard}>
      <AppText variant="heading" numberOfLines={1}>
        {ex.exerciseName}
      </AppText>

      <View style={styles.setHead}>
        <AppText variant="label" color="textFaint" style={styles.colSet}>
          {t('analytics.setColumnHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colWeight}>
          {t('analytics.weightRepsColumnHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colRpe}>
          RPE
        </AppText>
      </View>
      <Divider style={{ marginTop: spacing.xs, marginBottom: spacing.xs }} />

      {ex.sets.map((s) => (
        <View key={s.setNumber} style={styles.setRow}>
          <AppText variant="body" color="textMuted" style={styles.colSet}>
            {s.setNumber}
          </AppText>
          <View style={styles.colWeight}>
            <AppText variant="body">
              {formatWeight(s.weightKg, weightUnit)} × {s.reps}
            </AppText>
            <View style={styles.setTags}>
              {s.isWarmup ? <Tag label={t('analytics.warmupTag')} tone="muted" /> : null}
              {s.isFailed ? <Tag label={t('analytics.failedTag')} tone="default" /> : null}
            </View>
          </View>
          <AppText variant="body" color="textMuted" style={styles.colRpe}>
            {s.rpe != null ? String(s.rpe) : '-'}
          </AppText>
        </View>
      ))}

      <Divider />
      <View style={styles.summaryRow}>
        <AppText variant="caption" color="textMuted">
          {t('analytics.volumeLabel')}
        </AppText>
        <AppText variant="body" weight="medium">
          {formatWeight(ex.volumeKg, weightUnit)}
        </AppText>
      </View>
      <View style={styles.summaryRow}>
        <AppText variant="caption" color="textMuted">
          {t('wellness.oneRepMaxLabel')}
        </AppText>
        <AppText variant="body" weight="bold">
          {formatWeight(ex.bestEstimated1RM, weightUnit)}
        </AppText>
      </View>
      <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
        {t('wellness.oneRepMaxCaption')}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tilesRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.lg },
  exCard: { marginBottom: spacing.lg },
  setHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  colSet: { width: 40 },
  colWeight: { flex: 1 },
  colRpe: { width: 48, textAlign: 'right' },
  setTags: { flexDirection: 'row', gap: spacing.xs, marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
