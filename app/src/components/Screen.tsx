import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { useWorkoutBarInset } from './GlobalWorkoutBar';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
}

// 모든 화면의 루트 래퍼. 다크 배경 + safe-area + 선택적 스크롤/패딩.
// 운동 중에는 전역 운동 바(루트 오버레이)가 하단을 덮으므로 그만큼 푸터 여유공간을 스페이서로 잡는다
// — 스타일 병합(호출부 contentContainerStyle의 paddingBottom)과 충돌하지 않게 자식으로 넣는다. @plm SRS-004
export function Screen({
  children,
  scroll,
  padded = true,
  style,
  edges = ['top', 'left', 'right'],
  contentContainerStyle,
}: ScreenProps) {
  const pad = padded ? { padding: spacing.lg } : undefined;
  const barInset = useWorkoutBarInset();
  const footer = barInset > 0 ? <View style={{ height: barInset }} /> : null;
  if (scroll) {
    return (
      <SafeAreaView style={[styles.root, style]} edges={edges}>
        <ScrollView
          contentContainerStyle={[pad, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
          {footer}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.root, style]} edges={edges}>
      <View style={[styles.flex, pad, contentContainerStyle]}>
        {children}
        {footer}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
});
