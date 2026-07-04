// @plm SRS-020  모더레이션 큐 — 신고·자동보류 콘텐츠 검토·제거/승인 (SAD-012 · ADR-017).
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Button, Card, ListState, Screen, Tag } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type ModerationQueueItem } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT, type TransKey } from '../../i18n';

function reasonLabel(t: (k: TransKey) => string, r: string): string {
  switch (r) {
    case 'spam':
      return t('report.reason.spam');
    case 'nudity':
      return t('report.reason.nudity');
    case 'harassment':
      return t('report.reason.harassment');
    case 'violence':
      return t('report.reason.violence');
    case 'self_harm':
      return t('report.reason.self_harm');
    case 'minor_safety':
      return t('report.reason.minor_safety');
    case 'misinformation':
      return t('report.reason.misinformation');
    case 'auto_scan':
      return t('moderation.autoFlagged');
    default:
      return r;
  }
}

function targetLabel(t: (k: TransKey) => string, kind: string): string {
  return kind === 'story'
    ? t('moderation.target.story')
    : kind === 'comment'
      ? t('moderation.target.comment')
      : t('moderation.target.post');
}

export default function ModerationQueueScreen(_props: RootStackScreenProps<'ModerationQueue'>) {
  const { t } = useT();
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<{ key: string; action: 'remove' | 'approve' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await serverApi.moderationQueue());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function act(item: ModerationQueueItem, action: 'remove' | 'approve') {
    const key = `${item.targetType}:${item.targetId}`;
    if (busy) return;
    setBusy({ key, action });
    try {
      await serverApi.resolveReport(item.targetType, item.targetId, action);
      setItems((prev) => prev.filter((i) => `${i.targetType}:${i.targetId}` !== key));
    } catch {
      Alert.alert(t('moderation.actionFailed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.targetType}:${i.targetId}`}
        renderItem={({ item }) => {
          const key = `${item.targetType}:${item.targetId}`;
          const media = item.preview?.mediaUrl;
          const text = item.preview?.caption || item.preview?.body || '';
          return (
            <Card style={styles.card}>
              <View style={styles.head}>
                <Tag label={targetLabel(t, item.preview?.kind ?? item.targetType)} tone="primary" />
                <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.author}>
                  {item.author?.displayName || t('discover.unnamed')}
                </AppText>
                {item.source === 'auto' ? <Tag label={t('moderation.autoFlagged')} tone="pr" /> : null}
              </View>
              {media ? (
                <Image source={{ uri: resolveMediaUrl(media) }} style={styles.image} resizeMode="cover" />
              ) : null}
              {text ? (
                <AppText variant="body" numberOfLines={3} style={{ marginTop: spacing.sm }}>
                  {text}
                </AppText>
              ) : null}
              <View style={styles.reasons}>
                {item.reasons.map((r) => (
                  <View key={r} style={styles.reasonChip}>
                    <AppText variant="label" color="textMuted">
                      {reasonLabel(t, r)}
                    </AppText>
                  </View>
                ))}
                {item.reportCount > 0 ? (
                  <AppText variant="label" color="textFaint" style={{ alignSelf: 'center' }}>
                    {t('moderation.reports', { count: item.reportCount })}
                  </AppText>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Button
                  title={t('moderation.approve')}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  loading={busy?.key === key && busy.action === 'approve'}
                  disabled={!!busy}
                  onPress={() => act(item, 'approve')}
                />
                <Button
                  title={t('moderation.remove')}
                  variant="danger"
                  size="sm"
                  fullWidth={false}
                  loading={busy?.key === key && busy.action === 'remove'}
                  disabled={!!busy}
                  onPress={() => act(item, 'remove')}
                />
              </View>
            </Card>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="shield-checkmark-outline"
            emptyTitle="moderation.empty"
            emptyMessage="moderation.emptyMessage"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flex: 1 },
  image: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reasonChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
