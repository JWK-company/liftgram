// @plm SRS-042  내 장비함 — 자주 쓰는 착용장비를 저장·삭제하고 작성 선택기에서 재사용한다.
// 로컬 우선(user_profiles.my_gear @json, SRS-041)이라 비로그인·오프라인에서도 열람·편집된다.
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppText, Card, EmptyState, TextField } from '../../components';
import type { RootStackScreenProps } from '../../navigation/types';
import { userRepo } from '../../data';
import { useUser } from '../../state/userContext';
import {
  GEAR_CATEGORIES,
  MAX_GEAR_BRAND_LEN,
  gearLabelKey,
  normalizeGearTags,
  type GearCategory,
  type GearTag,
} from '../../domain';
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

  function setBrand(c: GearCategory, brand: string) {
    void save(myGear.map((g) => (g.category === c ? { ...g, brand, brandSource: 'user' as const } : g)));
  }

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
            {/* 브랜드는 선택 입력 — 저장해두면 작성 시 재사용에서 함께 딸려 간다(SRS-042).
                비우면 카테고리 폴백으로 돌아간다(ADR-027 D5 개정판). */}
            {myGear.map((g) => (
              <View key={g.category} style={styles.savedRow}>
                <Pressable onPress={() => toggle(g.category)} hitSlop={6} style={styles.savedRemove}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
                <AppText variant="caption" color="text" style={styles.savedLabel} numberOfLines={1}>
                  {t(gearLabelKey(g.category))}
                </AppText>
                <TextField
                  value={g.brand ?? ''}
                  onChangeText={(txt) => setBrand(g.category, txt)}
                  placeholder={t('gear.brandPlaceholder')}
                  maxLength={MAX_GEAR_BRAND_LEN}
                  containerStyle={styles.savedInput}
                />
              </View>
            ))}
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
  savedRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  savedRemove: { paddingRight: spacing.xs },
  savedLabel: { width: 72 },
  savedInput: { flex: 1, marginBottom: 0 },
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
