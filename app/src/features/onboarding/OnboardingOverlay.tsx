// 첫 실행 환영 안내 — 앱을 처음 여는 사람(테스터)에게 무엇을 할 수 있는지 1회 안내.
// 전역 오버레이(App 루트에 마운트). 완료 플래그는 prefs에 영속 → 다음부터 안 뜸.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { getPref, setPref } from '../../sync/prefs';

const SEEN_KEY = 'onboarding_seen_v1';

export function OnboardingOverlay() {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const seen = await getPref(SEEN_KEY);
      if (mounted && seen !== 'yes') setVisible(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function dismiss() {
    setVisible(false);
    void setPref(SEEN_KEY, 'yes');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <AppText variant="display" weight="bold" style={{ color: colors.onPrimary }}>
              L
            </AppText>
          </View>
          <AppText variant="title" center style={{ marginTop: spacing.md }}>
            {t('onboarding.title')}
          </AppText>
          <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
            {t('onboarding.subtitle')}
          </AppText>
          <View style={styles.points}>
            <Point text={t('onboarding.point1')} />
            <Point text={t('onboarding.point2')} />
            <Point text={t('onboarding.point3')} />
          </View>
          <Button title={t('onboarding.cta')} onPress={dismiss} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    </Modal>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <AppText variant="body">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  points: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.xl },
  point: { flexDirection: 'row', alignItems: 'flex-start' },
});
