import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<Size, number> = { sm: 36, md: 46, lg: 54 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) {
  const palette = getPalette(variant);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border ? 1 : 0,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        },
        fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start', paddingHorizontal: spacing.xl },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} /> : null}
          <Text style={{ color: palette.fg, fontSize: size === 'sm' ? fontSize.sm : fontSize.md, fontWeight: fontWeight.bold }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function getPalette(variant: Variant): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: colors.onPrimary };
    case 'secondary':
      return { bg: colors.surfaceAlt, fg: colors.text, border: colors.border };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primary };
    case 'danger':
      return { bg: 'transparent', fg: colors.danger, border: colors.danger };
  }
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
