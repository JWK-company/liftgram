// @plm SRS-003  세션 종목 블록 — 루틴 템플릿 세트 프리레이·편집·완료체크·휴식타이머
// @plm SRS-004  세트 추가/삭제·종목 삭제 (Hevy식: 세트 행을 미리 깔고 수행 시 체크)
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, IconButton, NumberStepper } from '../../components';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { useQueryData } from '../../db/hooks';
import { workoutRepo } from '../../data';
import type { SetLog, WorkoutExercise } from '../../db/models';
import { calcPlates, DEFAULT_PLATES_KG, formatWeight, fromKg, toKg, type WeightUnit } from '../../domain';
import { ExerciseName } from './ExerciseName';
import { useT, type TransKey } from '../../i18n';

interface ExerciseBlockProps {
  we: WorkoutExercise;
  weightUnit: WeightUnit;
  weightStep: number;
  barWeightKg: number;
}

const numStr = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showPlates(weightKg: number, barKg: number, unit: WeightUnit, t: (k: TransKey, v?: Record<string, string | number>) => string) {
  const bd = calcPlates(weightKg, { barKg, platesKg: DEFAULT_PLATES_KG });
  if (!bd.perSide.length) {
    Alert.alert(t('session.plateCalcTitle'), t('session.plateBarOnly', { barWeight: formatWeight(barKg, unit) }));
    return;
  }
  const perSide = bd.perSide.map((p) => `${p.plateKg}${p.count > 1 ? `×${p.count}` : ''}`).join(' + ');
  const lines = [
    t('session.plateTarget', { targetWeight: formatWeight(weightKg, unit) }),
    t('session.platePerSide', { perSide }),
    bd.leftoverKg > 0.01
      ? t('session.plateLeftover', { shortWeight: formatWeight(bd.leftoverKg, unit), achievableWeight: formatWeight(bd.achievableKg, unit) })
      : null,
  ].filter(Boolean);
  Alert.alert(t('session.plateCalcPerSideTitle'), lines.join('\n'));
}

export function ExerciseBlock({ we, weightUnit, weightStep, barWeightKg }: ExerciseBlockProps) {
  const { t } = useT();
  const sets = useQueryData<SetLog>(() => workoutRepo.querySetLogs(we.id), [we.id]);

  const [busy, setBusy] = useState(false);
  // 휴식 타이머 — 루틴 휴식(we.restSeconds)에서 초기화, 세트 완료 체크 시 시작.
  const [restSeconds, setRestSeconds] = useState<number>(we.restSeconds ?? 120);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (restRemaining == null) return;
    if (restRemaining <= 0) {
      setRestRemaining(null);
      Alert.alert(t('session.restOverTitle'), t('session.restOverMessage'));
      return;
    }
    const timer = setTimeout(() => setRestRemaining((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
  }, [restRemaining]);

  async function onAddSet() {
    if (busy) return;
    setBusy(true);
    try {
      await workoutRepo.addSet(we.id);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove() {
    Alert.alert(t('session.removeExerciseTitle'), t('session.removeExerciseMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          workoutRepo.removeWorkoutExercise(we.id).catch((e) => Alert.alert(t('common.error'), String(e)));
        },
      },
    ]);
  }

  return (
    <Card style={styles.block}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ExerciseName exerciseId={we.exerciseId} variant="heading" />
          {we.prevWeightKg != null ? (
            <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
              {t('session.prevRecord', { prevWeight: formatWeight(we.prevWeightKg, weightUnit), prevReps: we.prevReps ?? 0 })}
            </AppText>
          ) : null}
        </View>
        <IconButton icon="trash-outline" color="textMuted" size={20} onPress={confirmRemove} />
      </View>

      {/* 세트 그리드 헤더 */}
      <View style={styles.gridHead}>
        <AppText variant="label" color="textFaint" style={styles.colNum}>
          {t('session.setColHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colVal}>
          {t('session.weightLabel', { weightUnit })}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colVal}>
          {t('session.repsLabel')}
        </AppText>
        <View style={styles.colCheck} />
      </View>

      {sets.map((s, i) => (
        <SetRowEdit
          key={s.id}
          set={s}
          index={i}
          weightUnit={weightUnit}
          barWeightKg={barWeightKg}
          onRestStart={() => setRestRemaining(restSeconds)}
        />
      ))}

      <Button
        title={t('session.addSet')}
        icon="add"
        variant="secondary"
        onPress={onAddSet}
        loading={busy}
        style={{ marginTop: spacing.sm }}
      />

      {/* 휴식 타이머 */}
      <View style={styles.restRow}>
        {restRemaining != null ? (
          <>
            <Ionicons name="timer-outline" size={18} color={colors.primary} />
            <AppText variant="body" color="primary" weight="bold" style={{ marginLeft: spacing.xs }}>
              {t('session.restCountdown', { clock: formatClock(restRemaining) })}
            </AppText>
            <Pressable hitSlop={8} onPress={() => setRestRemaining(null)} style={{ marginLeft: spacing.md }}>
              <AppText variant="caption" color="textMuted">
                {t('session.skip')}
              </AppText>
            </Pressable>
          </>
        ) : (
          <View style={styles.restSetRow}>
            <AppText variant="caption" color="textMuted">
              {t('session.restTime')}
            </AppText>
            <NumberStepper value={restSeconds} onChange={setRestSeconds} step={15} min={0} max={600} suffix={t('session.secondsSuffix')} />
          </View>
        )}
      </View>
    </Card>
  );
}

// ── 편집 가능한 세트 1행 (무게/반복 직접입력 · 완료체크 · 롱프레스 메뉴) ──
function SetRowEdit({
  set,
  index,
  weightUnit,
  barWeightKg,
  onRestStart,
}: {
  set: SetLog;
  index: number;
  weightUnit: WeightUnit;
  barWeightKg: number;
  onRestStart: () => void;
}) {
  const { t } = useT();
  const isDone = set.done === true;
  const [w, setW] = useState(() => numStr(fromKg(set.weightKg, weightUnit)));
  const [r, setR] = useState(() => String(set.reps));

  // DB 값이 바뀌면(커밋·단위변경) 표시 동기화. 입력 중엔 DB가 안 바뀌므로 타이핑을 방해하지 않음.
  useEffect(() => {
    setW(numStr(fromKg(set.weightKg, weightUnit)));
  }, [set.weightKg, weightUnit]);
  useEffect(() => {
    setR(String(set.reps));
  }, [set.reps]);

  function commitWeight() {
    const n = parseFloat(w.replace(',', '.'));
    if (!Number.isNaN(n) && n >= 0) workoutRepo.updateSetLog(set.id, { weightKg: toKg(n, weightUnit) }).catch(() => {});
  }
  function commitReps() {
    const n = parseInt(r, 10);
    if (!Number.isNaN(n) && n >= 0) workoutRepo.updateSetLog(set.id, { reps: n }).catch(() => {});
  }
  function toggleDone() {
    const next = !isDone;
    workoutRepo.setSetDone(set.id, next).catch(() => {});
    if (next) onRestStart();
  }
  function menu() {
    Alert.alert(t('session.setNumber', { setNumber: index + 1 }), undefined, [
      {
        text: set.isWarmup ? t('session.unmarkWarmup') : t('session.markWarmup'),
        onPress: () => workoutRepo.updateSetLog(set.id, { isWarmup: !set.isWarmup }).catch(() => {}),
      },
      {
        text: set.isFailed ? t('session.unmarkFailed') : t('session.markFailed'),
        onPress: () => workoutRepo.updateSetLog(set.id, { isFailed: !set.isFailed }).catch(() => {}),
      },
      { text: t('session.plateCalcTitle'), onPress: () => showPlates(set.weightKg, barWeightKg, weightUnit, t) },
      { text: t('common.delete'), style: 'destructive', onPress: () => workoutRepo.deleteSetLog(set.id).catch(() => {}) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View style={[styles.setRow, isDone && styles.setRowDone]}>
      <Pressable onLongPress={menu} delayLongPress={300} hitSlop={4} style={styles.colNum}>
        <AppText variant="caption" color={set.isWarmup ? 'pr' : set.isFailed ? 'danger' : 'textMuted'} weight="bold" center>
          {set.isWarmup ? 'W' : String(index + 1)}
        </AppText>
      </Pressable>
      <TextInput
        value={w}
        onChangeText={setW}
        onBlur={commitWeight}
        onSubmitEditing={commitWeight}
        keyboardType="numeric"
        selectTextOnFocus
        style={styles.cell}
      />
      <TextInput
        value={r}
        onChangeText={setR}
        onBlur={commitReps}
        onSubmitEditing={commitReps}
        keyboardType="numeric"
        selectTextOnFocus
        style={styles.cell}
      />
      <Pressable onPress={toggleDone} hitSlop={6} style={[styles.check, isDone && styles.checkOn]}>
        <Ionicons name="checkmark" size={16} color={isDone ? colors.onPrimary : colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  gridHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.sm },
  colNum: { width: 36, alignItems: 'center', justifyContent: 'center' },
  colVal: { flex: 1, textAlign: 'center' },
  colCheck: { width: 40 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.sm },
  setRowDone: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm },
  cell: {
    flex: 1,
    height: 40,
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  check: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  restRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, minHeight: 44 },
  restSetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
});
