// @plm SRS-018  발견용 컴팩트 포스트 카드(Explore·Hashtag 공용).
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Avatar, Card, RemoteImage } from '../../components';
import type { FeedPost } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { HashtagText } from './HashtagText';
import { OwnPostMenu } from './OwnPostMenu';

export function DiscoveryPostCard({
  post,
  onOpen,
  onOpenProfile,
  onTag,
  meId,
  onUpdated,
  onDeleted,
  onBookmark,
}: {
  post: FeedPost;
  onOpen: () => void;
  onOpenProfile: () => void;
  onTag: (tag: string) => void;
  meId?: string | null;
  onUpdated?: (p: FeedPost) => void;
  onDeleted?: (id: string) => void;
  onBookmark?: (p: FeedPost) => void;
}) {
  const { t } = useT();
  const isOwn = !!meId && post.author.id === meId;
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Pressable style={styles.headMain} onPress={onOpenProfile}>
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={30} />
          <AppText variant="caption" weight="medium" numberOfLines={1} style={styles.author}>
            {post.author.displayName || t('discover.unnamed')}
          </AppText>
        </Pressable>
        {onBookmark ? (
          <Pressable onPress={() => onBookmark(post)} hitSlop={8} style={{ paddingLeft: spacing.sm }}>
            <Ionicons
              name={post.bookmarkedByMe ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={post.bookmarkedByMe ? colors.primary : colors.textFaint}
            />
          </Pressable>
        ) : null}
        {isOwn && onUpdated && onDeleted ? (
          <OwnPostMenu post={post} onUpdated={onUpdated} onDeleted={onDeleted} />
        ) : null}
      </View>
      <Pressable onPress={onOpen}>
        {imageUrl ? (
          <RemoteImage uri={imageUrl} style={styles.image} />
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
  headMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  author: { flex: 1, marginLeft: spacing.sm },
  image: { width: '100%', height: 180, borderRadius: radius.md, marginTop: spacing.xs },
  caption: { marginTop: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  count: { marginLeft: 4 },
});
