// 경량 View 기반 차트 (Phase 0 — react-native-svg 등 네이티브 의존 회피).
// 추후 svg 기반 정밀 차트로 교체 가능. @plm SRS-005
import React from 'react';
import { View } from 'react-native';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';

export interface ChartDatum {
  label: string;
  value: number;
  highlight?: boolean;
}

// 세로 막대 차트(주간 볼륨·1RM 추세 등).
export function SimpleBarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: ChartDatum[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (!data.length) {
    return (
      <AppText variant="caption" color="textFaint" center>
        데이터가 아직 없어요
      </AppText>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const barArea = height - 28;
  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <AppText variant="label" color="textFaint" numberOfLines={1}>
              {formatValue ? formatValue(d.value) : String(Math.round(d.value))}
            </AppText>
            <View
              style={{
                width: '64%',
                marginTop: spacing.xs,
                height: Math.max(3, (d.value / max) * barArea),
                backgroundColor: d.highlight ? colors.pr : colors.primary,
                borderRadius: radius.sm,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
        {data.map((d, i) => (
          <AppText key={i} variant="label" color="textFaint" center style={{ flex: 1 }} numberOfLines={1}>
            {d.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

// 가로 분포 막대(근육군 분포 등).
export function DistributionBars({
  data,
  formatValue,
}: {
  data: ChartDatum[];
  formatValue?: (v: number) => string;
}) {
  if (!data.length) {
    return (
      <AppText variant="caption" color="textFaint" center>
        데이터가 아직 없어요
      </AppText>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((d, i) => (
        <View key={i}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <AppText variant="caption" color="textMuted">
              {d.label}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {formatValue ? formatValue(d.value) : String(Math.round(d.value))}
            </AppText>
          </View>
          <View style={{ height: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }}>
            <View
              style={{
                width: `${(d.value / max) * 100}%`,
                height: 8,
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
