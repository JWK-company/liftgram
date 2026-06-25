// @plm SRS-001  운동 카탈로그 — 검색·근육군/기구 필터·picker 모드
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TextField, AppText, Card, Tag, EmptyState } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { useQueryData } from '../../db/hooks';
import { exerciseRepo } from '../../data';
import type { Exercise } from '../../db/models';
import {
  muscleLabel,
  equipmentLabel,
  ALL_MUSCLE_GROUPS,
  ALL_EQUIPMENT,
  type MuscleGroup,
  type EquipmentType,
} from '../../domain';
import { resolveExercisePick, cancelExercisePick } from '../../utils/picker';
import { colors, spacing } from '../../theme';
import { Chip } from './Chip';

export default function ExerciseListScreen({ navigation, route }: RootStackScreenProps<'ExerciseList'>) {
  const mode = route.params?.mode ?? 'browse';
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);

  const items = useQueryData(
    () => exerciseRepo.queryExercises({ search, muscle, equipment }),
    [search, muscle, equipment],
  );

  // 헤더 우측: 커스텀 운동 추가
  useLayoutEffect(() => {
    navigation.setOptions({
      title: mode === 'pick' ? '운동 선택' : '운동',
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ExerciseForm')}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: spacing.sm })}
        >
          <AppText variant="caption" weight="bold" color="primary">
            + 커스텀 운동
          </AppText>
        </Pressable>
      ),
    });
  }, [navigation, mode]);

  // pick 모드에서 선택 없이 화면을 떠나면 대기 중인 picker 핸들러를 취소(stale 핸들러 오발 방지).
  const pickedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (mode === 'pick' && !pickedRef.current) cancelExercisePick();
    };
  }, [mode]);

  const onPickRow = useCallback(
    (item: Exercise) => {
      if (mode === 'pick') {
        pickedRef.current = true;
        resolveExercisePick(item.id);
        navigation.goBack();
      } else {
        navigation.navigate('ExerciseDetail', { exerciseId: item.id });
      }
    },
    [mode, navigation],
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <TextField
          placeholder="운동 검색"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          containerStyle={{ marginBottom: spacing.sm }}
        />

        <FilterRow label="근육군">
          {ALL_MUSCLE_GROUPS.map((m) => (
            <Chip
              key={m}
              label={muscleLabel(m)}
              active={muscle === m}
              onPress={() => setMuscle((prev) => (prev === m ? null : m))}
            />
          ))}
        </FilterRow>

        <FilterRow label="기구">
          {ALL_EQUIPMENT.map((eq) => (
            <Chip
              key={eq}
              label={equipmentLabel(eq)}
              active={equipment === eq}
              onPress={() => setEquipment((prev) => (prev === eq ? null : eq))}
            />
          ))}
        </FilterRow>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ExerciseRow item={item} onPress={() => onPickRow(item)} />}
        ListEmptyComponent={
          <EmptyState
            title="결과가 없어요"
            message="검색어나 필터를 바꿔보거나, 커스텀 운동을 추가하세요."
          />
        }
      />
    </Screen>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <AppText variant="label" color="textFaint" style={styles.filterLabel}>
        {label}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

function ExerciseRow({ item, onPress }: { item: Exercise; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        <View style={styles.rowMain}>
          <AppText variant="heading" numberOfLines={1}>
            {item.nameKo}
          </AppText>
          {item.nameEn ? (
            <AppText variant="caption" color="textFaint" numberOfLines={1} style={{ marginTop: 2 }}>
              {item.nameEn}
            </AppText>
          ) : null}
          <View style={styles.tags}>
            {item.primaryMuscles.map((m) => (
              <Tag key={m} label={muscleLabel(m)} tone="primary" />
            ))}
            <Tag label={equipmentLabel(item.equipment)} />
            {item.isCustom ? <Tag label="커스텀" tone="muted" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  filterRow: { marginBottom: spacing.sm },
  filterLabel: { marginBottom: spacing.xs },
  chipsRow: { gap: spacing.sm, paddingRight: spacing.lg, paddingVertical: 2 },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: { flex: 1, marginRight: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
});
