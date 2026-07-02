// @plm SRS-007  소셜 피드 탭 — 팔로우한 사람 + 내 게시물(SAD-011). 서버 REST(온라인).
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, Card, AppText, Tag, Button, TextField, EmptyState } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost } from '../../sync/serverApi';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';

export default function FeedTabScreen({ navigation }: TabScreenProps<'FeedTab'>) {
  const { t } = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logged = await serverApi.isLoggedIn();
      setAuthed(logged);
      if (logged) setPosts(await serverApi.feed());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Discover')} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="person-add-outline" size={22} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  async function submit() {
    const text = caption.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const post = await serverApi.createPost({ kind: 'text', caption: text });
      setPosts((prev) => [post, ...prev]);
      setCaption('');
    } catch (e) {
      setError(String(e));
    } finally {
      setPosting(false);
    }
  }

  if (authed === false) {
    return (
      <Screen>
        <EmptyState title={t('feed.loginRequiredTitle')} message={t('feed.loginRequiredMessage')} />
        <Button
          title={t('feed.goProfile')}
          icon="person-circle-outline"
          onPress={() => navigation.navigate('ProfileTab')}
          style={{ marginTop: spacing.lg }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.compose}>
        <TextField
          value={caption}
          onChangeText={setCaption}
          placeholder={t('feed.composePlaceholder')}
          multiline
          containerStyle={{ marginBottom: spacing.sm }}
        />
        <Button title={t('feed.post')} icon="send" loading={posting} disabled={!caption.trim()} onPress={submit} />
        {error ? (
          <AppText variant="caption" color="danger" style={{ marginTop: spacing.sm }}>
            {error}
          </AppText>
        ) : null}
      </View>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? <EmptyState title={t('feed.emptyTitle')} message={t('feed.emptyMessage')} /> : null
        }
      />
    </Screen>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const { t } = useT();
  const name = post.author.displayName || t('discover.unnamed');
  const when = new Date(post.createdAt).toLocaleDateString('ko-KR');
  return (
    <Card style={styles.card}>
      <View style={styles.postHead}>
        <View style={styles.avatar}>
          <AppText variant="body" weight="bold" style={{ color: colors.onPrimary }}>
            {name.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <AppText variant="body" weight="medium" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" color="textFaint">
            {when}
          </AppText>
        </View>
        {post.kind === 'workout' ? <Tag label={t('feed.workoutBadge')} tone="primary" /> : null}
      </View>
      {post.caption ? (
        <AppText variant="body" style={{ marginTop: spacing.sm }}>
          {post.caption}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: spacing.md },
  compose: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  card: { marginBottom: spacing.md },
  postHead: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
