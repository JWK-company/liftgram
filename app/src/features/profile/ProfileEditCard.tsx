// @plm SRS-008  내 프로필 편집 — 표시이름·아바타 (로그인 시만 섹션 표시).
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Avatar, Button, Card, SectionHeader, TextField } from '../../components';
import { colors, spacing } from '../../theme';
import { useT } from '../../i18n';
import { serverApi, type PublicUser } from '../../sync/serverApi';

export function ProfileEditCard() {
  const { t } = useT();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!(await serverApi.isLoggedIn())) {
        setMe(null);
        return;
      }
      const u = await serverApi.me();
      setMe(u);
      setName(u.displayName ?? '');
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!me) return null;

  async function pickAvatar() {
    if (saving) return;
    setSaving(true); // 피커 여는 즉시 잠금 — 저장 버튼 더블탭 방지
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
      setSaving(false);
    }
  }

  async function saveName() {
    if (saving) return;
    setSaving(true);
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
      setSaving(false);
    }
  }

  const dirty = name.trim() !== (me.displayName ?? '');

  return (
    <>
      <SectionHeader title={t('profileEdit.title')} />
      <Card style={styles.card}>
        <View style={styles.avatarRow}>
          <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
            <Avatar name={me.displayName} url={me.avatarUrl} size={72} />
            <View style={styles.camBadge}>
              <Ionicons name="camera" size={13} color={colors.onPrimary} />
            </View>
          </Pressable>
          <AppText variant="caption" color="textMuted" style={{ marginLeft: spacing.md, flex: 1 }}>
            {t('profileEdit.changePhoto')}
          </AppText>
        </View>
        <TextField
          label={t('profileEdit.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('discover.unnamed')}
          maxLength={40}
        />
        <Button title={t('profileEdit.save')} loading={saving} disabled={!dirty || saving} onPress={saveName} />
        {status ? (
          <AppText variant="caption" style={{ marginTop: spacing.sm, color: error ? colors.danger : colors.primary }}>
            {status}
          </AppText>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xl },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatarWrap: { position: 'relative' },
  camBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
