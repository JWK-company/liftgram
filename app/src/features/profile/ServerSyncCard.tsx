// @plm SRS-006  서버 연결·동기 카드 — 로그인/가입(JWT) → WatermelonDB synchronize (ADR-002).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, TextField } from '../../components';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';
import { serverApi } from '../../sync/serverApi';
import { authErrorKey } from '../../sync/apiError';
import { reconcileAccount } from '../../sync/syncOwner';
import { syncWithServer } from '../../sync/syncEngine';
import { disconnectRealtime } from '../../sync/realtime';
import { registerPushToken, unregisterPushToken } from '../../push/push';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';

type Mode = 'login' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ServerSyncCard() {
  const { t } = useT();
  const { user, refresh } = useUser();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    serverApi.isLoggedIn().then(setLoggedIn).catch(() => setLoggedIn(false));
  }, []);

  async function onConnect() {
    if (busy) return;
    const mail = email.trim();
    if (!EMAIL_RE.test(mail)) {
      setStatus(t('auth.invalidEmail'));
      setError(true);
      return;
    }
    if (!password) {
      setStatus(t('auth.passwordRequired'));
      setError(true);
      return;
    }
    setBusy(true);
    setStatus(null);
    setError(false);
    try {
      if (mode === 'signup') await serverApi.signUp(mail, password);
      else await serverApi.login(mail, password);
      // 계정 경계 — 다른 계정이면 로컬 운동 데이터 초기화(교차오염·유실 방지) + 신원 미러.
      const me = await serverApi.me();
      await reconcileAccount(me.id);
      disconnectRealtime(); // 계정 전환 시 구 소켓 정리 — 새 신원으로 재핸드셰이크.
      if (user) await userRepo.setLocalAuth((await userRepo.getOrCreateLocalUser()).id, { email: mail });
      await refresh();
      setLoggedIn(true);
      setPassword('');
      void registerPushToken(); // 로그인 후 푸시 토큰 등록(네이티브·graceful)
      void syncWithServer().catch(() => {}); // 로그인 직후 자동 동기(백업·복원)
    } catch (e) {
      setStatus(t(authErrorKey(e)));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    if (busy) return;
    setBusy(true);
    setStatus(t('serverSync.syncing'));
    setError(false);
    try {
      await syncWithServer();
      setStatus(t('serverSync.done'));
    } catch (e) {
      setStatus(t(authErrorKey(e)));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    await unregisterPushToken(); // 인증 유효할 때 토큰 제거 먼저
    await serverApi.logout();
    // 로컬 신원도 함께 정리 — 신원카드(isAuthed=!!user.email)가 '로그아웃'을 반영하도록.
    if (user) await userRepo.signOutLocal(user.id);
    await refresh();
    setLoggedIn(false);
    setStatus(null);
    setError(false);
  }

  if (loggedIn === null) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!loggedIn) {
    return (
      <View>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
          {t('serverSync.disconnectedCaption')}
        </AppText>
        <View style={styles.segmented}>
          <Button title={t('auth.login')} size="sm" variant={mode === 'login' ? 'primary' : 'ghost'} fullWidth={false} onPress={() => setMode('login')} />
          <Button title={t('auth.signup')} size="sm" variant={mode === 'signup' ? 'primary' : 'ghost'} fullWidth={false} onPress={() => setMode('signup')} />
        </View>
        <TextField label={t('auth.emailLabel')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        <TextField label={t('auth.passwordLabel')} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <Button title={t('serverSync.connect')} icon="cloud-upload-outline" loading={busy} onPress={onConnect} style={{ marginTop: spacing.sm }} />
        {status ? (
          <AppText variant="caption" style={{ marginTop: spacing.sm, color: error ? colors.danger : colors.textMuted }}>
            {status}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <Ionicons name="cloud-done-outline" size={20} color={colors.primary} />
        <AppText variant="body" weight="medium" style={{ marginLeft: spacing.sm, flex: 1 }}>
          {t('serverSync.connectedCaption')}
        </AppText>
      </View>
      <Button title={t('serverSync.syncNow')} icon="sync-outline" loading={busy} onPress={onSync} style={{ marginTop: spacing.sm }} />
      <Button title={t('serverSync.disconnect')} variant="ghost" size="sm" onPress={onDisconnect} style={{ marginTop: spacing.xs }} />
      {status ? (
        <AppText variant="caption" style={{ marginTop: spacing.sm, color: error ? colors.danger : colors.primary }}>
          {status}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  segmented: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
});
