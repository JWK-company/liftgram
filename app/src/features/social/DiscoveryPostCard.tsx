// @plm SRS-018  발견용 컴팩트 포스트 카드(Explore·Hashtag 공용).
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Avatar, Card } from '../../components';
import type { FeedPost } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { HashtagText } from './HashtagText';

export function DiscoveryPostCard({
  post,
  onOpen,
  onOpenProfile,
  onTag,
}: {
  post: FeedPost;
  onOpen: () => void;
  onOpenProfile: () => void;
  onTag: (tag: string) => void;
}) {
  const { t } = useT();
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
  return (
    <Card style={styles.card}>
      <Pressable style={styles.head} onPress={onOpenProfile}>
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={30} />
        <AppText variant="caption" weight="medium" numberOfLines={1} style={styles.author}>
          {post.author.displayName || t('discover.unnamed')}
        </AppText>
      </Pressable>
      <Pressable onPress={onOpen}>
        {imageUrl ? (
          <Image source={{ uri: resolveMediaUrl(imageUrl) }} style={styles.image} resizeMode="cover" />
        ) : null}
        {post.caption ? (
          <HashtagText text={post.caption} onTag={onTag} numberOfLines={imageUrl ? 2 : 5} style={styles.caption} />
        ) : null}
        <View style={styles.meta}>
          <Ionicons name="heart-outline" size={15} color={colors.textMuted} />
          <AppText variant="caption" color="textMuted" style={styles.count}>
            {post.likeCount}
          </AppText>
          <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} style={{ marginLeft: spacing.md }} />
          <AppText variant="caption" color="textMuted" style={styles.count}>
            {post.commentCount}
          </AppText>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  author: { flex: 1, marginLeft: spacing.sm },
  image: { width: '100%', height: 180, borderRadius: radius.md, marginTop: spacing.xs },
  caption: { marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  count: { marginLeft: 4 },
});
