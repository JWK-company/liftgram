// @plm SRS-006  서버 연결·동기 카드 — 로그인/가입(JWT) → WatermelonDB synchronize (ADR-002).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, TextField } from '../../components';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';
import { serverApi } from '../../sync/serverApi';
import { syncWithServer } from '../../sync/syncEngine';

type Mode = 'login' | 'signup';

export function ServerSyncCard() {
  const { t } = useT();
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
    setBusy(true);
    setStatus(null);
    setError(false);
    try {
      if (mode === 'signup') await serverApi.signUp(email.trim(), password);
      else await serverApi.login(email.trim(), password);
      setLoggedIn(true);
      setPassword('');
    } catch (e) {
      setStatus(String(e));
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
      setStatus(String(e));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    await serverApi.logout();
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
