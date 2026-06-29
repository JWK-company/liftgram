// @plm SRS-001  운동 상세 — 근육군·기구·대체운동·추정1RM 추세·커스텀 수정/보관
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen,
  Button,
  AppText,
  Card,
  Tag,
  Divider,
  SectionHeader,
  SimpleBarChart,
} from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { exerciseRepo, analyticsRepo } from '../../data';
import type { TrendPoint } from '../../data';
import type { Exercise } from '../../db/models';
import { muscleLabel, equipmentLabel, formatWeight, exerciseDisplayName, exerciseAltName } from '../../domain';
import { useUser } from '../../state/userContext';
import { useT } from '../../i18n';
import { colors, spacing } from '../../theme';

export default function ExerciseDetailScreen({ navigation, route }: RootStackScreenProps<'ExerciseDetail'>) {
  const { exerciseId } = route.params;
  const { t, lang } = useT();
  const { weightUnit, availableEquipment } = useUser();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [substitutes, setSubstitutes] = useState<Exercise[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [myEquipmentOnly, setMyEquipmentOnly] = useState(true);

  // 화면 포커스마다 재로드(수정 후 돌아왔을 때 반영).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      (async () => {
        try {
          const ex = await exerciseRepo.getExercise(exerciseId);
          if (!alive) return;
          setExercise(ex);
          const [subs, t] = await Promise.all([
            exerciseRepo.getSubstitutes(ex),
            analyticsRepo.getExercise1RMTrend(exerciseId),
          ]);
          if (!alive) return;
          setSubstitutes(subs);
          setTrend(t);
        } catch {
          /* 삭제됨 등 — 빈 상태 유지 */
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [exerciseId]),
  );

  const onArchive = useCallback(() => {
    Alert.alert(t('exercises.archiveTitle'), t('exercises.archiveMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('exercises.archive'),
        style: 'destructive',
        onPress: async () => {
          try {
            await exerciseRepo.archiveExercise(exerciseId);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t('common.error'), String(e));
          }
        },
      },
    ]);
  }, [exerciseId, navigation, t]);

  if (loading && !exercise) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!exercise) {
    return (
      <Screen>
        <View style={styles.loading}>
          <AppText variant="body" color="textMuted">
            {t('exercises.notFound')}
          </AppText>
        </View>
      </Screen>
    );
  }

  // 가용 기구 필터(SRS-013): 설정한 기구 + 맨몸(항상 가능)만. 미설정이면 필터 없음.
  const availableSet = availableEquipment.length
    ? new Set<string>([...availableEquipment, 'bodyweight'])
    : null;
  const filterActive = !!availableSet && myEquipmentOnly;
  const shownSubs = filterActive ? substitutes.filter((s) => availableSet!.has(s.equipment)) : substitutes;

  return (
    <Screen scroll>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <AppText variant="title" style={{ flex: 1 }}>
          {exerciseDisplayName(exercise, lang)}
        </AppText>
        {exercise.isCustom ? <Tag label={t('exercises.customTag')} tone="muted" /> : null}
      </View>
      {exerciseAltName(exercise, lang) ? (
        <AppText variant="body" color="textFaint" style={{ marginTop: 2 }}>
          {exerciseAltName(exercise, lang)}
        </AppText>
      ) : null}

      {/* 분류 */}
      <Card style={styles.section}>
        <AppText variant="label" color="textMuted">
          {t('exercises.primaryMuscles')}
        </AppText>
        <View style={styles.tags}>
          {exercise.primaryMuscles.length ? (
            exercise.primaryMuscles.map((m) => <Tag key={m} label={muscleLabel(m, lang)} tone="primary" />)
          ) : (
            <AppText variant="caption" color="textFaint">
              {t('common.none')}
            </AppText>
          )}
        </View>

        {exercise.secondaryMuscles.length ? (
          <>
            <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
              {t('exercises.secondaryMuscles')}
            </AppText>
            <View style={styles.tags}>
              {exercise.secondaryMuscles.map((m) => (
                <Tag key={m} label={muscleLabel(m, lang)} />
              ))}
            </View>
          </>
        ) : null}

        <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
          {t('exercises.equipment')}
        </AppText>
        <View style={styles.tags}>
          <Tag label={equipmentLabel(exercise.equipment, lang)} />
          {exercise.category ? <Tag label={exercise.category} tone="muted" /> : null}
        </View>
      </Card>

      {/* 추정 1RM 추세 */}
      {trend.length > 0 ? (
        <Card style={styles.section}>
          <SectionHeader title={t('exercises.oneRepMaxTrendTitle', { oneRepMaxLabel: t('wellness.oneRepMaxLabel') })} />
          <SimpleBarChart
            data={trend.map((point) => ({ label: point.label, value: point.value }))}
            formatValue={(v) => formatWeight(v, weightUnit)}
          />
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
            {t('wellness.oneRepMaxCaption')}
          </AppText>
        </Card>
      ) : null}

      {/* 대체 운동 */}
      <Card style={styles.section}>
        <SectionHeader
          title={t('exercises.substitutesTitle')}
          right={
            availableSet ? (
              <Pressable onPress={() => setMyEquipmentOnly((v) => !v)} hitSlop={8} style={styles.eqToggle}>
                <Ionicons
                  name={myEquipmentOnly ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={myEquipmentOnly ? colors.primary : colors.textMuted}
                />
                <AppText variant="caption" color="textMuted" style={{ marginLeft: 4 }}>
                  {t('exercises.myEquipmentOnly')}
                </AppText>
              </Pressable>
            ) : undefined
          }
        />
        {substitutes.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            {t('exercises.noSubstitutes')}
          </AppText>
        ) : shownSubs.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            {t('exercises.noSubstitutesForEquipment')}
          </AppText>
        ) : (
          shownSubs.map((sub, i) => (
            <View key={sub.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => navigation.push('ExerciseDetail', { exerciseId: sub.id })}
                style={({ pressed }) => [styles.subRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" numberOfLines={1}>
                    {exerciseDisplayName(sub, lang)}
                  </AppText>
                  <AppText variant="caption" color="textFaint" numberOfLines={1} style={{ marginTop: 2 }}>
                    {equipmentLabel(sub.equipment, lang)}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          ))
        )}
      </Card>

      {/* 커스텀 운동 관리 */}
      {exercise.isCustom ? (
        <View style={styles.actions}>
          <Button
            title={t('common.edit')}
            variant="secondary"
            icon="create-outline"
            onPress={() => navigation.navigate('ExerciseForm', { exerciseId: exercise.id })}
          />
          <Button title={t('exercises.archiveHide')} variant="danger" icon="archive-outline" onPress={onArchive} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { marginTop: spacing.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  eqToggle: { flexDirection: 'row', alignItems: 'center' },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
