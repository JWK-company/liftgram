// @plm SRS-008  아바타 — 업로드 이미지 있으면 이미지, 없으면 이니셜 원.
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './primitives';
import { colors, radius } from '../theme';
import { resolveMediaUrl } from '../config';

export function Avatar({
  name,
  url,
  size = 40,
  style,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]); // url 바뀌면 실패 상태 초기화(리스트 재활용 대비)
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (url && !failed) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(url) }}
        onError={() => setFailed(true)}
        style={[dim, styles.image, style] as StyleProp<ImageStyle>}
        resizeMode="cover"
      />
    );
  }
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return (
    <View style={[dim, styles.fallback, style]}>
      <AppText weight="bold" style={{ color: colors.onPrimary, fontSize: Math.round(size * 0.42) }}>
        {initial}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill },
  fallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
