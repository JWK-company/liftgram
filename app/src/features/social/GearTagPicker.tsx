// @plm SRS-038  게시물 작성 시 착용장비 카테고리 수동 태그 — 선택기(모달 바텀시트) + 선택 칩 미리보기.
// 새 라우트를 만들지 않고 파일 로컬 Modal 로 띄운다(ReportSheet·OwnPostMenu 가 확립한 패턴).
// 카테고리 8종 + 브랜드 직접 입력(선택). 브랜드를 비우면 카테고리 검색으로 폴백한다(ADR-027 D5 개정판).
// Phase 0 은 사용자 직접 입력만 — 자동 감지 제안은 재측정 통과 후 Phase 1 대상이다.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, TextField } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import { useUser } from '../../state/userContext';
import {
  GEAR_CATEGORIES,
  MAX_GEAR_BRAND_LEN,
  gearLabelKey,
  normalizeGearTags,
  type GearCategory,
  type GearTag,
} from '../../domain';

export function GearTagPicker({
  value,
  onChange,
  disabled,
  savedSlot,
}: {
  value: GearTag[];
  onChange: (next: GearTag[]) => void;
  disabled?: boolean;
  // 커스텀 재사용 영역을 끼우고 싶을 때만 쓴다. 미전달이면 내 장비함(SRS-042)이 기본으로 들어간다.
  savedSlot?: React.ReactNode;
}) {
  const { t } = useT();
  const { myGear } = useUser(); // @plm SRS-042 내 장비함 — 한 번의 탭으로 재사용
  const [open, setOpen] = useState(false);

  const selected = new Set(value.map((g) => g.category));
  // 아직 안 고른 저장 장비만 제안한다(이미 고른 걸 다시 보여주면 노이즈).
  const suggestions = myGear.filter((g) => !selected.has(g.category));

  // 태그 배열 조작은 전부 도메인 정규화를 거친다 — 화이트리스트·중복·상한이 한 곳에서만 강제되도록.
  function toggle(c: GearCategory) {
    const next = selected.has(c)
      ? value.filter((g) => g.category !== c)
      : [...value, { category: c, source: 'user' as const }];
    onChange(normalizeGearTags(next));
  }

  // 브랜드 입력 — 빈 문자열이면 정규화가 brand·brandSource 를 함께 제거해 카테고리 폴백으로 돌아간다.
  function setBrand(c: GearCategory, brand: string) {
    onChange(
      normalizeGearTags(
        value.map((g) => (g.category === c ? { ...g, brand, brandSource: 'user' as const } : g)),
      ),
    );
  }

  function remove(c: GearCategory) {
    onChange(normalizeGearTags(value.filter((g) => g.category !== c)));
  }

  return (
    <>
      {value.length > 0 ? (
        <View style={styles.chips}>
          {value.map((g) => (
            <Pressable key={g.category} style={styles.chip} onPress={() => remove(g.category)} hitSlop={4}>
              <AppText variant="caption" color="text">
                {g.brand ? `${g.brand} ${t(gearLabelKey(g.category))}` : t(gearLabelKey(g.category))}
              </AppText>
              <Ionicons name="close" size={13} color={colors.textMuted} style={{ marginLeft: 4 }} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        hitSlop={6}
      >
        <Ionicons name="fitness-outline" size={16} color={colors.primary} />
        <AppText variant="caption" color="primary" weight="medium" style={{ marginLeft: 4 }}>
          {value.length > 0 ? t('gear.editTags', { count: value.length }) : t('gear.addTags')}
        </AppText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading" style={styles.title}>
              {t('gear.pickerTitle')}
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
              {t('gear.pickerHint')}
            </AppText>

            {savedSlot ?? (suggestions.length > 0 ? (
              <View style={styles.saved}>
                <AppText variant="label" color="textFaint" style={{ marginBottom: spacing.xs }}>
                  {t('gear.myGearQuick')}
                </AppText>
                <View style={styles.savedChips}>
                  {suggestions.map((g) => (
                    <Pressable key={g.category} style={styles.savedChip} onPress={() => toggle(g.category)} hitSlop={4}>
                      <Ionicons name="add" size={13} color={colors.primary} />
                      <AppText variant="caption" color="primary" style={{ marginLeft: 2 }}>
                        {t(gearLabelKey(g.category))}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null)}

            {value.length > 0 ? (
              <View style={styles.brands}>
                <AppText variant="label" color="textFaint" style={{ marginBottom: spacing.xs }}>
                  {t('gear.brandSection')}
                </AppText>
                {/* 브랜드는 선택 입력이다 — 비우면 카테고리 검색으로 폴백한다(회귀 없음, ADR-027 D5 개정판).
                    Phase 0 은 사용자 직접 입력만이며 brandSource 는 항상 'user' 다. */}
                {value.map((g) => (
                  <View key={g.category} style={styles.brandRow}>
                    <AppText variant="caption" color="textMuted" style={styles.brandLabel} numberOfLines={1}>
                      {t(gearLabelKey(g.category))}
                    </AppText>
                    <TextField
                      value={g.brand ?? ''}
                      onChangeText={(txt) => setBrand(g.category, txt)}
                      placeholder={t('gear.brandPlaceholder')}
                      maxLength={MAX_GEAR_BRAND_LEN}
                      containerStyle={styles.brandInput}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView style={styles.list}>
              <View style={styles.grid}>
                {GEAR_CATEGORIES.map((c) => {
                  const on = selected.has(c);
                  return (
                    <Pressable
                      key={c}
                      style={[styles.option, on && styles.optionOn]}
                      onPress={() => toggle(c)}
                    >
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={on ? colors.primary : colors.textFaint}
                      />
                      <AppText
                        variant="body"
                        color={on ? 'text' : 'textMuted'}
                        style={{ marginLeft: spacing.sm }}
                      >
                        {t(gearLabelKey(c))}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Pressable style={styles.done} onPress={() => setOpen(false)}>
              <AppText variant="body" color="primary" weight="medium">
                {t('gear.pickerDone')}
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  trigger: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: spacing.xs },
  triggerDisabled: { opacity: 0.4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  title: { marginBottom: spacing.xs },
  saved: { marginBottom: spacing.md },
  savedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  brands: { marginBottom: spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  brandLabel: { width: 78 },
  brandInput: { flex: 1, marginBottom: 0 },
  list: { flexGrow: 0 },
  grid: { gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  optionOn: { backgroundColor: colors.primaryMuted },
  done: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
});
