import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './primitives';
import { colors, fontSize, radius, spacing } from '../theme';

// ── TextField ──────────────────────────────────────────────────────
interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({ label, hint, containerStyle, style, ...rest }: TextFieldProps) {
  return (
    <View style={[{ marginBottom: spacing.md }, containerStyle]}>
      {label ? (
        <AppText variant="label" color="textMuted" style={{ marginBottom: spacing.xs }}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...rest}
        style={[styles.input, style]}
      />
      {hint ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

// ── NumberStepper ──────────────────────────────────────────────────
interface NumberStepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}

export function NumberStepper({ value, onChange, step = 1, min = 0, max = Infinity, suffix }: NumberStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(clamp(value - step))} style={styles.stepBtn} hitSlop={8}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <AppText variant="heading" center style={{ minWidth: 56 }}>
        {Number.isInteger(value) ? value : value.toFixed(1)}
        {suffix ?? ''}
      </AppText>
      <Pressable onPress={() => onChange(clamp(value + step))} style={styles.stepBtn} hitSlop={8}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
