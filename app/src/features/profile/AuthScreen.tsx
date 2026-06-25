// @plm SRS-006  로그인/가입 스텁 (오프라인-우선, 서버 연동은 Phase 1)
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button, TextField, AppText, Card } from '../../components';
import { colors, spacing, radius, fontWeight } from '../../theme';
import type { RootStackScreenProps } from '../../navigation/types';
import { useUser } from '../../state/userContext';
import { userRepo } from '../../data';

type Mode = 'login' | 'signup';

// 간단한 이메일 형식 검증 (서버 검증 아님 — 형식만 확인).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen({ navigation }: RootStackScreenProps<'Auth'>) {
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
      Alert.alert('오류', '올바른 이메일 형식을 입력해 주세요.');
      return;
    }
    // @phase-1-backend — 비밀번호는 실제로 검증·저장되지 않습니다. 서버 인증은 Phase 1.
    if (!password) {
      Alert.alert('오류', '비밀번호를 입력해 주세요.');
      return;
    }
    if (!user) {
      Alert.alert('오류', '사용자 프로필을 불러오지 못했습니다.');
      return;
    }
    setBusy(true);
    try {
      const name = displayName.trim();
      await userRepo.setLocalAuth(user.id, {
        email: trimmedEmail,
        displayName: name ? name : null,
      });
      await refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', String(e));
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
          {isSignup ? '가입' : '로그인'}
        </AppText>
        <AppText variant="caption" color="textMuted" center style={{ marginTop: spacing.xs }}>
          Repset · 근력 운동 기록
        </AppText>
      </View>

      {/* 모드 토글 (외형용) */}
      <View style={styles.modeToggle}>
        <ModeTab label="로그인" active={!isSignup} onPress={() => setMode('login')} />
        <ModeTab label="가입" active={isSignup} onPress={() => setMode('signup')} />
      </View>

      <Card style={styles.formCard}>
        <TextField
          label="이메일"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="비밀번호"
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSignup ? (
          <TextField
            label="표시 이름 (선택)"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="닉네임"
            autoCapitalize="none"
          />
        ) : null}

        <Button
          title={isSignup ? '가입하기' : '로그인'}
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
          오프라인에서도 모든 기록이 저장됩니다. 서버 동기화는 곧 제공됩니다.
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
