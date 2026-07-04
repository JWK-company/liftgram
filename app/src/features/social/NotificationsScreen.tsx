// @plm SRS-020  알림 센터 — 팔로우·좋아요·댓글 활동. 열면 읽음 처리. (SAD-011)
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, ListState, Screen } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type NotificationItem } from '../../sync/serverApi';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function NotificationsScreen({ navigation }: RootStackScreenProps<'Notifications'>) {
  const { t } = useT();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await serverApi.notifications());
      serverApi.markNotificationsRead().catch(() => {}); // 열면 읽음 처리(벨 배지 해제)
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

  const open = useCallback(
    (n: NotificationItem) => {
      if (n.type === 'follow') navigation.navigate('UserProfile', { userId: n.actor.id });
      else if (n.postId) navigation.navigate('Comments', { postId: n.postId });
    },
    [navigation],
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotifRow notif={item} onPress={() => open(item)} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="notifications-outline"
            emptyTitle="notif.empty"
            emptyMessage="notif.emptyMessage"
          />
        }
      />
    </Screen>
  );
}

function NotifRow({ notif, onPress }: { notif: NotificationItem; onPress: () => void }) {
  const { t } = useT();
  const name = notif.actor.displayName || t('discover.unnamed');
  const KEYS = {
    follow: 'notif.follow',
    like: 'notif.like',
    comment: 'notif.comment',
    reply: 'notif.reply',
    comment_like: 'notif.commentLike',
  } as const;
  const key = KEYS[notif.type as keyof typeof KEYS] ?? 'notif.generic';
  const when = new Date(notif.createdAt).toLocaleDateString('ko-KR');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.avatar}>
        <AppText variant="body" weight="bold" style={{ color: colors.onPrimary }}>
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="body">{t(key, { name })}</AppText>
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
          {when}
        </AppText>
      </View>
      {!notif.read ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginHorizontal: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
