// @plm SRS-019  스토리 트레이 + 뷰어 (SAD-012). 24h 만료 스토리를 작성자별로 표시.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, RemoteImage } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { serverApi, type StoryGroup } from '../../sync/serverApi';
import { resolveMediaUrl } from '../../config';
import { ReportSheet } from './ReportSheet';
import { groupHasUnseen, newestStory, type StorySeenMap } from './storySeen';

// 스토리 아바타(썸네일 or 이니셜) + 미열람 링. 미열람이면 강조 링, 열람 완료면 흐린 링.
function StoryAvatar({ group, unseen, busy }: { group?: StoryGroup; unseen?: boolean; busy?: boolean }) {
  const thumb = group ? newestStory(group)?.mediaUrl : undefined;
  const initial = (group?.author.displayName || '?').slice(0, 1).toUpperCase();
  return (
    <View style={[styles.ring, unseen ? styles.ringUnseen : group ? styles.ringSeen : styles.ringNone]}>
      <View
        style={[
          styles.avatarInner,
          thumb ? null : group ? styles.avatarInnerFilled : styles.avatarInnerAdd,
        ]}
      >
        {thumb ? (
          <RemoteImage uri={thumb} style={styles.thumb} resizeMode="cover" />
        ) : group ? (
          <AppText variant="heading" style={{ color: colors.onPrimary }}>
            {initial}
          </AppText>
        ) : (
          <Ionicons name="add" size={26} color={colors.primary} />
        )}
        {busy ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={colors.onPrimary} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function StoryTray({
  groups,
  onAdd,
  onOpen,
  busy,
  seen,
  meId,
}: {
  groups: StoryGroup[];
  onAdd: () => void;
  onOpen: (g: StoryGroup) => void;
  busy?: boolean;
  seen: StorySeenMap;
  meId?: string | null;
}) {
  const { t } = useT();
  // 내 스토리는 '내 스토리' 타일 하나로 합친다(인스타/카톡식): 있으면 썸네일+링, 없으면 '+'.
  const myGroup = meId ? groups.find((g) => g.author.id === meId) : undefined;
  const others = groups.filter((g) => g.author.id !== myGroup?.author.id);
  const myUnseen = myGroup ? groupHasUnseen(myGroup, seen) : false;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.trayScroller}
      contentContainerStyle={styles.tray}
    >
      <Pressable
        style={styles.item}
        onPress={() => (myGroup ? onOpen(myGroup) : onAdd())}
        disabled={busy}
      >
        <View>
          {myGroup && !busy ? <StoryAvatar group={myGroup} unseen={myUnseen} /> : <StoryAvatar busy={busy} />}
          {/* 스토리가 있어도 계속 추가할 수 있게 '+' 배지 — 탭하면 추가 흐름 */}
          {myGroup ? (
            <Pressable style={styles.addBadge} onPress={onAdd} hitSlop={8} disabled={busy}>
              <Ionicons name="add" size={14} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
        <AppText variant="label" color="textMuted" numberOfLines={1} style={styles.label}>
          {t('story.myStory')}
        </AppText>
      </Pressable>
      {others.map((g) => (
        <Pressable key={g.author.id} style={styles.item} onPress={() => onOpen(g)}>
          <StoryAvatar group={g} unseen={groupHasUnseen(g, seen)} />
          <AppText variant="label" numberOfLines={1} style={styles.label}>
            {g.author.displayName || t('discover.unnamed')}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function StoryViewer({
  group,
  onClose,
  meId,
}: {
  group: StoryGroup | null;
  onClose: () => void;
  meId?: string | null;
}) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    setIdx(0);
    setReporting(false);
  }, [group]);
  if (!group) return null;
  const g = group;
  const story = g.stories[idx];
  if (!story) return null;
  const canReport = !!meId && g.author.id !== meId;
  async function submitReport(reason: string) {
    setReporting(false);
    try {
      await serverApi.report('story', story.id, reason);
      Alert.alert(t('report.submitted'));
    } catch {
      Alert.alert(t('report.failed'));
    }
  }
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
          <View style={styles.viewerHeadActions}>
            {canReport ? (
              <Pressable onPress={() => setReporting(true)} hitSlop={12}>
                <Ionicons name="flag-outline" size={22} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.viewerBody} onPress={advance}>
          <RemoteImage uri={story.mediaUrl} style={styles.viewerImage} resizeMode="contain" />
        </Pressable>
        {story.caption ? (
          <AppText variant="body" center style={styles.viewerCaption}>
            {story.caption}
          </AppText>
        ) : null}
        <ReportSheet visible={reporting} onClose={() => setReporting(false)} onSubmit={submitReport} />
      </View>
    </Modal>
  );
}

const AVATAR = 60;

const styles = StyleSheet.create({
  // 세로 공간이 좁아도(짧은 창) 트레이가 눌려 아바타가 잘리지 않게 — 축소 금지 + 내용 높이 고정.
  trayScroller: { flexGrow: 0, flexShrink: 0 },
  tray: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  item: { alignItems: 'center', width: AVATAR + 16 },
  // 아바타 = 미열람 강조 링(바깥) + 썸네일/이니셜(안). 인스타/카톡식 unseen 링.
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringUnseen: { borderColor: colors.primary },
  ringSeen: { borderColor: colors.border },
  ringNone: { borderColor: 'transparent' },
  avatarInner: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInnerFilled: { backgroundColor: colors.primary },
  avatarInnerAdd: { borderWidth: 1, borderColor: colors.border },
  thumb: { width: AVATAR, height: AVATAR },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  addBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  label: { marginTop: spacing.xs, maxWidth: AVATAR + 12, textAlign: 'center' },
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
  viewerHeadActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  viewerBody: { flex: 1 },
  viewerImage: { flex: 1, width: '100%' },
  viewerCaption: { color: '#fff', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
});
