// @plm SRS-003  세션 종목 블록 — 템플릿 세트 그리드(세트타입·이전기록·PR·직접입력·완료체크·삭제)
// @plm SRS-004  세트 추가/삭제·종목 삭제 (Hevy식)
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, IconButton, NumberStepper } from '../../components';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { useQueryData } from '../../db/hooks';
import { workoutRepo, type LogSetInput } from '../../data';
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

// 세트타입 라벨(순서 의존) — 일반 세트만 1,2,3.. 증가, 워밍업 W·드롭 D·실패 F.
function setTypeLabel(s: SetLog, normalOrdinal: number): string {
  if (s.isWarmup) return 'W';
  if (s.isDrop === true) return 'D';
  if (s.isFailed) return 'F';
  return String(normalOrdinal);
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
  const [prevSets, setPrevSets] = useState<LogSetInput[]>([]);
  const [pr, setPr] = useState<{ weightKg: number; reps: number } | null>(null);
  useEffect(() => {
    let active = true;
    workoutRepo.getPreviousExerciseSets(we.exerciseId).then((s) => active && setPrevSets(s)).catch(() => {});
    workoutRepo.getExercisePR(we.exerciseId).then((p) => active && setPr(p)).catch(() => {});
    return () => {
      active = false;
    };
  }, [we.exerciseId]);

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
        onPress: () => workoutRepo.removeWorkoutExercise(we.id).catch((e) => Alert.alert(t('common.error'), String(e))),
      },
    ]);
  }

  // 일반 세트 순번 계산(타입 라벨용).
  let normalCount = 0;
  const labels = sets.map((s) => {
    if (!s.isWarmup && s.isDrop !== true && !s.isFailed) normalCount += 1;
    return setTypeLabel(s, normalCount);
  });

  return (
    <Card style={styles.block}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ExerciseName exerciseId={we.exerciseId} variant="heading" />
          {pr ? (
            <AppText variant="caption" color="pr" style={{ marginTop: 2 }}>
              {t('session.prLine', { weight: formatWeight(pr.weightKg, weightUnit), reps: pr.reps })}
            </AppText>
          ) : null}
        </View>
        <IconButton icon="trash-outline" color="textMuted" size={20} onPress={confirmRemove} />
      </View>

      {/* 그리드 헤더 */}
      <View style={styles.gridHead}>
        <AppText variant="label" color="textFaint" style={styles.colType}>
          {t('session.setColHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colPrev}>
          {t('session.prevColHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colVal}>
          {t('session.weightLabel', { weightUnit })}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colVal}>
          {t('session.repsLabel')}
        </AppText>
        <View style={styles.colCheck} />
        <View style={styles.colDel} />
      </View>

      {sets.map((s, i) => (
        <SetRowEdit
          key={s.id}
          set={s}
          label={labels[i]}
          prev={prevSets[i]}
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

// ── 편집 가능한 세트 1행 ─────────────────────────────────────────────
function SetRowEdit({
  set,
  label,
  prev,
  weightUnit,
  barWeightKg,
  onRestStart,
}: {
  set: SetLog;
  label: string;
  prev: LogSetInput | undefined;
  weightUnit: WeightUnit;
  barWeightKg: number;
  onRestStart: () => void;
}) {
  const { t } = useT();
  const isDone = set.done === true;
  const [w, setW] = useState(() => numStr(fromKg(set.weightKg, weightUnit)));
  const [r, setR] = useState(() => String(set.reps));

  useEffect(() => setW(numStr(fromKg(set.weightKg, weightUnit))), [set.weightKg, weightUnit]);
  useEffect(() => setR(String(set.reps)), [set.reps]);

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
  function typeColor(): keyof typeof colors {
    if (set.isWarmup) return 'pr';
    if (set.isDrop === true) return 'primary';
    if (set.isFailed) return 'danger';
    return 'textMuted';
  }
  function typeMenu() {
    Alert.alert(t('session.setTypeTitle'), undefined, [
      { text: t('session.setType.normal'), onPress: () => workoutRepo.setSetType(set.id, 'normal').catch(() => {}) },
      { text: t('session.setType.warmup'), onPress: () => workoutRepo.setSetType(set.id, 'warmup').catch(() => {}) },
      { text: t('session.setType.drop'), onPress: () => workoutRepo.setSetType(set.id, 'drop').catch(() => {}) },
      { text: t('session.setType.failed'), onPress: () => workoutRepo.setSetType(set.id, 'failed').catch(() => {}) },
      { text: t('session.plateCalcTitle'), onPress: () => showPlates(set.weightKg, barWeightKg, weightUnit, t) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  function applyPrev() {
    if (!prev) return;
    workoutRepo.updateSetLog(set.id, { weightKg: prev.weightKg, reps: prev.reps }).catch(() => {});
  }
  function confirmDelete() {
    workoutRepo.deleteSetLog(set.id).catch((e) => Alert.alert(t('common.error'), String(e)));
  }

  return (
    <View style={[styles.setRow, isDone && styles.setRowDone]}>
      <Pressable onPress={typeMenu} hitSlop={4} style={styles.colType}>
        <AppText variant="caption" color={typeColor()} weight="bold" center>
          {label}
        </AppText>
      </Pressable>
      <Pressable onPress={applyPrev} hitSlop={4} style={styles.colPrev} disabled={!prev}>
        <AppText variant="caption" color={prev ? 'textMuted' : 'textFaint'} center>
          {prev ? `${formatWeight(prev.weightKg, weightUnit)}×${prev.reps}` : '–'}
        </AppText>
      </Pressable>
      <TextInput value={w} onChangeText={setW} onBlur={commitWeight} onSubmitEditing={commitWeight} keyboardType="numeric" selectTextOnFocus style={styles.cell} />
      <TextInput value={r} onChangeText={setR} onBlur={commitReps} onSubmitEditing={commitReps} keyboardType="numeric" selectTextOnFocus style={styles.cell} />
      <Pressable onPress={toggleDone} hitSlop={6} style={[styles.check, isDone && styles.checkOn]}>
        <Ionicons name="checkmark" size={16} color={isDone ? colors.onPrimary : colors.textFaint} />
      </Pressable>
      <Pressable onPress={confirmDelete} hitSlop={8} style={styles.del}>
        <Ionicons name="close" size={15} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  gridHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.xs },
  colType: { width: 30, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  colPrev: { width: 60, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  colVal: { flex: 1, textAlign: 'center' },
  colCheck: { width: 38 },
  colDel: { width: 26 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.xs },
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
    width: 38,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  // 삭제는 체크와 간격을 둔 far-right 작은 아이콘 — 체크 오탭 방지.
  del: { width: 26, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  restRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, minHeight: 44 },
  restSetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
});
