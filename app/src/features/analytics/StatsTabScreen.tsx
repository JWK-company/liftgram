// @plm SRS-005  분석 대시보드 — 볼륨·추정1RM·PR·근육군 분포·추세
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  Screen,
  Card,
  AppText,
  Tag,
  Divider,
  SectionHeader,
  StatTile,
  EmptyState,
  SimpleBarChart,
  DistributionBars,
} from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { analyticsRepo } from '../../data';
import type { AnalyticsOverview, TrendPoint, RecentPR } from '../../data';
import { formatWeight, muscleLabel, WELLNESS, type MuscleGroup } from '../../domain';
import { colors, spacing } from '../../theme';

type Period = 'week' | 'month' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: '이번주' },
  { key: 'month', label: '이번달' },
  { key: 'all', label: '전체' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function sinceForPeriod(period: Period): number | undefined {
  const now = Date.now();
  if (period === 'week') return now - 7 * DAY_MS;
  if (period === 'month') return now - 30 * DAY_MS;
  return undefined;
}

export default function StatsTabScreen(_props: TabScreenProps<'StatsTab'>) {
  const { weightUnit } = useUser();
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [dist, setDist] = useState<{ muscle: MuscleGroup; volumeKg: number }[]>([]);
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sinceMs = sinceForPeriod(period);
    setLoading(true);
    (async () => {
      try {
        const [o, t, d, prs] = await Promise.all([
          analyticsRepo.getOverview(sinceMs),
          analyticsRepo.getVolumeTrend(sinceMs),
          analyticsRepo.getMuscleDistribution(sinceMs),
          analyticsRepo.getRecentPRs(10),
        ]);
        if (cancelled) return;
        setOverview(o);
        setTrend(t);
        setDist(d);
        setRecentPRs(prs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const hasData = !!overview && overview.sessionCount > 0;

  return (
    <Screen scroll>
      <AppText variant="title" style={{ marginBottom: spacing.lg }}>
        분석
      </AppText>

      <PeriodSelector period={period} onChange={setPeriod} />

      {loading && !overview ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasData ? (
        <EmptyState
          title="아직 기록이 없어요"
          message="운동 세션을 완료하면 볼륨·추정 1RM·근육군 분포가 여기에 표시됩니다."
        />
      ) : (
        <>
          {/* 개요 */}
          <View style={styles.tilesRow}>
            <StatTile label="총 볼륨" value={formatWeight(overview!.totalVolumeKg, weightUnit)} />
            <StatTile label="세션 수" value={String(overview!.sessionCount)} />
            <StatTile label="워킹 세트" value={String(overview!.workingSets)} />
          </View>

          {/* 추정 1RM Top */}
          <Card style={styles.section}>
            <SectionHeader title={WELLNESS.oneRepMaxLabel} />
            {overview!.topOneRM.length === 0 ? (
              <AppText variant="caption" color="textFaint">
                워킹 세트 기록이 쌓이면 표시됩니다.
              </AppText>
            ) : (
              overview!.topOneRM.map((row, i) => (
                <View key={row.exerciseId}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.listRow}>
                    <AppText variant="body" style={styles.flexName} numberOfLines={1}>
                      {row.exerciseName}
                    </AppText>
                    <AppText variant="body" weight="bold">
                      {formatWeight(row.estimated1RM, weightUnit)}
                    </AppText>
                  </View>
                </View>
              ))
            )}
            <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
              {WELLNESS.oneRepMaxCaption}
            </AppText>
          </Card>

          {/* 주간 볼륨 추세 */}
          <Card style={styles.section}>
            <SectionHeader title="주간 볼륨 추세" />
            <SimpleBarChart
              data={trend.map((t) => ({ label: t.label, value: t.value }))}
              formatValue={(v) => Math.round(v) + ''}
            />
          </Card>

          {/* 근육군 분포 */}
          <Card style={styles.section}>
            <SectionHeader title="근육군 분포" />
            <DistributionBars
              data={dist.map((d) => ({ label: muscleLabel(d.muscle), value: d.volumeKg }))}
              formatValue={(v) => formatWeight(v, weightUnit)}
            />
          </Card>

          {/* 최근 PR */}
          <Card style={styles.section}>
            <SectionHeader title="최근 PR" />
            {recentPRs.length === 0 ? (
              <AppText variant="caption" color="textFaint">
                아직 갱신된 추정 1RM 기록이 없어요.
              </AppText>
            ) : (
              recentPRs.map((pr, i) => (
                <View key={`${pr.exerciseId}-${pr.completedAt}`}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.prRow}>
                    <View style={styles.flexName}>
                      <AppText variant="body" numberOfLines={1}>
                        {pr.exerciseName}
                      </AppText>
                      <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                        {new Date(pr.completedAt).toLocaleDateString('ko-KR')}
                      </AppText>
                    </View>
                    <View style={styles.prRight}>
                      <AppText variant="body" weight="bold">
                        {formatWeight(pr.estimated1RM, weightUnit)}
                      </AppText>
                      <Tag label="추정치" tone="pr" />
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      <AppText variant="caption" color="textFaint" center style={styles.disclaimer}>
        {WELLNESS.noMedicalClaimNotice}
      </AppText>
    </Screen>
  );
}

function PeriodSelector({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <View style={styles.chips}>
      {PERIODS.map((p) => {
        const active = p.key === period;
        return (
          <AppText
            key={p.key}
            variant="caption"
            weight={active ? 'bold' : 'regular'}
            color={active ? 'onPrimary' : 'textMuted'}
            onPress={() => onChange(p.key)}
            style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
          >
            {p.label}
          </AppText>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipIdle: { backgroundColor: colors.surfaceAlt },
  tilesRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  flexName: { flex: 1, marginRight: spacing.md },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  prRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disclaimer: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
