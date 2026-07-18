// @plm SRS-001  커스텀 운동 등록/수정 — 이름·근육군·기구 입력 + 검증
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, TextField, AppText, RemoteImage } from '../../components';
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
import { serverApi } from '../../sync/serverApi';
import { colors, spacing, radius } from '../../theme';
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
        setImageUrl(ex.imageUrl);
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

  // 종목 이미지: 라이브러리에서 선택 → 서버 업로드 후 원격 URL 저장(오프라인/미로그인 시 graceful 실패).
  const onPickImage = async () => {
    if (uploadingImage) return;
    setUploadingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      const media = await serverApi.uploadImage({ uri: a.uri, fileName: a.fileName, mimeType: a.mimeType });
      setImageUrl(media.url);
    } catch {
      Alert.alert(t('common.error'), t('exercises.imageUploadFailed'));
    } finally {
      setUploadingImage(false);
    }
  };

  // 이름만 있으면 생성 가능 — 근육군·기구는 선택(미지정 시 '기타'로 기본). @plm SRS-001
  const valid = useMemo(() => nameKo.trim().length > 0, [nameKo]);

  const onSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // 보조 근육에서 주 근육 중복 제거. 미선택 근육/기구는 '기타'로 폴백(이름만으로 생성 지원).
      const primaryClean = primary.length ? primary : (['other'] as MuscleGroup[]);
      const secondaryClean = secondary.filter((m) => !primaryClean.includes(m));
      const eq = equipment ?? 'other';
      if (isEdit && exerciseId) {
        await exerciseRepo.updateExercise(exerciseId, {
          nameKo: nameKo.trim(),
          nameEn: nameEn.trim() || null,
          primaryMuscles: primaryClean,
          secondaryMuscles: secondaryClean,
          equipment: eq,
          category: category.trim() || null,
          imageUrl,
        });
      } else {
        await exerciseRepo.createCustomExercise({
          nameKo: nameKo.trim(),
          nameEn: nameEn.trim() || null,
          primaryMuscles: primaryClean,
          secondaryMuscles: secondaryClean,
          equipment: eq,
          category: category.trim() || null,
          imageUrl,
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

      <FieldLabel text={t('exercises.imageLabel')} hint={t('exercises.optionalHint')} />
      <View style={styles.imageSection}>
        {imageUrl ? (
          <RemoteImage uri={imageUrl} style={styles.imagePreview} />
        ) : (
          <View style={[styles.imagePreview, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={colors.textFaint} />
          </View>
        )}
        <View style={styles.imageButtons}>
          <Button
            title={imageUrl ? t('exercises.changeImage') : t('exercises.addImage')}
            variant="secondary"
            onPress={onPickImage}
            loading={uploadingImage}
          />
          {imageUrl ? (
            <Button
              title={t('exercises.removeImage')}
              variant="danger"
              onPress={() => setImageUrl(null)}
              disabled={uploadingImage}
            />
          ) : null}
        </View>
      </View>

      <FieldLabel text={t('exercises.primaryMusclesLabel')} hint={t('exercises.optionalHint')} />
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

      <FieldLabel text={t('exercises.equipmentLabel')} hint={t('exercises.optionalHint')} />
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
  imageSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  imagePreview: { width: 80, height: 80, borderRadius: radius.md },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  imageButtons: { flex: 1, gap: spacing.sm },
});
