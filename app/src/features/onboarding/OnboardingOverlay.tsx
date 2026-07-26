// 첫 실행 환영 안내 — 앱을 처음 여는 사람(테스터)에게 무엇을 할 수 있는지 1회 안내.
// 전역 오버레이(App 루트에 마운트). 완료 플래그는 prefs에 영속 → 다음부터 안 뜸.
// @plm SRS-045  2단계: 운동 경력·코칭 의향 분류(선택·건너뛰기 가능 — 미응답 무차단, RapidOverload식 3분류)
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { getPref, setPref } from '../../sync/prefs';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';
import type { ExperienceLevel } from '../../domain';

const SEEN_KEY = 'onboarding_seen_v1';
const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

export function OnboardingOverlay() {
  const { t } = useT();
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [intent, setIntent] = useState(false);

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

  function finish() {
    setVisible(false);
    void setPref(SEEN_KEY, 'yes');
  }

  // 2단계 완료 — 응답분만 저장(건너뛰기 시 저장 없음). 실패해도 온보딩은 종료(무차단).
  function saveAndFinish() {
    if (user && (level != null || intent)) {
      void userRepo.updateUserSettings(user.id, { experienceLevel: level, trainerIntent: intent ? true : null }).catch(() => {});
    }
    finish();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.backdrop}>
        {step === 0 ? (
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
            <Button title={t('onboarding.cta')} onPress={() => setStep(1)} style={{ marginTop: spacing.lg }} />
          </View>
        ) : (
          <View style={styles.card}>
            <AppText variant="title" center>
              {t('onboarding.expTitle')}
            </AppText>
            <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
              {t('onboarding.expSubtitle')}
            </AppText>
            <View style={styles.optCol}>
              {LEVELS.map((lv) => (
                <Pressable key={lv} onPress={() => setLevel((cur) => (cur === lv ? null : lv))} style={[styles.opt, level === lv && styles.optOn]}>
                  <AppText variant="body" color={level === lv ? 'primary' : 'text'} weight={level === lv ? 'bold' : 'regular'}>
                    {t(`experience.level.${lv}`)}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {t(`experience.levelHint.${lv}`)}
                  </AppText>
                </Pressable>
              ))}
              <Pressable onPress={() => setIntent((v) => !v)} style={[styles.opt, intent && styles.optOn]}>
                <AppText variant="body" color={intent ? 'primary' : 'text'} weight={intent ? 'bold' : 'regular'}>
                  {t('onboarding.trainerIntentOption')}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {t('experience.trainerDisclaimer')}
                </AppText>
              </Pressable>
            </View>
            <Button title={t('onboarding.expDone')} onPress={saveAndFinish} style={{ marginTop: spacing.lg }} />
            <Pressable onPress={finish} hitSlop={8} style={{ marginTop: spacing.sm, alignSelf: 'center' }}>
              <AppText variant="caption" color="textFaint">
                {t('onboarding.skip')}
              </AppText>
            </Pressable>
          </View>
        )}
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
  // 경력·의향 선택지(2단계). @plm SRS-045
  optCol: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  opt: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
});
