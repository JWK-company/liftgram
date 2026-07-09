// @plm SRS-003 SRS-002  머신 기구(브랜드) 선택 칩 — equipment==='machine'에서만 노출.
// 종목 이름 옆에 두어 기구를 고르면 이전기록·PR이 그 기구 것으로 분리 추적된다.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import { machineVariantLabel, MACHINE_VARIANT_OPTIONS } from '../domain';
import { exerciseRepo } from '../data';
import { useUser } from '../state/userContext';
import { useT } from '../i18n';

interface Props {
  exerciseId: string;
  value: string | null;
  onChange: (key: string | null) => void;
}

export function MachineVariantSelector({ exerciseId, value, onChange }: Props) {
  const { t, lang } = useT();
  const { machineVariantLabels } = useUser();
  const [isMachine, setIsMachine] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    exerciseRepo
      .getExercise(exerciseId)
      .then((e) => alive && setIsMachine(e.equipment === 'machine'))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  if (!isMachine) return null; // 프리웨이트 등은 기구 구분 없음

  const label = machineVariantLabel(value, lang, machineVariantLabels);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.chip}>
        <Ionicons name="build-outline" size={12} color={value ? colors.primary : colors.textMuted} />
        <AppText variant="caption" color={value ? 'primary' : 'textMuted'} numberOfLines={1} style={styles.chipText}>
          {label}
        </AppText>
        <Ionicons name="chevron-down" size={12} color={value ? colors.primary : colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="heading" style={styles.sheetTitle}>
              {t('machineVariant.selectTitle')}
            </AppText>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {MACHINE_VARIANT_OPTIONS.map((k) => {
                const active = k === value;
                return (
                  <Pressable
                    key={k ?? 'default'}
                    onPress={() => {
                      onChange(k);
                      setOpen(false);
                    }}
                    style={[styles.row, active && styles.rowActive]}
                  >
                    <AppText variant="body" color={active ? 'primary' : 'text'}>
                      {machineVariantLabel(k, lang, machineVariantLabels)}
                    </AppText>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
    maxWidth: 150,
  },
  chipText: { flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%' },
  sheetTitle: { marginBottom: spacing.md },
  list: { maxHeight: 400 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  rowActive: { backgroundColor: colors.primaryMuted },
});
