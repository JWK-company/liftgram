// @plm SRS-007  본인 게시물 관리 — 캡션 수정·삭제(작성자 전용). (SAD-011)
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, TextField } from '../../components';
import { serverApi, type FeedPost } from '../../sync/serverApi';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

// 작성자 본인 포스트의 overflow(⋯) 메뉴 — 수정/삭제. 시트·편집모달·확인·API를 자체 처리하고
// 결과를 onUpdated/onDeleted로 부모 목록에 반영.
export function OwnPostMenu({
  post,
  onUpdated,
  onDeleted,
}: {
  post: FeedPost;
  onUpdated: (p: FeedPost) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useT();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption ?? '');
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setSheet(false);
    setCaption(post.caption ?? '');
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await serverApi.updatePost(post.id, { caption: caption.trim() });
      onUpdated(updated);
      setEditing(false);
    } catch {
      Alert.alert(t('post.updateFailed'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    setSheet(false);
    Alert.alert(t('post.deleteTitle'), t('post.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('post.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await serverApi.deletePost(post.id);
            onDeleted(post.id);
          } catch {
            Alert.alert(t('post.deleteFailed'));
          }
        },
      },
    ]);
  }

  return (
    <>
      <Pressable
        onPress={() => setSheet(true)}
        hitSlop={8}
        style={{ paddingLeft: spacing.sm }}
        accessibilityLabel={t('post.edit')}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
      </Pressable>

      {/* 액션 시트(하단) */}
      <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.row} onPress={openEdit}>
              <Ionicons name="create-outline" size={20} color={colors.text} />
              <AppText variant="body" style={styles.rowText}>
                {t('post.edit')}
              </AppText>
            </Pressable>
            <Pressable style={styles.row} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <AppText variant="body" color="danger" style={styles.rowText}>
                {t('post.delete')}
              </AppText>
            </Pressable>
            <Pressable style={[styles.row, styles.cancel]} onPress={() => setSheet(false)}>
              <AppText variant="body" color="textMuted">
                {t('common.cancel')}
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 캡션 편집 모달(중앙) */}
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => !saving && setEditing(false)}>
        <Pressable style={styles.backdropCenter} onPress={() => !saving && setEditing(false)}>
          <Pressable style={styles.editCard} onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading" style={{ marginBottom: spacing.md }}>
              {t('post.editTitle')}
            </AppText>
            <TextField
              value={caption}
              onChangeText={setCaption}
              placeholder={t('feed.composePlaceholder')}
              multiline
              maxLength={2000}
            />
            <View style={styles.editActions}>
              <Button
                title={t('common.cancel')}
                variant="secondary"
                fullWidth={false}
                disabled={saving}
                onPress={() => setEditing(false)}
              />
              <Button title={t('post.save')} fullWidth={false} loading={saving} onPress={save} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1 },
  cancel: { justifyContent: 'center', marginTop: spacing.xs },
  editCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
});
