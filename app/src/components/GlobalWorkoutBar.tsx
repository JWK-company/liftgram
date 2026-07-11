// @plm SRS-004  전역 운동 바(#12) — 운동 중이면 어느 화면에서든 하단에 경과·휴식이 떠 있고,
// 탭하면 바로 운동 화면으로 복귀. 휴식은 전역(sessionContext)이라 화면을 옮겨도 유지된다.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import { useSession } from '../state/sessionContext';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function GlobalWorkoutBar({
  navRef,
  routeName,
}: {
  navRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  routeName: string | undefined;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { activeWorkoutId, activeStartedAt, activeName, restRemaining } = useSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeWorkoutId) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [activeWorkoutId]);

  // 운동 중이 아니거나, 이미 운동/요약 화면이면 숨김(그 화면엔 자체 타이머/휴식이 있음).
  if (!activeWorkoutId || routeName === 'ActiveWorkout' || routeName === 'WorkoutSummary') return null;

  const elapsed = activeStartedAt ? Math.round((now - activeStartedAt) / 1000) : 0;
  const resting = restRemaining != null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 60 }]}>
      <Pressable
        onPress={() => {
          if (navRef.isReady()) navRef.navigate('ActiveWorkout', { workoutId: activeWorkoutId });
        }}
        style={[styles.bar, resting && styles.barResting]}
      >
        <Ionicons name={resting ? 'timer-outline' : 'barbell-outline'} size={18} color={resting ? colors.bg : colors.onPrimary} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={resting ? 'bg' : 'onPrimary'} numberOfLines={1}>
            {resting ? t('session.restingBar', { time: clock(restRemaining ?? 0) }) : activeName || t('routines.activeWorkout')}
          </AppText>
          <AppText variant="caption" color={resting ? 'bg' : 'onPrimary'} numberOfLines={1} style={{ opacity: 0.9 }}>
            {t('session.elapsedBar', { time: clock(elapsed) })}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={resting ? colors.bg : colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  barResting: { backgroundColor: colors.pr },
});
