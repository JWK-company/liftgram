// @plm SRS-008  공개 프로필 — 사용자 정보·카운트·팔로우/DM·게시물 (SAD-011).
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppText, Avatar, Button, Card, EmptyState, Screen } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost, type SocialProfile } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { ReportSheet } from './ReportSheet';

export default function UserProfileScreen({ route, navigation }: RootStackScreenProps<'UserProfile'>) {
  const { userId } = route.params;
  const { t } = useT();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dmPending = useRef(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = useRef(true);
  const loadGen = useRef(0); // 새로고침 세대 — in-flight loadMore의 stale append 차단

  async function submitReport(reason: string) {
    const id = reportId;
    setReportId(null);
    if (!id) return;
    try {
      await serverApi.report('post', id, reason);
      Alert.alert(t('report.submitted'));
    } catch {
      Alert.alert(t('report.failed'));
    }
  }

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(false);
    try {
      const [p, ps] = await Promise.all([serverApi.profile(userId), serverApi.userPosts(userId)]);
      if (gen !== loadGen.current) return; // 더 새로운 새로고침이 시작됨 → 폐기
      setProfile(p);
      setPosts(ps);
      hasMore.current = true;
    } catch {
      if (gen === loadGen.current) setError(true);
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore.current || posts.length === 0) return;
    const gen = loadGen.current; // 시작 시점 세대 캡처
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      const older = await serverApi.userPosts(userId, last.createdAt, last.id);
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
  }, [loadingMore, posts, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: profile?.displayName || t('profile.userTitle') });
  }, [navigation, profile, t]);

  async function toggleFollow() {
    if (!profile || busy) return;
    setBusy(true);
    const was = profile.isFollowing;
    setProfile({
      ...profile,
      isFollowing: !was,
      counts: { ...profile.counts, followers: profile.counts.followers + (was ? -1 : 1) },
    });
    try {
      if (was) await serverApi.unfollowUser(userId);
      else await serverApi.followUser(userId);
    } catch {
      load();
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    if (dmPending.current) return;
    dmPending.current = true;
    try {
      const conv = await serverApi.createConversation(userId);
      navigation.navigate('Conversation', {
        conversationId: conv.id,
        title: profile?.displayName || t('discover.unnamed'),
      });
    } catch {
      // ignore
    } finally {
      dmPending.current = false;
    }
  }

  async function toggleBlock() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      if (profile.isBlocked) await serverApi.unblockUser(userId);
      else await serverApi.blockUser(userId);
      await load(); // 차단 시 게시물 비워짐·isBlocked 갱신 반영
    } catch {
      Alert.alert(t('moderation.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const header = profile ? (
    <View style={styles.header}>
      <Avatar name={profile.displayName} url={profile.avatarUrl} size={84} />
      <AppText variant="title" center style={{ marginTop: spacing.md }}>
        {profile.displayName || t('discover.unnamed')}
      </AppText>
      <View style={styles.stats}>
        <Stat value={profile.counts.posts} label={t('profile.postsLabel')} />
        <Stat value={profile.counts.followers} label={t('profile.followers')} />
        <Stat value={profile.counts.following} label={t('profile.following')} />
      </View>
      {!profile.isSelf ? (
        profile.isBlocked ? (
          <View style={styles.actions}>
            <Button
              title={t('profile.unblock')}
              variant="secondary"
              loading={busy}
              fullWidth={false}
              onPress={toggleBlock}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <Button
                title={profile.isFollowing ? t('discover.following') : t('discover.follow')}
                variant={profile.isFollowing ? 'secondary' : 'primary'}
                loading={busy}
                fullWidth={false}
                onPress={toggleFollow}
                style={{ flex: 1 }}
              />
              <Button
                title={t('profile.message')}
                icon="chatbubble-ellipses-outline"
                variant="secondary"
                fullWidth={false}
                onPress={message}
                style={{ flex: 1 }}
              />
            </View>
            <Pressable onPress={toggleBlock} hitSlop={8} style={{ marginTop: spacing.md }}>
              <AppText variant="caption" color="danger">
                {t('profile.block')}
              </AppText>
            </Pressable>
          </>
        )
      ) : null}
    </View>
  ) : null;

  if (!profile && !loading && error) {
    return (
      <Screen>
        <EmptyState title={t('profile.loadError')} />
        <Button title={t('profile.retry')} onPress={load} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ProfilePost
            post={item}
            onPress={() => navigation.navigate('Comments', { postId: item.id })}
            onReport={profile && !profile.isSelf ? () => setReportId(item.id) : undefined}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={!loading && profile ? <EmptyState title={t('profile.noPosts')} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null
        }
      />
      <ReportSheet visible={!!reportId} onClose={() => setReportId(null)} onSubmit={submitReport} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </View>
  );
}

function ProfilePost({ post, onPress, onReport }: { post: FeedPost; onPress: () => void; onReport?: () => void }) {
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.post}>
        {imageUrl ? (
          <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.postImage} resizeMode="cover" />
        ) : null}
        {post.caption ? (
          <AppText variant="body" numberOfLines={imageUrl ? 2 : 4}>
            {post.caption}
          </AppText>
        ) : null}
        <View style={styles.postMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="heart-outline" size={16} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">
              {post.likeCount}
            </AppText>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">
              {post.commentCount}
            </AppText>
          </View>
          <View style={{ flex: 1 }} />
          {onReport ? (
            <Pressable onPress={onReport} hitSlop={8}>
              <Ionicons name="flag-outline" size={15} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.lg },
  stat: { alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' },
  post: { marginBottom: spacing.md },
  postImage: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceAlt },
  postMeta: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
