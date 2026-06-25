import React from 'react';
import { StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

// ── AppText ────────────────────────────────────────────────────────
type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';

const VARIANT: Record<TextVariant, { size: number; weight: '400' | '600' | '700' }> = {
  display: { size: fontSize.xxl, weight: fontWeight.bold },
  title: { size: fontSize.xl, weight: fontWeight.bold },
  heading: { size: fontSize.lg, weight: fontWeight.bold },
  body: { size: fontSize.md, weight: fontWeight.regular },
  caption: { size: fontSize.sm, weight: fontWeight.regular },
  label: { size: fontSize.xs, weight: fontWeight.medium },
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: keyof typeof colors;
  weight?: keyof typeof fontWeight;
  center?: boolean;
}

export function AppText({ variant = 'body', color = 'text', weight, center, style, ...rest }: AppTextProps) {
  const v = VARIANT[variant];
  return (
    <Text
      {...rest}
      style={[
        {
          color: colors[color],
          fontSize: v.size,
          fontWeight: weight ? fontWeight[weight] : v.weight,
        },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

// ── Card ───────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  alt,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  alt?: boolean;
}) {
  return <View style={[styles.card, alt && { backgroundColor: colors.surfaceAlt }, style]}>{children}</View>;
}

// ── Tag (작은 칩) ──────────────────────────────────────────────────
export function Tag({ label, tone = 'default' }: { label: string; tone?: 'default' | 'primary' | 'pr' | 'muted' }) {
  const bg =
    tone === 'primary' ? colors.primaryMuted : tone === 'pr' ? '#4A3F12' : tone === 'muted' ? colors.surfaceAlt : colors.surfaceAlt;
  const fg = tone === 'pr' ? colors.pr : tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: fontSize.xs, fontWeight: fontWeight.medium }}>{label}</Text>
    </View>
  );
}

// ── Divider ────────────────────────────────────────────────────────
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

// ── SectionHeader ──────────────────────────────────────────────────
export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{title}</AppText>
      {right}
    </View>
  );
}

// ── StatTile ───────────────────────────────────────────────────────
export function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card style={styles.statTile}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <AppText variant="title" style={{ marginTop: spacing.xs }}>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────
export function EmptyState({ title, message, action }: { title: string; message?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <AppText variant="heading" center>
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.sm }}>
          {message}
        </AppText>
      ) : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statTile: { flex: 1, padding: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
