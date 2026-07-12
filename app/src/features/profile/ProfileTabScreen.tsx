// @plm SRS-006  프로필·설정 (단위/언어/바 무게/오프라인·로그인 스텁)
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  Screen,
  Button,
  NumberStepper,
  TextField,
  AppText,
  Card,
  Divider,
  SectionHeader,
} from '../../components';
import { colors, spacing, radius, fontWeight } from '../../theme';
import type { TabScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';
import {
  fromKg,
  toKg,
  ALL_EQUIPMENT,
  equipmentLabel,
  CUSTOM_VARIANT_KEYS,
  CUSTOM_VARIANT_COUNT,
  machineVariantLabel,
  type WeightUnit,
  type EquipmentType,
} from '../../domain';
import { useT, type TransKey } from '../../i18n';
import { serverApi } from '../../sync/serverApi';
import { canInstall, onInstallAvailable, promptInstall } from '../../push/pwa';
import {
  REST_SOUND_KINDS,
  REST_VOLUME_LEVELS,
  getRestSoundKind,
  getRestVolumeLevel,
  setRestSoundKind,
  setRestVolumeLevel,
  previewRestSound,
  type RestSoundKind,
  type RestVolumeLevel,
} from '../../utils/sound';
import { ServerSyncCard } from './ServerSyncCard';

type Language = 'ko' | 'en';

const REST_SOUND_LABEL: Record<RestSoundKind, TransKey> = {
  ding: 'restSound.ding',
  chime: 'restSound.chime',
  triad: 'restSound.triad',
  buzz: 'restSound.buzz',
};
const REST_VOLUME_LABEL: Record<RestVolumeLevel, TransKey> = {
  mid: 'restVolume.mid',
  loud: 'restVolume.loud',
  max: 'restVolume.max',
};

export default function ProfileTabScreen({ navigation }: TabScreenProps<'ProfileTab'>) {
  const { t, lang } = useT();
  const { user, weightUnit, language, barWeightKg, availableEquipment, machineVariantLabels, refresh } = useUser();
  const [busy, setBusy] = useState(false);
  const [customLabels, setCustomLabels] = useState<string[]>(() => {
    const a = machineVariantLabels.slice(0, CUSTOM_VARIANT_COUNT);
    while (a.length < CUSTOM_VARIANT_COUNT) a.push('');
    return a;
  });
  const [isModerator, setIsModerator] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [installable, setInstallable] = useState(canInstall());
  const [restSound, setRestSoundState] = useState<RestSoundKind>(getRestSoundKind());
  const [restVol, setRestVolState] = useState<RestVolumeLevel>(getRestVolumeLevel());

  // 저장된 알림음 설정이 부팅 직후 비동기 로드될 수 있어 마운트 후 1회 동기화.
  React.useEffect(() => {
    setRestSoundState(getRestSoundKind());
    setRestVolState(getRestVolumeLevel());
  }, []);

  function onPickRestSound(k: RestSoundKind) {
    setRestSoundState(k);
    setRestSoundKind(k);
    previewRestSound(k); // 선택 즉시 미리듣기
  }
  function onPickRestVolume(v: RestVolumeLevel) {
    setRestVolState(v);
    setRestVolumeLevel(v);
    previewRestSound(restSound); // 바뀐 음량으로 현재 프리셋 미리듣기
  }

  React.useEffect(() => {
    setInstallable(canInstall());
    return onInstallAvailable(() => setInstallable(canInstall()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      serverApi
        .isLoggedIn()
        .then((logged) => {
          setLoggedIn(logged);
          return logged ? serverApi.me() : null;
        })
        .then((me) => setIsModerator(!!me && (me.role === 'moderator' || me.role === 'admin')))
        .catch(() => {
          setLoggedIn(false);
          setIsModerator(false);
        });
    }, []),
  );

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

  function onEditCustomLabel(idx: number, text: string) {
    setCustomLabels((prev) => {
      const n = [...prev];
      n[idx] = text;
      return n;
    });
  }
  function onSaveCustomLabels() {
    void patch(() => userRepo.updateUserSettings(userId, { machineVariantLabels: customLabels.map((s) => s.trim()) }));
  }

  const weightStep = weightUnit === 'kg' ? 2.5 : 5;
  const barDisplay = Number(fromKg(barWeightKg, weightUnit).toFixed(1));

  return (
    <Screen scroll>
      <AppText variant="display" style={{ marginBottom: spacing.lg }}>
        {t('profile.title')}
      </AppText>

      {/* 계정 — 로그인/가입·프로필(아바타·표시이름)·동기·로그아웃을 한 곳에(세션 상태로 일관 표시) */}
      <SectionHeader title={t('profile.account')} />
      <ServerSyncCard />

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

        <Divider />

        {/* 커스텀 머신 기구 이름 — 같은 브랜드·다른 기구 구분(전역 공용 3슬롯). */}
        <View style={styles.equipBlock}>
          <AppText variant="body" weight="medium">
            {t('machineVariant.settingsTitle')}
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2, marginBottom: spacing.sm }}>
            {t('machineVariant.settingsHint')}
          </AppText>
          {CUSTOM_VARIANT_KEYS.map((k, i) => (
            <TextField
              key={k}
              value={customLabels[i] ?? ''}
              onChangeText={(txt) => onEditCustomLabel(i, txt)}
              onBlur={onSaveCustomLabels}
              placeholder={machineVariantLabel(k, lang)}
              containerStyle={{ marginBottom: spacing.sm }}
            />
          ))}
        </View>

        <Divider />

        {/* 휴식 종료 알림음 (SRS-003) — 프리셋 선택(탭=미리듣기) + 음량. 기기-로컬 저장. */}
        <View style={styles.equipBlock}>
          <AppText variant="body" weight="medium">
            {t('profile.restSound')}
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {t('profile.restSoundCaption')}
          </AppText>
          <View style={styles.equipChips}>
            {REST_SOUND_KINDS.map((k) => {
              const active = restSound === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => onPickRestSound(k)}
                  style={({ pressed }) => [styles.equipChip, active && styles.equipChipActive, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <AppText
                    variant="caption"
                    style={{ color: active ? colors.onPrimary : colors.textMuted, fontWeight: active ? fontWeight.bold : fontWeight.medium }}
                  >
                    {t(REST_SOUND_LABEL[k])}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.settingRow, { paddingTop: spacing.md }]}>
            <AppText variant="body" weight="medium">
              {t('profile.restVolume')}
            </AppText>
            <Segmented<RestVolumeLevel>
              options={REST_VOLUME_LEVELS.map((v) => ({ value: v, label: t(REST_VOLUME_LABEL[v]) }))}
              value={restVol}
              onChange={onPickRestVolume}
            />
          </View>
        </View>
      </Card>

      {/* 저장한 게시물 · 차단 목록 관리 (로그인 시) */}
      {loggedIn ? (
        <Button
          title={t('bookmark.entry')}
          icon="bookmark-outline"
          variant="secondary"
          onPress={() => navigation.navigate('Bookmarks')}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
      {loggedIn ? (
        <Button
          title={t('block.entry')}
          icon="ban-outline"
          variant="secondary"
          onPress={() => navigation.navigate('BlockedUsers')}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {/* 모더레이션 큐 (모더레이터/관리자만) */}
      {isModerator ? (
        <Button
          title={t('moderation.entry')}
          icon="shield-checkmark-outline"
          variant="secondary"
          onPress={() => navigation.navigate('ModerationQueue')}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {/* PWA 설치 (웹·설치 가능 시) */}
      {installable ? (
        <Button
          title={t('pwa.install')}
          icon="download-outline"
          variant="secondary"
          onPress={() => void promptInstall()}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

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
