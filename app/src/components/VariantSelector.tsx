// @plm SRS-028  종목 변형(기구·그립·팔) 선택 칩 — MachineVariantSelector(기구만)를 3차원으로 일반화.
// 변형을 고르면 이전기록·PR·볼륨이 (종목 × variant_key) 버킷으로 분리 추적된다. 세션/루틴 편집 공용.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './primitives';
import { colors, radius, spacing } from '../theme';
import {
  IMPLEMENT_KEYS,
  MACHINE_BRAND_VARIANT_KEYS,
  GRIP_KEYS,
  gripLabel,
  gripShortLabel,
  isMachineEquipSel,
  equipmentVariantLabel,
  equipmentVariantShortLabel,
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
  // 2단계 기구 선택 — 베이스 기구(레벨1) + 머신 브랜드(레벨2, 들여쓰기). 머신 종목은 브랜드만.
  const isMachineBase = baseEquipment === 'machine';
  const machineActive = isMachineBase || isMachineEquipSel(equip);
  const genericMachine: string | null = isMachineBase ? null : 'machine'; // '기본(브랜드 미지정) 머신'의 equipment 값
  // 종목 고유 기구(프리웨이트 implement) — 이름에 든 기구(바벨/덤벨/…). 있으면 '기본' 대신 이 기구를 디폴트로. @plm SRS-028
  // 머신 종목도 고유 기구='machine'으로 취급 — 레벨1(덤벨·바벨·스미스…)을 상시 노출해
  // 머신 종목에서도 프리웨이트 대체 변형을 고를 수 있게(사용자 피드백 2026-07-28: 브랜드만 보이던 문제).
  const intrinsicImplement =
    baseEquipment && (IMPLEMENT_KEYS as string[]).includes(baseEquipment) ? baseEquipment : null;
  // 고유 기구가 있으면 '기본(null)' 칩 생략(고유 기구가 곧 디폴트). 없으면(맨몸 등) 기존대로 '기본' + 대체 기구.
  const level1: (string | null)[] = intrinsicImplement ? [...IMPLEMENT_KEYS] : [null, ...IMPLEMENT_KEYS];
  // 기구 미지정(null)이면 고유 기구를 '선택된 것처럼' 표시 — 레코드 버킷은 그대로 null(기존 기록 보존).
  const l1Selected = equip ?? (isMachineBase ? null : intrinsicImplement); // 레벨1 하이라이트 기준
  const triggerEquip = equip ?? (isMachineBase ? 'machine' : intrinsicImplement); // 트리거 칩 라벨 기준
  // 그립은 별도 GripSelector 칩으로 분리(사용자 피드백 2026-07-28: "기구 변형에 그립이 섞여 이상함") —
  // 이 시트는 기구(레벨1)·머신 브랜드(레벨2)만 담당한다. 버킷 축은 그대로 (기구×그립, ADR-030).
  const active = Boolean(triggerEquip);
  const label = equipmentVariantShortLabel(triggerEquip, lang, machineVariantLabels);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.chip}>
        <Ionicons name="options-outline" size={12} color={active ? colors.primary : colors.textMuted} />
        <AppText variant="caption" color={active ? 'primary' : 'textMuted'} style={styles.chipText}>
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
              {/* 레벨1: 베이스 기구 — 머신 종목 포함 상시 노출(머신 종목은 'machine'이 디폴트 하이라이트). */}
              <AppText variant="label" color="textMuted" style={styles.rowLabel}>
                {t('variant.equipment')}
              </AppText>
              <View style={styles.chipRow}>
                {level1.map((k) => (
                  <SelectChip
                    key={k ?? 'default'}
                    label={equipmentVariantLabel(k, lang, machineVariantLabels)}
                    active={k === 'machine' ? machineActive : (k ?? null) === l1Selected}
                    // 종목 고유 기구 선택 = 기본 버킷(null)으로 저장 → 기존 기록 유지. 다른 기구만 별도 변형 버킷.
                    onPress={() => onChange({ ...value, equipment: k === baseEquipment ? null : k })}
                  />
                ))}
              </View>

              {/* 레벨2: 머신 브랜드 — 한 레벨 아래(들여쓰기). 머신 선택 시(또는 머신 종목) 노출. 브랜드 선택은 옵션. */}
              {machineActive ? (
                <View style={styles.brandGroup}>
                  <AppText variant="label" color="textFaint" style={styles.rowLabel}>
                    {t('variant.machineBrand')}
                  </AppText>
                  <View style={styles.chipRow}>
                    <SelectChip
                      label={t('variant.default')}
                      active={(equip ?? null) === (genericMachine ?? null)}
                      onPress={() => onChange({ ...value, equipment: genericMachine })}
                    />
                    {MACHINE_BRAND_VARIANT_KEYS.map((k) => (
                      <SelectChip
                        key={k}
                        label={equipmentVariantLabel(k, lang, machineVariantLabels)}
                        active={equip === k}
                        onPress={() => onChange({ ...value, equipment: k })}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// 그립 선택 칩 — 기구 변형과 분리된 독립 컨트롤(사용자 피드백 2026-07-28). 그립도 (종목×기구×그립)
// 기록 버킷 축이므로(ADR-030) 선택 즉시 이전기록·PR이 그 그립 것으로 전환된다. 팔(원암)은 세트 속성 유지.
// 세트별 그립 저장과 양립 불가(버킷이 종목 인스턴스 단위) — 종목(블록) 단위 그립으로 일원화. @plm SRS-028
export function GripSelector({ value, onChange }: { value: GripKey | null; onChange: (grip: GripKey | null) => void }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const active = value != null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.chip}>
        <Ionicons name="hand-left-outline" size={12} color={active ? colors.primary : colors.textMuted} />
        <AppText variant="caption" color={active ? 'primary' : 'textMuted'} style={styles.chipText}>
          {active ? gripShortLabel(value, lang) : t('variant.grip')}
        </AppText>
        <Ionicons name="chevron-down" size={12} color={active ? colors.primary : colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="heading" style={styles.sheetTitle}>
              {t('variant.grip')}
            </AppText>
            <View style={styles.chipRow}>
              <SelectChip label={t('variant.default')} active={!active} onPress={() => { onChange(null); setOpen(false); }} />
              {GRIP_KEYS.map((k) => (
                <SelectChip key={k} label={gripLabel(k, lang)} active={value === k} onPress={() => { onChange(k); setOpen(false); }} />
              ))}
            </View>
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
    flexShrink: 1,
  },
  chipText: { flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%' },
  sheetTitle: { marginBottom: spacing.md },
  list: { maxHeight: 460 },
  rowLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  // 머신 브랜드 하위 그룹 — 한 레벨 아래(들여쓰기 + 좌측 레일)로 브랜드 태그만 노출. @plm SRS-028
  brandGroup: { marginLeft: spacing.md, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.primaryMuted },
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
