// @plm SRS-003  라이브 세션 세트 로깅 (무게·횟수·RPE·워밍업/실패·플레이트·휴식)
// @plm SRS-004  세션 진행 — 경과 타이머·일시정지/재개·종료·취소·종목 추가/삭제
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
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
  const { workoutId } = route.params;
  const { weightUnit, barWeightKg } = useUser();
  const { setActiveWorkoutId } = useSession();
  const weightStep = weightUnit === 'kg' ? 2.5 : 5;

  const [base, setBase] = useState<Workout | null>(null);
  const workout = useModelData(base);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);

  const exercises = useQueryData<WorkoutExercise>(() => workoutRepo.queryWorkoutExercises(workoutId), [workoutId]);

  useEffect(() => {
    let alive = true;
    workoutRepo
      .getWorkout(workoutId)
      .then((w) => {
        if (alive) setBase(w);
      })
      .catch((e) => Alert.alert('오류', String(e)));
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
      Alert.alert('오류', String(e));
    }
  }

  function handleAddExercise() {
    requestExercisePick((exId) => {
      workoutRepo.addExerciseToWorkout(workoutId, exId).catch((e) => Alert.alert('오류', String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  function confirmFinish() {
    Alert.alert('운동 종료', '이번 세션을 종료하고 요약을 볼까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '종료',
        onPress: async () => {
          setFinishing(true);
          try {
            await workoutRepo.completeWorkout(workoutId);
            setActiveWorkoutId(null);
            navigation.replace('WorkoutSummary', { workoutId });
          } catch (e) {
            setFinishing(false);
            Alert.alert('오류', String(e));
          }
        },
      },
    ]);
  }

  function confirmDiscard() {
    Alert.alert('운동 취소', '이 세션을 삭제할까요? 기록한 세트가 모두 사라집니다.', [
      { text: '계속하기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutRepo.discardWorkout(workoutId);
            setActiveWorkoutId(null);
            navigation.navigate('Tabs');
          } catch (e) {
            Alert.alert('오류', String(e));
          }
        },
      },
    ]);
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <EmptyState title="세션 불러오는 중" />
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
            {paused ? '일시정지됨' : workout.name ?? '진행 중'}
          </AppText>
        </View>
        <IconButton icon={paused ? 'play' : 'pause'} color="text" filled onPress={togglePause} />
        <Button title="완료" size="sm" fullWidth={false} onPress={confirmFinish} loading={finishing} style={styles.finishBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {exercises.length === 0 ? (
          <EmptyState
            title="종목이 없습니다"
            message="아래 버튼으로 운동을 추가해 세트를 기록하세요."
          />
        ) : (
          exercises.map((we) => (
            <ExerciseBlock
              key={we.id}
              we={we}
              weightUnit={weightUnit}
              weightStep={weightStep}
              barWeightKg={barWeightKg}
            />
          ))
        )}

        <Button title="운동 추가" icon="add" variant="secondary" onPress={handleAddExercise} style={{ marginTop: spacing.sm }} />

        <Button
          title="운동 취소(삭제)"
          variant="danger"
          icon="trash-outline"
          onPress={confirmDiscard}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
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
});
