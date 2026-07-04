// @plm SRS-018  발견(Explore) + 통합 검색 — 트렌딩·추천·인기 / 검색(유저·태그·포스트) (SAD-011).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Card, AppText, Avatar, Button, EmptyState, ListState, SectionHeader, SkeletonList, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type DiscoverUser, type FeedPost, type SearchResult, type TrendingTag } from '../../sync/serverApi';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { DiscoveryPostCard } from './DiscoveryPostCard';

export default function ExploreScreen({ navigation }: RootStackScreenProps<'Explore'>) {
  const { t } = useT();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 발견 허브 전체 실패
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false); // 검색 in-flight(스켈레톤)
  const [searchError, setSearchError] = useState(false); // 검색 실패(에러+재시도)
  const followPending = useRef<Set<string>>(new Set());
  const searchReq = useRef(0);
  const qRef = useRef('');
  qRef.current = q;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [ex, tr, su] = await Promise.allSettled([
      serverApi.explore(),
      serverApi.trendingHashtags(),
      serverApi.suggestions(),
    ]);
    if (ex.status === 'fulfilled') setPosts(ex.value);
    if (tr.status === 'fulfilled') setTags(tr.value);
    if (su.status === 'fulfilled') setUsers(su.value);
    // 부분 실패는 allSettled로 관용(가능한 섹션만 렌더). 셋 다 실패해야 에러 표면화.
    setLoadError(ex.status === 'rejected' && tr.status === 'rejected' && su.status === 'rejected');
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fetchSearch = useCallback(async (query: string, id: number) => {
    try {
      const r = await serverApi.search(query);
      if (id === searchReq.current) {
        setResults(r);
        setSearchLoading(false);
      }
    } catch {
      if (id === searchReq.current) {
        setSearchError(true);
        setSearchLoading(false);
      }
    }
  }, []);

  // 검색(디바운스 300ms·경합 가드). 빈 쿼리는 발견 모드.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      searchReq.current++; // 진행 중 검색 무효화(클리어 시 stale 결과 방지)
      setResults(null);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    const id = ++searchReq.current;
    setResults(null); // 새 쿼리 → 이전 결과 잔상 즉시 제거
    setSearchError(false);
    setSearchLoading(true); // 스켈레톤 노출
    const timer = setTimeout(() => void fetchSearch(query, id), 300);
    return () => clearTimeout(timer);
  }, [q, fetchSearch]);

  const retrySearch = useCallback(() => {
    const query = qRef.current.trim();
    if (!query) return;
    const id = ++searchReq.current;
    setResults(null);
    setSearchError(false);
    setSearchLoading(true);
    void fetchSearch(query, id);
  }, [fetchSearch]);

  const searching = q.trim().length > 0;
  const openTag = (tag: string) => navigation.navigate('Hashtag', { tag });
  const openProfile = (userId: string) => navigation.navigate('UserProfile', { userId });

  const follow = useCallback((u: DiscoverUser, source: 'discovery' | 'search') => {
    if (followPending.current.has(u.id)) return;
    followPending.current.add(u.id);
    const setFollowing = (val: boolean) => {
      if (source === 'search') {
        setResults((r) => (r ? { ...r, users: r.users.map((x) => (x.id === u.id ? { ...x, isFollowing: val } : x)) } : r));
      } else {
        setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isFollowing: val } : x)));
      }
    };
    const startQ = qRef.current;
    setFollowing(true);
    void serverApi
      .followUser(u.id)
      // 검색 결과 롤백은 같은 쿼리일 때만 — 그 사이 재검색된 새 결과 오염 방지.
      .catch(() => {
        if (source === 'discovery' || qRef.current === startQ) setFollowing(false);
      })
      .finally(() => followPending.current.delete(u.id));
  }, []);

  const tagChips = (list: TrendingTag[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {list.map((tt) => (
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
  );

  const searchUserRow = (u: DiscoverUser) => (
    <Card key={u.id} style={styles.userRow}>
      <Pressable style={styles.userMain} onPress={() => openProfile(u.id)}>
        <Avatar name={u.displayName} url={u.avatarUrl} size={36} />
        <AppText variant="body" weight="medium" numberOfLines={1} style={styles.userName}>
          {u.displayName || t('discover.unnamed')}
        </AppText>
      </Pressable>
      <Button
        title={u.isFollowing ? t('discover.following') : t('discover.follow')}
        size="sm"
        variant={u.isFollowing ? 'secondary' : 'primary'}
        fullWidth={false}
        disabled={u.isFollowing}
        onPress={() => follow(u, 'search')}
      />
    </Card>
  );

  const discoveryHeader = (
    <View>
      {tags.length > 0 ? (
        <>
          <SectionHeader title={t('explore.trending')} />
          {tagChips(tags)}
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
                  <AppText variant="label" weight="medium" numberOfLines={1} style={styles.userCardName}>
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
                  onPress={() => follow(u, 'discovery')}
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

  const searchHeader = (
    <View>
      {results && results.users.length > 0 ? (
        <>
          <SectionHeader title={t('search.users')} />
          {results.users.map(searchUserRow)}
        </>
      ) : null}
      {results && results.tags.length > 0 ? (
        <>
          <SectionHeader title={t('search.tags')} />
          {tagChips(results.tags)}
        </>
      ) : null}
      {results && results.posts.length > 0 ? <SectionHeader title={t('search.posts')} /> : null}
    </View>
  );

  const data = searching ? (results?.posts ?? []) : posts;
  const noSearchResults =
    searching && results !== null && results.users.length === 0 && results.tags.length === 0 && results.posts.length === 0;

  return (
    <Screen padded={false}>
      <View style={styles.search}>
        <TextField
          value={q}
          onChangeText={setQ}
          placeholder={t('search.placeholder')}
          autoCapitalize="none"
          returnKeyType="search"
          containerStyle={{ marginBottom: 0 }}
        />
      </View>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={searching ? searchHeader : discoveryHeader}
        renderItem={({ item }) => (
          <DiscoveryPostCard
            post={item}
            onOpen={() => navigation.navigate('Comments', { postId: item.id })}
            onOpenProfile={() => openProfile(item.author.id)}
            onTag={openTag}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          searching ? undefined : (
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
          )
        }
        ListEmptyComponent={
          searching ? (
            searchLoading ? (
              <SkeletonList variant="post" />
            ) : searchError ? (
              <EmptyState
                tone="error"
                icon="cloud-offline-outline"
                title={t('common.loadError')}
                message={t('common.loadErrorMessage')}
                action={
                  <Button
                    title={t('common.retry')}
                    variant="secondary"
                    icon="refresh"
                    fullWidth={false}
                    onPress={retrySearch}
                  />
                }
              />
            ) : noSearchResults ? (
              <EmptyState icon="search-outline" title={t('search.empty')} />
            ) : null
          ) : (
            <ListState
              loading={loading}
              error={loadError}
              onRetry={load}
              skeletonVariant="post"
              emptyIcon="compass-outline"
              emptyTitle="explore.empty"
              emptyMessage="explore.emptyMessage"
            />
          )
        }
      />
    </Screen>
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
  userCardName: { marginTop: spacing.xs, maxWidth: 120, textAlign: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  userMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  userName: { flex: 1, marginHorizontal: spacing.md },
});
