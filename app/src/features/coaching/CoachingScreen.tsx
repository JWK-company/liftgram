// @plm SRS-048  코칭 화면 — 내 코치/담당 회원(grant 수락·해지) · 트레이너 찾기 · 회원 리포트(사실 집계).
// 원칙(ADR-028·SAD-022): 리포트는 사실 집계만 표시(자동 제안·개입 없음 — 판단은 트레이너).
// 트레이너 role은 자격 보증이 아님을 면책 문구로 병기. 로그인 필요(서버 grant 기반).
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Avatar, Button, Card, EmptyState, Screen, SectionHeader, TextField } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { formatWeight, muscleLabel, type MuscleGroup, type WeightUnit } from '../../domain';
import { useUser } from '../../state/userContext';
import {
  serverApi,
  type CoachingGrantView,
  type CoachingMemberReport,
  type CoachingPeer,
} from '../../sync/serverApi';

export default function CoachingScreen() {
  const { t, lang } = useT();
  const { weightUnit } = useUser();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [grants, setGrants] = useState<CoachingGrantView[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoachingPeer[] | null>(null);
  const [report, setReport] = useState<{ peer: CoachingPeer; data: CoachingMemberReport } | null>(null);

  const load = useCallback(async () => {
    try {
      if (!(await serverApi.isLoggedIn())) {
        setLoggedIn(false);
        return;
      }
      setLoggedIn(true);
      setGrants(await serverApi.coachingGrants());
    } catch {
      setLoggedIn((v) => v ?? false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    try {
      setResults(await serverApi.coachingSearchTrainers(query));
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  async function openReport(g: CoachingGrantView) {
    try {
      const data = await serverApi.coachingMemberReport(g.peer.id);
      setReport({ peer: g.peer, data });
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  }

  if (loggedIn === false) {
    return (
      <Screen>
        <EmptyState title={t('coaching.loginRequiredTitle')} message={t('coaching.loginRequiredMessage')} />
      </Screen>
    );
  }

  const asMember = grants.filter((g) => g.roleOfMe === 'member' && g.status !== 'revoked');
  const asTrainer = grants.filter((g) => g.roleOfMe === 'trainer' && g.status !== 'revoked');
  const requestedIds = new Set(grants.filter((g) => g.status !== 'revoked').map((g) => g.peer.id));

  return (
    <Screen scroll>
      {/* 면책 — 트레이너 표시는 자격 보증이 아님(SRS-045·048 가드레일). */}
      <AppText variant="caption" color="textFaint" style={{ marginBottom: spacing.md }}>
        {t('experience.trainerDisclaimer')}
      </AppText>

      {/* 회원 리포트 뷰(트레이너) — 사실 집계만. */}
      {report ? (
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText variant="heading">{t('coaching.reportTitle', { name: report.peer.displayName ?? '?' })}</AppText>
            <Pressable onPress={() => setReport(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t('coaching.reportRange', { weeks: report.data.weeks })}
          </AppText>
          <View style={styles.statRow}>
            <Stat label={t('coaching.statSessions')} value={String(report.data.sessionsCount)} />
            <Stat label={t('coaching.statPerWeek')} value={String(report.data.sessionsPerWeek)} />
            <Stat label={t('coaching.statVolume')} value={formatWeight(report.data.totalVolumeKg, weightUnit)} />
          </View>
          {report.data.muscleVolume.length > 0 ? (
            <>
              <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
                {t('coaching.muscleVolumeTitle')}
              </AppText>
              {report.data.muscleVolume.slice(0, 6).map((m) => (
                <RowKV key={m.muscle} k={muscleLabelSafe(m.muscle, lang)} v={formatWeight(m.volumeKg, weightUnit)} />
              ))}
            </>
          ) : null}
          {report.data.recentSessions.length > 0 ? (
            <>
              <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
                {t('coaching.recentSessionsTitle')}
              </AppText>
              {report.data.recentSessions.map((s2, i) => (
                <RowKV
                  key={i}
                  k={`${new Date(s2.startedAt).toLocaleDateString()} ${s2.name ?? ''}`.trim()}
                  v={formatWeight(s2.totalVolumeKg, weightUnit)}
                />
              ))}
            </>
          ) : null}
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
            {t('coaching.reportFactOnly')}
          </AppText>
        </Card>
      ) : null}

      {/* 내 코치(회원 시점) */}
      <SectionHeader title={t('coaching.myCoaches')} />
      {asMember.length === 0 ? (
        <AppText variant="caption" color="textMuted" style={styles.emptyLine}>
          {t('coaching.myCoachesEmpty')}
        </AppText>
      ) : (
        asMember.map((g) => (
          <GrantRow key={g.id} grant={g} busy={busy} onAccept={() => act(() => serverApi.coachingAccept(g.id))} onRevoke={() => act(() => serverApi.coachingRevoke(g.id))} />
        ))
      )}

      {/* 담당 회원(트레이너 시점) */}
      <SectionHeader title={t('coaching.myMembers')} />
      {asTrainer.length === 0 ? (
        <AppText variant="caption" color="textMuted" style={styles.emptyLine}>
          {t('coaching.myMembersEmpty')}
        </AppText>
      ) : (
        asTrainer.map((g) => (
          <GrantRow
            key={g.id}
            grant={g}
            busy={busy}
            onAccept={() => act(() => serverApi.coachingAccept(g.id))}
            onRevoke={() => act(() => serverApi.coachingRevoke(g.id))}
            onReport={g.status === 'active' ? () => openReport(g) : undefined}
          />
        ))
      )}

      {/* 트레이너 찾기 — trainerIntent 사용자 검색 → 코칭 요청. */}
      <SectionHeader title={t('coaching.findTrainer')} />
      <View style={styles.searchRow}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('coaching.searchPlaceholder')} containerStyle={{ flex: 1 }} onSubmitEditing={search} />
        <Button title={t('coaching.searchButton')} size="sm" fullWidth={false} onPress={search} />
      </View>
      {results?.length === 0 ? (
        <AppText variant="caption" color="textMuted" style={styles.emptyLine}>
          {t('coaching.searchEmpty')}
        </AppText>
      ) : null}
      {(results ?? []).map((p) => (
        <Card key={p.id} style={styles.peerRow}>
          <Avatar name={p.displayName} size={36} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <AppText variant="body" weight="medium" numberOfLines={1}>
              {p.displayName ?? t('discover.unnamed')}
            </AppText>
            {p.experienceLevel ? (
              <AppText variant="caption" color="textMuted">
                {t(`experience.level.${p.experienceLevel}` as Parameters<typeof t>[0])}
              </AppText>
            ) : null}
          </View>
          <Button
            title={requestedIds.has(p.id) ? t('coaching.requested') : t('coaching.requestButton')}
            size="sm"
            fullWidth={false}
            disabled={busy || requestedIds.has(p.id)}
            onPress={() => act(() => serverApi.coachingRequest({ trainerId: p.id }))}
          />
        </Card>
      ))}
    </Screen>
  );
}

function muscleLabelSafe(muscle: string, lang: 'ko' | 'en'): string {
  try {
    return muscleLabel(muscle as MuscleGroup, lang);
  } catch {
    return muscle; // 서버 payload의 미지의 근육군 문자열은 원문 표시(무해)
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="heading" center>
        {value}
      </AppText>
      <AppText variant="label" color="textMuted" center>
        {label}
      </AppText>
    </View>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kvRow}>
      <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
        {k}
      </AppText>
      <AppText variant="caption" weight="medium">
        {v}
      </AppText>
    </View>
  );
}

// grant 1행 — 상태 배지 + 수락(반대편만)/해지 + (트레이너·active) 리포트.
function GrantRow({
  grant,
  busy,
  onAccept,
  onRevoke,
  onReport,
}: {
  grant: CoachingGrantView;
  busy: boolean;
  onAccept: () => void;
  onRevoke: () => void;
  onReport?: () => void;
}) {
  const { t } = useT();
  const canAccept = grant.status === 'pending' && grant.requestedBy !== grant.roleOfMe;
  return (
    <Card style={styles.peerRow}>
      <Avatar name={grant.peer.displayName} size={36} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <AppText variant="body" weight="medium" numberOfLines={1}>
          {grant.peer.displayName ?? '?'}
        </AppText>
        <AppText variant="caption" color={grant.status === 'active' ? 'primary' : 'textMuted'}>
          {t(`coaching.status.${grant.status}` as Parameters<typeof t>[0])}
        </AppText>
      </View>
      {onReport ? <Button title={t('coaching.reportButton')} size="sm" variant="secondary" fullWidth={false} onPress={onReport} /> : null}
      {canAccept ? <Button title={t('coaching.acceptButton')} size="sm" fullWidth={false} disabled={busy} onPress={onAccept} /> : null}
      <Button title={t('coaching.revokeButton')} size="sm" variant="ghost" fullWidth={false} disabled={busy} onPress={onRevoke} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.sm },
  kvRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  emptyLine: { marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  peerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs },
});
