// @plm SRS-007  저장한 게시물(북마크) 목록 (SAD-011).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ListState, Screen } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { DiscoveryPostCard } from './DiscoveryPostCard';

export default function BookmarksScreen({ navigation }: RootStackScreenProps<'Bookmarks'>) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const bmPending = useRef<Set<string>>(new Set());

  useEffect(() => {
    serverApi
      .me()
      .then((m) => setMeId(m.id))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPosts(await serverApi.bookmarks());
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

  // 저장 목록에서 북마크 탭 = 해제 → 낙관적으로 목록서 제거.
  const onBookmark = useCallback(
    async (post: FeedPost) => {
      if (bmPending.current.has(post.id)) return;
      bmPending.current.add(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      try {
        await serverApi.unbookmarkPost(post.id);
      } catch {
        load(); // 실패 → 목록 재조회로 복원
      } finally {
        bmPending.current.delete(post.id);
      }
    },
    [load],
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
            onTag={(tag) => navigation.navigate('Hashtag', { tag })}
            onUpdated={(u) => setPosts((prev) => prev.map((p) => (p.id === u.id ? u : p)))}
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            onBookmark={onBookmark}
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
            emptyIcon="bookmark-outline"
            emptyTitle="bookmark.empty"
            emptyMessage="bookmark.emptyMessage"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
});
