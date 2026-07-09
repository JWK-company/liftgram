// @plm SRS-003  라이브 세션 세트 로깅 (무게·횟수·RPE·워밍업/실패·플레이트·휴식)
// @plm SRS-004  세션 진행 — 경과 타이머·일시정지/재개·종료·취소·종목 추가/삭제
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, IconButton } from '../../components';
import { colors, radius, spacing } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { useSession } from '../../state/sessionContext';
import { useModelData, useQueryData } from '../../db/hooks';
import { workoutRepo } from '../../data';
import type { Workout, WorkoutExercise } from '../../db/models';
import { requestExercisePick } from '../../utils/picker';
import { primeRestSound, playRestDone } from '../../utils/sound';
import { useT } from '../../i18n';
import { ExerciseBlock } from './ExerciseBlock';

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
  const { setActiveWorkoutId } = useSession();
  const weightStep = weightUnit === 'kg' ? 2.5 : 5;

  const [base, setBase] = useState<Workout | null>(null);
  const workout = useModelData(base);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);

  // 전역 휴식 카운트다운 — 운동 전체에 1개만. 어느 종목이든 세트 완료 체크 시 그 종목 휴식으로
  // 교체(시작)된다 → 여러 종목 타이머가 동시에 돌지 않는다.
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const startRest = useCallback((seconds: number) => {
    primeRestSound(); // 세트 완료 체크(사용자 제스처) 시 웹 오디오 잠금 해제 → 종료음 재생 보장
    setRestRemaining(seconds > 0 ? seconds : null);
  }, []);
  useEffect(() => {
    if (restRemaining == null) return;
    if (restRemaining <= 0) {
      setRestRemaining(null);
      playRestDone(); // 휴식 종료 알림음 + 진동(Alert 대신)
      return;
    }
    const timer = setTimeout(() => setRestRemaining((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRemaining]);

  const exercises = useQueryData<WorkoutExercise>(() => workoutRepo.queryWorkoutExercises(workoutId), [workoutId]);

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
          <AppText variant="label" color={paused ? 'warning' : 'textMuted'}>
            {paused ? t('session.paused') : workout.name ?? t('session.inProgress')}
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
          exercises.map((we) => (
            <ExerciseBlock
              key={we.id}
              we={we}
              weightUnit={weightUnit}
              weightStep={weightStep}
              barWeightKg={barWeightKg}
              onStartRest={startRest}
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
          <Ionicons name="timer-outline" size={18} color={colors.onPrimary} />
          <AppText variant="body" weight="bold" style={styles.restBarText}>
            {t('session.restCountdown', { clock: formatClock(restRemaining) })}
          </AppText>
          <Pressable hitSlop={8} onPress={() => setRestRemaining((r) => (r == null ? null : r + 15))} style={styles.restBarBtn}>
            <AppText variant="caption" weight="bold" style={{ color: colors.onPrimary }}>
              +15s
            </AppText>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setRestRemaining(null)} style={styles.restBarBtn}>
            <AppText variant="caption" weight="bold" style={{ color: colors.onPrimary }}>
              {t('session.skip')}
            </AppText>
          </Pressable>
        </View>
      ) : null}
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
  finishBtn: { borderRadius: radius.pill, paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  restBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  restBarText: { color: colors.onPrimary, flex: 1 },
  restBarBtn: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
});
