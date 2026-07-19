// @plm SRS-003  세션 종목 블록 — 템플릿 세트 그리드(세트타입·이전기록·PR·직접입력·완료체크·삭제)
// @plm SRS-004  세트 추가/삭제·종목 삭제 (Hevy식)
// @plm SRS-028  종목 변형(기구·그립·팔) 선택 — 변형별 이전기록·PR 분리
// @plm SRS-029  세트 로깅 정밀도 — 정자세 반복(strict reps)·보정무게(load adjust)
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
  formatCardioSet,
  formatDurationClock,
  formatDistanceKm,
  secToMinInput,
  minInputToSec,
  mToKmInput,
  kmInputToM,
  sumCardio,
  cardioMetricsFor,
  cardioNumInput,
  inputToIncline,
  inputToLevel,
  type CardioMetric,
  GRIP_KEYS,
  gripLabel,
  gripShortLabel,
  effectiveWeightKg,
  resolveLoadMode,
  type ArmKey,
  type EquipmentType,
  type GripKey,
  type LoadMode,
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
  bodyweightKg: number | null; // v12: 어시스트/맨몸±가중 유효무게 계산. @plm SRS-033
  onStartRest: (seconds: number) => void; // 전역 휴식 카운트다운 시작(기존 것 교체)
  onSwap?: (workoutExerciseId: string) => void; // 운동 중 종목 교체(#22)
  onMoveUp?: () => void; // 운동 중 순서 위로(#11) — 없으면 최상단
  onMoveDown?: () => void; // 운동 중 순서 아래로(#11) — 없으면 최하단
  canSuperset?: boolean; // 세션에 종목 2개 이상 — 슈퍼셋 버튼 노출
  onSuperset?: () => void; // 운동 중 슈퍼셋 상대 선택 열기
  onUnsuperset?: () => void; // 슈퍼셋 해제
  insideSuperset?: boolean; // 슈퍼셋 공통 컨테이너 안에 렌더 — 개별 테두리·배지·이동/슈퍼셋 버튼 숨김(컨테이너가 담당). @plm SRS-004
}

const numStr = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// 저장된 종목 변형 컬럼 → dims. 그립·팔은 세트별로 이동(v11/v8)했으므로 종목 변형 버킷은 기구만.
// (레거시 variant_grip/arm은 backfillDropGripArmV11이 버킷 키에서 제거 → 신규/즉석/루틴이 한 버킷으로 통합.) @plm SRS-028
function recordVariant(we: WorkoutExercise): VariantDims {
  return { equipment: we.variantEquipment, grip: null, arm: null };
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

export function ExerciseBlock({ we, weightUnit, weightStep, barWeightKg, bodyweightKg, onStartRest, onSwap, onMoveUp, onMoveDown, canSuperset, onSuperset, onUnsuperset, insideSuperset }: ExerciseBlockProps) {
  const { t } = useT();
  const sets = useQueryData<SetLog>(() => workoutRepo.querySetLogs(we.id), [we.id]);

  const [busy, setBusy] = useState(false);
  const [prevSets, setPrevSets] = useState<LogSetInput[]>([]);
  const [pr, setPr] = useState<{ weightKg: number; reps: number } | null>(null);
  const [prevCleared, setPrevCleared] = useState(false); // 이 종목 이전기록 표시 숨김(세션 로컬). @plm SRS-004
  const [loadMode, setLoadMode] = useState<LoadMode>('external'); // v12: 어시스트/맨몸 하중모드(볼륨 계산). @plm SRS-033

  // 종목별 볼륨(#) — 무게·횟수·done은 필드변경이라 observe 미반영 → 1.5s 틱으로 재계산(전역 볼륨과 동일 방식). @plm SRS-005
  const [volTick, setVolTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setVolTick((v) => v + 1), 1500);
    return () => clearInterval(iv);
  }, []);
  const exVol = useMemo(() => {
    const perf = sets.filter((s) => s.done !== false && !s.isWarmup && !s.isFailed);
    // v12: 어시스트=체중-무게, 맨몸=체중+무게, 외부=무게. 체중 미설정이면 raw 무게. @plm SRS-033
    const eff = (s: SetLog) => effectiveWeightKg({ weightKg: s.weightKg, reps: s.reps, isWarmup: s.isWarmup, isFailed: s.isFailed, loadMode, bodyweightKg });
    const volume = perf.reduce((sum, s) => sum + eff(s) * s.reps, 0);
    const reps = perf.reduce((sum, s) => sum + s.reps, 0);
    return { volume, reps };
    // volTick를 의존성에 넣어 필드변경(무게/횟수/done)을 주기적으로 반영. sets 배열은 add/remove시만 재방출.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, volTick, loadMode, bodyweightKg]);

  // 종목 변형(기구·그립·팔) — 이전기록·PR을 이 변형 것으로 분리 조회. @plm SRS-028
  const [variant, setVariant] = useState<VariantDims>(() => recordVariant(we));
  useEffect(() => setVariant(recordVariant(we)), [we.variantEquipment, we.variantGrip, we.variantArm]);
  function onVariantChange(dims: VariantDims) {
    setVariant(dims); // 로컬 즉시 반영(이전·PR 재조회) + 영속
    workoutRepo.setVariant(we.id, dims).catch(() => {});
  }

  // 변형 칩(기구 옵션)용 종목 기본 기구 + 유산소 여부(cardio면 세트 행을 시간·거리로 렌더). @plm SRS-030
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  const [isCardio, setIsCardio] = useState(false);
  const [cardioMetrics, setCardioMetrics] = useState<CardioMetric[]>(['duration', 'distance']);
  useEffect(() => {
    let alive = true;
    exerciseRepo
      .getExercise(we.exerciseId)
      .then((e) => {
        if (!alive) return;
        setBaseEquipment(e.equipment);
        setIsCardio(e.kind === 'cardio');
        setCardioMetrics(cardioMetricsFor({ nameEn: e.nameEn })); // 종목별 유산소 지표(경사/단계 등). @plm SRS-030
        setLoadMode(resolveLoadMode(e));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [we.exerciseId]);

  // 버킷 조회 키(canonical variant_key) — dims가 아니라 키로 조회해야 버킷이 일치한다.
  const variantKey = canonicalVariantKey(variant);
  useEffect(() => {
    let active = true;
    setPrevCleared(false); // 종목/변형이 바뀌면 새 이전기록 컨텍스트 → 숨김 해제
    workoutRepo.getPreviousExerciseSets(we.exerciseId, variantKey).then((s) => active && setPrevSets(s)).catch(() => {});
    workoutRepo.getExercisePR(we.exerciseId, variantKey).then((p) => active && setPr(p)).catch(() => {});
    return () => {
      active = false;
    };
  }, [we.exerciseId, variantKey]);
  // 표시용 이전기록 — 지우면 숨김(세션 로컬).
  const shownPrev = prevCleared ? [] : prevSets;

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
  // 과거 메모·팁 타임라인(#34) — 지연 로드. 종목/변형 바뀌면 리셋. @plm SRS-004
  const [noteHistory, setNoteHistory] = useState<workoutRepo.ExerciseNoteEntry[] | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  useEffect(() => {
    setNoteHistory(null);
    setHistOpen(false);
  }, [we.exerciseId, variantKey]);
  function toggleNoteHistory() {
    const next = !histOpen;
    setHistOpen(next);
    if (next && noteHistory === null) {
      workoutRepo
        .getExerciseNoteHistory(we.exerciseId, variantKey)
        .then((h) => setNoteHistory(h))
        .catch(() => setNoteHistory([]));
    }
  }
  const histDateFmt = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  // 이전기록이 하나라도 있으면(세트·PR·메모) 지우기 토글 노출. @plm SRS-004
  const hasPrev = prevSets.length > 0 || pr !== null || (!!prevNote && prevNote !== note.trim());

  async function onAddSet() {
    if (busy) return;
    setBusy(true);
    try {
      await workoutRepo.addSet(we.id, { cardio: isCardio, bodyweight: baseEquipment === 'bodyweight' });
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

  const inGroup = !!we.supersetGroup;
  // 슈퍼셋 컨테이너 안이면 개별 테두리·배지·컨트롤 숨김(컨테이너가 담당). 밖인데 그룹이면(비인접 폴백) 파란 테두리 유지. @plm SRS-004
  const showGroupedBorder = inGroup && !insideSuperset;
  // v12: 하중모드별 무게 컬럼 라벨 + 체중 미설정 안내. @plm SRS-033
  const weightColLabel =
    loadMode === 'assisted'
      ? t('session.assistColHeader')
      : loadMode === 'bodyweight'
        ? t('session.addedColHeader')
        : t('session.weightLabel', { weightUnit });
  const bwRelative = loadMode === 'assisted' || loadMode === 'bodyweight';
  const bwMissing = bwRelative && bodyweightKg == null;
  return (
    <Card style={[styles.block, showGroupedBorder && styles.blockGrouped, insideSuperset && styles.blockInSuperset]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ExerciseName exerciseId={we.exerciseId} variant="heading" base />
          <View style={styles.headerMeta}>
            {/* 유산소는 기구 변형·PR 개념이 없음 — 근력 종목만 노출. @plm SRS-030 */}
            {!isCardio ? (
              <VariantSelector exerciseId={we.exerciseId} baseEquipment={baseEquipment} value={variant} onChange={onVariantChange} />
            ) : null}
            {showGroupedBorder ? (
              <View style={styles.supersetBadge}>
                <AppText variant="label" color="primary">
                  {t('session.superset')}
                </AppText>
              </View>
            ) : null}
            {!isCardio && pr && !prevCleared ? (
              <AppText variant="caption" color="pr">
                {t('session.prLine', { weight: formatWeight(pr.weightKg, weightUnit), reps: pr.reps })}
              </AppText>
            ) : null}
            {/* 종목별 볼륨(#) — 무게 있으면 볼륨, 맨몸·무게0이면 총 횟수. 유산소는 하단 요약으로 대체. @plm SRS-005 */}
            {!isCardio && (exVol.volume > 0 || exVol.reps > 0) ? (
              <View style={styles.exVolChip}>
                <AppText variant="label" color="primary" weight="bold">
                  {exVol.volume > 0
                    ? t('session.exVolume', { volume: formatWeight(exVol.volume, weightUnit) })
                    : t('session.exTotalReps', { reps: exVol.reps })}
                </AppText>
              </View>
            ) : null}
            {/* 어시스트/맨몸±가중인데 체중 미설정 → 볼륨이 체중 반영 안 됨 안내. @plm SRS-033 */}
            {bwMissing ? (
              <AppText variant="label" color="warning">
                {t('session.bodyweightNeeded')}
              </AppText>
            ) : null}
            {/* 이전 기록 지우기/표시 — 새 루틴 등에서 안 보고 싶을 때. 세션 로컬(이력 삭제 아님). @plm SRS-004 */}
            {!isCardio && (hasPrev || prevCleared) ? (
              <Pressable onPress={() => setPrevCleared((v) => !v)} hitSlop={6}>
                <AppText variant="label" color="textFaint">
                  {prevCleared ? t('session.showPrev') : t('session.clearPrev')}
                </AppText>
              </Pressable>
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
        {!insideSuperset && canSuperset && (onSuperset || onUnsuperset) ? (
          <IconButton
            icon="git-merge-outline"
            color={inGroup ? 'primary' : 'textMuted'}
            size={20}
            onPress={() => (inGroup ? onUnsuperset?.() : onSuperset?.())}
          />
        ) : null}
        {onSwap ? (
          <IconButton icon="swap-horizontal-outline" color="textMuted" size={20} onPress={() => onSwap(we.id)} />
        ) : null}
        <IconButton icon="trash-outline" color="textMuted" size={20} onPress={confirmRemove} />
      </View>

      {/* 그리드 헤더 — 유산소는 시간·거리, 근력은 무게·횟수·부분·편측. @plm SRS-030 */}
      {isCardio ? (
        <View style={styles.gridHead}>
          <AppText variant="label" color="textFaint" style={styles.colType}>
            {t('session.setColHeader')}
          </AppText>
          <AppText variant="label" color="textFaint" style={styles.colPrev}>
            {t('session.prevColHeader')}
          </AppText>
          {cardioMetrics.map((m) => (
            <AppText key={m} variant="label" color="textFaint" style={styles.colVal}>
              {t(CARDIO_COL_LABEL[m])}
            </AppText>
          ))}
          <View style={styles.colCheck} />
          <View style={styles.colDel} />
        </View>
      ) : (
        <View style={styles.gridHead}>
          <AppText variant="label" color="textFaint" style={styles.colType}>
            {t('session.setColHeader')}
          </AppText>
          <AppText variant="label" color="textFaint" style={styles.colPrev}>
            {t('session.prevColHeader')}
          </AppText>
          <AppText variant="label" color="textFaint" style={styles.colVal}>
            {weightColLabel}
          </AppText>
          <AppText variant="label" color="textFaint" style={styles.colVal}>
            {t('session.repsLabel')}
          </AppText>
          <View style={styles.colCheck} />
          <View style={styles.colMore} />
        </View>
      )}

      {sets.map((s, i) =>
        isCardio ? (
          <SetRowCardio
            key={s.id}
            set={s}
            label={String(i + 1)}
            prev={shownPrev[i]}
            metrics={cardioMetrics}
            onRestStart={() => onStartRest(restSeconds)}
          />
        ) : (
          <SetRowEdit
            key={s.id}
            set={s}
            label={labels[i]}
            prev={shownPrev[i]}
            weightUnit={weightUnit}
            barWeightKg={barWeightKg}
            onRestStart={() => onStartRest(restSeconds)}
          />
        ),
      )}

      {/* 유산소 종목 요약 — 총 시간·거리(수행 세트 합). @plm SRS-030 */}
      {isCardio ? <CardioSummary sets={sets} /> : null}

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
      {!prevCleared && prevNote && prevNote !== note.trim() ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
          {t('session.prevNote', { note: prevNote })}
        </AppText>
      ) : null}
      {/* 과거 메모·팁 타임라인(#34) — 최신 메모 보면서 이전 것도 확인. @plm SRS-004 */}
      {prevNote ? (
        <View style={{ marginTop: spacing.xs }}>
          <Pressable onPress={toggleNoteHistory} hitSlop={6} style={styles.histToggle}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">{t('session.noteHistoryToggle')}</AppText>
            <Ionicons name={histOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
          </Pressable>
          {histOpen ? (
            <View style={styles.histBox}>
              {noteHistory === null ? (
                <AppText variant="caption" color="textFaint">{t('common.loading')}</AppText>
              ) : noteHistory.length === 0 ? (
                <AppText variant="caption" color="textFaint">{t('session.noteHistoryEmpty')}</AppText>
              ) : (
                noteHistory.map((h, i) => (
                  <View key={`${h.completedAt}-${i}`} style={[styles.histRow, i > 0 && styles.histRowBorder]}>
                    <AppText variant="caption" color="textFaint" style={styles.histDate} numberOfLines={1}>
                      {histDateFmt(h.completedAt)}
                    </AppText>
                    <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                      {h.note}
                    </AppText>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
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
  const { t, lang } = useT();
  const isDone = set.done === true;
  const isUni = set.arm === 'uni'; // v8: 세트별 편측(원암/원레그). null=투암(기본)
  const gripKey = (set.grip as GripKey | null) ?? null; // v11: 세트별 그립
  const [varOpen, setVarOpen] = useState(false); // 세트별 변형(팔·그립) 시트
  const [expanded, setExpanded] = useState(false); // 부분반복·변형·삭제 상세 펼침(모바일 공간 절약). @plm SRS-004
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
  function setArm(arm: 'uni' | null) {
    workoutRepo.setSetArm(set.id, arm).catch(() => {});
  }
  function setGrip(grip: GripKey | null) {
    workoutRepo.setSetGrip(set.id, grip).catch(() => {});
  }
  // 변형 칩 축약 라벨 — 원암·그립 조합(예: '원암·오버'). 둘 다 기본이면 '변형' 안내.
  const variantParts: string[] = [];
  if (isUni) variantParts.push(t('session.armUni'));
  if (gripKey) variantParts.push(gripShortLabel(gripKey, lang));
  const variantSet = variantParts.length > 0;
  const variantChipLabel = variantSet ? variantParts.join('·') : t('session.variantSet');
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

  // ⋯ 상세에 값이 있으면(부분반복·변형) 점 표시로 접혀 있어도 인지. @plm SRS-004
  const hasDetail = (pt.trim() !== '' && pt.trim() !== '0') || variantSet;
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
        <Pressable onPress={toggleDone} hitSlop={6} style={[styles.check, isDone && styles.checkOn]}>
          <Ionicons name="checkmark" size={16} color={isDone ? colors.onPrimary : colors.textFaint} />
        </Pressable>
        {/* 부분반복·변형·삭제 펼침 토글 — 접힘=아래쐐기(▼), 펼침=위쐐기(▲). 값 있으면 primary 점등. @plm SRS-004 */}
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} style={[styles.moreBtn, (expanded || hasDetail) && styles.moreBtnOn]}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={expanded || hasDetail ? colors.primary : colors.textFaint} />
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.setDetailWrap}>
          <View style={styles.setDetailFields}>
            <View style={styles.detailField}>
              <AppText variant="label" color="textMuted" style={styles.detailFieldLabel}>
                {t('session.partialFull')}
              </AppText>
              <TextInput
                value={pt}
                onChangeText={setPt}
                onBlur={commitPartial}
                onSubmitEditing={commitPartial}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                selectTextOnFocus
                style={styles.detailInput}
              />
            </View>
            <View style={styles.detailField}>
              <AppText variant="label" color="textMuted" style={styles.detailFieldLabel}>
                {t('session.varColHeader')}
              </AppText>
              <Pressable onPress={() => setVarOpen(true)} style={[styles.detailInput, styles.detailVarChip, variantSet && styles.varChipOn]}>
                <AppText variant="body" color={variantSet ? 'primary' : 'text'} weight={variantSet ? 'bold' : 'regular'} numberOfLines={1}>
                  {variantChipLabel}
                </AppText>
              </Pressable>
            </View>
          </View>
          <Pressable onPress={confirmDelete} hitSlop={8} style={styles.detailDel}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <AppText variant="label" color="danger" style={{ marginLeft: 4 }}>
              {t('common.delete')}
            </AppText>
          </Pressable>
        </View>
      ) : null}
      <SetVariantSheet
        visible={varOpen}
        onClose={() => setVarOpen(false)}
        isUni={isUni}
        gripKey={gripKey}
        onArm={setArm}
        onGrip={setGrip}
      />
    </View>
  );
}

// 세트별 변형 시트 — 팔(투암/원암) + 그립(기본/오버/언더/…). 종목당이 아닌 세트당 설정(v8 팔·v11 그립). @plm SRS-028
function SetVariantSheet({
  visible,
  onClose,
  isUni,
  gripKey,
  onArm,
  onGrip,
}: {
  visible: boolean;
  onClose: () => void;
  isUni: boolean;
  gripKey: GripKey | null;
  onArm: (arm: 'uni' | null) => void;
  onGrip: (grip: GripKey | null) => void;
}) {
  const { t, lang } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.varBackdrop} onPress={onClose}>
        <Pressable style={styles.varSheet} onPress={() => {}}>
          <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
            {t('session.setVariantTitle')}
          </AppText>
          <AppText variant="label" color="textMuted" style={styles.varRowLabel}>
            {t('session.armColHeader')}
          </AppText>
          <View style={styles.varOptRow}>
            <VarOpt label={t('session.armBi')} active={!isUni} onPress={() => onArm(null)} />
            <VarOpt label={t('session.armUni')} active={isUni} onPress={() => onArm('uni')} />
          </View>
          <AppText variant="label" color="textMuted" style={styles.varRowLabel}>
            {t('variant.grip')}
          </AppText>
          <View style={styles.varOptRow}>
            <VarOpt label={t('variant.default')} active={!gripKey} onPress={() => onGrip(null)} />
            {GRIP_KEYS.map((g) => (
              <VarOpt key={g} label={gripLabel(g, lang)} active={gripKey === g} onPress={() => onGrip(g)} />
            ))}
          </View>
          <Button title={t('common.ok')} onPress={onClose} style={{ marginTop: spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VarOpt({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.varOpt, active && styles.varOptOn]}>
      <AppText variant="caption" color={active ? 'primary' : 'text'} weight={active ? 'bold' : 'regular'}>
        {label}
      </AppText>
    </Pressable>
  );
}

// 유산소 지표 → 그리드 컬럼 헤더 i18n 키. @plm SRS-030
const CARDIO_COL_LABEL: Record<CardioMetric, TransKey> = {
  duration: 'session.durationColHeader',
  distance: 'session.distanceColHeader',
  incline: 'session.inclineColHeader',
  level: 'session.levelColHeader',
};

// ── 유산소 세트 1행 — 무게/횟수 대신 종목별 지표(시간·거리·경사·단계). @plm SRS-030 ──────
function SetRowCardio({
  set,
  label,
  prev,
  metrics,
  onRestStart,
}: {
  set: SetLog;
  label: string;
  prev: LogSetInput | undefined;
  metrics: CardioMetric[];
  onRestStart: () => void;
}) {
  const { t } = useT();
  const isDone = set.done === true;
  const [mins, setMins] = useState(() => secToMinInput(set.durationSec));
  const [km, setKm] = useState(() => mToKmInput(set.distanceM));
  const [incline, setIncline] = useState(() => cardioNumInput(set.inclinePct));
  const [level, setLevel] = useState(() => cardioNumInput(set.level));
  useEffect(() => setMins(secToMinInput(set.durationSec)), [set.durationSec]);
  useEffect(() => setKm(mToKmInput(set.distanceM)), [set.distanceM]);
  useEffect(() => setIncline(cardioNumInput(set.inclinePct)), [set.inclinePct]);
  useEffect(() => setLevel(cardioNumInput(set.level)), [set.level]);

  const commitDuration = () => workoutRepo.updateSetLog(set.id, { durationSec: minInputToSec(mins) }).catch(() => {});
  const commitDistance = () => workoutRepo.updateSetLog(set.id, { distanceM: kmInputToM(km) }).catch(() => {});
  const commitIncline = () => workoutRepo.updateSetLog(set.id, { inclinePct: inputToIncline(incline) }).catch(() => {});
  const commitLevel = () => workoutRepo.updateSetLog(set.id, { level: inputToLevel(level) }).catch(() => {});
  function toggleDone() {
    const next = !isDone;
    workoutRepo.setSetDone(set.id, next).catch(() => {});
    if (next) onRestStart();
  }
  function applyPrev() {
    if (!prev) return;
    workoutRepo
      .updateSetLog(set.id, {
        durationSec: prev.durationSec ?? null,
        distanceM: prev.distanceM ?? null,
        inclinePct: prev.inclinePct ?? null,
        level: prev.level ?? null,
      })
      .catch(() => {});
  }
  function confirmDelete() {
    workoutRepo.deleteSetLog(set.id).catch((e) => Alert.alert(t('common.error'), String(e)));
  }
  const hasPrev = prev && ((prev.durationSec ?? 0) > 0 || (prev.distanceM ?? 0) > 0 || (prev.inclinePct ?? 0) > 0 || (prev.level ?? 0) > 0);
  const cellFor = (m: CardioMetric) => {
    const common = { keyboardType: 'numeric' as const, placeholder: '0', placeholderTextColor: colors.textFaint, selectTextOnFocus: true, style: styles.cell };
    switch (m) {
      case 'duration':
        return <TextInput key="duration" value={mins} onChangeText={setMins} onBlur={commitDuration} onSubmitEditing={commitDuration} {...common} />;
      case 'distance':
        return <TextInput key="distance" value={km} onChangeText={setKm} onBlur={commitDistance} onSubmitEditing={commitDistance} {...common} />;
      case 'incline':
        return <TextInput key="incline" value={incline} onChangeText={setIncline} onBlur={commitIncline} onSubmitEditing={commitIncline} {...common} />;
      case 'level':
        return <TextInput key="level" value={level} onChangeText={setLevel} onBlur={commitLevel} onSubmitEditing={commitLevel} {...common} />;
    }
  };
  return (
    <View style={isDone && styles.setRowDone}>
      <View style={styles.setRow}>
        <View style={styles.colType}>
          <View style={styles.typeChip}>
            <AppText variant="caption" color="textMuted" weight="bold" center>
              {label}
            </AppText>
          </View>
        </View>
        <Pressable onPress={applyPrev} hitSlop={4} style={styles.colPrev} disabled={!hasPrev}>
          {hasPrev ? (
            <View style={styles.prevChip}>
              <AppText variant="caption" color="primary" center numberOfLines={1}>
                {formatCardioSet(prev!.durationSec, prev!.distanceM)}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color="textFaint" center>
              –
            </AppText>
          )}
        </Pressable>
        {metrics.map(cellFor)}
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

// 유산소 종목 요약 — 수행 완료 세트의 총 시간·거리. @plm SRS-030
function CardioSummary({ sets }: { sets: SetLog[] }) {
  const { t } = useT();
  const done = sets.filter((s) => s.done !== false);
  const { durationSec, distanceM } = sumCardio(done);
  if (durationSec <= 0 && distanceM <= 0) return null;
  const parts: string[] = [];
  if (durationSec > 0) parts.push(formatDurationClock(durationSec));
  if (distanceM > 0) parts.push(formatDistanceKm(distanceM));
  return (
    <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
      {t('session.cardioTotal', { total: parts.join(' · ') })}
    </AppText>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  blockGrouped: { borderColor: colors.primary, borderWidth: 1 }, // 슈퍼셋 그룹 시각 표시(비인접 폴백)
  // 슈퍼셋 공통 컨테이너 안: 개별 카드 테두리·배경·그림자 제거 → 컨테이너가 하나의 묶음으로. @plm SRS-004
  blockInSuperset: { marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, paddingHorizontal: 0, paddingVertical: spacing.sm },
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
  colVar: { width: 58, textAlign: 'center' },
  colCheck: { width: 40 },
  colMore: { width: 34 },
  colDel: { width: 26 },
  // 세트별 변형(팔·그립) 통합 칩 — 기본은 흐린 '변형', 설정 시 primary 강조. 탭하면 시트.
  varChip: {
    width: 58,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  varChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  // 세트별 변형 시트
  varBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  varSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  varRowLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  varOptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  varOpt: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  varOptOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
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
  // ⋯ 상세 토글 — done 옆. 부분반복·변형 값 있으면 primary 배경 점등. @plm SRS-004
  moreBtn: { width: 34, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  moreBtnOn: { backgroundColor: colors.primaryMuted },
  // 세트 상세 펼침(부분반복·변형·삭제) — 메인 무게·횟수 입력과 비슷한 크기로(작아서 못 알아보던 문제 해소). @plm SRS-004
  setDetailWrap: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  setDetailFields: { flexDirection: 'row', gap: spacing.sm },
  detailField: { flex: 1 },
  detailFieldLabel: { marginBottom: 4 },
  detailInput: {
    height: 42,
    alignSelf: 'stretch',
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  detailVarChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  detailDel: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  noteInput: { minHeight: 38, textAlignVertical: 'top' },
  histToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  histBox: {
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  histRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  histRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  histDate: { width: 58 },
  supersetBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  exVolChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  // 운동 중 순서 이동 화살표 열(#11).
  reorderCol: { alignItems: 'center', justifyContent: 'center' },
  reorderSpacer: { width: 18, height: 18 },
  restRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, minHeight: 44 },
  restSetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
});
