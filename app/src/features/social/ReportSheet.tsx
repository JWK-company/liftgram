// @plm SRS-020  신고 시트 — 사유 선택(스팸·노출·괴롭힘·자해·미성년 안전 등, ADR-017).
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

const REASONS = [
  { id: 'spam', key: 'report.reason.spam' },
  { id: 'nudity', key: 'report.reason.nudity' },
  { id: 'harassment', key: 'report.reason.harassment' },
  { id: 'violence', key: 'report.reason.violence' },
  { id: 'self_harm', key: 'report.reason.self_harm' },
  { id: 'minor_safety', key: 'report.reason.minor_safety' },
  { id: 'misinformation', key: 'report.reason.misinformation' },
  { id: 'other', key: 'report.reason.other' },
] as const;

export function ReportSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <AppText variant="heading" style={styles.title}>
            {t('report.title')}
          </AppText>
          {REASONS.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => onSubmit(r.id)}>
              <AppText variant="body">{t(r.key)}</AppText>
            </Pressable>
          ))}
          <Pressable style={[styles.row, styles.cancel]} onPress={onClose}>
            <AppText variant="body" color="textMuted">
              {t('report.cancel')}
            </AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: { marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  row: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancel: { alignItems: 'center', marginTop: spacing.xs },
});
