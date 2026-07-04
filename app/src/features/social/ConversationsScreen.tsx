// @plm SRS-017  DM 대화 목록 (SAD-011).
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Card, AppText, Button, ListState } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DmConversation } from '../../sync/serverApi';
import { onDmMessage } from '../../sync/realtime';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function ConversationsScreen({ navigation }: RootStackScreenProps<'Conversations'>) {
  const { t } = useT();
  const [convs, setConvs] = useState<DmConversation[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const meIdRef = useRef<string | null>(null);
  const convIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [list, me] = await Promise.all([serverApi.conversations(), serverApi.me()]);
      setConvs(list);
      setMeId(me.id);
      meIdRef.current = me.id;
      convIdsRef.current = new Set(list.map((c) => c.id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // 실시간 목록 갱신 — 새 메시지로 lastMessage·unread·정렬 즉시 반영.
      const unsub = onDmMessage((m) => {
        if (meIdRef.current === null) return; // 신원 로드 전 — 초기 load()가 권위 반영
        if (!convIdsRef.current.has(m.conversationId)) {
          load(); // 목록에 없는 대화(신규) → 재조회
          return;
        }
        setConvs((prev) => {
          const idx = prev.findIndex((c) => c.id === m.conversationId);
          if (idx === -1) return prev;
          const c = prev[idx];
          const mine = m.sender.id === meIdRef.current;
          const updated: DmConversation = {
            ...c,
            lastMessage: m,
            unreadCount: mine ? c.unreadCount : c.unreadCount + 1,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
      });
      return unsub;
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('NewGroup')}
          hitSlop={8}
          style={{ paddingHorizontal: spacing.md }}
        >
          <Ionicons name="people-outline" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const titleOf = useCallback(
    (c: DmConversation): string => {
      if (c.title) return c.title;
      const others = c.participants.filter((p) => p.id !== meId);
      const names = (others.length ? others : c.participants).map((p) => p.displayName || t('discover.unnamed'));
      return names.join(', ');
    },
    [meId, t],
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={convs}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => {
          const title = titleOf(item);
          return (
            <Pressable
              onPress={() =>
                navigation.navigate('Conversation', { conversationId: item.id, title, isGroup: item.isGroup })
              }
            >
              <Card style={styles.row}>
                <View style={styles.avatar}>
                  <AppText variant="body" weight="bold" style={{ color: colors.onPrimary }}>
                    {title.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.body}>
                  <AppText variant="body" weight="medium" numberOfLines={1}>
                    {title}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                    {item.lastMessage?.body ?? (item.lastMessage ? t('dm.imageMessage') : '')}
                  </AppText>
                </View>
                {item.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <AppText variant="label" style={{ color: colors.onPrimary }}>
                      {item.unreadCount}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            </Pressable>
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
            emptyIcon="chatbubbles-outline"
            emptyTitle="dm.emptyTitle"
            emptyMessage="dm.emptyMessage"
            emptyAction={
              <Button
                title={t('dm.emptyCta')}
                icon="people-outline"
                variant="secondary"
                fullWidth={false}
                onPress={() => navigation.navigate('Discover')}
              />
            }
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginHorizontal: spacing.md },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
