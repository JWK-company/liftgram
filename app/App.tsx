import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './src/theme';
import { RootNavigator } from './src/navigation/RootNavigator';
import { UserProvider } from './src/state/userContext';
import { SessionProvider } from './src/state/sessionContext';
import { seedExercisesIfNeeded } from './src/data/seedRunner';
import { AppText, AlertHost, ConfigBanner } from './src/components';
import { OnboardingOverlay } from './src/features/onboarding/OnboardingOverlay';
import { installWebAlert } from './src/utils/alert';
import { LanguageSync } from './src/i18n/LanguageSync';
import { t } from './src/i18n';
import { serverApi, warmupServer } from './src/sync/serverApi';
import { registerPushToken } from './src/push/push';
import { initPwa } from './src/push/pwa';

// 웹에서 RN Alert.alert(no-op)를 테마 모달 호스트로 라우팅(확인/취소 콜백 정상화).
installWebAlert();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await seedExercisesIfNeeded();
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // PWA(웹) 부트스트랩 + 이미 로그인된 상태면 푸시 토큰 갱신(네이티브·graceful).
  useEffect(() => {
    initPwa();
    // 무료티어 콜드스타트 대비 — 슬립 상태의 서버를 부팅 시 미리 깨운다(비차단·graceful).
    void warmupServer();
    serverApi
      .isLoggedIn()
      .then((yes) => {
        if (yes) void registerPushToken();
      })
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <UserProvider>
        <LanguageSync />
        {/* 배포 오설정(SERVER_URL=localhost) 경고 배너 — 정상 배포 시 null(레이아웃 영향 0). */}
        <ConfigBanner />
        <View style={{ flex: 1 }}>
          <SessionProvider>
            <NavigationContainer theme={navTheme}>
              {error ? (
                <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <AppText variant="heading" center>
                    {t('app.initError')}
                  </AppText>
                  <AppText variant="caption" color="textMuted" center style={{ marginTop: 8 }}>
                    {error}
                  </AppText>
                </View>
              ) : (
                <RootNavigator />
              )}
            </NavigationContainer>
          </SessionProvider>
        </View>
        {/* AlertHost·OnboardingOverlay는 useT()→useUser()에 의존 → 반드시 UserProvider 안에 마운트. */}
        <AlertHost />
        <OnboardingOverlay />
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
