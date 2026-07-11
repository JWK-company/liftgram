// @plm SRS-005  완료 세션 히스토리 목록
import React, { useCallback } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Tag, EmptyState, IconButton } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo, workoutRepo } from '../../data';
import { Workout } from '../../db/models';
import { useQueryData } from '../../db/hooks';
import { formatWeight, type WeightUnit } from '../../domain';
import { colors, spacing } from '../../theme';
import { useT, t } from '../../i18n';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-';
  return t('common.minutesShort', { minutes: Math.round(seconds / 60) });
}

export default function HistoryTabScreen({ navigation }: TabScreenProps<'HistoryTab'>) {
  const { t } = useT();
  const { weightUnit } = useUser();
  const workouts = useQueryData(() => analyticsRepo.queryWorkoutHistory(), []);

  // 잘못 완료한 기록 삭제(#2) — 세트·종목·운동 전부 제거. 되돌릴 수 없음.
  const confirmDelete = useCallback(
    (workout: Workout) => {
      Alert.alert(t('analytics.deleteWorkoutTitle'), t('analytics.deleteWorkoutMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => workoutRepo.discardWorkout(workout.id).catch((e) => Alert.alert(t('common.error'), String(e))),
        },
      ]);
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: Workout }) => (
      <HistoryRow
        workout={item}
        weightUnit={weightUnit}
        onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
        onDelete={() => confirmDelete(item)}
      />
    ),
    [navigation, weightUnit, confirmDelete],
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="title">{t('analytics.historyTitle')}</AppText>
      </View>
      <FlatList
        data={workouts}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title={t('analytics.historyEmptyTitle')}
            message={t('analytics.historyEmptyMessage')}
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
  onDelete,
}: {
  workout: Workout;
  weightUnit: WeightUnit;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const dateStr = workout.completedAt
    ? new Date(workout.completedAt).toLocaleDateString('ko-KR')
    : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.titleCol}>
            <AppText variant="heading" numberOfLines={1}>
              {workout.name || t('analytics.workoutNameFallback')}
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {dateStr}
            </AppText>
          </View>
          <View style={styles.cardTopRight}>
            {workout.prCount > 0 ? <Tag label={`PR ${workout.prCount}`} tone="pr" /> : null}
            <IconButton icon="trash-outline" color="textMuted" size={18} onPress={onDelete} />
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </View>
        </View>
        <View style={styles.metaRow}>
          <Meta label={t('analytics.metaVolume')} value={formatWeight(workout.totalVolumeKg, weightUnit)} />
          <Meta label={t('analytics.metaDuration')} value={formatDuration(workout.durationSeconds)} />
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
