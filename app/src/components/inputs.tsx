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
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  // 숫자 직접 수정 — 값을 탭하면 인라인 입력으로 전환(±버튼과 병행).
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  function beginEdit() {
    setDraft(fmt(value));
    setEditing(true);
  }
  function commit() {
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) onChange(clamp(n));
    setEditing(false);
  }
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(clamp(value - step))} style={styles.stepBtn} hitSlop={8}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
          style={styles.stepperInput}
        />
      ) : (
        <Pressable onPress={beginEdit} hitSlop={6} style={styles.stepperValue}>
          <AppText variant="heading" center>
            {fmt(value)}
            {suffix ?? ''}
          </AppText>
        </Pressable>
      )}
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
  // 값을 탭하면 직접 입력 가능 — 점선 밑줄로 편집 가능 힌트.
  stepperValue: {
    minWidth: 56,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.textFaint,
    borderStyle: 'dashed',
  },
  stepperInput: {
    minWidth: 56,
    height: 40,
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xs,
  },
});
