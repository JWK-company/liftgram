// @plm SRS-002  루틴 빌더 — 종목 추가/순서(드래그·화살표)/대체/슈퍼셋/세트·반복·휴식 목표 편집
// @plm SRS-028  종목 변형(기구·그립·팔) 선택 — 루틴에 저장하면 세션 시작 시 승계
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReorderableList, {
  useReorderableDrag,
  useIsActive,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import {
  Button,
  IconButton,
  TextField,
  NumberStepper,
  AppText,
  Card,
  Tag,
  Divider,
  SectionHeader,
  EmptyState,
  VariantSelector,
} from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { useQueryData } from '../../db/hooks';
import { exerciseRepo, routineRepo } from '../../data';
import { useUser } from '../../state/userContext';
import { fromKg, toKg, type ArmKey, type EquipmentType, type GripKey, type VariantDims } from '../../domain';
import { requestExercisePick } from '../../utils/picker';
import type RoutineExercise from '../../db/models/RoutineExercise';
import { ExerciseName } from './ExerciseName';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function RoutineEditorScreen({ route, navigation }: RootStackScreenProps<'RoutineEditor'>) {
  const { t } = useT();
  const paramRoutineId = route.params?.routineId;
  const [routineId, setRoutineId] = useState<string | null>(paramRoutineId ?? null);
  const [creating, setCreating] = useState(!paramRoutineId);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [folder, setFolder] = useState('');
  const [loadedMeta, setLoadedMeta] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 신규 루틴이면 마운트 시 빈 루틴을 만들어 즉시 종목 추가가 가능하게 한다.
  // createdRef로 가드 — React 19 StrictMode 이중 호출에서도 1건만 생성(중복 방지).
  const createdRef = useRef(false);
  useEffect(() => {
    let alive = true;
    if (!paramRoutineId && !createdRef.current) {
      createdRef.current = true;
      routineRepo
        .createRoutine({ name: t('routines.newRoutineName') })
        .then((r) => {
          if (!alive) return;
          setRoutineId(r.id);
          setName(r.name);
          setLoadedMeta(true);
          setCreating(false);
        })
        .catch((e) => {
          if (alive) Alert.alert(t('common.error'), String(e));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 신규 루틴은 진입 즉시 DB 초안으로 생성되므로, 명시적 '완료' 저장 없이 나가면 초안으로 간주해 정리한다.
  // handledRef: 완료/삭제 등 명시적 종료 시 true → beforeRemove가 초안정리·확인을 건너뛴다.
  const nameRef = useRef(name);
  nameRef.current = name;
  const handledRef = useRef(false);
  const exercisesCountRef = useRef(0);

  const hasRoutineContent = () =>
    exercisesCountRef.current > 0 ||
    (nameRef.current.trim() !== '' && nameRef.current.trim() !== t('routines.newRoutineName'));

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (paramRoutineId || !routineId || handledRef.current) return; // 기존/미생성/명시적종료 → 보존
      if (!hasRoutineContent()) {
        routineRepo.deleteRoutine(routineId).catch(() => {}); // 빈 초안 → 조용히 삭제
        return;
      }
      // 내용은 있으나 저장(완료)하지 않고 나감 → 삭제할지 확인(실수 방지).
      e.preventDefault();
      Alert.alert(t('routines.discardTitle'), t('routines.discardMessage'), [
        { text: t('routines.keepEditing'), style: 'cancel' },
        {
          text: t('routines.discardConfirm'),
          style: 'destructive',
          onPress: () => {
            handledRef.current = true;
            routineRepo.deleteRoutine(routineId).catch(() => {});
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, paramRoutineId, routineId]);

  // '완료' = 저장. 신규인데 내용이 없으면 빈 루틴을 남기지 않고 삭제하고 나간다.
  async function onDone() {
    if (!paramRoutineId && routineId && !hasRoutineContent()) {
      handledRef.current = true;
      routineRepo.deleteRoutine(routineId).catch(() => {});
      navigation.goBack();
      return;
    }
    handledRef.current = true; // 저장 확정 → 보존
    // 입력 중이던(블러 전) 이름/폴더/메모를 확정 저장 — 타이핑 후 바로 완료를 눌러도 반영.
    await Promise.all([saveName(), saveFolder(), saveNotes()]);
    navigation.goBack();
  }

  // 기존 루틴이면 메타데이터(이름/메모/폴더) 1회 로드.
  useEffect(() => {
    let alive = true;
    if (paramRoutineId) {
      routineRepo
        .getRoutine(paramRoutineId)
        .then((r) => {
          if (!alive) return;
          setName(r.name);
          setNotes(r.notes ?? '');
          setFolder(r.folder ?? '');
          setLoadedMeta(true);
        })
        .catch((e) => {
          if (alive) Alert.alert(t('common.error'), String(e));
        });
    }
    return () => {
      alive = false;
    };
  }, [paramRoutineId]);

  const exercises = useQueryData(
    () => (routineId ? routineRepo.queryRoutineExercises(routineId) : null),
    [routineId],
  );
  exercisesCountRef.current = exercises.length; // beforeRemove에서 최신 종목 수 참조

  async function saveName() {
    if (!routineId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await routineRepo.updateRoutine(routineId, { name: trimmed });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  async function saveNotes() {
    if (!routineId) return;
    try {
      await routineRepo.updateRoutine(routineId, { notes: notes.trim() || null });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  async function saveFolder() {
    if (!routineId) return;
    try {
      await routineRepo.updateRoutine(routineId, { folder: folder.trim() || null });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  function addExercise() {
    if (!routineId) return;
    requestExercisePick((exId) => {
      routineRepo.addExerciseToRoutine(routineId, exId).catch((e) => Alert.alert(t('common.error'), String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  function swap(re: RoutineExercise) {
    requestExercisePick((exId) => {
      routineRepo.swapRoutineExercise(re.id, exId).catch((e) => Alert.alert(t('common.error'), String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  // 화살표 버튼 reorder (드래그 폴백)
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= exercises.length) return;
    const ordered = exercises.map((e) => e.id);
    const tmp = ordered[index];
    ordered[index] = ordered[target];
    ordered[target] = tmp;
    try {
      await routineRepo.reorderRoutineExercises(ordered);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  // 드래그 reorder
  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    if (from === to) return;
    const ids = exercises.map((e) => e.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    routineRepo.reorderRoutineExercises(ids).catch((e) => Alert.alert(t('common.error'), String(e)));
  }

  function removeExercise(re: RoutineExercise) {
    Alert.alert(t('routines.removeExerciseTitle'), t('routines.removeExerciseMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.removeRoutineExercise(re.id);
            setSelectedIds((prev) => prev.filter((id) => id !== re.id));
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function groupSuperset() {
    if (selectedIds.length < 2) {
      Alert.alert(t('routines.supersetTitle'), t('routines.supersetSelectAtLeastTwo'));
      return;
    }
    try {
      await routineRepo.groupAsSuperset(selectedIds);
      setSelecting(false);
      setSelectedIds([]);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  async function ungroupSuperset() {
    if (selectedIds.length === 0) {
      Alert.alert(t('routines.ungroupSupersetTitle'), t('routines.ungroupSelectExercises'));
      return;
    }
    try {
      await routineRepo.ungroupSuperset(selectedIds);
      setSelecting(false);
      setSelectedIds([]);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  function deleteRoutine() {
    if (!routineId) return;
    Alert.alert(t('routines.deleteRoutineTitle'), t('routines.deleteRoutineMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            handledRef.current = true; // 명시적 삭제 → beforeRemove 확인 스킵
            await routineRepo.deleteRoutine(routineId);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }

  if (creating || !routineId || !loadedMeta) {
    return (
      <SafeAreaView style={styles.loader}>
        <AppText variant="body" color="textMuted">
          {t('common.loading')}
        </AppText>
      </SafeAreaView>
    );
  }

  // 리스트 헤더(루틴 메타 + 슈퍼셋 바) — 안정적인 element로 전달해 TextInput 리마운트/키보드 끊김 방지.
  const listHeader = (
    <View>
      <TextField
        label={t('routines.nameLabel')}
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        onSubmitEditing={saveName}
        placeholder={t('routines.namePlaceholder')}
        returnKeyType="done"
      />
      <TextField label={t('routines.folderLabel')} value={folder} onChangeText={setFolder} onBlur={saveFolder} placeholder={t('routines.folderPlaceholder')} />
      <TextField label={t('routines.notesLabel')} value={notes} onChangeText={setNotes} onBlur={saveNotes} placeholder={t('routines.notesPlaceholder')} multiline />

      <Divider />

      <SectionHeader
        title={t('routines.exercisesSection')}
        right={
          exercises.length >= 2 ? (
            <Button
              title={selecting ? t('routines.cancelSelection') : t('routines.editSuperset')}
              size="sm"
              variant="ghost"
              fullWidth={false}
              onPress={() => {
                setSelecting((s) => !s);
                setSelectedIds([]);
              }}
            />
          ) : undefined
        }
      />

      {exercises.length >= 2 && !selecting ? (
        <AppText variant="caption" color="textFaint" style={{ marginBottom: spacing.sm }}>
          {t('routines.reorderHint')}
        </AppText>
      ) : null}

      {selecting ? (
        <View style={styles.supersetBar}>
          <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
            {t('routines.supersetBarHint', { count: selectedIds.length })}
          </AppText>
          <Button title={t('routines.group')} size="sm" fullWidth={false} disabled={selectedIds.length < 2} onPress={groupSuperset} />
          <Button title={t('routines.ungroup')} size="sm" variant="secondary" fullWidth={false} disabled={selectedIds.length === 0} onPress={ungroupSuperset} />
        </View>
      ) : null}
    </View>
  );

  const listFooter = (
    <View>
      <Button title={t('routines.addExercise')} icon="add" variant="secondary" onPress={addExercise} style={{ marginTop: spacing.md }} />
      <Divider />
      {/* 완료(저장) = 루틴 삭제 바로 위, 같은 크기 버튼 */}
      <Button title={t('common.done')} icon="checkmark" onPress={onDone} style={{ marginTop: spacing.sm }} />
      <Button title={t('routines.deleteRoutineTitle')} variant="danger" onPress={deleteRoutine} style={{ marginTop: spacing.sm }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        <AppText variant="heading">{t('routines.editorTitle')}</AppText>
        {/* 완료 버튼은 하단(삭제 위)으로 이동 — 헤더는 뒤로가기=취소만. 타이틀 중앙 유지용 스페이서. */}
        <View style={{ width: 40 }} />
      </View>

      <ReorderableList
        data={exercises}
        keyExtractor={(item) => item.id}
        onReorder={handleReorder}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={<EmptyState title={t('routines.editorEmptyTitle')} message={t('routines.editorEmptyMessage')} />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <ExerciseEditRow
            re={item}
            index={index}
            total={exercises.length}
            selecting={selecting}
            selected={selectedIds.includes(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            onSwap={() => swap(item)}
            onRemove={() => removeExercise(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function ExerciseEditRow({
  re,
  index,
  total,
  selecting,
  selected,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onSwap,
  onRemove,
}: {
  re: RoutineExercise;
  index: number;
  total: number;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const { weightUnit } = useUser();
  const weightStep = weightUnit === 'kg' ? 2.5 : 5;
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  // 로컬 편집 상태(스테퍼 즉시 반영) + 영속화. 무게는 사용자 단위로 표시, kg로 저장.
  const [sets, setSets] = useState(re.targetSets);
  const [rest, setRest] = useState(re.restSeconds);
  const [weightDisp, setWeightDisp] = useState(re.targetWeightKg != null ? fromKg(re.targetWeightKg, weightUnit) : 0);
  // 종목 변형(기구·그립·팔) dims. @plm SRS-028
  const [variant, setVariant] = useState<VariantDims>(() => ({
    equipment: re.variantEquipment,
    grip: re.variantGrip as GripKey | null,
    arm: re.variantArm as ArmKey | null,
  }));
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);

  // 모델 값이 외부에서 바뀌면(스왑/복제 등) 동기화.
  useEffect(() => setSets(re.targetSets), [re.targetSets]);
  useEffect(() => setRest(re.restSeconds), [re.restSeconds]);
  useEffect(
    () => setVariant({ equipment: re.variantEquipment, grip: re.variantGrip as GripKey | null, arm: re.variantArm as ArmKey | null }),
    [re.variantEquipment, re.variantGrip, re.variantArm],
  );
  useEffect(() => {
    let alive = true;
    exerciseRepo.getExercise(re.exerciseId).then((e) => alive && setBaseEquipment(e.equipment)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [re.exerciseId]);
  useEffect(
    () => setWeightDisp(re.targetWeightKg != null ? fromKg(re.targetWeightKg, weightUnit) : 0),
    [re.targetWeightKg, weightUnit],
  );

  const persist = (patch: Parameters<typeof routineRepo.updateRoutineExercise>[1]) => {
    routineRepo.updateRoutineExercise(re.id, patch).catch((e) => Alert.alert(t('common.error'), String(e)));
  };

  return (
    <Card style={[styles.exCard, selected && styles.exCardSelected, isActive && styles.exCardActive]}>
      <View style={styles.exHeader}>
        {selecting ? (
          <Pressable onPress={onToggleSelect} hitSlop={8} style={styles.handle}>
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? colors.primary : colors.textMuted} />
          </Pressable>
        ) : (
          <Pressable onPressIn={drag} hitSlop={8} style={styles.handle}>
            <Ionicons name="reorder-three" size={24} color={colors.textMuted} />
          </Pressable>
        )}
        <View style={styles.exTitle}>
          <ExerciseName exerciseId={re.exerciseId} variant="body" />
          <AppText variant="caption" color="textMuted">
            {t('routines.exerciseRowSummary', { index: index + 1, sets, rest })}
          </AppText>
          <View style={styles.exVariant}>
            <VariantSelector
              exerciseId={re.exerciseId}
              baseEquipment={baseEquipment}
              value={variant}
              onChange={(dims) => {
                setVariant(dims);
                routineRepo
                  .setRoutineExerciseVariant(re.id, dims)
                  .catch((e) => Alert.alert(t('common.error'), String(e)));
              }}
            />
          </View>
        </View>
        {re.supersetGroup ? <Tag label={t('routines.supersetTag')} tone="primary" /> : null}
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <AppText variant="label" color="textMuted" style={styles.fieldLabel}>
            {t('routines.setsLabel')}
          </AppText>
          <NumberStepper
            value={sets}
            min={1}
            step={1}
            onChange={(v) => {
              setSets(v);
              persist({ targetSets: v });
            }}
          />
        </View>
        <View style={styles.field}>
          <AppText variant="label" color="textMuted" style={styles.fieldLabel}>
            {t('routines.restLabel')}
          </AppText>
          <NumberStepper
            value={rest}
            min={0}
            step={15}
            onChange={(v) => {
              setRest(v);
              persist({ restSeconds: v });
            }}
          />
        </View>
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <AppText variant="label" color="textMuted" style={styles.fieldLabel}>
            {t('routines.weightLabel', { weightUnit })}
          </AppText>
          <NumberStepper
            value={weightDisp}
            min={0}
            step={weightStep}
            onChange={(v) => {
              setWeightDisp(v);
              persist({ targetWeightKg: v > 0 ? toKg(v, weightUnit) : null });
            }}
          />
        </View>
        <View style={styles.field} />
      </View>

      <View style={styles.rowActions}>
        {/* 순서 변경 — 드래그는 웹에서 동작하지 않으므로 화살표가 신뢰 가능한 기본 경로. */}
        <IconButton icon="arrow-up" size={20} color="text" filled disabled={index === 0} onPress={onMoveUp} />
        <IconButton icon="arrow-down" size={20} color="text" filled disabled={index === total - 1} onPress={onMoveDown} />
        <View style={{ flex: 1 }} />
        <Button title={t('routines.swap')} size="sm" variant="ghost" fullWidth={false} onPress={onSwap} />
        <IconButton icon="trash-outline" size={18} color="danger" onPress={onRemove} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  supersetBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  exCard: { marginBottom: spacing.md, gap: spacing.md },
  exCardSelected: { borderColor: colors.primary, borderWidth: 1 },
  exCardActive: { borderColor: colors.primary, borderWidth: 1, opacity: 0.95 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  handle: { width: 28, alignItems: 'center' },
  exTitle: { flex: 1, gap: 2 },
  exVariant: { flexDirection: 'row', marginTop: 4 },
  fieldRow: { flexDirection: 'row', gap: spacing.lg },
  field: { flex: 1 },
  fieldLabel: { marginBottom: spacing.xs },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
