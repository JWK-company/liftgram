// @plm SRS-001  운동 상세 — 근육군·기구·대체운동·추정1RM 추세·커스텀 수정/보관
import React, { useCallback, useEffect, useState } from 'react';
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
  RemoteImage,
} from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { exerciseRepo, analyticsRepo } from '../../data';
import { getExerciseMedia, EXERCISE_MEDIA_CREDIT, type ExerciseMedia } from '../../data/exerciseMedia';
import type { TrendPoint } from '../../data';
import type { Exercise } from '../../db/models';
import { muscleLabel, equipmentLabel, formatWeight, exerciseListName, exerciseAltName, detectStall } from '../../domain';
import { hasPendingPick, resolveExercisePick } from '../../utils/picker';
import { useUser } from '../../state/userContext';
import { useT } from '../../i18n';
import { colors, spacing, radius } from '../../theme';

export default function ExerciseDetailScreen({ navigation, route }: RootStackScreenProps<'ExerciseDetail'>) {
  const { exerciseId } = route.params;
  const { t, lang } = useT();
  const { weightUnit, availableEquipment } = useUser();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [substitutes, setSubstitutes] = useState<Exercise[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [myEquipmentOnly, setMyEquipmentOnly] = useState(true);
  // 픽(운동/루틴 추가) 흐름에서 상세를 미리보기로 열었으면 '이 운동 추가' 버튼 노출(진입 시점 기준). @plm SRS-001
  const [pickMode] = useState(() => hasPendingPick());

  // 상세에서 바로 추가 — 픽 해결(추가) 후 상세·피커 두 화면 pop 하고 호출자(운동/루틴)로 복귀.
  const onAddFromPick = useCallback(() => {
    resolveExercisePick(exerciseId);
    if (typeof navigation.pop === 'function') navigation.pop(2);
    else navigation.goBack();
  }, [exerciseId, navigation]);

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

  // 정체 감지(SRS-010): 추정 1RM 추세가 최근 정체면 디로드/회복 권고(웰니스 — 진단 없음).
  const stall = detectStall(trend.map((p) => p.value));

  // 자세 미디어(사진 2컷·설명) — free-exercise-db 정적 매핑. 커스텀은 없음(각자 imageUrl). @plm SRS-032
  const media = getExerciseMedia(exercise.nameKo);
  const instructions = media ? (lang === 'ko' && media.instructionsKo.length ? media.instructionsKo : media.instructionsEn) : [];

  return (
    <Screen scroll>
      {/* 헤더 */}
      <View style={styles.titleRow}>
        <AppText variant="title" style={{ flex: 1 }}>
          {exerciseListName(exercise, lang)}
        </AppText>
        {exercise.isCustom ? <Tag label={t('exercises.customTag')} tone="muted" /> : null}
      </View>
      {exerciseAltName(exercise, lang) ? (
        <AppText variant="body" color="textFaint" style={{ marginTop: 2 }}>
          {exerciseAltName(exercise, lang)}
        </AppText>
      ) : null}

      {/* 픽 흐름(운동/루틴 추가)에서 미리보기로 열었으면 상세에서 바로 추가. @plm SRS-001 */}
      {pickMode ? (
        <Button title={t('exercises.addThisExercise')} icon="add" onPress={onAddFromPick} style={{ marginTop: spacing.md }} />
      ) : null}

      {/* 자세 시연 — 시작/끝 2프레임 교차(움짤 효과). 없으면 커스텀 imageUrl. @plm SRS-032 */}
      {media ? (
        <>
          <ExerciseAnimation media={media} />
          <AppText variant="caption" color="textFaint" center style={{ marginTop: 4 }}>
            {t('exercises.mediaCredit', { credit: EXERCISE_MEDIA_CREDIT })}
          </AppText>
        </>
      ) : exercise.imageUrl ? (
        <RemoteImage uri={exercise.imageUrl} style={styles.heroImage} />
      ) : null}

      {/* 자세 설명(step) */}
      {instructions.length ? (
        <Card style={styles.section}>
          <SectionHeader title={t('exercises.formGuideTitle')} />
          {instructions.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <AppText variant="caption" color="primary" weight="bold">
                  {i + 1}
                </AppText>
              </View>
              <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
                {step}
              </AppText>
            </View>
          ))}
        </Card>
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
          {stall.stalled ? (
            <View style={styles.stallNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              <AppText variant="caption" color="warning" style={{ marginLeft: spacing.xs, flex: 1 }}>
                {t('progression.reason.stall')}
              </AppText>
            </View>
          ) : null}
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
                    {exerciseListName(sub, lang)}
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

// 시작/끝 2프레임 교차 시연(움짤 효과). 탭하면 정지/재생. @plm SRS-032
function ExerciseAnimation({ media }: { media: ExerciseMedia }) {
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1100);
    return () => clearInterval(iv);
  }, [paused]);
  return (
    <Pressable onPress={() => setPaused((p) => !p)} style={styles.animWrap}>
      {/* 두 프레임을 겹쳐 두고 opacity 토글 → 재로드 없이 부드러운 2프레임 루프 */}
      <RemoteImage uri={media.start} style={[styles.animImg, { opacity: frame === 0 ? 1 : 0 }]} resizeMode="contain" />
      <RemoteImage uri={media.end} style={[styles.animImg, { opacity: frame === 1 ? 1 : 0 }]} resizeMode="contain" />
      {paused ? (
        <View style={styles.animPause}>
          <Ionicons name="play" size={20} color={colors.onPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroImage: { width: '100%', height: 200, borderRadius: radius.md, marginTop: spacing.md },
  animWrap: {
    width: '100%',
    height: 240,
    borderRadius: radius.md,
    marginTop: spacing.md,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  animImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  animPause: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm, gap: spacing.sm },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  section: { marginTop: spacing.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  eqToggle: { flexDirection: 'row', alignItems: 'center' },
  stallNote: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
