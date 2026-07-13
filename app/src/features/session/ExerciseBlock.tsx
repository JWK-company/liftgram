// @plm SRS-003  세션 종목 블록 — 템플릿 세트 그리드(세트타입·이전기록·PR·직접입력·완료체크·삭제)
// @plm SRS-004  세트 추가/삭제·종목 삭제 (Hevy식)
// @plm SRS-028  종목 변형(기구·그립·팔) 선택 — 변형별 이전기록·PR 분리
// @plm SRS-029  세트 로깅 정밀도 — 정자세 반복(strict reps)·보정무게(load adjust)
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, IconButton, NumberStepper, TextField, VariantSelector } from '../../components';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { useQueryData } from '../../db/hooks';
import { exerciseRepo, workoutRepo, type LogSetInput } from '../../data';
import type { SetLog, WorkoutExercise } from '../../db/models';
import {
  calcPlates,
  canonicalVariantKey,
  DEFAULT_PLATES_KG,
  formatWeight,
  fromKg,
  toKg,
  type ArmKey,
  type EquipmentType,
  type GripKey,
  type VariantDims,
  type WeightUnit,
} from '../../domain';
import { ExerciseName } from './ExerciseName';
import { useT, type TransKey } from '../../i18n';

interface ExerciseBlockProps {
  we: WorkoutExercise;
  weightUnit: WeightUnit;
  weightStep: number;
  barWeightKg: number;
  onStartRest: (seconds: number) => void; // 전역 휴식 카운트다운 시작(기존 것 교체)
  onSwap?: (workoutExerciseId: string) => void; // 운동 중 종목 교체(#22)
  onMoveUp?: () => void; // 운동 중 순서 위로(#11) — 없으면 최상단
  onMoveDown?: () => void; // 운동 중 순서 아래로(#11) — 없으면 최하단
  canSuperset?: boolean; // 세션에 종목 2개 이상 — 슈퍼셋 버튼 노출
  onSuperset?: () => void; // 운동 중 슈퍼셋 상대 선택 열기
  onUnsuperset?: () => void; // 슈퍼셋 해제
}

const numStr = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// 저장된 종목 변형 컬럼 → dims. @plm SRS-028
function recordVariant(we: WorkoutExercise): VariantDims {
  return { equipment: we.variantEquipment, grip: we.variantGrip as GripKey | null, arm: we.variantArm as ArmKey | null };
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

export function ExerciseBlock({ we, weightUnit, weightStep, barWeightKg, onStartRest, onSwap, onMoveUp, onMoveDown, canSuperset, onSuperset, onUnsuperset }: ExerciseBlockProps) {
  const { t } = useT();
  const sets = useQueryData<SetLog>(() => workoutRepo.querySetLogs(we.id), [we.id]);

  const [busy, setBusy] = useState(false);
  const [prevSets, setPrevSets] = useState<LogSetInput[]>([]);
  const [pr, setPr] = useState<{ weightKg: number; reps: number } | null>(null);

  // 종목 변형(기구·그립·팔) — 이전기록·PR을 이 변형 것으로 분리 조회. @plm SRS-028
  const [variant, setVariant] = useState<VariantDims>(() => recordVariant(we));
  useEffect(() => setVariant(recordVariant(we)), [we.variantEquipment, we.variantGrip, we.variantArm]);
  function onVariantChange(dims: VariantDims) {
    setVariant(dims); // 로컬 즉시 반영(이전·PR 재조회) + 영속
    workoutRepo.setVariant(we.id, dims).catch(() => {});
  }

  // 변형 칩(기구 옵션)용 종목 기본 기구.
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  useEffect(() => {
    let alive = true;
    exerciseRepo.getExercise(we.exerciseId).then((e) => alive && setBaseEquipment(e.equipment)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [we.exerciseId]);

  // 버킷 조회 키(canonical variant_key) — dims가 아니라 키로 조회해야 버킷이 일치한다.
  const variantKey = canonicalVariantKey(variant);
  useEffect(() => {
    let active = true;
    workoutRepo.getPreviousExerciseSets(we.exerciseId, variantKey).then((s) => active && setPrevSets(s)).catch(() => {});
    workoutRepo.getExercisePR(we.exerciseId, variantKey).then((p) => active && setPr(p)).catch(() => {});
    return () => {
      active = false;
    };
  }, [we.exerciseId, variantKey]);

  // 이 종목의 휴식 '설정'(초). 세트 완료 체크 시 이 값으로 전역 카운트다운을 시작(교체).
  // 카운트다운 자체는 전역(ActiveWorkoutScreen)에 1개만 존재 — 종목별로 따로 돌지 않는다.
  const [restSeconds, setRestSeconds] = useState<number>(we.restSeconds ?? 120);

  // 종목 메모(#7/#24) — 그날 느낌·포인트. blur 시 저장. 지난 세션 메모는 참고로 표시(다시 뜨게).
  const [note, setNote] = useState(() => we.note ?? '');
  useEffect(() => setNote(we.note ?? ''), [we.note]);
  const [prevNote, setPrevNote] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    workoutRepo.getPreviousExerciseNote(we.exerciseId, variantKey).then((n) => active && setPrevNote(n)).catch(() => {});
    return () => {
      active = false;
    };
  }, [we.exerciseId, variantKey]);
  function saveNote() {
    workoutRepo.setWorkoutExerciseNote(we.id, note).catch(() => {});
  }

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

  const grouped = !!we.supersetGroup;
  return (
    <Card style={[styles.block, grouped && styles.blockGrouped]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ExerciseName exerciseId={we.exerciseId} variant="heading" />
          <View style={styles.headerMeta}>
            <VariantSelector exerciseId={we.exerciseId} baseEquipment={baseEquipment} value={variant} onChange={onVariantChange} />
            {grouped ? (
              <View style={styles.supersetBadge}>
                <AppText variant="label" color="primary">
                  {t('session.superset')}
                </AppText>
              </View>
            ) : null}
            {pr ? (
              <AppText variant="caption" color="pr">
                {t('session.prLine', { weight: formatWeight(pr.weightKg, weightUnit), reps: pr.reps })}
              </AppText>
            ) : null}
          </View>
        </View>
        {onMoveUp || onMoveDown ? (
          <View style={styles.reorderCol}>
            {onMoveUp ? (
              <IconButton icon="chevron-up" color="textMuted" size={18} onPress={onMoveUp} />
            ) : (
              <View style={styles.reorderSpacer} />
            )}
            {onMoveDown ? (
              <IconButton icon="chevron-down" color="textMuted" size={18} onPress={onMoveDown} />
            ) : (
              <View style={styles.reorderSpacer} />
            )}
          </View>
        ) : null}
        {canSuperset && (onSuperset || onUnsuperset) ? (
          <IconButton
            icon="git-merge-outline"
            color={grouped ? 'primary' : 'textMuted'}
            size={20}
            onPress={() => (grouped ? onUnsuperset?.() : onSuperset?.())}
          />
        ) : null}
        {onSwap ? (
          <IconButton icon="swap-horizontal-outline" color="textMuted" size={20} onPress={() => onSwap(we.id)} />
        ) : null}
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
        <AppText variant="label" color="textFaint" style={styles.colPartial} center>
          {t('session.partialColHeader')}
        </AppText>
        <AppText variant="label" color="textFaint" style={styles.colArm} center>
          {t('session.armColHeader')}
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
          onRestStart={() => onStartRest(restSeconds)}
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

      {/* 종목 메모(#7/#24) — 그날 느낌·포인트. 지난 메모 참고 표시. */}
      <TextField
        value={note}
        onChangeText={setNote}
        onEndEditing={saveNote}
        onBlur={saveNote}
        placeholder={t('session.notePlaceholder')}
        multiline
        style={styles.noteInput}
        containerStyle={{ marginTop: spacing.sm }}
      />
      {prevNote && prevNote !== note.trim() ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
          {t('session.prevNote', { note: prevNote })}
        </AppText>
      ) : null}

      {/* 이 종목 휴식 '설정'(초). 실제 카운트다운은 전역 바 1개(ActiveWorkoutScreen). */}
      <View style={styles.restRow}>
        <View style={styles.restSetRow}>
          <AppText variant="caption" color="textMuted">
            {t('session.restTime')}
          </AppText>
          <NumberStepper value={restSeconds} onChange={setRestSeconds} step={15} min={0} max={600} suffix={t('session.secondsSuffix')} />
        </View>
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
  const isUni = set.arm === 'uni'; // v8: 세트별 편측(원암/원레그). null=투암(기본)
  const [w, setW] = useState(() => numStr(fromKg(set.weightKg, weightUnit)));
  const [r, setR] = useState(() => String(set.reps));
  const [pt, setPt] = useState(() => (set.partialReps != null && set.partialReps > 0 ? String(set.partialReps) : '')); // v9: 부분반복(깔짝)

  useEffect(() => setW(numStr(fromKg(set.weightKg, weightUnit))), [set.weightKg, weightUnit]);
  useEffect(() => setR(String(set.reps)), [set.reps]);
  useEffect(() => setPt(set.partialReps != null && set.partialReps > 0 ? String(set.partialReps) : ''), [set.partialReps]);

  function commitWeight() {
    const n = parseFloat(w.replace(',', '.'));
    if (!Number.isNaN(n) && n >= 0) workoutRepo.updateSetLog(set.id, { weightKg: toKg(n, weightUnit) }).catch(() => {});
  }
  function commitReps() {
    const n = parseInt(r, 10);
    if (!Number.isNaN(n) && n >= 0) workoutRepo.updateSetLog(set.id, { reps: n }).catch(() => {});
  }
  function commitPartial() {
    const txt = pt.trim();
    if (txt === '') return void workoutRepo.updateSetLog(set.id, { partialReps: null }).catch(() => {});
    const n = parseInt(txt, 10);
    if (!Number.isNaN(n) && n >= 0) workoutRepo.updateSetLog(set.id, { partialReps: n === 0 ? null : n }).catch(() => {});
  }
  function toggleDone() {
    const next = !isDone;
    workoutRepo.setSetDone(set.id, next).catch(() => {});
    if (next) onRestStart();
  }
  function toggleArm() {
    workoutRepo.setSetArm(set.id, isUni ? null : 'uni').catch(() => {});
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
    <View style={isDone && styles.setRowDone}>
    <View style={styles.setRow}>
      <Pressable onPress={typeMenu} hitSlop={4} style={styles.colType}>
        <View style={styles.typeChip}>
          <AppText variant="caption" color={typeColor()} weight="bold" center>
            {label}
          </AppText>
        </View>
      </Pressable>
      <Pressable onPress={applyPrev} hitSlop={4} style={styles.colPrev} disabled={!prev}>
        {prev ? (
          <View style={styles.prevChip}>
            <AppText variant="caption" color="primary" center numberOfLines={1}>
              {`${formatWeight(prev.weightKg, weightUnit)}×${prev.reps}${prev.partialReps ? `+${prev.partialReps}` : ''}`}
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color="textFaint" center>
            –
          </AppText>
        )}
      </Pressable>
      <TextInput value={w} onChangeText={setW} onBlur={commitWeight} onSubmitEditing={commitWeight} keyboardType="numeric" selectTextOnFocus style={styles.cell} />
      <TextInput value={r} onChangeText={setR} onBlur={commitReps} onSubmitEditing={commitReps} keyboardType="numeric" selectTextOnFocus style={styles.cell} />
      <TextInput
        value={pt}
        onChangeText={setPt}
        onBlur={commitPartial}
        onSubmitEditing={commitPartial}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textFaint}
        selectTextOnFocus
        style={[styles.cell, styles.partialCell]}
      />
      <Pressable onPress={toggleArm} hitSlop={4} style={[styles.armChip, isUni && styles.armChipOn]}>
        <AppText variant="caption" color={isUni ? 'primary' : 'textFaint'} weight={isUni ? 'bold' : 'regular'} center>
          {isUni ? t('session.armUni') : t('session.armBi')}
        </AppText>
      </Pressable>
      <Pressable onPress={toggleDone} hitSlop={6} style={[styles.check, isDone && styles.checkOn]}>
        <Ionicons name="checkmark" size={16} color={isDone ? colors.onPrimary : colors.textFaint} />
      </Pressable>
      <Pressable onPress={confirmDelete} hitSlop={8} style={styles.del}>
        <Ionicons name="close" size={15} color={colors.textFaint} />
      </Pressable>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  blockGrouped: { borderColor: colors.primary, borderWidth: 1 }, // 슈퍼셋 그룹 시각 표시
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  gridHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.xs },
  colType: { width: 34, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  colPrev: { width: 62, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  // 탭 가능 표시 — 칩(테두리/배경)으로 눌러볼 수 있음을 인지.
  typeChip: {
    minWidth: 28,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  prevChip: {
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  colVal: { flex: 1, textAlign: 'center' },
  colArm: { width: 42, textAlign: 'center' },
  colCheck: { width: 38 },
  colDel: { width: 26 },
  // 세트별 편측(투암/원암) 토글 — 기본 투암(회색), 원암 선택 시 primary 강조.
  armChip: {
    width: 42,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  armChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.xs },
  setRowDone: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm },
  // v9 부분반복(깔짝) 컬럼 — 정자세 옆 좁은 입력.
  // 부분(깔짝) — 횟수(flex 1)보다 작되 비율로 확보. 헤더도 같은 flex라 입력칸과 정렬 일치.
  colPartial: { flex: 0.7, textAlign: 'center' },
  partialCell: { flex: 0.7 },
  cell: {
    flex: 1,
    minWidth: 0, // 웹 <input> 기본폭이 flex 축소를 막아 행 오버플로 → 0으로 축소 허용
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
  noteInput: { minHeight: 38, textAlignVertical: 'top' },
  supersetBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  // 운동 중 순서 이동 화살표 열(#11).
  reorderCol: { alignItems: 'center', justifyContent: 'center' },
  reorderSpacer: { width: 18, height: 18 },
  restRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, minHeight: 44 },
  restSetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
});
