// @plm SRS-018  해시태그별 공개 포스트 (SAD-011).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, ListState } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { DiscoveryPostCard } from './DiscoveryPostCard';

export default function HashtagScreen({ route, navigation }: RootStackScreenProps<'Hashtag'>) {
  const { tag } = route.params;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = useRef(true);
  const loadGen = useRef(0); // 새로고침 세대 — in-flight loadMore의 stale append 차단

  useLayoutEffect(() => {
    navigation.setOptions({ title: `#${tag}` });
  }, [navigation, tag]);

  useEffect(() => {
    serverApi
      .me()
      .then((m) => setMeId(m.id))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(false);
    try {
      const data = await serverApi.hashtagPosts(tag);
      if (gen !== loadGen.current) return; // 더 새로운 새로고침이 시작됨 → 폐기
      setPosts(data);
      hasMore.current = true;
    } catch {
      if (gen === loadGen.current) setError(true);
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [tag]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore.current || posts.length === 0) return;
    const gen = loadGen.current; // 시작 시점 세대 캡처
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      const older = await serverApi.hashtagPosts(tag, last.createdAt, last.id);
      if (gen !== loadGen.current) return; // 그사이 새로고침됨 → stale 페이지 폐기
      if (older.length === 0) hasMore.current = false;
      else
        setPosts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...older.filter((p) => !ids.has(p.id))];
        });
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, posts, tag]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <DiscoveryPostCard
            post={item}
            meId={meId}
            onOpen={() => navigation.navigate('Comments', { postId: item.id })}
            onOpenProfile={() => navigation.navigate('UserProfile', { userId: item.author.id })}
            onTag={(nextTag) => navigation.push('Hashtag', { tag: nextTag })}
            onUpdated={(u) => setPosts((prev) => prev.map((p) => (p.id === u.id ? u : p)))}
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="post"
            emptyIcon="pricetag-outline"
            emptyTitle="hashtag.empty"
            emptyMessage="hashtag.emptyMessage"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
});
