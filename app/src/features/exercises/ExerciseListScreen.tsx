// @plm SRS-001  운동 카탈로그 — 검색·근육군/기구 필터·picker 모드
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, TextField, AppText, Card, Tag, EmptyState, RemoteImage } from '../../components';
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
  type ExerciseKind,
} from '../../domain';
import { resolveExercisePick, cancelExercisePick } from '../../utils/picker';
import { exerciseDisplayName, exerciseAltName } from '../../domain';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';
import { Chip } from './Chip';
import { ExerciseFinderWizard, type WizardResult } from './ExerciseFinderWizard';

export default function ExerciseListScreen({ navigation, route }: RootStackScreenProps<'ExerciseList'>) {
  const { t, lang } = useT();
  const mode = route.params?.mode ?? 'browse';
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [kind, setKind] = useState<ExerciseKind | null>(null); // v10: 유산소 필터(스무고개 유산소 경로). @plm SRS-030
  const [wizardOpen, setWizardOpen] = useState(false); // 스무고개(종목 찾기 도우미). @plm SRS-031

  // 기구/근육군/종류는 반응형 쿼리. 검색은 클라이언트 JS 필터 — 웹(LokiJS) 어댑터의 Q.like가 한글 검색을
  // 필터하지 못하는 문제(#10) 회피. 대소문자 무시 부분일치(한/영 이름).
  const items = useQueryData(
    () => exerciseRepo.queryExercises({ muscle, equipment, kind }),
    [muscle, equipment, kind],
  );

  // 스무고개 완료 → 선택 결과를 필터로 반영(부위/기구/유산소). @plm SRS-031
  const onWizardDone = useCallback((r: WizardResult) => {
    setMuscle(r.muscle);
    setEquipment(r.equipment);
    setKind(r.kind);
    setSearch('');
    setWizardOpen(false);
  }, []);
  const hasFilter = muscle !== null || equipment !== null || kind !== null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => e.nameKo.toLowerCase().includes(q) || (e.nameEn ?? '').toLowerCase().includes(q));
  }, [items, search]);

  // 헤더 우측: 커스텀 운동 추가
  useLayoutEffect(() => {
    navigation.setOptions({
      title: mode === 'pick' ? t('exercises.pickTitle') : t('exercises.title'),
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ExerciseForm')}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: spacing.sm })}
        >
          <AppText variant="caption" weight="bold" color="primary">
            {t('exercises.addCustom')}
          </AppText>
        </Pressable>
      ),
    });
  }, [navigation, mode, t]);

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
          placeholder={t('exercises.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          containerStyle={{ marginBottom: spacing.sm }}
        />

        {/* 스무고개(종목 찾기 도우미) — 이름 몰라도 부위→기구로 좁히기. @plm SRS-031 */}
        <View style={styles.wizardRow}>
          <Pressable onPress={() => setWizardOpen(true)} style={styles.wizardBtn}>
            <Ionicons name="compass-outline" size={16} color={colors.primary} />
            <AppText variant="caption" weight="bold" color="primary" style={{ marginLeft: 4 }}>
              {t('wizard.open')}
            </AppText>
          </Pressable>
          {hasFilter ? (
            <Pressable onPress={() => { setMuscle(null); setEquipment(null); setKind(null); }} hitSlop={8} style={styles.resetBtn}>
              <Ionicons name="close-circle" size={14} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted" style={{ marginLeft: 3 }}>
                {t('wizard.reset')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {kind === 'cardio' ? (
          <View style={styles.kindBanner}>
            <Ionicons name="heart" size={13} color={colors.primary} />
            <AppText variant="caption" color="primary" style={{ marginLeft: 4 }}>
              {t('wizard.cardioActive')}
            </AppText>
          </View>
        ) : null}

        <FilterRow label={t('exercises.muscleFilter')}>
          {ALL_MUSCLE_GROUPS.map((m) => (
            <Chip
              key={m}
              label={muscleLabel(m, lang)}
              active={muscle === m}
              onPress={() => setMuscle((prev) => (prev === m ? null : m))}
            />
          ))}
        </FilterRow>

        <FilterRow label={t('exercises.equipmentFilter')}>
          {ALL_EQUIPMENT.map((eq) => (
            <Chip
              key={eq}
              label={equipmentLabel(eq, lang)}
              active={equipment === eq}
              onPress={() => setEquipment((prev) => (prev === eq ? null : eq))}
            />
          ))}
        </FilterRow>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ExerciseRow item={item} onPress={() => onPickRow(item)} />}
        ListEmptyComponent={
          <EmptyState
            title={t('exercises.emptyTitle')}
            message={t('exercises.emptyMessage')}
          />
        }
      />
      <ExerciseFinderWizard visible={wizardOpen} onClose={() => setWizardOpen(false)} onDone={onWizardDone} />
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
  const { t, lang } = useT();
  const altName = exerciseAltName(item, lang);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        {item.imageUrl ? (
          <RemoteImage uri={item.imageUrl} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="barbell-outline" size={18} color={colors.textFaint} />
          </View>
        )}
        <View style={styles.rowMain}>
          <AppText variant="heading" numberOfLines={1}>
            {exerciseDisplayName(item, lang)}
          </AppText>
          {altName ? (
            <AppText variant="caption" color="textFaint" numberOfLines={1} style={{ marginTop: 2 }}>
              {altName}
            </AppText>
          ) : null}
          <View style={styles.tags}>
            {item.primaryMuscles.map((m) => (
              <Tag key={m} label={muscleLabel(m, lang)} tone="primary" />
            ))}
            <Tag label={equipmentLabel(item.equipment, lang)} />
            {item.isCustom ? <Tag label={t('exercises.customTag')} tone="muted" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  wizardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  wizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  resetBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.md, paddingVertical: spacing.xs },
  kindBanner: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
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
  thumb: { width: 40, height: 40, borderRadius: radius.sm, marginRight: spacing.md },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
