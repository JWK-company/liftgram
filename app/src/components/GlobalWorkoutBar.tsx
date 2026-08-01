// @plm SRS-004  전역 운동 바(#12) — 운동 중이면 어느 화면에서든 하단에 경과·휴식이 떠 있고,
// 탭하면 바로 운동 화면으로 복귀. 휴식은 전역(sessionContext)이라 화면을 옮겨도 유지된다.
import React, { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import { useSession } from '../state/sessionContext';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { isTabRoute } from '../navigation/tabRoutes';

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// 바의 배치 상수 — 화면(Screen)이 같은 값으로 하단 여유공간을 잡는다(가림 방지).
const BAR_BOTTOM_TABS = 60; // 탭 화면: 탭바 바로 위에 앉도록 띄우는 거리
const BAR_BOTTOM_STACK = spacing.md; // 탭바 없는 스택 화면: 화면 바닥 가까이(빈 띠 방지)
const BAR_HEIGHT = 52; // 바 높이(라벨 2줄 + 상하 패딩)

// 전역 운동 바가 덮는 만큼 화면 하단에 비워둘 여백(px). 운동 중이 아니면 0.
// 바는 루트 오버레이라 화면 레이아웃이 자리를 비켜주지 않는다 — 이게 없으면 목록·버튼 등
// 각 화면의 마지막 요소가 바에 가려진다(사용자 리포트 2026-08-01). @plm SRS-004
export function useWorkoutBarInset(): number {
  const { activeWorkoutId } = useSession();
  const insets = useSafeAreaInsets();
  // 탭 화면이면 탭바 높이(safe-area 포함), 탭 밖 스택 화면이면 undefined → 콘텐츠가 창 바닥까지.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  if (!activeWorkoutId) return 0;
  const barBottom = tabBarHeight != null ? BAR_BOTTOM_TABS : BAR_BOTTOM_STACK;
  const barTop = insets.bottom + barBottom + BAR_HEIGHT; // 창 바닥에서 바 상단까지
  const contentBottom = tabBarHeight ?? 0; // 창 바닥에서 화면 콘텐츠 하단까지
  return Math.max(0, barTop - contentBottom) + spacing.sm; // 바와 콘텐츠 사이 숨쉴 틈
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
  // 탭 화면이면 탭바 위, 탭 밖(스택) 화면이면 화면 바닥 가까이 — 화면이 비워두는 여백(useWorkoutBarInset)과 같은 규칙.
  const onTab = isTabRoute(routeName);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + (onTab ? BAR_BOTTOM_TABS : BAR_BOTTOM_STACK) }]}
    >
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
