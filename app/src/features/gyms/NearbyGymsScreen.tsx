// @plm SRS-035  위치 기반 주변 헬스장 발견·추천 (소비자 MVP — B2B 전단계)
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Button } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';
import { useT, type TransKey } from '../../i18n';
import { formatDistance, type RankedGym } from '../../domain';
import { getCurrentLocation, searchNearbyGyms, gymMapsUrl, GymError, type GymErrorCode } from '../../services/gymSearch';

const RADIUS_STEPS = [2000, 5000, 10000]; // 반경 확장 단계(m)

const ERR_KEY: Record<GymErrorCode, TransKey> = {
  'geo-unsupported': 'gyms.errUnsupported',
  'geo-denied': 'gyms.errDenied',
  'geo-unavailable': 'gyms.errUnavailable',
  'geo-timeout': 'gyms.errTimeout',
  'search-failed': 'gyms.errSearch',
};

export default function NearbyGymsScreen(_props: RootStackScreenProps<'NearbyGyms'>) {
  const { t } = useT();
  const [phase, setPhase] = useState<'locating' | 'searching' | 'done' | 'error'>('locating');
  const [errCode, setErrCode] = useState<GymErrorCode | null>(null);
  const [gyms, setGyms] = useState<RankedGym[]>([]);
  const [radiusIdx, setRadiusIdx] = useState(0);

  const run = useCallback(async (radiusM: number) => {
    setPhase('locating');
    setErrCode(null);
    try {
      const loc = await getCurrentLocation();
      setPhase('searching');
      const found = await searchNearbyGyms(loc, radiusM);
      setGyms(found);
      setPhase('done');
    } catch (e) {
      setErrCode(e instanceof GymError ? e.code : 'search-failed');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    run(RADIUS_STEPS[0]);
  }, [run]);

  const expandRadius = useCallback(() => {
    const next = Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1);
    setRadiusIdx(next);
    run(RADIUS_STEPS[next]);
  }, [radiusIdx, run]);

  const openMaps = (g: RankedGym) => {
    Linking.openURL(gymMapsUrl(g)).catch(() => {});
  };

  const km = RADIUS_STEPS[radiusIdx] / 1000;
  const canExpand = radiusIdx < RADIUS_STEPS.length - 1;
  const nextKm = RADIUS_STEPS[Math.min(radiusIdx + 1, RADIUS_STEPS.length - 1)] / 1000;

  if (phase === 'locating' || phase === 'searching') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
            {t(phase === 'locating' ? 'gyms.locating' : 'gyms.searching')}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (phase === 'error') {
    return (
      <Screen>
        <View style={styles.center}>
          <Ionicons name="location-outline" size={40} color={colors.textMuted} />
          <AppText variant="heading" style={{ marginTop: spacing.md }}>
            {t('gyms.errTitle')}
          </AppText>
          <AppText variant="body" color="textMuted" center style={{ marginTop: spacing.xs }}>
            {t(errCode ? ERR_KEY[errCode] : 'gyms.errSearch')}
          </AppText>
          <Button
            title={t('gyms.retry')}
            icon="refresh"
            fullWidth={false}
            style={{ marginTop: spacing.lg }}
            onPress={() => run(RADIUS_STEPS[radiusIdx])}
          />
        </View>
      </Screen>
    );
  }

  if (!gyms.length) {
    return (
      <Screen>
        <View style={styles.center}>
          <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
          <AppText variant="heading" style={{ marginTop: spacing.md }}>
            {t('gyms.emptyTitle')}
          </AppText>
          <AppText variant="body" color="textMuted" center style={{ marginTop: spacing.xs }}>
            {t('gyms.emptyMessage', { radius: km })}
          </AppText>
          {canExpand ? (
            <Button
              title={t('gyms.expandRadius', { radius: nextKm })}
              icon="resize"
              fullWidth={false}
              style={{ marginTop: spacing.lg }}
              onPress={expandRadius}
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  const [top, ...rest] = gyms;
  return (
    <Screen padded={false}>
      <FlatList
        data={rest}
        keyExtractor={(g) => g.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
              {t('gyms.foundCount', { count: gyms.length, radius: km })}
            </AppText>
            <GymCard gym={top} recommended onOpen={() => openMaps(top)} />
            {rest.length ? (
              <AppText variant="label" color="textMuted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                {t('gyms.nearbyList')}
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <GymCard gym={item} onOpen={() => openMaps(item)} />}
        ListFooterComponent={
          canExpand ? (
            <Button
              title={t('gyms.expandRadius', { radius: nextKm })}
              variant="secondary"
              icon="resize"
              style={{ marginTop: spacing.md }}
              onPress={expandRadius}
            />
          ) : null
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function GymCard({ gym, recommended, onOpen }: { gym: RankedGym; recommended?: boolean; onOpen: () => void }) {
  const { t } = useT();
  return (
    <Card style={[styles.gymCard, recommended ? styles.recCard : null]}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        {recommended ? (
          <View style={styles.recBadge}>
            <Ionicons name="star" size={11} color={colors.primary} />
            <AppText variant="label" color="primary">
              {t('gyms.recommended')}
            </AppText>
          </View>
        ) : null}
        <AppText variant="heading" numberOfLines={1}>
          {gym.name ?? t('gyms.unnamed')}
        </AppText>
        <View style={styles.metaRow}>
          <Ionicons name="location" size={12} color={colors.textMuted} />
          <AppText variant="caption" color="textMuted">
            {formatDistance(gym.distanceM)}
          </AppText>
          {gym.address ? (
            <AppText variant="caption" color="textFaint" numberOfLines={1} style={{ flex: 1 }}>
              {` · ${gym.address}`}
            </AppText>
          ) : null}
        </View>
      </View>
      <Button title={t('gyms.directions')} size="sm" variant="secondary" icon="navigate" fullWidth={false} onPress={onOpen} />
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  list: { padding: spacing.lg, flexGrow: 1 },
  gymCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  recCard: { borderColor: colors.primary, borderWidth: 1, backgroundColor: colors.primaryMuted },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
});
