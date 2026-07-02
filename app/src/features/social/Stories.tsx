// @plm SRS-019  스토리 트레이 + 뷰어 (SAD-012). 24h 만료 스토리를 작성자별로 표시.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import type { StoryGroup } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';

export function StoryTray({
  groups,
  onAdd,
  onOpen,
  busy,
}: {
  groups: StoryGroup[];
  onAdd: () => void;
  onOpen: (g: StoryGroup) => void;
  busy?: boolean;
}) {
  const { t } = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tray}
    >
      <Pressable style={styles.item} onPress={onAdd} disabled={busy}>
        <View style={[styles.avatar, styles.addAvatar]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add" size={26} color={colors.primary} />}
        </View>
        <AppText variant="label" color="textMuted" numberOfLines={1} style={styles.label}>
          {t('story.myStory')}
        </AppText>
      </Pressable>
      {groups.map((g) => (
        <Pressable key={g.author.id} style={styles.item} onPress={() => onOpen(g)}>
          <View style={[styles.avatar, styles.ring]}>
            <AppText variant="heading" style={{ color: colors.onPrimary }}>
              {(g.author.displayName || '?').slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <AppText variant="label" numberOfLines={1} style={styles.label}>
            {g.author.displayName || t('discover.unnamed')}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function StoryViewer({ group, onClose }: { group: StoryGroup | null; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [group]);
  if (!group) return null;
  const g = group;
  const story = g.stories[idx];
  if (!story) return null;
  const advance = () => {
    if (idx < g.stories.length - 1) setIdx(idx + 1);
    else onClose();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerRoot}>
        <View style={styles.bars}>
          {g.stories.map((s, i) => (
            <View key={s.id} style={[styles.bar, { backgroundColor: i <= idx ? '#fff' : 'rgba(255,255,255,0.3)' }]} />
          ))}
        </View>
        <View style={styles.viewerHead}>
          <AppText variant="body" weight="medium" style={{ color: '#fff' }}>
            {g.author.displayName || '?'}
          </AppText>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
        <Pressable style={styles.viewerBody} onPress={advance}>
          <Image source={{ uri: resolveMediaUrl(story.mediaUrl) }} style={styles.viewerImage} resizeMode="contain" />
        </Pressable>
        {story.caption ? (
          <AppText variant="body" center style={styles.viewerCaption}>
            {story.caption}
          </AppText>
        ) : null}
      </View>
    </Modal>
  );
}

const AVATAR = 60;

const styles = StyleSheet.create({
  tray: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  item: { alignItems: 'center', width: AVATAR + 12 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAvatar: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  ring: { borderWidth: 2, borderColor: colors.primary },
  label: { marginTop: spacing.xs, maxWidth: AVATAR + 8, textAlign: 'center' },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', paddingTop: spacing.xl },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  viewerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  viewerBody: { flex: 1 },
  viewerImage: { flex: 1, width: '100%' },
  viewerCaption: { color: '#fff', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
});
