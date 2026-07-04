import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Card } from './primitives';

// ── Skeleton (펄스 자리표시) ─────────────────────────────────────────
// 콘텐츠 첫 로딩 중 blank 대신 보여줄 회색 펄스 블록. 웹에선 native driver 미지원 → 분기.
export function Skeleton({
  width,
  height,
  radius: r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceAlt, opacity: pulse }, style]}
    />
  );
}

// ── 개별 자리표시 카드 ───────────────────────────────────────────────
function PostSkeleton() {
  return (
    <Card style={styles.postCard}>
      <View style={styles.rowCenter}>
        <Skeleton width={38} height={38} radius={radius.pill} />
        <View style={styles.linesCol}>
          <Skeleton width="45%" height={12} />
          <Skeleton width="28%" height={10} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width="100%" height={180} radius={radius.md} style={{ marginTop: spacing.md }} />
      <View style={[styles.rowCenter, { marginTop: spacing.md, gap: spacing.lg }]}>
        <Skeleton width={44} height={12} />
        <Skeleton width={44} height={12} />
      </View>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={44} height={44} radius={radius.pill} />
      <View style={styles.linesCol}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="75%" height={11} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

function CommentSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={32} height={32} radius={radius.pill} />
      <View style={styles.linesCol}>
        <Skeleton width="35%" height={11} />
        <Skeleton width="90%" height={11} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

// 채팅 스레드용 — 좌/우 정렬 말풍선(실제 Bubble 모양과 일치).
function BubbleSkeleton({ mine }: { mine: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
      <Skeleton width={mine ? '52%' : '64%'} height={38} radius={radius.lg} />
    </View>
  );
}

const VARIANTS = { post: PostSkeleton, row: RowSkeleton, comment: CommentSkeleton } as const;
export type SkeletonVariant = keyof typeof VARIANTS | 'bubble';

// 스크린리더에서 자리표시를 숨김 — iOS/Android는 accessibility props, 웹(PWA 주 타깃)은 aria-hidden.
const HIDE_A11Y =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as unknown as Record<string, unknown>)
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

// ── SkeletonList (첫 로딩 자리표시 목록) ─────────────────────────────
// 화면의 콘텐츠 컨테이너 안(패딩 상속)에서 count개 자리표시를 렌더.
export function SkeletonList({
  variant = 'post',
  count = 4,
  style,
}: {
  variant?: SkeletonVariant;
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Array.from({ length: count }, (_, i) => {
    if (variant === 'bubble') return <BubbleSkeleton key={i} mine={i % 2 === 1} />;
    const Item = VARIANTS[variant];
    return <Item key={i} />;
  });
  return (
    <View style={[styles.list, style]} {...HIDE_A11Y}>
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingVertical: spacing.xs },
  postCard: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  linesCol: { flex: 1, marginLeft: spacing.md },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
});
