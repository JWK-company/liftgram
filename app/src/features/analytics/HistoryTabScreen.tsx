// @plm SRS-005  완료 세션 히스토리 목록
import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Tag, EmptyState } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo } from '../../data';
import { Workout } from '../../db/models';
import { useQueryData } from '../../db/hooks';
import { formatWeight, type WeightUnit } from '../../domain';
import { colors, spacing } from '../../theme';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-';
  return `${Math.round(seconds / 60)}분`;
}

export default function HistoryTabScreen({ navigation }: TabScreenProps<'HistoryTab'>) {
  const { weightUnit } = useUser();
  const workouts = useQueryData(() => analyticsRepo.queryWorkoutHistory(), []);

  const renderItem = useCallback(
    ({ item }: { item: Workout }) => (
      <HistoryRow
        workout={item}
        weightUnit={weightUnit}
        onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
      />
    ),
    [navigation, weightUnit],
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="title">기록</AppText>
      </View>
      <FlatList
        data={workouts}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="완료한 세션이 없어요"
            message="운동을 시작하고 완료하면 여기에 기록이 쌓입니다."
          />
        }
      />
    </Screen>
  );
}

function HistoryRow({
  workout,
  weightUnit,
  onPress,
}: {
  workout: Workout;
  weightUnit: WeightUnit;
  onPress: () => void;
}) {
  const dateStr = workout.completedAt
    ? new Date(workout.completedAt).toLocaleDateString('ko-KR')
    : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.titleCol}>
            <AppText variant="heading" numberOfLines={1}>
              {workout.name || '운동'}
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {dateStr}
            </AppText>
          </View>
          <View style={styles.cardTopRight}>
            {workout.prCount > 0 ? <Tag label={`PR ${workout.prCount}`} tone="pr" /> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
        </View>
        <View style={styles.metaRow}>
          <Meta label="볼륨" value={formatWeight(workout.totalVolumeKg, weightUnit)} />
          <Meta label="소요" value={formatDuration(workout.durationSeconds)} />
        </View>
      </Card>
    </Pressable>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <AppText variant="label" color="textFaint">
        {label}
      </AppText>
      <AppText variant="body" weight="medium" style={{ marginTop: 2 }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  pressed: { opacity: 0.7 },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleCol: { flex: 1, marginRight: spacing.md },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  meta: {},
});
