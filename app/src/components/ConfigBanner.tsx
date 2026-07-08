// 배포 오설정 경고 배너 — 배포 웹앱이 서버 주소(EXPO_PUBLIC_SERVER_URL) 없이 빌드돼 localhost를
// 때리는 경우(=로그인·피드·DM 등 소셜 전부 무증상 실패)를 화면 최상단에 눈에 띄게 알린다.
// config.ts의 console.error 경고를 UI로 승격 → 콘솔을 안 보는 테스터도 "설정 문제"임을 바로 인지.
// 정상 배포(서버 주소 설정됨)에선 null을 렌더 → 레이아웃 영향 0.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './primitives';
import { colors, spacing } from '../theme';
import { isServerMisconfigured } from '../config';

export function ConfigBanner() {
  const insets = useSafeAreaInsets();
  if (!isServerMisconfigured) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + spacing.sm }]}>
      <AppText variant="caption" weight="bold" center style={{ color: colors.onPrimary }}>
        ⚠ 서버 주소가 설정되지 않았습니다 — 관리자에게 문의하세요 (로그인·피드 등 소셜 기능 비활성)
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.danger,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
