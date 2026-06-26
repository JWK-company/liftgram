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
import { WELLNESS, fromKg, toKg, type WeightUnit } from '../../domain';

type Language = 'ko' | 'en';

export default function ProfileTabScreen({ navigation }: TabScreenProps<'ProfileTab'>) {
  const { user, weightUnit, language, barWeightKg, refresh } = useUser();
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
      Alert.alert('오류', String(e));
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

  function onSignOut() {
    Alert.alert('로그아웃', '로그아웃하시겠어요? 로컬에 저장된 운동 기록은 그대로 유지됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
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
        프로필
      </AppText>

      {/* 신원 카드 */}
      <Card style={styles.identityCard}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Ionicons name={isAuthed ? 'person' : 'person-outline'} size={26} color={colors.textMuted} />
          </View>
          <View style={styles.identityText}>
            <AppText variant="heading" numberOfLines={1}>
              {isAuthed ? user.displayName || user.email : '게스트'}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
              {isAuthed ? user.email : '로그인하지 않은 로컬 사용자'}
            </AppText>
          </View>
        </View>
        <View style={{ marginTop: spacing.lg }}>
          {isAuthed ? (
            <Button title="로그아웃" variant="danger" icon="log-out-outline" onPress={onSignOut} disabled={busy} />
          ) : (
            <Button
              title="로그인 / 가입"
              variant="primary"
              icon="log-in-outline"
              onPress={() => navigation.navigate('Auth')}
            />
          )}
        </View>
      </Card>

      {/* 설정 */}
      <SectionHeader title="설정" />

      <Card style={styles.settingsCard}>
        {/* 단위 */}
        <SettingRow label="단위" caption="무게 표시·입력 단위">
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

        {/* 언어 — 다국어(i18n)는 다음 단계 작업. Phase 0는 한국어 고정이라 토글 비활성. */}
        <SettingRow label="언어" caption="다국어는 준비 중입니다 (현재 한국어)">
          <Segmented<Language>
            options={[
              { value: 'ko', label: '한국어' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={onSetLanguage}
            disabled
          />
        </SettingRow>

        <Divider />

        {/* 바벨 무게 */}
        <View style={styles.stepperRow}>
          <View style={styles.stepperLabel}>
            <AppText variant="body" weight="medium">
              바벨 무게
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              플레이트 계산기 기본 바 무게
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
      </Card>

      {/* 동기화 상태 */}
      <SectionHeader title="동기화" />
      <Card style={styles.syncCard}>
        {/* @phase-1-sync — 기기 간 동기화는 Phase 1 백엔드 연동에서 제공 */}
        <View style={styles.syncRow}>
          <View style={styles.syncIcon}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body" weight="medium">
              오프라인 모드 · 로컬 저장됨
            </AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              기기 간 동기화는 다음 단계(Phase 1)에서 제공됩니다.
            </AppText>
          </View>
        </View>
      </Card>

      {/* 푸터 — 웰니스 고지 */}
      <View style={styles.footer}>
        <AppText variant="caption" color="textFaint">
          {WELLNESS.noMedicalClaimNotice}
        </AppText>
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
          {WELLNESS.safetyNotice}
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
