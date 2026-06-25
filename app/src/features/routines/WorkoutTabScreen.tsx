// @plm SRS-002  루틴 목록 + 세션 시작 + 진행중 세션 복구 배너
import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Screen,
  Button,
  IconButton,
  AppText,
  Card,
  SectionHeader,
  EmptyState,
} from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { useSession } from '../../state/sessionContext';
import { useQueryData } from '../../db/hooks';
import { routineRepo, workoutRepo } from '../../data';
import type Routine from '../../db/models/Routine';
import { colors, spacing } from '../../theme';

export default function WorkoutTabScreen({ navigation }: TabScreenProps<'WorkoutTab'>) {
  const { activeWorkoutId, setActiveWorkoutId } = useSession();
  const [busy, setBusy] = useState(false);

  const routines = useQueryData(() => routineRepo.queryRoutines(), []);

  async function startBlank() {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startBlankWorkout();
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert('오류', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startFromRoutine(routineId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startWorkoutFromRoutine(routineId);
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert('오류', String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(routine: Routine) {
    Alert.alert('루틴 삭제', `'${routine.name}' 루틴을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.deleteRoutine(routine.id);
          } catch (e) {
            Alert.alert('오류', String(e));
          }
        },
      },
    ]);
  }

  async function duplicate(routine: Routine) {
    try {
      await routineRepo.duplicateRoutine(routine.id);
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  function openActions(routine: Routine) {
    Alert.alert(routine.name, undefined, [
      { text: '편집', onPress: () => navigation.navigate('RoutineEditor', { routineId: routine.id }) },
      { text: '복제', onPress: () => duplicate(routine) },
      { text: '삭제', style: 'destructive', onPress: () => confirmDelete(routine) },
      { text: '취소', style: 'cancel' },
    ]);
  }

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <AppText variant="display">운동</AppText>
          <Button
            title="새 루틴"
            icon="add"
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => navigation.navigate('RoutineEditor')}
          />
        </View>

        {activeWorkoutId ? (
          <Card style={styles.resumeCard}>
            <AppText variant="heading">진행 중인 운동</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
              이전에 시작한 운동 세션이 있습니다.
            </AppText>
            <Button
              title="이어서 운동하기"
              icon="play"
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId })}
            />
          </Card>
        ) : null}

        <Button
          title="빠른 운동 시작"
          icon="flash"
          loading={busy}
          onPress={startBlank}
          style={{ marginBottom: spacing.lg }}
        />

        <SectionHeader title="내 루틴" />

        <FlatList
          data={routines}
          keyExtractor={(r) => r.id}
          contentContainerStyle={routines.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <RoutineRow
              routine={item}
              busy={busy}
              onStart={() => startFromRoutine(item.id)}
              onActions={() => openActions(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="루틴이 없습니다"
              message="자주 하는 운동을 루틴으로 만들어 빠르게 시작하세요."
              action={
                <Button
                  title="새 루틴 만들기"
                  icon="add"
                  fullWidth={false}
                  onPress={() => navigation.navigate('RoutineEditor')}
                />
              }
            />
          }
        />
      </View>
    </Screen>
  );
}

function RoutineRow({
  routine,
  busy,
  onStart,
  onActions,
}: {
  routine: Routine;
  busy: boolean;
  onStart: () => void;
  onActions: () => void;
}) {
  const exercises = useQueryData(() => routineRepo.queryRoutineExercises(routine.id), [routine.id]);
  return (
    <Card style={styles.routineCard}>
      <View style={styles.routineInfo}>
        <AppText variant="heading" numberOfLines={1}>
          {routine.name}
        </AppText>
        <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {routine.folder ? `${routine.folder} · ` : ''}
          종목 {exercises.length}개
        </AppText>
      </View>
      <View style={styles.routineActions}>
        <Button title="시작" size="sm" fullWidth={false} disabled={busy} onPress={onStart} />
        <IconButton icon="ellipsis-vertical" color="textMuted" onPress={onActions} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  resumeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  routineInfo: { flex: 1, marginRight: spacing.md },
  routineActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  listContent: { paddingBottom: spacing.xxl },
  emptyContainer: { flexGrow: 1 },
});
