import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
}

// 모든 화면의 루트 래퍼. 다크 배경 + safe-area + 선택적 스크롤/패딩.
export function Screen({
  children,
  scroll,
  padded = true,
  style,
  edges = ['top', 'left', 'right'],
  contentContainerStyle,
}: ScreenProps) {
  const pad = padded ? { padding: spacing.lg } : undefined;
  if (scroll) {
    return (
      <SafeAreaView style={[styles.root, style]} edges={edges}>
        <ScrollView
          contentContainerStyle={[pad, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.root, style]} edges={edges}>
      <View style={[styles.flex, pad, contentContainerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
});
