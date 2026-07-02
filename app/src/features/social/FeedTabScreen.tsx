// @plm SRS-007 @plm SRS-019  소셜 피드 탭 — 스토리 트레이 + 피드(텍스트/이미지 게시) (SAD-011/012).
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Card, AppText, Tag, Button, TextField, EmptyState, Divider } from '../../components';
import type { TabScreenProps } from '../../navigation/types';
import { serverApi, type FeedPost, type PickedImage, type StoryGroup } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, spacing, radius } from '../../theme';
import { useT } from '../../i18n';
import { StoryTray, StoryViewer } from './Stories';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logged = await serverApi.isLoggedIn();
      setAuthed(logged);
      if (logged) {
        const [feed, stories] = await Promise.all([serverApi.feed(), serverApi.stories()]);
        setPosts(feed);
        setStoryGroups(stories);
      }
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
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? <EmptyState title={t('feed.emptyTitle')} message={t('feed.emptyMessage')} /> : null
        }
      />
      <StoryViewer group={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const { t } = useT();
  const name = post.author.displayName || t('discover.unnamed');
  const when = new Date(post.createdAt).toLocaleDateString('ko-KR');
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
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
      {imageUrl ? <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.postImage} resizeMode="cover" /> : null}
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
});
