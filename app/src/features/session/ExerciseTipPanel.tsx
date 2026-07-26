// @plm SRS-046  세션 중 운동 팁 패널 — 접이식 미디어(2프레임 시연) ↔ 1·2·3·4 단계 설명 전환.
// 미디어(빠른 확인)와 단계 텍스트(정확한 학습)의 이중 구조. 접힘 상태는 종목별로 세션 동안 기억.
// 미디어 소싱은 ADR-029(GymVisual 구매·자체 호스팅) — 확보 전엔 기존 free-exercise-db 2컷을 사용하고,
// 에셋 교체는 exerciseMedia 매핑 갱신만으로 이뤄진다(이 컴포넌트 무변경). 미디어 없으면 단계 설명만.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, RemoteImage } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { getExerciseMedia, type ExerciseMedia } from '../../data/exerciseMedia';
import { useT } from '../../i18n';

// 접힘 상태 종목별 기억(세션 수명 — 영속 불필요). 기본 접힘(공간 절약).
const expandedByExercise = new Map<string, boolean>();

export function ExerciseTipPanel({ nameKo }: { nameKo: string | null }) {
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(() => (nameKo ? expandedByExercise.get(nameKo) ?? false : false));
  const [mode, setMode] = useState<'media' | 'steps'>('media');
  useEffect(() => {
    if (nameKo) setExpanded(expandedByExercise.get(nameKo) ?? false);
    setMode('media');
  }, [nameKo]);

  if (!nameKo) return null;
  const media = getExerciseMedia(nameKo);
  const steps = media ? (lang === 'ko' && media.instructionsKo.length ? media.instructionsKo : media.instructionsEn) : [];
  if (!media && steps.length === 0) return null;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (nameKo) expandedByExercise.set(nameKo, next);
    if (next) setMode(media ? 'media' : 'steps');
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} hitSlop={6} style={styles.toggleRow}>
        <Ionicons name="film-outline" size={14} color={colors.textMuted} />
        <AppText variant="label" color="textMuted">
          {t('session.tipToggle')}
        </AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Pressable>
      {expanded ? (
        mode === 'media' && media ? (
          <Pressable onPress={() => steps.length > 0 && setMode('steps')} style={styles.mediaBox}>
            <TwoFrameLoop media={media} />
            {steps.length > 0 ? (
              <AppText variant="label" color="textFaint" center style={{ marginTop: 2 }}>
                {t('session.tipTapForSteps')}
              </AppText>
            ) : null}
          </Pressable>
        ) : (
          <Pressable onPress={() => media && setMode('media')} style={styles.stepsBox}>
            {steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <AppText variant="label" color="primary" weight="bold">
                    {i + 1}
                  </AppText>
                </View>
                <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                  {step}
                </AppText>
              </View>
            ))}
            {media ? (
              <AppText variant="label" color="textFaint" center style={{ marginTop: 2 }}>
                {t('session.tipTapForMedia')}
              </AppText>
            ) : null}
          </Pressable>
        )
      ) : null}
    </View>
  );
}

// 동작 시연 — 3D 움짤(gif)이 있으면 그걸, 없으면 시작/끝 2프레임 교차 루프. @plm SRS-032 SRS-046
// gif 전환은 exerciseMedia3d.data 매핑만 채우면 됨(ingest 스크립트 — ADR-029 자체 호스팅).
function TwoFrameLoop({ media }: { media: ExerciseMedia }) {
  const [frame, setFrame] = useState(0);
  const isGif = !!media.gif;
  useEffect(() => {
    if (isGif) return; // GIF는 브라우저가 자체 루프
    const iv = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1100);
    return () => clearInterval(iv);
  }, [isGif]);
  if (media.gif) {
    return (
      <View style={styles.animWrap}>
        <RemoteImage uri={media.gif} style={styles.animImg} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={styles.animWrap}>
      <RemoteImage uri={media.start} style={[styles.animImg, { opacity: frame === 0 ? 1 : 0 }]} resizeMode="contain" />
      <RemoteImage uri={media.end} style={[styles.animImg, { opacity: frame === 1 ? 1 : 0 }]} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  mediaBox: { marginTop: spacing.xs },
  animWrap: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  animImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  stepsBox: {
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  stepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
});
