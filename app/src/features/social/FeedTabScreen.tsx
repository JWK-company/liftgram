// @plm SRS-007 @plm SRS-019  소셜 피드 탭 — 스토리 트레이 + 피드(텍스트/이미지 게시) (SAD-011/012).
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Card, AppText, Tag, Button, TextField, EmptyState, Divider, Avatar } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost, type PickedImage, type StoryGroup } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { useUser } from '../../state/userContext';
import { formatWeight } from '../../domain';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';
import { StoryTray, StoryViewer } from './Stories';
import { ReportSheet } from './ReportSheet';
import { HashtagText } from './HashtagText';

async function pickImageAsset(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (!result.canceled && result.assets && result.assets[0]) {
    const a = result.assets[0];
    return { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType };
  }
  return null;
}

export default function FeedTabScreen({ navigation }: TabScreenProps<'FeedTab'>) {
  const { t } = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [viewing, setViewing] = useState<StoryGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [posting, setPosting] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const likePending = useRef<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = useRef(true);
  const loadGen = useRef(0); // 새로고침 세대 — in-flight loadMore의 stale append 차단

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    try {
      const logged = await serverApi.isLoggedIn();
      if (gen !== loadGen.current) return; // 더 새로운 새로고침이 시작됨 → 폐기
      setAuthed(logged);
      if (logged) {
        const [feed, stories, me] = await Promise.all([
          serverApi.feed(),
          serverApi.stories(),
          serverApi.me(),
        ]);
        if (gen !== loadGen.current) return; // 그사이 재새로고침 → 폐기
        setMeId(me.id);
        // 진행 중인 좋아요는 서버 반영 전이므로 낙관적 상태 보존(리로드 클로버 방지).
        setPosts((prev) => {
          if (!likePending.current.size) return feed;
          const byId = new Map(prev.map((p) => [p.id, p]));
          return feed.map((p) => {
            const opt = likePending.current.has(p.id) ? byId.get(p.id) : undefined;
            return opt ? { ...p, likedByMe: opt.likedByMe, likeCount: opt.likeCount } : p;
          });
        });
        setStoryGroups(stories);
        hasMore.current = true; // 새로고침 시 커서 리셋
        serverApi
          .notificationsUnread()
          .then((r) => setUnread(r.count))
          .catch(() => {});
      }
    } catch (e) {
      if (gen === loadGen.current) setError(String(e));
    } finally {
      if (gen === loadGen.current) setLoading(false);
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
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <AppText variant="label" style={styles.badgeText}>
                  {unread > 9 ? '9+' : unread}
                </AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Conversations')} hitSlop={8}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Explore')} hitSlop={8}>
            <Ionicons name="compass-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Discover')} hitSlop={8}>
            <Ionicons name="person-add-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, unread]);

  async function onAddStory() {
    if (storyBusy) return;
    const asset = await pickImageAsset();
    if (!asset) return;
    setStoryBusy(true);
    setError(null);
    try {
      const media = await serverApi.uploadImage(asset);
      await serverApi.createStory(media.url);
      setStoryGroups(await serverApi.stories());
    } catch (e) {
      setError(String(e));
    } finally {
      setStoryBusy(false);
    }
  }

  async function submit() {
    const text = caption.trim();
    if ((!text && !picked) || posting) return;
    setPosting(true);
    setError(null);
    try {
      let post: FeedPost;
      if (picked) {
        const media = await serverApi.uploadImage(picked);
        post = await serverApi.createPost({ kind: 'image', caption: text || undefined, data: { imageUrl: media.url } });
      } else {
        post = await serverApi.createPost({ kind: 'text', caption: text });
      }
      setPosts((prev) => [post, ...prev]);
      setCaption('');
      setPicked(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setPosting(false);
    }
  }

  const onLike = useCallback(async (post: FeedPost) => {
    if (likePending.current.has(post.id)) return; // 같은 포스트 연타 방지
    likePending.current.add(post.id);
    const liked = post.likedByMe;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, likedByMe: !liked, likeCount: p.likeCount + (liked ? -1 : 1) } : p,
      ),
    );
    try {
      const r = liked ? await serverApi.unlikePost(post.id) : await serverApi.likePost(post.id);
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likeCount: r.likeCount, likedByMe: !liked } : p)),
      );
    } catch {
      // 델타 롤백(현재 상태 기준 — 캡처된 절대값 복원 시 드리프트).
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, likedByMe: liked, likeCount: p.likeCount + (liked ? 1 : -1) } : p,
        ),
      );
    } finally {
      likePending.current.delete(post.id);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore.current || posts.length === 0) return;
    const gen = loadGen.current; // 시작 시점 세대 캡처
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      const older = await serverApi.feed(last.createdAt, last.id);
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
  }, [loadingMore, posts]);

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
      <StoryTray groups={storyGroups} onAdd={onAddStory} onOpen={setViewing} busy={storyBusy} />
      <Divider style={{ marginVertical: 0 }} />
      <View style={styles.compose}>
        <TextField
          value={caption}
          onChangeText={setCaption}
          placeholder={t('feed.composePlaceholder')}
          multiline
          containerStyle={{ marginBottom: spacing.sm }}
        />
        {picked ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: picked.uri }} style={styles.preview} resizeMode="cover" />
            <Pressable onPress={() => setPicked(null)} style={styles.previewRemove} hitSlop={8}>
              <Ionicons name="close-circle" size={26} color={colors.text} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composeActions}>
          <Button
            title={t('feed.addImage')}
            icon="image-outline"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={async () => {
              const a = await pickImageAsset();
              if (a) setPicked(a);
            }}
          />
          <View style={{ flex: 1 }} />
          <Button
            title={posting ? t('feed.uploading') : t('feed.post')}
            icon="send"
            size="sm"
            loading={posting}
            disabled={!caption.trim() && !picked}
            fullWidth={false}
            onPress={submit}
          />
        </View>
        {error ? (
          <AppText variant="caption" color="danger" style={{ marginTop: spacing.sm }}>
            {error}
          </AppText>
        ) : null}
      </View>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            meId={meId}
            onLike={onLike}
            onComment={(p) => navigation.navigate('Comments', { postId: p.id })}
            onOpenProfile={(uid) => navigation.navigate('UserProfile', { userId: uid })}
            onTag={(tag) => navigation.navigate('Hashtag', { tag })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? <EmptyState title={t('feed.emptyTitle')} message={t('feed.emptyMessage')} /> : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null
        }
      />
      <StoryViewer group={viewing} onClose={() => setViewing(null)} meId={meId} />
    </Screen>
  );
}

function formatWorkoutDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function WStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="label" color="textFaint">
        {label}
      </AppText>
      <AppText variant="body" weight="medium">
        {value}
      </AppText>
    </View>
  );
}

function PostCard({
  post,
  meId,
  onLike,
  onComment,
  onOpenProfile,
  onTag,
}: {
  post: FeedPost;
  meId: string | null;
  onLike: (p: FeedPost) => void;
  onComment: (p: FeedPost) => void;
  onOpenProfile: (userId: string) => void;
  onTag: (tag: string) => void;
}) {
  const { t } = useT();
  const { weightUnit } = useUser();
  const [reporting, setReporting] = useState(false);
  const canReport = !!meId && post.author.id !== meId;
  async function submitReport(reason: string) {
    setReporting(false);
    try {
      await serverApi.report('post', post.id, reason);
      Alert.alert(t('report.submitted'));
    } catch {
      Alert.alert(t('report.failed'));
    }
  }
  const name = post.author.displayName || t('discover.unnamed');
  const when = new Date(post.createdAt).toLocaleDateString('ko-KR');
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
  const workout =
    post.kind === 'workout' && post.data && typeof post.data === 'object'
      ? (post.data as {
          name?: string | null;
          volumeKg?: number;
          durationSeconds?: number;
          prCount?: number;
          setCount?: number;
        })
      : undefined;
  return (
    <Card style={styles.card}>
      <Pressable style={styles.postHead} onPress={() => onOpenProfile(post.author.id)}>
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={36} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <AppText variant="body" weight="medium" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" color="textFaint">
            {when}
          </AppText>
        </View>
        {post.kind === 'workout' ? <Tag label={t('feed.workoutBadge')} tone="primary" /> : null}
        {canReport ? (
          <Pressable onPress={() => setReporting(true)} hitSlop={8} style={{ paddingLeft: spacing.sm }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Pressable>
      {workout ? (
        <View style={styles.workoutBox}>
          {workout.name ? (
            <AppText variant="heading" numberOfLines={1}>
              {workout.name}
            </AppText>
          ) : null}
          <View style={styles.workoutStats}>
            <WStat label={t('session.totalVolume')} value={formatWeight(workout.volumeKg ?? 0, weightUnit)} />
            <WStat label={t('session.duration')} value={formatWorkoutDuration(workout.durationSeconds ?? 0)} />
            <WStat label={t('session.setCount')} value={String(workout.setCount ?? 0)} />
          </View>
        </View>
      ) : null}
      {imageUrl ? <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.postImage} resizeMode="cover" /> : null}
      {post.caption ? (
        <HashtagText text={post.caption} onTag={onTag} style={{ marginTop: spacing.sm }} />
      ) : null}
      <View style={styles.actions}>
        <Pressable onPress={() => onLike(post)} hitSlop={8} style={styles.action}>
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={22}
            color={post.likedByMe ? colors.danger : colors.textMuted}
          />
          {post.likeCount > 0 ? (
            <AppText variant="caption" color="textMuted">
              {post.likeCount}
            </AppText>
          ) : null}
        </Pressable>
        <Pressable onPress={() => onComment(post)} hitSlop={8} style={styles.action}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
          {post.commentCount > 0 ? (
            <AppText variant="caption" color="textMuted">
              {post.commentCount}
            </AppText>
          ) : null}
        </Pressable>
      </View>
      <ReportSheet visible={reporting} onClose={() => setReporting(false)} onSubmit={submitReport} />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.lg, paddingRight: spacing.md },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.onPrimary, fontSize: 9 },
  compose: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  composeActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  previewWrap: { position: 'relative', marginBottom: spacing.sm },
  preview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  previewRemove: { position: 'absolute', top: spacing.xs, right: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.pill },
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
  postImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  actions: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  workoutBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  workoutStats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
});
