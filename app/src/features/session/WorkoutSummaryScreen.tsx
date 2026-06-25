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
} from '../../components';
import { colors, spacing } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo, workoutRepo } from '../../data';
import type { WorkoutDetail } from '../../data';
import type { Workout } from '../../db/models';
import { formatWeight, WELLNESS, type WeightUnit } from '../../domain';

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
  const { workoutId } = route.params;
  const { weightUnit } = useUser();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <Screen>
        <EmptyState title="요약 불러오는 중" />
      </Screen>
    );
  }

  if (!workout || !detail) {
    return (
      <Screen>
        <EmptyState
          title="요약을 불러오지 못했습니다"
          action={<Button title="완료" onPress={() => navigation.navigate('Tabs')} />}
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
          운동 완료!
        </AppText>
        <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
          {new Date(workout.completedAt ?? workout.startedAt).toLocaleDateString('ko-KR')}
          {workout.name ? ` · ${workout.name}` : ''}
        </AppText>
        {prCount > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Tag label={`PR 갱신 ${prCount}회`} tone="pr" />
          </View>
        ) : null}
      </View>

      {/* 핵심 지표 */}
      <View style={styles.statRow}>
        <StatTile label="총 볼륨" value={formatWeight(workout.totalVolumeKg, weightUnit)} />
        <StatTile label="소요시간" value={formatDuration(workout.durationSeconds)} />
        <StatTile label="세트 수" value={String(workingSetCount(detail))} />
      </View>

      {/* 종목별 분해 */}
      <AppText variant="heading" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        종목별 기록
      </AppText>
      {detail.exercises.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          기록된 종목이 없습니다.
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

      <Button title="완료" onPress={() => navigation.navigate('Tabs')} style={{ marginTop: spacing.xl }} />

      <AppText variant="caption" color="textFaint" center style={{ marginTop: spacing.lg }}>
        {WELLNESS.safetyNotice}
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
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <AppText variant="heading" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        {setCount}세트 · 볼륨 {formatWeight(volumeKg, weightUnit)}
      </AppText>
      {bestEstimated1RM > 0 ? (
        <>
          <Divider />
          <AppText variant="label" color="textMuted">
            {WELLNESS.oneRepMaxLabel}
          </AppText>
          <AppText variant="title" color="primary" style={{ marginTop: 2 }}>
            {formatWeight(bestEstimated1RM, weightUnit)}
          </AppText>
          <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
            {WELLNESS.oneRepMaxCaption}
          </AppText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
