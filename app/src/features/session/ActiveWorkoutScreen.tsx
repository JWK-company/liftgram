// @plm SRS-003  라이브 세션 세트 로깅 (무게·횟수·RPE·워밍업/실패·플레이트·휴식)
// @plm SRS-004  세션 진행 — 경과 타이머·일시정지/재개·종료·취소·종목 추가/삭제
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, IconButton, TextField } from '../../components';
import { colors, radius, spacing } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { useSession } from '../../state/sessionContext';
import { useModelData, useQueryData } from '../../db/hooks';
import { workoutRepo } from '../../data';
import type { Workout, WorkoutExercise } from '../../db/models';
import { requestExercisePick } from '../../utils/picker';
import { formatWeight } from '../../domain';
import { useT } from '../../i18n';
import { ExerciseBlock } from './ExerciseBlock';
import { ExerciseName } from './ExerciseName';

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// 경과초 = (now - startedAt - accumulatedPause). paused면 pausedAt 기준으로 동결.
function elapsedSeconds(w: Workout, now: number): number {
  const ref = w.state === 'paused' && w.pausedAt ? w.pausedAt : now;
  return Math.max(0, Math.round((ref - w.startedAt - w.accumulatedPauseMs) / 1000));
}

export default function ActiveWorkoutScreen({ navigation, route }: RootStackScreenProps<'ActiveWorkout'>) {
  const { t } = useT();
  const { workoutId } = route.params;
  const { weightUnit, barWeightKg } = useUser();
  const { setActiveWorkoutId, restRemaining, startRest, clearRest } = useSession();
  const weightStep = weightUnit === 'kg' ? 2.5 : 5;

  const [base, setBase] = useState<Workout | null>(null);
  const workout = useModelData(base);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  function openRename() {
    setNameDraft(workout?.name ?? '');
    setRenaming(true);
  }
  // 운동 도중 슈퍼셋 — 종목의 슈퍼셋 버튼 → 상대 선택 → 그룹 병합. 루틴 없이 즉석 가능.
  const ssMembers = (group: string | null) =>
    group ? exercises.filter((e) => e.supersetGroup === group).map((e) => e.id) : [];
  async function chooseSupersetPartner(partner: WorkoutExercise) {
    const target = supersetTarget;
    setSupersetTarget(null);
    if (!target || partner.id === target.id) return;
    const ids = [
      ...new Set([
        ...(target.supersetGroup ? ssMembers(target.supersetGroup) : [target.id]),
        ...(partner.supersetGroup ? ssMembers(partner.supersetGroup) : [partner.id]),
      ]),
    ];
    try {
      await workoutRepo.groupWorkoutExercisesAsSuperset(ids);
      setSsVersion((v) => v + 1);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }
  async function unlinkSuperset(we: WorkoutExercise) {
    const members = ssMembers(we.supersetGroup);
    try {
      await workoutRepo.ungroupWorkoutExercisesSuperset(members.length <= 2 ? members : [we.id]);
      setSsVersion((v) => v + 1);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  async function saveRename() {
    setRenaming(false);
    try {
      await workoutRepo.renameWorkout(workoutId, nameDraft);
    } catch {
      /* 이름 변경 실패 — 무시(다음 저장 시 재시도 가능) */
    }
  }

  // 휴식 카운트다운은 전역(sessionContext) — 화면을 옮겨도 유지되고 전역 바에도 표시된다(#12).

  // 실시간 총 볼륨(#5) — 세트 체크 즉시 근접 반영(1.5s 폴링). 완료 워킹세트만·보정무게/정자세 반영.
  const [liveVolume, setLiveVolume] = useState(0);
  useEffect(() => {
    const recompute = () => workoutRepo.getWorkoutLiveVolume(workoutId).then(setLiveVolume).catch(() => {});
    recompute();
    const iv = setInterval(recompute, 1500);
    return () => clearInterval(iv);
  }, [workoutId]);

  // 슈퍼셋 그룹 변경은 필드 업데이트라 query.observe()가 재방출 안 함 → 강제 재조회 키.
  const [ssVersion, setSsVersion] = useState(0);
  const [supersetTarget, setSupersetTarget] = useState<WorkoutExercise | null>(null);
  const exercises = useQueryData<WorkoutExercise>(() => workoutRepo.queryWorkoutExercises(workoutId), [workoutId, ssVersion]);

  useEffect(() => {
    let alive = true;
    workoutRepo
      .getWorkout(workoutId)
      .then((w) => {
        if (alive) setBase(w);
      })
      .catch((e) => Alert.alert(t('common.error'), String(e)));
    return () => {
      alive = false;
    };
  }, [workoutId]);

  // 1초 틱 — paused면 굳이 멈출 필요 없지만(표시값은 동결됨) 자원 절약 위해 정지.
  const paused = workout?.state === 'paused';
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  async function togglePause() {
    if (!workout) return;
    try {
      if (workout.state === 'paused') await workoutRepo.resumeWorkout(workoutId);
      else await workoutRepo.pauseWorkout(workoutId);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  function handleAddExercise() {
    requestExercisePick((exId) => {
      workoutRepo.addExerciseToWorkout(workoutId, exId).catch((e) => Alert.alert(t('common.error'), String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  // 운동 중 종목 순서 이동(#11) — 화살표로 위/아래. sort_order 재기입.
  function moveExercise(from: number, to: number) {
    if (to < 0 || to >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    workoutRepo.reorderWorkoutExercises(ids).catch((e) => Alert.alert(t('common.error'), String(e)));
  }

  // 운동 중 종목 교체(#22) — 삭제·재추가 없이 이 종목만 새 종목으로 교체.
  function handleSwapExercise(weId: string) {
    requestExercisePick((exId) => {
      workoutRepo.swapWorkoutExercise(weId, exId).catch((e) => Alert.alert(t('common.error'), String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  function confirmFinish() {
    Alert.alert(t('session.finishWorkout.title'), t('session.finishWorkout.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.finishWorkout.confirm'),
        onPress: async () => {
          setFinishing(true);
          try {
            await workoutRepo.completeWorkout(workoutId);
            setActiveWorkoutId(null);
            navigation.replace('WorkoutSummary', { workoutId });
          } catch (e) {
            setFinishing(false);
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  function confirmDiscard() {
    Alert.alert(t('session.discardWorkout.title'), t('session.discardWorkout.message'), [
      { text: t('session.discardWorkout.keepGoing'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(workoutId);
            setActiveWorkoutId(null);
            navigation.navigate('Tabs');
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <EmptyState title={t('session.loading')} />
      </SafeAreaView>
    );
  }

  const elapsed = elapsedSeconds(workout, now);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* 커스텀 헤더 바 (headerShown:false) */}
      <View style={styles.header}>
        <IconButton icon="chevron-down" color="text" onPress={() => navigation.goBack()} />
        <View style={styles.timerWrap}>
          <AppText variant="title" weight="bold">
            {formatClock(elapsed)}
          </AppText>
          <Pressable onPress={openRename} hitSlop={6} style={styles.nameRow}>
            <AppText variant="label" color={paused ? 'warning' : 'textMuted'} numberOfLines={1}>
              {paused ? t('session.paused') : workout.name ?? t('session.inProgress')}
            </AppText>
            <Ionicons name="pencil" size={12} color={colors.textFaint} style={{ marginLeft: 4 }} />
          </Pressable>
          <AppText variant="caption" color="pr">
            {t('session.liveVolume', { volume: formatWeight(liveVolume, weightUnit) })}
          </AppText>
        </View>
        <IconButton icon={paused ? 'play' : 'pause'} color="text" filled onPress={togglePause} />
        <Button title={t('session.done')} size="sm" fullWidth={false} onPress={confirmFinish} loading={finishing} style={styles.finishBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {exercises.length === 0 ? (
          <EmptyState
            title={t('session.noExercises.title')}
            message={t('session.noExercises.message')}
          />
        ) : (
          exercises.map((we, i) => (
            <ExerciseBlock
              key={we.id}
              we={we}
              weightUnit={weightUnit}
              weightStep={weightStep}
              barWeightKg={barWeightKg}
              onStartRest={startRest}
              onSwap={handleSwapExercise}
              onMoveUp={i > 0 ? () => moveExercise(i, i - 1) : undefined}
              onMoveDown={i < exercises.length - 1 ? () => moveExercise(i, i + 1) : undefined}
              canSuperset={exercises.length >= 2}
              onSuperset={() => setSupersetTarget(we)}
              onUnsuperset={() => unlinkSuperset(we)}
            />
          ))
        )}

        <Button title={t('session.addExercise')} icon="add" variant="secondary" onPress={handleAddExercise} style={{ marginTop: spacing.sm }} />

        <Button
          title={t('session.discardWorkoutButton')}
          variant="danger"
          icon="trash-outline"
          onPress={confirmDiscard}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>

      {/* 전역 휴식 카운트다운 바 — 운동 전체에 1개만(스크롤과 무관하게 항상 보임). */}
      {restRemaining != null ? (
        <View style={styles.restBar}>
          <Ionicons name="timer-outline" size={18} color={colors.bg} />
          <AppText variant="body" weight="bold" style={styles.restBarText}>
            {t('session.restCountdown', { clock: formatClock(restRemaining) })}
          </AppText>
          <Pressable hitSlop={8} onPress={() => startRest((restRemaining ?? 0) + 15)} style={styles.restBarBtn}>
            <AppText variant="caption" weight="bold" style={{ color: colors.bg }}>
              +15s
            </AppText>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => clearRest()} style={styles.restBarBtn}>
            <AppText variant="caption" weight="bold" style={{ color: colors.bg }}>
              {t('session.skip')}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      {/* 운동 이름 변경 모달 (@plm SRS-004) */}
      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <Pressable style={styles.renameBackdrop} onPress={() => setRenaming(false)}>
          <Pressable style={styles.renameCard} onPress={() => {}}>
            <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
              {t('session.renameTitle')}
            </AppText>
            <TextField
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('session.renamePlaceholder')}
              autoFocus
              onSubmitEditing={saveRename}
              containerStyle={{ marginBottom: spacing.md }}
            />
            <View style={styles.renameActions}>
              <Button title={t('common.cancel')} variant="secondary" fullWidth={false} onPress={() => setRenaming(false)} style={{ flex: 1 }} />
              <Button title={t('common.save')} fullWidth={false} onPress={saveRename} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 운동 도중 슈퍼셋 상대 선택 모달 (@plm SRS-004) */}
      <Modal visible={!!supersetTarget} transparent animationType="fade" onRequestClose={() => setSupersetTarget(null)}>
        <Pressable style={styles.renameBackdrop} onPress={() => setSupersetTarget(null)}>
          <Pressable style={styles.ssSheet} onPress={() => {}}>
            <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
              {t('routines.supersetPickTitle')}
            </AppText>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {exercises
                .filter((e) => e.id !== supersetTarget?.id)
                .map((e) => (
                  <Pressable key={e.id} style={styles.ssOption} onPress={() => chooseSupersetPartner(e)}>
                    <ExerciseName exerciseId={e.exerciseId} variant="body" />
                    {e.supersetGroup ? (
                      <View style={styles.supersetBadgeSmall}>
                        <AppText variant="label" color="primary">
                          {t('session.superset')}
                        </AppText>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
            </ScrollView>
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setSupersetTarget(null)} style={{ marginTop: spacing.md }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  timerWrap: { flex: 1, marginLeft: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  finishBtn: { borderRadius: radius.pill, paddingHorizontal: spacing.lg },
  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  renameCard: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  renameActions: { flexDirection: 'row', gap: spacing.sm },
  ssSheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%' },
  ssOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  supersetBadgeSmall: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  restBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.pr, // 휴식 = PR 골드로 신호(#1) — 파랑 primary와 구분되는 '쉬는 중' 배경색.
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  restBarText: { color: colors.bg, flex: 1 },
  restBarBtn: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
});
