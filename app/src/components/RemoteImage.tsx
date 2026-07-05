import React, { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../config';
import { colors } from '../theme';

// 원격 미디어 이미지 — 로드 실패(서버 재배포로 파일 소실·네트워크 등) 시 빈 회색 박스 대신
// 폴백 아이콘 표시. uri는 상대(`/media/file/..`)·절대 모두 허용(resolveMediaUrl).
export function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'center';
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[style as StyleProp<ViewStyle>, styles.fallback]}>
        <Ionicons name="image-outline" size={28} color={colors.textFaint} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: resolveMediaUrl(uri) }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}

const styles = {
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt } as ViewStyle,
};
