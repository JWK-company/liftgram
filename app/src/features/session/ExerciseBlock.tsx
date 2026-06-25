// @plm SRS-003  세션 종목 블록 — 세트 로깅·이전기록 자동채움·휴식타이머·플레이트 계산
// @plm SRS-004  종목 삭제·세트 수정/삭제
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppText,
  Button,
  Card,
  Divider,
  IconButton,
  NumberStepper,
  Tag,
} from '../../components';
import { colors, fontWeight, radius, spacing } from '../../theme';
import { useQueryData } from '../../db/hooks';
import { workoutRepo } from '../../data';
import type { SetLog, WorkoutExercise } from '../../db/models';
import {
  calcPlates,
  DEFAULT_PLATES_KG,
  formatWeight,
  fromKg,
  roundToIncrement,
  toKg,
  type WeightUnit,
} from '../../domain';
import { ExerciseName } from './ExerciseName';

interface ExerciseBlockProps {
  we: WorkoutExercise;
  weightUnit: WeightUnit;
  weightStep: number;
  barWeightKg: number;
}

// 사용자 입력 표시값(unit)으로 정규화. weightStep 단위에 맞춰 라운드.
function defaultWeightDisplay(prevKg: number | null, unit: WeightUnit, step: number): number {
  const baseKg = prevKg != null && prevKg > 0 ? prevKg : 20; // 기본 20kg 상당(빈 바)
  return roundToIncrement(fromKg(baseKg, unit), step);
}

export function ExerciseBlock({ we, weightUnit, weightStep, barWeightKg }: ExerciseBlockProps) {
  const sets = useQueryData<SetLog>(() => workoutRepo.querySetLogs(we.id), [we.id]);

  // 마지막 working 세트(없으면 마지막 세트)를 자동채움 기준으로.
  const lastSet = useMemo(() => {
    const working = sets.filter((s) => !s.isWarmup && !s.isFailed);
    return working.length ? working[working.length - 1] : sets[sets.length - 1] ?? null;
  }, [sets]);

  const [weightDisplay, setWeightDisplay] = useState<number>(() =>
    defaultWeightDisplay(we.prevWeightKg, weightUnit, weightStep),
  );
  const [reps, setReps] = useState<number>(() => we.prevReps ?? 8);
  const [rpe, setRpe] = useState<number>(0); // 0 = 미입력
  const [isWarmup, setIsWarmup] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [logging, setLogging] = useState(false);

  // 자동채움: 마지막 세트가 있으면 그 값으로, 없으면 이전 세션 스냅샷.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    if (lastSet) {
      setWeightDisplay(roundToIncrement(fromKg(lastSet.weightKg, weightUnit), weightStep));
      setReps(lastSet.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSet?.id]);

  // 단위(kg↔lb) 변경 시 편집 중인 표시값을 실제 kg 기준으로 재변환(잘못된 kg 저장 방지).
  const prevUnitRef = useRef<WeightUnit>(weightUnit);
  useEffect(() => {
    if (prevUnitRef.current !== weightUnit) {
      const oldUnit = prevUnitRef.current;
      setWeightDisplay((d) => roundToIncrement(fromKg(toKg(d, oldUnit), weightUnit), weightStep));
      prevUnitRef.current = weightUnit;
    }
  }, [weightUnit, weightStep]);

  // ── 휴식 타이머 (ephemeral) ──────────────────────────────────────
  const [restSeconds, setRestSeconds] = useState(120);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (restRemaining == null) return;
    if (restRemaining <= 0) {
      setRestRemaining(null);
      Alert.alert('휴식 종료', '다음 세트를 시작하세요.');
      return;
    }
    const t = setTimeout(() => setRestRemaining((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [restRemaining]);

  const currentWeightKg = toKg(weightDisplay, weightUnit);

  async function handleLog() {
    if (reps <= 0) {
      Alert.alert('확인', '횟수는 1 이상이어야 합니다.');
      return;
    }
    setLogging(true);
    try {
      await workoutRepo.logSet(we.id, {
        weightKg: currentWeightKg,
        reps,
        rpe: rpe > 0 ? rpe : null,
        isWarmup,
        isFailed,
      });
      touched.current = false; // 다음 세트 자동채움 허용
      setIsFailed(false);
      setIsWarmup(false); // 다음 세트는 기본 워킹 세트로(워밍업 플래그 잔류 방지)
      setRestRemaining(restSeconds); // 휴식 타이머 시작/리셋
    } catch (e) {
      Alert.alert('오류', String(e));
    } finally {
      setLogging(false);
    }
  }

  function handlePlates() {
    const bd = calcPlates(currentWeightKg, { barKg: barWeightKg, platesKg: DEFAULT_PLATES_KG });
    if (!bd.perSide.length) {
      Alert.alert('플레이트 계산', `바(${formatWeight(barWeightKg, weightUnit)})만으로 충분합니다.`);
      return;
    }
    const perSide = bd.perSide
      .map((p) => `${p.plateKg}${p.count > 1 ? `×${p.count}` : ''}`)
      .join(' + ');
    const lines = [
      `목표: ${formatWeight(currentWeightKg, weightUnit)}`,
      `한쪽: ${perSide}kg`,
      bd.leftoverKg > 0.01 ? `※ ${formatWeight(bd.leftoverKg, weightUnit)} 부족(가능 ${formatWeight(bd.achievableKg, weightUnit)})` : null,
    ].filter(Boolean);
    Alert.alert('플레이트 계산 (한쪽)', lines.join('\n'));
  }

  function confirmRemove() {
    Alert.alert('운동 삭제', '이 종목과 기록한 세트를 모두 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          workoutRepo.removeWorkoutExercise(we.id).catch((e) => Alert.alert('오류', String(e)));
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
              이전: {formatWeight(we.prevWeightKg, weightUnit)} × {we.prevReps ?? 0}
            </AppText>
          ) : null}
        </View>
        <IconButton icon="trash-outline" color="textMuted" size={20} onPress={confirmRemove} />
      </View>

      {sets.length ? (
        <View style={{ marginTop: spacing.sm }}>
          {sets.map((s) => (
            <SetRow key={s.id} set={s} weightUnit={weightUnit} />
          ))}
        </View>
      ) : (
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
          아직 기록된 세트가 없습니다.
        </AppText>
      )}

      <Divider />

      {/* 입력 행 */}
      <View style={styles.inputGrid}>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            무게 ({weightUnit})
          </AppText>
          <NumberStepper value={weightDisplay} onChange={(v) => { touched.current = true; setWeightDisplay(v); }} step={weightStep} min={0} />
        </View>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            횟수
          </AppText>
          <NumberStepper value={reps} onChange={(v) => { touched.current = true; setReps(v); }} step={1} min={0} />
        </View>
      </View>

      <View style={styles.inputGrid}>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            RPE (0=없음)
          </AppText>
          <NumberStepper value={rpe} onChange={setRpe} step={0.5} min={0} max={10} />
        </View>
        <View style={[styles.inputCol, styles.toggleCol]}>
          <ToggleChip label="워밍업" active={isWarmup} onPress={() => setIsWarmup((v) => !v)} />
          <ToggleChip label="실패" active={isFailed} tone="danger" onPress={() => setIsFailed((v) => !v)} />
        </View>
      </View>

      <Button title="세트 기록" icon="checkmark" onPress={handleLog} loading={logging} style={{ marginTop: spacing.sm }} />

      {/* 휴식 타이머 */}
      <View style={styles.restRow}>
        {restRemaining != null ? (
          <>
            <Ionicons name="timer-outline" size={18} color={colors.primary} />
            <AppText variant="body" color="primary" weight="bold" style={{ marginLeft: spacing.xs }}>
              휴식 {formatClock(restRemaining)}
            </AppText>
            <Pressable hitSlop={8} onPress={() => setRestRemaining(null)} style={{ marginLeft: spacing.md }}>
              <AppText variant="caption" color="textMuted">
                건너뛰기
              </AppText>
            </Pressable>
          </>
        ) : (
          <View style={styles.restSetRow}>
            <AppText variant="caption" color="textMuted">
              휴식 시간
            </AppText>
            <NumberStepper value={restSeconds} onChange={setRestSeconds} step={15} min={0} max={600} suffix="초" />
          </View>
        )}
      </View>

      <Pressable onPress={handlePlates} style={styles.plateBtn} hitSlop={6}>
        <Ionicons name="barbell-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted" style={{ marginLeft: spacing.xs }}>
          플레이트 계산
        </AppText>
      </Pressable>
    </Card>
  );
}

// ── 기록된 세트 1행 (수정/삭제) ────────────────────────────────────
function SetRow({ set, weightUnit }: { set: SetLog; weightUnit: WeightUnit }) {
  function handlePress() {
    Alert.alert(`세트 ${set.setNumber}`, undefined, [
      {
        text: set.isFailed ? '실패 해제' : '실패 표시',
        onPress: () =>
          workoutRepo.updateSetLog(set.id, { isFailed: !set.isFailed }).catch((e) => Alert.alert('오류', String(e))),
      },
      {
        text: set.isWarmup ? '워밍업 해제' : '워밍업 표시',
        onPress: () =>
          workoutRepo.updateSetLog(set.id, { isWarmup: !set.isWarmup }).catch((e) => Alert.alert('오류', String(e))),
      },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => workoutRepo.deleteSetLog(set.id).catch((e) => Alert.alert('오류', String(e))),
      },
      { text: '취소', style: 'cancel' },
    ]);
  }
  return (
    <Pressable onPress={handlePress} style={styles.setRow}>
      <AppText variant="caption" color="textMuted" style={{ width: 52 }}>
        세트 {set.setNumber}
      </AppText>
      <AppText variant="body" style={{ flex: 1 }}>
        {formatWeight(set.weightKg, weightUnit)} × {set.reps}
        {set.rpe != null ? `  RPE ${set.rpe}` : ''}
      </AppText>
      {set.isWarmup ? <Tag label="워밍업" tone="muted" /> : null}
      {set.isFailed ? <Tag label="실패" tone="default" /> : null}
    </Pressable>
  );
}

// ── 토글 칩 ─────────────────────────────────────────────────────────
function ToggleChip({
  label,
  active,
  onPress,
  tone = 'primary',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: 'primary' | 'danger';
}) {
  const accent = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? accent : colors.border, backgroundColor: active ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <AppText variant="caption" style={{ color: active ? accent : colors.textMuted, fontWeight: fontWeight.medium }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  inputGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  inputCol: { flex: 1, gap: spacing.xs },
  toggleCol: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  restRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, minHeight: 44 },
  restSetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  plateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
