// @plm SRS-018  발견(Explore) — 트렌딩 해시태그 + 추천 유저 + 인기 공개 포스트 (SAD-011).
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Card, AppText, Avatar, Button, EmptyState, SectionHeader } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DiscoverUser, type FeedPost, type TrendingTag } from '../../sync/serverApi';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { DiscoveryPostCard } from './DiscoveryPostCard';

export default function ExploreScreen({ navigation }: RootStackScreenProps<'Explore'>) {
  const { t } = useT();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(false);
  const followPending = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    // 세 섹션은 독립 — 하나 실패해도 성공한 섹션은 렌더(allSettled).
    const [ex, tr, su] = await Promise.allSettled([
      serverApi.explore(),
      serverApi.trendingHashtags(),
      serverApi.suggestions(),
    ]);
    if (ex.status === 'fulfilled') setPosts(ex.value);
    if (tr.status === 'fulfilled') setTags(tr.value);
    if (su.status === 'fulfilled') setUsers(su.value);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openTag = (tag: string) => navigation.navigate('Hashtag', { tag });
  const openProfile = (userId: string) => navigation.navigate('UserProfile', { userId });

  const follow = useCallback(async (u: DiscoverUser) => {
    if (followPending.current.has(u.id)) return;
    followPending.current.add(u.id);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isFollowing: true } : x)));
    try {
      await serverApi.followUser(u.id);
    } catch {
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isFollowing: false } : x)));
    } finally {
      followPending.current.delete(u.id);
    }
  }, []);

  const header = (
    <View>
      {tags.length > 0 ? (
        <>
          <SectionHeader title={t('explore.trending')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {tags.map((tt) => (
              <Pressable key={tt.tag} style={styles.chip} onPress={() => openTag(tt.tag)}>
                <AppText variant="label" color="primary">
                  #{tt.tag}
                </AppText>
                <AppText variant="label" color="textFaint" style={{ marginLeft: 4 }}>
                  {tt.count}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {users.length > 0 ? (
        <>
          <SectionHeader title={t('explore.suggested')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggested}>
            {users.map((u) => (
              <Card key={u.id} style={styles.userCard}>
                <Pressable onPress={() => openProfile(u.id)} style={{ alignItems: 'center' }}>
                  <Avatar name={u.displayName} url={u.avatarUrl} size={52} />
                  <AppText variant="label" weight="medium" numberOfLines={1} style={styles.userName}>
                    {u.displayName || t('discover.unnamed')}
                  </AppText>
                  <AppText variant="label" color="textFaint" numberOfLines={1}>
                    {t('explore.followers', { count: u.followerCount ?? 0 })}
                  </AppText>
                </Pressable>
                <Button
                  title={u.isFollowing ? t('discover.following') : t('discover.follow')}
                  size="sm"
                  variant={u.isFollowing ? 'secondary' : 'primary'}
                  onPress={() => follow(u)}
                  disabled={u.isFollowing}
                  style={{ marginTop: spacing.sm }}
                />
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHeader title={t('explore.popular')} />
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <DiscoveryPostCard
            post={item}
            onOpen={() => navigation.navigate('Comments', { postId: item.id })}
            onOpenProfile={() => openProfile(item.author.id)}
            onTag={openTag}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={!loading ? <EmptyState title={t('explore.empty')} /> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  chips: { paddingVertical: spacing.xs, gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  suggested: { paddingVertical: spacing.xs, gap: spacing.sm, paddingRight: spacing.md },
  userCard: { width: 140, alignItems: 'center', marginBottom: spacing.sm },
  userName: { marginTop: spacing.xs, maxWidth: 120, textAlign: 'center' },
});
