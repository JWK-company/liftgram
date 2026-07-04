// @plm SRS-006  로그인/가입 — 서버 인증(JWT)으로 소셜 잠금 해제 + 로컬 프로필 미러.
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, TextField, AppText, Card } from '../../components';
import { colors, spacing, radius, fontWeight } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';
import { useT } from '../../i18n';
import { serverApi } from '../../sync/serverApi';
import { authErrorKey } from '../../sync/apiError';
import { registerPushToken } from '../../push/push';

type Mode = 'login' | 'signup';

// 간단한 이메일 형식 검증 (서버 검증 아님 — 형식만 확인).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen({ navigation }: RootStackScreenProps<'Auth'>) {
  const { t } = useT();
  const { user, refresh } = useUser();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function onSubmit() {
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert(t('common.error'), t('auth.invalidEmail'));
      return;
    }
    if (!password) {
      Alert.alert(t('common.error'), t('auth.passwordRequired'));
      return;
    }
    if (!user) {
      Alert.alert(t('common.error'), t('auth.profileLoadFailed'));
      return;
    }
    setBusy(true);
    try {
      const name = displayName.trim();
      // 실제 서버 인증(JWT 저장) — 이래야 피드·DM·발견 등 소셜 기능이 잠금 해제된다.
      if (isSignup) await serverApi.signUp(trimmedEmail, password, name ? name : undefined);
      else await serverApi.login(trimmedEmail, password);
      // 로컬 프로필에 신원 미러(오프라인 표시용).
      await userRepo.setLocalAuth(user.id, { email: trimmedEmail, displayName: name ? name : null });
      void registerPushToken(); // 로그인 후 푸시 토큰 등록(네이티브·graceful)
      await refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="barbell" size={28} color={colors.primary} />
        </View>
        <AppText variant="display" center style={{ marginTop: spacing.md }}>
          {isSignup ? t('auth.signup') : t('auth.login')}
        </AppText>
        <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
          {t('auth.tagline')}
        </AppText>
      </View>

      {/* 모드 토글 (외형용) */}
      <View style={styles.modeToggle}>
        <ModeTab label={t('auth.login')} active={!isSignup} onPress={() => setMode('login')} />
        <ModeTab label={t('auth.signup')} active={isSignup} onPress={() => setMode('signup')} />
      </View>

      <Card style={styles.formCard}>
        <TextField
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label={t('auth.passwordLabel')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordLabel')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSignup ? (
          <TextField
            label={t('auth.displayNameLabel')}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('auth.displayNamePlaceholder')}
            autoCapitalize="none"
          />
        ) : null}

        <Button
          title={isSignup ? t('auth.signupButton') : t('auth.login')}
          icon="arrow-forward"
          onPress={onSubmit}
          loading={busy}
          disabled={busy}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted" style={{ flex: 1, marginLeft: spacing.sm }}>
          {t('auth.offlineNote')}
        </AppText>
      </View>
    </Screen>
  );
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.modeTab, active && styles.modeTabActive, { opacity: pressed ? 0.8 : 1 }]}
    >
      <AppText
        variant="caption"
        style={{
          color: active ? colors.onPrimary : colors.textMuted,
          fontWeight: active ? fontWeight.bold : fontWeight.medium,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
    marginBottom: spacing.lg,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: { backgroundColor: colors.primary },
  formCard: { marginBottom: spacing.lg },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
