// @plm SRS-018  해시태그별 공개 포스트 (SAD-011).
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, EmptyState } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost } from '../../sync/serverApi';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';
import { DiscoveryPostCard } from './DiscoveryPostCard';

export default function HashtagScreen({ route, navigation }: RootStackScreenProps<'Hashtag'>) {
  const { tag } = route.params;
  const { t } = useT();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: `#${tag}` });
  }, [navigation, tag]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPosts(await serverApi.hashtagPosts(tag));
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [tag]);

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
            onOpen={() => navigation.navigate('Comments', { postId: item.id })}
            onOpenProfile={() => navigation.navigate('UserProfile', { userId: item.author.id })}
            onTag={(nextTag) => navigation.push('Hashtag', { tag: nextTag })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={!loading ? <EmptyState title={t('hashtag.empty')} /> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
});
