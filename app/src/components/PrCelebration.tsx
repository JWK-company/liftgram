// @plm SRS-005  라이브 PR 축하 토스트 — 세트 체크 시 폭죽 이펙트와 함께 쓱 떴다 자동으로 사라진다(탭 불필요).
// 휘발 알림일 뿐 기록이 아니다 — 최종 PR은 운동 '완료 저장' 시 completeWorkout이 확정한다.
// AlertHost와 같은 모듈 이벤트 버스 패턴. 호스트는 ActiveWorkoutScreen 루트에 1회 마운트.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import { useT } from '../i18n';
import type { PRType } from '../domain';

export interface PrCelebrationPayload {
  exerciseName: string;
  types: PRType[]; // 'maxWeight' | 'maxVolumeSet'
}

type PrToast = PrCelebrationPayload & { id: number };

let _listener: ((t: PrToast) => void) | null = null;
let _seq = 0;

export function firePrCelebration(p: PrCelebrationPayload): void {
  _listener?.({ id: ++_seq, ...p });
}

const SHOW_MS = 2400; // 총 표시 시간 — 사용자가 누르지 않아도 알아서 사라진다
const CONFETTI_COLORS = ['#F59E0B', '#F472B6', '#4F8EF7', '#34D399', '#A78BFA', '#F87171', '#22D3EE'];
const PARTICLES = 14;

export function PrCelebrationHost() {
  const { t } = useT();
  const [toast, setToast] = useState<PrToast | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    _listener = (tst) => setToast(tst);
    return () => {
      _listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    fade.setValue(0);
    burst.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.delay(SHOW_MS - 180 - 420),
        Animated.timing(fade, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]),
      Animated.timing(burst, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    const timer = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, fade, burst]);

  // 폭죽 파티클 — 토스트마다 무작위 각도·거리·색(사방으로 흩어지는 단순 버스트).
  const particles = useMemo(() => {
    if (!toast) return [];
    return Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (Math.PI * 2 * i) / PARTICLES + Math.random() * 0.5;
      const dist = 60 + Math.random() * 70;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist * 0.75 + 20, // 살짝 아래로 낙하하는 느낌
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: (Math.random() - 0.5) * 540,
        size: 5 + Math.random() * 4,
      };
    });
  }, [toast]);

  if (!toast) return null;

  const label = toast.types
    .map((ty) => t(ty === 'maxWeight' ? 'session.prTypeWeight' : 'session.prTypeVolume'))
    .join(' · ');

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.center, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
        {particles.map((p, i) => (
          <Animated.View
            key={`${toast.id}_${i}`}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                  { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                ],
              },
            ]}
          />
        ))}
        <View style={styles.pill}>
          <AppText variant="body" weight="bold" center>
            🎉 {t('session.prToast', { name: toast.exerciseName, label })}
          </AppText>
          <AppText variant="label" color="textMuted" center style={{ marginTop: 2 }}>
            {t('session.prToastHint')}
          </AppText>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '22%',
    zIndex: 999,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', borderRadius: 2 },
  pill: {
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.pr,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
