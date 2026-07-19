// @plm SRS-002  루틴 목록 + 세션 시작 + 진행중 세션 복구 배너
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
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
import { routineRepo, workoutRepo, analyticsRepo } from '../../data';
import type Routine from '../../db/models/Routine';
import { muscleLabel } from '../../domain';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function WorkoutTabScreen({ navigation }: TabScreenProps<'WorkoutTab'>) {
  const { t, lang } = useT();
  const { activeWorkoutId, setActiveWorkoutId } = useSession();
  const [busy, setBusy] = useState(false);

  const routines = useQueryData(() => routineRepo.queryRoutines(), []);

  // 오늘의 추천 루틴 (SRS-034) — 완료 이력 기반 예측. 화면 포커스/루틴변경/세션종료 시 갱신.
  const [reco, setReco] = useState<analyticsRepo.TodayRoutineReco | null>(null);
  const loadReco = useCallback(async () => {
    try {
      setReco(await analyticsRepo.getTodayRoutineRecommendation());
    } catch {
      setReco(null);
    }
  }, []);
  useFocusEffect(useCallback(() => { loadReco(); }, [loadReco]));
  useEffect(() => { loadReco(); }, [routines.length, activeWorkoutId, loadReco]);

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

  // 헤더(제목·추천·버튼·헬스장) — '내 루틴' 리스트 위 콘텐츠. FlatList 헤더로 넣어 탭 전체가 함께 스크롤된다.
  const header = (
    <View>
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

      {/* 오늘의 추천 루틴(SRS-034) — 아직 운동 전일 때만, '새 루틴' 위에 표시 */}
      {!activeWorkoutId && reco && !reco.alreadyWorkedOutToday ? (
        reco.status === 'ok' ? (
          <Card style={styles.recoCard}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <AppText variant="label" color="primary">{t('routines.todayRecoLabel')}</AppText>
              <AppText variant="heading" numberOfLines={1} style={{ marginTop: 2 }}>
                {reco.routineName}
              </AppText>
              <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {t('routines.todayRecoHint', { muscle: muscleLabel(reco.muscle!, lang) })}
              </AppText>
            </View>
            <Button
              title={t('routines.start')}
              icon="play"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={() => guardActive(() => doStartFromRoutine(reco.routineId!))}
            />
          </Card>
        ) : (
          <Card style={styles.recoCardMuted}>
            <AppText variant="label" color="textMuted">{t('routines.todayRecoLabel')}</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 4 }}>
              {t('routines.todayRecoInsufficient')}
            </AppText>
          </Card>
        )
      ) : null}

      {/* 새 운동 진입 3버튼 — 같은 크기로 연달아(#6) */}
      <Button title={t('routines.newRoutine')} icon="add" variant="secondary" onPress={() => navigation.navigate('RoutineEditor')} style={{ marginBottom: spacing.sm }} />
      <Button title={t('routines.quickStart')} icon="flash" loading={busy} onPress={() => guardActive(doStartBlank)} style={{ marginBottom: spacing.sm }} />
      <Button title={t('program.title')} icon="sparkles" variant="secondary" onPress={() => navigation.navigate('ProgramGenerator')} style={{ marginBottom: spacing.sm }} />

      {/* 주변 헬스장 발견(SRS-035) — 위치 기반 추천. 맥락상 '어디서 운동할까'. */}
      <Pressable onPress={() => navigation.navigate('NearbyGyms')} style={styles.gymEntry}>
        <Ionicons name="location" size={18} color={colors.primary} />
        <AppText variant="body" weight="medium" style={{ flex: 1 }}>{t('gyms.entry')}</AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <SectionHeader title={t('routines.myRoutines')} />
    </View>
  );

  return (
    <Screen padded={false}>
      {/* 탭 전체 스크롤 — 헤더를 FlatList 헤더로 넣어 '내 루틴' 리스트가 좁은 칸에 갇히지 않게 한다. */}
      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
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
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
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
  recoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  recoCardMuted: {
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.sm,
  },
  gymEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
