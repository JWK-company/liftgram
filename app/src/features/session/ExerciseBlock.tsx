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
import { workoutRepo, type LogSetInput } from '../../data';
import type { SetLog, WorkoutExercise } from '../../db/models';
import {
  calcPlates,
  DEFAULT_PLATES_KG,
  formatWeight,
  fromKg,
  roundToIncrement,
  suggestNextSet,
  toKg,
  type WeightUnit,
} from '../../domain';
import { ExerciseName } from './ExerciseName';
import { useT, type TransKey } from '../../i18n';

// 목표 반복범위 미설정(블랭크/목표없음) 시 더블 프로그레션 기본 범위.
const DEFAULT_REP_MIN = 8;
const DEFAULT_REP_MAX = 12;

interface ExerciseBlockProps {
  we: WorkoutExercise;
  weightUnit: WeightUnit;
  weightStep: number;
  barWeightKg: number;
  target?: { repMin: number; repMax: number }; // 점진 제안용 루틴 목표(SRS-010)
}

// 사용자 입력 표시값(unit)으로 정규화. weightStep 단위에 맞춰 라운드.
function defaultWeightDisplay(prevKg: number | null, unit: WeightUnit, step: number): number {
  const baseKg = prevKg != null && prevKg > 0 ? prevKg : 20; // 기본 20kg 상당(빈 바)
  return roundToIncrement(fromKg(baseKg, unit), step);
}

export function ExerciseBlock({ we, weightUnit, weightStep, barWeightKg, target }: ExerciseBlockProps) {
  const { t } = useT();
  const sets = useQueryData<SetLog>(() => workoutRepo.querySetLogs(we.id), [we.id]);

  // 마지막 working 세트(없으면 마지막 세트)를 자동채움 기준으로.
  const lastSet = useMemo(() => {
    const working = sets.filter((s) => !s.isWarmup && !s.isFailed);
    return working.length ? working[working.length - 1] : sets[sets.length - 1] ?? null;
  }, [sets]);

  // 점진 과부하 제안(SRS-010): 직전 세션 수행 + 목표 반복범위 → 다음 목표. 이력 없으면 null.
  const repMin = target?.repMin ?? DEFAULT_REP_MIN;
  const repMax = target?.repMax ?? DEFAULT_REP_MAX;
  const suggestion = useMemo(
    () =>
      suggestNextSet({
        lastWeightKg: we.prevWeightKg,
        lastReps: we.prevReps,
        repMin,
        repMax,
        incrementKg: toKg(weightStep, weightUnit),
      }),
    [we.prevWeightKg, we.prevReps, repMin, repMax, weightStep, weightUnit],
  );

  const [weightDisplay, setWeightDisplay] = useState<number>(() =>
    defaultWeightDisplay(we.prevWeightKg, weightUnit, weightStep),
  );
  const [reps, setReps] = useState<number>(() => we.prevReps ?? 8);
  const [rpe, setRpe] = useState<number>(0); // 0 = 미입력
  const [isWarmup, setIsWarmup] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [logging, setLogging] = useState(false);

  // 직전 완료 세션의 같은 종목 전체 세트 — 표시 + 세트별 순차 프리필용.
  // set_logs를 미리 만들지 않는다(이중 계상 방지) — 값만 읽어 입력을 채운다.
  const [prevSets, setPrevSets] = useState<LogSetInput[]>([]);
  useEffect(() => {
    let active = true;
    workoutRepo
      .getPreviousExerciseSets(we.exerciseId)
      .then((s) => {
        if (active) setPrevSets(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [we.exerciseId]);

  // 자동채움: 이번 세션에서 로그한 세트 수만큼의 위치에 있는 '지난 세트' 값으로 입력을 순차 프리필
  // → Log Set만 누르면 지난 기록대로 채워짐(재입력 불필요). 지난 세트 소진 시 마지막 로그값 유지.
  const nextPrev = prevSets[sets.length];
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    const src = nextPrev ?? (lastSet ? { weightKg: lastSet.weightKg, reps: lastSet.reps } : null);
    if (src) {
      setWeightDisplay(roundToIncrement(fromKg(src.weightKg, weightUnit), weightStep));
      setReps(src.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets.length, nextPrev?.weightKg, nextPrev?.reps, lastSet?.id]);

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
      Alert.alert(t('session.restOverTitle'), t('session.restOverMessage'));
      return;
    }
    const timer = setTimeout(() => setRestRemaining((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
  }, [restRemaining]);

  const currentWeightKg = toKg(weightDisplay, weightUnit);

  async function handleLog() {
    if (reps <= 0) {
      Alert.alert(t('common.confirm'), t('session.repsMinError'));
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
      Alert.alert(t('common.error'), String(e));
    } finally {
      setLogging(false);
    }
  }

  function handlePlates() {
    const bd = calcPlates(currentWeightKg, { barKg: barWeightKg, platesKg: DEFAULT_PLATES_KG });
    if (!bd.perSide.length) {
      Alert.alert(t('session.plateCalcTitle'), t('session.plateBarOnly', { barWeight: formatWeight(barWeightKg, weightUnit) }));
      return;
    }
    const perSide = bd.perSide
      .map((p) => `${p.plateKg}${p.count > 1 ? `×${p.count}` : ''}`)
      .join(' + ');
    const lines = [
      t('session.plateTarget', { targetWeight: formatWeight(currentWeightKg, weightUnit) }),
      t('session.platePerSide', { perSide }),
      bd.leftoverKg > 0.01 ? t('session.plateLeftover', { shortWeight: formatWeight(bd.leftoverKg, weightUnit), achievableWeight: formatWeight(bd.achievableKg, weightUnit) }) : null,
    ].filter(Boolean);
    Alert.alert(t('session.plateCalcPerSideTitle'), lines.join('\n'));
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
          {we.prevWeightKg != null && prevSets.length === 0 ? (
            <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
              {t('session.prevRecord', { prevWeight: formatWeight(we.prevWeightKg, weightUnit), prevReps: we.prevReps ?? 0 })}
            </AppText>
          ) : null}
        </View>
        <IconButton icon="trash-outline" color="textMuted" size={20} onPress={confirmRemove} />
      </View>

      {/* 지난 기록(읽기전용) — 저장했던 세트가 보이도록 + 지금 로그할 위치를 강조.
          입력은 여기 값으로 순차 프리필되며, 실제 기록은 아래 'Log Set'으로 append. */}
      {prevSets.length ? (
        <View style={styles.prevRef}>
          <AppText variant="label" color="textFaint" style={{ marginBottom: 2 }}>
            {t('session.prevSetsLabel')}
          </AppText>
          <View style={styles.prevRefRow}>
            {prevSets.map((ps, i) => (
              <AppText
                key={i}
                variant="caption"
                color={i === sets.length ? 'primary' : 'textMuted'}
                weight={i === sets.length ? 'bold' : undefined}
              >
                {formatWeight(ps.weightKg, weightUnit)}×{ps.reps}
              </AppText>
            ))}
          </View>
        </View>
      ) : null}

      {sets.length ? (
        <View style={{ marginTop: spacing.sm }}>
          {sets.map((s) => (
            <SetRow key={s.id} set={s} weightUnit={weightUnit} />
          ))}
        </View>
      ) : (
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
          {t('session.noSetsLogged')}
        </AppText>
      )}

      <Divider />

      {/* 점진 과부하 제안(SRS-010) — 탭하면 입력에 적용 */}
      {suggestion ? (
        <Pressable
          onPress={() => {
            touched.current = true;
            setWeightDisplay(roundToIncrement(fromKg(suggestion.weightKg, weightUnit), weightStep));
            setReps(suggestion.reps);
          }}
          hitSlop={6}
          style={styles.suggestRow}
        >
          <Ionicons name="trending-up" size={15} color={colors.primary} />
          <View style={styles.suggestText}>
            <AppText variant="caption" color="primary" weight="bold">
              {t('progression.nextTarget')}: {formatWeight(suggestion.weightKg, weightUnit)} × {suggestion.reps}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {t(suggestion.reasonKey as TransKey, { inc: weightStep, unit: weightUnit })}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {/* 입력 행 */}
      <View style={styles.inputGrid}>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            {t('session.weightLabel', { weightUnit })}
          </AppText>
          <NumberStepper value={weightDisplay} onChange={(v) => { touched.current = true; setWeightDisplay(v); }} step={weightStep} min={0} />
        </View>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            {t('session.repsLabel')}
          </AppText>
          <NumberStepper value={reps} onChange={(v) => { touched.current = true; setReps(v); }} step={1} min={0} />
        </View>
      </View>

      <View style={styles.inputGrid}>
        <View style={styles.inputCol}>
          <AppText variant="label" color="textMuted">
            {t('session.rpeLabel')}
          </AppText>
          <NumberStepper value={rpe} onChange={setRpe} step={0.5} min={0} max={10} />
        </View>
        <View style={[styles.inputCol, styles.toggleCol]}>
          <ToggleChip label={t('session.warmup')} active={isWarmup} onPress={() => setIsWarmup((v) => !v)} />
          <ToggleChip label={t('session.failed')} active={isFailed} tone="danger" onPress={() => setIsFailed((v) => !v)} />
        </View>
      </View>

      <Button title={t('session.logSet')} icon="checkmark" onPress={handleLog} loading={logging} style={{ marginTop: spacing.sm }} />

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

      <Pressable onPress={handlePlates} style={styles.plateBtn} hitSlop={6}>
        <Ionicons name="barbell-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted" style={{ marginLeft: spacing.xs }}>
          {t('session.plateCalcTitle')}
        </AppText>
      </Pressable>
    </Card>
  );
}

// ── 기록된 세트 1행 (수정/삭제) ────────────────────────────────────
function SetRow({ set, weightUnit }: { set: SetLog; weightUnit: WeightUnit }) {
  const { t } = useT();
  function handlePress() {
    Alert.alert(t('session.setNumber', { setNumber: set.setNumber }), undefined, [
      {
        text: set.isFailed ? t('session.unmarkFailed') : t('session.markFailed'),
        onPress: () =>
          workoutRepo.updateSetLog(set.id, { isFailed: !set.isFailed }).catch((e) => Alert.alert(t('common.error'), String(e))),
      },
      {
        text: set.isWarmup ? t('session.unmarkWarmup') : t('session.markWarmup'),
        onPress: () =>
          workoutRepo.updateSetLog(set.id, { isWarmup: !set.isWarmup }).catch((e) => Alert.alert(t('common.error'), String(e))),
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => workoutRepo.deleteSetLog(set.id).catch((e) => Alert.alert(t('common.error'), String(e))),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }
  return (
    <Pressable onPress={handlePress} style={styles.setRow}>
      <AppText variant="caption" color="textMuted" style={{ width: 52 }}>
        {t('session.setNumber', { setNumber: set.setNumber })}
      </AppText>
      <AppText variant="body" style={{ flex: 1 }}>
        {formatWeight(set.weightKg, weightUnit)} × {set.reps}
        {set.rpe != null ? `  RPE ${set.rpe}` : ''}
      </AppText>
      {set.isWarmup ? <Tag label={t('session.warmup')} tone="muted" /> : null}
      {set.isFailed ? <Tag label={t('session.failed')} tone="default" /> : null}
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
  prevRef: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  prevRefRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  suggestText: { marginLeft: spacing.xs, flex: 1 },
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
