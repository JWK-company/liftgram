// @plm SRS-045  운동 경력·코칭 의향 — 온보딩 미응답분 후입력·수정 카드(프로필 탭).
// 선택 사항이며 미응답이 어떤 기능도 차단하지 않는다. 코칭 의향(트레이너 role)은 자격 보증이 아님을
// 항상 병기한다(면책 — SRS-015 웰니스·BS-004 리스크 가드레일).
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, SectionHeader } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';
import { serverApi } from '../../sync/serverApi'; // 서버 프로필 반영(트레이너 탐색용 — 로그인 시). @plm SRS-048
import type { ExperienceLevel } from '../../domain';

const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

export function ExperienceCard() {
  const { t } = useT();
  const { user, experienceLevel, trainerIntent } = useUser();
  const [busy, setBusy] = useState(false);

  async function save(patch: { experienceLevel?: ExperienceLevel | null; trainerIntent?: boolean | null }) {
    if (!user || busy) return;
    setBusy(true);
    try {
      await userRepo.updateUserSettings(user.id, patch);
      // 로그인 상태면 서버 프로필에도 반영(코칭 탐색 노출) — 실패해도 로컬 저장은 유지(silent).
      // 서버는 trainerIntent를 boolean으로만 받음(null=off로 정규화).
      if (await serverApi.isLoggedIn().catch(() => false)) {
        const server: { experienceLevel?: string | null; trainerIntent?: boolean } = {};
        if (patch.experienceLevel !== undefined) server.experienceLevel = patch.experienceLevel;
        if (patch.trainerIntent !== undefined) server.trainerIntent = patch.trainerIntent === true;
        serverApi.updateProfile(server).catch(() => {});
      }
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader title={t('experience.title')} />
      <Card style={styles.card}>
        <AppText variant="label" color="textMuted">
          {t('experience.levelLabel')}
        </AppText>
        <View style={styles.optRow}>
          {LEVELS.map((lv) => {
            const on = experienceLevel === lv;
            return (
              <Pressable key={lv} onPress={() => save({ experienceLevel: on ? null : lv })} style={[styles.opt, on && styles.optOn]}>
                <AppText variant="caption" color={on ? 'primary' : 'text'} weight={on ? 'bold' : 'regular'}>
                  {t(`experience.level.${lv}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="label" color="textMuted" style={{ marginTop: spacing.md }}>
          {t('experience.intentLabel')}
        </AppText>
        <View style={styles.optRow}>
          <Pressable onPress={() => save({ trainerIntent: trainerIntent === true ? null : true })} style={[styles.opt, trainerIntent === true && styles.optOn]}>
            <AppText variant="caption" color={trainerIntent === true ? 'primary' : 'text'} weight={trainerIntent === true ? 'bold' : 'regular'}>
              {t('experience.intentYes')}
            </AppText>
          </Pressable>
        </View>
        {trainerIntent === true ? (
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
            {t('experience.trainerDisclaimer')}
          </AppText>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xl },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  opt: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
});
