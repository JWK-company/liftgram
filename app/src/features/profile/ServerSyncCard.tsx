// @plm SRS-006  계정 허브 — 로그인/가입·동기·프로필(아바타·표시이름)·로그아웃을 한 곳에.
// 세션(토큰) 하나를 SSOT로 삼아 로그인/로그아웃 상태를 표시 — 로컬 이메일 기반 신원카드와의 모순 제거.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AppText, Avatar, Button, Card, Tag, TextField } from '../../components';
import { colors, spacing, radius } from '../../theme';
import { useT, type TransKey } from '../../i18n';
import { serverApi, type PublicUser } from '../../sync/serverApi';
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
  const [me, setMe] = useState<PublicUser | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      // access 토큰이 없어도 refresh로 세션 복구 시도(만료·부분 소실 대비) — 그래야 표시가 실제 세션과 일치.
      let ok = await serverApi.isLoggedIn();
      if (!ok) ok = await serverApi.refreshSession().catch(() => false);
      setLoggedIn(ok);
      if (ok) {
        const u = await serverApi.me();
        setMe(u);
        setName(u.displayName ?? '');
      } else {
        setMe(null);
      }
    } catch {
      setLoggedIn(false);
      setMe(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
    }, [loadMe]),
  );

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
      const meRec = await serverApi.me();
      await reconcileAccount(meRec.id); // 계정 경계 — 다른 계정이면 로컬 초기화(교차오염 방지)
      disconnectRealtime();
      if (user) await userRepo.setLocalAuth((await userRepo.getOrCreateLocalUser()).id, { email: mail });
      await refresh();
      setMe(meRec);
      setName(meRec.displayName ?? '');
      setLoggedIn(true);
      setPassword('');
      void registerPushToken();
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

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await unregisterPushToken();
      await serverApi.logout();
      if (user) await userRepo.signOutLocal(user.id);
      await refresh();
    } catch {
      /* graceful */
    } finally {
      setMe(null);
      setLoggedIn(false);
      setStatus(null);
      setError(false);
      setBusy(false);
    }
  }

  async function pickAvatar() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    setError(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      const media = await serverApi.uploadImage({ uri: a.uri, fileName: a.fileName, mimeType: a.mimeType });
      const u = await serverApi.updateProfile({ avatarUrl: media.url });
      setMe(u);
      setStatus(t('profileEdit.saved'));
    } catch {
      setStatus(t('profileEdit.saveFailed'));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (busy || !me) return;
    if (name.trim() === (me.displayName ?? '')) return;
    setBusy(true);
    setStatus(null);
    setError(false);
    try {
      const u = await serverApi.updateProfile({ displayName: name.trim() });
      setMe(u);
      setStatus(t('profileEdit.saved'));
    } catch {
      setStatus(t('profileEdit.saveFailed'));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (loggedIn === null) {
    return (
      <Card style={styles.card}>
        <View style={styles.centerRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Card>
    );
  }

  // ── 로그아웃 상태: 로그인/가입 폼(유일한 로그인 입구) ──────────────────
  if (!loggedIn) {
    return (
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.textMuted} />
          <AppText variant="heading" style={{ marginLeft: spacing.sm }}>
            {t('serverSync.title')}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
          {t('serverSync.disconnectedCaption')}
        </AppText>
        <View style={styles.segmented}>
          <Button title={t('auth.login')} size="sm" variant={mode === 'login' ? 'primary' : 'ghost'} fullWidth={false} onPress={() => setMode('login')} />
          <Button title={t('auth.signup')} size="sm" variant={mode === 'signup' ? 'primary' : 'ghost'} fullWidth={false} onPress={() => setMode('signup')} />
        </View>
        <TextField label={t('auth.emailLabel')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
        <TextField label={t('auth.passwordLabel')} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <Button title={mode === 'signup' ? t('auth.signup') : t('auth.login')} icon="log-in-outline" loading={busy} onPress={onConnect} style={{ marginTop: spacing.sm }} />
        {status ? (
          <AppText variant="caption" style={{ marginTop: spacing.sm, color: error ? colors.danger : colors.textMuted }}>
            {status}
          </AppText>
        ) : null}
      </Card>
    );
  }

  // ── 로그인 상태: 신원 + 프로필 편집 + 동기 + 로그아웃(한 곳에) ──────────
  const role = me?.role;
  const dirty = !!me && name.trim() !== (me.displayName ?? '');
  return (
    <Card style={styles.card}>
      <View style={styles.identityRow}>
        <Pressable onPress={pickAvatar} style={styles.avatarWrap} disabled={busy}>
          <Avatar name={me?.displayName ?? user?.email} url={me?.avatarUrl} size={64} />
          <View style={styles.camBadge}>
            <Ionicons name="camera" size={12} color={colors.onPrimary} />
          </View>
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={styles.nameRow}>
            <AppText variant="heading" numberOfLines={1}>
              {me?.displayName || user?.email || t('profile.guest')}
            </AppText>
            {role && role !== 'user' ? <Tag label={t(('role.' + role) as TransKey)} tone="primary" /> : null}
          </View>
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {user?.email ?? ''}
          </AppText>
          <View style={styles.connrow}>
            <Ionicons name="cloud-done-outline" size={13} color={colors.primary} />
            <AppText variant="label" color="primary" style={{ marginLeft: 4 }}>
              {t('serverSync.connectedCaption')}
            </AppText>
          </View>
        </View>
      </View>

      <TextField
        label={t('profileEdit.nameLabel')}
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        placeholder={t('discover.unnamed')}
        maxLength={40}
        containerStyle={{ marginTop: spacing.md }}
      />
      {dirty ? (
        <Button title={t('profileEdit.save')} size="sm" loading={busy} onPress={saveName} style={{ marginTop: spacing.xs }} />
      ) : null}

      <Button title={t('serverSync.syncNow')} icon="sync-outline" variant="secondary" loading={busy} onPress={onSync} style={{ marginTop: spacing.md }} />
      <Button title={t('profile.signOut')} icon="log-out-outline" variant="danger" onPress={onLogout} disabled={busy} style={{ marginTop: spacing.sm }} />
      {status ? (
        <AppText variant="caption" style={{ marginTop: spacing.sm, color: error ? colors.danger : colors.primary }}>
          {status}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xl },
  centerRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { position: 'relative' },
  camBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  connrow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  segmented: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
});
