// @plm SRS-006  프로필·설정 (단위/언어/바 무게/오프라인·로그인 스텁)
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Screen,
  Button,
  NumberStepper,
  AppText,
  Card,
  Divider,
  SectionHeader,
} from '../../components';
import { colors, spacing, radius, fontWeight } from '../../theme';
import type { TabScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';
import { fromKg, toKg, ALL_EQUIPMENT, equipmentLabel, type WeightUnit, type EquipmentType } from '../../domain';
import { useT } from '../../i18n';
import { ServerSyncCard } from './ServerSyncCard';

type Language = 'ko' | 'en';

export default function ProfileTabScreen({ navigation }: TabScreenProps<'ProfileTab'>) {
  const { t, lang } = useT();
  const { user, weightUnit, language, barWeightKg, availableEquipment, refresh } = useUser();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const userId = user.id;

  async function patch(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  }

  function onSetUnit(next: WeightUnit) {
    if (next === weightUnit) return;
    void patch(() => userRepo.updateUserSettings(userId, { weightUnit: next }));
  }

  function onSetLanguage(next: Language) {
    if (next === language) return;
    void patch(() => userRepo.updateUserSettings(userId, { preferredLanguage: next }));
  }

  function onSetBarWeight(displayValue: number) {
    void patch(() => userRepo.updateUserSettings(userId, { barWeightKg: toKg(displayValue, weightUnit) }));
  }

  function onToggleEquipment(eq: EquipmentType) {
    const next = availableEquipment.includes(eq)
      ? availableEquipment.filter((e) => e !== eq)
      : [...availableEquipment, eq];
    void patch(() => userRepo.updateUserSettings(userId, { availableEquipment: next }));
  }

  function onSignOut() {
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: () => void patch(() => userRepo.signOutLocal(userId)),
      },
    ]);
  }

  const weightStep = weightUnit === 'kg' ? 2.5 : 5;
  const barDisplay = Number(fromKg(barWeightKg, weightUnit).toFixed(1));
  const isAuthed = !!user.email;

  return (
    <Screen scroll>
      <AppText variant="display" style={{ marginBottom: spacing.lg }}>
        {t('profile.title')}
      </AppText>

      {/* 신원 카드 */}
      <Card style={styles.identityCard}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Ionicons name={isAuthed ? 'person' : 'person-outline'} size={26} color={colors.textMuted} />
          </View>
          <View style={styles.identityText}>
            <AppText variant="heading" numberOfLines={1}>
              {isAuthed ? user.displayName || user.email : t('profile.guest')}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
              {isAuthed ? user.email : t('profile.guestCaption')}
            </AppText>
          </View>
        </View>
        <View style={{ marginTop: spacing.lg }}>
          {isAuthed ? (
            <Button title={t('profile.signOut')} variant="danger" icon="log-out-outline" onPress={onSignOut} disabled={busy} />
          ) : (
            <Button
              title={t('profile.loginOrSignup')}
              variant="primary"
              icon="log-in-outline"
              onPress={() => navigation.navigate('Auth')}
            />
          )}
        </View>
      </Card>

      {/* 설정 */}
      <SectionHeader title={t('profile.settings')} />

      <Card style={styles.settingsCard}>
        {/* 단위 */}
        <SettingRow label={t('profile.unit')} caption={t('profile.unitCaption')}>
          <Segmented<WeightUnit>
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={weightUnit}
            onChange={onSetUnit}
            disabled={busy}
          />
        </SettingRow>

        <Divider />

        {/* 언어 — i18n 토글. 선택 언어가 userContext SSOT에 반영되어 즉시 리렌더. */}
        <SettingRow label={t('profile.language')} caption={t('profile.languageCaption')}>
          <Segmented<Language>
            options={[
              { value: 'ko', label: t('profile.languageKorean') },
              { value: 'en', label: t('profile.languageEnglish') },
            ]}
            value={language}
            onChange={onSetLanguage}
          />
        </SettingRow>

        <Divider />

        {/* 바벨 무게 */}
        <View style={styles.stepperRow}>
          <View style={styles.stepperLabel}>
            <AppText variant="body" weight="medium">
              {t('profile.barWeight')}
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {t('profile.barWeightCaption')}
            </AppText>
          </View>
          <NumberStepper
            value={barDisplay}
            onChange={onSetBarWeight}
            step={weightStep}
            min={0}
            suffix={weightUnit}
          />
        </View>

        <Divider />

        {/* 가용 기구 (SRS-013) — 선택 시 대체운동을 보유 기구로 필터. 미선택=전체. */}
        <View style={styles.equipBlock}>
          <AppText variant="body" weight="medium">
            {t('profile.availableEquipment')}
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t('profile.availableEquipmentCaption')}
          </AppText>
          <View style={styles.equipChips}>
            {ALL_EQUIPMENT.map((eq) => {
              const active = availableEquipment.includes(eq);
              return (
                <Pressable
                  key={eq}
                  onPress={() => !busy && onToggleEquipment(eq)}
                  style={({ pressed }) => [
                    styles.equipChip,
                    active && styles.equipChipActive,
                    { opacity: busy ? 0.6 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{
                      color: active ? colors.onPrimary : colors.textMuted,
                      fontWeight: active ? fontWeight.bold : fontWeight.medium,
                    }}
                  >
                    {equipmentLabel(eq, lang)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      {/* 동기화 상태 */}
      <SectionHeader title={t('profile.sync')} />
      <Card style={styles.syncCard}>
        {/* @plm SRS-006 — 실제 서버 동기(JWT + WatermelonDB synchronize) */}
        <ServerSyncCard />
      </Card>

      {/* 푸터 — 웰니스 고지 */}
      <View style={styles.footer}>
        <AppText variant="caption" color="textFaint">
          {t('wellness.noMedicalClaimNotice')}
        </AppText>
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
          {t('wellness.safetyNotice')}
        </AppText>
      </View>
    </Screen>
  );
}

// ── 설정 행 (라벨 + 우측 컨트롤) ─────────────────────────────────────
function SettingRow({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabel}>
        <AppText variant="body" weight="medium">
          {label}
        </AppText>
        {caption ? (
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {caption}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// ── 세그먼트 토글 (두 개 이상 옵션 칩) ──────────────────────────────
function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <AppText
              variant="caption"
              style={{
                color: active ? colors.onPrimary : colors.textMuted,
                fontWeight: active ? fontWeight.bold : fontWeight.medium,
              }}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  identityCard: { marginBottom: spacing.xl },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1 },
  settingsCard: { marginBottom: spacing.xl, paddingVertical: spacing.md },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  settingLabel: { flex: 1 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  stepperLabel: { flex: 1 },
  equipBlock: { paddingVertical: spacing.sm },
  equipChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  equipChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  equipChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  segmentActive: { backgroundColor: colors.primary },
  syncCard: { marginBottom: spacing.xl },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  syncIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { marginTop: spacing.sm, marginBottom: spacing.xl },
});
