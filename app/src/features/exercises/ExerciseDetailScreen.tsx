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
import { muscleLabel, equipmentLabel, formatWeight, WELLNESS } from '../../domain';
import { useUser } from '../../state/userContext';
import { colors, spacing } from '../../theme';

export default function ExerciseDetailScreen({ navigation, route }: RootStackScreenProps<'ExerciseDetail'>) {
  const { exerciseId } = route.params;
  const { weightUnit } = useUser();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [substitutes, setSubstitutes] = useState<Exercise[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

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
    Alert.alert('운동 보관', '이 커스텀 운동을 목록에서 숨길까요? 기존 기록은 유지됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '보관',
        style: 'destructive',
        onPress: async () => {
          try {
            await exerciseRepo.archiveExercise(exerciseId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('오류', String(e));
          }
        },
      },
    ]);
  }, [exerciseId, navigation]);

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
            운동을 찾을 수 없어요.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <AppText variant="title" style={{ flex: 1 }}>
          {exercise.nameKo}
        </AppText>
        {exercise.isCustom ? <Tag label="커스텀" tone="muted" /> : null}
      </View>
      {exercise.nameEn ? (
        <AppText variant="body" color="textFaint" style={{ marginTop: 2 }}>
          {exercise.nameEn}
        </AppText>
      ) : null}

      {/* 분류 */}
      <Card style={styles.section}>
        <AppText variant="label" color="textMuted">
          주 근육군
        </AppText>
        <View style={styles.tags}>
          {exercise.primaryMuscles.length ? (
            exercise.primaryMuscles.map((m) => <Tag key={m} label={muscleLabel(m)} tone="primary" />)
          ) : (
            <AppText variant="caption" color="textFaint">
              없음
            </AppText>
          )}
        </View>

        {exercise.secondaryMuscles.length ? (
          <>
            <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
              보조 근육군
            </AppText>
            <View style={styles.tags}>
              {exercise.secondaryMuscles.map((m) => (
                <Tag key={m} label={muscleLabel(m)} />
              ))}
            </View>
          </>
        ) : null}

        <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
          기구
        </AppText>
        <View style={styles.tags}>
          <Tag label={equipmentLabel(exercise.equipment)} />
          {exercise.category ? <Tag label={exercise.category} tone="muted" /> : null}
        </View>
      </Card>

      {/* 추정 1RM 추세 */}
      {trend.length > 0 ? (
        <Card style={styles.section}>
          <SectionHeader title={`${WELLNESS.oneRepMaxLabel} 추세`} />
          <SimpleBarChart
            data={trend.map((t) => ({ label: t.label, value: t.value }))}
            formatValue={(v) => formatWeight(v, weightUnit)}
          />
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
            {WELLNESS.oneRepMaxCaption}
          </AppText>
        </Card>
      ) : null}

      {/* 대체 운동 */}
      <Card style={styles.section}>
        <SectionHeader title="대체 운동" />
        {substitutes.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            등록된 대체 운동이 없어요.
          </AppText>
        ) : (
          substitutes.map((sub, i) => (
            <View key={sub.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => navigation.push('ExerciseDetail', { exerciseId: sub.id })}
                style={({ pressed }) => [styles.subRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" numberOfLines={1}>
                    {sub.nameKo}
                  </AppText>
                  <AppText variant="caption" color="textFaint" numberOfLines={1} style={{ marginTop: 2 }}>
                    {equipmentLabel(sub.equipment)}
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
            title="수정"
            variant="secondary"
            icon="create-outline"
            onPress={() => navigation.navigate('ExerciseForm', { exerciseId: exercise.id })}
          />
          <Button title="보관(숨김)" variant="danger" icon="archive-outline" onPress={onArchive} />
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
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
