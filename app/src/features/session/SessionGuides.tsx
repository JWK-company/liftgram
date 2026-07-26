// @plm SRS-046  RIR·웜업 마이크로 교육 — 세션 내 다페이지 가이드 모달(이전/다음 페이지네이션).
// 트레이너-회원 코칭의 공통 언어(BS-004): "주관적 힘듦이 아닌 수행 속도 변화로 RIR 판단" 등 실전 기준.
// 모든 문구는 i18n 번들(guide.*)에서 로드되며 카피 게이트(containsMedicalClaim) 테스트를 통과한다(SRS-015).
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT, type TransKey } from '../../i18n';

const RIR_PAGES = ['p1', 'p2', 'p3', 'p4'] as const;
const WARMUP_PAGES = ['p1', 'p2', 'p3'] as const;

export function SessionGuideButtons() {
  const { t } = useT();
  const [open, setOpen] = useState<'rir' | 'warmup' | null>(null);
  return (
    <View style={styles.row}>
      <Pressable onPress={() => setOpen('rir')} style={styles.btn}>
        <AppText variant="caption" weight="medium">{t('guide.rir.button')}</AppText>
      </Pressable>
      <Pressable onPress={() => setOpen('warmup')} style={styles.btn}>
        <AppText variant="caption" weight="medium">{t('guide.warmup.button')}</AppText>
      </Pressable>
      <GuideModal
        visible={open === 'rir'}
        onClose={() => setOpen(null)}
        titleKey="guide.rir.title"
        pageKeys={RIR_PAGES.map((p) => `guide.rir.${p}` as const)}
      />
      <GuideModal
        visible={open === 'warmup'}
        onClose={() => setOpen(null)}
        titleKey="guide.warmup.title"
        pageKeys={WARMUP_PAGES.map((p) => `guide.warmup.${p}` as const)}
      />
    </View>
  );
}

function GuideModal({
  visible,
  onClose,
  titleKey,
  pageKeys,
}: {
  visible: boolean;
  onClose: () => void;
  titleKey: TransKey;
  pageKeys: string[]; // `${key}.title` / `${key}.body` 쌍
}) {
  const { t } = useT();
  const [page, setPage] = useState(0);
  const last = page >= pageKeys.length - 1;
  function close() {
    setPage(0);
    onClose();
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <AppText variant="label" color="primary">{t(titleKey)}</AppText>
          <AppText variant="heading" style={{ marginTop: 2 }}>
            {t(`${pageKeys[page]}.title` as TransKey)}
          </AppText>
          <ScrollView style={{ maxHeight: 300, marginTop: spacing.sm }}>
            <AppText variant="body" color="textMuted">
              {t(`${pageKeys[page]}.body` as TransKey)}
            </AppText>
          </ScrollView>
          <View style={styles.dots}>
            {pageKeys.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
          <View style={styles.actions}>
            <Button
              title={t('guide.prev')}
              variant="secondary"
              fullWidth={false}
              disabled={page === 0}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
              style={{ flex: 1 }}
            />
            <Button
              title={last ? t('common.ok') : t('guide.next')}
              fullWidth={false}
              onPress={() => (last ? close() : setPage((p) => p + 1))}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
