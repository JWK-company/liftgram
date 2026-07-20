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
import { GearChips, GearDisclosure, readGearTags } from './GearChips'; // @plm SRS-040
import { requiresAffiliateDisclosure, type GearAffiliateConfig } from '../../domain';
import { serverApi as api } from '../../sync/serverApi';

export function DiscoveryPostCard({
  post,
  onOpen,
  onOpenProfile,
  onTag,
  meId,
  onUpdated,
  onDeleted,
  onBookmark,
  affiliate = null,
}: {
  post: FeedPost;
  onOpen: () => void;
  onOpenProfile: () => void;
  onTag: (tag: string) => void;
  meId?: string | null;
  onUpdated?: (p: FeedPost) => void;
  onDeleted?: (id: string) => void;
  onBookmark?: (p: FeedPost) => void;
  // @plm SRS-040  제휴 설정. 미전달(null)이면 고지 불필요 판정 → 순수 쿠팡 검색 URL 만 열린다.
  // Phase 0 은 어차피 서버가 enabled:false 를 주므로 동작이 동일하다. 다만 제휴 활성화(Phase 0-b) 시점에는
  // 이 카드를 쓰는 3화면(Explore·Hashtag·Bookmarks)에도 설정을 내려줘야 딥링크가 적용된다 —
  // 안 내려주면 조용히 검색 URL 로만 나가 수수료가 새지 않고 사라진다(kind:'search' 집계로 관측 가능).
  affiliate?: GearAffiliateConfig | null;
}) {
  const { t } = useT();
  const isOwn = !!meId && post.author.id === meId;
  const imageUrl =
    post.kind === 'image' && post.data && typeof post.data === 'object'
      ? (post.data as { imageUrl?: string }).imageUrl
      : undefined;
  const gearTags = readGearTags(post.data);
  // 고지 라벨 JSX 를 감싸는 조건식 그대로 GearChips 에 넘긴다(되먹임 금지 — 항진명제 방지).
  const showDisclosure = gearTags.length > 0 && requiresAffiliateDisclosure(affiliate);
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
      {/* 대가성 고지 — 게시물 첫 부분(작성자 행 바로 아래). 끝부분 표기 폐지(ADR-027 D6). */}
      {showDisclosure ? <GearDisclosure /> : null}
      <Pressable onPress={onOpen}>
        {imageUrl ? (
          <RemoteImage uri={imageUrl} style={styles.image} />
        ) : null}
        {post.caption ? (
          <HashtagText text={post.caption} onTag={onTag} numberOfLines={imageUrl ? 2 : 5} style={styles.caption} />
        ) : null}
        {/* 장비 칩 — 사진 바깥 하단(오버레이 금지, ADR-027 D4) */}
        <GearChips
          tags={gearTags}
          cfg={affiliate}
          disclosureRendered={showDisclosure}
          onOpen={(category, kind) => {
            api.trackGearClick({ postId: post.id, category, source: 'user', kind }).catch(() => {});
          }}
        />
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
