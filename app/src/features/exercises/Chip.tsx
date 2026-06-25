// @plm SRS-001  운동 카탈로그 필터/선택용 토글 칩
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

// 단일 토글 칩. 필터(근육군·기구)와 폼의 다중/단일 선택에 공용으로 사용.
export function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <AppText
        variant="caption"
        weight={active ? 'bold' : 'regular'}
        color={active ? 'onPrimary' : 'textMuted'}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipIdle: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
});
