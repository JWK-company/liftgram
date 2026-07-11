// @plm SRS-028  종목 변형(기구·그립·팔) 선택 칩 — MachineVariantSelector(기구만)를 3차원으로 일반화.
// 변형을 고르면 이전기록·PR·볼륨이 (종목 × variant_key) 버킷으로 분리 추적된다. 세션/루틴 편집 공용.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import {
  ARM_OPTIONS,
  GRIP_OPTIONS,
  armLabel,
  equipmentOptionsFor,
  equipmentVariantLabel,
  gripLabel,
  variantLabel,
  type ArmKey,
  type EquipmentType,
  type GripKey,
  type VariantDims,
} from '../domain';
import { useUser } from '../state/userContext';
import { useT } from '../i18n';

interface Props {
  exerciseId: string; // API 대칭용(호출부가 종목 식별). 기구 옵션은 baseEquipment로 전달받음.
  baseEquipment: EquipmentType | null;
  value: VariantDims;
  onChange: (dims: VariantDims) => void;
}

export function VariantSelector({ baseEquipment, value, onChange }: Props) {
  const { t, lang } = useT();
  const { machineVariantLabels } = useUser();
  const [open, setOpen] = useState(false);

  const equip = value.equipment ?? null;
  const grip = value.grip ?? null;
  const arm = value.arm === 'uni' ? 'uni' : null; // 'bi'/null = 기본
  const active = Boolean(equip || grip || arm);
  const label = variantLabel(value, lang, machineVariantLabels);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.chip}>
        <Ionicons name="options-outline" size={12} color={active ? colors.primary : colors.textMuted} />
        <AppText variant="caption" color={active ? 'primary' : 'textMuted'} numberOfLines={1} style={styles.chipText}>
          {label}
        </AppText>
        <Ionicons name="chevron-down" size={12} color={active ? colors.primary : colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="heading" style={styles.sheetTitle}>
              {t('variant.selectTitle')}
            </AppText>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {/* 기구 — 종목 기본 기구에 따라 브랜드/커스텀 또는 대체 기구 */}
              <AppText variant="label" color="textMuted" style={styles.rowLabel}>
                {t('variant.equipment')}
              </AppText>
              <View style={styles.chipRow}>
                {equipmentOptionsFor(baseEquipment).map((k) => (
                  <SelectChip
                    key={k ?? 'default'}
                    label={equipmentVariantLabel(k, lang, machineVariantLabels)}
                    active={(k ?? null) === equip}
                    onPress={() => onChange({ ...value, equipment: k })}
                  />
                ))}
              </View>

              {/* 그립 */}
              <AppText variant="label" color="textMuted" style={styles.rowLabel}>
                {t('variant.grip')}
              </AppText>
              <View style={styles.chipRow}>
                {GRIP_OPTIONS.map((k) => (
                  <SelectChip
                    key={k ?? 'default'}
                    label={k ? gripLabel(k, lang) : t('variant.default')}
                    active={(k ?? null) === grip}
                    onPress={() => onChange({ ...value, grip: k })}
                  />
                ))}
              </View>

              {/* 팔 — 'bi'=양팔(기본), 'uni'=원암 */}
              <AppText variant="label" color="textMuted" style={styles.rowLabel}>
                {t('variant.arm')}
              </AppText>
              <View style={styles.chipRow}>
                {ARM_OPTIONS.map((k) => (
                  <SelectChip
                    key={k ?? 'bi'}
                    label={k === 'uni' ? armLabel('uni', lang) : t('variant.armBoth')}
                    active={(k === 'uni' ? 'uni' : null) === arm}
                    onPress={() => onChange({ ...value, arm: k })}
                  />
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SelectChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.selChip, active && styles.selChipActive]}>
      <AppText variant="caption" color={active ? 'primary' : 'text'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: 180,
  },
  chipText: { flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%' },
  sheetTitle: { marginBottom: spacing.md },
  list: { maxHeight: 460 },
  rowLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selChipActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
});
