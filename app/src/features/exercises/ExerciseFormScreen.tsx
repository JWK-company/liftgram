// @plm SRS-001  커스텀 운동 등록/수정 — 이름·근육군·기구 입력 + 검증
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Screen, Button, TextField, AppText } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { exerciseRepo } from '../../data';
import {
  muscleLabel,
  equipmentLabel,
  ALL_MUSCLE_GROUPS,
  ALL_EQUIPMENT,
  type MuscleGroup,
  type EquipmentType,
} from '../../domain';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';
import { Chip } from './Chip';

export default function ExerciseFormScreen({ navigation, route }: RootStackScreenProps<'ExerciseForm'>) {
  const { t, lang } = useT();
  const exerciseId = route.params?.exerciseId;
  const isEdit = !!exerciseId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [nameKo, setNameKo] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<EquipmentType | null>(null);
  const [category, setCategory] = useState('');

  // 수정 모드: 기존 값 프리필
  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    (async () => {
      try {
        const ex = await exerciseRepo.getExercise(exerciseId);
        if (!alive) return;
        setNameKo(ex.nameKo);
        setNameEn(ex.nameEn ?? '');
        setPrimary(ex.primaryMuscles);
        setSecondary(ex.secondaryMuscles);
        setEquipment(ex.equipment);
        setCategory(ex.category ?? '');
      } catch (e) {
        Alert.alert(t('common.error'), String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? t('exercises.editTitle') : t('exercises.customTitle') });
  }, [navigation, isEdit, t]);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) => (v: T) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const togglePrimary = toggle(setPrimary);
  const toggleSecondary = toggle(setSecondary);

  const valid = useMemo(
    () => nameKo.trim().length > 0 && primary.length >= 1 && equipment !== null,
    [nameKo, primary, equipment],
  );

  const onSave = async () => {
    if (!valid || equipment === null || saving) return;
    setSaving(true);
    try {
      // 보조 근육에서 주 근육 중복 제거
      const secondaryClean = secondary.filter((m) => !primary.includes(m));
      if (isEdit && exerciseId) {
        await exerciseRepo.updateExercise(exerciseId, {
          nameKo: nameKo.trim(),
          nameEn: nameEn.trim() || null,
          primaryMuscles: primary,
          secondaryMuscles: secondaryClean,
          equipment,
          category: category.trim() || null,
        });
      } else {
        await exerciseRepo.createCustomExercise({
          nameKo: nameKo.trim(),
          nameEn: nameEn.trim() || null,
          primaryMuscles: primary,
          secondaryMuscles: secondaryClean,
          equipment,
          category: category.trim() || null,
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <TextField
        label={t('exercises.nameKoLabel')}
        placeholder={t('exercises.nameKoPlaceholder')}
        value={nameKo}
        onChangeText={setNameKo}
      />
      <TextField
        label={t('exercises.nameEnLabel')}
        placeholder={t('exercises.nameEnPlaceholder')}
        value={nameEn}
        onChangeText={setNameEn}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <FieldLabel text={t('exercises.primaryMusclesLabel')} hint={t('exercises.selectOneOrMoreHint')} />
      <ChipGrid>
        {ALL_MUSCLE_GROUPS.map((m) => (
          <Chip key={m} label={muscleLabel(m, lang)} active={primary.includes(m)} onPress={() => togglePrimary(m)} />
        ))}
      </ChipGrid>

      <FieldLabel text={t('exercises.secondaryMusclesLabel')} hint={t('exercises.optionalHint')} />
      <ChipGrid>
        {ALL_MUSCLE_GROUPS.map((m) => (
          <Chip
            key={m}
            label={muscleLabel(m, lang)}
            active={secondary.includes(m)}
            onPress={() => toggleSecondary(m)}
          />
        ))}
      </ChipGrid>

      <FieldLabel text={t('exercises.equipmentLabel')} hint={t('exercises.selectOneHint')} />
      <ChipGrid>
        {ALL_EQUIPMENT.map((eq) => (
          <Chip
            key={eq}
            label={equipmentLabel(eq, lang)}
            active={equipment === eq}
            onPress={() => setEquipment((prev) => (prev === eq ? null : eq))}
          />
        ))}
      </ChipGrid>

      <TextField
        label={t('exercises.categoryLabel')}
        placeholder={t('exercises.categoryPlaceholder')}
        value={category}
        onChangeText={setCategory}
        containerStyle={{ marginTop: spacing.lg }}
      />

      <Button
        title={isEdit ? t('common.save') : t('common.add')}
        onPress={onSave}
        disabled={!valid}
        loading={saving}
        style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}
      />
    </Screen>
  );
}

function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={styles.fieldLabel}>
      <AppText variant="label" color="textMuted">
        {text}
      </AppText>
      {hint ? (
        <AppText variant="label" color="textFaint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function ChipGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipGrid}>{children}</View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
