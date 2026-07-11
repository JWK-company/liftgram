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
import { useT } from '../../i18n';

export default function WorkoutTabScreen({ navigation }: TabScreenProps<'WorkoutTab'>) {
  const { t } = useT();
  const { activeWorkoutId, setActiveWorkoutId } = useSession();
  const [busy, setBusy] = useState(false);

  const routines = useQueryData(() => routineRepo.queryRoutines(), []);

  async function doStartBlank() {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startBlankWorkout();
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doStartFromRoutine(routineId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const w = await workoutRepo.startWorkoutFromRoutine(routineId);
      setActiveWorkoutId(w.id);
      navigation.navigate('ActiveWorkout', { workoutId: w.id });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  // 활성 운동이 있으면 새 운동 시작 전 확인(#3) — 바로 바뀌지 않게.
  function guardActive(start: () => void) {
    if (!activeWorkoutId) {
      start();
      return;
    }
    Alert.alert(t('routines.activeExistsTitle'), t('routines.activeExistsMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('routines.resumeInstead'), onPress: () => navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId }) },
      {
        text: t('routines.discardAndStart'),
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(activeWorkoutId);
          } catch {
            /* 이미 없으면 무시 */
          }
          setActiveWorkoutId(null);
          start();
        },
      },
    ]);
  }

  // 진행 중 운동 폐기(#4) — 이어서 하기 대신 기록 버리기.
  function discardActive() {
    if (!activeWorkoutId) return;
    Alert.alert(t('routines.discardWorkoutTitle'), t('routines.discardWorkoutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(activeWorkoutId);
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
          setActiveWorkoutId(null);
        },
      },
    ]);
  }

  function confirmDelete(routine: Routine) {
    Alert.alert(t('routines.deleteTitle'), t('routines.deleteConfirm', { routineName: routine.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.deleteRoutine(routine.id);
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  async function duplicate(routine: Routine) {
    try {
      await routineRepo.duplicateRoutine(routine.id);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  function openActions(routine: Routine) {
    Alert.alert(routine.name, undefined, [
      { text: t('routines.edit'), onPress: () => navigation.navigate('RoutineEditor', { routineId: routine.id }) },
      { text: t('routines.duplicate'), onPress: () => duplicate(routine) },
      { text: t('common.delete'), style: 'destructive', onPress: () => confirmDelete(routine) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <AppText variant="display">{t('routines.title')}</AppText>
          {activeWorkoutId ? (
            <Button
              title={t('routines.resumeWorkout')}
              icon="play"
              size="sm"
              fullWidth={false}
              onPress={() => navigation.navigate('ActiveWorkout', { workoutId: activeWorkoutId })}
            />
          ) : null}
        </View>

        {/* 진행 중 운동 — 폐기(#4) */}
        {activeWorkoutId ? (
          <Card style={styles.resumeCard}>
            <View style={styles.resumeRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{t('routines.activeWorkout')}</AppText>
                <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {t('routines.resumePrompt')}
                </AppText>
              </View>
              <Button title={t('routines.discardWorkoutButton')} variant="danger" size="sm" fullWidth={false} onPress={discardActive} />
            </View>
          </Card>
        ) : null}

        {/* 새 운동 진입 3버튼 — 같은 크기로 연달아(#6) */}
        <Button title={t('routines.newRoutine')} icon="add" variant="secondary" onPress={() => navigation.navigate('RoutineEditor')} style={{ marginBottom: spacing.sm }} />
        <Button title={t('routines.quickStart')} icon="flash" loading={busy} onPress={() => guardActive(doStartBlank)} style={{ marginBottom: spacing.sm }} />
        <Button title={t('program.title')} icon="sparkles" variant="secondary" onPress={() => navigation.navigate('ProgramGenerator')} style={{ marginBottom: spacing.lg }} />

        <SectionHeader title={t('routines.myRoutines')} />

        <FlatList
          data={routines}
          keyExtractor={(r) => r.id}
          contentContainerStyle={routines.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <RoutineRow
              routine={item}
              busy={busy}
              onStart={() => guardActive(() => doStartFromRoutine(item.id))}
              onActions={() => openActions(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={t('routines.listEmptyTitle')}
              message={t('routines.listEmptyMessage')}
              action={
                <Button
                  title={t('routines.createRoutine')}
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
  const { t } = useT();
  const exercises = useQueryData(() => routineRepo.queryRoutineExercises(routine.id), [routine.id]);
  return (
    <Card style={styles.routineCard}>
      <View style={styles.routineInfo}>
        <AppText variant="heading" numberOfLines={1}>
          {routine.name}
        </AppText>
        <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {routine.folder ? `${routine.folder} · ` : ''}
          {t('routines.exerciseCount', { count: exercises.length })}
        </AppText>
      </View>
      <View style={styles.routineActions}>
        <Button title={t('routines.start')} size="sm" fullWidth={false} disabled={busy} onPress={onStart} />
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
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
