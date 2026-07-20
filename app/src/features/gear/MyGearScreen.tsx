// @plm SRS-042  내 장비함 — 자주 쓰는 착용장비를 저장·삭제하고 작성 선택기에서 재사용한다.
// 로컬 우선(user_profiles.my_gear @json, SRS-041)이라 비로그인·오프라인에서도 열람·편집된다.
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, Card, EmptyState } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { userRepo } from '../../data';
import { useUser } from '../../state/userContext';
import { GEAR_CATEGORIES, gearLabelKey, normalizeGearTags, type GearCategory, type GearTag } from '../../domain';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';

export default function MyGearScreen(_props: RootStackScreenProps<'MyGear'>) {
  const { t } = useT();
  const { user, myGear, refresh } = useUser();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (next: GearTag[]) => {
      if (!user || saving) return;
      setSaving(true);
      try {
        // 저장 전 정규화는 repository 가 강제한다(쓰기 방어) — 여기서 중복 구현하지 않는다.
        await userRepo.updateUserSettings(user.id, { myGear: normalizeGearTags(next) });
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [user, saving, refresh],
  );

  const owned = new Set(myGear.map((g) => g.category));

  function toggle(c: GearCategory) {
    void save(
      owned.has(c) ? myGear.filter((g) => g.category !== c) : [...myGear, { category: c, source: 'user' as const }],
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
          {t('gear.myGearHint')}
        </AppText>

        {myGear.length === 0 ? (
          <EmptyState title={t('gear.myGearEmptyTitle')} message={t('gear.myGearEmptyMessage')} />
        ) : (
          <Card style={{ marginBottom: spacing.md }}>
            <AppText variant="label" color="textFaint" style={{ marginBottom: spacing.sm }}>
              {t('gear.myGearSaved', { count: myGear.length })}
            </AppText>
            <View style={styles.chips}>
              {myGear.map((g) => (
                <Pressable key={g.category} style={styles.chip} onPress={() => toggle(g.category)} hitSlop={4}>
                  <AppText variant="caption" color="text">
                    {t(gearLabelKey(g.category))}
                  </AppText>
                  <Ionicons name="close" size={13} color={colors.textMuted} style={{ marginLeft: 4 }} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        <AppText variant="label" color="textFaint" style={{ marginBottom: spacing.sm }}>
          {t('gear.myGearAll')}
        </AppText>
        <View style={styles.grid}>
          {GEAR_CATEGORIES.map((c) => {
            const on = owned.has(c);
            return (
              <Pressable
                key={c}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => toggle(c)}
                disabled={saving}
              >
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={on ? colors.primary : colors.textFaint}
                />
                <AppText variant="body" color={on ? 'text' : 'textMuted'} style={{ marginLeft: spacing.sm }}>
                  {t(gearLabelKey(c))}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  grid: { gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  optionOn: { backgroundColor: colors.primaryMuted },
});
