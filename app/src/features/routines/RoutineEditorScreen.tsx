// @plm SRS-002  루틴 빌더 — 종목 추가/순서(드래그·화살표)/대체/슈퍼셋/세트·반복·휴식 목표 편집
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
} from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { useQueryData } from '../../db/hooks';
import { routineRepo } from '../../data';
import { requestExercisePick } from '../../utils/picker';
import type RoutineExercise from '../../db/models/RoutineExercise';
import { ExerciseName } from './ExerciseName';
import { colors, spacing } from '../../theme';

export default function RoutineEditorScreen({ route, navigation }: RootStackScreenProps<'RoutineEditor'>) {
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
        .createRoutine({ name: '새 루틴' })
        .then((r) => {
          if (!alive) return;
          setRoutineId(r.id);
          setName(r.name);
          setLoadedMeta(true);
          setCreating(false);
        })
        .catch((e) => {
          if (alive) Alert.alert('오류', String(e));
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 백아웃 시 빈·미수정 신규 루틴은 정리(목록에 빈 '새 루틴' 누적 방지).
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (paramRoutineId || !routineId) return; // 기존 루틴은 보존
      const trimmed = nameRef.current.trim();
      if (trimmed && trimmed !== '새 루틴') return; // 이름을 바꿨으면 보존
      routineRepo
        .queryRoutineExercises(routineId)
        .fetchCount()
        .then((count) => {
          if (count === 0) routineRepo.deleteRoutine(routineId).catch(() => {});
        })
        .catch(() => {});
    });
    return unsub;
  }, [navigation, paramRoutineId, routineId]);

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
          if (alive) Alert.alert('오류', String(e));
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

  async function saveName() {
    if (!routineId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await routineRepo.updateRoutine(routineId, { name: trimmed });
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  async function saveNotes() {
    if (!routineId) return;
    try {
      await routineRepo.updateRoutine(routineId, { notes: notes.trim() || null });
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  async function saveFolder() {
    if (!routineId) return;
    try {
      await routineRepo.updateRoutine(routineId, { folder: folder.trim() || null });
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  function addExercise() {
    if (!routineId) return;
    requestExercisePick((exId) => {
      routineRepo.addExerciseToRoutine(routineId, exId).catch((e) => Alert.alert('오류', String(e)));
    });
    navigation.navigate('ExerciseList', { mode: 'pick' });
  }

  function swap(re: RoutineExercise) {
    requestExercisePick((exId) => {
      routineRepo.swapRoutineExercise(re.id, exId).catch((e) => Alert.alert('오류', String(e)));
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
      Alert.alert('오류', String(e));
    }
  }

  // 드래그 reorder
  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    if (from === to) return;
    const ids = exercises.map((e) => e.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    routineRepo.reorderRoutineExercises(ids).catch((e) => Alert.alert('오류', String(e)));
  }

  function removeExercise(re: RoutineExercise) {
    Alert.alert('종목 삭제', '이 종목을 루틴에서 제거할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.removeRoutineExercise(re.id);
            setSelectedIds((prev) => prev.filter((id) => id !== re.id));
          } catch (e) {
            Alert.alert('오류', String(e));
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
      Alert.alert('슈퍼셋', '2개 이상의 종목을 선택하세요.');
      return;
    }
    try {
      await routineRepo.groupAsSuperset(selectedIds);
      setSelecting(false);
      setSelectedIds([]);
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  async function ungroupSuperset() {
    if (selectedIds.length === 0) {
      Alert.alert('슈퍼셋 해제', '해제할 종목을 선택하세요.');
      return;
    }
    try {
      await routineRepo.ungroupSuperset(selectedIds);
      setSelecting(false);
      setSelectedIds([]);
    } catch (e) {
      Alert.alert('오류', String(e));
    }
  }

  function deleteRoutine() {
    if (!routineId) return;
    Alert.alert('루틴 삭제', '이 루틴을 삭제할까요? 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await routineRepo.deleteRoutine(routineId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('오류', String(e));
          }
        },
      },
    ]);
  }

  if (creating || !routineId || !loadedMeta) {
    return (
      <SafeAreaView style={styles.loader}>
        <AppText variant="body" color="textMuted">
          불러오는 중…
        </AppText>
      </SafeAreaView>
    );
  }

  // 리스트 헤더(루틴 메타 + 슈퍼셋 바) — 안정적인 element로 전달해 TextInput 리마운트/키보드 끊김 방지.
  const listHeader = (
    <View>
      <TextField
        label="루틴 이름"
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        onSubmitEditing={saveName}
        placeholder="예: 상체 A"
        returnKeyType="done"
      />
      <TextField label="폴더 (선택)" value={folder} onChangeText={setFolder} onBlur={saveFolder} placeholder="예: 푸시/풀/레그" />
      <TextField label="메모 (선택)" value={notes} onChangeText={setNotes} onBlur={saveNotes} placeholder="루틴 메모" multiline />

      <Divider />

      <SectionHeader
        title="종목"
        right={
          exercises.length >= 2 ? (
            <Button
              title={selecting ? '선택 취소' : '슈퍼셋 편집'}
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
          ☰ 핸들을 잡고 드래그하거나 ▲▼로 순서를 바꿀 수 있어요.
        </AppText>
      ) : null}

      {selecting ? (
        <View style={styles.supersetBar}>
          <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
            종목 2개 이상 선택 후 묶거나, 묶인 종목을 선택해 해제하세요. ({selectedIds.length}개 선택됨)
          </AppText>
          <Button title="묶기" size="sm" fullWidth={false} disabled={selectedIds.length < 2} onPress={groupSuperset} />
          <Button title="해제" size="sm" variant="secondary" fullWidth={false} disabled={selectedIds.length === 0} onPress={ungroupSuperset} />
        </View>
      ) : null}
    </View>
  );

  const listFooter = (
    <View>
      <Button title="운동 추가" icon="add" variant="secondary" onPress={addExercise} style={{ marginTop: spacing.md }} />
      <Divider />
      <Button title="루틴 삭제" variant="danger" onPress={deleteRoutine} style={{ marginTop: spacing.sm }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        <AppText variant="heading">루틴 편집</AppText>
        <Button title="완료" size="sm" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
      </View>

      <ReorderableList
        data={exercises}
        keyExtractor={(item) => item.id}
        onReorder={handleReorder}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={<EmptyState title="종목이 없습니다" message="아래 버튼으로 운동을 추가하세요." />}
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
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  // 로컬 편집 상태(스테퍼 즉시 반영) + 영속화.
  const [sets, setSets] = useState(re.targetSets);
  const [repsMin, setRepsMin] = useState(re.targetRepsMin ?? 0);
  const [repsMax, setRepsMax] = useState(re.targetRepsMax ?? 0);
  const [rest, setRest] = useState(re.restSeconds);

  // 모델 값이 외부에서 바뀌면(스왑/복제 등) 동기화.
  useEffect(() => setSets(re.targetSets), [re.targetSets]);
  useEffect(() => setRepsMin(re.targetRepsMin ?? 0), [re.targetRepsMin]);
  useEffect(() => setRepsMax(re.targetRepsMax ?? 0), [re.targetRepsMax]);
  useEffect(() => setRest(re.restSeconds), [re.restSeconds]);

  const persist = (patch: Parameters<typeof routineRepo.updateRoutineExercise>[1]) => {
    routineRepo.updateRoutineExercise(re.id, patch).catch((e) => Alert.alert('오류', String(e)));
  };

  const repsLabel = useMemo(() => {
    const min = repsMin > 0 ? repsMin : null;
    const max = repsMax > 0 ? repsMax : null;
    if (min && max) return `${min}–${max}회`;
    if (min) return `${min}회+`;
    if (max) return `~${max}회`;
    return '반복 미설정';
  }, [repsMin, repsMax]);

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
            {index + 1}. {repsLabel} · 휴식 {rest}초
          </AppText>
        </View>
        {re.supersetGroup ? <Tag label="슈퍼셋" tone="primary" /> : null}
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <AppText variant="label" color="textMuted" style={styles.fieldLabel}>
            세트
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
            휴식(초)
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
            최소 반복
          </AppText>
          <NumberStepper
            value={repsMin}
            min={0}
            step={1}
            onChange={(v) => {
              setRepsMin(v);
              persist({ targetRepsMin: v > 0 ? v : null });
            }}
          />
        </View>
        <View style={styles.field}>
          <AppText variant="label" color="textMuted" style={styles.fieldLabel}>
            최대 반복
          </AppText>
          <NumberStepper
            value={repsMax}
            min={0}
            step={1}
            onChange={(v) => {
              setRepsMax(v);
              persist({ targetRepsMax: v > 0 ? v : null });
            }}
          />
        </View>
      </View>

      <View style={styles.rowActions}>
        <IconButton icon="arrow-up" size={18} color="textMuted" disabled={index === 0} onPress={onMoveUp} />
        <IconButton icon="arrow-down" size={18} color="textMuted" disabled={index === total - 1} onPress={onMoveDown} />
        <View style={{ flex: 1 }} />
        <Button title="대체" size="sm" variant="ghost" fullWidth={false} onPress={onSwap} />
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
  fieldRow: { flexDirection: 'row', gap: spacing.lg },
  field: { flex: 1 },
  fieldLabel: { marginBottom: spacing.xs },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
