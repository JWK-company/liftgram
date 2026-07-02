// @plm SRS-018  발견 — 사람 검색·팔로우/언팔로우 (SAD-011).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, AppText, Button, TextField, EmptyState, Avatar } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DiscoverUser } from '../../sync/serverApi';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';

export default function DiscoverScreen({ navigation }: RootStackScreenProps<'Discover'>) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);
  const pendingRef = useRef<Set<string>>(new Set());
  const dmPendingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (query: string) => {
    const id = reqIdRef.current + 1;
    reqIdRef.current = id;
    setLoading(true);
    try {
      const result = await serverApi.discover(query.trim() || undefined);
      if (id === reqIdRef.current) setUsers(result); // 최신 요청만 반영(경합 방지)
    } catch {
      if (id === reqIdRef.current) setUsers([]);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const toggle = useCallback(async (u: DiscoverUser) => {
    if (pendingRef.current.has(u.id)) return; // 같은 유저 중복 탭 방지
    pendingRef.current.add(u.id);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isFollowing: !x.isFollowing } : x)));
    try {
      if (u.isFollowing) await serverApi.unfollowUser(u.id);
      else await serverApi.followUser(u.id);
    } catch {
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isFollowing: u.isFollowing } : x)));
    } finally {
      pendingRef.current.delete(u.id);
    }
  }, []);

  const startDm = useCallback(
    async (u: DiscoverUser) => {
      if (dmPendingRef.current.has(u.id)) return; // 중복 탭 방지(서버 directKey와 이중 방어)
      dmPendingRef.current.add(u.id);
      try {
        const conv = await serverApi.createConversation(u.id);
        navigation.navigate('Conversation', {
          conversationId: conv.id,
          title: u.displayName || t('discover.unnamed'),
        });
      } catch {
        // ignore
      } finally {
        dmPendingRef.current.delete(u.id);
      }
    },
    [navigation, t],
  );

  return (
    <Screen padded={false}>
      <View style={styles.search}>
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={t('discover.searchPlaceholder')}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => load(q)}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            onToggle={() => toggle(item)}
            onMessage={() => startDm(item)}
            onOpenProfile={() => navigation.navigate('UserProfile', { userId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(q)} tintColor={colors.primary} />}
        ListEmptyComponent={!loading ? <EmptyState title={t('discover.empty')} /> : null}
      />
    </Screen>
  );
}

function UserRow({
  user,
  onToggle,
  onMessage,
  onOpenProfile,
}: {
  user: DiscoverUser;
  onToggle: () => void;
  onMessage: () => void;
  onOpenProfile: () => void;
}) {
  const { t } = useT();
  const name = user.displayName || t('discover.unnamed');
  return (
    <Card style={styles.userCard}>
      <Pressable style={styles.userMain} onPress={onOpenProfile}>
        <Avatar name={user.displayName} url={user.avatarUrl} size={36} />
        <AppText variant="body" weight="medium" numberOfLines={1} style={styles.name}>
          {name}
        </AppText>
      </Pressable>
      <Pressable onPress={onMessage} hitSlop={8} style={{ marginRight: spacing.sm }}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
      </Pressable>
      <Button
        title={user.isFollowing ? t('discover.following') : t('discover.follow')}
        size="sm"
        variant={user.isFollowing ? 'secondary' : 'primary'}
        fullWidth={false}
        onPress={onToggle}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  search: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  userCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  userMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, marginHorizontal: spacing.md },
});
